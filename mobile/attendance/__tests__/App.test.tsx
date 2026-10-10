import React from 'react';
import {act,create} from 'react-test-renderer';
import App from '../App';
jest.mock('react-native-safe-area-context',()=>{const {View}=require('react-native');return {SafeAreaProvider:View,SafeAreaView:View};});
beforeAll(()=>jest.useRealTimers());
jest.mock('../src/AttendanceHome',()=>()=>null);
jest.mock('../src/native',()=>({secureStorage:{deviceId:jest.fn().mockResolvedValue('device'),session:jest.fn().mockResolvedValue(null),clear:jest.fn().mockResolvedValue(true)},captureEnrollment:jest.fn()}));
jest.mock('../src/permissions',()=>({checkPermissions:jest.fn().mockResolvedValue({missing:[],notificationsAllowed:true}),requestPermissionsOnce:jest.fn()}));
test('first launch shows assigned-credential login',async()=>{let view: ReturnType<typeof create>;await act(async()=>{view=create(<App />);});expect(JSON.stringify(view!.toJSON())).toContain('Welcome to campus');expect(JSON.stringify(view!.toJSON())).not.toContain('You’re ready');await act(async()=>view!.unmount());});
