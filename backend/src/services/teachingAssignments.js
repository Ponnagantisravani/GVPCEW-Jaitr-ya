// Published periods grant teaching access. An explicit assignment remains
// available until that particular subject has published teaching periods.
export const teachingAssignments = `(select distinct on (t.faculty_id,t.academic_section_id,t.subject_id)
  t.id,t.faculty_id,t.academic_section_id,t.subject_id,'active'::text status
  from timetable t where t.status='published'
  order by t.faculty_id,t.academic_section_id,t.subject_id,t.id)`;

export const effectiveFacultyAssignments = `(select * from ${teachingAssignments} published_assignments
  union all
  select fa.id,fa.faculty_id,fa.academic_section_id,fa.subject_id,fa.status
  from faculty_section_assignments fa where fa.status='active' and not exists(
    select 1 from timetable live where live.academic_section_id=fa.academic_section_id
    and live.subject_id=fa.subject_id and live.status='published'))`;
