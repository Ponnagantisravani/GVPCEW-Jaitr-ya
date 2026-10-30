import {campusRequest} from './native';
import type {CampusUser, EnrollmentCapture, EnrollmentStatus, Session, AttendanceSession, StartPeriod, AttendanceStatus, BleToken, AttendanceConfiguration, AttendanceChallenge, AttendanceSubmission, AttendanceRecord, AttendanceMethod, AttendanceCurrent, SubjectStartOptions} from './types';
import {validateApiBase} from './enrollmentPolicy';
import {portalRoles} from './portal';
export class ApiError extends Error {constructor(message: string, public status: number) {super(message);}}
async function call<T>(apiBase: string, route: string, token?: string, body?: unknown): Promise<T> {
  const response = await campusRequest(validateApiBase(apiBase), route, token, body);
  let json: {message?: string} = {};
  try {json = JSON.parse(response.body);} catch {throw new ApiError('The campus server returned an invalid response.', response.status);}
  if (response.status < 200 || response.status >= 300) throw new ApiError(json.message || 'The campus server could not complete the request.', response.status);
  return json as T;
}
export async function login(apiBase: string, email: string, password: string): Promise<Session> {
  const base = validateApiBase(apiBase);
  const result = await call<{token: string; user: CampusUser}>(base, '/auth/login', undefined, {email: email.trim().toLowerCase(), password, client: 'mobile', rememberDevice: true});
  if (!result.token || !result.user?.roles || !result.user.roles.some(role=>role in portalRoles)) throw new Error('This account does not have a supported campus dashboard role.');
  return {...result, apiBase: base};
}
export const getEnrollmentStatus = (session: Session) => call<EnrollmentStatus>(session.apiBase, '/mobile/enrollment/status', session.token);
export async function submitEnrollment(session: Session, capture: EnrollmentCapture, deviceId: string) {
  return call<{student_id: string; enrollment_status: string}>(session.apiBase, '/mobile/enrollment/setup', session.token, {consent: true, device_id: deviceId, embedding_model: capture.embedding_model, model_sha256: capture.model_sha256, embedding: capture.embedding, sample_count: capture.sample_count});
}
export const logout = (session: Session) => call(session.apiBase, '/auth/logout', session.token, {});

export const registerFcm = (session: Session, deviceId: string, token: string, canAdvertise?: boolean) => call(session.apiBase, '/devices/register-fcm', session.token, {device_id: deviceId, fcm_token: token, ...(canAdvertise===undefined?{}:{can_advertise:canAdvertise})});
export const unregisterFcm = (session: Session, deviceId: string) => call(session.apiBase, '/devices/unregister-fcm', session.token, {device_id: deviceId});
export const getStartOptions = (session: Session) => call<{periods: StartPeriod[]; default_option?: StartPeriod | null}>(session.apiBase, '/attendance/start-options', session.token);
export const getSubjectStartOptions=(session:Session)=>call<SubjectStartOptions>(session.apiBase,'/attendance/subjects',session.token);
export const getActiveAttendance = (session: Session) => call<{session: AttendanceSession | null}>(session.apiBase, '/attendance/active', session.token);
export const startAttendance = (session: Session, period: StartPeriod, deviceId: string, durationSeconds=60) => call<{session: AttendanceSession}>(session.apiBase, '/attendance/session/start', session.token, {section_id: period.section_id, ...(period.default_attendance?{default_attendance:true}:period.default_period?{default_period:true,subject_id:period.subject_id,period:period.period,...(period.batch_id?{batch_id:period.batch_id}:{})}:{timetable_id:period.timetable_id,...(period.subject_id&&period.period?{subject_id:period.subject_id,period:period.period,...(period.batch_id?{batch_id:period.batch_id}:{})}:{})}), device_id: deviceId,duration_seconds:durationSeconds});
export const getAttendanceStatus = (session: Session, id: string) => call<AttendanceStatus>(session.apiBase, '/attendance/session/'+encodeURIComponent(id)+'/status', session.token);

export const getBleToken=(session: Session,id: string,deviceId: string)=>call<BleToken>(session.apiBase,'/attendance/session/'+encodeURIComponent(id)+'/token?device_id='+encodeURIComponent(deviceId),session.token);
export const validateBleToken=(session: Session,id: string,deviceId: string,token: string)=>call<{accepted: true;valid_for_ms: number;server_time: string}>(session.apiBase,'/attendance/session/'+encodeURIComponent(id)+'/token/validate',session.token,{device_id:deviceId,ble_token:token});

export const getAttendanceConfiguration=(session:Session,deviceId:string)=>call<AttendanceConfiguration>(session.apiBase,'/attendance/configuration?device_id='+encodeURIComponent(deviceId),session.token);
export const getOwnAttendance=(session:Session,id:string,deviceId:string)=>call<{record:AttendanceRecord|null}>(session.apiBase,'/attendance/session/'+encodeURIComponent(id)+'/my-attendance?device_id='+encodeURIComponent(deviceId),session.token);
export const getAttendanceChallenge=(session:Session,id:string,deviceId:string,token?:string,method:AttendanceMethod='ble')=>call<{challenge:AttendanceChallenge;server_time:string}>(session.apiBase,'/attendance/session/'+encodeURIComponent(id)+'/challenge',session.token,{device_id:deviceId,method,...(method==='ble'?{ble_token:token}:{})});
export const submitFaceAttendance=(session:Session,id:string,payload:AttendanceSubmission,method:AttendanceMethod='ble')=>call<AttendanceRecord>(session.apiBase,'/attendance/session/'+encodeURIComponent(id)+(method==='ble'?'/submit':'/late-checkin'),session.token,payload);

export const getCurrentAttendance=(session:Session,deviceId:string)=>call<AttendanceCurrent>(session.apiBase,'/attendance/current?device_id='+encodeURIComponent(deviceId),session.token);

export const resetOwnEnrollment=(session:Session,studentId:string)=>call<{enrollment_status:string}>(session.apiBase,'/mobile/enrollment/'+encodeURIComponent(studentId)+'/reset',session.token,{reason:'User confirmed face registration reset after an app enrollment or device binding mismatch.'});
