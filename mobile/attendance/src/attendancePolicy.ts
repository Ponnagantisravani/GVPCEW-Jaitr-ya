import type {PushEvent,AttendanceSession,AttendanceMethod,AttendanceCurrent} from './types';
import {monotonicNow} from './bleProtocol';
export function acceptsPush(event: PushEvent | null, userId: string, now=Date.now()): boolean {
  return !!event && event.type==='attendance_session' && event.user_id===userId && /^[a-f0-9-]{36}$/i.test(event.session_id) && Number.isFinite(Date.parse(event.expires_at)) && Date.parse(event.expires_at)>now;
}
export function secondsRemaining(expires: string, now=Date.now()): number {
  const end=Date.parse(expires);
  return Number.isFinite(end)?Math.max(0,Math.ceil((end-now)/1000)):0;
}

export function attendanceMilliseconds(session:AttendanceSession,method:AttendanceMethod='ble',mono=monotonicNow(),wall=Date.now()):number {
 const deadline=method==='ble'?session.monotonic_expires_at:session.monotonic_late_expires_at;
 if(typeof deadline==='number'&&Number.isFinite(deadline))return Math.max(0,deadline-mono);
 const stamp=method==='ble'?session.expires_at:session.late_expires_at;
 const remaining=Date.parse(stamp||'')-wall;
 return Number.isFinite(remaining)?Math.max(0,remaining):0;
}
// Anchor the server's remaining budget to a monotonic clock; subtract the entire round trip.
export function anchorAttendance(result:AttendanceCurrent,requested:number,received=monotonicNow()):AttendanceSession|null {
 if(!result.session)return null;
 const s=result.session,server=Date.parse(result.server_time),roundTrip=Math.max(0,received-requested);
 if(!Number.isFinite(server)||!Number.isFinite(result.valid_for_ms)||result.valid_for_ms<0||!['ble','fallback','closed'].includes(result.phase||''))throw new Error('The server returned an invalid attendance window.');
 const main=result.phase==='ble'?Math.max(0,result.valid_for_ms-roundTrip):0;
 const late=result.phase==='fallback'?Math.max(0,result.valid_for_ms-roundTrip):Math.max(0,Date.parse(s.late_expires_at||'')-server-roundTrip);
 return {...s,monotonic_expires_at:received+main,monotonic_late_expires_at:received+(Number.isFinite(late)?late:0)};
}
