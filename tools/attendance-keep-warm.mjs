// Run on a separate awake machine; a timer inside a sleeping service cannot wake it.
import {setTimeout as delay} from 'node:timers/promises';
const trimSlash=value=>value.endsWith('/')?value.slice(0,-1):value;
const usage='Usage: node tools/attendance-keep-warm.mjs --api-base https://ACTUAL-SERVICE.onrender.com/api [--interval-seconds 120] [--once]';
async function main(){
 const args=process.argv.slice(2);if(args.includes('--help')){console.log(usage);return;}
 let base,interval=120,once=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--api-base')base=args[++i];else if(args[i]==='--interval-seconds')interval=Number(args[++i]);else if(args[i]==='--once')once=true;else throw new Error(usage);
 }
 let url;try{url=new URL(base);}catch{throw new Error('Supply the actual HTTPS backend URL ending in /api.');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!trimSlash(url.pathname).endsWith('/api')||/[<>]|your-service-name|ACTUAL-SERVICE/i.test(String(base)))throw new Error('Supply the actual HTTPS backend URL ending in /api, without credentials or placeholders.');
 if(!Number.isFinite(interval)||interval<60||interval>600)throw new Error('Interval must be 60–600 seconds.');
 url.pathname=trimSlash(url.pathname)+'/health';
 const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 do{
  try{
   const timeout=AbortSignal.timeout(15000),signal=AbortSignal.any([stop.signal,timeout]);
   const response=await fetch(url,{redirect:'error',signal,headers:{'Cache-Control':'no-cache'}});
   const body=response.ok?await response.json():null;
   if(!response.ok||body?.status!=='ok')throw new Error('Health request failed ('+response.status+').');
   console.log(new Date().toISOString()+' Backend HTTP health is responding.');
  }catch(error){if(stop.signal.aborted)break;console.error(new Date().toISOString()+' '+(error.name==='TimeoutError'?'Health request timed out.':error.message));if(once)process.exitCode=1;}
  if(once)break;try{await delay(interval*1000,undefined,{signal:stop.signal});}catch{break;}
 }while(!stop.signal.aborted);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
