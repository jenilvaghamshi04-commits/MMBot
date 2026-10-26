import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3199'}});
after(()=>child.kill());
async function ready(){for(let i=0;i<30;i++){try{return await fetch('http://localhost:3199/api/health');}catch{await new Promise(r=>setTimeout(r,50));}}throw Error('Server did not start');}
test('serves terminal, health, scripts and rejects invalid pool input',async()=>{assert.equal((await ready()).status,200);for(const path of ['/','/app.js','/engine.js','/reference.js','/style.css','/favicon.svg'])assert.equal((await fetch('http://localhost:3199'+path)).status,200);assert.equal((await fetch('http://localhost:3199/api/dex?chain=ethereum&pool=bad')).status,400);assert.equal((await fetch('http://localhost:3199/missing')).status,404);});
