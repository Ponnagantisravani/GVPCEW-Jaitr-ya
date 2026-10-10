import React, { useState } from 'react';
import { Plus, Trash2, Eye, Pencil, Save, Printer } from 'lucide-react';
import logo from '../assets/gvpcew-official-logo.png';

export const columns = [['code', 'Course code'], ['category', 'Category'], ['title', 'Course title'], ['l', 'L'], ['p', 'P'], ['internal', 'Internal'], ['external', 'External'], ['total', 'Total'], ['credits', 'Credits']];
export const emptyCourse = () => ({ code: '', category: 'PC', title: '', l: '3', p: '0', internal: '30', external: '70', total: '100', credits: '3', objectives: '', units: '', outcomes: '', references: '' });
const yearNames = ['I', 'II', 'III', 'IV'];
const semesterName = index => `${yearNames[Math.floor(index / 2)] || Math.floor(index / 2) + 1} Year - ${index % 2 ? 'II' : 'I'} Semester`;
const firstYear = [
  [
    ['24BM11RC01', 'BS', 'Calculus and Differential Equations'], ['24BC11RC01', 'BS', 'Green Chemistry'],
    ['24HE11RC01', 'HSS', 'English'], ['24CT11RC01', 'ES', 'Fundamentals of Computers'], ['24CT11RC02', 'ES', 'Problem Solving using C'],
    ['24HE11RC02', 'HSS', 'Communication Skills Lab', true], ['24CT11RC03', 'ES', 'Computer Engineering Workshop', true], ['24CT11RC04', 'ES', 'Problem Solving using C Lab', true]
  ],
  [
    ['24BM11RC02', 'BS', 'Linear Algebra and Vector Calculus'], ['24BP11RC01', 'BS', 'Engineering Physics'],
    ['24EC11RC05', 'ES', 'Digital Logic Design'], ['24EC11RC04', 'ES', 'Elements of Electronics Engineering'], ['24CT11RC06', 'ES', 'Python Programming'],
    ['24BP11RC02', 'BS', 'Engineering Physics Lab', true], ['24CT11RC07', 'ES', 'Python Programming Lab', true], ['24CT11RC08', 'ES', 'Web Technologies Fundamentals Lab', true]
  ]
];
export const syllabusTemplates = [
  { id: 'cse-first-year', name: 'CSE · First-year course structure', tag: 'FROM YOUR COLLEGE PDF', description: '16 courses across two semesters, with the published codes, marks and credits. Add detailed unit contents in the editor.', create: () => ({
    title: 'B.Tech. CSE — I Year Course Structure and Syllabi', department: 'CSE', batch: '2024–25 onwards',
    description: 'First-year course structure based on the college’s autonomous four-year syllabus. Complete and review detailed subject syllabi before publishing.',
    structure: { semesters: firstYear.map((rows, index) => ({ name: semesterName(index), courses: rows.map(([code, category, title, lab]) => ({ ...emptyCourse(), code, category, title, ...(lab ? { l: '0', p: '3', internal: '50', external: '50', credits: '1.5' } : {}) })) })) }
  }) },
  { id: 'four-year', name: 'B.Tech. · Four-year framework', tag: '8 SEMESTERS', description: 'The college’s course-table format, organized into all four years. Fill in courses and detailed syllabi for your department.', create: () => ({ title: 'B.Tech. — Four Year Scheme and Syllabi', department: '', batch: '', description: '', structure: { semesters: Array.from({ length: 8 }, (_, i) => ({ name: semesterName(i), courses: [emptyCourse()] })) } }) },
  { id: 'blank', name: 'Custom semester syllabus', tag: 'START FROM SCRATCH', description: 'Begin with one semester. Add subjects, lab courses, electives and more semesters as needed.', create: () => ({ title: '', department: '', batch: '', description: '', structure: { semesters: [{ name: semesterName(0), courses: [emptyCourse()] }] } }) }
];

function renderFormattedContent(text) {
  if (!text) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 50 && !line.startsWith('http') && !/^(https?|ftp):/i.test(line)) {
      const heading = line.slice(0, colonIdx + 1);
      const rest = line.slice(colonIdx + 1);
      return (
        <p key={idx} className="gvpcew-topic-line">
          <strong>{heading}</strong>{rest}
        </p>
      );
    }
    return <p key={idx} className="gvpcew-topic-line">{line}</p>;
  });
}

function SingleCoursePaper({ course, department, batch, annexure }) {
  const code = course.code || course.course_code || '';
  const title = course.title || course.course_name || '';
  const category = course.category || '';
  const ltpc = course.ltpc || `${course.l || '3'}-0-${course.p || '0'}-${course.credits || '3'}`;

  // Course outcomes
  const coIntro = course.co_intro || 'At the end of the Course, the student shall be able to:';
  let coList = Array.isArray(course.co_list) && course.co_list.length ? course.co_list : [];
  if (!coList.length && (course.course_outcomes || course.outcomes)) {
    const rawOutcomes = course.course_outcomes || course.outcomes || '';
    const lines = rawOutcomes.split('\n').map(l => l.trim()).filter(Boolean);
    coList = lines.map((l, i) => {
      const m = /^(?:CO([1-9])|[1-9]\.)\s*[:\.\-–]?\s*(.*)/i.exec(l);
      return m ? { code: `CO${m[1] || i + 1}`, text: m[2] || l } : { code: `CO${i + 1}`, text: l };
    });
  }

  // Units list
  let unitsList = Array.isArray(course.units_list) && course.units_list.length ? course.units_list : [];
  if (!unitsList.length) {
    const roman = ['I', 'II', 'III', 'IV', 'V'];
    for (let i = 1; i <= 5; i++) {
      const uContent = course[`unit_${i}`];
      const uLectures = course[`unit_${i}_lectures`] || (i === 3 ? '12 Lectures' : '09 Lectures');
      if (uContent) {
        unitsList.push({ number: `UNIT-${roman[i - 1]}`, lectures: uLectures, content: uContent });
      }
    }
  }

  // Books
  const textBooks = Array.isArray(course.text_books_list) && course.text_books_list.length
    ? course.text_books_list
    : course.textbooks ? course.textbooks.split('\n').map(l => l.trim().replace(/^(?:[0-9]+[\.\)]|•|\*|-)\s*/, '')).filter(Boolean)
    : [];

  const refBooks = Array.isArray(course.reference_books_list) && course.reference_books_list.length
    ? course.reference_books_list
    : course.reference_books ? course.reference_books.split('\n').map(l => l.trim().replace(/^(?:[0-9]+[\.\)]|•|\*|-)\s*/, '')).filter(Boolean)
    : [];

  const webRefs = Array.isArray(course.web_references_list) && course.web_references_list.length
    ? course.web_references_list
    : course.web_references ? course.web_references.split('\n').map(l => l.trim().replace(/^(?:[0-9]+[\.\)]|•|\*|-)\s*/, '')).filter(Boolean)
    : [];

  return (
    <div className="gvpcew-official-paper">
      {/* Official College Header */}
      <header className="gvpcew-paper-header">
        <img src={logo} alt="GVPCEW Logo" className="gvpcew-paper-logo" />
        <div className="gvpcew-paper-header-text">
          <h2 className="gvpcew-inst-title">GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN</h2>
          <h3 className="gvpcew-inst-sub">(Autonomous)</h3>
          <p className="gvpcew-inst-affil">(Approved by AICTE, New Delhi and Permanently Affiliated to Andhra University, Visakhapatnam)</p>
          <p className="gvpcew-inst-address">Madhurawada :: Visakhapatnam – 530 048</p>
        </div>
      </header>

      {/* Annexure / Admitted Batch */}
      {annexure ? (
        <div className="gvpcew-paper-annexure">{annexure}</div>
      ) : batch ? (
        <div className="gvpcew-paper-annexure">Applicable Admitted Batch: {batch}</div>
      ) : null}

      {/* Course Title & Category */}
      <div className="gvpcew-paper-title-block">
        <h1 className="gvpcew-course-title">{title.toUpperCase()}</h1>
        {category && <h4 className="gvpcew-course-category">({category})</h4>}
      </div>

      {/* Course Code & L-T-P-C Row */}
      <div className="gvpcew-course-meta-bar">
        <div className="meta-left">
          <strong>Course Code:</strong> <span>{code}</span>
        </div>
        <div className="meta-right">
          <strong>L-T-P-C:</strong> <span>{ltpc}</span>
        </div>
      </div>

      {/* Course Objectives (if present) */}
      {course.objectives && (
        <div className="gvpcew-section-box">
          <div className="gvpcew-box-header">Course Objectives:</div>
          <div className="gvpcew-box-body">
            {renderFormattedContent(course.objectives)}
          </div>
        </div>
      )}

      {/* Course Outcomes Table */}
      {coList.length > 0 && (
        <div className="gvpcew-outcomes-block">
          <div className="gvpcew-outcomes-intro">
            <strong>Course Outcomes:</strong> {coIntro}
          </div>
          <table className="gvpcew-outcomes-table">
            <tbody>
              {coList.map((co, idx) => (
                <tr key={co.code || idx}>
                  <td className="co-code-col"><strong>{co.code}:</strong></td>
                  <td className="co-text-col">{co.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Units List */}
      {unitsList.length > 0 ? (
        <div className="gvpcew-units-list">
          {unitsList.map((u, uIdx) => (
            <div key={u.number || uIdx} className="gvpcew-unit-box">
              <div className="gvpcew-unit-header">
                <span className="unit-label">{u.number || `UNIT-${['I', 'II', 'III', 'IV', 'V'][uIdx]}`}</span>
                <span className="unit-lectures">{u.lectures || '09 Lectures'}</span>
              </div>
              <div className="gvpcew-unit-content">
                {renderFormattedContent(u.content)}
              </div>
            </div>
          ))}
        </div>
      ) : course.units ? (
        <div className="gvpcew-section-box">
          <div className="gvpcew-box-header">Detailed Syllabus:</div>
          <div className="gvpcew-box-body">
            {renderFormattedContent(course.units)}
          </div>
        </div>
      ) : null}

      {/* Text Books Table */}
      {textBooks.length > 0 && (
        <div className="gvpcew-books-box">
          <div className="gvpcew-books-header">Text Books:</div>
          <ol className="gvpcew-books-numbered-list">
            {textBooks.map((book, bIdx) => (
              <li key={bIdx}>{book}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Reference Books Table */}
      {refBooks.length > 0 && (
        <div className="gvpcew-books-box">
          <div className="gvpcew-books-header">Reference Books:</div>
          <ol className="gvpcew-books-numbered-list">
            {refBooks.map((book, bIdx) => (
              <li key={bIdx}>{book}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Web References Table */}
      {webRefs.length > 0 && (
        <div className="gvpcew-books-box">
          <div className="gvpcew-books-header">Web References:</div>
          <ol className="gvpcew-books-numbered-list">
            {webRefs.map((ref, rIdx) => (
              <li key={rIdx}>{ref}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function SyllabusDocument({ record }) {
  const structure = record.structure || {};
  const semesters = structure.semesters || [];

  // A record is a subject-specific syllabus if it has a subject code/id or single course structure
  const isSingleSubjectSyllabus = Boolean(record.subject_id)
    || Boolean(record.subject_code)
    || Boolean(structure.course_code || structure.code)
    || (semesters.length === 1 && semesters[0]?.courses?.length === 1);

  // If this is a subject-specific syllabus, render ONLY the official GVPCEW course paper (NO course structure table!)
  if (isSingleSubjectSyllabus) {
    const singleCourseData = (semesters.length === 1 && semesters[0]?.courses?.[0])
      ? { ...structure, ...semesters[0].courses[0] }
      : structure;

    return (
      <article className="syllabus-print-document">
        <SingleCoursePaper
          course={singleCourseData}
          department={record.department || singleCourseData.department}
          batch={record.batch || singleCourseData.batch}
          annexure={singleCourseData.annexure || record.annexure}
        />
      </article>
    );
  }

  // Otherwise, only for full 4-year institutional curriculum overviews:
  return (
    <article className="syllabus-print-document">
      <header className="gvpcew-paper-header">
        <img src={logo} alt="GVPCEW Logo" className="gvpcew-paper-logo" />
        <div className="gvpcew-paper-header-text">
          <h2 className="gvpcew-inst-title">GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN</h2>
          <h3 className="gvpcew-inst-sub">(Autonomous)</h3>
          <p className="gvpcew-inst-affil">(Approved by AICTE, New Delhi and Permanently Affiliated to Andhra University, Visakhapatnam)</p>
          <p className="gvpcew-inst-address">Madhurawada :: Visakhapatnam – 530 048</p>
        </div>
      </header>

      <div className="gvpcew-paper-title-block">
        <h1 className="gvpcew-course-title">{record.title}</h1>
        <p className="syllabus-document-batch">Applicable Admitted Batch: {record.batch || '2024–25 Onwards'}</p>
        {record.department && <p className="syllabus-document-batch">Department: {record.department}</p>}
      </div>

      {record.description && <p className="syllabus-document-desc">{record.description}</p>}

      {semesters.map((semester, index) => (
        <section className="syllabus-semester-document" key={index}>
          <h3 className="semester-scheme-heading">{semester.name}</h3>

          {/* Scheme Table */}
          <div className="syllabus-table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semester.courses?.map((course, i) => (
                  <tr key={i}>
                    {columns.map(([key]) => (
                      <td key={key}>{course[key] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8}>Total Credits</td>
                  <td>
                    {Number(semester.courses?.reduce((sum, course) => sum + (Number(course.credits) || 0), 0).toFixed(2))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Detailed Course Syllabus Sheets */}
          {semester.courses?.map((course, i) => (
            <SingleCoursePaper
              key={course.code || i}
              course={course}
              department={record.department}
              batch={record.batch}
              annexure={course.annexure}
            />
          ))}
        </section>
      ))}

      <p className="muted" style={{ marginTop: '24px', fontSize: '11.5px', textAlign: 'center' }}>
        L: Lecture hours/week · P: Practical hours/week · Autonomous Scheme of Instruction
      </p>
    </article>
  );
}

export function SyllabusEditor({ initial, onSave, onCancel, busy }) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState(false);
  const semesters = draft.structure.semesters;
  const current = semesters[active];
  const updateSemester = (change) => setDraft(previous => ({ ...previous, structure: { semesters: previous.structure.semesters.map((semester, i) => i === active ? { ...semester, ...change } : semester) } }));
  const updateCourse = (index, field, value) => updateSemester({ courses: current.courses.map((course, i) => i === index ? { ...course, [field]: value } : course) });
  function cancel() { if (JSON.stringify(draft) === JSON.stringify(initial) || window.confirm('Discard unsaved syllabus changes?')) onCancel(); }
  return <form className="syllabus-editor" onSubmit={event => { event.preventDefault(); onSave(draft); }}>
    <div className="syllabus-editor-toolbar"><div><span className="syllabus-badge">{draft.id ? 'Edit saved draft' : 'New portal draft'}</span><h3>{preview ? 'Review your syllabus' : 'Syllabus editor'}</h3></div>
      <div className="syllabus-actions"><button type="button" className="syllabus-secondary" disabled={busy} onClick={cancel}>Cancel</button>
        <button type="button" className="syllabus-secondary" onClick={() => setPreview(!preview)}>{preview ? <Pencil size={16} /> : <Eye size={16} />}{preview ? 'Continue editing' : 'Preview'}</button>
        {preview && <button type="button" className="syllabus-secondary" onClick={() => window.print()}><Printer size={16} /> Print / save PDF</button>}
        <button type="submit" disabled={busy}><Save size={16} />{busy ? 'Saving…' : 'Save draft'}</button></div></div>
    {preview ? <SyllabusDocument record={draft} /> : <fieldset disabled={busy}>
      <section className="syllabus-editor-section"><p className="eyebrow">01 / DOCUMENT DETAILS</p><div className="syllabus-fields">
        { [['title', 'Document title', 180], ['department', 'Department', 100], ['batch', 'Applicable admitted batch', 100]].map(([key, label, max]) => <label key={key}>{label}<input required maxLength={max} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
        <label>Description<textarea rows={2} maxLength={3000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      </div></section>
      <section className="syllabus-editor-section"><p className="eyebrow">02 / SEMESTER COURSE STRUCTURE</p>
        <div className="syllabus-semester-tabs" aria-label="Semesters">{semesters.map((semester, index) => <button key={index} type="button" aria-pressed={index === active} onClick={() => setActive(index)}>{semester.name}</button>)}
          <button type="button" disabled={semesters.length >= 12} onClick={() => { setDraft({ ...draft, structure: { semesters: [...semesters, { name: semesterName(semesters.length), courses: [emptyCourse()] }] } }); setActive(semesters.length); }}><Plus size={14} /> Semester</button></div>
        <div className="syllabus-semester-heading"><label>Semester name<input required maxLength={100} value={current.name} onChange={e => updateSemester({ name: e.target.value })} /></label>
          {semesters.length > 1 && <button type="button" className="syllabus-danger" onClick={() => { if (window.confirm(`Remove ${current.name} and its courses?`)) { setDraft({ ...draft, structure: { semesters: semesters.filter((_, i) => i !== active) } }); setActive(0); } }}><Trash2 size={15} /> Remove semester</button>}</div>
        <p className="muted">L / P = weekly lecture / practical hours. Enter marks and credits as numbers; use a dash where not applicable.</p>
        <div className="syllabus-table-scroll"><table className="syllabus-edit-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}<th>Remove</th></tr></thead><tbody>
          {current.courses.map((course, index) => <tr key={index}>{columns.map(([key, label]) => <td key={key}><input aria-label={`Course ${index + 1} ${label}`} required={key === 'title'} maxLength={key === 'title' ? 250 : key === 'code' ? 40 : key === 'category' ? 30 : 12} pattern={['code', 'category', 'title'].includes(key) ? undefined : '(?:[0-9]+(?:\\.[0-9]+)?|-)?'} value={course[key]} onChange={e => updateCourse(index, key, e.target.value)} /></td>)}<td><button type="button" className="syllabus-icon-button" aria-label={`Remove course ${index + 1}`} disabled={current.courses.length === 1} onClick={() => updateSemester({ courses: current.courses.filter((_, i) => i !== index) })}><Trash2 size={16} /></button></td></tr>)}
        </tbody></table></div>
        <div className="syllabus-semester-heading"><button type="button" className="syllabus-secondary" disabled={current.courses.length >= 60} onClick={() => updateSemester({ courses: [...current.courses, emptyCourse()] })}><Plus size={16} /> Add course</button><strong>Total credits: {Number(current.courses.reduce((sum, row) => sum + (Number(row.credits) || 0), 0).toFixed(2))}</strong></div>
      </section>
      <section className="syllabus-editor-section"><p className="eyebrow">03 / DETAILED SUBJECT SYLLABI</p><p className="muted">Expand a course to enter objectives, units, learning outcomes and reading material.</p>
        {current.courses.map((course, index) => <details className="syllabus-course-details" key={`${active}-${index}`}><summary>{course.code || `Course ${index + 1}`} · {course.title || 'Untitled course'}</summary><div className="syllabus-fields">
          {[['objectives', 'Course objectives', 12000], ['units', 'Unit-wise syllabus', 30000], ['outcomes', 'Course outcomes', 12000], ['references', 'Textbooks & references', 12000]].map(([key, label, max]) => <label key={key}>{label}<textarea rows={6} maxLength={max} value={course[key]} placeholder={key === 'units' ? 'UNIT I — Title\nTopics and teaching hours\n\nUNIT II — Title\nTopics and teaching hours' : `Enter ${label.toLowerCase()}`} onChange={e => updateCourse(index, key, e.target.value)} /></label>)}
        </div></details>)}
      </section>
    </fieldset>}
  </form>;
}
