export function summarizeFills(fills){
 const result={buyCount:0,sellCount:0,buyValue:0,sellValue:0,buyAmount:0,sellAmount:0,fees:{},lfChange:0,usdtChange:0,gtFees:0,pointFees:0};
 for(const f of fills){const amount=Number(f.amount),price=Number(f.price),fee=Number(f.fee??0),side=f.side;
  if(!['buy','sell'].includes(side)||!Number.isFinite(amount)||amount<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(fee))throw Error('Invalid fill data.');
  const gtFee=Number(f.gtFee||0),pointFee=Number(f.pointFee||0);if(!Number.isFinite(gtFee)||!Number.isFinite(pointFee))throw Error('Invalid fee data.');result.gtFees+=gtFee;result.pointFees+=pointFee;
  const value=amount*price,key=side==='buy'?'buy':'sell';result[key+'Count']++;result[key+'Value']+=value;result[key+'Amount']+=amount;
  result.lfChange+=side==='buy'?amount:-amount;result.usdtChange+=side==='buy'?-value:value;
  if(f.feeCurrency){result.fees[f.feeCurrency]=(result.fees[f.feeCurrency]||0)+fee;if(f.feeCurrency==='LF')result.lfChange-=fee;if(f.feeCurrency==='USDT')result.usdtChange-=fee;}
 }
 result.volume=result.buyValue+result.sellValue;return result;
}
export function paperFills(trades,scope,from){return trades.filter(t=>t.time>=from&&(scope!=='bot'||['Bot','Depth'].includes(t.makerSource)||['Bot','Depth'].includes(t.takerSource))).map(t=>{
 const makerBot=['Bot','Depth'].includes(t.makerSource);return {time:t.time,side:scope==='bot'&&makerBot?(t.side==='buy'?'sell':'buy'):t.side,price:t.price,amount:t.amount,fee:0,feeCurrency:'USDT',source:makerBot?'Bot':'Manual'};
});}
