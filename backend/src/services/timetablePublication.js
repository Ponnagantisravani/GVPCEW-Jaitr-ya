const normalizeName = value => String(value || '').toLowerCase()
  .replace(/\b(dr|mr|mrs|ms|prof|professor)\.?\s*/g, '')
  .replace(/[^a-z0-9]/g, '');

export function resolveTimetableFaculty(faculty, slot) {
  if (slot.facultyId) return faculty.find(item => item.id === slot.facultyId) || null;
  const name = normalizeName(slot.faculty);
  if (!name) return null;
  const matches = faculty.filter(item => normalizeName(item.full_name) === name ||
    String(item.email || '').toLowerCase() === String(slot.faculty).trim().toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

export async function syncTimetableAssignments(client, sectionIds, userId) {
  // A section/subject has one teaching owner in the assignment schema.
  const conflicting = await client.query(`select academic_section_id,subject_id from timetable
    where status='published' and academic_section_id=any($1::uuid[])
    group by academic_section_id,subject_id having count(distinct faculty_id)>1`, [sectionIds]);
  if (conflicting.rows.length) throw Object.assign(new Error('A subject has multiple faculty in the same section. Assign one faculty account per section subject before publishing.'), {status:400});
  await client.query(`insert into faculty_section_assignments
    (faculty_id,department_id,year_number,semester_number,academic_section_id,subject_id,academic_year,status,created_by)
    select distinct t.faculty_id,x.department_id,x.year_number,x.semester_number,x.id,t.subject_id,x.academic_year,'active',$2::uuid
    from timetable t join academic_sections x on x.id=t.academic_section_id
    where t.status='published' and x.id=any($1::uuid[])
    on conflict(academic_section_id,subject_id) do update set
    faculty_id=excluded.faculty_id,status='active',updated_at=now()`, [sectionIds,userId]);
}
