export function depth(orders,range=2){
 const buys=orders.filter(o=>o.side==='buy'),sells=orders.filter(o=>o.side==='sell');
 const bid=buys.length?Math.max(...buys.map(o=>o.price)):null,ask=sells.length?Math.min(...sells.map(o=>o.price)):null;
 const buy=ask===null?0:buys.filter(o=>o.price>=ask*(1-range/100)-1e-15&&o.price<ask).reduce((v,o)=>v+o.price*o.amount,0);
 const sell=bid===null?0:sells.filter(o=>o.price<=bid*(1+range/100)+1e-15&&o.price>bid).reduce((v,o)=>v+o.price*o.amount,0);
 return {bid,ask,buy,sell};
}
export function validate(s,ref){
 for(const key of ['tick','buyDepth','sellDepth','min','max','skip','interval'])if(!Number.isFinite(s[key])||s[key]<=0)throw Error(`${key} must be positive`);
 if(!Number.isFinite(ref)||ref<=0)throw Error('Reference price unavailable');
 if(s.min>s.max)throw Error('Minimum order must not exceed maximum');
 if(s.interval<10)throw Error('Refresh must be at least 10 seconds');
 if(s.range!==2)throw Error('Order range must be 2%');
 if(!Number.isInteger(s.gap)||s.gap<1||s.gap>100)throw Error('Use at least one empty tick');
 if(ref/s.tick>1e12)throw Error('Tick size is too small');
 const c=Math.round(ref/s.tick),buy=s.buyStart||Number(((c-1)*s.tick).toPrecision(12)),sell=s.sellStart||Number(((c+s.gap)*s.tick).toPrecision(12));
 if(!(buy>0&&buy<sell))throw Error('Buy start must be below sell start');
 if((sell-buy)/s.tick<s.gap+1-1e-7)throw Error('Starting prices must leave the configured empty tick gap');
 for(const p of [buy,sell]){if(p<ref*.98-1e-15||p>ref*1.02+1e-15)throw Error('Starting prices must fall inside reference ±2%');if(Math.abs(p/s.tick-Math.round(p/s.tick))>1e-5)throw Error('Starting prices must align with tick size');}
 return {buy,sell};
}
export function plan(s,orders,ref,random=Math.random){
 const starts=validate(s,ref),all=[...orders],added=[],notes=[];
 let d=depth(all),bid=d.bid??starts.buy,ask=d.ask??starts.sell;
 // Existing manual orders define the opposite-side anchor; planned starts seed an empty side.
 for(const side of ['buy','sell']){
  const target=side==='buy'?s.buyDepth:s.sellDepth;
  let current=depth(all)[side];
  const updated=depth(all);
  const anchor=side==='buy'?(updated.ask??starts.sell):(updated.bid??starts.buy);
  const lower=Math.max(ref*.98,side==='buy'?anchor*.98:anchor+s.tick*(s.gap+1));
  const upper=Math.min(ref*1.02,side==='sell'?anchor*1.02:anchor-s.tick*(s.gap+1));
  const first=side==='buy'?Math.min(starts.buy,upper):Math.max(starts.sell,lower);
  const firstTick=side==='buy'?Math.floor(first/s.tick+1e-7):Math.ceil(first/s.tick-1e-7);
  let visited=0;
  for(let i=0;i<2000&&current+1e-8<target;i++){
   const price=Number(((firstTick+(side==='buy'?-i:i))*s.tick).toPrecision(12));
   if(price<lower-1e-15||price>upper+1e-15||price<=0)break;visited++;
   const at=all.filter(o=>Math.abs(o.price-price)<s.tick*.001);
   // Never cross or duplicate another side; respect manual liquidity and our own existing level.
   if(at.some(o=>o.side!==side||o.source==='Bot')||at.reduce((v,o)=>v+o.price*o.amount,0)>=s.skip-1e-8)continue;
   const remaining=target-current;if(remaining<s.min-1e-8)break;
   const value=Math.min(s.min+random()*(s.max-s.min),remaining);
   const order={side,price,amount:value/price,source:'Bot'};added.push(order);all.push(order);current+=value;
  }
  if(current+1e-8<target)notes.push(`${side}: ${current.toFixed(2)} / ${target.toFixed(2)} USDT; ${visited} levels checked. Target not fully reachable within range, gap and order limits.`);
 }
 return {orders:added,notes};
}
