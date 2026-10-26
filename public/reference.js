export const LF_POOL='0xb37361ebebfe7e0f0d98300f0a8ae777daa1cc12';
export const LF_TOKEN='0x957c7fa189a408e78543113412f6ae1a9b4022c4';
export function referencePrice(data,chain,pool){
 if(data.base?.symbol?.toUpperCase()!=='LF')throw Error('Pool must have LF as base token');
 if(chain==='ethereum'&&pool.toLowerCase()===LF_POOL&&data.base.address?.toLowerCase()!==LF_TOKEN)throw Error('LF token contract does not match the configured pool');
 const direct=data.quote?.symbol?.toUpperCase()==='USDT';
 const price=Number(direct?data.priceNative:data.priceUsd);
 if(!Number.isFinite(price)||price<=0)throw Error('Pool reference price unavailable');
 return {price,unit:direct?'USDT':'USD',approximate:!direct,pair:`LF/${data.quote?.symbol||'unknown'}`};
}

export function freshReference(price,fetchedAt,interval,now=Date.now()){
 return Number.isFinite(price)&&price>0&&fetchedAt>0&&now-fetchedAt<=Math.max(60000,interval*2000)?price:null;
}
