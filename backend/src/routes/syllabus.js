import { Router } from '../utils/router.js';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicationScope, publicationAudience, assertPublicationOwner, notifyPublication } from '../services/publicationAccess.js';
import { parseSyllabusPdf, formatSyllabusFilename } from '../services/syllabusPdfParser.js';
import { requireDepartment } from '../services/academicAccess.js';

import { ZipArchive } from 'archiver';

export const syllabusRouter = Router();
const editors = ['academic_coordinator', 'admin'];
const isEditor = req => (req.user.roles || [req.user.role]).some(role => editors.includes(role));

const selectQuery = `
  select s.id, s.title, s.department, s.department_id, s.academic_section_ids, s.subject_id, s.faculty_id,
         s.batch, s.description, s.file_name, s.structure, s.status, s.created_at, s.published_at,
         (s.pdf is not null) as has_pdf,
         u.full_name as assigned_faculty_name, u.email as assigned_faculty_email, f.employee_code as assigned_faculty_code,
         sub.code as subject_code, sub.name as subject_name
  from syllabi s
  left join faculty f on f.id = s.faculty_id
  left join users u on u.id = f.user_id
  left join subjects sub on sub.id = s.subject_id
`;

const numberCell = z.string().max(12).regex(/^(?:\d+(?:\.\d+)?|-)?$/);
const courseSchema = z.object({
  code: z.string().trim().max(40), category: z.string().trim().max(30), title: z.string().trim().min(1).max(250),
  l: numberCell, p: numberCell, internal: numberCell, external: numberCell, total: numberCell, credits: numberCell,
  objectives: z.string().max(12000).default(''), outcomes: z.string().max(12000).default(''),
  units: z.string().max(30000).default(''), references: z.string().max(12000).default('')
});
const structureSchema = z.object({ semesters: z.array(z.object({
  name: z.string().trim().min(1).max(100), courses: z.array(courseSchema).min(1).max(60)
})).min(1).max(12) });
const schema = z.object({
  title: z.string().trim().min(1).max(180), department: z.string().trim().min(1).max(100),
  batch: z.string().trim().min(1).max(100), description: z.string().trim().max(3000).default(''),
  file_name: z.string().trim().min(1).max(200).optional(), pdf: z.string().min(1).max(28_000_000).optional(),
  structure: structureSchema.optional(), subjectId: z.string().uuid().optional(),
  facultyId: z.string().uuid().optional()
}).refine(data => Boolean(data.structure) !== Boolean(data.pdf && data.file_name));

syllabusRouter.use(requireAuth, allowRoles(...editors, 'student', 'student_coordinator', 'faculty'));

syllabusRouter.get('/metadata', allowRoles(...editors), asyncHandler(async (req, res) => {
  const scope = await publicationScope(req);
  const departmentIds = [...new Set(scope.sections.map(s => s.department_id))];
  const [facultyRes, subjectsRes, departmentsRes] = await Promise.all([
    pool.query(`
      select f.id, f.user_id, f.employee_code, f.department_id, u.full_name, u.email, d.name as department
      from faculty f
      join users u on u.id = f.user_id
      left join departments d on d.id = f.department_id
      where $1 or f.department_id = any($2::uuid[])
      order by u.full_name
    `, [scope.wide, departmentIds]),
    pool.query(`
      select sub.id, sub.code, sub.name, sub.department_id, sub.year_number, sub.semester_number, sub.faculty_id,
             d.name as department, u.full_name as faculty_name
      from subjects sub
      left join departments d on d.id = sub.department_id
      left join faculty f on f.id = sub.faculty_id
      left join users u on u.id = f.user_id
      where $1 or sub.department_id = any($2::uuid[])
      order by sub.code
    `, [scope.wide, departmentIds]),
    pool.query(`select id, name from departments order by name`)
  ]);

  res.json({
    faculty: facultyRes.rows,
    subjects: subjectsRes.rows,
    departments: departmentsRes.rows,
    sections: scope.sections
  });
}));

syllabusRouter.param('id', (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ message: 'Invalid syllabus ID.' });
  next();
});

// The coordinator receives detected records first; nothing is published until
// the reviewed list is sent to /publish-detected.
syllabusRouter.post('/detect', allowRoles(...editors), asyncHandler(async (req, res) => {
  const { pdf, department = '', year = '', semester = '' } = req.body || {};
  const file = Buffer.from(String(pdf || ''), 'base64');
  if (!file.length || file.length > 25 * 1024 * 1024 || file.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ message: 'Upload a valid PDF no larger than 25 MB.' });
  }
  const subjects = await parseSyllabusPdf(file, { department, year, semester });
  if (!subjects.length) {
    return res.status(422).json({ message: 'No course-code subject sections were detected. Check that this is a text-based syllabus PDF.' });
  }
  res.json({
    subjects,
    documentType: subjects[0]?.source_type || 'MAIN_CURRICULUM',
    totalDetected: subjects.length
  });
}));

// Generates and streams a ZIP archive containing all per-subject PDFs organized by semester folder + course_index.csv
syllabusRouter.post('/export-zip', allowRoles(...editors), asyncHandler(async (req, res) => {
  const { subjects = [], archiveName = 'BTech_Syllabus_Split_Archive.zip' } = req.body || {};
  if (!Array.isArray(subjects) || !subjects.length) {
    return res.status(400).json({ message: 'No subjects provided for ZIP export.' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${archiveName.replace(/[^a-zA-Z0-9_\.-]/g, '_')}"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', err => { throw err; });
  archive.pipe(res);

  const csvRows = [
    'course_code,course_title,semester,category,start_page,end_page,total_pages,file_path'
  ];

  const jsonIndex = [];

  for (const sub of subjects) {
    const code = String(sub.courseCode || sub.course_code || 'COURSE').toUpperCase();
    const title = sub.courseTitle || sub.course_name || 'Subject Syllabus';
    const category = sub.category || 'PC';
    const semName = sub.semester || `Semester ${sub.semester_number || 1}`;
    
    // Clean folder name per semester
    let folder = semName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    if (category === 'PE' || category === 'PEC') folder = 'Professional_Electives';
    if (category === 'OE' || category === 'OEC') folder = 'Open_Electives';

    const fileName = sub.fileName || sub.file_name || formatSyllabusFilename(code, title);
    const startP = sub.startPage ?? sub.start_page ?? sub.page_start;
    const endP = sub.endPage ?? sub.end_page ?? sub.page_end;
    const countP = sub.totalPages ?? sub.total_pages ?? sub.pageCount;
    const relPath = `${folder}/${fileName}`;

    // Add PDF buffer to ZIP folder if present
    if (sub.pdf_base64) {
      const pdfBuffer = Buffer.from(sub.pdf_base64, 'base64');
      archive.append(pdfBuffer, { name: relPath });
    }

    const csvLine = `"${code}","${title.replace(/"/g, '""')}","${semName}","${category}",${startP != null ? startP : ''},${endP != null ? endP : ''},${countP != null ? countP : ''},"${relPath}"`;
    csvRows.push(csvLine);

    jsonIndex.push({
      course_code: code,
      course_title: title,
      semester: semName,
      category,
      start_page: startP,
      end_page: endP,
      total_pages: countP,
      file_path: relPath
    });
  }

  // Add course_index.csv and course_index.json to root of ZIP
  archive.append(csvRows.join('\n'), { name: 'course_index.csv' });
  archive.append(JSON.stringify(jsonIndex, null, 2), { name: 'course_index.json' });

  await archive.finalize();
}));

syllabusRouter.post('/publish-detected', allowRoles(...editors), asyncHandler(async (req, res) => {
  const { subjects, sectionIds, batch, file_name = '', publishFullSyllabus = true, fullTitle, fullDescription, pdf } = req.body || {};
  if (!Array.isArray(subjects) || !subjects.length || subjects.length > 200 || !batch?.trim()) {
    return res.status(400).json({ message: 'Provide reviewed subjects, an admitted batch, and target classes.' });
  }
  const allowed = await publicationAudience(req, { sectionIds });
  const scope = await publicationScope(req);
  const departmentIds = [...new Set(scope.sections.filter(s => allowed.includes(s.id)).map(s => s.department_id))];
  if (departmentIds.length !== 1) return res.status(400).json({ message: 'Select classes in one department.' });
  await requireDepartment(req, departmentIds[0]);

  const departmentName = scope.sections.find(s => s.department_id === departmentIds[0])?.department || 'Department';
  const client = await pool.connect();
  try {
    await client.query('begin');
    const created = [];
    let masterRecord = null;

    // 1. If requested and PDF is provided, create and publish the master 4-Year Syllabus PDF for students
    if (publishFullSyllabus && pdf && typeof pdf === 'string') {
      const pdfBuffer = Buffer.from(pdf, 'base64');
      if (pdfBuffer.length && pdfBuffer.subarray(0, 5).toString() === '%PDF-') {
        const title = fullTitle?.trim() || `B.Tech. ${departmentName} — Four Year Scheme and Syllabi`;
        const desc = fullDescription?.trim() || `Autonomous 4-year scheme of instruction, course structure, and complete detailed syllabi for all eight semesters (Admitted Batch: ${batch.trim()}).`;
        const allDeptSecRows = (await client.query('select id from academic_sections where department_id = $1', [departmentIds[0]])).rows;
        const allDeptSections = allDeptSecRows.map(r => r.id);
        const fullSectionIds = allDeptSections.length > 0 ? [...new Set([...allowed, ...allDeptSections])] : allowed;

        const fullRow = (await client.query(`
          insert into syllabi (title, department, batch, description, file_name, pdf, created_by, department_id, academic_section_ids, status, published_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', now())
          returning id, title, department, department_id, academic_section_ids, subject_id, faculty_id, batch, description, file_name, structure, status, created_at, published_at, true as has_pdf
        `, [title, departmentName, batch.trim(), desc, file_name || '4_Year_Syllabus.pdf', pdfBuffer, req.user.sub, departmentIds[0], fullSectionIds])).rows[0];
        
        masterRecord = fullRow;
        created.push(fullRow);
        await notifyPublication(client, fullSectionIds, '4-Year B.Tech Syllabus Published', `${title} (${batch.trim()}) is now available in your Syllabus menu.`, 'syllabus');
      }
    }

    // 2. Publish each split subject syllabus and allocate to designated faculty member & class sections
    for (const item of subjects) {
      const code = String(item.course_code || item.courseCode || '').trim().toUpperCase();
      const name = String(item.course_name || item.courseTitle || '').trim();
      if (!/^[A-Z0-9_\-\/\s]{2,40}$/i.test(code) || !name) {
        throw new Error(`Every reviewed subject needs a valid course code and name (error on "${code || 'unnamed'}").`);
      }

      const assignedFacultyId = item.faculty_id || null;
      const targetSectionIds = Array.isArray(item.section_ids) && item.section_ids.length ? item.section_ids : allowed;

      const subject = (await client.query(`
        insert into subjects(code, name, department_id, year_number, semester_number, faculty_id)
        values($1, $2, $3, $4, $5, $6)
        on conflict(code) do update set
          name = excluded.name,
          department_id = excluded.department_id,
          year_number = coalesce(excluded.year_number, subjects.year_number),
          semester_number = coalesce(excluded.semester_number, subjects.semester_number),
          faculty_id = coalesce(excluded.faculty_id, subjects.faculty_id)
        returning id, code, name
      `, [code, name, departmentIds[0], Number(item.year_number) || null, Number(item.semester_number) || null, assignedFacultyId])).rows[0];

      const vals = ['course_outcomes', 'unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5', 'textbooks', 'reference_books', 'web_references'].map(k => String(item[k] || ''));
      await client.query(`
        insert into subject_syllabi(subject_id, course_outcomes, unit_1, unit_2, unit_3, unit_4, unit_5, textbooks, reference_books, web_references, source_file_name, created_by)
        values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        on conflict(subject_id) do update set
          (course_outcomes, unit_1, unit_2, unit_3, unit_4, unit_5, textbooks, reference_books, web_references, source_file_name, updated_at) =
          ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      `, [subject.id, ...vals, file_name, req.user.sub]);

      const unitsFormatted = ['I', 'II', 'III', 'IV', 'V'].map((n, idx) => {
        const uVal = item[`unit_${idx + 1}`];
        return uVal ? `UNIT ${n}\n${uVal}` : '';
      }).filter(Boolean).join('\n\n');

      const structure = {
        annexure: item.annexure || '',
        category: item.category || '',
        ltpc: item.ltpc || `${item.l || 3}-0-${item.p || 0}-${item.credits || 3}`,
        co_intro: item.co_intro || 'At the end of the Course, the student shall be able to:',
        co_list: Array.isArray(item.co_list) && item.co_list.length ? item.co_list : [],
        unit_1: item.unit_1 || '',
        unit_2: item.unit_2 || '',
        unit_3: item.unit_3 || '',
        unit_4: item.unit_4 || '',
        unit_5: item.unit_5 || '',
        unit_1_lectures: item.unit_1_lectures || '09 Lectures',
        unit_2_lectures: item.unit_2_lectures || '09 Lectures',
        unit_3_lectures: item.unit_3_lectures || '12 Lectures',
        unit_4_lectures: item.unit_4_lectures || '09 Lectures',
        unit_5_lectures: item.unit_5_lectures || '09 Lectures',
        text_books_list: Array.isArray(item.text_books_list) && item.text_books_list.length ? item.text_books_list : [],
        reference_books_list: Array.isArray(item.reference_books_list) && item.reference_books_list.length ? item.reference_books_list : [],
        web_references_list: Array.isArray(item.web_references_list) && item.web_references_list.length ? item.web_references_list : [],
        semesters: [{
          name: item.semester || `Semester ${item.semester_number || 1}`,
          courses: [{
            ...item,
            code,
            title: name,
            category: item.category || '',
            l: item.l || '3',
            p: item.p || '0',
            internal: item.internal || '30',
            external: item.external || '70',
            total: item.total || '100',
            credits: item.credits || '3',
            objectives: item.objectives || '',
            outcomes: item.course_outcomes || '',
            units: unitsFormatted,
            references: [item.textbooks, item.reference_books, item.web_references].filter(Boolean).join('\n\n')
          }]
        }]
      };

      const pdfBytes = item.pdf_base64 ? Buffer.from(item.pdf_base64, 'base64') : null;
      const splitFileName = item.file_name || formatSyllabusFilename(code, name);

      const row = (await client.query(`
        insert into syllabi(title, department, batch, description, file_name, pdf, structure, subject_id, faculty_id, created_by, department_id, academic_section_ids, status, published_at)
        values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'published', now())
        returning id, title, department, department_id, academic_section_ids, subject_id, faculty_id, batch, description, file_name, structure, status, created_at, published_at, true as has_pdf
      `, [name, item.department || departmentName, batch.trim(), `Detailed syllabus for ${code} - ${name}`, splitFileName, pdfBytes, structure, subject.id, assignedFacultyId, req.user.sub, departmentIds[0], targetSectionIds])).rows[0];

      created.push(row);

      // Notify assigned faculty if specified
      if (assignedFacultyId) {
        await notifyPublication(client, targetSectionIds, 'Course Syllabus Allocated', `You have been allocated the syllabus for ${code} — ${name} (${departmentName}, Batch: ${batch.trim()}).`, 'syllabus', subject.id, assignedFacultyId);
      } else {
        await notifyPublication(client, targetSectionIds, 'Course Syllabus Published', `Detailed syllabus for ${code} — ${name} is available in your Syllabus tab.`, 'syllabus', subject.id);
      }
    }

    await client.query('commit');
    res.status(201).json({ syllabi: created, masterSyllabus: masterRecord });
  } catch (error) {
    await client.query('rollback');
    console.error('ERROR IN PUBLISH-DETECTED:', error);
    if (error.message.includes('Every reviewed') || error.message.includes('valid course code')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: error.message, stack: error.stack });
  } finally {
    client.release();
  }
}));

syllabusRouter.get('/', asyncHandler(async (req, res) => {
  const manage = req.query.manage === 'true' && isEditor(req);

  if (req.user.activeRole === 'faculty' && !manage) {
    const { rows } = await pool.query(`
      ${selectQuery}
      where s.status = 'published' and (
        s.faculty_id = (select id from faculty where user_id = $1)
        or (s.subject_id is not null and exists (
          select 1 from subjects sub where sub.id = s.subject_id and sub.faculty_id = (select id from faculty where user_id = $1)
        ))
        or (s.subject_id is not null and exists (
          select 1 from timetable t join faculty f on f.id = t.faculty_id
          where f.user_id = $1 and t.status = 'published' and t.subject_id = s.subject_id and t.academic_section_id = any(s.academic_section_ids)
        ))
        or (s.subject_id is null and (
          s.department_id = (select department_id from faculty where user_id = $1)
          or exists (
            select 1 from departments d 
            where d.id = s.department_id 
              and lower(d.name) = lower((select d2.name from faculty f2 join departments d2 on d2.id = f2.department_id where f2.user_id = $1))
          )
          or lower(s.department) = lower((select d3.name from faculty f3 join departments d3 on d3.id = f3.department_id where f3.user_id = $1))
          or (s.department = 'CSE' and exists (
            select 1 from faculty f4 join departments d4 on d4.id = f4.department_id where f4.user_id = $1 and lower(d4.name) like '%computer%'
          ))
        ))
      )
      order by s.created_at desc
    `, [req.user.sub]);
    return res.json({ syllabi: rows });
  }

  const scope = await publicationScope(req);
  const { rows } = await pool.query(`
    ${selectQuery}
    where ($1 or s.status = 'published') and (
      $2 or s.created_by = $4
      or (s.academic_section_ids is not null and s.academic_section_ids && $3::uuid[])
      or (
        (s.subject_id is null or s.academic_section_ids is null or array_length(s.academic_section_ids, 1) is null or array_length(s.academic_section_ids, 1) = 0)
        and (
          exists (
            select 1 from academic_sections sec 
            join departments d on d.id = sec.department_id 
            where sec.id = any($3::uuid[]) and (sec.department_id = s.department_id or lower(d.name) = lower(s.department) or (s.department = 'CSE' and lower(d.name) like '%computer%'))
          )
          or exists (
            select 1 from academic_coordinator_departments acd 
            join departments d on d.id = acd.department_id 
            where acd.user_id = $4 and (acd.department_id = s.department_id or lower(d.name) = lower(s.department) or (s.department = 'CSE' and lower(d.name) like '%computer%'))
          )
        )
      )
    )
    order by s.created_at desc
  `, [manage, scope.wide, scope.ids, req.user.sub]);

  if (!scope.manager) {
    for (const row of rows) {
      if (row.academic_section_ids?.length) {
        row.academic_section_ids = row.academic_section_ids.filter(id => scope.ids.includes(id));
      }
    }
  }
  res.json({ syllabi: rows });
}));

syllabusRouter.get('/:id/pdf', asyncHandler(async (req, res) => {
  if (req.user.activeRole === 'faculty' && !isEditor(req)) {
    const { rows } = await pool.query(`
      select s.pdf from syllabi s where s.id = $1 and s.status = 'published' and (
        s.faculty_id = (select id from faculty where user_id = $2)
        or (s.subject_id is not null and exists (
          select 1 from subjects sub where sub.id = s.subject_id and sub.faculty_id = (select id from faculty where user_id = $2)
        ))
        or (s.subject_id is not null and exists (
          select 1 from timetable t join faculty f on f.id = t.faculty_id
          where f.user_id = $2 and t.status = 'published' and t.subject_id = s.subject_id and t.academic_section_id = any(s.academic_section_ids)
        ))
        or (s.subject_id is null and (
          s.department_id = (select department_id from faculty where user_id = $2)
          or exists (
            select 1 from departments d 
            where d.id = s.department_id 
              and lower(d.name) = lower((select d2.name from faculty f2 join departments d2 on d2.id = f2.department_id where f2.user_id = $2))
          )
          or lower(s.department) = lower((select d3.name from faculty f3 join departments d3 on d3.id = f3.department_id where f3.user_id = $2))
          or (s.department = 'CSE' and exists (
            select 1 from faculty f4 join departments d4 on d4.id = f4.department_id where f4.user_id = $2 and lower(d4.name) like '%computer%'
          ))
        ))
      )
    `, [req.params.id, req.user.sub]);
    if (!rows[0]?.pdf) return res.status(404).json({ message: 'PDF not found or unavailable to you.' });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="syllabus.pdf"', 'Cache-Control': 'private, no-store' });
    return res.send(rows[0].pdf);
  }

  const scope = await publicationScope(req);
  const { rows } = await pool.query(`
    select s.pdf from syllabi s
    where s.id = $1 
      and ($2 or s.status = 'published') 
      and (
        $2 or $3 or s.created_by = $5
        or (s.academic_section_ids is not null and s.academic_section_ids && $4::uuid[])
        or (
          (s.subject_id is null or s.academic_section_ids is null or array_length(s.academic_section_ids, 1) is null or array_length(s.academic_section_ids, 1) = 0)
          and (
            exists (
              select 1 from academic_sections sec 
              join departments d on d.id = sec.department_id 
              where sec.id = any($4::uuid[]) and (sec.department_id = s.department_id or lower(d.name) = lower(s.department) or (s.department = 'CSE' and lower(d.name) like '%computer%'))
            )
            or exists (
              select 1 from academic_coordinator_departments acd 
              join departments d on d.id = acd.department_id 
              where acd.user_id = $5 and (acd.department_id = s.department_id or lower(d.name) = lower(s.department) or (s.department = 'CSE' and lower(d.name) like '%computer%'))
            )
          )
        )
      )
  `, [req.params.id, isEditor(req), scope.wide, scope.ids, req.user.sub]);
  if (!rows[0]?.pdf) return res.status(404).json({ message: 'PDF not found or unavailable to you.' });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="syllabus.pdf"', 'Cache-Control': 'private, no-store' });
  res.send(rows[0].pdf);
}));

async function save(req, res) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Complete the title, department and batch. Each semester needs a named course; hours, marks and credits must be nonnegative numbers, blank or a dash. Attach a PDF or provide a course structure.' });
  const data = parsed.data;
  const scope = await publicationScope(req);

  let sectionIds = [];
  try {
    sectionIds = await publicationAudience(req, req.body.sectionIds ? req.body : { sectionIds: scope.ids });
  } catch (err) {
    if (scope.wide || !scope.ids.length) {
      sectionIds = scope.ids;
    } else {
      throw err;
    }
  }

  let departmentIds = [...new Set(scope.sections.filter(s => sectionIds.includes(s.id)).map(s => s.department_id))];
  if (departmentIds.length > 1) return res.status(400).json({ message: 'A syllabus must target classes in one department.' });

  let deptId = departmentIds[0];
  if (!deptId) {
    const dRes = await pool.query('select id from departments where lower(name)=lower($1) limit 1', [data.department]);
    deptId = dRes.rows[0]?.id || (await pool.query('select id from departments limit 1')).rows[0]?.id;
  }
  if (!deptId) {
    deptId = (await pool.query('insert into departments (name) values ($1) on conflict (name) do update set name=excluded.name returning id', [data.department || 'General'])).rows[0].id;
  }

  if (departmentIds.length === 1) {
    await requireDepartment(req, deptId);
  }

  if (data.subjectId) {
    const subject = await pool.query('select department_id from subjects where id=$1', [data.subjectId]);
    if (!subject.rows[0] || (deptId && subject.rows[0].department_id !== deptId)) return res.status(400).json({ message: 'Choose a subject from the same department as the selected classes.' });
  }

  data.department = scope.sections.find(s => s.department_id === deptId)?.department || data.department;
  const pdf = data.structure ? null : Buffer.from(data.pdf, 'base64');
  if (pdf && (pdf.length > 25 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-')) {
    return res.status(400).json({ message: 'Upload a valid PDF no larger than 25 MB.' });
  }

  const values = [data.title, data.department, data.batch, data.description, data.structure ? null : data.file_name, pdf, data.structure || null, data.subjectId || null, data.facultyId || null];
  const client = await pool.connect();
  let rows;
  try {
    await client.query('begin');
    if (req.params.id) await assertPublicationOwner(req, 'syllabi', 'id=$1', [req.params.id], client);
    ({ rows } = req.params.id
      ? await client.query(`update syllabi set title=$1, department=$2, batch=$3, description=$4, file_name=$5, pdf=$6, structure=$7, subject_id=$8, faculty_id=$9, department_id=$11, academic_section_ids=$12
          where id=$10 and status='draft' returning id, title, department, department_id, academic_section_ids, subject_id, faculty_id, batch, description, file_name, structure, status, created_at, published_at, (pdf is not null) as has_pdf`, [...values, req.params.id, deptId, sectionIds])
      : await client.query(`insert into syllabi (title, department, batch, description, file_name, pdf, structure, subject_id, faculty_id, created_by, department_id, academic_section_ids)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id, title, department, department_id, academic_section_ids, subject_id, faculty_id, batch, description, file_name, structure, status, created_at, published_at, (pdf is not null) as has_pdf`, [...values, req.user.sub, deptId, sectionIds]));
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }

  if (!rows[0]) return res.status(409).json({ message: 'Only drafts can be edited. Refresh and create a revision of a published syllabus.' });
  res.status(req.params.id ? 200 : 201).json({ syllabus: rows[0] });
}

syllabusRouter.post('/', allowRoles(...editors), asyncHandler(save));
syllabusRouter.put('/:id', allowRoles(...editors), asyncHandler(save));

syllabusRouter.put('/:id/audience', allowRoles(...editors), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await assertPublicationOwner(req, 'syllabi', 'id=$1', [req.params.id], client);
    const ids = await publicationAudience(req, req.body, client);
    const scope = await publicationScope(req, client);
    const departments = [...new Set(scope.sections.filter(s => ids.includes(s.id)).map(s => s.department_id))];
    if (departments.length !== 1) {
      await client.query('rollback');
      return res.status(400).json({ message: 'Select classes in one department.' });
    }
    const department = scope.sections.find(s => s.department_id === departments[0]).department;
    const { rows } = await client.query(`update syllabi set academic_section_ids=$2, department_id=$3, department=$4, status='draft', published_at=null where id=$1 returning id, title, department, department_id, academic_section_ids, subject_id, faculty_id, batch, description, file_name, structure, status, created_at, published_at, (pdf is not null) as has_pdf`, [req.params.id, ids, departments[0], department]);
    if (!rows.length) {
      await client.query('rollback');
      return res.status(404).json({ message: 'Syllabus not found.' });
    }
    await client.query('commit');
    res.json({ syllabus: rows[0] });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
});

syllabusRouter.post('/:id/publish', allowRoles(...editors), asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await assertPublicationOwner(req, 'syllabi', 'id=$1', [req.params.id], client);
    const draft = await client.query('select academic_section_ids, subject_id, faculty_id from syllabi where id=$1', [req.params.id]);
    const targetSections = draft.rows[0]?.academic_section_ids || [];
    if (targetSections.length) {
      await publicationAudience(req, { sectionIds: targetSections }, client);
    }
    const { rows } = await client.query(`update syllabi set status='published', published_at=now()
      where id=$1 and status='draft' returning id, title, department, department_id, academic_section_ids, subject_id, faculty_id, batch, description, file_name, structure, status, created_at, published_at, (pdf is not null) as has_pdf`, [req.params.id]);
    if (!rows[0]) {
      await client.query('rollback');
      return res.status(409).json({ message: 'This draft no longer exists or has already been published. Refresh the list.' });
    }
    await notifyPublication(client, rows[0].academic_section_ids, 'New syllabus published', `${rows[0].title} (${rows[0].department}, ${rows[0].batch}) is available in the Syllabus menu.`, 'syllabus', draft.rows[0].subject_id, draft.rows[0].faculty_id);
    await client.query('commit');
    res.json({ syllabus: rows[0] });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}));

