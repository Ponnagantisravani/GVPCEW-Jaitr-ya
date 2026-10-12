import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {BleManager,ScanMode} from 'react-native-ble-plx';
import {ApiError,validateBleToken} from './api';
import {attendanceMilliseconds} from './attendancePolicy';
import {checkPermissions} from './permissions';
import {decodeManufacturerData,scanPhase,monotonicNow} from './bleProtocol';
import type {AttendanceSession,BleReceipt,Session} from './types';
export function useBleProximity(session:Session,attendance:AttendanceSession|null,deviceId:string,onExpired:()=>void){
 const [attempt,setAttempt]=useState(0);
 const [receipt,setReceipt]=useState<BleReceipt|null>(null),[phase,setPhase]=useState<ReturnType<typeof scanPhase>>('searching'),[error,setError]=useState('');
 useEffect(()=>{
  setReceipt(null);setError('');setPhase('searching');
  if(!attendance||attendanceMilliseconds(attendance)<=0)return;
  const id=attendance.id;let alive=true,checking=false,lastRequest=-Infinity,accepted:BleReceipt|null=null;
  const seen=new Map<string,number>();const start=Date.now(),manager=new BleManager();
  const stop=()=>{alive=false;accepted=null;void manager.stopDeviceScan().catch(()=>{});};
  const subscription=AppState.addEventListener('change',state=>{if(state!=='active'){stop();setReceipt(null);}else setAttempt(value=>value+1);});
  const timer=setInterval(()=>{
   if(!alive)return;
   if(Date.parse(attendance.expires_at)<=Date.now()){stop();setReceipt(null);return;}
   if(accepted&&accepted.acceptedUntil<=monotonicNow()){accepted=null;setReceipt(null);}
   setPhase(scanPhase(Date.now()-start,!!accepted));
  },250);
  void (async()=>{
   try{
    const permissions=await checkPermissions();
    const missing=permissions.missing.filter(label=>label!=='Camera');
    if(missing.length)throw new Error('Enable '+missing.join(', ')+' in app settings.');
    if(await manager.state()!=='PoweredOn')throw new Error('Enable Bluetooth and location services, then refresh attendance.');
    if(!alive)return;
    await manager.startDeviceScan(null,{scanMode:ScanMode.LowLatency,allowDuplicates:true},(scanError,device)=>{
     if(!alive)return;
     if(scanError){setError('Bluetooth scan failed. Check Bluetooth, location services and app permissions, then refresh attendance.');stop();return;}
     // No RSSI gate: even a weak valid classroom advertisement is eligible.
     const token=decodeManufacturerData(device?.manufacturerData);
     if(!token||checking||monotonicNow()-lastRequest<500)return;
     const retryAt=seen.get(token);if(retryAt!==undefined&&retryAt>monotonicNow())return;
     checking=true;lastRequest=monotonicNow();const requested=monotonicNow();
     void validateBleToken(session,id,deviceId,token).then(result=>{
      if(!alive||result.accepted!==true)return;
      const validFor=Math.max(0,result.valid_for_ms-(monotonicNow()-requested));
      if(validFor<=0)return;
      accepted={sessionId:id,token,acceptedUntil:monotonicNow()+validFor};setReceipt(accepted);setPhase('verified');setError('');
      seen.set(token,accepted.acceptedUntil);
     }).catch(e=>{
      if(!alive)return;
      if(e instanceof ApiError&&e.status===401){stop();onExpired();return;}
      // Other sections' valid-looking packets never unlock the camera or replace a valid receipt.
      seen.set(token,monotonicNow()+(e instanceof ApiError&&e.status===403?16000:1500));
      if(!(e instanceof ApiError&&e.status===403))setError('Could not verify the Bluetooth signal. Check your connection; scanning continues.');
     }).finally(()=>{checking=false;if(seen.size>64)seen.delete(seen.keys().next().value!);});
    });
   }catch(e){if(alive){setError(e instanceof Error?e.message:'Bluetooth is unavailable.');stop();}}
  })();
  return()=>{stop();clearInterval(timer);subscription.remove();void manager.destroy().catch(()=>{});};
 },[session,attendance?.id,attendance?.expires_at,deviceId,onExpired,attempt]);
 return {receipt,phase,error,retry:()=>setAttempt(value=>value+1),cameraUnlocked:!!receipt&&receipt.acceptedUntil>monotonicNow()};
}
