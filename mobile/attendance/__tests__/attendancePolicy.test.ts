import {acceptsPush,secondsRemaining,anchorAttendance,attendanceMilliseconds} from '../src/attendancePolicy';
const event={type:'attendance_session' as const,session_id:'00000000-0000-4000-8000-000000000001',section_id:'section',user_id:'student',expires_at:'2026-10-10T10:01:00Z',broadcast:'false' as const},now=Date.parse('2026-10-10T10:00:00Z');
test('only fresh alerts for the signed-in student can trigger server refresh',()=>{expect(acceptsPush(event,'student',now)).toBe(true);expect(acceptsPush(event,'another',now)).toBe(false);expect(acceptsPush({...event,expires_at:'invalid'},'student',now)).toBe(false);expect(acceptsPush(event,'student',now+60000)).toBe(false);expect(acceptsPush(null,'student',now)).toBe(false);});
test('countdown uses server expiry and stops at zero',()=>{expect(secondsRemaining(event.expires_at,now)).toBe(60);expect(secondsRemaining(event.expires_at,now+59500)).toBe(1);expect(secondsRemaining(event.expires_at,now+61000)).toBe(0);expect(secondsRemaining('invalid',now)).toBe(0);});

test('server budgets use monotonic deadlines despite phone clock skew and subtract the entire request delay',()=>{
 const session={id:'s',section_id:'section',period:'p',started_at:new Date(now).toISOString(),expires_at:event.expires_at,late_expires_at:new Date(now+180000).toISOString(),status:'open' as const};
 const main=anchorAttendance({session,phase:'ble',own_record:null,server_time:new Date(now).toISOString(),valid_for_ms:60000},100,600)!;
 expect(attendanceMilliseconds(main,'ble',600,now+86400000)).toBe(59500);expect(attendanceMilliseconds(main,'fallback',600,now-86400000)).toBe(179500);
 const late=anchorAttendance({session,phase:'fallback',own_record:{status:'ABSENT',method:null,is_late:false},server_time:new Date(now+60000).toISOString(),valid_for_ms:120000},100,600)!;
 expect(attendanceMilliseconds(late,'ble',600,now-86400000)).toBe(0);expect(attendanceMilliseconds(late,'fallback',600,now+86400000)).toBe(119500);expect(attendanceMilliseconds(late,'fallback',120100,now)).toBe(0);
 expect(()=>anchorAttendance({session,phase:'ble',own_record:null,server_time:'invalid',valid_for_ms:60000},0,10)).toThrow('invalid attendance window');
});
