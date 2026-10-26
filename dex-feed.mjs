import {referencePrice,WETH_TOKEN} from './public/reference.js';
export const ETH_USD_POOL='0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
export async function fetchDexReference(chain,pool,fetcher=fetch){
 async function pairAt(address){
  const response=await fetcher(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${address}`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('DEX reference unavailable');
  const data=await response.json();
  const pair=data.pairs?.find(p=>p.chainId===chain&&p.pairAddress?.toLowerCase()===address.toLowerCase());
  if(!pair)throw Error('Pool not found');
  return pair;
 }
 const pair=await pairAt(pool);
 const data={base:pair.baseToken,quote:pair.quoteToken,priceNative:pair.priceNative,priceUsd:pair.priceUsd,dex:pair.dexId};
 if([data.base,data.quote].some(t=>['WETH','ETH'].includes(t?.symbol?.toUpperCase()))){
  if(chain!=='ethereum')throw Error('ETH/USD conversion requires an Ethereum pool');
  const eth=await pairAt(ETH_USD_POOL);
  if(eth.baseToken?.address?.toLowerCase()!==WETH_TOKEN)throw Error('ETH/USD source token mismatch');
  data.ethUsd=Number(eth.priceUsd);data.ethUsdPool=ETH_USD_POOL;
 }
 referencePrice(data,chain,pool);
 return {...data,fetchedAt:Date.now()};
}
