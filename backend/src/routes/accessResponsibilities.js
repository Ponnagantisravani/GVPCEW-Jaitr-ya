import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {z} from 'zod';
export const accessResponsibilitiesRouter=Router();
accessResponsibilitiesRouter.use(requireAuth,allowRoles('admin'));
accessResponsibilitiesRouter.get('/',async(_req,res)=>{
 const [users,departments,sections]=await Promise.all([
 pool.query(`select u.id,u.full_name,u.email,u.active,array(select role from user_roles where user_id=u.id) roles,
 array(select department_id from academic_coordinator_departments where user_id=u.id) department_ids,
 array(select academic_section_id from student_coordinator_sections where user_id=u.id) section_ids,
 exists(select 1 from academic_institution_access where user_id=u.id) institution_wide
 from users u order by u.full_name`),
 pool.query('select id,name from departments order by name'),
 pool.query(`select x.*,d.name department from academic_sections x join departments d on d.id=x.department_id order by d.name,x.academic_year,x.year_number,x.section_name`)]);
 res.json({users:users.rows,departments:departments.rows,sections:sections.rows});
});
const schema=z.object({departmentIds:z.array(z.string().uuid()).max(100),sectionIds:z.array(z.string().uuid()).max(500),institutionWide:z.boolean(),active:z.boolean()});
accessResponsibilitiesRouter.put('/:id',async(req,res)=>{
 const p=schema.safeParse(req.body);if(!p.success||!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({message:'Choose valid responsibilities and account status.'});
 if(req.params.id===req.user.sub&&!p.data.active)return res.status(400).json({message:'You cannot deactivate your own account.'});
 const client=await pool.connect();
 try{await client.query('begin');
 const user=await client.query('select id from users where id=$1 for update',[req.params.id]);if(!user.rowCount){await client.query('rollback');return res.status(404).json({message:'Account not found.'});}
 const roles=(await client.query('select role from user_roles where user_id=$1',[req.params.id])).rows.map(r=>r.role);
 if((p.data.departmentIds.length||p.data.institutionWide)&&!roles.includes('academic_coordinator') || p.data.sectionIds.length&&!roles.includes('student_coordinator')){await client.query('rollback');return res.status(400).json({message:'Assign the coordinator role before assigning its responsibilities.'});}
 for(const table of ['academic_coordinator_departments','student_coordinator_sections','academic_institution_access'])await client.query(`delete from ${table} where user_id=$1`,[req.params.id]);
 for(const id of new Set(p.data.departmentIds))await client.query('insert into academic_coordinator_departments(user_id,department_id,assigned_by) values($1,$2,$3)',[req.params.id,id,req.user.sub]);
 for(const id of new Set(p.data.sectionIds))await client.query('insert into student_coordinator_sections(user_id,academic_section_id,assigned_by) values($1,$2,$3)',[req.params.id,id,req.user.sub]);
 if(p.data.institutionWide)await client.query('insert into academic_institution_access(user_id,assigned_by) values($1,$2)',[req.params.id,req.user.sub]);
 await client.query('update users set active=$2 where id=$1',[req.params.id,p.data.active]);
 await client.query('commit');res.json({message:'Responsibilities and account status updated.'});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
