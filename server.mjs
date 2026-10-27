import {AccessVerifier,SecurityLog,FailureLimiter} from './access-security.mjs';
import {fetchDexReference} from './dex-feed.mjs';
import http from 'node:http';
import {LiveService} from './live-service.mjs';
const live=new LiveService(),access=new AccessVerifier(),security=new SecurityLog(),limiter=new FailureLimiter();
const originalLog=live.log.bind(live);live.log=message=>{originalLog(message);if(message.startsWith('Stopped:'))security.record('worker_stopped','system',true);};
async function body(req){let data='';for await(const part of req){data+=part;if(data.length>16384)throw Error('Request too large.');}return JSON.parse(data||'{}');}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
import {readFile} from 'node:fs/promises';
const files={'/live':['live.html','text/html'],'/live/':['live.html','text/html'],'/live.js':['live.js','text/javascript'],'/gate-book.js':['gate-book.js','text/javascript'],'/live.css':['live.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/engine.js':['engine.js','text/javascript'],'/reference.js':['reference.js','text/javascript'],'/matching.js':['matching.js','text/javascript'],'/risk.js':['risk.js','text/javascript'],'/performance.js':['performance.js','text/javascript'],'/performance-ui.js':['performance-ui.js','text/javascript'],'/style.css':['style.css','text/css']};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');
 try {
  let identity=null;
  if(url.pathname==='/live'||url.pathname==='/live/'||url.pathname.startsWith('/api/live/')){
   try{identity=await access.verify(req.headers['cf-access-jwt-assertion']);}catch{security.record('access_denied','unverified');if(url.pathname.startsWith('/api/'))return json(res,{error:'Live access is unavailable or your access session has expired.'},403);res.writeHead(403,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end('Live access requires a verified Cloudflare Access session. Contact the administrator.');}
  }
  if((url.pathname==='/live'||url.pathname==='/live/')&&identity)security.record('live_page_accessed',identity.email);
  if(url.pathname==='/api/gate/market'){try{return json(res,await live.market());}catch(e){return json(res,{error:'Gate public feed unavailable. Retry shortly.'},502);}}
  if(url.pathname==='/api/live/setup')return json(res,{operatorConfigured:live.status().operatorConfigured,enabled:live.enabled()});
  if(url.pathname.startsWith('/api/live/')){
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(!limiter.allowed(identity.email))return json(res,{error:'Too many failed operator token attempts. Try again in five minutes.'},429);
   if(!live.authorized(token)){limiter.fail(identity.email);security.record('operator_auth_failed',identity.email,true);return json(res,{error:'Enter the operator token configured as LIVE_ADMIN_TOKEN on Render.'},401);}
   limiter.clear(identity.email);
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,{error:'Origin not allowed.'},403);
   try{
    if(req.method==='GET'&&url.pathname==='/api/live/status')return json(res,live.status());
    if(req.method==='GET'&&url.pathname==='/api/live/security')return json(res,{events:security.events});
    if(req.method==='GET'&&url.pathname==='/api/live/account')return json(res,await live.account());
    if(req.method==='GET'&&url.pathname==='/api/live/performance')return json(res,{fills:await live.performance(Number(url.searchParams.get('hours')),url.searchParams.get('scope'))});
    if(req.method!=='POST')return json(res,{error:'Method not allowed.'},405);
    if(!String(req.headers['content-type']).includes('application/json'))return json(res,{error:'JSON required.'},400);
    const input=await body(req);
    if(url.pathname==='/api/live/connect'){const result=await live.connect(input.key,input.secret);security.record('gate_connected',identity.email,true);return json(res,result);}
    if(url.pathname==='/api/live/disconnect'){const result=await live.disconnect();security.record('gate_disconnected',identity.email);return json(res,result);}
    if(url.pathname==='/api/live/preview'){const p=await live.preview(input.settings);return json(res,{reference:p.reference,orders:p.creates.map(e=>({...e.order,source:e.strategy.source})),cancelCount:p.cancelIds.length,notes:p.result.notes,fetchedAt:Date.now()});}
    if(url.pathname==='/api/live/settings-audit'){security.record('settings_saved',identity.email);return json(res,{ok:true});}
    if(url.pathname==='/api/live/start'){const result=await live.start(input.settings);security.record(result.running?'bot_started':'bot_start_stopped',identity.email,true);return json(res,result);}
    if(url.pathname==='/api/live/stop'){const result=await live.stop(Boolean(input.cancel));security.record(input.cancel?'bot_stopped_cancelled':'bot_stopped',identity.email);return json(res,result);}
    if(url.pathname==='/api/live/manual'){const result=await live.manual({side:input.side,price:Number(input.price),amount:Number(input.amount)});security.record('manual_order_submitted',identity.email,true);return json(res,result);}
    return json(res,{error:'Not found.'},404);
   }catch(e){if(req.method==='POST')security.record('live_action_failed',identity.email,true);return json(res,{error:e.message||'Live operation failed.'},400);}
  }
  if(url.pathname==='/api/health'){res.setHeader('Content-Type','application/json');return res.end('{"ok":true}');}
  if(url.pathname==='/api/dex'){
   const chain=url.searchParams.get('chain')||'',pool=url.searchParams.get('pool')||'';
   if(!/^[a-z0-9-]{1,40}$/.test(chain)||!/^[a-zA-Z0-9]{20,100}$/.test(pool)){res.writeHead(400);return res.end('Enter a valid chain and pool address.');}
   return json(res,await fetchDexReference(chain,pool));
  }
  const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',file[1]);res.end(await readFile(new URL('./public/'+file[0],import.meta.url)));
 }catch(e){res.writeHead(502);res.end('Unable to load data. Please try again.');}
}).listen(Number(process.env.PORT)||Number(process.argv[process.argv.indexOf('--port')+1])||3000,'0.0.0.0');
