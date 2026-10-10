import {pool} from '../config/db.js';
import {fcmReady,messageFor,sendFcm} from './mobileFcm.js';
import {MODEL} from './mobileAttendancePolicy.js';
export async function enqueueSessionPushes(c,id){
 return c.query('insert into mobile_push_outbox(session_id,student_id) select session_id,student_id from session_roster where session_id=$1 on conflict(session_id,student_id) do nothing',[id]);
}
export async function drainPushQueue(db=pool,send=sendFcm){
 await db.query("update mobile_push_outbox q set state='expired' from attendance_sessions a where a.id=q.session_id and q.state='pending' and (a.expires_at<=clock_timestamp() or a.status<>'open')");
 // Thirty-second lease permits restart recovery; SKIP LOCKED supports multiple workers.
 const rows=(await db.query("with due as (select id from mobile_push_outbox where state='pending' and next_attempt_at<=clock_timestamp() order by next_attempt_at,id limit 80 for update skip locked) update mobile_push_outbox q set next_attempt_at=clock_timestamp()+interval '30 seconds',attempts=attempts+1 from due where q.id=due.id returning q.*")).rows;
 let index=0;
 await Promise.all(Array.from({length:Math.min(40,rows.length)},async()=>{
  while(index<rows.length){const q=rows[index++];
   try {
    const row=(await db.query("select a.id session_id,a.academic_section_id,a.expires_at,s.user_id,d.fcm_token,(a.coordinator_user_id=s.user_id or exists(select 1 from broadcasters b where b.session_id=a.id and b.student_id=s.id)) broadcast from session_roster r join attendance_sessions a on a.id=r.session_id join students s on s.id=r.student_id join users u on u.id=s.user_id and u.active join mobile_fcm_devices d on d.user_id=s.user_id and d.device_id=s.bound_device_id where r.session_id=$1 and r.student_id=$2 and s.academic_section_id=a.academic_section_id and s.enrollment_status='approved' and s.face_enrolled and s.embedding_model=$3 and a.status='open' and a.expires_at>clock_timestamp()",[q.session_id,q.student_id,MODEL])).rows[0];
    const message=row&&messageFor(row);
    if(!message){await db.query("update mobile_push_outbox set state='expired',last_error='no_eligible_device' where id=$1",[q.id]);continue;}
    const result=await send(message);
    if(result.invalidToken)await db.query('delete from mobile_fcm_devices where user_id=$1 and fcm_token=$2',[row.user_id,row.fcm_token]);
    const state=result.sent?'sent':result.retry&&q.attempts<4?'pending':'failed';
    await db.query("update mobile_push_outbox set state=$2,sent_at=case when $2='sent' then clock_timestamp() else null end,last_error=$3,next_attempt_at=clock_timestamp()+interval '2 seconds' where id=$1",[q.id,state,result.sent?null:result.error||'delivery_failed']);
   }catch{
    await db.query("update mobile_push_outbox set state=$2,last_error='transport_unavailable',next_attempt_at=clock_timestamp()+interval '2 seconds' where id=$1",[q.id,q.attempts<4?'pending':'failed']);
   }
  }
 }));
 return rows.length;
}
export function startPushWorker(){
 let stopped=false,busy=false;
 const tick=async()=>{if(stopped||busy||!fcmReady())return;busy=true;try{await drainPushQueue();}catch{console.error('Mobile push queue unavailable. Check the Stage 3 migration and Firebase configuration.');}finally{busy=false;}};
 const timer=setInterval(()=>void tick(),1000);timer.unref();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}
