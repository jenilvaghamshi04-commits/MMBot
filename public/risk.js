export function validateJumpSettings(settings){
 const percent=Number(settings.jumpPercent??0),seconds=Number(settings.jumpWindow??60);
 if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Price jump limit must be between 0 and 100%.');
 if(!Number.isInteger(seconds)||seconds<10||seconds>3600)throw Error('Price jump window must be 10–3600 seconds.');
 return {percent,seconds};
}
export class PriceJumpGuard{
 constructor(){this.samples=[];}
 reset(){this.samples=[];}
 observe(price,time,settings){
  const {percent,seconds}=validateJumpSettings(settings);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(time))throw Error('Invalid price observation.');
  this.samples=this.samples.filter(s=>time>=s.time&&time-s.time<=seconds*1000);
  if(percent>0){for(const sample of this.samples){const change=(price/sample.price-1)*100;if(Math.abs(change)>percent+1e-10)throw Error(`Price jump protection: DEX moved ${change>=0?'+':''}${change.toFixed(2)}% within ${seconds}s (limit ${percent}%). Bot paused. Existing orders remain open.`);}}
  this.samples.push({price,time});
 }
}
