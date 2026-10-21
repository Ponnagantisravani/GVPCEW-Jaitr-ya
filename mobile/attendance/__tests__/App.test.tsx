import React from 'react';
import {Alert} from 'react-native';
import {act,create} from 'react-test-renderer';
import App from '../App';
jest.mock('../src/NativePortal',()=>()=>null);
jest.mock('../src/NativeLoginPortal',()=>()=>{const {Text}=require('react-native');return <Text>Campus Portal Sign In</Text>;});
jest.mock('react-native-safe-area-context',()=>{const {View}=require('react-native');return {SafeAreaProvider:View,SafeAreaView:View};});
beforeAll(()=>jest.useRealTimers());
jest.mock('../src/AttendanceHome',()=>()=>{const {Text}=require('react-native');return <Text>Attendance dashboard</Text>;});
jest.mock('../src/api',()=>({...jest.requireActual('../src/api'),getEnrollmentStatus:jest.fn(),submitEnrollment:jest.fn(),login:jest.fn(),resetOwnEnrollment:jest.fn()}));
jest.mock('../src/native',()=>({secureStorage:{deviceId:jest.fn().mockResolvedValue('device'),session:jest.fn().mockResolvedValue(null),save:jest.fn().mockResolvedValue(true),clear:jest.fn().mockResolvedValue(true)},captureEnrollment:jest.fn(),campusPush:{clear:jest.fn().mockResolvedValue(true)}}));
jest.mock('../src/permissions',()=>({checkPermissions:jest.fn().mockResolvedValue({missing:[],notificationsAllowed:true}),requestPermissionsOnce:jest.fn()}));
test('first launch opens the real campus portal sign-in',async()=>{let view: ReturnType<typeof create>;await act(async()=>{view=create(<App />);});expect(JSON.stringify(view!.toJSON())).toContain('Campus Portal Sign In');expect(JSON.stringify(view!.toJSON())).not.toContain('You’re ready');await act(async()=>view!.unmount());});

import {getEnrollmentStatus,submitEnrollment,login,resetOwnEnrollment} from '../src/api';
import {secureStorage,captureEnrollment} from '../src/native';
import {requestPermissionsOnce} from '../src/permissions';
const account={apiBase:'https://campus.example/api',token:'jwt',user:{id:'u',fullName:'Student',email:'student@campus.example',role:'student',roles:['student']}};
const enrolled={student_id:'s',face_enrolled:true,embedding_model:'mobilefacenet-v1',enrollment_status:'approved' as const,setup_required:false,approved:true,bound_device_id:'device'};
test('restored login blocks dashboard until face flag is read, then opens registration for false',async()=>{
 let resolveStatus!:(value:any)=>void;jest.mocked(secureStorage.session).mockResolvedValue(account);jest.mocked(getEnrollmentStatus).mockImplementation(()=>new Promise(resolve=>{resolveStatus=resolve;}));let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<App/>);});expect(JSON.stringify(view!.toJSON())).not.toContain('Attendance dashboard');
 await act(async()=>resolveStatus({...enrolled,face_enrolled:false,enrollment_status:'required',bound_device_id:null}));expect(JSON.stringify(view!.toJSON())).toContain('Register your face');expect(JSON.stringify(view!.toJSON())).not.toContain('Attendance dashboard');
 await act(async()=>view!.unmount());jest.mocked(secureStorage.session).mockResolvedValue(null);
});
test('enrolled login bypasses registration, while reset requires numeric-only capture and automatic save',async()=>{
 jest.mocked(secureStorage.session).mockResolvedValue(account);jest.mocked(getEnrollmentStatus).mockResolvedValue(enrolled);let view:ReturnType<typeof create>;
 await act(async()=>{view=create(<App/>);});expect(JSON.stringify(view!.toJSON())).toContain('Attendance dashboard');expect(JSON.stringify(view!.toJSON())).not.toContain('Register your face');await act(async()=>view!.unmount());
 jest.mocked(getEnrollmentStatus).mockResolvedValue({...enrolled,face_enrolled:false,enrollment_status:'required',bound_device_id:null});jest.mocked(requestPermissionsOnce).mockResolvedValue({missing:[],notificationsAllowed:true});
 const capture={embedding_model:'mobilefacenet-v1' as const,model_sha256:'sha',embedding:Array(192).fill(.1),sample_count:5};jest.mocked(captureEnrollment).mockResolvedValue(capture);
 jest.mocked(submitEnrollment).mockImplementation(async()=>{jest.mocked(getEnrollmentStatus).mockResolvedValue(enrolled);return {student_id:'s',enrollment_status:'approved'};});
 await act(async()=>{view=create(<App/>);});const checkbox=view!.root.findAllByProps({accessibilityRole:'checkbox'}).find(n=>typeof n.props.onPress==='function')!;await act(async()=>checkbox.props.onPress());
 const button=view!.root.findAllByProps({title:'Register face'}).find(n=>typeof n.props.onPress==='function')!;await act(async()=>button.props.onPress());
 expect(submitEnrollment).toHaveBeenCalledWith(account,capture,'device');expect(JSON.stringify(view!.toJSON())).toContain('Attendance dashboard');expect(capture.embedding.every(v=>v===0)).toBe(true);await act(async()=>view!.unmount());jest.mocked(secureStorage.session).mockResolvedValue(null);
});

test('coordinator account can open its attendance and other assigned dashboards',async()=>{const coordinator={...account,user:{...account.user,email:'324103210170.sravani@gvpcew.ac.in',roles:['student','student_coordinator','admin']}};jest.mocked(secureStorage.session).mockResolvedValue(coordinator);jest.mocked(getEnrollmentStatus).mockResolvedValue(enrolled);let view:ReturnType<typeof create>;await act(async()=>{view=create(<App/>);});const html=JSON.stringify(view!.toJSON());expect(html).toContain('Student coordinator attendance');expect(html).toContain('Attendance dashboard');expect(html).toContain('Open Student dashboard');expect(html).toContain('Open Student coordinator dashboard');expect(html).toContain('Open Administrator dashboard');await act(async()=>view!.unmount());jest.mocked(secureStorage.session).mockResolvedValue(null);});

test('a changed device blocks native attendance even when the face flag is true',async()=>{jest.mocked(secureStorage.session).mockResolvedValue(account);jest.mocked(getEnrollmentStatus).mockResolvedValue({...enrolled,bound_device_id:'original-installation'});let view:ReturnType<typeof create>;await act(async()=>{view=create(<App/>);});const html=JSON.stringify(view!.toJSON());expect(html).toContain('Phone verification required');expect(html).not.toContain('Attendance dashboard');expect(html).not.toContain('Register your face');await act(async()=>view!.unmount());jest.mocked(secureStorage.session).mockResolvedValue(null);});

test('admin-enabled account can confirm a reset of only its own enrollment',async()=>{const admin={...account,user:{...account.user,roles:['student','student_coordinator','admin']}};jest.mocked(secureStorage.session).mockResolvedValue(admin);jest.mocked(getEnrollmentStatus).mockResolvedValue({...enrolled,bound_device_id:'old-installation'});const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});jest.mocked(resetOwnEnrollment).mockImplementation(async()=>{jest.mocked(getEnrollmentStatus).mockResolvedValue({...enrolled,face_enrolled:false,enrollment_status:'required',bound_device_id:null});return {enrollment_status:'required'};});let view:ReturnType<typeof create>;await act(async()=>{view=create(<App/>);});const button=view!.root.findAllByProps({title:'Reset my face registration'}).find(n=>typeof n.props.onPress==='function')!;await act(async()=>button.props.onPress());expect(resetOwnEnrollment).not.toHaveBeenCalled();const buttons=alert.mock.calls[0][2]!;await act(async()=>buttons.find(b=>b.text==='Reset registration')!.onPress!());expect(resetOwnEnrollment).toHaveBeenCalledWith(admin,'s');expect(JSON.stringify(view!.toJSON())).toContain('Register your face');await act(async()=>view!.unmount());alert.mockRestore();jest.mocked(secureStorage.session).mockResolvedValue(null);});
