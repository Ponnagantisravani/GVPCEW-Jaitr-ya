import {effectiveFacultyAssignments} from '../services/teachingAssignments.js';
import { Router } from '../utils/router.js';
import { pool } from '../config/db.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { academicAccess, requireDepartment, requireSections, forbidden } from '../services/academicAccess.js';
import { manageDepartmentScope } from '../services/portalScope.js';
import { notifyPublication } from '../services/publicationAccess.js';
import { resolveTimetableFaculty, syncTimetableAssignments } from '../services/timetablePublication.js';

export const timetableRouter = Router();
const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const selectRows = `select t.id,t.academic_section_id section_id,t.day_of_week,t.start_time,t.end_time,t.status,t.entry_type,t.academic_year,
  su.code,su.name subject,u.full_name faculty,c.room_code classroom,d.name department,
  x.year_number,x.semester_number,x.section_name
  from timetable t join subjects su on su.id=t.subject_id join faculty f on f.id=t.faculty_id
  join users u on u.id=f.user_id join classrooms c on c.id=t.classroom_id
  join academic_sections x on x.id=t.academic_section_id join departments d on d.id=x.department_id`;

function timeOk(value) { return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(value || '')); }
async function publishedDocumentsFor(rows) {
  const ids=[...new Set(rows.map(row=>row.section_id))];
  if(!ids.length)return [];
  const documents=await pool.query(`select key,published payload,published_at from academic_documents
    where kind='timetable' and published is not null and
    (key=any($2::text[]) or (key not like 'section-%' and academic_section_ids && $1::uuid[]))
    order by published_at desc nulls last`,[ids,ids.map(id=>'section-'+id)]);
  return documents.rows;
}
async function conflict(client, entry, skipId = null) {
  const q = await client.query(`select t.id from timetable t where t.id is distinct from $1 and t.academic_section_id=$2 and t.day_of_week=$3
    and t.academic_year=$6 and t.start_time < $5::time and t.end_time > $4::time limit 1`, [skipId, entry.sectionId, entry.dayOfWeek, entry.startTime, entry.endTime,entry.academicYear]);
  if (q.rowCount) return 'This section already has a class in that time slot.';
  const faculty = await client.query(`select id from timetable where id is distinct from $1 and faculty_id=$2 and day_of_week=$3 and academic_year=$6 and start_time < $5::time and end_time > $4::time limit 1`, [skipId, entry.facultyId, entry.dayOfWeek, entry.startTime, entry.endTime,entry.academicYear]);
  if (faculty.rowCount) return 'This faculty member already has a class in that time slot.';
  const room = await client.query(`select id from timetable where id is distinct from $1 and classroom_id=$2 and day_of_week=$3 and academic_year=$6 and start_time < $5::time and end_time > $4::time limit 1`, [skipId, entry.classroomId, entry.dayOfWeek, entry.startTime, entry.endTime,entry.academicYear]);
  return room.rowCount ? 'This classroom is already booked in that time slot.' : null;
}

timetableRouter.use(requireAuth);
timetableRouter.get('/student', allowRoles('student','student_coordinator'), async (req, res) => {
  const { rows } = await pool.query(`${selectRows} where t.status='published' and t.academic_section_id=(select academic_section_id from students where user_id=$1) order by t.day_of_week,t.start_time`, [req.user.sub]);
  res.json({ timetable: rows });
});
timetableRouter.get('/faculty', allowRoles('faculty'), async (req, res) => {
  const { rows } = await pool.query(`${selectRows} where t.status='published' and f.user_id=$1 order by t.day_of_week,t.start_time`, [req.user.sub]);
  res.json({ timetable: rows, documents: await publishedDocumentsFor(rows) });
});
timetableRouter.get('/faculty/student-view', allowRoles('faculty'), async (req, res) => {
  // Full class timetables are visible only for sections this faculty teaches.
  const { rows } = await pool.query(`${selectRows} where t.status='published' and exists(
    select 1 from ${effectiveFacultyAssignments} assigned join faculty owner on owner.id=assigned.faculty_id
    where owner.user_id=$1 and assigned.academic_section_id=t.academic_section_id and assigned.status='active'
  ) or (t.status='published' and exists(select 1 from timetable own join faculty owner on owner.id=own.faculty_id where owner.user_id=$1 and own.status='published' and own.academic_section_id=t.academic_section_id)) order by x.year_number,x.semester_number,x.section_name,t.day_of_week,t.start_time`, [req.user.sub]);
  res.json({ timetable: rows, documents: await publishedDocumentsFor(rows) });
});
timetableRouter.get('/coordinator', allowRoles('academic_coordinator','admin'), async (req, res) => {
  const { rows } = await pool.query(`${selectRows} where ${manageDepartmentScope('x.department_id')} order by t.status,t.day_of_week,t.start_time`, [req.user.sub,req.user.activeRole]);
  res.json({ timetable: rows });
});
timetableRouter.get('/catalog', allowRoles('academic_coordinator','admin'), async (req, res) => {
  const access=await academicAccess(req), scope=[access.institutionWide,access.departmentIds];
  const [sections, subjects, faculty, classrooms] = await Promise.all([
    pool.query(`select x.id,x.academic_year,concat(d.name,' — Year ',x.year_number,' / Sem ',x.semester_number,' / ',x.section_name,' / ',x.academic_year) label from academic_sections x join departments d on d.id=x.department_id where $1 or x.department_id=any($2::uuid[]) order by d.name,x.year_number,x.section_name`,scope),
    pool.query('select id,code,name from subjects where $1 or department_id=any($2::uuid[]) order by code',scope),
    pool.query('select f.id,u.full_name,u.email from faculty f join users u on u.id=f.user_id where $1 or f.department_id=any($2::uuid[]) order by u.full_name',scope),
    pool.query('select id,room_code from classrooms where active=true order by room_code')
  ]);
  res.json({ sections: sections.rows, subjects: subjects.rows, faculty: faculty.rows, classrooms: classrooms.rows });
});
timetableRouter.post('/sections', allowRoles('academic_coordinator','admin'), async (req, res) => {
  const { department, yearNumber, semesterNumber, sectionName, academicYear } = req.body;
  if (!department?.trim() || !Number.isInteger(Number(yearNumber)) || !Number.isInteger(Number(semesterNumber)) || !sectionName?.trim() || !academicYear?.trim()) return res.status(400).json({ message: 'Enter department, year, semester, class section, and academic year.' });
  const dept = await pool.query('select id from departments where lower(name)=lower($1)', [department.trim()]);
  if (!dept.rowCount) return res.status(400).json({ message: 'Department was not found. Add it through Academic Management first.' });
  await requireDepartment(req,dept.rows[0].id);
  const { rows } = await pool.query(`insert into academic_sections(department_id,year_number,semester_number,section_name,academic_year)
    values($1,$2,$3,$4,$5) on conflict(department_id,year_number,semester_number,section_name,academic_year)
    do update set section_name=excluded.section_name returning id`, [dept.rows[0].id, Number(yearNumber), Number(semesterNumber), sectionName.trim(), academicYear.trim()]);
  res.status(201).json({ id: rows[0].id });
});
timetableRouter.post('/', allowRoles('academic_coordinator','admin'), async (req, res) => {
  const entry = req.body;
  if (!entry.sectionId || !entry.subjectId || !entry.facultyId || !entry.classroomId || !Number.isInteger(Number(entry.dayOfWeek)) || !timeOk(entry.startTime) || !timeOk(entry.endTime) || entry.startTime >= entry.endTime || !entry.academicYear?.trim()) return res.status(400).json({ message: 'Provide a section, subject, faculty, room, valid day, times, and academic year.' });
  const client = await pool.connect();
  try { await client.query('begin'); await authorizeEntry(req,entry,client); const issue = await conflict(client, entry); if (issue) { await client.query('rollback'); return res.status(409).json({ message: issue }); }
    const { rows } = await client.query(`insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,day_of_week,start_time,end_time,academic_year,entry_type,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') returning id`, [entry.subjectId,entry.facultyId,entry.classroomId,entry.sectionId,Number(entry.dayOfWeek),entry.startTime,entry.endTime,entry.academicYear.trim(),entry.entryType || 'class']);
    await client.query('commit'); res.status(201).json({ id: rows[0].id });
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
});
timetableRouter.post('/publish', allowRoles('academic_coordinator','admin'), async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ message: 'Select at least one timetable row to publish.' });
  const client = await pool.connect();
  try {
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('timetable-write'))");
  const { rowCount } = await client.query(`update timetable set status='published',published_at=now(),published_by=$1,updated_at=now() where id=any($3::uuid[]) and not exists(select 1 from unnest($3::uuid[]) requested(id) left join timetable t on t.id=requested.id left join academic_sections x on x.id=t.academic_section_id where t.id is null or not ${manageDepartmentScope('x.department_id')})`, [req.user.sub, req.user.activeRole, ids]);
  if(!rowCount)throw forbidden('One or more timetable rows are outside your assigned departments.');
  const sections = await client.query('select distinct academic_section_id from timetable where id=any($1::uuid[])', [ids]);
  await syncTimetableAssignments(client, sections.rows.map(row => row.academic_section_id), req.user.sub);
  await client.query('commit');
  res.json({ published: rowCount });
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
});

timetableRouter.post('/publish-grid', allowRoles('academic_coordinator','admin'), async (req, res) => {
  const { timetables, images, image, sectionKey, grid, periods, title, classroom, incharge, academicYear, yearNumber, semesterNumber, publish = true } = req.body;
  const items = timetables ? Object.entries(timetables) : (sectionKey ? [[sectionKey, { grid, periods, title, classroom, incharge, academicYear, yearNumber, semesterNumber }]] : []);
  if (!items.length) return res.status(400).json({ message: 'No timetable data provided to publish.' });

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('timetable-write'))");

    let totalPublishedSlots = 0;
    const affectedSectionIds = [];

    const parseTimeRange = (rawTime) => {
      if (!rawTime || typeof rawTime !== 'string') return null;
      const parts = rawTime.split(/[-–—]/).map(s => s.trim());
      if (parts.length < 2) return null;
      const to24 = (t) => {
        const m = t.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = m[2];
        const ampm = m[3]?.toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}:00`;
      };
      const start = to24(parts[0]);
      const end = to24(parts[1]);
      if (start && end && start < end) return { start, end };
      return null;
    };

    const dayNameMap = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
    };

    const [allDepts, allSections, allSubjects, allFaculty, allRooms] = await Promise.all([
      client.query('select id, name from departments'),
      client.query('select id, department_id, year_number, semester_number, section_name, academic_year from academic_sections'),
      client.query('select id, code, name, department_id from subjects'),
      client.query('select f.id, f.department_id, u.full_name, u.email from faculty f join users u on u.id=f.user_id'),
      client.query('select id, room_code from classrooms')
    ]);

    for (const [secKey, tData] of items) {
      if (!tData || !tData.grid) continue;

      const match = secKey.match(/^([a-z]+)_sec([0-9a-z]+)(?:_year([1-4]))?$/i);
      const branchCode = match ? match[1].toLowerCase() : secKey.slice(0, 3).toLowerCase();
      const secNum = match ? match[2].toUpperCase() : '1';

      const dept = allDepts.rows.find(d => {
        const n = d.name.toLowerCase();
        if (branchCode === 'cse' && (n.includes('computer science') || n === 'cse')) return true;
        if (branchCode === 'csm' && (n.includes('artificial') || n.includes('ai') || n.includes('csm'))) return true;
        if (branchCode === 'csc' && (n.includes('cyber') || n.includes('csc'))) return true;
        if (branchCode === 'ece' && (n.includes('electronics') || n === 'ece')) return true;
        if (branchCode === 'eee' && (n.includes('electrical') || n === 'eee')) return true;
        if (branchCode === 'it' && (n.includes('information') || n === 'it')) return true;
        return false;
      });
      if (!dept) throw Object.assign(new Error(`Unknown timetable department: ${secKey}`), {status:400});
      await requireDepartment(req, dept.id, client);

      let yearNum = Number(match?.[3] || tData.yearNumber || 2);
      let semNum = 3;
      if (!match?.[3] && !tData.yearNumber && tData.academicYear) {
        if (/III|3rd|3/i.test(tData.academicYear)) { yearNum = 3; semNum = 5; }
        else if (/IV|4th|4/i.test(tData.academicYear)) { yearNum = 4; semNum = 7; }
        else if (/I\s*B|1st|1/i.test(tData.academicYear) && !/II/i.test(tData.academicYear)) { yearNum = 1; semNum = 1; }
      }
      semNum = Number(tData.semesterNumber || (yearNum * 2 - 1));
      const acadYear = /^\d{4}-\d{4}$/.test(tData.academicYear || '') ? tData.academicYear : (allSections.rows.find(s => s.department_id === dept.id && s.year_number === yearNum && s.semester_number === semNum && String(s.section_name).toUpperCase() === secNum)?.academic_year || `${new Date().getFullYear()}-${new Date().getFullYear()+1}`);

      let secRow = allSections.rows.find(s => 
        s.department_id === dept.id &&
        s.year_number === yearNum && s.semester_number === semNum && s.academic_year === acadYear &&
        String(s.section_name).toUpperCase() === secNum
      );

      if (!secRow) {
        const insertedSec = await client.query(
          `insert into academic_sections(department_id, year_number, semester_number, section_name, academic_year)
           values($1, $2, $3, $4, $5)
           returning id, department_id, year_number, semester_number, section_name, academic_year`,
          [dept.id, yearNum, semNum, secNum, acadYear]
        );
        secRow = insertedSec.rows[0];
        allSections.rows.push(secRow);
      }

      affectedSectionIds.push(secRow.id);

      const docPayload = {
        ...tData,
        image: (images && images[secKey]) || tData.image || image || null,
        status: publish ? 'Published' : 'Draft',
        updatedAt: new Date().toISOString().split('T')[0]
      };

      await client.query(
        `insert into academic_documents(kind, key, draft, published, updated_by, published_at, academic_section_ids, updated_at)
         values('timetable', $1, $2::jsonb, case when $3::boolean then $2::jsonb else null end, $4, case when $3::boolean then now() else null end, $5::uuid[], now())
         on conflict(kind, key) do update set
           draft = excluded.draft,
           published = case when $3::boolean then excluded.draft else academic_documents.published end,
           published_at = case when $3::boolean then now() else academic_documents.published_at end,
           updated_by = excluded.updated_by,
           academic_section_ids = excluded.academic_section_ids,
           updated_at = now()`,
        [secKey, JSON.stringify(docPayload), Boolean(publish), req.user.sub, [secRow.id]]
      );

      if (publish) {
        await client.query('delete from timetable where academic_section_id = $1', [secRow.id]);

        const periodsMap = {};
        (tData.periods || []).forEach(p => {
          if (p && p.id && p.time) {
            periodsMap[p.id] = parseTimeRange(p.time);
          }
        });

        const defaultPeriodTimes = {
          p1: { start: '08:40:00', end: '09:30:00' },
          p2: { start: '09:30:00', end: '10:20:00' },
          p3: { start: '10:20:00', end: '11:10:00' },
          p4: { start: '11:10:00', end: '12:00:00' },
          lunch: null,
          p5: { start: '12:50:00', end: '13:40:00' },
          p6: { start: '13:40:00', end: '14:30:00' },
          p7: { start: '14:30:00', end: '15:20:00' },
          p8: { start: '15:20:00', end: '16:10:00' }
        };

        for (const [dayName, daySlots] of Object.entries(tData.grid)) {
          const dayNum = dayNameMap[dayName.toLowerCase()];
          if (dayNum === undefined || !daySlots) continue;

          for (const [pId, slot] of Object.entries(daySlots)) {
            if (!slot || !slot.subject || slot.type === 'break' || /lunch|break/i.test(slot.subject)) continue;

            const timeRange = periodsMap[pId] || defaultPeriodTimes[pId];
            if (!timeRange) continue;

            let subj = allSubjects.rows.find(s => 
              (slot.code && s.code.toLowerCase() === slot.code.trim().toLowerCase()) ||
              s.name.toLowerCase() === slot.subject.trim().toLowerCase()
            );
            if (!subj) {
              const code = slot.code?.trim() || `SUB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
              const insSubj = await client.query(
                `insert into subjects(code, name, department_id) values($1, $2, $3) returning id, code, name, department_id`,
                [code, slot.subject.trim(), dept.id]
              );
              subj = insSubj.rows[0];
              allSubjects.rows.push(subj);
            }

            const fac = resolveTimetableFaculty(allFaculty.rows, slot);
            if (!fac) throw Object.assign(new Error(`Cannot match faculty "${slot.faculty || ''}" for ${secKey}, ${dayName}, ${pId}. Select a registered faculty account before publishing.`), {status:400});

            const rawRoom = slot.room || tData.classroom || 'Room 301';
            const cleanRoomCode = rawRoom.replace(/room\s*/i, '').trim() || '301';
            let room = allRooms.rows.find(r => r.room_code.toLowerCase() === cleanRoomCode.toLowerCase());
            if (!room) {
              const insRoom = await client.query(
                `insert into classrooms(room_code, building_name, room_name, active) values($1, 'Academic Block', 'Room ' || $1, true) returning id, room_code`,
                [cleanRoomCode]
              );
              room = insRoom.rows[0];
              allRooms.rows.push(room);
            }

            await client.query(
              `insert into timetable(
                subject_id, faculty_id, classroom_id, academic_section_id,
                day_of_week, start_time, end_time, academic_year, entry_type,
                status, published_at, published_by, updated_at
              ) values($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', now(), $10, now())`,
              [
                subj.id, fac.id, room.id, secRow.id,
                dayNum, timeRange.start, timeRange.end,
                secRow.academic_year || acadYear,
                slot.type === 'lab' ? 'lab' : 'class',
                req.user.sub
              ]
            );
            totalPublishedSlots++;
          }
        }
      }
    }

    if (publish && affectedSectionIds.length > 0) {
      await syncTimetableAssignments(client, [...new Set(affectedSectionIds)], req.user.sub);
      await notifyPublication(
        client,
        [...new Set(affectedSectionIds)],
        'New Class Timetable Published',
        'Official weekly class schedule has been published and is now live.',
        'academic'
      );
    }

    await client.query('commit');
    res.json({
      success: true,
      published: publish,
      totalPublishedSlots,
      sections: affectedSectionIds
    });
  } catch (e) {
    await client.query('rollback');
    console.error('Error publishing timetable grid:', e);
    res.status(e.status || 500).json({ message: e.message || 'Failed to publish timetable grid' });
  } finally {
    client.release();
  }
});
timetableRouter.post('/import', allowRoles('academic_coordinator','admin'), async (req, res) => {
  const lines = String(req.body.csv || '').trim().split(/\r?\n/).filter(Boolean); if (lines.length < 2) return res.status(400).json({ message: 'Upload a CSV with a header and at least one row.' });
  const headers = lines.shift().split(',').map(x => x.trim().toLowerCase()); const required=['day','start_time','end_time','department','year','semester','section','subject_code','faculty_email','classroom','academic_year'];
  if (required.some(x=>!headers.includes(x))) return res.status(400).json({ message: `CSV needs columns: ${required.join(', ')}` });
  const values = lines.map(line => Object.fromEntries(line.split(',').map(x=>x.trim()).map((value,i)=>[headers[i],value])));
  const client=await pool.connect(); try { await client.query('begin'); await client.query("select pg_advisory_xact_lock(hashtext('timetable-write'))"); const ids=[];
    for (const row of values) { const day=days[row.day?.toLowerCase()]; if (day === undefined || !timeOk(row.start_time) || !timeOk(row.end_time) || row.start_time >= row.end_time) throw new Error(`Invalid day or time for ${row.subject_code}.`);
      const lookup=await client.query(`select x.id section_id,s.id subject_id,f.id faculty_id,c.id classroom_id from academic_sections x join departments d on d.id=x.department_id join subjects s on s.code=$5 join faculty f on true join users u on u.id=f.user_id join classrooms c on c.room_code=$7 where lower(d.name)=lower($1) and x.year_number=$2 and x.semester_number=$3 and lower(x.section_name)=lower($4) and lower(u.email)=lower($6) and x.academic_year=$8`,[row.department,Number(row.year),Number(row.semester),row.section,row.subject_code,row.faculty_email,row.classroom,row.academic_year]);
      if (!lookup.rowCount) throw new Error(`Could not match section, subject, faculty, or classroom for ${row.subject_code}.`); const x=lookup.rows[0]; const entry={sectionId:x.section_id,facultyId:x.faculty_id,classroomId:x.classroom_id,dayOfWeek:day,startTime:row.start_time,endTime:row.end_time,academicYear:row.academic_year};
      await authorizeEntry(req,{...entry,subjectId:x.subject_id,academicYear:row.academic_year},client);
      const issue=await conflict(client,entry); if(issue) throw new Error(`${row.subject_code}: ${issue}`);
      const inserted=await client.query(`insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,day_of_week,start_time,end_time,academic_year,status) values($1,$2,$3,$4,$5,$6,$7,$8,'draft') returning id`,[x.subject_id,x.faculty_id,x.classroom_id,x.section_id,day,row.start_time,row.end_time,row.academic_year]); ids.push(inserted.rows[0].id);
    } await client.query('commit'); res.status(201).json({ imported:ids.length,ids });
  } catch(e) { await client.query('rollback'); res.status(e.status===403?403:400).json({message:e.message}); } finally { client.release(); }
});

async function authorizeEntry(req,entry,client){
  await client.query("select pg_advisory_xact_lock(hashtext('timetable-write'))");
  await requireSections(req,[entry.sectionId],client);
  const {rows}=await client.query(`select x.academic_year,s.department_id subject_department,f.department_id faculty_department from academic_sections x join subjects s on s.id=$2 join faculty f on f.id=$3 where x.id=$1`,[entry.sectionId,entry.subjectId,entry.facultyId]);
  if(!rows[0]||rows[0].academic_year!==entry.academicYear?.trim()||Number(entry.dayOfWeek)<0||Number(entry.dayOfWeek)>6)throw Object.assign(new Error('Use a valid day and the academic year of the selected class.'),{status:400});
  await requireDepartment(req,rows[0].subject_department,client);
  await requireDepartment(req,rows[0].faculty_department,client);
}
