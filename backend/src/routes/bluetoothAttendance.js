import {Router} from '../utils/router.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {pool} from '../config/db.js';
import {env} from '../config/env.js';
import crypto from 'node:crypto';
import {z} from 'zod';
import {evidenceDigest,verifiedDecision,verifyAttendanceEvidence,verifierReady} from '../services/attendanceVerifier.js';
import {sessionResponsibility} from '../services/sessionResponsibility.js';
export const bluetoothAttendanceRouter=Router();
bluetoothAttendanceRouter.use(requireAuth,allowRoles('faculty','student_coordinator'));
const device=z.string().regex(/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i).transform(s=>s.toUpperCase());
const binding=z.object({sessionId:z.string().uuid(),rollNumber:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/),deviceAddress:device});
const hashDevice=address=>crypto.createHmac('sha256',env.jwtSecret).update(address).digest('hex');
const sessionSql = `select a.*,s.id student_id,s.roll_number from attendance_sessions a
 join students s on s.academic_section_id=a.academic_section_id
 where a.id=$1 and a.coordinator_user_id=$2 and s.roll_number=$3 and a.verification_mode='face_bluetooth' and ${sessionResponsibility('a')}`;
bluetoothAttendanceRouter.get('/capabilities',(_req,res)=>res.json({ready:verifierReady(),message:verifierReady()?'Face verification configured.':'Automatic attendance requires a configured identity and liveness verifier. No attendance will be recorded without both checks.'}));
bluetoothAttendanceRouter.post('/challenge',async(req,res)=>{
 const p=binding.safeParse(req.body);if(!p.success)return res.status(400).json({message:'Choose a class and enter a valid roll number.'});
 if(!verifierReady())return res.status(503).json({message:'Identity and liveness verification is not configured. Ask the faculty to use reviewed attendance.'});
 const d=p.data,client=await pool.connect();
 try {
  await client.query('begin');
  const {rows}=await client.query(sessionSql+' and a.stopped_at is null and a.expires_at>now() for update of a',[d.sessionId,req.user.sub,d.rollNumber]);
  if(!rows[0]){await client.query('rollback');return res.status(404).json({message:'Active class or enrolled student not found.'});}
  const a=rows[0],deviceHash=hashDevice(d.deviceAddress);
  const existing=await client.query("select id,student_id,device_hash,receipt_id,recorded_at from attendance_face_challenges where session_id=$1 and status='confirmed' and (student_id=$2 or device_hash=$3)",[a.id,a.student_id,deviceHash]);
  if(existing.rowCount){await client.query('rollback');return res.status(409).json({message:'This student or phone has already recorded attendance in this class. Use the original receipt or ask faculty to review.'});}
  const enrolled=await client.query('select id from face_embeddings where student_id=$1 limit 1',[a.student_id]);
  if(!enrolled.rowCount){await client.query('rollback');return res.status(409).json({message:'Face enrollment is missing. Contact the enrollment desk.'});}
  const count=await client.query("select count(*)::int attempts from attendance_face_challenges where session_id=$1 and (student_id=$2 or device_hash=$3) and created_at>now()-interval '10 minutes'",[a.id,a.student_id,deviceHash]);
  if(count.rows[0].attempts>=5){await client.query('rollback');return res.status(429).json({message:'Too many capture attempts. Ask faculty to review your attendance.'});}
  const actions=crypto.randomInt(2)?['look_straight','turn_left','turn_right','look_straight']:['look_straight','turn_right','turn_left','look_straight'];
  const inserted=await client.query('insert into attendance_face_challenges(session_id,student_id,device_hash,actions,expires_at) values($1,$2,$3,$4,least($5::timestamptz,now()+interval \'90 seconds\')) returning id,actions,expires_at',[a.id,a.student_id,deviceHash,JSON.stringify(actions),a.expires_at]);
  await client.query('commit');res.status(201).json({challenge:inserted.rows[0]});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
const frame=z.object({action:z.enum(['look_straight','turn_left','turn_right']),image:z.string().max(500000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/)});
const submit=binding.extend({challengeId:z.string().uuid(),frames:z.array(frame).length(4)});
bluetoothAttendanceRouter.post('/submit',async(req,res)=>{
 const p=submit.safeParse(req.body);if(!p.success)return res.status(400).json({message:'Capture all four face challenge images again.'});
 const d=p.data,client=await pool.connect();
 try{
  await client.query('begin');
  const {rows}=await client.query(sessionSql+' for update of a',[d.sessionId,req.user.sub,d.rollNumber]);
  const a=rows[0];
  if(!a){await client.query('rollback');return res.status(404).json({message:'Class or student not found.'});}
  const challenge=(await client.query('select *,expires_at>now() fresh from attendance_face_challenges where id=$1 and session_id=$2 and student_id=$3 and device_hash=$4 for update',[d.challengeId,a.id,a.student_id,hashDevice(d.deviceAddress)])).rows[0];
  if(!challenge){await client.query('rollback');return res.status(403).json({message:'Capture does not belong to this student and phone.'});}
  if(challenge.status==='confirmed'){
   await client.query('commit');return res.json({receiptId:challenge.receipt_id,rollNumber:a.roll_number,recordedAt:challenge.recorded_at,message:'Attendance recorded.'});
  }
  if(challenge.status!=='pending'||!challenge.fresh||a.stopped_at||new Date(a.expires_at)<=new Date()){
   await client.query('rollback');return res.status(409).json({message:'Capture or class expired. Start a fresh capture.'});
  }
  if(JSON.stringify(d.frames.map(f=>f.action))!==JSON.stringify(challenge.actions)){
   await client.query('rollback');return res.status(400).json({message:'Complete the requested face movements in order.'});
  }
  const duplicate=await client.query("select id from attendance_face_challenges where session_id=$1 and status='confirmed' and (student_id=$2 or device_hash=$3)",[a.id,a.student_id,challenge.device_hash]);
  if(duplicate.rowCount){await client.query('rollback');return res.status(409).json({message:'Student or phone already recorded for this class.'});}
  const reference=(await client.query('select embedding,model_version from face_embeddings where student_id=$1 order by created_at desc limit 1',[a.student_id])).rows[0];
  if(!reference){await client.query('rollback');return res.status(409).json({message:'Face enrollment is missing.'});}
  const expected={challengeId:challenge.id,studentId:a.student_id,evidenceDigest:evidenceDigest(d.frames)};
  let decision;
  try{decision=await verifyAttendanceEvidence({...expected,actions:challenge.actions,frames:d.frames,reference,issuedAt:challenge.created_at,expiresAt:challenge.expires_at});}
  catch{await client.query('rollback');return res.status(503).json({message:'Face verification unavailable. Retry this submission; attendance has not been confirmed.'});}
  if(!verifiedDecision(decision,expected)){
   await client.query("update attendance_face_challenges set status='rejected' where id=$1",[challenge.id]);await client.query('commit');
   return res.status(422).json({message:'Identity or liveness was not verified. Capture again or ask faculty for review.'});
  }
  // clock_timestamp also accounts for time spent waiting for the verifier.
  const fresh=await client.query('select stopped_at is null and clock_timestamp()<expires_at and clock_timestamp()<$2::timestamptz valid from attendance_sessions where id=$1 for update',[a.id,challenge.expires_at]);
  if(!fresh.rows[0].valid){await client.query('rollback');return res.status(409).json({message:'Verification finished after the class or capture expired. Capture again.'});}
  const receiptId=crypto.randomUUID();
  await client.query('insert into attendance_session_entries(session_id,student_id) values($1,$2) on conflict do nothing',[a.id,a.student_id]);
  await client.query(`insert into attendance(student_id,subject_id,faculty_id,classroom_id,status,attendance_date)
   values($1,$2,$3,$4,'present',$5::timestamptz::date)
   on conflict(student_id,subject_id,attendance_date) do update set status='present',marked_at=now()`,[a.student_id,a.subject_id,a.faculty_id,a.classroom_id,a.starts_at]);
  const updated=await client.query("update attendance_face_challenges set status='confirmed',receipt_id=$2,evidence_digest=$3,verifier_version=$4,recorded_at=clock_timestamp() where id=$1 returning recorded_at",[challenge.id,receiptId,expected.evidenceDigest,decision.verifierVersion]);
  await client.query("insert into notifications(user_id,title,body,type) select user_id,'Attendance confirmed',$2,'attendance' from students where id=$1",[a.student_id,'Your attendance has been recorded. Receipt: '+receiptId]);
  await client.query('commit');res.json({receiptId,rollNumber:a.roll_number,recordedAt:updated.rows[0].recorded_at,message:'Attendance recorded.'});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
