const normalizeName = value => String(value || '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(dr|mr|mrs|ms|prof|professor)\.?\s*/g, '')
  .replace(/[^a-z0-9]/g, '');

const nameTokens = value => String(value || '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(dr|mr|mrs|ms|prof|professor)\.?\s*/g, '')
  .match(/[a-z0-9]+/g) || [];

function sameFacultyName(left, right) {
  if (/[\/&,;]/.test(String(left || '')) || /[\/&,;]/.test(String(right || ''))) return false;
  const leftTokens = nameTokens(left), rightTokens = nameTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  if (leftTokens.join('') === rightTokens.join('')) return true;
  // Timetable sources commonly abbreviate middle names to initials ("M Aswini"
  // vs "Madhavi Aswini"). Require the final name and each supplied initial to
  // agree; never resolve a surname-only/partial match.
  if (leftTokens.at(-1) !== rightTokens.at(-1)) return false;
  const leftGiven = leftTokens.slice(0, -1), rightGiven = rightTokens.slice(0, -1);
  if (!leftGiven.length || !rightGiven.length) return false;
  const leftScore = leftGiven.reduce((sum, token) => sum + token.length, 0);
  const rightScore = rightGiven.reduce((sum, token) => sum + token.length, 0);
  const [shorter, longer] = leftScore <= rightScore ? [leftGiven, rightGiven] : [rightGiven, leftGiven];
  let position = 0;
  for (const token of shorter) {
    const match = longer.slice(position).findIndex(candidate => candidate === token || (token.length === 1 && candidate.startsWith(token)));
    if (match < 0) return false;
    position += match + 1;
  }
  return true;
}

export function resolveTimetableFaculty(faculty, slot) {
  if (slot.facultyId) return faculty.find(item => item.id === slot.facultyId) || null;
  const name = normalizeName(slot.faculty);
  if (!name) return null;
  const matches = faculty.filter(item => normalizeName(item.full_name) === name || sameFacultyName(item.full_name, slot.faculty) ||
    String(item.email || '').toLowerCase() === String(slot.faculty).trim().toLowerCase());
  if (matches.length === 1) return matches[0];
  // Imported timetable aliases can collide with synthetic seed accounts. If
  // exactly one match has a real institutional email, use that account; keep
  // genuinely ambiguous real accounts unresolved so the editor can store an ID.
  const institutional = matches.filter(item => /@gvpcew\.ac\.in$/i.test(String(item.email || '')));
  return institutional.length === 1 ? institutional[0] : null;
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
