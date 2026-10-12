import {ApiError,getAttendanceChallenge,submitFaceAttendance} from './api';
import {campusFace} from './native';
import {monotonicNow} from './bleProtocol';
import {attendanceMilliseconds} from './attendancePolicy';
import type {AttendanceConfiguration,AttendanceRecord,AttendanceSession,AttendanceSubmission,BleReceipt,Session,AttendanceMethod} from './types';
export type VerificationPhase='idle'|'preparing'|'ready'|'capturing'|'checking'|'submitting'|'success'|'failed';
// Exact ordered JSON also hashed by mobileAttendancePolicy.requestHash on the server.
export function canonicalAttendance(id:string,p:Omit<AttendanceSubmission,'integrity_token'>,method:AttendanceMethod='ble'):string {
 return JSON.stringify([id,p.student_id,p.device_id,p.challenge_id,p.challenge_type,p.liveness_result,p.embedding_model,p.embedding,p.ble_token||null,p.timestamp,method]);
}
export async function verifyFaceAttendance(session:Session,attendance:AttendanceSession,deviceId:string,receipt:BleReceipt|null,config:AttendanceConfiguration,phase:(p:VerificationPhase)=>void,alive:()=>boolean,method:AttendanceMethod='ble'):Promise<AttendanceRecord> {
 let embedding:number[]|undefined;
 let deadline=method==='ble'?(receipt?.acceptedUntil||0):monotonicNow()+attendanceMilliseconds(attendance,'fallback');
 const expired=()=>method==='ble'?'The attendance token or challenge expired. Catch a fresh Bluetooth signal and retry.':'The late attendance challenge expired. Retry while the late window is open.';
 const check=()=>{if(!alive())throw new Error('Face verification interrupted.');if(monotonicNow()>=deadline)throw new Error(expired());};
 const bounded=async<T,>(operation:()=>Promise<T>):Promise<T>=>{
  check();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(expired())),Math.max(1,deadline-monotonicNow()));})]);}
  finally{if(timer)clearTimeout(timer);}
 };
 if(method==='ble'&&(!receipt||receipt.sessionId!==attendance.id||attendanceMilliseconds(attendance)<=0))throw new Error('Catch a valid token for this class attendance session.');
 if(method==='fallback'&&(attendanceMilliseconds(attendance)>0||attendanceMilliseconds(attendance,'fallback')<=0))throw new Error('Late attendance is available only after the main session closes, within its recovery window.');
 try {
  check();const requested=monotonicNow();
  const response=await bounded(()=>getAttendanceChallenge(session,attendance.id,deviceId,method==='ble'?receipt!.token:undefined,method));check();
  const received=monotonicNow(),challenge=response.challenge;
  if(challenge.challenge_type!=='blink'||!Number.isFinite(challenge.valid_for_ms)||!Number.isFinite(Date.parse(response.server_time)))throw new Error('The server returned an invalid face challenge.');
  deadline=Math.min(deadline,received+Math.max(0,challenge.valid_for_ms-(received-requested)),received+attendanceMilliseconds(attendance,method));
  check();phase('capturing');
  const capture=await bounded(()=>campusFace.capture(challenge.challenge_type,Math.min(6000,deadline-monotonicNow()),config.own_template,config.similarity_threshold).then(capture=>{if(!alive()||monotonicNow()>=deadline){capture.embedding.fill(0);throw new Error("Face challenge expired.");}return capture;}));embedding=capture.embedding;check();
  if(capture.challenge_type!==challenge.challenge_type)throw new Error('The captured challenge did not match this attempt.');
  const payload:Omit<AttendanceSubmission,'integrity_token'>={student_id:config.student_id,device_id:deviceId,challenge_id:challenge.id,challenge_type:challenge.challenge_type,liveness_result:true,embedding_model:capture.embedding_model,embedding,...(method==='ble'?{ble_token:receipt!.token}:{}),timestamp:new Date(Date.parse(response.server_time)+(monotonicNow()-received)).toISOString()};
  phase('checking');const token=await bounded(()=>campusFace.integrity(canonicalAttendance(attendance.id,payload,method)));check();
  if(!token)throw new Error('Play Integrity did not return a verification token.');
  phase('submitting');const result=await bounded(()=>submitFaceAttendance(session,attendance.id,{...payload,integrity_token:token},method));
  // A server success is authoritative, even if the local token timer just expired.
  if(!alive())throw new Error('Face verification interrupted.');
  if(result.status!==(method==='ble'?'PRESENT':'LATE')||result.method!==method||result.is_late!==(method==='fallback'))throw new ApiError('The server did not confirm attendance.',502);
  return result;
 } finally {embedding?.fill(0);void campusFace.cancel().catch(()=>{});}
}
