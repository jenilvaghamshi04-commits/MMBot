import {createHash,createHmac} from 'node:crypto';
export const PAIR='LF_USDT';
export function signature(secret,method,path,query,body,timestamp){return createHmac('sha512',secret).update([method,path,query,createHash('sha512').update(body).digest('hex'),timestamp].join('\n')).digest('hex');}
export class GateClient{
 constructor(key='',secret='',fetcher=fetch){this.key=key;this.secret=secret;this.fetcher=fetcher;}
 async request(method,path,params={},payload=null,authenticated=false){
  const query=new URLSearchParams(params).toString(),body=payload===null?'':JSON.stringify(payload),full='/api/v4'+path;
  const headers={'Accept':'application/json','Content-Type':'application/json'};
  if(authenticated){if(!this.key||!this.secret)throw Error('Connect Gate API credentials first.');const timestamp=String(Math.floor(Date.now()/1000));Object.assign(headers,{KEY:this.key,Timestamp:timestamp,SIGN:signature(this.secret,method,full,query,body,timestamp)});}
  const response=await this.fetcher(`https://api.gateio.ws${full}${query?'?'+query:''}`,{method,headers,...(body?{body}:{}),signal:AbortSignal.timeout(12000)});
  const data=await response.json();if(!response.ok)throw Error(`Gate ${response.status}: ${data.label||'request rejected'}`);return data;
 }
 async market(){const [book,tickers,pair]=await Promise.all([this.request('GET','/spot/order_book',{currency_pair:PAIR,limit:'100',with_id:'true'}),this.request('GET','/spot/tickers',{currency_pair:PAIR}),this.request('GET',`/spot/currency_pairs/${PAIR}`)]);return {book,ticker:tickers[0],pair,fetchedAt:Date.now()};}
 async orders(){let result=[];for(let page=1;page<=10;page++){const rows=await this.request('GET','/spot/orders',{currency_pair:PAIR,status:'open',limit:'100',page:String(page)},null,true);result.push(...rows);if(rows.length<100)return result;}throw Error('Too many open orders to reconcile completely.');}
 async trades(from,to){let result=[];for(let page=1;page<=20;page++){const rows=await this.request('GET','/spot/my_trades',{currency_pair:PAIR,from:String(from),to:String(to),limit:'1000',page:String(page)},null,true);result.push(...rows);if(rows.length<1000)return result;}throw Error('Too many fills to load completely. Choose a shorter period.');}
 accounts(){return this.request('GET','/spot/accounts',{},null,true);}
 create(order){return this.request('POST','/spot/orders',{},order,true);}
 cancel(id){return this.request('DELETE',`/spot/orders/${encodeURIComponent(id)}`,{currency_pair:PAIR},null,true);}
}
export function exchangeOrder(order,pair,{postOnly=true,text=''}={}){
 if(!['buy','sell'].includes(order.side)||!Number.isFinite(order.price)||order.price<=0||!Number.isFinite(order.amount)||order.amount<=0)throw Error('Price and quantity must be positive.');
 const precision=Number(pair.precision),quantityPrecision=Number(pair.amount_precision);
 if(!Number.isInteger(precision)||precision<0||precision>15||!Number.isInteger(quantityPrecision)||quantityPrecision<0||quantityPrecision>15)throw Error('Invalid Gate precision metadata.');
 const scale=10**precision,amountScale=10**quantityPrecision;
 const price=(order.side==='buy'?Math.floor(order.price*scale+1e-7):Math.ceil(order.price*scale-1e-7))/scale;
 const amount=Math.floor(order.amount*amountScale+1e-7)/amountScale,value=price*amount;
 if(!(price>0&&amount>0)||amount<Number(pair.min_base_amount||0)||value+1e-10<Number(pair.min_quote_amount||0))throw Error(`Order is below Gate minimum (${pair.min_quote_amount||0} USDT, ${pair.min_base_amount||0} LF).`);
 if(pair.max_base_amount&&amount>Number(pair.max_base_amount)||pair.max_quote_amount&&value>Number(pair.max_quote_amount))throw Error('Order exceeds Gate maximum.');
 return {currency_pair:PAIR,type:'limit',account:'spot',side:order.side,price:price.toFixed(precision),amount:amount.toFixed(quantityPrecision),time_in_force:postOnly?'poc':'gtc',...(text?{text}:{})};
}
export function marketOrders(book,accountOrders,metadata=new Map(),prefix='t-lfmm-'){
 const own=accountOrders.filter(o=>String(o.text||'').startsWith(prefix));
 const external=[];
 for(const [key,side] of [['bids','buy'],['asks','sell']])for(const [p,q] of book[key]||[]){const price=Number(p);const ours=own.filter(o=>o.side===side&&Math.abs(Number(o.price)-price)<1e-15).reduce((n,o)=>n+Number(o.left??o.amount),0);const amount=Math.max(0,Number(q)-ours);if(amount>0)external.push({id:`market-${side}-${p}`,side,price,amount,source:'Market'});}
 return [...external,...own.map(o=>({...metadata.get(String(o.id)),id:String(o.id),side:o.side,price:Number(o.price),amount:Number(o.left??o.amount),source:metadata.get(String(o.id))?.source||(String(o.text).includes('-D-')?'Depth':'Bot')}))];
}
