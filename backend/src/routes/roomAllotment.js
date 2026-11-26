import {createHash} from 'node:crypto';
import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {manageDepartmentScope} from '../services/portalScope.js';
import {requireSections} from '../services/academicAccess.js';

export const roomAllotmentRouter=Router();
roomAllotmentRouter.use(requireAuth,allowRoles('academic_coordinator','admin'));
const yearName=n=>['','I','II','III','IV'][Number(n)]||String(n);
const isoMonday=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(+d)||d.toISOString().slice(0,10)!==value||d.getUTCDay()!==1?null:d;};
async function publication(db,sectionIds){
 const {rows}=await db.query(`select t.id,t.academic_section_id section_id,t.day_of_week,t.start_time,t.end_time,t.entry_type,t.classroom_id,t.updated_at,t.published_at,c.room_code room,x.year_number,x.section_name,x.academic_year,d.name department,su.code from timetable t join academic_sections x on x.id=t.academic_section_id join departments d on d.id=x.department_id join classrooms c on c.id=t.classroom_id join subjects su on su.id=t.subject_id where t.status='published' and t.academic_section_id=any($1::uuid[]) and t.day_of_week between 1 and 6 order by t.academic_year,t.academic_section_id,t.day_of_week,t.start_time,t.id`,[sectionIds]);
 const signature=createHash('sha256').update(JSON.stringify(rows.map(r=>[r.id,r.section_id,r.day_of_week,String(r.start_time),String(r.end_time),r.entry_type,r.classroom_id,String(r.updated_at),String(r.published_at)]))).digest('hex');return {rows,signature};
}
async function setup(db,req){
 const poolResult=await db.query(`select p.id,p.class_code code,p.year_number,p.program,p.department_id,p.academic_section_id section_id,p.preferred_room_id,x.academic_year,coalesce(x.section_name,p.class_code) section_name,d.name department from room_pool_classes p join departments d on d.id=p.department_id left join academic_sections x on x.id=p.academic_section_id where p.active and ${manageDepartmentScope('p.department_id')} order by p.year_number,p.program,p.class_code`,[req.user.sub,req.user.activeRole]);const classPool=poolResult.rows;
 const rooms=await db.query('select id,room_code,room_type,is_test,active from classrooms order by room_code');
 const assignments=await db.query('select p.year_number,p.classroom_id from room_year_pools p join classrooms c on c.id=p.classroom_id order by p.year_number,c.room_code');
 const venues=await db.query('select v.id,v.venue_name,v.year_numbers,v.active,coalesce(array_agg(c.id order by c.room_code) filter(where c.id is not null),array[]::uuid[]) room_ids,coalesce(array_agg(c.room_code order by c.room_code) filter(where c.id is not null),array[]::text[]) rooms from lab_venues v left join lab_venue_rooms vr on vr.venue_id=v.id left join classrooms c on c.id=vr.classroom_id group by v.id order by v.venue_name');
 const option=(await db.query('select allow_borrow from room_pool_settings where id=true')).rows[0];
 const poolIds=new Set(assignments.rows.map(x=>x.classroom_id));
 const activeRooms=rooms.rows.filter(r=>r.room_type==='classroom'&&r.active&&!r.is_test&&!/test|demo/i.test(r.room_code));
 const sectionIds=classPool.map(s=>s.section_id).filter(Boolean);
 const {rows:live}=await publication(db,sectionIds);
 const home=Object.fromEntries([1,2,3,4].map(y=>[y,assignments.rows.filter(a=>a.year_number===y).map(a=>activeRooms.find(r=>r.id===a.classroom_id)).filter(Boolean)]));
 const poolRoomIds=new Set(assignments.rows.filter(a=>a.year_number>=2&&a.year_number<=4).map(a=>a.classroom_id));
 const classes=classPool.map(s=>({...s,id:s.section_id||s.id,poolClassId:s.id}));for(const y of [2,3,4])classes.filter(c=>c.year_number===y).forEach((c,i)=>{c.preferredRoomId=c.preferred_room_id||home[y][i%Math.max(1,home[y].length)]?.id||null;});
 const yearOneClasses=await db.query(`select x.id,x.section_name code,x.year_number,x.department_id,d.name department from academic_sections x join departments d on d.id=x.department_id where x.year_number=1 and ${manageDepartmentScope('x.department_id')} order by d.name,x.section_name`,[req.user.sub,req.user.activeRole]);
 const yearOneLabCount=venues.rows.filter(v=>v.active&&v.year_numbers.includes(1)).length;
 const yearOneSectionIds=yearOneClasses.rows.map(c=>c.id);
 const {rows:yearOneLive}=await publication(db,yearOneSectionIds);
 return {rooms:activeRooms,allRooms:rooms.rows,home,venues:venues.rows,allowBorrow:option?.allow_borrow??true,classes,classCount:classPool.length,labCount:venues.rows.filter(v=>v.active&&v.year_numbers.some(y=>y>=2&&y<=4)).length,yearOneClasses:yearOneClasses.rows,yearOneClassCount:yearOneClasses.rowCount,yearOneLabCount,assignedRooms:[...poolRoomIds].filter(id=>activeRooms.some(r=>r.id===id)).length,yearOneRooms:home[1].length,publicationSignature:(await publication(db,sectionIds)).signature,hasPublished:live.length>0,yearOneHasPublished:yearOneLive.length>0,yearOnePublicationSignature:(await publication(db,yearOneSectionIds)).signature};
}
roomAllotmentRouter.get('/setup',async(req,res)=>res.json(await setup(pool,req)));
roomAllotmentRouter.post('/rooms',async(req,res)=>{const {roomCode,type='classroom'}=req.body||{};if(typeof roomCode!=='string'||!roomCode.trim()||roomCode.trim().length>40||!['classroom','lab'].includes(type))return res.status(400).json({message:'Enter a room name and choose classroom or lab.'});const code=roomCode.trim();const {rows}=await pool.query(`insert into classrooms(room_code,building_name,room_name,active,room_type,is_test) values($1,'Academic Block',$1,true,$2,$3) on conflict(room_code) do update set active=true,room_type=excluded.room_type,is_test=excluded.is_test returning id,room_code,room_type,active,is_test`,[code,type,/test|demo/i.test(code)]);res.status(201).json({room:rows[0]});});
roomAllotmentRouter.patch('/rooms/:id',async(req,res)=>{const {type,isTest,active}=req.body||{};if(!['classroom','lab'].includes(type)||typeof isTest!=='boolean'||typeof active!=='boolean')return res.status(400).json({message:'Choose a room type, active state, and test state.'});const {rows}=await pool.query('update classrooms set room_type=$2,is_test=$3,active=$4 where id=$1 returning id,room_code,room_type,is_test,active',[req.params.id,type,isTest,active]);if(!rows.length)return res.status(404).json({message:'Room not found.'});await pool.query('delete from room_year_pools where classroom_id=$1 and ($2 or $3 or $4<>\'classroom\')',[req.params.id,isTest,!active,type]);res.json({room:rows[0]});});
roomAllotmentRouter.put('/setup',async(req,res)=>{
 const {homeByYear,allowBorrow=true,venues=[]}=req.body||{};
 if(!homeByYear||![1,2,3,4].every(y=>Array.isArray(homeByYear[y])))return res.status(400).json({message:'Choose classroom rooms for each year, including Year I.'});
 const db=await pool.connect();try{await db.query('begin');
  const flat=[];for(const y of [1,2,3,4])for(const id of homeByYear[y])flat.push({year:y,id});
  if(new Set(flat.map(x=>x.id)).size!==flat.length)throw Object.assign(new Error('A classroom can belong to one year only. Remove the duplicate room.'),{status:400});
  if(flat.length){const check=await db.query("select id from classrooms where id=any($1::uuid[]) and active and not is_test and room_type='classroom'",[flat.map(x=>x.id)]);if(check.rowCount!==flat.length)throw Object.assign(new Error('Choose only active classroom rooms. Lab and test rooms cannot be assigned as home classrooms.'),{status:400});}
  await db.query('delete from room_year_pools');for(const x of flat)await db.query('insert into room_year_pools(year_number,classroom_id) values($1,$2)',[x.year,x.id]);
  await db.query('update room_pool_settings set allow_borrow=$1,updated_at=now(),updated_by=$2 where id=true',[Boolean(allowBorrow),req.user.sub]);
  await db.query('delete from lab_venues');for(const v of venues){if(!v.name||!Array.isArray(v.roomIds)||!Array.isArray(v.years)||!v.years.length)continue;const saved=(await db.query('insert into lab_venues(venue_name,year_numbers,active) values($1,$2,true) returning id',[String(v.name).trim(),v.years.map(Number)])).rows[0];for(const roomId of v.roomIds)await db.query("insert into lab_venue_rooms(venue_id,classroom_id) select $1,id from classrooms where id=$2 and room_type='lab' on conflict do nothing",[saved.id,roomId]);}
  await db.query("update room_allotments set status='out_of_date',updated_at=now() where status in ('draft','published')");
  await db.query('commit');res.json(await setup(pool,req));
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
});

roomAllotmentRouter.get('/',async(req,res)=>{
 const cfg=await setup(pool,req);const monday=isoMonday(req.query.weekStart)||isoMonday(new Date(Date.now()-((new Date().getUTCDay()+6)%7)*86400000).toISOString().slice(0,10));
 const existing=monday?(await pool.query('select * from room_allotments where week_start=$1 and published_by=$2 order by updated_at desc limit 1',[monday.toISOString().slice(0,10),req.user.sub])).rows[0]:null;
 if(existing&&existing.status!=='out_of_date'&&existing.timetable_signature&&existing.timetable_signature!==cfg.publicationSignature){await pool.query("update room_allotments set status='out_of_date',updated_at=now() where id=$1",[existing.id]);existing.status='out_of_date';}
 res.json({...cfg,allotment:existing||null});
});

export function makeAllotment(cfg,rows,weekStart,scope='2-4'){
 const years=scope==='1'?[1]:[2,3,4];
 const poolRooms=cfg.rooms.filter(r=>years.some(y=>(cfg.home[y]||[]).some(x=>x.id===r.id)));
 const scopedClasses=(cfg.classes||[]).filter(c=>years.includes(Number(c.year_number)));
 const scopedIds=new Set(scopedClasses.map(c=>c.id));
 const labCount=scope==='1'?(cfg.yearOneLabCount||0):(cfg.labCount??3);
 const classIds=scope==='1'?new Set((cfg.yearOneClasses||[]).map(c=>c.id)):scopedIds;
 const byId=new Map(scopedClasses.map(c=>[c.id,c]));const cells=[];const days=[1,2,3,4,5,6];
 for(const day of days)for(const halfDay of ['FN','AN']){
  const sessions=rows.filter(r=>r.day_of_week===day&&((String(r.start_time).slice(0,5)<'12:00')===(halfDay==='FN')));
  const activeIds=[...new Set(sessions.map(r=>r.section_id).filter(id=>classIds.has(id)&&byId.has(id)))];
  const labIds=new Set(sessions.filter(r=>r.entry_type==='lab').map(r=>r.section_id));
  if(labIds.size>labCount)throw Object.assign(new Error(`${['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]} ${halfDay==='FN'?'forenoon':'afternoon'} has ${labIds.size} lab classes, but only ${labCount} lab venues are available.`),{status:409});
  const need=activeIds.filter(id=>!labIds.has(id));const available=poolRooms;
  if(need.length>available.length)throw Object.assign(new Error(`${['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]} ${halfDay==='FN'?'forenoon':'afternoon'} needs ${need.length} rooms, ${available.length} available (short by ${need.length-available.length}).`),{status:409});
  const assigned=new Set();const chosen=new Map();
  // Keep each class in a room from its own year where possible, then preserve its home room.
  for(const id of need){const s=byId.get(id);const preferred=(cfg.home[s.year_number]||[]).find(r=>r.id===s.preferredRoomId&&!assigned.has(r.id));if(preferred){chosen.set(id,preferred);assigned.add(preferred.id);}}
  for(const id of need)if(!chosen.has(id)){const s=byId.get(id);const sameYear=(cfg.home[s.year_number]||[]).find(r=>!assigned.has(r.id));if(sameYear){chosen.set(id,sameYear);assigned.add(sameYear.id);}}
  for(const id of need)if(!chosen.has(id)){const s=byId.get(id);const yearRooms=cfg.home[s.year_number]||[];const borrowed=yearRooms.find(r=>!assigned.has(r.id))||(cfg.allowBorrow?available.find(r=>!assigned.has(r.id)):null);if(!borrowed)throw Object.assign(new Error(`${['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]} ${halfDay==='FN'?'forenoon':'afternoon'} needs ${need.length} rooms, ${assigned.size} available (short by ${need.length-assigned.size}).`),{status:409});chosen.set(id,borrowed);assigned.add(borrowed.id);}
  const used=new Set();for(const [id,room] of chosen){if(used.has(room.id))throw Object.assign(new Error('Room assignments conflict. Adjust home classrooms and retry.'),{status:409});used.add(room.id);}
  for(const room of available){const classId=[...chosen].find(([,r])=>r.id===room.id)?.[0]||null;const section=classId?byId.get(classId):null;cells.push({day,halfDay,roomId:room.id,room:room.room_code,classId,classCode:section?.code||null,preferredRoomId:section?.preferredRoomId||null,eligibleClassIds:need,edited:false});}
 }
 return cells;
}
 roomAllotmentRouter.post('/generate',async(req,res)=>{
 const week=isoMonday(req.body?.weekStart),scope=req.body?.scope==='1'?'1':'2-4';if(!week)return res.status(400).json({message:'Choose a valid Monday as the week start.'});
 const db=await pool.connect();try{await db.query('begin');const cfg=await setup(db,req);const years=scope==='1'?[1]:[2,3,4];const missing=years.filter(y=>!cfg.home[y].length);if(missing.length)throw Object.assign(new Error(`Home classrooms are missing for Year ${missing.map(yearName).join(', ')}. Save rooms for the selected years first.`),{status:409});
  const selectedClasses=scope==='1'?cfg.yearOneClasses:cfg.classes.filter(c=>years.includes(Number(c.year_number)));if(!selectedClasses.length)throw Object.assign(new Error(scope==='1'?'No Year I classes are configured for your department.':'No classes are configured for Years II–IV.'),{status:409});
  const sectionIds=selectedClasses.map(s=>s.section_id||s.id).filter(Boolean);await requireSections(req,sectionIds,db);const {rows,signature}=await publication(db,sectionIds);if(!rows.length)throw Object.assign(new Error('No published timetable entries were found for the selected years.'),{status:409});
  const ids=sectionIds;const scopedCfg={...cfg,classes:selectedClasses.map(s=>({...s,id:s.section_id||s.id})),yearOneClasses:selectedClasses};const cells=makeAllotment(scopedCfg,rows,week.toISOString().slice(0,10),scope);const end=new Date(week);end.setUTCDate(end.getUTCDate()+6);
  const record=(await db.query(`insert into room_allotments(week_start,week_end,published_by,section_ids,cells,status,timetable_signature,generated_at,published_at,updated_at) values($1,$2,$3,$4::uuid[],$5::jsonb,'draft',$6,now(),null,now()) on conflict(week_start,published_by) do update set week_end=excluded.week_end,section_ids=excluded.section_ids,cells=excluded.cells,status='draft',timetable_signature=excluded.timetable_signature,generated_at=now(),published_at=null,updated_at=now() returning *`,[week.toISOString().slice(0,10),end.toISOString().slice(0,10),req.user.sub,ids,JSON.stringify(cells),signature])).rows[0];
  await db.query('commit');res.json({allotment:record,scope,classes:selectedClasses.length});
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
});
roomAllotmentRouter.patch('/:id/cell',async(req,res)=>{
 const {day,halfDay,roomId,classId}=req.body||{};if(!Number.isInteger(day)||day<1||day>6||!['FN','AN'].includes(halfDay)||typeof roomId!=='string')return res.status(400).json({message:'Choose a valid day, half-day, and classroom.'});
 const db=await pool.connect();try{await db.query('begin');const row=(await db.query('select * from room_allotments where id=$1 and published_by=$2 for update',[req.params.id,req.user.sub])).rows[0];if(!row)throw Object.assign(new Error('Room allotment not found.'),{status:404});if(row.status!=='draft')throw Object.assign(new Error('Only a draft room allotment can be edited.'),{status:409});
  const cells=row.cells;const target=cells.find(c=>c.day===day&&c.halfDay===halfDay&&c.roomId===roomId);if(!target)throw Object.assign(new Error('That room is not available in this half-day.'),{status:400});
  if(classId){if(!row.section_ids.includes(classId)||!target.eligibleClassIds?.includes(classId))throw Object.assign(new Error('Choose a class with a published session in this half-day.'),{status:400});const source=cells.find(c=>c.day===day&&c.halfDay===halfDay&&c.classId===classId);if(source&&source!==target){if(target.classId)source.classId=target.classId;else source.classId=null;const sourceData=await setup(db,req), sourceClass=sourceData.classes.find(c=>c.id===source.classId);source.classCode=sourceClass?.code||null;source.preferredRoomId=sourceClass?.preferredRoomId||null;}else if(!source&&target.classId)throw Object.assign(new Error('Choose a class already assigned in this half-day to swap rooms, or use an empty room.'),{status:409});}
  else if(target.classId)throw Object.assign(new Error('This class needs a room in this half-day. Swap it into another room instead of freeing its only room.'),{status:409});
  const data=await setup(db,req);const cls=data.classes.find(c=>c.id===classId);target.classId=classId||null;target.classCode=cls?.code||null;target.preferredRoomId=cls?.preferredRoomId||null;target.edited=true;
  await db.query('update room_allotments set cells=$2::jsonb,updated_at=now() where id=$1',[row.id,JSON.stringify(cells)]);await db.query('commit');res.json({cells});
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
});
roomAllotmentRouter.post('/publish',async(req,res)=>{
 const {id}=req.body||{};const db=await pool.connect();try{await db.query('begin');const row=(await db.query('select * from room_allotments where id=$1 and published_by=$2 for update',[id,req.user.sub])).rows[0];if(!row)throw Object.assign(new Error('Generate the room allotment before publishing.'),{status:404});if(row.status!=='draft')throw Object.assign(new Error('Generate a current draft before publishing.'),{status:409});
  const current=await publication(db,row.section_ids);if(current.signature!==row.timetable_signature){await db.query("update room_allotments set status='out_of_date',updated_at=now() where id=$1",[id]);await db.query('commit');return res.status(409).json({message:'The published timetable changed. Generate the room allotment again.'});}
  const cells=row.cells;for(const day of [1,2,3,4,5,6])for(const halfDay of ['FN','AN']){const sessions=current.rows.filter(r=>r.day_of_week===day&&((String(r.start_time).slice(0,5)<'12:00')===(halfDay==='FN')));const labIds=new Set(sessions.filter(r=>r.entry_type==='lab').map(r=>r.section_id));const required=[...new Set(sessions.map(r=>r.section_id).filter(id=>row.section_ids.includes(id)&&!labIds.has(id)))];const group=cells.filter(c=>c.day===day&&c.halfDay===halfDay);if(required.some(id=>group.filter(c=>c.classId===id).length!==1)||group.some(c=>c.classId&&!required.includes(c.classId)))throw Object.assign(new Error(`Every class with a session needs exactly one room on ${['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]} ${halfDay==='FN'?'forenoon':'afternoon'}.`),{status:409});if(new Set(group.filter(c=>c.classId).map(c=>c.roomId)).size!==group.filter(c=>c.classId).length)throw Object.assign(new Error('A room is used twice in this half-day. Resolve the conflict before publishing.'),{status:409});}
  await db.query("update room_allotments set status='published',published_at=now(),updated_at=now() where id=$1",[id]);
  const recipients=await db.query(`select distinct user_id from (select s.user_id from students s where s.academic_section_id=any($1::uuid[]) union select f.user_id from timetable t join faculty f on f.id=t.faculty_id where t.academic_section_id=any($1::uuid[]) and t.status='published') a where user_id is not null`,[row.section_ids]);const body=`Room allotment for the week of ${row.week_start} is published.`;
  await db.query(`insert into notifications(user_id,title,body,type,link) select u,'Room allotment published',$2,'academic',case when exists(select 1 from students s where s.user_id=u) then '/student' else '/faculty' end from unnest($1::uuid[]) x(u) where not exists(select 1 from notifications n where n.user_id=u and n.title='Room allotment published' and n.body=$2)`,[recipients.rows.map(x=>x.user_id),body]);
  await db.query('commit');res.json({published:true,notified:recipients.rowCount});
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
});
roomAllotmentRouter.get('/history',async(req,res)=>{const {rows}=await pool.query('select id,week_start,week_end,status,published_at,generated_at,updated_at,cells from room_allotments where published_by=$1 order by week_start desc limit 26',[req.user.sub]);res.json({allotments:rows});});
roomAllotmentRouter.use((error,req,res,next)=>{if(res.headersSent)return next(error);if(!error.status||error.status>=500){console.error('Room allotment request failed:',error.code||error.name,error.message);return res.status(500).json({message:'Room allotment could not be completed. Please retry.'});}return res.status(error.status).json({message:error.message||'Check the room allotment details and retry.'});});
