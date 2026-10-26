import {test} from 'node:test';
import assert from 'node:assert/strict';
import {referencePrice,LF_POOL,LF_TOKEN,WETH_TOKEN} from './public/reference.js';
const weth={base:{symbol:'LF',address:LF_TOKEN},quote:{symbol:'WETH',address:WETH_TOKEN},ethUsd:2300,priceNative:'0.000000009265',priceUsd:'0.00002132'};
test('LF/WETH multiplies pool ratio by independent ETH/USD',()=>{const result=referencePrice(weth,'ethereum',LF_POOL);assert.equal(result.price,Number(weth.priceNative)*2300);assert.equal(result.conversion.ethUsd,2300);});
test('USDT quote uses native USDT price',()=>{assert.equal(referencePrice({...weth,quote:{symbol:'USDT'},priceNative:'.000022'},'ethereum','other').price,.000022);});
test('rejects wrong token contract and missing USD price',()=>{assert.throws(()=>referencePrice({...weth,base:{symbol:'LF',address:'0xbad'}},'ethereum',LF_POOL));assert.throws(()=>referencePrice({...weth,ethUsd:null},'ethereum',LF_POOL));});
import {freshReference} from './public/reference.js';
test('pending refresh retains still-fresh price, expires old quotes and rejects missing quotes',()=>{assert.equal(freshReference(.00002,1000,10,2000),.00002);assert.equal(freshReference(.00002,1000,10,61000),.00002);assert.equal(freshReference(.00002,1000,10,61001),null);assert.equal(freshReference(null,1000,10,2000),null);});

test('inverse LF per WETH ratio is inverted using token order',()=>{
 const data={base:{symbol:'WETH',address:WETH_TOKEN},quote:{symbol:'LF',address:LF_TOKEN},priceNative:32000,ethUsd:3000};
 assert.equal(referencePrice(data,'ethereum',LF_POOL).price,.09375);
 assert.equal(referencePrice({...weth,priceNative:1/32000,ethUsd:3000},'ethereum',LF_POOL).price,.09375);
});
test('rejects spoofed WETH contract and invalid pool ratio',()=>{
 assert.throws(()=>referencePrice({...weth,quote:{symbol:'WETH',address:'0xbad'}},'ethereum',LF_POOL));
 assert.throws(()=>referencePrice({...weth,priceNative:0},'ethereum',LF_POOL));
});
import {fetchDexReference,ETH_USD_POOL} from './dex-feed.mjs';
test('shared feed fetches independent ETH/USD for browser and live worker',async()=>{
 const calls=[];
 const fetcher=async url=>{calls.push(url);const eth=url.endsWith(ETH_USD_POOL);return {ok:true,json:async()=>({pairs:[{chainId:'ethereum',pairAddress:eth?ETH_USD_POOL:LF_POOL,baseToken:eth?{symbol:'WETH',address:WETH_TOKEN}:weth.base,quoteToken:eth?{symbol:'USDC'}:weth.quote,priceNative:eth?'3000':String(1/32000),priceUsd:eth?'3000':'999'}]})};};
 const data=await fetchDexReference('ethereum',LF_POOL,fetcher);
 assert.equal(calls.length,2);assert.equal(referencePrice(data,'ethereum',LF_POOL).price,.09375);
 await assert.rejects(()=>fetchDexReference('ethereum',LF_POOL,async url=>url.endsWith(ETH_USD_POOL)?{ok:false}:fetcher(url)),/unavailable/);
});
