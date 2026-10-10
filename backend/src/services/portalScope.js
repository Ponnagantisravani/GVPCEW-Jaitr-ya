import {effectiveFacultyAssignments} from './teachingAssignments.js';
// $1 is the authenticated user, $2 is a role verified by requireAuth.
export const managementScope = "($2::text='admin' or ($2='academic_coordinator' and exists(select 1 from academic_institution_access permission where permission.user_id=$1)))";
export const manageDepartmentScope = department => `(${managementScope} or ($2='academic_coordinator' and exists(select 1 from academic_coordinator_departments permission where permission.user_id=$1 and permission.department_id=${department})))`;
export const sectionScope = section => `(($2='student' and exists(select 1 from students owner where owner.user_id=$1 and owner.academic_section_id=${section})) or ($2='student_coordinator' and exists(select 1 from student_coordinator_sections responsibility where responsibility.user_id=$1 and responsibility.academic_section_id=${section})))`;
export const teachingScope = section => `exists(select 1 from ${effectiveFacultyAssignments} assigned join faculty owner on owner.id=assigned.faculty_id where owner.user_id=$1 and assigned.academic_section_id=${section} and assigned.status='active')`;
export const subjectScope = alias => `(
  ${manageDepartmentScope(alias+'.department_id')}
  or ($2='faculty' and exists(select 1 from ${effectiveFacultyAssignments} assigned join faculty owner on owner.id=assigned.faculty_id where owner.user_id=$1 and assigned.subject_id=${alias}.id and assigned.status='active'))
  or ($2 in ('student','student_coordinator') and exists(select 1 from timetable assigned where assigned.subject_id=${alias}.id and assigned.status='published' and ${sectionScope('assigned.academic_section_id')}))
)`;
export const noticeScope = alias => `(${managementScope} or ($2='academic_coordinator' and (${manageDepartmentScope(alias+'.target_department_id')} or (${alias}.target_department_id is null and ${alias}.target_academic_section_id is null))) or (
 (${alias}.target_academic_section_id is null or ($2='faculty' and ${teachingScope(alias+'.target_academic_section_id')}) or ($2 in ('student','student_coordinator') and ${sectionScope(alias+'.target_academic_section_id')}))
 and (${alias}.target_department_id is null or ($2='faculty' and (${alias}.target_department_id=(select department_id from faculty where user_id=$1) or ${teachingScope(alias+'.target_academic_section_id')}))
 or ($2='student' and ${alias}.target_department_id=(select department_id from students where user_id=$1))
 or ($2='student_coordinator' and exists(select 1 from student_coordinator_sections r join academic_sections x on x.id=r.academic_section_id where r.user_id=$1 and x.department_id=${alias}.target_department_id)))))`;
