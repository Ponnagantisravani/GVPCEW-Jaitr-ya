import {NativeModules, Platform} from 'react-native';
import type {EnrollmentCapture, Session, PushEvent, BroadcastStatus, AttendanceCapture, ChallengeType} from './types';
import {MODEL, MODEL_SHA256} from './enrollmentPolicy';
interface CampusBridge {
  request(base: string, route: string, token: string, body: string | null): Promise<string>;
  getDeviceId(): Promise<string>;
  getSession(): Promise<string | null>;
  saveSession(session: string): Promise<boolean>;
  clearSession(): Promise<boolean>;
  permissionsPrompted(): Promise<boolean>;
  markPermissionsPrompted(): Promise<boolean>;
  enrollFace(): Promise<string>;
  captureAttendance(type:string,validFor:number):Promise<string>;
  cancelAttendance():Promise<boolean>;
  prepareIntegrity(project:string):Promise<boolean>;
  requestIntegrity(canonical:string):Promise<string>;
  getFcmToken(): Promise<string>;
  getPushEvent(): Promise<string | null>;
  clearPushState(): Promise<boolean>;
  canBleAdvertise(): Promise<boolean>;
  startBleBroadcast(id: string, expires: string): Promise<boolean>;
  stopBleBroadcast(): Promise<boolean>;
  isBleBroadcastRunning(id: string): Promise<boolean>;
  getBleBroadcastStatus(): Promise<string>;
  setBleBroadcastStatus(id: string, state: string, message: string): Promise<boolean>;
}
function native(): CampusBridge {
  if (Platform.OS !== 'android' || !NativeModules.CampusNative) throw new Error('This stage requires the Android campus app.');
  return NativeModules.CampusNative as CampusBridge;
}
export const secureStorage = {
  deviceId: () => native().getDeviceId(),
  async session(): Promise<Session | null> {
    const value = await native().getSession();
    if (!value) return null;
    try {const session = JSON.parse(value) as Session;if (!session.token || !session.user?.id || !session.apiBase) throw new Error();return session;}
    catch {await native().clearSession();return null;}
  },
  save: (session: Session) => native().saveSession(JSON.stringify(session)),
  clear: () => native().clearSession(),
  prompted: () => native().permissionsPrompted(),
  markPrompted: () => native().markPermissionsPrompted(),
};
export async function captureEnrollment(): Promise<EnrollmentCapture> {
  const result = JSON.parse(await native().enrollFace()) as EnrollmentCapture;
  if (result.embedding_model !== MODEL || result.model_sha256 !== MODEL_SHA256 || result.embedding?.length !== 192 || !result.embedding.every(Number.isFinite) || result.sample_count < 3 || result.sample_count > 5 || !result.preview?.startsWith('data:image/jpeg;base64,')) throw new Error('The face capture is incomplete. Capture again.');
  return result;
}

export async function campusRequest(base: string, route: string, token?: string, body?: unknown): Promise<{status: number; body: string}> {
  return JSON.parse(await native().request(base, route, token || '', body === undefined ? null : JSON.stringify(body)));
}

export const campusPush = {
  token: () => native().getFcmToken(),
  clear: () => native().clearPushState(),
  async event(): Promise<PushEvent | null> {
    const raw = await native().getPushEvent();
    if (!raw) return null;
    try {return JSON.parse(raw) as PushEvent;} catch {return null;}
  },
};

export const campusBle={
 canAdvertise:()=>native().canBleAdvertise(),
 start:(id:string,expires:string)=>native().startBleBroadcast(id,expires),
 stop:()=>native().stopBleBroadcast(),
 running:(id:string)=>native().isBleBroadcastRunning(id),
 async status():Promise<BroadcastStatus>{return JSON.parse(await native().getBleBroadcastStatus());},
 publish:(id:string,state:BroadcastStatus['state'],message='')=>native().setBleBroadcastStatus(id,state,message),
};

export const campusFace={
 prepare:(project:string)=>native().prepareIntegrity(project),
 integrity:(canonical:string)=>native().requestIntegrity(canonical),
 cancel:()=>native().cancelAttendance(),
 async capture(type:ChallengeType,validFor:number):Promise<AttendanceCapture>{
  const capture=JSON.parse(await native().captureAttendance(type,validFor)) as AttendanceCapture;
  if(capture.embedding_model!==MODEL||capture.model_sha256!==MODEL_SHA256||capture.challenge_type!==type||capture.liveness_result!==true||capture.sample_count!==3||!Array.isArray(capture.embedding)||capture.embedding.length!==192||!capture.embedding.every(Number.isFinite)||!capture.embedding.some(x=>x!==0)||'preview' in capture){if(Array.isArray(capture.embedding))capture.embedding.fill(0);throw new Error('Face verification was incomplete. Retry the challenge.');}
  return capture;
 },
};
