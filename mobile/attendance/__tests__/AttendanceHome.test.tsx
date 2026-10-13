import React from 'react';
import {act,create} from 'react-test-renderer';
import {AppState} from 'react-native';
import AttendanceHome from '../src/AttendanceHome';
import {getCurrentAttendance,getAttendanceStatus,getStartOptions,registerFcm,startAttendance} from '../src/api';
import {campusPush,campusBle} from '../src/native';
import {useFaceAttendance} from '../src/useFaceAttendance';
import {useBleProximity} from '../src/useBleProximity';
jest.mock('../src/api',()=>({ApiError:class extends Error{},getCurrentAttendance:jest.fn(),getAttendanceStatus:jest.fn(),getStartOptions:jest.fn(),registerFcm:jest.fn(),startAttendance:jest.fn()}));
jest.mock('../src/useFaceAttendance',()=>({useFaceAttendance:jest.fn()}));
jest.mock('../src/useBleProximity',()=>({useBleProximity:jest.fn()}));
jest.mock('../src/native',()=>({campusBle:{stop:jest.fn().mockResolvedValue(true),canAdvertise:jest.fn().mockResolvedValue(true),start:jest.fn().mockResolvedValue(true),status:jest.fn().mockResolvedValue({state:'stopped',session_id:null,message:''})},campusPush:{token:jest.fn(),event:jest.fn()}}));
const session={apiBase:'https://campus.example/api',token:'jwt',user:{id:'student',email:'student@example.com',fullName:'Student',role:'student',roles:['student']}};
const period={timetable_id:'period',section_id:'section',section_name:'A',subject_name:'DBMS',start_time:'09:00',end_time:'10:00',session_id:null,expires_at:null};
beforeEach(()=>{jest.useRealTimers();jest.clearAllMocks();jest.mocked(useFaceAttendance).mockReturnValue({phase:'ready',error:'',record:null,busy:false,retry:jest.fn(),startLate:jest.fn()});jest.mocked(useBleProximity).mockReturnValue({receipt:null,phase:'searching',error:'',retry:jest.fn(),cameraUnlocked:false});Object.defineProperty(AppState,'currentState',{value:'active',configurable:true,writable:true});jest.mocked(getCurrentAttendance).mockResolvedValue({session:null,phase:null,own_record:null,server_time:new Date().toISOString(),valid_for_ms:0});jest.mocked(getStartOptions).mockResolvedValue({periods:[period]});jest.mocked(campusPush.token).mockResolvedValue('fresh-token');jest.mocked(campusPush.event).mockResolvedValue(null);jest.mocked(registerFcm).mockResolvedValue({});});
test('student registers notifications and never gets coordinator start controls',async()=>{let view:ReturnType<typeof create>;await act(async()=>{view=create(<AttendanceHome session={session} deviceId="bound-device" notificationsAllowed onExpired={jest.fn()} />);});expect(registerFcm).toHaveBeenCalledWith(session,'bound-device','fresh-token',true);expect(getStartOptions).not.toHaveBeenCalled();expect(JSON.stringify(view!.toJSON())).not.toContain('Start 60-second attendance');await act(async()=>view!.unmount());});
test('assigned coordinator starts the listed period and sees the live countdown',async()=>{const coordinator={...session,user:{...session.user,roles:['student','student_coordinator']}};const active={id:'active-session',section_id:'section',period:'period',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'open' as const};jest.mocked(startAttendance).mockImplementation(async()=>{jest.mocked(getCurrentAttendance).mockResolvedValue({session:active,phase:'ble',own_record:null,server_time:new Date().toISOString(),valid_for_ms:60000});return {session:active};});jest.mocked(getAttendanceStatus).mockResolvedValue({id:active.id,status:'open',expires_at:active.expires_at,total:70,present:1,late:0});let view:ReturnType<typeof create>;await act(async()=>{view=create(<AttendanceHome session={coordinator} deviceId="bound-device" notificationsAllowed onExpired={jest.fn()} />);});await act(async()=>{view!.root.findAllByProps({accessibilityLabel:'Attendance time limit in seconds'}).find(node=>typeof node.props.onChangeText==='function')!.props.onChangeText('300');});const start=view!.root.findAllByProps({accessibilityLabel:'Start class attendance'}).find(button=>typeof button.props.onPress==='function');expect(start).toBeDefined();await act(async()=>{start!.props.onPress();});expect(startAttendance).toHaveBeenCalledTimes(1);expect(startAttendance).toHaveBeenCalledWith(coordinator,period,'bound-device',300);expect(JSON.stringify(view!.toJSON())).toContain('1 present · 0 late / 70 students');await act(async()=>view!.unmount());});

test('late window offers an explicit face check, stops broadcasting and leaves BLE scanning locked',async()=>{
 const active={id:'late-session',section_id:'section',period:'p',started_at:new Date(Date.now()-61000).toISOString(),expires_at:new Date(Date.now()-1000).toISOString(),late_expires_at:new Date(Date.now()+119000).toISOString(),status:'closed' as const};
 jest.mocked(getCurrentAttendance).mockResolvedValue({session:active,phase:'fallback',own_record:{status:'ABSENT',method:null,is_late:false},server_time:new Date().toISOString(),valid_for_ms:119000});jest.mocked(getAttendanceStatus).mockResolvedValue({id:active.id,status:'closed',expires_at:active.expires_at,total:70,present:60,late:1});let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<AttendanceHome session={session} deviceId="bound-device" notificationsAllowed onExpired={jest.fn()}/>);});expect(JSON.stringify(view!.toJSON())).toContain('Late check-in');expect(campusBle.stop).toHaveBeenCalled();expect(campusBle.start).not.toHaveBeenCalled();expect(useBleProximity).toHaveBeenLastCalledWith(session,null,'bound-device',expect.any(Function));
 const button=view!.root.findAllByProps({accessibilityLabel:'Start late face check'}).find(node=>typeof node.props.onPress==='function');expect(button).toBeDefined();await act(async()=>button!.props.onPress());expect(jest.mocked(useFaceAttendance).mock.results.at(-1)!.value.startLate).toHaveBeenCalledTimes(1);await act(async()=>view!.unmount());
});

test('manual face entry and tapped notification unlock the same session camera flow',async()=>{
 jest.useFakeTimers();const id='11111111-1111-4111-8111-111111111111';const active={id,section_id:'section',period:'p',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'open' as const};
 jest.mocked(getCurrentAttendance).mockResolvedValue({session:active,phase:'ble',own_record:null,server_time:new Date().toISOString(),valid_for_ms:60000});jest.mocked(getAttendanceStatus).mockResolvedValue({id,status:'open',expires_at:active.expires_at,total:70,present:0,late:0});
 for(const source of ['button','notification']){let view:ReturnType<typeof create>;await act(async()=>{view=create(<AttendanceHome session={session} deviceId="bound-device" notificationsAllowed onExpired={jest.fn()}/>);});expect(jest.mocked(useFaceAttendance).mock.calls.at(-1)![6]).toBe(false);
 if(source==='button'){const button=view!.root.findAllByProps({accessibilityLabel:'Start Face Verification'}).find(node=>typeof node.props.onPress==='function');expect(button).toBeDefined();await act(async()=>button!.props.onPress());}
 else{jest.mocked(campusPush.event).mockResolvedValue({type:'attendance_session',user_id:'student',section_id:'section',broadcast:'false',session_id:id,expires_at:active.expires_at,opened:'true'});await act(async()=>{jest.advanceTimersByTime(1000);});}
 expect(jest.mocked(useFaceAttendance).mock.calls.at(-1)![6]).toBe(true);expect(useBleProximity).toHaveBeenLastCalledWith(session,expect.objectContaining({id}),'bound-device',expect.any(Function));await act(async()=>view!.unmount());}
 jest.useRealTimers();
});

test('coordinator starts default attendance using only the assigned year and section',async()=>{
 const coordinator={...session,user:{...session.user,roles:['student','student_coordinator']}};
 const option={...period,timetable_id:'section',section_name:'3',subject_name:'Default attendance',default_attendance:true,year_number:2,start_time:'',end_time:''};
 jest.mocked(getStartOptions).mockResolvedValue({periods:[],default_option:option});
 jest.mocked(startAttendance).mockResolvedValue({session:{id:'default-session',section_id:'section',period:'default:session',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'open'}});
 let view:ReturnType<typeof create>;await act(async()=>{view=create(<AttendanceHome session={coordinator} deviceId="bound-device" notificationsAllowed onExpired={jest.fn()} />);});
 expect(JSON.stringify(view!.toJSON())).toContain('Year 2 · Section 3');expect(JSON.stringify(view!.toJSON())).not.toContain('DBMS');
 const start=view!.root.findAllByProps({accessibilityLabel:'Start class attendance'}).find(button=>typeof button.props.onPress==='function');expect(start).toBeDefined();await act(async()=>{start!.props.onPress();});
 expect(startAttendance).toHaveBeenCalledWith(coordinator,option,'bound-device',60);await act(async()=>view!.unmount());
});
