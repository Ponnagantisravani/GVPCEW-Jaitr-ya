import React from 'react';
import {act,create} from 'react-test-renderer';
import {useFaceAttendance} from '../src/useFaceAttendance';
import {getAttendanceConfiguration,getOwnAttendance} from '../src/api';
import {campusFace} from '../src/native';
import {verifyFaceAttendance} from '../src/faceAttendance';
import {monotonicNow} from '../src/bleProtocol';
import type {BleReceipt,AttendanceSession,AttendanceMethod} from '../src/types';
jest.mock('../src/api',()=>({...jest.requireActual('../src/api'),getAttendanceConfiguration:jest.fn(),getOwnAttendance:jest.fn()}));
jest.mock('../src/native',()=>({campusFace:{prepare:jest.fn(),cancel:jest.fn().mockResolvedValue(true)}}));
jest.mock('../src/faceAttendance',()=>({verifyFaceAttendance:jest.fn()}));
const session={apiBase:'https://campus.example/api',token:'jwt',user:{id:'u',email:'a@b.com',fullName:'A',role:'student',roles:['student']}};
const active={id:'s',section_id:'section',period:'p',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'open' as const};
const config={own_template:Array.from({length:192},(_,i)=>i===0?1:0),similarity_threshold:0.7,student_id:'own-student',embedding_model:'mobilefacenet-v1' as const,package_name:'com.gvpcew.attendance',cloud_project_number:'123456789012'};
const expired=jest.fn();let state:ReturnType<typeof useFaceAttendance>;
function Probe({receipt,attendance=active,method='ble',enabled=true}:{receipt:BleReceipt|null;attendance?:AttendanceSession;method?:AttendanceMethod|'closed';enabled?:boolean}){state=useFaceAttendance(session,attendance,'device',receipt,expired,method,enabled);return null;}
const receipt=()=>({sessionId:active.id,token:'a'.repeat(24),acceptedUntil:monotonicNow()+16000});
beforeEach(()=>{jest.clearAllMocks();jest.mocked(getAttendanceConfiguration).mockImplementation(async()=>({...config,own_template:[...config.own_template]}));jest.mocked(campusFace.prepare).mockResolvedValue(true);jest.mocked(getOwnAttendance).mockResolvedValue({record:null});jest.mocked(verifyFaceAttendance).mockResolvedValue({status:'PRESENT',method:'ble',is_late:false});});
test('automatically verifies after token only once per session, never before it',async()=>{
 let view:ReturnType<typeof create>;await act(async()=>{view=create(<Probe receipt={null}/>);});expect(verifyFaceAttendance).not.toHaveBeenCalled();
 await act(async()=>{view!.update(<Probe receipt={receipt()}/>);});expect(verifyFaceAttendance).toHaveBeenCalledTimes(1);expect(state.phase).toBe('success');
 await act(async()=>{view!.update(<Probe receipt={receipt()}/>);});expect(verifyFaceAttendance).toHaveBeenCalledTimes(1);await act(async()=>view!.unmount());
});
test('existing server attendance prevents another camera and uncertain submission recovers success',async()=>{
 jest.mocked(getOwnAttendance).mockResolvedValue({record:{status:'PRESENT',method:'ble',is_late:false}});let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<Probe receipt={receipt()}/>);});expect(verifyFaceAttendance).not.toHaveBeenCalled();expect(state.phase).toBe('success');await act(async()=>view!.unmount());
 jest.mocked(getOwnAttendance).mockResolvedValueOnce({record:null}).mockResolvedValue({record:{status:'PRESENT',method:'ble',is_late:false}});jest.mocked(verifyFaceAttendance).mockRejectedValue(new Error('Network timed out'));
 await act(async()=>{view=create(<Probe receipt={receipt()}/>);});expect(state.phase).toBe('success');expect(state.error).toBe('');await act(async()=>view!.unmount());
});
test('failed checks need an explicit retry, and unmount cancels native capture',async()=>{
 jest.mocked(verifyFaceAttendance).mockRejectedValue(new Error('Face mismatch'));let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<Probe receipt={receipt()}/>);});expect(state.phase).toBe('failed');expect(verifyFaceAttendance).toHaveBeenCalledTimes(1);
 await act(async()=>{view!.update(<Probe receipt={receipt()}/>);});expect(verifyFaceAttendance).toHaveBeenCalledTimes(1);
 jest.mocked(verifyFaceAttendance).mockResolvedValue({status:'PRESENT',method:'ble',is_late:false});await act(async()=>{state.retry();});expect(verifyFaceAttendance).toHaveBeenCalledTimes(2);expect(state.phase).toBe('success');await act(async()=>view!.unmount());expect(campusFace.cancel).toHaveBeenCalled();
});
test('integrity preparation failure cannot launch verification',async()=>{
 jest.mocked(campusFace.prepare).mockRejectedValue(new Error('Not certified'));let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<Probe receipt={receipt()}/>);});expect(state.phase).toBe('failed');expect(state.error).toBe('Not certified');expect(verifyFaceAttendance).not.toHaveBeenCalled();await act(async()=>view!.unmount());
});

test('late flow prepares securely but waits for an explicit tap and submits once without BLE',async()=>{
 const late={...active,status:'closed' as const,expires_at:new Date(Date.now()-1000).toISOString(),late_expires_at:new Date(Date.now()+120000).toISOString()};jest.mocked(verifyFaceAttendance).mockResolvedValue({status:'LATE',method:'fallback',is_late:true});let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<Probe attendance={late} method="fallback" receipt={null}/>);});expect(state.phase).toBe('ready');expect(verifyFaceAttendance).not.toHaveBeenCalled();
 await act(async()=>{state.startLate();state.startLate();});expect(verifyFaceAttendance).toHaveBeenCalledTimes(1);expect(verifyFaceAttendance).toHaveBeenCalledWith(session,late,'device',null,expect.objectContaining({student_id:config.student_id,similarity_threshold:config.similarity_threshold}),expect.any(Function),expect.any(Function),'fallback');expect(state.record?.status).toBe('LATE');await act(async()=>view!.unmount());
});
test('switching to the closed phase cancels an in-flight camera and ignores its stale result',async()=>{
 let complete!:(record:any)=>void,alive!:()=>boolean;jest.mocked(verifyFaceAttendance).mockImplementation(async(_s,_a,_d,_r,_c,_p,isAlive)=>{alive=isAlive;return new Promise(resolve=>{complete=resolve;});});let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<Probe receipt={receipt()}/>);});expect(alive()).toBe(true);
 await act(async()=>{view!.update(<Probe method="closed" receipt={null}/>);});expect(alive()).toBe(false);expect(state.phase).toBe('idle');expect(campusFace.cancel).toHaveBeenCalled();
 await act(async()=>{complete({status:'PRESENT',method:'ble',is_late:false});});expect(state.phase).toBe('idle');expect(state.record).toBe(null);await act(async()=>view!.unmount());
});

test('a BLE receipt cannot open the camera before the notification is tapped',async()=>{
 let view:ReturnType<typeof create>;await act(async()=>{view=create(<Probe receipt={receipt()} enabled={false}/>);});expect(verifyFaceAttendance).not.toHaveBeenCalled();
 await act(async()=>view!.update(<Probe receipt={receipt()} enabled/>));expect(verifyFaceAttendance).toHaveBeenCalledTimes(1);await act(async()=>view!.unmount());
});
test('face mismatch automatically retries three times and manual refresh cannot reset the budget',async()=>{
 jest.useFakeTimers();jest.mocked(verifyFaceAttendance).mockRejectedValue(new Error('Face not recognized, try again'));let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<Probe receipt={receipt()}/>);});expect(verifyFaceAttendance).toHaveBeenCalledTimes(1);expect(state.error).toBe('Face not recognized, try again');
 await act(async()=>{jest.advanceTimersByTime(1000);});expect(verifyFaceAttendance).toHaveBeenCalledTimes(2);
 await act(async()=>{jest.advanceTimersByTime(1000);});expect(verifyFaceAttendance).toHaveBeenCalledTimes(3);expect(state.error).toContain('Three attempts');
 await act(async()=>{state.retry();jest.advanceTimersByTime(1000);});expect(verifyFaceAttendance).toHaveBeenCalledTimes(3);
 await act(async()=>view!.unmount());jest.useRealTimers();
});
