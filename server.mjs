import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/favicon.svg':['favicon.svg','image/svg+xml'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/engine.js':['engine.js','text/javascript'],'/reference.js':['reference.js','text/javascript'],'/style.css':['style.css','text/css']};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');
 try {
  if(url.pathname==='/api/health'){res.setHeader('Content-Type','application/json');return res.end('{"ok":true}');}
  if(url.pathname==='/api/dex'){
   const chain=url.searchParams.get('chain')||'',pool=url.searchParams.get('pool')||'';
   if(!/^[a-z0-9-]{1,40}$/.test(chain)||!/^[a-zA-Z0-9]{20,100}$/.test(pool)){res.writeHead(400);return res.end('Enter a valid chain and pool address.');}
   const upstream=await fetch(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${pool}`,{signal:AbortSignal.timeout(10000)});
   if(!upstream.ok)throw Error('Price provider unavailable');
   const data=await upstream.json();
   const pair=data.pairs?.find(p=>p.chainId===chain&&p.pairAddress.toLowerCase()===pool.toLowerCase());
   if(!pair) {res.writeHead(404);return res.end('Pool not found.');}
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   return res.end(JSON.stringify({base:pair.baseToken,quote:pair.quoteToken,priceNative:pair.priceNative,priceUsd:pair.priceUsd,dex:pair.dexId,fetchedAt:Date.now()}));
  }
  const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',file[1]);res.end(await readFile(new URL('./public/'+file[0],import.meta.url)));
 }catch(e){res.writeHead(502);res.end('Unable to load data. Please try again.');}
}).listen(Number(process.env.PORT)||Number(process.argv[process.argv.indexOf('--port')+1])||3000,'0.0.0.0');
