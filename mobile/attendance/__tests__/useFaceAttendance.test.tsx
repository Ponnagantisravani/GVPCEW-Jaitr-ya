import React from 'react';
import {act,create} from 'react-test-renderer';
import {useFaceAttendance} from '../src/useFaceAttendance';
import {getAttendanceConfiguration,getOwnAttendance} from '../src/api';
import {campusFace} from '../src/native';
import {verifyFaceAttendance} from '../src/faceAttendance';
import {monotonicNow} from '../src/bleProtocol';
import type {BleReceipt,AttendanceRecord} from '../src/types';
jest.mock('../src/api',()=>({...jest.requireActual('../src/api'),getAttendanceConfiguration:jest.fn(),getOwnAttendance:jest.fn()}));
jest.mock('../src/native',()=>({campusFace:{prepare:jest.fn(),cancel:jest.fn().mockResolvedValue(true)}}));
jest.mock('../src/faceAttendance',()=>({verifyFaceAttendance:jest.fn()}));
const session={apiBase:'https://campus.example/api',token:'jwt',user:{id:'u',email:'a@b.com',fullName:'A',role:'student',roles:['student']}};
const active={id:'s',section_id:'section',period:'p',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'open' as const};
const config={student_id:'own-student',embedding_model:'mobilefacenet-v1' as const,package_name:'com.gvpcew.attendance',cloud_project_number:'123456789012'};
const expired=jest.fn();let state:ReturnType<typeof useFaceAttendance>;
function Probe({receipt}:{receipt:BleReceipt|null}){state=useFaceAttendance(session,active,'device',receipt,expired);return null;}
const receipt=()=>({sessionId:active.id,token:'a'.repeat(24),acceptedUntil:monotonicNow()+16000});
beforeEach(()=>{jest.clearAllMocks();jest.mocked(getAttendanceConfiguration).mockResolvedValue(config);jest.mocked(campusFace.prepare).mockResolvedValue(true);jest.mocked(getOwnAttendance).mockResolvedValue({record:null});jest.mocked(verifyFaceAttendance).mockResolvedValue({status:'PRESENT',method:'ble',is_late:false});});
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
