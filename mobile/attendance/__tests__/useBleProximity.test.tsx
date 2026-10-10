import React from 'react';
import {act,create} from 'react-test-renderer';
import {AppState,Text,type AppStateStatus} from 'react-native';
import {useBleProximity} from '../src/useBleProximity';
import {ApiError,validateBleToken} from '../src/api';
let mockScanListener:((error:unknown,device:{manufacturerData:string;rssi:number})=>void)|undefined;
jest.mock('react-native-ble-plx',()=>({ScanMode:{LowLatency:2},BleManager:jest.fn().mockImplementation(()=>({state:jest.fn().mockResolvedValue('PoweredOn'),startDeviceScan:jest.fn(async(_ids,_options,listener)=>{mockScanListener=listener;}),stopDeviceScan:jest.fn().mockResolvedValue(undefined),destroy:jest.fn().mockResolvedValue(undefined)}))}));
jest.mock('../src/permissions',()=>({checkPermissions:jest.fn().mockResolvedValue({missing:[],notificationsAllowed:true})}));
jest.mock('../src/api',()=>({ApiError:jest.requireActual('../src/api').ApiError,validateBleToken:jest.fn()}));
const session={apiBase:'https://campus.example/api',token:'jwt',user:{id:'student',fullName:'Student',email:'student@example.com',role:'student',roles:['student']}};
let currentState:{cameraUnlocked:boolean}|undefined;
let view:ReturnType<typeof create>|undefined,appState:((state:AppStateStatus)=>void)|undefined;const expired=jest.fn();
// Stable session timestamps prevent render-driven scan restarts.
const attendance={id:'session',section_id:'section',period:'period',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),status:'open' as const};
function StableHarness(){const state=useBleProximity(session,attendance,'bound-device',expired);currentState=state;return <Text>{JSON.stringify({unlocked:state.cameraUnlocked,phase:state.phase,receipt:state.receipt})}</Text>;}
beforeEach(()=>{jest.useRealTimers();jest.clearAllMocks();mockScanListener=undefined;Object.defineProperty(AppState,'currentState',{value:'active',configurable:true,writable:true});jest.spyOn(AppState,'addEventListener').mockImplementation((_type,listener)=>{appState=listener;return {remove:jest.fn()};});});
afterEach(async()=>{if(view)await act(async()=>view!.unmount());view=undefined;jest.restoreAllMocks();});
test('weak signal unlocks only after the server verifies the caught token',async()=>{jest.mocked(validateBleToken).mockResolvedValue({accepted:true,valid_for_ms:5000,server_time:new Date().toISOString()});await act(async()=>{view=create(<StableHarness />);});expect(currentState!.cameraUnlocked).toBe(false);await act(async()=>{mockScanListener!(null,{manufacturerData:'//9HQwEAAQIDBAUGBwgJCgs=',rssi:-115});});expect(validateBleToken).toHaveBeenCalledWith(session,'session','bound-device','000102030405060708090a0b');expect(currentState!.cameraUnlocked).toBe(true);await act(async()=>appState!('background'));expect(currentState!.cameraUnlocked).toBe(false);});
test('other-section token rejected by server never unlocks camera',async()=>{jest.mocked(validateBleToken).mockRejectedValue(new ApiError('Wrong section',403));await act(async()=>{view=create(<StableHarness />);});await act(async()=>{mockScanListener!(null,{manufacturerData:'//9HQwEAAQIDBAUGBwgJCgs=',rssi:-30});});expect(currentState!.cameraUnlocked).toBe(false);expect(expired).not.toHaveBeenCalled();});
test('server receipt expiry relocks the camera without waiting for another advertisement',async()=>{jest.mocked(validateBleToken).mockResolvedValue({accepted:true,valid_for_ms:50,server_time:new Date().toISOString()});await act(async()=>{view=create(<StableHarness />);});await act(async()=>{mockScanListener!(null,{manufacturerData:'//9HQwEAAQIDBAUGBwgJCgs=',rssi:-100});});expect(currentState!.cameraUnlocked).toBe(true);await act(async()=>{await new Promise<void>(resolve=>setTimeout(()=>resolve(),350));});expect(currentState!.cameraUnlocked).toBe(false);});
