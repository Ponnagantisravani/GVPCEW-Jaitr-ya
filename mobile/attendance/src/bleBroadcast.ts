import * as Advertiser from 'react-native-ble-advertiser';
import {ApiError,getBleToken} from './api';
import {campusBle,secureStorage} from './native';
import {BLE_ADVERTISER_KEY,BLE_COMPANY_ID,tokenBytes} from './bleProtocol';
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function bounded<T>(promise:Promise<T>,ms:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<T>((_r,reject)=>{timer=setTimeout(()=>reject(new Error('Bluetooth broadcast did not respond.')),ms);})]);}finally{if(timer)clearTimeout(timer);}}
export async function runBleBroadcast(data:{session_id:string;user_id:string;expires_at:string}):Promise<void>{
 const id=data.session_id,deadline=Math.min(Date.parse(data.expires_at),Date.now()+60000);
 try {
  if(!Number.isFinite(deadline)||deadline<=Date.now())return;
  if(!await Advertiser.isActive())throw new Error('Enable Bluetooth to help broadcast attendance.');
  Advertiser.setCompanyId(BLE_COMPANY_ID);
  while(Date.now()<deadline&&await campusBle.running(id)){
   const session=await secureStorage.session();
   if(!session||session.user.id!==data.user_id)break;
   const device=await secureStorage.deviceId(),requested=Date.now();
   let token;
   try{token=await getBleToken(session,id,device);}catch(e){
    if(e instanceof ApiError&&[401,403,409].includes(e.status))throw e;
    // Never keep broadcasting a packet while network authorization is unavailable.
    await Advertiser.stopBroadcast().catch(()=>{});await wait(500);continue;
   }
   const remaining=Math.min(token.valid_for_ms-(Date.now()-requested),deadline-Date.now(),10000);
   if(remaining<=0){await wait(100);continue;}
   if(!await campusBle.running(id))break;
   await bounded(Advertiser.broadcast(BLE_ADVERTISER_KEY,tokenBytes(token.token),{advertiseMode:2,txPowerLevel:3,connectable:false,includeDeviceName:false,includeTxPowerLevel:false,includeServiceUuid:false,timeout:Math.max(1,Math.floor(remaining))}),3000);
   await campusBle.publish(id,'broadcasting');
   await wait(Math.max(100,remaining-(Date.now()-requested)+100));
  }
 }catch(e){await campusBle.publish(id,'failed',e instanceof Error?e.message:'Bluetooth broadcasting failed. Open the app to retry.').catch(()=>{});}
 finally{if(await campusBle.running(id).catch(()=>false))await Advertiser.stopBroadcast().catch(()=>{});}
}
