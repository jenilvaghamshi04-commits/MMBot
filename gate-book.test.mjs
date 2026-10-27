import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSnapshot,GateBookStream} from './public/gate-book.js';
const snapshot={channel:'spot.order_book',event:'update',result:{s:'LF_USDT',lastUpdateId:12,t:1000,bids:[['0.00002','10']],asks:[['0.000021','7']]}};
test('accepts Gate 100-level snapshot and ignores unrelated channels',()=>{assert.deepEqual(parseSnapshot(snapshot),{id:12,exchangeTime:1000,bids:[['0.00002','10']],asks:[['0.000021','7']]});assert.equal(parseSnapshot({channel:'spot.pong'}),null);assert.throws(()=>parseSnapshot({...snapshot,result:{...snapshot.result,asks:[['invalid','2']]}}),/Invalid/);});
test('subscribes at 100ms and uses snapshots without accepting older IDs',()=>{
 class FakeSocket{constructor(url){this.url=url;this.readyState=1;FakeSocket.instance=this;}send(data){this.sent=JSON.parse(data);}close(){this.readyState=3;this.onclose?.();}}
 const books=[],statuses=[];const stream=new GateBookStream({Socket:FakeSocket,onBook:b=>books.push(b),onStatus:s=>statuses.push(s)});stream.start();const ws=FakeSocket.instance;ws.onopen();assert.equal(ws.url,'wss://api.gateio.ws/ws/v4/');assert.deepEqual(ws.sent.payload,['LF_USDT','100','100ms']);ws.onmessage({data:JSON.stringify(snapshot)});ws.onmessage({data:JSON.stringify({...snapshot,result:{...snapshot.result,lastUpdateId:11}})});assert.equal(books.length,1);assert.equal(statuses.at(-1),'live');ws.close();assert.equal(statuses.at(-1),'reconnecting');stream.stop();assert.equal(stream.retry,null);
});
test('rejects broken updates and reconnects instead of displaying invalid book',()=>{
 class FakeSocket{constructor(){this.readyState=1;FakeSocket.instance=this;}send(){}close(){this.onclose?.();}}
 let updates=0;const states=[];const stream=new GateBookStream({Socket:FakeSocket,onBook:()=>updates++,onStatus:s=>states.push(s)});stream.start();const ws=FakeSocket.instance;ws.onopen();ws.onmessage({data:JSON.stringify({...snapshot,result:{...snapshot.result,bids:[['0','10']]}})});assert.equal(updates,0);assert.ok(states.includes('invalid'));assert.equal(states.at(-1),'reconnecting');stream.stop();
});
