import {test} from 'node:test';
import assert from 'node:assert/strict';
import {referencePrice,LF_POOL,LF_TOKEN} from './public/reference.js';
const weth={base:{symbol:'LF',address:LF_TOKEN},quote:{symbol:'WETH'},priceNative:'0.000000009265',priceUsd:'0.00002132'};
test('configured LF/WETH pool uses USD reference, never ETH quote as USDT',()=>{assert.deepEqual(referencePrice(weth,'ethereum',LF_POOL),{price:.00002132,unit:'USD',approximate:true,pair:'LF/WETH'});});
test('USDT quote uses native USDT price',()=>{assert.equal(referencePrice({...weth,quote:{symbol:'USDT'},priceNative:'.000022'},'ethereum','other').price,.000022);});
test('rejects wrong token contract and missing USD price',()=>{assert.throws(()=>referencePrice({...weth,base:{symbol:'LF',address:'0xbad'}},'ethereum',LF_POOL));assert.throws(()=>referencePrice({...weth,priceUsd:null},'ethereum',LF_POOL));});
