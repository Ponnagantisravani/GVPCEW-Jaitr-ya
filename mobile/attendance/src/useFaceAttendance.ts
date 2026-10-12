import {useCallback,useEffect,useRef,useState} from 'react';
import {ApiError,getAttendanceConfiguration,getOwnAttendance} from './api';
import {campusFace} from './native';
import {monotonicNow} from './bleProtocol';
import {attendanceMilliseconds} from './attendancePolicy';
import {verifyFaceAttendance} from './faceAttendance';
import type {VerificationPhase} from './faceAttendance';
import type {AttendanceConfiguration,AttendanceRecord,AttendanceSession,BleReceipt,Session,AttendanceMethod} from './types';
export function useFaceAttendance(session:Session,attendance:AttendanceSession|null,deviceId:string,receipt:BleReceipt|null,onExpired:()=>void,method:AttendanceMethod|'closed'='ble',cameraEnabled=true){
 const [phase,setPhase]=useState<VerificationPhase>('idle'),[error,setError]=useState(''),[record,setRecord]=useState<AttendanceRecord|null>(null);
 const [ready,setReady]=useState<string|null>(null),[retryCount,setRetryCount]=useState(0);
 const config=useRef<AttendanceConfiguration|null>(null),attempted=useRef<string|null>(null),inFlight=useRef(false),generation=useRef(0);
 const attempts=useRef(new Map<string,number>()),retryTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const latest=useRef({session,attendance,deviceId,receipt,onExpired,method,cameraEnabled});latest.current={session,attendance,deviceId,receipt,onExpired,method,cameraEnabled};
 useEffect(()=>{
  const version=++generation.current;let alive=true;
  attempted.current=null;inFlight.current=false;config.current?.own_template?.fill(0);config.current=null;setReady(null);setRecord(null);setError('');setPhase('preparing');
  void (async()=>{
   try {
    if(attendance){
     const own=(await getOwnAttendance(session,attendance.id,deviceId)).record;if(!alive)return;
     if(own?.status==='PRESENT'||own?.status==='LATE'){setRecord(own);attempted.current=attendance.id;setPhase('success');setReady(attendance.id);return;}
    }
    if(!attendance||method==='closed'){setPhase('idle');return;}
    const c=await getAttendanceConfiguration(session,deviceId);
    if(!alive){c.own_template?.fill(0);return;}
    if(!Array.isArray(c.own_template)||c.own_template.length!==192||!c.own_template.every(Number.isFinite)||!c.own_template.some(v=>v!==0)||!Number.isFinite(c.similarity_threshold)||c.similarity_threshold<=0||c.similarity_threshold>=1||c.embedding_model!=='mobilefacenet-v1'||!c.student_id||c.package_name!=='com.gvpcew.attendance'||!/^[1-9][0-9]{5,17}$/.test(c.cloud_project_number))throw new Error('Campus attendance verification is not configured for this app.');
    config.current=c;
    await campusFace.prepare(c.cloud_project_number);if(!alive){c.own_template.fill(0);return;}
    config.current=c;setPhase('ready');
    setReady(attendance?.id||'no-session');
   }catch(e){if(alive){config.current?.own_template?.fill(0);config.current=null;setPhase('failed');setError(e instanceof Error?e.message:'Unable to prepare face attendance.');if(e instanceof ApiError&&e.status===401)onExpired();}}
  })();
  return()=>{alive=false;if(retryTimer.current)clearTimeout(retryTimer.current);config.current?.own_template?.fill(0);config.current=null;if(generation.current===version)generation.current++;void campusFace.cancel().catch(()=>{});};
 },[session,deviceId,attendance?.id,retryCount,onExpired,method]);
 const start=useCallback(async()=>{
  const snapshot=latest.current,c=config.current;
  if(!snapshot.attendance||snapshot.method==='closed'||!c||ready!==snapshot.attendance.id||inFlight.current||attempted.current===snapshot.attendance.id)return;
  if(snapshot.method==='ble'&&(!snapshot.cameraEnabled||!snapshot.receipt||snapshot.receipt.acceptedUntil<=monotonicNow()))return;
  if(snapshot.method==='fallback'&&(attendanceMilliseconds(snapshot.attendance)>0||attendanceMilliseconds(snapshot.attendance,'fallback')<=0))return;
  const id=snapshot.attendance.id,version=generation.current;
  const key=snapshot.session.user.id+':'+id+':'+snapshot.method,used=attempts.current.get(key)||0;
  if(used>=3){setPhase('failed');setError('Three face attempts have been used for this session.');return;}
  attempts.current.set(key,used+1);
  inFlight.current=true;attempted.current=id;setError('');
  const alive=()=>generation.current===version;
  try {
   const result=await verifyFaceAttendance(snapshot.session,snapshot.attendance,snapshot.deviceId,snapshot.receipt,c,p=>{if(alive())setPhase(p);},alive,snapshot.method);
   if(alive()){config.current?.own_template?.fill(0);setRecord(result);setPhase('success');}
  }catch(e){
   if(!alive())return;
   if(e instanceof ApiError&&e.status===401){snapshot.onExpired();return;}
   // A connection timeout can happen after the server commits. Recover before offering another camera attempt.
   try {const own=(await getOwnAttendance(snapshot.session,id,snapshot.deviceId)).record;if(!alive())return;if(own?.status==='PRESENT'||own?.status==='LATE'){config.current?.own_template?.fill(0);setRecord(own);setPhase('success');return;}}
   catch(recovery){if(recovery instanceof ApiError&&recovery.status===401){snapshot.onExpired();return;}}
   if(alive()){
    const mismatch=e instanceof Error&&e.message==='Face not recognized, try again';
    setPhase('failed');setError(mismatch&&used+1>=3?'Face not recognized, try again. Three attempts used.':e instanceof Error?e.message:'Face verification failed. Retry while attendance is open.');
    if(mismatch&&used+1<3&&attendanceMilliseconds(snapshot.attendance,snapshot.method)>0){
     retryTimer.current=setTimeout(()=>{if(alive())setRetryCount(value=>value+1);},1000);
    }
   }
  }finally{if(alive())inFlight.current=false;}
 },[ready]);
 useEffect(()=>{if(cameraEnabled&&method==='ble'&&receipt&&attendance&&ready===attendance.id&&phase==='ready')void start();},[receipt,attendance?.id,ready,phase,start,method,cameraEnabled]);
 return {phase,error,record,startLate:()=>{if(method==='fallback'&&phase==='ready')void start();},busy:['preparing','capturing','checking','submitting'].includes(phase),retry:()=>{if(!inFlight.current)setRetryCount(value=>value+1);}};
}
