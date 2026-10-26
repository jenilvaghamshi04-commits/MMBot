import {test} from 'node:test';
import assert from 'node:assert/strict';
import {depth,planLadder as plan,validate} from './public/engine.js';
const s={tick:.0000001,buyDepth:100,sellDepth:100,min:3,max:4,skip:5,interval:30,range:2,gap:1,buyStart:0,sellStart:0};
const order=(side,price,value,source='Manual')=>({side,price,amount:value/price,source});
test('depth uses opposite best price, excludes orders outside 2%',()=>{const d=depth([order('buy',.00002,10),order('buy',.000019,999),order('sell',.0000201,20),order('sell',.000021,999)]);assert.equal(d.buy,10);assert.equal(d.sell,20);});
test('empty book generates bounded non-crossing orders with one empty tick',()=>{const p=plan(s,[],.00002,()=>.5);assert.ok(p.orders.length);for(const o of p.orders){assert.ok(o.price>=.0000196-1e-15&&o.price<=.0000204+1e-15);assert.ok(o.price*o.amount>=3-1e-8&&o.price*o.amount<=4+1e-8);}const d=depth(p.orders);assert.ok((d.ask-d.bid)/s.tick>=2-1e-7);assert.ok(d.buy<=100&&d.sell<=100);});
test('repeated cycle never duplicates existing bot levels',()=>{const p=plan(s,[],.00002,()=>.5);assert.equal(plan(s,p.orders,.00002).orders.length,0);});
test('skips existing five-dollar manual level',()=>{const existing=[order('buy',.0000199,5),order('sell',.0000201,5)];const p=plan(s,existing,.00002,()=>.5);assert.ok(p.orders.every(o=>!existing.some(e=>e.price===o.price)));});
test('no additions when both depth targets already met',()=>{assert.equal(plan(s,[order('buy',.0000199,100),order('sell',.0000201,100)],.00002).orders.length,0);});
test('rejects contradictory price example and absent reference',()=>{assert.throws(()=>validate({...s,sellStart:.000022,buyStart:.0000219},.00002));assert.throws(()=>plan(s,[],null));});
test('remainder below order minimum is left unfilled',()=>{const p=plan({...s,buyDepth:2,sellDepth:2},[],.00002);assert.equal(p.orders.length,0);assert.equal(p.notes.length,2);});
test('keeps existing manual orders and does not cross them',()=>{const manual=[order('sell',.0000199,5),order('buy',.0000197,5)];const p=plan(s,manual,.00002,()=>.5);for(const o of p.orders){if(o.side==='buy')assert.ok(o.price<=.0000197+1e-15);else assert.ok(o.price>=.0000199-1e-15);}assert.equal(manual.length,2);});

test('exact target reached despite random sizing when enough levels exist',()=>{const config={...s,tick:.000000001};for(const random of [()=>0,()=>.25,()=>.999]){const p=plan(config,[],.00002,random),d=depth(p.orders);assert.ok(Math.abs(d.buy-100)<1e-7);assert.ok(Math.abs(d.sell-100)<1e-7);for(const o of p.orders)assert.ok(o.price*o.amount>=3-1e-8&&o.price*o.amount<=4+1e-8);}});
test('existing buys count toward target when sell side is initially absent',()=>{const config={...s,tick:.000000001};const existing=[order('buy',.000019999,90)];const result=plan(config,existing,.00002,()=>.5);assert.ok(Math.abs(depth([...existing,...result.orders]).buy-100)<1e-7);});
test('capacity explains why coarse tick cannot reach target',()=>{const p=plan(s,[],.00002);assert.ok(p.capacity.buy.maximum<100);assert.ok(p.capacity.sell.maximum<100);assert.equal(p.notes.length,2);});
import {fitTick} from './public/engine.js';
test('fit helper proposes reachable tick without changing original configuration',()=>{const tick=fitTick(s,[],.00002);assert.ok(tick<s.tick);assert.equal(s.tick,.0000001);const p=plan({...s,tick},[],.00002);const d=depth(p.orders);assert.ok(Math.abs(d.buy-100)<1e-7);assert.ok(Math.abs(d.sell-100)<1e-7);});
import {reconcileBotOrders} from './public/engine.js';
test('buy and sell generated prices respect DEX ceiling and floor',()=>{for(const reference of [.00002,.000020053,.000019987]){const config={...s,tick:1e-9,buyDepth:500,sellDepth:500,min:3.1,max:5};const result=plan(config,[],reference,()=>.5);assert.ok(result.orders.some(o=>o.side==='buy'));assert.ok(result.orders.some(o=>o.side==='sell'));for(const o of result.orders)assert.ok(o.side==='buy'?o.price<=reference+1e-15:o.price>=reference-1e-15);const d=depth(result.orders);assert.ok(Math.abs(d.buy-500)<1e-7);assert.ok(Math.abs(d.sell-500)<1e-7);}});
test('depth ranges anchor to opposite first order rather than DEX ±2%',()=>{const config={...s,tick:1e-9,min:3,max:4,buyDepth:100,sellDepth:100};const manual=[order('buy',.00001999,5),order('sell',.00002001,5)];const result=plan(config,manual,.00002);for(const o of result.orders){if(o.side==='buy')assert.ok(o.price>=.00002001*.98-1e-15&&o.price<=.00002);else assert.ok(o.price<=.00001999*1.02+1e-15&&o.price>=.00002);}const d=depth([...manual,...result.orders]);assert.ok(Math.abs(d.buy-100)<1e-7);assert.ok(Math.abs(d.sell-100)<1e-7);});
test('non-overlapping DEX and opposite-anchor band generates no forbidden buys',()=>{const result=plan({...s,tick:1e-9},[order('sell',.000021,5)],.00002);assert.equal(result.orders.filter(o=>o.side==='buy').length,0);assert.match(result.notes.join(' '),/No valid range/);});
test('existing invalid bot orders are removed but manual orders retained',()=>{const manual=order('buy',.0000202,5);const invalidBuy=order('buy',.0000202,5,'Bot'),invalidSell=order('sell',.0000198,5,'Bot');const result=reconcileBotOrders([manual,invalidBuy,invalidSell],.00002);assert.ok(result.orders.includes(manual));assert.ok(result.removed.includes(invalidBuy));assert.ok(result.removed.includes(invalidSell));});
test('repricing the DEX cannot leave new bot buys above it or sells below it',()=>{const config={...s,tick:1e-9};const initial=plan(config,[],.00002).orders;const reference=.00001995;const clean=reconcileBotOrders(initial,reference);const result=plan(config,clean.orders,reference);for(const o of [...clean.orders,...result.orders])assert.ok(o.side==='buy'?o.price<=reference+1e-15:o.price>=reference-1e-15);});

import {plan as planWithDepth} from './public/engine.js';
test('coarse tick fills 500 depth with separate outer-boundary walls',()=>{
 const config={...s,buyDepth:500,sellDepth:500,min:3.1,max:5};
 const result=planWithDepth(config,[],.00002132,()=>.5),d=depth(result.orders);
 assert.ok(Math.abs(d.buy-500)<1e-7);assert.ok(Math.abs(d.sell-500)<1e-7);
 const walls=result.orders.filter(o=>o.source==='Depth');assert.equal(walls.length,2);
 for(const o of walls){assert.ok(o.price*o.amount>5);assert.ok(o.side==='buy'?o.price<=.00002132:o.price>=.00002132);const raw=o.side==='buy'?d.ask*.98:d.bid*1.02;assert.ok(Math.abs(o.price-raw)<config.tick+1e-15);}
});
test('boundary depth ignores occupied $5 level and does not duplicate on next cycle',()=>{
 const config={...s,buyDepth:500,sellDepth:500,min:3.1,max:5};const manual=[order('buy',.0000197,5),order('buy',.0000199,5),order('sell',.0000201,5),order('sell',.0000202,5)];
 const result=planWithDepth(config,manual,.00002,()=>.5);assert.equal(result.orders.filter(o=>o.source==='Depth').length,2);
 const all=[...manual,...result.orders],next=planWithDepth(config,all,.00002);assert.equal(next.orders.length,0);assert.equal(next.updates.length,0);
 const more=planWithDepth({...config,buyDepth:600,sellDepth:600},all,.00002);assert.equal(more.orders.filter(o=>o.source==='Depth').length,0);assert.equal(more.updates.length,2);
});
test('boundary wall never violates DEX cap when no valid range exists',()=>{
 const result=planWithDepth(s,[order('sell',.000021,5)],.00002);for(const o of result.orders)assert.ok(o.side==='buy'?o.price<=.00002:o.price>=.00002);
});
test('five divisions split remaining depth equally at distinct consecutive ticks',()=>{
 const config={...s,tick:1e-8,buyDepth:500,sellDepth:500,buyDivisions:5,sellDivisions:5};
 const result=planWithDepth(config,[],.00002132,()=>.5);
 for(const side of ['buy','sell']){const walls=result.orders.filter(o=>o.source==='Depth'&&o.side===side);assert.equal(walls.length,5);const value=walls[0].price*walls[0].amount;for(let i=0;i<5;i++){assert.ok(Math.abs(walls[i].price*walls[i].amount-value)<1e-7);assert.equal(walls[i].divisionIndex,i);if(i)assert.ok(Math.abs(Math.abs(walls[i].price-walls[i-1].price)-config.tick)<1e-15);assert.ok(side==='buy'?walls[i].price<=.00002132:walls[i].price>=.00002132);}assert.ok(Math.abs(depth(result.orders)[side]-500)<1e-7);}
 const cleaned=reconcileBotOrders(result.orders,.00002132,config.tick,config);assert.equal(cleaned.removed.length,0);
 const next=planWithDepth(config,cleaned.orders,.00002132);assert.equal(next.orders.length,0);assert.equal(next.updates.length,0);
});
test('changed division count removes old depth layout and preserves manual orders',()=>{
 const config={...s,tick:1e-8,buyDepth:500,sellDepth:500,buyDivisions:5,sellDivisions:5};
 const manual=order('buy',.0000212,5);const first=planWithDepth(config,[manual],.00002132).orders;
 const changed={...config,buyDivisions:3,sellDivisions:3};const clean=reconcileBotOrders([manual,...first],.00002132,config.tick,changed);assert.ok(clean.orders.includes(manual));assert.equal(clean.orders.filter(o=>o.source==='Depth').length,0);
 const next=planWithDepth(changed,clean.orders,.00002132);for(const side of ['buy','sell'])assert.equal(next.orders.filter(o=>o.source==='Depth'&&o.side===side).length,3);
});
test('insufficient ticks does not collapse requested divisions or cross DEX',()=>{
 const result=planWithDepth({...s,buyDepth:500,sellDepth:500,buyDivisions:100,sellDivisions:100},[],.00002);assert.equal(result.orders.filter(o=>o.source==='Depth').length,0);assert.match(result.notes.join(' '),/fewer divisions or a smaller tick/);
 assert.throws(()=>validate({...s,buyDivisions:1.5},.00002));assert.throws(()=>validate({...s,sellDivisions:101},.00002));
});
