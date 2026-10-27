import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PriceJumpGuard,validateJumpSettings} from './public/risk.js';
import {summarizeFills,paperFills} from './public/performance.js';
import {LiveService} from './live-service.mjs';
import {GateClient} from './gate.mjs';
test('guard compares recent observations in either direction, expires old observations and allows disabling',()=>{
 const g=new PriceJumpGuard(),s={jumpPercent:5,jumpWindow:60};g.observe(100,1000,s);g.observe(104,2000,s);assert.throws(()=>g.observe(106,3000,s),/price jump/i);
 g.reset();g.observe(100,1000,s);assert.throws(()=>g.observe(94,3000,s),/price jump/i);
 g.reset();g.observe(100,1000,s);g.observe(200,61001,s);g.observe(300,62000,{...s,jumpPercent:0});
 assert.throws(()=>validateJumpSettings({jumpPercent:-1,jumpWindow:60}));assert.throws(()=>validateJumpSettings({jumpPercent:5,jumpWindow:0}));
});
test('live jump stops before any cancels or submissions and retains existing orders',async()=>{
 const s=new LiveService();s.running=true;s.settings={jumpPercent:5,jumpWindow:60};s.jumpGuard.observe(100,Date.now(),s.settings);let writes=0;s.client={cancel:async()=>writes++,create:async()=>writes++};s.preview=async()=>({reference:106,cancelIds:['owned'],creates:[]});await s.tick();assert.equal(writes,0);assert.equal(s.running,false);assert.match(s.lastError,/price jump/i);
});
test('performance totals buys, sells and fees by currency without mixing units',()=>{
 const x=summarizeFills([{side:'buy',price:2,amount:10,fee:1,feeCurrency:'LF'},{side:'sell',price:3,amount:4,fee:.2,feeCurrency:'USDT'},{side:'sell',price:4,amount:1,fee:.1,feeCurrency:'GT'}]);
 assert.equal(x.volume,36);assert.equal(x.lfChange,4);assert.ok(Math.abs(x.usdtChange+4.2)<1e-10);assert.deepEqual(x.fees,{LF:1,USDT:.2,GT:.1});assert.equal(x.buyCount,1);assert.equal(x.sellCount,2);
});
test('paper bot reports maker side and filters out non-bot fills',()=>{const trades=[{time:50,side:'buy',price:2,amount:3,makerSource:'Bot'},{time:60,side:'sell',price:2,amount:1,makerSource:'Manual'}];assert.equal(paperFills(trades,'bot',0)[0].side,'sell');assert.equal(paperFills(trades,'bot',0).length,1);assert.equal(paperFills(trades,'all',55).length,1);});
test('Gate fill pagination uses private signed request and bot scope filters by tag',async()=>{
 const calls=[];const client=new GateClient('key','secret',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>[{id:'1',create_time:String(Math.floor(Date.now()/1000)),text:'t-lfmm-N-a',side:'buy',price:'2',amount:'1',fee:'0.1',fee_currency:'USDT'},{id:'2',create_time:String(Math.floor(Date.now()/1000)),text:'',side:'sell',price:'2',amount:'1',fee:'0',fee_currency:'LF'}]};});
 const svc=new LiveService();svc.client=client;const fills=await svc.performance(24,'bot');assert.equal(fills.length,1);assert.equal(fills[0].side,'buy');assert.match(calls[0].url,/\/spot\/my_trades/);assert.ok(calls[0].options.headers.SIGN);await assert.rejects(()=>svc.performance(721,'all'),/Invalid/);
});
