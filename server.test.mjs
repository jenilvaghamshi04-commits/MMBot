import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3199'}});
after(()=>child.kill());
async function ready(){for(let i=0;i<30;i++){try{return await fetch('http://localhost:3199/api/health');}catch{await new Promise(r=>setTimeout(r,50));}}throw Error('Server did not start');}
test('serves terminal, health, scripts and rejects invalid pool input',async()=>{assert.equal((await ready()).status,200);for(const path of ['/','/live','/live.js','/live.css','/app.js','/engine.js','/reference.js','/matching.js','/style.css','/favicon.svg'])assert.equal((await fetch('http://localhost:3199'+path)).status,200);assert.equal((await fetch('http://localhost:3199/api/dex?chain=ethereum&pool=bad')).status,400);assert.equal((await fetch('http://localhost:3199/missing')).status,404);});

test('live private endpoints reject requests without operator authentication',async()=>{await ready();const response=await fetch('http://localhost:3199/api/live/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);const setup=await fetch('http://localhost:3199/api/live/setup');assert.equal(setup.status,200);});
