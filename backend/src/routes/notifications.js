import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth} from '../middleware/auth.js';
import {z} from 'zod';
export const notificationsRouter=Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get('/',async(req,res)=>{const {rows}=await pool.query('select id,title,body,type,link,read_at,created_at,scheduled_for from notifications where user_id=$1 order by created_at desc limit 100',[req.user.sub]);res.json({notifications:rows});});
notificationsRouter.get('/mobile-feed',async(req,res)=>{
 const [notices,classes,personal]=await Promise.all([
  pool.query('select id,title,body,read_at,created_at from notifications where user_id=$1 and (scheduled_for is null or scheduled_for<=now()) order by created_at desc limit 100',[req.user.sub]),
  pool.query(`select t.id::text||':'||day::date::text source,su.name title,
   concat(su.code,' · ',c.room_code,' · Class begins at ',to_char(t.start_time,'HH24:MI'),' IST') body,
   ((day::date+t.start_time) at time zone 'Asia/Kolkata')-interval '5 minutes' scheduled_for
   from timetable t join subjects su on su.id=t.subject_id join classrooms c on c.id=t.classroom_id
   cross join generate_series((now() at time zone 'Asia/Kolkata')::date,(now() at time zone 'Asia/Kolkata')::date+7,interval '1 day') day
   where t.status='published' and t.day_of_week=extract(dow from day)
   and (t.academic_section_id=(select academic_section_id from students where user_id=$1)
     or t.faculty_id=(select id from faculty where user_id=$1)
     or exists(select 1 from student_coordinator_sections r where r.user_id=$1 and r.academic_section_id=t.academic_section_id))
   and ((day::date+t.start_time) at time zone 'Asia/Kolkata')-interval '5 minutes'>now()
   order by scheduled_for`,[req.user.sub]),
  pool.query('select id,title,body,scheduled_for from notifications where user_id=$1 and read_at is null and scheduled_for>now() order by scheduled_for limit 100',[req.user.sub])]);
 res.json({notifications:notices.rows,reminders:[...classes.rows.map(r=>({...r,source:'timetable:'+r.source})),...personal.rows.map(r=>({...r,source:'personal:'+r.id}))],serverTime:new Date().toISOString()});
});
notificationsRouter.post('/',async(req,res)=>{
 const p=z.object({title:z.string().trim().min(1).max(160),body:z.string().trim().min(1).max(3000),scheduledFor:z.string().datetime({offset:true}).optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({message:'Enter a reminder title, details and valid time.'});
 if(p.data.scheduledFor && (Date.parse(p.data.scheduledFor)<=Date.now() || Date.parse(p.data.scheduledFor)>Date.now()+366*86400000))return res.status(400).json({message:'Choose a reminder time in the next year.'});
 const {rows}=await pool.query("insert into notifications(user_id,title,body,type,scheduled_for) values($1,$2,$3,'reminder',$4) returning *",[req.user.sub,p.data.title,p.data.body,p.data.scheduledFor||null]);res.status(201).json({notification:rows[0]});
});
notificationsRouter.patch('/:id/read',async(req,res)=>{const {rowCount}=await pool.query('update notifications set read_at=coalesce(read_at,now()) where id=$1 and user_id=$2',[req.params.id,req.user.sub]);if(!rowCount)return res.status(404).json({message:'Notification not found.'});res.json({message:'Marked as read.'});});
