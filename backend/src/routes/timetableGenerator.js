import { Router } from '../utils/router.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { pool } from '../config/db.js';
import { checkInput, verifyTimetable } from '../services/timetableSolver.js';
import { parseConfiguration, validateBatch, assignFaculty } from '../../../shared/timetableConfiguration.js';
import { Worker } from 'node:worker_threads';

function prepare(body) {
 const parsed=typeof body?.text==='string'?parseConfiguration(body.text):{input:body,reasons:[]};
 if(parsed.reasons.length)return parsed;
 if(Array.isArray(parsed.input?.sections))for(const section of parsed.input.sections){
  if(!section)continue;
  for(const key of ['name','room','classTeacher'])if(typeof section[key]==='string')section[key]=section[key].trim();
  if(Array.isArray(section.subjects))for(const subject of section.subjects)if(subject)for(const key of ['teachers','rooms'])if(Array.isArray(subject[key]))subject[key]=subject[key].map(s=>typeof s==='string'?s.trim():s);
 }
 if(Array.isArray(parsed.input?.honours?.rooms))parsed.input.honours.rooms=parsed.input.honours.rooms.map(s=>typeof s==='string'?s.trim():s);
 const reasons=validateBatch(parsed.input,{allowAuto:true});
 if(reasons.length)return {input:parsed.input,reasons};
 const assigned=assignFaculty({...parsed.input,batch:'III CSE'});
 return {input:assigned.input,reasons:[...assigned.reasons,...checkInput(assigned.input)]};
}
let activeSolvers=0;
function solve(input,settings) {
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../services/timetableWorker.js',import.meta.url),{workerData:{input,settings}});
  const timer=setTimeout(()=>{worker.terminate();reject(Object.assign(new Error('Search timed out. Adjust shared faculty or unavailable periods and retry.'),{status:400}));},65000);
  worker.once('message',result=>{clearTimeout(timer);resolve(result);});worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error('Timetable worker stopped. Please retry.'));});
 });
}

export const timetableGeneratorRouter=Router();
timetableGeneratorRouter.use(requireAuth,allowRoles('academic_coordinator'));
timetableGeneratorRouter.post('/check',(req,res)=>{const result=prepare(req.body);res.status(result.reasons.length?422:200).json(result);});
timetableGeneratorRouter.post('/save-check',(req,res)=>{const reasons=verifyTimetable(req.body.input,req.body.slots);res.status(reasons.length?422:200).json({reasons});});
timetableGeneratorRouter.post('/generate',async(req,res)=>{
 const prepared=prepare(req.body);if(prepared.reasons.length)return res.status(422).json(prepared);
 if(activeSolvers>=2)return res.status(429).json({message:'Two timetable searches are already running. Please try again shortly.'});
 activeSolvers++;
 try{const result=await solve(prepared.input,req.body.solver);res.status(result.reasons.length?422:200).json({...result,input:prepared.input});}finally{activeSolvers--;}
});
timetableGeneratorRouter.post('/save',async(req,res)=>{
 const {input,slots,name}=req.body;
 const reasons=[...validateBatch(input),...verifyTimetable(input,slots)];
 if(reasons.length) return res.status(422).json({message:reasons.join(' '),reasons});
 if(typeof name!=='string'||!name.trim()||name.length>200) return res.status(400).json({message:'Enter a draft name of at most 200 characters.'});
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const {rows}=await client.query('INSERT INTO timetable_versions(name,input) VALUES($1,$2) RETURNING *',[name.trim(),input]);
  const id=rows[0].id;
  for(const slot of slots) for(let p=slot.period;p<slot.period+slot.span_len;p++) {
   await client.query('INSERT INTO timetable_slots(version_id,section,day,period,subject,teachers,room,kind,span_start,span_len) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,slot.section,slot.day,p,slot.subject,slot.teachers,slot.rooms,slot.kind,slot.period,slot.span_len]);
  }
  for(let d=0;d<6;d++){
   const honours=input.honours;
   for(const [kind,resources] of [['teacher',[honours.teachers[honours.days[d]]]],['room',honours.rooms||[]]])for(const resource of resources)await client.query('INSERT INTO timetable_generator_resources VALUES($1,$2,$3,$4,$5)',[id,d,7,kind,resource]);
  }
  await client.query('COMMIT');res.status(201).json({version:rows[0]});
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
});
timetableGeneratorRouter.get('/:id([0-9a-fA-F-]{36})',async(req,res)=>{
 const {rows}=await pool.query('SELECT * FROM timetable_versions WHERE id=$1',[req.params.id]);
 if(!rows.length) return res.status(404).json({message:'Timetable version not found.'});
 const slots=await pool.query('SELECT section,day,period,subject,teachers,room AS rooms,kind,span_len FROM timetable_slots WHERE version_id=$1 AND period=span_start ORDER BY day,period',[req.params.id]);
 res.json({version:rows[0],slots:slots.rows});
});
timetableGeneratorRouter.post('/:id([0-9a-fA-F-]{36})/publish',async(req,res)=>{
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const {rows}=await client.query('SELECT * FROM timetable_versions WHERE id=$1 FOR UPDATE',[req.params.id]);
  if(!rows.length){await client.query('ROLLBACK');return res.status(404).json({message:'Timetable version not found.'});}
  const {rows:expanded}=await client.query('SELECT * FROM timetable_slots WHERE version_id=$1 ORDER BY day,period',[req.params.id]);
  const slots=expanded.filter(s=>s.period===s.span_start).map(s=>({...s,rooms:s.room}));
  const reasons=[...validateBatch(rows[0].input),...verifyTimetable(rows[0].input,slots)];
  for(const slot of slots)for(let p=slot.period;p<slot.period+slot.span_len;p++)if(!expanded.some(s=>s.section===slot.section&&s.day===slot.day&&s.period===p&&s.span_start===slot.period&&s.span_len===slot.span_len&&s.subject===slot.subject&&JSON.stringify(s.teachers)===JSON.stringify(slot.teachers)&&JSON.stringify(s.room)===JSON.stringify(slot.rooms)))reasons.push('Stored lab occupancy is incomplete or inconsistent. Save a new draft.');
  if(expanded.length!==144)reasons.push('Published timetable must have exactly 144 teaching-period rows.');
  if(reasons.length){await client.query('ROLLBACK');return res.status(422).json({message:reasons.join(' '),reasons});}
  const result=await client.query("UPDATE timetable_versions SET status='published' WHERE id=$1 RETURNING *",[req.params.id]);
  await client.query('COMMIT');res.json({version:result.rows[0]});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});
