import {canonicalAttendance,verifyFaceAttendance} from '../src/faceAttendance';
import {getAttendanceChallenge,submitFaceAttendance} from '../src/api';
import {campusFace} from '../src/native';
import {monotonicNow} from '../src/bleProtocol';
import type {AttendanceCapture,AttendanceSubmission} from '../src/types';
jest.mock('../src/api',()=>({...jest.requireActual('../src/api'),getAttendanceChallenge:jest.fn(),submitFaceAttendance:jest.fn()}));
jest.mock('../src/native',()=>({campusFace:{capture:jest.fn(),integrity:jest.fn(),cancel:jest.fn().mockResolvedValue(true)}}));
const session={apiBase:'https://campus.example/api',token:'jwt',user:{id:'user',email:'a@b.com',fullName:'A',role:'student',roles:['student']}};
const active={id:'session',section_id:'section',period:'p',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'open' as const};
const config={own_template:Array.from({length:192},(_,i)=>i===0?1:0),similarity_threshold:0.7,student_id:'own-student',embedding_model:'mobilefacenet-v1' as const,package_name:'com.gvpcew.attendance',cloud_project_number:'123456789012'};
let capture:AttendanceCapture;
const receipt=()=>({sessionId:active.id,token:'a'.repeat(24),acceptedUntil:monotonicNow()+12000});
beforeEach(()=>{jest.useRealTimers();jest.clearAllMocks();capture={embedding_model:'mobilefacenet-v1',model_sha256:'sha',embedding:Array.from({length:192},(_,i)=>i===0?1:0),sample_count:3,liveness_result:true,challenge_type:'blink'};
 jest.mocked(getAttendanceChallenge).mockResolvedValue({challenge:{id:'challenge',challenge_type:'blink',expires_at:new Date(Date.now()+8000).toISOString(),valid_for_ms:8000},server_time:new Date().toISOString()});
 jest.mocked(campusFace.capture).mockResolvedValue(capture);jest.mocked(campusFace.integrity).mockResolvedValue('opaque-integrity-token');jest.mocked(submitFaceAttendance).mockResolvedValue({status:'PRESENT',method:'ble',is_late:false,similarity:.9});});
test('fresh challenge -> native capture -> exact integrity hash payload -> server confirmation; vectors wiped',async()=>{
 const phases:string[]=[];let submitted:AttendanceSubmission|undefined;
 jest.mocked(submitFaceAttendance).mockImplementation(async(_s,_id,p)=>{submitted=JSON.parse(JSON.stringify(p));return {status:'PRESENT',method:'ble',is_late:false};});
 const result=await verifyFaceAttendance(session,active,'bound-device',receipt(),config,p=>phases.push(p),()=>true);
 expect(phases).toEqual(['capturing','checking','submitting']);expect(getAttendanceChallenge).toHaveBeenCalledWith(session,active.id,'bound-device','a'.repeat(24),'ble');expect(campusFace.capture).toHaveBeenCalledWith('blink',expect.any(Number),config.own_template,config.similarity_threshold);
 expect(campusFace.integrity).toHaveBeenCalledWith(canonicalAttendance(active.id,submitted!));expect(submitted!.student_id).toBe(config.student_id);expect(submitted!.integrity_token).toBe('opaque-integrity-token');expect(Object.keys(submitted!)).not.toContain('preview');expect(Object.keys(submitted!)).not.toContain('matched');expect(result.status).toBe('PRESENT');expect(capture.embedding.every(v=>v===0)).toBe(true);
});
test('expired or another session token never opens the camera',async()=>{
 for(const r of [{...receipt(),acceptedUntil:monotonicNow()-1},{...receipt(),sessionId:'other'}])await expect(verifyFaceAttendance(session,active,'bound-device',r,config,()=>{},()=>true)).rejects.toThrow();
 expect(campusFace.capture).not.toHaveBeenCalled();expect(submitFaceAttendance).not.toHaveBeenCalled();
});
test('wrong capture challenge, integrity failure, and interrupted capture never submit',async()=>{
 capture.challenge_type='smile' as any;await expect(verifyFaceAttendance(session,active,'bound-device',receipt(),config,()=>{},()=>true)).rejects.toThrow('did not match');expect(submitFaceAttendance).not.toHaveBeenCalled();
 capture.challenge_type='blink';capture.embedding[0]=1;jest.mocked(campusFace.integrity).mockRejectedValue(new Error('Integrity denied'));
 await expect(verifyFaceAttendance(session,active,'bound-device',receipt(),config,()=>{},()=>true)).rejects.toThrow('Integrity denied');expect(submitFaceAttendance).not.toHaveBeenCalled();expect(capture.embedding.every(v=>v===0)).toBe(true);
 let alive=true;capture.embedding[0]=1;jest.mocked(campusFace.capture).mockImplementation(async()=>{alive=false;return capture;});
 await expect(verifyFaceAttendance(session,active,'bound-device',receipt(),config,()=>{},()=>alive)).rejects.toThrow();expect(capture.embedding.every(v=>v===0)).toBe(true);expect(submitFaceAttendance).not.toHaveBeenCalled();
});
test('canonical hash covers every identity and embedding value in server order',()=>{
 const p={student_id:'s',device_id:'d',challenge_id:'c',challenge_type:'blink' as const,liveness_result:true as const,embedding_model:'mobilefacenet-v1' as const,embedding:[1,.123456789,-.3],ble_token:'t',timestamp:'date'};
 expect(canonicalAttendance('id',p)).toBe(JSON.stringify(['id','s','d','c','blink',true,'mobilefacenet-v1',[1,.123456789,-.3],'t','date','ble']));expect(canonicalAttendance('id',{...p,embedding:[1,.123456788,-.3]})).not.toBe(canonicalAttendance('id',p));
});

test('shared serialization fixture matches the backend and native digest inputs',()=>{const fixture=require('./fixtures/attendance-hash.json');expect(canonicalAttendance(fixture.session_id,fixture.payload)).toBe(fixture.canonical);});

test('late verification uses a fresh challenge without BLE, hashes fallback, confirms LATE and wipes vectors',async()=>{
 const late={...active,status:'closed' as const,expires_at:new Date(Date.now()-1000).toISOString(),late_expires_at:new Date(Date.now()+120000).toISOString()};let submitted:AttendanceSubmission|undefined;
 jest.mocked(submitFaceAttendance).mockImplementation(async(_s,_id,p,method)=>{expect(method).toBe('fallback');submitted=JSON.parse(JSON.stringify(p));return {status:'LATE',method:'fallback',is_late:true};});
 const result=await verifyFaceAttendance(session,late,'bound-device',null,config,()=>{},()=>true,'fallback');
 expect(getAttendanceChallenge).toHaveBeenCalledWith(session,late.id,'bound-device',undefined,'fallback');expect(submitted).not.toHaveProperty('ble_token');expect(campusFace.integrity).toHaveBeenCalledWith(canonicalAttendance(late.id,submitted!,'fallback'));expect(JSON.parse(canonicalAttendance(late.id,submitted!,'fallback')).slice(-3)).toEqual([null,submitted!.timestamp,'fallback']);expect(result.status).toBe('LATE');expect(capture.embedding.every(v=>v===0)).toBe(true);
});
test('late checks cannot run before closure or after recovery expiry',async()=>{
 for(const late of [{...active,late_expires_at:new Date(Date.now()+180000).toISOString()},{...active,expires_at:new Date(Date.now()-120000).toISOString(),late_expires_at:new Date(Date.now()-1).toISOString()}])await expect(verifyFaceAttendance(session,late,'bound-device',null,config,()=>{},()=>true,'fallback')).rejects.toThrow('Late attendance');
 expect(campusFace.capture).not.toHaveBeenCalled();expect(getAttendanceChallenge).not.toHaveBeenCalled();
});

test('a native face mismatch after blinking never requests integrity or submits attendance',async()=>{
 jest.mocked(campusFace.capture).mockRejectedValue(new Error('Face not recognized, try again'));
 await expect(verifyFaceAttendance(session,active,'bound-device',receipt(),config,()=>{},()=>true)).rejects.toThrow('Face not recognized, try again');
 expect(campusFace.integrity).not.toHaveBeenCalled();expect(submitFaceAttendance).not.toHaveBeenCalled();expect(campusFace.cancel).toHaveBeenCalled();
});
