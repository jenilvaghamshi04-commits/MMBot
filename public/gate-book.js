// Gate's full 100-level snapshots avoid an incomplete book after missed deltas.
export function parseSnapshot(message){
 if(message?.channel!=='spot.order_book'||message.event!=='update'||message.result?.s!=='LF_USDT')return null;
 const r=message.result;if(!Number.isSafeInteger(r.lastUpdateId)||r.lastUpdateId<0||!Array.isArray(r.bids)||!Array.isArray(r.asks))throw Error('Invalid Gate order-book snapshot');
 const valid=levels=>levels.length<=100&&levels.every(v=>Array.isArray(v)&&v.length>=2&&Number.isFinite(Number(v[0]))&&Number(v[0])>0&&Number.isFinite(Number(v[1]))&&Number(v[1])>=0);
 if(!valid(r.bids)||!valid(r.asks))throw Error('Invalid Gate order-book levels');
 return {id:r.lastUpdateId,bids:r.bids.filter(v=>Number(v[1])>0),asks:r.asks.filter(v=>Number(v[1])>0),exchangeTime:Number(r.t)||0};
}
export class GateBookStream{
 constructor({onBook,onStatus,Socket=globalThis.WebSocket}){this.onBook=onBook;this.onStatus=onStatus;this.Socket=Socket;this.socket=null;this.retry=null;this.ping=null;this.watchdog=null;this.lastReceived=0;this.lastId=-1;this.delay=1000;this.stopped=false;this.generation=0;}
 start(){if(this.socket||this.retry)return;this.stopped=false;this.connect();}
 connect(){if(this.stopped)return;const generation=++this.generation;this.lastId=-1;this.lastReceived=0;this.onStatus('connecting');let ws;try{ws=new this.Socket('wss://api.gateio.ws/ws/v4/');}catch{this.schedule();return;}this.socket=ws;
 const active=()=>!this.stopped&&generation===this.generation&&this.socket===ws;
 ws.onopen=()=>{if(!active())return;ws.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:'spot.order_book',event:'subscribe',payload:['LF_USDT','100','100ms']}));this.ping=setInterval(()=>{if(active()&&ws.readyState===1)ws.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:'spot.ping'}));},20000);this.watchdog=setInterval(()=>{if(active()&&Date.now()-(this.lastReceived||openedAt)>10000){this.onStatus('stale');ws.close();}},2000);};
 const openedAt=Date.now();
 ws.onmessage=event=>{if(!active())return;let message;try{message=JSON.parse(event.data);if(message.channel==='spot.order_book'&&message.event==='subscribe'&&message.error){this.onStatus('unavailable');ws.close();return;}const book=parseSnapshot(message);if(!book||book.id<this.lastId)return;this.lastId=book.id;this.lastReceived=Date.now();this.delay=1000;this.onBook(book,this.lastReceived);this.onStatus('live');}catch{this.onStatus('invalid');ws.close();}};
 ws.onerror=()=>{if(active())ws.close();};ws.onclose=()=>{if(!active())return;this.socket=null;this.clearTimers();this.onStatus('reconnecting');this.schedule();};
 }
 clearTimers(){clearInterval(this.ping);clearInterval(this.watchdog);this.ping=null;this.watchdog=null;}
 schedule(){if(this.stopped||this.retry)return;this.retry=setTimeout(()=>{this.retry=null;this.connect();},this.delay);this.delay=Math.min(this.delay*2,30000);}
 stop(){this.stopped=true;this.generation++;clearTimeout(this.retry);this.retry=null;this.clearTimers();const ws=this.socket;this.socket=null;if(ws)ws.close();}
}
