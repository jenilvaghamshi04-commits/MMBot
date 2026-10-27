import {createPublicKey,verify} from 'node:crypto';
const MAX_TOKEN=16384;
export class AccessVerifier{
 constructor({team=process.env.CF_ACCESS_TEAM_DOMAIN||'',audience=process.env.CF_ACCESS_AUD||'',emails=process.env.CF_ACCESS_ALLOWED_EMAILS||'',fetcher=fetch,now=()=>Date.now()}={}){
  this.team=team.replace(/\/$/,'');this.audience=audience;this.emails=new Set(emails.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));this.fetcher=fetcher;this.now=now;this.keys=null;this.loadedAt=0;this.lastUnknownAt=0;
 }
 configured(){return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(this.team)&&!!this.audience&&this.audience.length<=256&&this.emails.size>0;}
 async getKeys(force=false){if(!force&&this.keys&&this.now()-this.loadedAt<300000)return this.keys;const res=await this.fetcher(`${this.team}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(5000),redirect:'error'});if(!res.ok)throw Error('Identity verification unavailable');const data=await res.json();if(!Array.isArray(data.keys)||data.keys.length>20)throw Error('Invalid identity keys');this.keys=data.keys;this.loadedAt=this.now();return this.keys;}
 async verify(token){
  if(!this.configured())throw Error('Live access is not configured');
  if(typeof token!=='string'||token.length>MAX_TOKEN)throw Error('Access session required');
  const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw Error('Invalid access session');
  let header,claims;try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw Error('Invalid access session');}
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)throw Error('Invalid access session');
  const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud],now=Math.floor(this.now()/1000);
  if(claims.iss!==this.team||!aud.includes(this.audience)||!Number.isFinite(claims.exp)||claims.exp<=now||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now))||!this.emails.has(String(claims.email||'').toLowerCase()))throw Error('Access session is invalid or expired');
  let keys=await this.getKeys(),key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));if(!key&&this.now()-this.lastUnknownAt>=30000){this.lastUnknownAt=this.now();keys=await this.getKeys(true);key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));}if(!key)throw Error('Unknown access key');
  let ok=false;try{ok=verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url'));}catch{}if(!ok)throw Error('Invalid access signature');
  return {email:String(claims.email).toLowerCase(),expires:claims.exp};
 }
}
export class SecurityLog{
 constructor({token=process.env.SECURITY_ALERT_BOT_TOKEN||'',chat=process.env.SECURITY_ALERT_CHAT_ID||'',fetcher=fetch}={}){this.events=[];this.token=token;this.chat=chat;this.fetcher=fetcher;this.cooldowns=new Map();this.deniedAt=0;}
 record(type,actor='unknown',alert=false){if(type==='access_denied'){if(Date.now()-this.deniedAt<60000)return;this.deniedAt=Date.now();}const event={time:Date.now(),type,actor:actor.slice(0,160)};this.events.unshift(event);this.events=this.events.slice(0,200);console.log(JSON.stringify({security:event}));if(alert)this.alert(type);}
 alert(type){if(!/^\d+:[A-Za-z0-9_-]+$/.test(this.token)||! /^-?\d+$/.test(this.chat))return;const now=Date.now();if(now-(this.cooldowns.get(type)||0)<60000)return;this.cooldowns.set(type,now);this.fetcher(`https://api.telegram.org/bot${this.token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:this.chat,text:`MMBot security alert: ${type}. Check the security activity log.`}),signal:AbortSignal.timeout(5000)}).catch(()=>{});}
}
export class FailureLimiter{
 constructor(){this.failures=new Map();}
 allowed(actor,now=Date.now()){const state=this.failures.get(actor);if(!state)return true;if(now-state.start>=300000){this.failures.delete(actor);return true;}return state.count<5;}
 fail(actor,now=Date.now()){if(!this.failures.has(actor)&&this.failures.size>=1000){const oldest=this.failures.keys().next().value;this.failures.delete(oldest);}let s=this.failures.get(actor);if(!s||now-s.start>=300000)s={start:now,count:0};s.count++;this.failures.set(actor,s);}
 clear(actor){this.failures.delete(actor);}
}
