import {PermissionsAndroid} from 'react-native';
import {requestPermissionsOnce} from '../src/permissions';
import {secureStorage} from '../src/native';
jest.mock('react-native',()=>({Platform:{OS:'android',Version:33},PermissionsAndroid:{PERMISSIONS:{CAMERA:'camera',BLUETOOTH_SCAN:'scan',BLUETOOTH_ADVERTISE:'advertise',BLUETOOTH_CONNECT:'connect',ACCESS_COARSE_LOCATION:'coarse',ACCESS_FINE_LOCATION:'fine',POST_NOTIFICATIONS:'notifications'},check:jest.fn(),requestMultiple:jest.fn().mockResolvedValue({})}}));
jest.mock('../src/native',()=>({secureStorage:{prompted:jest.fn(),markPrompted:jest.fn().mockResolvedValue(true)}}));
test('denied permissions are requested once and then reported for settings recovery',async()=>{
 jest.mocked(secureStorage.prompted).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
 const first=await requestPermissionsOnce(),second=await requestPermissionsOnce();
 expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledTimes(1);expect(secureStorage.markPrompted).toHaveBeenCalledTimes(1);
 expect(first.missing).toContain('Camera');expect(first.missing).toContain('Bluetooth scan');expect(first.missing).toContain('Precise location for Bluetooth proximity');expect(second.missing).toEqual(first.missing);expect(second.notificationsAllowed).toBe(false);
});
