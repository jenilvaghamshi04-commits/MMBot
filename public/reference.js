export const LF_POOL='0xb37361ebebfe7e0f0d98300f0a8ae777daa1cc12';
export const LF_TOKEN='0x957c7fa189a408e78543113412f6ae1a9b4022c4';
export const WETH_TOKEN='0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
export function referencePrice(data,chain,pool){
 const base=data.base?.symbol?.toUpperCase(),quote=data.quote?.symbol?.toUpperCase();
 const reversed=quote==='LF'&&['WETH','ETH'].includes(base);
 if(base!=='LF'&&!reversed)throw Error('Pool must contain LF');
 const lf=reversed?data.quote:data.base,eth=reversed?data.base:data.quote;
 if(chain==='ethereum'&&pool.toLowerCase()===LF_POOL&&lf.address?.toLowerCase()!==LF_TOKEN)throw Error('LF token contract does not match the configured pool');
 const direct=quote==='USDT';
 let price=Number(direct?data.priceNative:data.priceUsd),conversion;
 if(reversed||['WETH','ETH'].includes(quote)){
  if(chain!=='ethereum'||eth.address?.toLowerCase()!==WETH_TOKEN)throw Error('Expected Ethereum WETH token');
  const native=Number(data.priceNative),ethUsd=Number(data.ethUsd);
  if(!Number.isFinite(native)||native<=0||!Number.isFinite(ethUsd)||ethUsd<=0)throw Error('Live pool ratio or ETH/USD unavailable');
  const wethPerLf=reversed?1/native:native;
  price=wethPerLf*ethUsd;conversion={wethPerLf,ethUsd};
 }
 if(!Number.isFinite(price)||price<=0)throw Error('Pool reference price unavailable');
 return {price,unit:direct?'USDT':'USD',approximate:!direct,pair:`LF/${reversed?base:data.quote?.symbol||'unknown'}`,...(conversion?{conversion}:{})};
}

export function freshReference(price,fetchedAt,interval,now=Date.now()){
 return Number.isFinite(price)&&price>0&&fetchedAt>0&&now-fetchedAt<=Math.max(60000,interval*2000)?price:null;
}
