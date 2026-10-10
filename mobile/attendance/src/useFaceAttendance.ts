import {useCallback,useEffect,useRef,useState} from 'react';
import {ApiError,getAttendanceConfiguration,getOwnAttendance} from './api';
import {campusFace} from './native';
import {monotonicNow} from './bleProtocol';
import {verifyFaceAttendance} from './faceAttendance';
import type {VerificationPhase} from './faceAttendance';
import type {AttendanceConfiguration,AttendanceRecord,AttendanceSession,BleReceipt,Session} from './types';
export function useFaceAttendance(session:Session,attendance:AttendanceSession|null,deviceId:string,receipt:BleReceipt|null,onExpired:()=>void){
 const [phase,setPhase]=useState<VerificationPhase>('idle'),[error,setError]=useState(''),[record,setRecord]=useState<AttendanceRecord|null>(null);
 const [ready,setReady]=useState<string|null>(null),[retryCount,setRetryCount]=useState(0);
 const config=useRef<AttendanceConfiguration|null>(null),attempted=useRef<string|null>(null),inFlight=useRef(false),generation=useRef(0);
 const latest=useRef({session,attendance,deviceId,receipt,onExpired});latest.current={session,attendance,deviceId,receipt,onExpired};
 useEffect(()=>{
  const version=++generation.current;let alive=true;
  attempted.current=null;inFlight.current=false;config.current=null;setReady(null);setRecord(null);setError('');setPhase('preparing');
  void (async()=>{
   try {
    if(attendance){
     const own=(await getOwnAttendance(session,attendance.id,deviceId)).record;if(!alive)return;
     if(own?.status==='PRESENT'||own?.status==='LATE'){setRecord(own);attempted.current=attendance.id;setPhase('success');setReady(attendance.id);return;}
    }
    const c=await getAttendanceConfiguration(session,deviceId);
    if(!alive)return;
    if(c.embedding_model!=='mobilefacenet-v1'||!c.student_id||c.package_name!=='com.gvpcew.attendance'||!/^[1-9][0-9]{5,17}$/.test(c.cloud_project_number))throw new Error('Campus attendance verification is not configured for this app.');
    await campusFace.prepare(c.cloud_project_number);if(!alive)return;
    config.current=c;setPhase('ready');
    setReady(attendance?.id||'no-session');
   }catch(e){if(alive){setPhase('failed');setError(e instanceof Error?e.message:'Unable to prepare face attendance.');if(e instanceof ApiError&&e.status===401)onExpired();}}
  })();
  return()=>{alive=false;if(generation.current===version)generation.current++;void campusFace.cancel().catch(()=>{});};
 },[session,deviceId,attendance?.id,retryCount,onExpired]);
 const start=useCallback(async()=>{
  const snapshot=latest.current,c=config.current;
  if(!snapshot.attendance||!snapshot.receipt||!c||ready!==snapshot.attendance.id||inFlight.current||attempted.current===snapshot.attendance.id||snapshot.receipt.acceptedUntil<=monotonicNow())return;
  const id=snapshot.attendance.id,version=generation.current;
  inFlight.current=true;attempted.current=id;setError('');
  const alive=()=>generation.current===version;
  try {
   const result=await verifyFaceAttendance(snapshot.session,snapshot.attendance,snapshot.deviceId,snapshot.receipt,c,p=>{if(alive())setPhase(p);},alive);
   if(alive()){setRecord(result);setPhase('success');}
  }catch(e){
   if(!alive())return;
   if(e instanceof ApiError&&e.status===401){snapshot.onExpired();return;}
   // A connection timeout can happen after the server commits. Recover before offering another camera attempt.
   try {const own=(await getOwnAttendance(snapshot.session,id,snapshot.deviceId)).record;if(!alive())return;if(own?.status==='PRESENT'||own?.status==='LATE'){setRecord(own);setPhase('success');return;}}
   catch(recovery){if(recovery instanceof ApiError&&recovery.status===401){snapshot.onExpired();return;}}
   if(alive()){setPhase('failed');setError(e instanceof Error?e.message:'Face verification failed. Retry while attendance is open.');}
  }finally{if(alive())inFlight.current=false;}
 },[ready]);
 useEffect(()=>{if(receipt&&attendance&&ready===attendance.id&&phase==='ready')void start();},[receipt,attendance?.id,ready,phase,start]);
 return {phase,error,record,busy:['preparing','capturing','checking','submitting'].includes(phase),retry:()=>{if(!inFlight.current)setRetryCount(value=>value+1);}};
}
