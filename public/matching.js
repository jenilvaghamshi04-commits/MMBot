// Local paper matching only. Limit orders execute at resting maker prices.
export function matchPaperOrder(openOrders,incoming){
 if(!['buy','sell'].includes(incoming.side)||!Number.isFinite(incoming.price)||incoming.price<=0||!Number.isFinite(incoming.amount)||incoming.amount<=0||!Number.isFinite(incoming.price*incoming.amount))throw Error('Enter a valid positive price and amount.');
 const orders=openOrders.map(o=>({...o})),fills=[];
 let remaining=incoming.amount;
 const eligible=orders.filter(o=>o.side!==incoming.side&&(incoming.side==='buy'?o.price<=incoming.price:o.price>=incoming.price)).sort((a,b)=>(incoming.side==='buy'?a.price-b.price:b.price-a.price)||(a.time||0)-(b.time||0));
 for(const maker of eligible){if(remaining<=0)break;const amount=Math.min(remaining,maker.amount);if(!(amount>0))continue;
  fills.push({side:incoming.side,price:maker.price,amount,value:maker.price*amount,makerId:maker.id,makerSource:maker.source,takerId:incoming.id,takerSource:incoming.source,time:incoming.time});
  const originalMakerAmount=maker.amount;remaining-=amount;maker.amount-=amount;
  if(maker.amount<=originalMakerAmount*Number.EPSILON*8)maker.amount=0;
  if(remaining<=incoming.amount*Number.EPSILON*8)remaining=0;
 }
 const kept=orders.filter(o=>o.amount>0);
 if(remaining>0)kept.push({...incoming,amount:remaining});
 return {orders:kept,fills,remaining,filled:incoming.amount-remaining};
}
export function settleLegacyBook(orders){
 let open=[],fills=[];
 for(const order of [...orders].sort((a,b)=>(a.time||0)-(b.time||0))){const result=matchPaperOrder(open,order);open=result.orders;fills.push(...result.fills);}
 return {orders:open,fills};
}
