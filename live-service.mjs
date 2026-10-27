import {PriceJumpGuard,validateJumpSettings} from './public/risk.js';
import {fetchDexReference} from './dex-feed.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {GateClient,PAIR,exchangeOrder,marketOrders} from './gate.mjs';
import {quoteCycle,validateConfig} from './public/engine.js';
import {LF_POOL,referencePrice} from './public/reference.js';
export class LiveService{
 constructor(client=new GateClient()){this.publicClient=client;this.client=null;this.running=false;this.busy=false;this.starting=false;this.stopping=false;this.timer=null;this.settings=null;this.quoted=null;this.startRef=null;this.metadata=new Map();this.logs=[];this.lastCycle=null;this.lastError=null;this.marketCache=null;this.jumpGuard=new PriceJumpGuard();this.tag=process.env.GATE_BOT_TAG||'lfmm';if(!/^[a-zA-Z0-9_-]{1,10}$/.test(this.tag))throw Error('GATE_BOT_TAG must be 1-10 safe characters.');this.prefix=`t-${this.tag}-`;}
 log(message){this.logs.unshift({time:Date.now(),message});this.logs=this.logs.slice(0,100);}
 enabled(){return process.env.LIVE_TRADING_ENABLED==='true';}
 authorized(token){const expected=process.env.LIVE_ADMIN_TOKEN||'';if(expected.length<16||typeof token!=='string')return false;const a=Buffer.from(token),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
 status(){return {connected:!!this.client,enabled:this.enabled(),operatorConfigured:(process.env.LIVE_ADMIN_TOKEN||'').length>=16,running:this.running,busy:this.busy||this.starting,lastCycle:this.lastCycle,lastError:this.lastError,settings:this.settings,logs:this.logs};}
 async market(){if(this.marketCache&&Date.now()-this.marketCache.fetchedAt<2000)return this.marketCache;this.marketCache=await this.publicClient.market();return this.marketCache;}
 async connect(key,secret){if(this.running||this.busy||this.starting)throw Error('Stop the live bot before changing credentials.');if(!key||!secret||key.length>512||secret.length>512)throw Error('Enter valid API credentials.');const client=new GateClient(key,secret);await client.accounts();this.client=client;this.metadata.clear();this.quoted=null;this.log('Gate spot account connected. Bot OFF.');return this.account();}
 async account(){if(!this.client)throw Error('Connect Gate API credentials first.');const [balances,orders]=await Promise.all([this.client.accounts(),this.client.orders()]);return {balances:balances.filter(b=>['LF','USDT'].includes(b.currency)),orders:orders.map(o=>({id:String(o.id),side:o.side,price:o.price,amount:o.amount,left:o.left,text:o.text,source:String(o.text||'').startsWith(this.prefix)?'Bot':'Manual / external'})),...this.status()};}
 async performance(hours,scope){if(!this.client)throw Error('Connect Gate API credentials first.');if(![1,24,168,720].includes(hours)||!['all','bot'].includes(scope))throw Error('Invalid performance period or scope.');const to=Math.floor(Date.now()/1000),from=to-hours*3600;const rows=await this.client.trades(from,to);return rows.filter(t=>scope==='all'||String(t.text||'').startsWith(this.prefix)).map(t=>({time:Number(t.create_time_ms||Number(t.create_time)*1000),side:t.side,price:t.price,amount:t.amount,fee:t.fee??0,feeCurrency:t.fee_currency||'',gtFee:t.gt_fee||0,pointFee:t.point_fee||0,source:String(t.text||'').startsWith(this.prefix)?'Bot':'Other / untagged',id:String(t.id)})).filter(t=>Number.isFinite(t.time)&&t.time>=from*1000&&t.time<=to*1000+999);}
 async dex(){return referencePrice(await fetchDexReference('ethereum',LF_POOL),'ethereum',LF_POOL).price;}
 async preview(settings){settings={...settings,buyStart:0,sellStart:0};validateConfig(settings);validateJumpSettings(settings);const [market,reference,open]=await Promise.all([this.market(),this.dex(),this.client?this.client.orders():[]]);if(market.pair.trade_status!=='tradable')throw Error('LF/USDT is not currently tradable.');
  for(const tick of [settings.tick,settings.depthTick]){const exchangeTick=10**-Number(market.pair.precision);if(tick<exchangeTick-1e-15||Math.abs(tick/exchangeTick-Math.round(tick/exchangeTick))>1e-6)throw Error(`Gate ticks must be integer multiples of ${exchangeTick}.`);}
  const normalized=marketOrders(market.book,open,this.metadata,this.prefix);
  const result=quoteCycle(settings,normalized,reference,this.quoted,this.startRef??reference);
  const updates=result.updates.filter(o=>{const payload=exchangeOrder(o,market.pair);const existing=open.find(row=>String(row.id)===o.id);return !existing||Number(payload.price)!==Number(existing.price)||Number(payload.amount)!==Number(existing.left??existing.amount);});
  const creates=[...result.orders,...updates].map(o=>({strategy:o,order:exchangeOrder(o,market.pair)}));
  if(creates.length>100)throw Error('More than 100 order writes planned in one cycle. Use fewer levels/divisions or a larger tick.');
  const cancelIds=[...new Set([...result.cancelled.map(o=>o.id),...updates.map(o=>o.id)])].filter(id=>open.some(o=>String(o.id)===id&&String(o.text||'').startsWith(this.prefix)));
  return {market,reference,open,result,creates,cancelIds};}
 async start(settings){
  if(!this.enabled())throw Error('Set LIVE_TRADING_ENABLED=true on Render to enable exchange order submission.');
  if(!this.client)throw Error('Connect Gate API credentials first.');
  if(this.running||this.busy||this.starting)throw Error('Live worker is already active.');
  this.starting=true;this.stopping=false;
  try{const initial=await this.preview(settings);this.jumpGuard.reset();this.jumpGuard.observe(initial.reference,Date.now(),settings);if(this.stopping)throw Error('Live start was cancelled.');this.settings=settings;this.quoted=null;this.startRef=null;this.lastError=null;this.running=true;this.log('Live bot started by operator. Real Gate orders enabled.');}finally{this.starting=false;}
  await this.tick();if(this.running)this.timer=setInterval(()=>this.tick(),Math.max(10,settings.interval)*1000);return this.status();
 }

 async tick(){if(!this.running||this.busy)return;this.busy=true;
  try{const plan=await this.preview(this.settings);if(!this.running||this.stopping)return;
   this.jumpGuard.observe(plan.reference,Date.now(),this.settings);
   for(const id of plan.cancelIds){if(!this.running||this.stopping)return;try{await this.client.cancel(id);}catch(e){if(!/ORDER_NOT_FOUND|ORDER_NOT_OPEN/.test(e.message))throw e;}this.metadata.delete(id);}
   // Read balances after cancellations have released funds; never borrow or use margin.
   const balances=await this.client.accounts();let quote=Number(balances.find(b=>b.currency==='USDT')?.available||0),base=Number(balances.find(b=>b.currency==='LF')?.available||0);
   for(const entry of plan.creates){const price=Number(entry.order.price),amount=Number(entry.order.amount);if(entry.order.side==='buy'){const required=price*amount*1.003;if(quote<required)throw Error('Insufficient available USDT for planned bot orders.');quote-=required;}else{if(base<amount)throw Error('Insufficient available LF for planned bot orders.');base-=amount;}}
   for(const entry of plan.creates){if(!this.running||this.stopping)return;const kind=entry.strategy.source==='Depth'?'D':'N';const text=`${this.prefix}${kind}-${randomBytes(6).toString('hex')}`;const placed=await this.client.create({...entry.order,text});if(placed.status==='open')this.metadata.set(String(placed.id),{...entry.strategy});else throw Error(`Gate did not leave the post-only order open (${placed.finish_as||placed.status}).`);}
   this.quoted=plan.reference;this.startRef??=plan.reference;this.lastCycle=Date.now();this.lastError=null;this.log(`DEX ${plan.reference}: cancelled ${plan.cancelIds.length}, placed ${plan.creates.length} Gate orders.`);for(const message of plan.result.notes)this.log(message);
  }catch(e){this.running=false;clearInterval(this.timer);this.lastError=e.message;this.log(`Stopped: ${e.message}. Existing orders may remain; use Cancel bot orders.`);}finally{this.busy=false;}}
 async stop(cancel=false){this.running=false;this.stopping=true;clearInterval(this.timer);if(this.busy||this.starting){for(let i=0;i<100&&(this.busy||this.starting);i++)await new Promise(r=>setTimeout(r,200));if(this.busy||this.starting)throw Error('Worker is finishing an in-flight request. Retry cancellation shortly.');}
  if(cancel&&this.client){const open=await this.client.orders();for(const o of open.filter(o=>String(o.text||'').startsWith(this.prefix))){try{await this.client.cancel(String(o.id));}catch(e){if(!/ORDER_NOT_FOUND|ORDER_NOT_OPEN/.test(e.message))throw e;}this.metadata.delete(String(o.id));}this.log('Cancelled bot-tagged Gate orders. Manual/external orders untouched.');}
  this.log('Live bot OFF.');return this.status();}
 async manual(order){if(!this.enabled())throw Error('Live order submission is disabled on the server.');if(!this.client)throw Error('Connect Gate API credentials first.');if(this.running||this.busy||this.starting)throw Error('Stop the bot before manual exchange order entry.');const market=await this.market();const payload=exchangeOrder(order,market.pair,{postOnly:false,text:`t-user-${randomBytes(6).toString('hex')}`});return this.client.create(payload);}
 async disconnect(){await this.stop(true);this.client=null;this.metadata.clear();this.quoted=null;this.log('Credentials removed from server memory.');return this.status();}
}
