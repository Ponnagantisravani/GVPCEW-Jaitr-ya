import {pool} from '../config/db.js';
import {academicAccess,allowedSections,requireSections,forbidden} from './academicAccess.js';
import {z} from 'zod';
export async function publicationScope(req,db=pool){
 const sections=await allowedSections(req,db);
 const role=req.user.activeRole||req.user.role||(req.user.roles||[])[0];
 const manager=['admin','academic_coordinator'].includes(role);
 const access=manager?await academicAccess(req,db):{institutionWide:false};
 return {sections,ids:sections.map(x=>x.id),wide:access.institutionWide,manager};
}
export async function publicationAudience(req,body,db=pool){
 const parsed=z.object({sectionIds:z.array(z.string().uuid()).min(1).max(500)}).safeParse(body);
 if(!parsed.success)throw Object.assign(new Error('Select the classes that should receive this document.'),{status:400});
 await academicAccess(req,db);
 await requireSections(req,parsed.data.sectionIds,db);
 return [...new Set(parsed.data.sectionIds)].sort();
}
export async function assertPublicationOwner(req,table,where,values,db=pool){
 // Callers provide constant table names and parameterized predicates.
 const old=await db.query(`select academic_section_ids from ${table} where ${where} for update`,values);
 if(!old.rows.length)return;
 const scope=await publicationScope(req,db);
 if(scope.wide)return;
 const ids = old.rows[0].academic_section_ids || [];
 if(ids.length && ids.some(id=>!scope.ids.includes(id)))throw forbidden();
}
export async function notifyPublication(db,ids,title,body,type,subjectId=null,facultyId=null){
 const hasSections = Array.isArray(ids) && ids.length > 0;
 await db.query(`insert into notifications(user_id,title,body,type,link)
 select distinct recipient.user_id,$2,$3,$4,case when exists(select 1 from faculty where user_id=recipient.user_id) then '/faculty-dashboard' else '/student-dashboard' end from (
 select user_id from students where not $7 or academic_section_id=any($1::uuid[])
 union select f.user_id from timetable t join faculty f on f.id=t.faculty_id where $5::uuid is not null and t.status='published' and t.subject_id=$5 and (not $7 or t.academic_section_id=any($1::uuid[]))
 union select user_id from student_coordinator_sections where not $7 or academic_section_id=any($1::uuid[])
 union select f.user_id from faculty f where $6::uuid is not null and f.id=$6
 ) recipient join users u on u.id=recipient.user_id where u.active`,[ids||[],title,body,type,subjectId,facultyId,hasSections]);
}
export function projectExamPayload(payload,sections){
 if(!Array.isArray(payload?.rows))return payload;
 const aliases={cse:['cse','computerscienceandengineering','computerscience'],it:['it','informationtechnology'],csm:['csm','cseaiml','artificialintelligenceandmachinelearning'],csc:['csc','csecybersecurity','cybersecurity'],ece:['ece','electronicsandcommunicationengineering'],eee:['eee','electricalandelectronicsengineering']};
 const names=sections.map(x=>x.department.toLowerCase().replace(/[^a-z]/g,''));
 return {...payload,rows:payload.rows.map(row=>({...row,...(row.subjects?{subjects:Object.fromEntries(Object.entries(row.subjects).filter(([key])=>names.some(name=>name===key||(aliases[key]||[]).includes(name))))}:{})}))};
}
