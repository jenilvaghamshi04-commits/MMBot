export function depth(orders,range=2){
 const buys=orders.filter(o=>o.side==='buy'),sells=orders.filter(o=>o.side==='sell');
 const bid=buys.length?Math.max(...buys.map(o=>o.price)):null,ask=sells.length?Math.min(...sells.map(o=>o.price)):null;
 const buy=ask===null?0:buys.filter(o=>o.price>=ask*(1-range/100)-1e-15&&o.price<ask).reduce((v,o)=>v+o.price*o.amount,0);
 const sell=bid===null?0:sells.filter(o=>o.price<=bid*(1+range/100)+1e-15&&o.price>bid).reduce((v,o)=>v+o.price*o.amount,0);
 return {bid,ask,buy,sell};
}
export function validateConfig(s){
 for(const key of ['tick','buyDepth','sellDepth','min','max','skip','interval'])if(!Number.isFinite(s[key])||s[key]<=0)throw Error(`${key} must be positive`);
 for(const key of ['buyDivisions','sellDivisions'])if(s[key]!==undefined&&(!Number.isInteger(s[key])||s[key]<1||s[key]>100))throw Error('Depth divisions must be a whole number from 1 to 100');
 if(s.depthTick!==undefined&&(!Number.isFinite(s.depthTick)||s.depthTick<=0))throw Error('Depth tick size must be positive');
 if(s.min>s.max)throw Error('Minimum order must not exceed maximum');
 if(s.interval<10)throw Error('Refresh must be at least 10 seconds');
 if(s.range!==2)throw Error('Order range must be 2%');
 if(!Number.isInteger(s.gap)||s.gap<1||s.gap>100)throw Error('Use at least one empty tick');
 for(const key of ['buyStart','sellStart'])if(!Number.isFinite(s[key])||s[key]<0)throw Error('Starting prices must be zero or positive');
}
export function validate(s,ref){
 validateConfig(s);
 if(!Number.isFinite(ref)||ref<=0)throw Error('Fresh DEX reference unavailable');
 if(ref/(s.depthTick??s.tick)>1e12)throw Error('Depth tick size is too small');
 if(ref/s.tick>1e12)throw Error('Tick size is too small');
 const round=n=>Number(n.toPrecision(12));
 const ceiling=round(Math.floor(ref/s.tick+1e-7)*s.tick),floor=round(Math.ceil(ref/s.tick-1e-7)*s.tick);
 let buy=s.buyStart||round((Math.floor(ref/s.tick+1e-7)-1)*s.tick);
 let sell=s.sellStart||round((Math.ceil(ref/s.tick-1e-7)+s.gap)*s.tick);
 // DEX is a hard side boundary, not a second independent ±2% anchor.
 if(buy>ceiling+1e-15)throw Error('Buy start cannot be above the DEX price. Set it to 0 for automatic.');
 if(sell<floor-1e-15)throw Error('Sell start cannot be below the DEX price. Set it to 0 for automatic.');
 if(!(buy>0&&buy<sell))throw Error('Buy start must be below sell start');
 if((sell-buy)/s.tick<s.gap+1-1e-7)throw Error('Starting prices must leave the configured empty tick gap');
 for(const p of [buy,sell])if(Math.abs(p/s.tick-Math.round(p/s.tick))>1e-5)throw Error('Starting prices must align with tick size');
 return {buy,sell};
}
export function planLadder(s,orders,ref,random=Math.random){
 const starts=validate(s,ref),all=[...orders],added=[],notes=[],capacity={};
 for(const side of ['buy','sell']){
  const target=side==='buy'?s.buyDepth:s.sellDepth;
  const updated=depth(all);
  const anchor=side==='buy'?(updated.ask??starts.sell):(updated.bid??starts.buy);
  // Count existing liquidity even if the opposite side has not been seeded yet.
  const eligible=o=>o.side===side&&(side==='buy'?o.price>=anchor*.98-1e-15&&o.price<anchor:o.price<=anchor*1.02+1e-15&&o.price>anchor);
  const current=all.filter(eligible).reduce((v,o)=>v+o.price*o.amount,0);
  const lower=side==='buy'?anchor*.98:Math.max(ref,anchor+s.tick*(s.gap+1));
  const upper=side==='sell'?anchor*1.02:Math.min(ref,anchor-s.tick*(s.gap+1));
  const first=side==='buy'?Math.min(starts.buy,upper):Math.max(starts.sell,lower);
  const firstTick=side==='buy'?Math.floor(first/s.tick+1e-7):Math.ceil(first/s.tick-1e-7);
  const candidates=[];
  for(let i=0;i<2000;i++){
   const price=Number(((firstTick+(side==='buy'?-i:i))*s.tick).toPrecision(12));
   if(price<lower-1e-15||price>upper+1e-15||price<=0)break;
   const at=all.filter(o=>Math.abs(o.price-price)<s.tick*.001);
   if(at.some(o=>o.side!==side||['Bot','Depth'].includes(o.source))||at.reduce((v,o)=>v+o.price*o.amount,0)>=s.skip-1e-8)continue;
   candidates.push(price);
  }
  const deficit=Math.max(0,target-current),slots=candidates.length;
  capacity[side]={current,target,slots,lower,upper,maximum:current+slots*s.max,shortfall:Math.max(0,target-current-slots*s.max)};
  // Select a feasible count first, then size each order so its remaining peers
  // can still finish the target without going below min or above max.
  const minimumCount=Math.ceil((deficit-1e-8)/s.max),maximumCount=Math.floor((deficit+1e-8)/s.min);
  const exact=deficit>1e-8&&minimumCount<=slots&&minimumCount<=maximumCount;
  const count=exact?minimumCount:Math.min(slots,maximumCount);
  let remaining=exact?deficit:Math.min(deficit,count*s.max),placed=0;
  for(let i=0;i<count;i++){
   const left=count-i-1;
   const low=Math.max(s.min,remaining-left*s.max),high=Math.min(s.max,remaining-left*s.min);
   if(high<low-1e-8)break;
   const value=low+Math.max(0,Math.min(1,random()))*Math.max(0,high-low);
   const order={side,price:candidates[i],amount:value/candidates[i],source:'Bot'};
   added.push(order);all.push(order);remaining-=value;placed+=value;
  }
  if(current+placed+1e-8<target)notes.push(`${side}: ${(current+placed).toFixed(2)} / ${target.toFixed(2)} USDT. ${lower>upper?'No valid range between the opposite order and DEX price. ':''}${slots} available levels × max $${s.max}. Use a smaller tick or higher maximum order value; any remainder below $${s.min} cannot be placed.`);
 }
 return {orders:added,notes,capacity};
}
export function fitTick(s,orders,ref){
 let candidate={...s,buyStart:0,sellStart:0};
 for(let i=0;i<32;i++){
  try{const result=planLadder(candidate,orders,ref,()=>.5);if(['buy','sell'].every(side=>result.capacity[side].shortfall<1e-8)&&result.notes.length===0)return candidate.tick;}catch{}
  candidate.tick=Number((candidate.tick/2).toPrecision(12));
 }
 throw Error('Cannot fit both targets within the order limits. Check existing orders, starts and minimum order size.');
}

// Only strategy-owned paper orders are removed. Manual records remain untouched.
export function reconcileBotOrders(orders,ref,tick=null,settings=null){
 if(!Number.isFinite(ref)||ref<=0)throw Error('Fresh DEX reference unavailable');
 let kept=[...orders],removed=[];
 for(let i=0;i<=orders.length;i++){
  const d=depth(kept);
  const shifted=o=>{const spacing=settings?.depthTick??tick;if(o.source!=='Depth'||!spacing)return false;const anchor=o.side==='buy'?d.ask:d.bid;if(anchor===null)return false;const raw=o.side==='buy'?anchor*.98:anchor*1.02;const count=settings?(o.side==='buy'?settings.buyDivisions:settings.sellDivisions)??1:(o.divisionCount??1);if((o.divisionCount??1)!==count)return true;const index=o.divisionIndex??0;if(index>=count)return true;const edge=((o.side==='buy'?Math.ceil(raw/spacing-1e-7):Math.floor(raw/spacing+1e-7))+(o.side==='buy'?index:-index))*spacing;return Math.abs(o.price-edge)>spacing*.001;};
  const invalid=kept.filter(o=>['Bot','Depth'].includes(o.source)&&(shifted(o)||(o.side==='buy'?(o.price>ref+1e-15||(d.ask!==null&&(o.price<d.ask*.98-1e-15||o.price>=d.ask))):(o.price<ref-1e-15||(d.bid!==null&&(o.price>d.bid*1.02+1e-15||o.price<=d.bid))))));
  if(!invalid.length)break;
  const ids=new Set(invalid);removed.push(...invalid);kept=kept.filter(o=>!ids.has(o));
 }
 return {orders:kept,removed};
}

export function plan(s,orders,ref,random=Math.random){
 const depthTick=s.depthTick??s.tick;
 const ladder=planLadder(s,orders,ref,random),all=orders.map(o=>({...o}));
 all.push(...ladder.orders);
 const added=[...ladder.orders],updates=[],notes=[],boundary={};
 for(const side of ['buy','sell']){
  const d=depth(all),anchor=side==='buy'?d.ask:d.bid,target=side==='buy'?s.buyDepth:s.sellDepth;
  const missing=Math.max(0,target-d[side]);
  if(anchor===null){boundary[side]={price:null,missing,status:'Waiting for an opposite first order'};if(missing>1e-8)notes.push(`${side}: waiting for an opposite first order.`);continue;}
  // Round inward so the depth wall stays inside the opposite-side 2% band.
  const raw=side==='buy'?anchor*.98:anchor*1.02;
  const tick=side==='buy'?Math.ceil(raw/depthTick-1e-7):Math.floor(raw/depthTick+1e-7);
  const price=Number((tick*depthTick).toPrecision(12));
  const valid=price>0&&(side==='buy'?price<=ref+1e-15&&price<=anchor-s.tick*(s.gap+1)+1e-15:price>=ref-1e-15&&price>=anchor+s.tick*(s.gap+1)-1e-15);
  const divisions=(side==='buy'?s.buyDivisions:s.sellDivisions)??1;
  const prices=Array.from({length:divisions},(_,i)=>Number(((tick+(side==='buy'?i:-i))*depthTick).toPrecision(12)));
  const allValid=valid&&prices.every(p=>side==='buy'?p<=ref+1e-15&&p<=anchor-s.tick*(s.gap+1)+1e-15:p>=ref-1e-15&&p>=anchor+s.tick*(s.gap+1)-1e-15);
  const existingWalls=all.filter(o=>o.source==='Depth'&&o.side===side&&o.price>0&&(side==='buy'?o.price>=anchor*.98-1e-15&&o.price<anchor:o.price<=anchor*1.02+1e-15&&o.price>anchor));
  const existingWallValue=existingWalls.reduce((sum,o)=>sum+o.price*o.amount,0);
  const budget=Math.max(0,target-(d[side]-existingWallValue));
  boundary[side]={price,missing,divisions,perOrder:budget/divisions,prices,status:missing<1e-8?'Target reached':allValid?`Split depth into ${divisions} orders`:'Not enough valid ticks for all divisions'};
  if(budget<1e-8)continue;
  if(!allValid){notes.push(`${side}: cannot fit ${divisions} depth divisions inside the 2% band, DEX limit and gap. Use fewer divisions or a smaller depth tick size.`);continue;}
  // Divide the depth budget equally. Small ladder min/max and $5 skip do not apply.
  for(let i=0;i<divisions;i++){
   const p=prices[i],value=budget/divisions;
   const existing=existingWalls.find(o=>Math.abs(o.price-p)<depthTick*.001);
   if(existing){if(Math.abs(existing.price*existing.amount-value)>1e-8){existing.amount=value/p;updates.push({...existing,divisionIndex:i,divisionCount:divisions});}}
   else{const o={side,price:p,amount:value/p,source:'Depth',divisionIndex:i,divisionCount:divisions};all.push(o);added.push(o);}
  }
 }
 return {...ladder,orders:added,updates,notes,boundary};
}
