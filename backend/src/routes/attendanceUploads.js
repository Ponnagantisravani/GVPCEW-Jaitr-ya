import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {effectiveFacultyAssignments} from '../services/teachingAssignments.js';
export const attendanceUploadsRouter=Router();
attendanceUploadsRouter.use(requireAuth,allowRoles('faculty'));
attendanceUploadsRouter.get('/',async(req,res)=>{
 const relation=await pool.query("select to_regclass('uploaded_attendance_registers') present");
 if(!relation.rows[0].present)return res.json({registers:[]});
 const {rows}=await pool.query(`select r.id,r.month,r.title,r.payload,x.section_name,x.year_number,x.academic_year
 from uploaded_attendance_registers r join academic_sections x on x.id=r.academic_section_id
 where $1::uuid=any(r.reader_user_ids) or exists(select 1 from ${effectiveFacultyAssignments} fa join faculty f on f.id=fa.faculty_id where f.user_id=$1 and fa.academic_section_id=x.id)
 order by r.month desc,r.title`,[req.user.sub]);
 res.json({registers:rows});
});
