const $=id=>document.getElementById(id);
const defaults={exchange:'',demoPrice:0.00012,size:10,spread:1,levels:8,interval:30,chain:'',pool:''};
let settings={...defaults},orders=[],side='buy',dexTimer,dexController,dexGeneration=0;
try{settings={...defaults,...JSON.parse(localStorage.getItem('lf.settings')||'{}')};orders=JSON.parse(localStorage.getItem('lf.orders')||'[]');if(!Array.isArray(orders))orders=[];}catch{settings={...defaults};orders=[];}
if(!Number.isFinite(settings.demoPrice)||settings.demoPrice<=0)settings={...defaults};
const fmt=n=>Number(n).toLocaleString('en-US',{maximumSignificantDigits:9});
const money=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500);}
function save(){try{localStorage.setItem('lf.settings',JSON.stringify(settings));localStorage.setItem('lf.orders',JSON.stringify(orders));return true;}catch{toast('Browser storage unavailable. Changes last only for this session.');return false;}}
function renderBook(){
 $('reference').textContent=fmt(settings.demoPrice);$('mid').textContent=fmt(settings.demoPrice);$('exchangeLabel').textContent=settings.exchange||'Exchange not selected';
 for(const type of ['asks','bids']){
  const container=$(type);container.replaceChildren();const levels=Array.from({length:8},(_,i)=>i+1);if(type==='asks')levels.reverse();
  for(const i of levels){const p=settings.demoPrice*(1+(type==='asks'?1:-1)*i*.001);const qty=(8+i*3)/p;const row=document.createElement('button');row.type='button';row.className='book-row';row.style.setProperty('--tint',type==='asks'?'#fa7c8c12':'#baff6512');row.style.setProperty('--depth',`${20+i*8}%`);
   for(const [j,value] of [fmt(p),fmt(qty),money(qty*p)].entries()){const cell=document.createElement('span');cell.textContent=value;if(j===0)cell.className=type==='asks'?'red':'green';row.append(cell);}row.onclick=()=>{$('price').value=p.toPrecision(9);updateTotal();};container.append(row);
  }
 }
}
function renderOrders(){
 $('orders').replaceChildren();let value=0;
 for(const order of orders){const row=document.createElement('tr');value+=order.price*order.amount;
  const values=[new Date(order.time).toLocaleTimeString(), 'LF/USDT',order.side.toUpperCase(),fmt(order.price),fmt(order.amount),money(order.price*order.amount)];
  values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===2)td.className=order.side==='buy'?'green':'red';row.append(td);});
  const cell=document.createElement('td'),btn=document.createElement('button');btn.className='secondary';btn.textContent='Cancel';btn.onclick=()=>{orders=orders.filter(o=>o.id!==order.id);save();renderOrders();toast('Demo order cancelled');};cell.append(btn);row.append(cell);$('orders').append(row);
 }
 $('empty').hidden=orders.length>0;$('orderCount').textContent=orders.length;$('countLabel').textContent=`(${orders.length})`;$('exposure').textContent=`${money(value)} USDT open notional`;
}
function updateTotal(){const total=Number($('price').value)*Number($('amount').value);$('total').textContent=`${money(Number.isFinite(total)?total:0)} USDT`;}
function setSide(value){side=value;$('buyTab').className=value==='buy'?'selected':'';$('sellTab').className=value==='sell'?'selected sell':'';$('submitOrder').textContent=`Place demo ${value}`;$('submitOrder').style.background=value==='buy'?'var(--green)':'var(--red)';}
$('buyTab').onclick=()=>setSide('buy');$('sellTab').onclick=()=>setSide('sell');$('price').oninput=updateTotal;$('amount').oninput=updateTotal;
$('orderForm').onsubmit=e=>{e.preventDefault();const price=Number($('price').value),amount=Number($('amount').value);if(!Number.isFinite(price*amount)||price<=0||amount<=0)return toast('Enter a valid positive price and amount.');orders.unshift({id:crypto.randomUUID(),price,amount,side,time:Date.now()});save();renderOrders();toast(`Demo ${side} order placed`);};
$('cancelAll').onclick=()=>{orders=[];save();renderOrders();toast('All demo orders cancelled');};
function fillSettings(){for(const key of Object.keys(defaults))$(key).value=settings[key];}
$('settingsForm').onsubmit=e=>{e.preventDefault();const next={};for(const key of Object.keys(defaults))next[key]=typeof defaults[key]==='number'?Number($(key).value):$(key).value.trim();if(Boolean(next.chain)!==Boolean(next.pool))return toast('Enter both blockchain ID and pool address.');if(!['demoPrice','size','spread','levels','interval'].every(k=>Number.isFinite(next[k])&&next[k]>0))return toast('Use valid positive numeric settings.');settings=next;const persisted=save();renderBook();if(persisted)toast('Settings saved');restartDex();};
async function fetchDex(){
 dexController?.abort();const generation=++dexGeneration;const {chain,pool}=settings;$('dexPrice').textContent='—';
 if(!chain||!pool){$('dexStatus').textContent='Pool not configured';return;}
 dexController=new AbortController();const timeout=setTimeout(()=>dexController?.abort(),12000);$('dexStatus').textContent='Fetching pool reference…';
 try{const response=await fetch(`/api/dex?chain=${encodeURIComponent(chain)}&pool=${encodeURIComponent(pool)}`,{signal:dexController.signal});if(!response.ok)throw Error(response.status===404?'Pool not found':response.status===400?'Invalid pool configuration':'DEX feed unavailable');const data=await response.json();if(generation!==dexGeneration)return;
  if(data.base?.symbol?.toUpperCase()!=='LF'||data.quote?.symbol?.toUpperCase()!=='USDT')throw Error('Pool must have LF as base and USDT as quote');
  const price=Number(data.priceNative);if(!(price>0&&Number.isFinite(price)))throw Error('Pool price unavailable');
  $('dexPrice').textContent=fmt(price);$('dexStatus').textContent=`${data.dex} · USDT · fetched ${new Date(data.fetchedAt).toLocaleTimeString()}`;
 }catch(error){if(generation===dexGeneration){$('dexPrice').textContent='—';$('dexStatus').textContent=error.name==='AbortError'?'DEX request timed out':error.message;}}
 finally{clearTimeout(timeout);}
}
function restartDex(){clearInterval(dexTimer);fetchDex();if(settings.pool)dexTimer=setInterval(fetchDex,Math.max(10,settings.interval)*1000);}
$('fetchDex').onclick=()=>{if($('chain').value.trim()!==settings.chain||$('pool').value.trim()!==settings.pool)return toast('Save your DEX settings first.');fetchDex();};
$('strategyBtn').onclick=()=>{$('reviewText').textContent=`${settings.exchange||'Exchange not selected'} · LF/USDT · ${settings.size} USDT per order · ${settings.spread}% spread · ${settings.levels} levels per side · ${settings.interval}s refresh.`;$('review').showModal();};$('closeReview').onclick=()=>$('review').close();
$('reset').onclick=()=>{if(!confirm('Clear all demo orders and restore default settings?'))return;orders=[];settings={...defaults};save();fillSettings();renderBook();renderOrders();$('price').value=settings.demoPrice;$('amount').value='';updateTotal();restartDex();toast('Demo reset');};
fillSettings();renderBook();renderOrders();$('price').value=settings.demoPrice;restartDex();
