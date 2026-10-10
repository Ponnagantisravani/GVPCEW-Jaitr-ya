import {PermissionsAndroid, Platform} from 'react-native';
import type {Permission} from 'react-native';
import type {PermissionState} from './types';
import {secureStorage} from './native';
function required(): Array<{permission: Permission; label: string}> {
  const list: Array<{permission: Permission; label: string}> = [{permission: PermissionsAndroid.PERMISSIONS.CAMERA, label: 'Camera'}];
  if (Number(Platform.Version) >= 31) list.push({permission: PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, label: 'Bluetooth scan'}, {permission: PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE, label: 'Bluetooth broadcast'}, {permission: PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, label: 'Bluetooth access'});
  // Attendance infers location from BLE proximity, so neverForLocation is not asserted.
  list.push({permission: PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION, label: 'Location for Bluetooth proximity'}, {permission: PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, label: 'Precise location for Bluetooth proximity'});
  return list;
}
export async function checkPermissions(): Promise<PermissionState> {
  const missing: string[] = [];
  for (const item of required()) if (!await PermissionsAndroid.check(item.permission)) missing.push(item.label);
  const notificationsAllowed = Number(Platform.Version) < 33 || await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return {missing, notificationsAllowed};
}
export async function requestPermissionsOnce(): Promise<PermissionState> {
  if (!await secureStorage.prompted()) {
    await secureStorage.markPrompted();
    const list = required().map(item => item.permission);
    if (Number(Platform.Version) >= 33) list.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    await PermissionsAndroid.requestMultiple(list);
  }
  return checkPermissions();
}
