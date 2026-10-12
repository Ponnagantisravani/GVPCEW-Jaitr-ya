import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Edit3, Check, Save, Share2, FolderOpen, Plus, Trash2, X, RotateCcw, Sparkles, Printer } from 'lucide-react';
import collegeLogoUrl from '../assets/gvpcew-official-logo.png';

export const CALENDAR_TEMPLATES = [
  {
    id: 'btech_year2_2025_26',
    name: 'II Year B. Tech. (2025–26 Standard Autonomous)',
    description: 'Autonomous standard curriculum with 18-week instruction periods, Mid I & II, Practical exams, End exams, and Community Service Internship.',
    title: 'II Year B. Tech. for the Academic Year 2025–26',
    semesters: [
      {
        name: 'I Semester',
        rows: [
          { description: 'Commencement of Class Work', from: '07-07-2025', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: '07-07-2025', to: '07-11-2025', duration: '18 W' },
          { description: 'I Mid Examinations', from: '01-09-2025', to: '03-09-2025', duration: '03 days' },
          { description: 'II Mid Examinations', from: '05-11-2025', to: '07-11-2025', duration: '03 days' },
          { description: 'Preparation & Practical Exams', from: '10-11-2025', to: '15-11-2025', duration: '1 W' },
          { description: 'End Examinations', from: '17-11-2025', to: '29-11-2025', duration: '2 W' }
        ]
      },
      {
        name: 'II Semester',
        rows: [
          { description: 'Commencement of Class Work', from: '01-12-2025', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: '01-12-2025', to: '04-04-2026', duration: '18 W' },
          { description: 'I Mid Examinations', from: '02-02-2026', to: '04-02-2026', duration: '03 days' },
          { description: 'II Mid Examinations', from: '01-04-2026', to: '04-04-2026', duration: '03 days' },
          { description: 'Preparation & Practical Exams', from: '06-04-2026', to: '10-04-2026', duration: '1 W' },
          { description: 'End Examinations', from: '13-04-2026', to: '25-04-2026', duration: '2 W' },
          { description: 'Internship-I (Community Service Project)', from: '27-04-2026', to: '20-06-2026', duration: '8 W' },
          { description: 'Commencement of III-I Semester Classwork', from: '22-06-2026', to: '', duration: '' }
        ]
      }
    ],
    holidays: [
      { name: 'Dussehra', from: '29-09-2025', to: '04-10-2025' },
      { name: 'Pongal', from: '12-01-2026', to: '17-01-2026' }
    ]
  },
  {
    id: 'btech_year1_2025_26',
    name: 'I Year B. Tech. (2025–26 Induction & Foundations)',
    description: 'First year curriculum with induction programme, foundational coursework, and winter orientation schedule.',
    title: 'I Year B. Tech. for the Academic Year 2025–26',
    semesters: [
      {
        name: 'I Semester',
        rows: [
          { description: 'Induction Programme & Orientation', from: '14-07-2025', to: '26-07-2025', duration: '2 W' },
          { description: 'Commencement of Class Work', from: '28-07-2025', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: '28-07-2025', to: '28-11-2025', duration: '18 W' },
          { description: 'I Mid Examinations', from: '22-09-2025', to: '24-09-2025', duration: '03 days' },
          { description: 'II Mid Examinations', from: '24-11-2025', to: '26-11-2025', duration: '03 days' },
          { description: 'Preparation & Practical Exams', from: '01-12-2025', to: '06-12-2025', duration: '1 W' },
          { description: 'End Examinations', from: '08-12-2025', to: '20-12-2025', duration: '2 W' }
        ]
      },
      {
        name: 'II Semester',
        rows: [
          { description: 'Commencement of Class Work', from: '29-12-2025', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: '29-12-2025', to: '02-05-2026', duration: '18 W' },
          { description: 'I Mid Examinations', from: '23-02-2026', to: '25-02-2026', duration: '03 days' },
          { description: 'II Mid Examinations', from: '27-04-2026', to: '29-04-2026', duration: '03 days' },
          { description: 'Preparation & Practical Exams', from: '04-05-2026', to: '09-05-2026', duration: '1 W' },
          { description: 'End Examinations', from: '11-05-2026', to: '23-05-2026', duration: '2 W' },
          { description: 'Commencement of II-I Semester Classwork', from: '06-07-2026', to: '', duration: '' }
        ]
      }
    ],
    holidays: [
      { name: 'Dussehra', from: '29-09-2025', to: '04-10-2025' },
      { name: 'Pongal', from: '12-01-2026', to: '17-01-2026' }
    ]
  },
  {
    id: 'btech_year3_4_2026_27',
    name: 'III & IV Year B. Tech. (2026–27 Major Project & Core)',
    description: 'Senior year schedule with core courses, project reviews, industrial training, and placement semesters.',
    title: 'III & IV Year B. Tech. for the Academic Year 2026–27',
    semesters: [
      {
        name: 'I Semester',
        rows: [
          { description: 'Commencement of Class Work', from: '06-07-2026', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: '06-07-2026', to: '06-11-2026', duration: '18 W' },
          { description: 'I Mid Examinations', from: '31-08-2026', to: '02-09-2026', duration: '03 days' },
          { description: 'II Mid Examinations', from: '04-11-2026', to: '06-11-2026', duration: '03 days' },
          { description: 'Preparation & Practical Exams', from: '09-11-2026', to: '14-11-2026', duration: '1 W' },
          { description: 'End Examinations', from: '16-11-2026', to: '28-11-2026', duration: '2 W' }
        ]
      },
      {
        name: 'II Semester',
        rows: [
          { description: 'Commencement of Class Work / Project Work', from: '07-12-2026', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: '07-12-2026', to: '10-04-2027', duration: '18 W' },
          { description: 'I Mid Examinations / Project Review I', from: '08-02-2027', to: '10-02-2027', duration: '03 days' },
          { description: 'II Mid Examinations / Project Review II', from: '05-04-2027', to: '08-04-2027', duration: '03 days' },
          { description: 'End Semester Project Viva & Theory Exams', from: '19-04-2027', to: '01-05-2027', duration: '2 W' }
        ]
      }
    ],
    holidays: [
      { name: 'Dussehra', from: '19-10-2026', to: '24-10-2026' },
      { name: 'Pongal / Sankranti', from: '11-01-2027', to: '16-01-2027' }
    ]
  },
  {
    id: 'blank_template',
    name: 'Blank Custom Template',
    description: 'Start with a clean structure and enter all semester dates, examinations, and holidays manually.',
    title: 'B. Tech. Academic Calendar for Academic Year 2025–26',
    semesters: [
      {
        name: 'I Semester',
        rows: [
          { description: 'Commencement of Class Work', from: 'DD-MM-YYYY', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY', duration: '18 W' },
          { description: 'I Mid Examinations', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY', duration: '03 days' },
          { description: 'End Examinations', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY', duration: '2 W' }
        ]
      },
      {
        name: 'II Semester',
        rows: [
          { description: 'Commencement of Class Work', from: 'DD-MM-YYYY', to: '', duration: '' },
          { description: 'Instruction Period for the Semester', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY', duration: '18 W' },
          { description: 'End Examinations', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY', duration: '2 W' }
        ]
      }
    ],
    holidays: [
      { name: 'Festival Holiday', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY' }
    ]
  }
];

export function CalendarTemplateModal({ onClose, onSelectTemplate }) {
  const [selectedId, setSelectedId] = useState(CALENDAR_TEMPLATES[0].id);
  const selectedTemplate = CALENDAR_TEMPLATES.find(t => t.id === selectedId) || CALENDAR_TEMPLATES[0];

  return (
    <div className="template-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-title" onMouseDown={e => e.stopPropagation()}>
        <button className="template-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        <div className="template-modal-header">
          <div className="flex items-center gap-2">
            <span className="template-modal-icon"><FolderOpen className="w-5 h-5 text-emerald-600" /></span>
            <h2 id="template-title" className="text-xl font-bold text-slate-800">Load Academic Calendar Template</h2>
          </div>
          <p className="template-subtitle">Choose a pre-defined academic calendar template to load verified dates, or pick a custom layout.</p>
        </div>

        <div className="calendar-template-grid">
          {CALENDAR_TEMPLATES.map(tpl => (
            <div
              key={tpl.id}
              onClick={() => setSelectedId(tpl.id)}
              className={`calendar-template-card ${selectedId === tpl.id ? 'active' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-sm text-slate-800">{tpl.name}</h4>
                {selectedId === tpl.id && <span className="template-badge">Selected</span>}
              </div>
              <p className="text-xs text-slate-600 mt-1">{tpl.description}</p>
              <div className="text-xs font-semibold text-emerald-700 mt-2 flex items-center gap-1">
                <span>{tpl.semesters.length} Semesters</span> • <span>{tpl.holidays.length} Holidays</span>
              </div>
            </div>
          ))}
        </div>

        <div className="template-preview mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Preview: {selectedTemplate.title}</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">Autonomous Format</span>
          </div>

          <div className="overflow-x-auto max-h-48 border border-slate-200 rounded">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2">Semester / Event</th>
                  <th className="p-2 text-center">From</th>
                  <th className="p-2 text-center">To</th>
                  <th className="p-2 text-center">Duration</th>
                </tr>
              </thead>
              <tbody>
                {selectedTemplate.semesters.map((sem) => (
                  <React.Fragment key={sem.name}>
                    <tr className="bg-slate-50 font-bold text-slate-800 border-b border-slate-200">
                      <td colSpan="4" className="p-1.5 px-2 text-blue-900 bg-blue-50/50">{sem.name}</td>
                    </tr>
                    {sem.rows.slice(0, 3).map((r, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-1.5 px-2 text-slate-700">{r.description}</td>
                        <td className="p-1.5 px-2 text-center text-slate-600">{r.from || '—'}</td>
                        <td className="p-1.5 px-2 text-center text-slate-600">{r.to || '—'}</td>
                        <td className="p-1.5 px-2 text-center text-slate-600">{r.duration || '—'}</td>
                      </tr>
                    ))}
                    {sem.rows.length > 3 && (
                      <tr className="text-slate-400 italic text-[11px]">
                        <td colSpan="4" className="p-1 px-2 text-center bg-slate-50/30">+{sem.rows.length - 3} more schedule items in {sem.name}...</td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="template-actions mt-4 flex items-center justify-end gap-3">
          <button type="button" className="outline-action px-4 py-2 text-sm font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-50" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="publish-button px-4 py-2 text-sm font-bold rounded bg-emerald-700 text-white hover:bg-emerald-800 flex items-center gap-1.5"
            onClick={() => onSelectTemplate(selectedTemplate)}
          >
            <Check className="w-4 h-4" /> Load This Template
          </button>
        </div>
      </section>
    </div>
  );
}

export function AcademicCalendarManagement({ role = 'academic_coordinator' }) {
  const frame=useRef(null);
  useEffect(()=>{
    let pending;const measure=()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{if(!frame.current)return;const viewport=window.visualViewport?.height||window.innerHeight;const nav=document.querySelector('.bottom-nav');const bottom=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().height:0;frame.current.style.height=Math.max(90,viewport-frame.current.getBoundingClientRect().top-bottom-56)+'px';});};
    const observer=new ResizeObserver(measure);if(frame.current?.parentElement)observer.observe(frame.current.parentElement);measure();window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);return()=>{cancelAnimationFrame(pending);observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
  },[]);
  return <iframe ref={frame} title="Academic Calendar" src={'/academic-calendar.html?layout=readable-white-v3' + (['admin','academic_coordinator'].includes(role) ? '' : '&mode=view')} style={{display:'block',width:'100%',height:'calc(100dvh - 240px)',border:0,borderRadius:0}}/>;
}

function LegacyAcademicCalendarManagement({ role = 'academic_coordinator' }) {
  const isEditor = role === 'academic_coordinator' || role === 'admin';
  const STORAGE_KEY = 'gvpcew_academic_calendar';

  const defaultCalendar = CALENDAR_TEMPLATES[0];

  const [calendar, setCalendar] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return {
      title: defaultCalendar.title,
      status: 'Published',
      semesters: defaultCalendar.semesters,
      holidays: defaultCalendar.holidays
    };
  });

  const [isEditing, setIsEditing] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [notice, setNotice] = useState('');

  // Persist to local storage (only when editor modifies)
  useEffect(() => {
    if (isEditor) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(calendar));
    }
  }, [calendar, isEditor]);

  // Sync automatically when academic coordinator publishes or updates calendar
  useEffect(() => {
    const handleSync = (e) => {
      if ((!e || e.key === STORAGE_KEY) && localStorage.getItem(STORAGE_KEY)) {
        try {
          const fresh = JSON.parse(localStorage.getItem(STORAGE_KEY));
          if (fresh) setCalendar(fresh);
        } catch {}
      }
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('focus', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, []);

  const showNotification = (msg) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice(prev => (prev === msg ? '' : prev));
    }, 4000);
  };

  const handleLoadTemplate = (template) => {
    setCalendar({
      title: template.title,
      status: 'Draft',
      semesters: JSON.parse(JSON.stringify(template.semesters)),
      holidays: JSON.parse(JSON.stringify(template.holidays))
    });
    setShowTemplateModal(false);
    setIsEditing(true);
    showNotification(`Template "${template.name}" loaded! You can now adjust dates and save or publish.`);
  };

  const handleUpdateTitle = (val) => {
    setCalendar(prev => ({ ...prev, title: val }));
  };

  const handleUpdateSemesterName = (semIndex, val) => {
    setCalendar(prev => {
      const nextSemesters = [...prev.semesters];
      nextSemesters[semIndex] = { ...nextSemesters[semIndex], name: val };
      return { ...prev, semesters: nextSemesters };
    });
  };

  const handleUpdateRow = (semIndex, rowIndex, field, val) => {
    setCalendar(prev => {
      const nextSemesters = [...prev.semesters];
      const nextRows = [...nextSemesters[semIndex].rows];
      nextRows[rowIndex] = { ...nextRows[rowIndex], [field]: val };
      nextSemesters[semIndex] = { ...nextSemesters[semIndex], rows: nextRows };
      return { ...prev, semesters: nextSemesters };
    });
  };

  const handleAddRow = (semIndex) => {
    setCalendar(prev => {
      const nextSemesters = [...prev.semesters];
      const nextRows = [
        ...nextSemesters[semIndex].rows,
        { description: 'New Academic Activity', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY', duration: '1 W' }
      ];
      nextSemesters[semIndex] = { ...nextSemesters[semIndex], rows: nextRows };
      return { ...prev, semesters: nextSemesters };
    });
  };

  const handleDeleteRow = (semIndex, rowIndex) => {
    setCalendar(prev => {
      const nextSemesters = [...prev.semesters];
      const nextRows = nextSemesters[semIndex].rows.filter((_, i) => i !== rowIndex);
      nextSemesters[semIndex] = { ...nextSemesters[semIndex], rows: nextRows };
      return { ...prev, semesters: nextSemesters };
    });
  };

  const handleUpdateHoliday = (index, field, val) => {
    setCalendar(prev => {
      const nextHolidays = [...prev.holidays];
      nextHolidays[index] = { ...nextHolidays[index], [field]: val };
      return { ...prev, holidays: nextHolidays };
    });
  };

  const handleAddHoliday = () => {
    setCalendar(prev => ({
      ...prev,
      holidays: [
        ...prev.holidays,
        { name: 'Festival / Vacation Break', from: 'DD-MM-YYYY', to: 'DD-MM-YYYY' }
      ]
    }));
  };

  const handleDeleteHoliday = (index) => {
    setCalendar(prev => ({
      ...prev,
      holidays: prev.holidays.filter((_, i) => i !== index)
    }));
  };

  const handleSaveDraft = () => {
    setCalendar(prev => ({ ...prev, status: 'Draft' }));
    setIsEditing(false);
    showNotification('Academic calendar saved as Draft.');
  };

  const handlePublish = () => {
    setCalendar(prev => ({ ...prev, status: 'Published' }));
    setIsEditing(false);
    showNotification('Academic Calendar published successfully! It is now live for all students and faculty.');
  };

  const handleResetToDefault = () => {
    if (window.confirm('Reset the academic calendar back to standard II Year B.Tech (2025–26) default?')) {
      handleLoadTemplate(CALENDAR_TEMPLATES[0]);
    }
  };

  return (
    <div className="academic-calendar-wrapper">
      {showTemplateModal && (
        <CalendarTemplateModal
          onClose={() => setShowTemplateModal(false)}
          onSelectTemplate={handleLoadTemplate}
        />
      )}

      {/* Top Toolbar (Load Template & Edit Controls for Coordinator/Admin) */}
      {isEditor && (
        <div className="calendar-top-toolbar">
          <div className="calendar-toolbar-left">
            <button
              type="button"
              className="calendar-btn load-template-btn"
              onClick={() => setShowTemplateModal(true)}
              title="Select and load a pre-defined academic calendar template"
            >
              <FolderOpen className="w-4 h-4 text-emerald-600" />
              <span>Load Template</span>
            </button>

            <button
              type="button"
              className={`calendar-btn edit-toggle-btn ${isEditing ? 'active' : ''}`}
              onClick={() => setIsEditing(prev => !prev)}
            >
              <Edit3 className="w-4 h-4" />
              <span>{isEditing ? 'Done Editing' : 'Edit Calendar / Dates'}</span>
            </button>
          </div>

          <div className="calendar-toolbar-right">
            <span className={`calendar-status-badge ${calendar.status === 'Published' ? 'published' : 'draft'}`}>
              {isEditing ? 'Editing Mode' : calendar.status || 'Draft'}
            </span>

            {isEditing && (
              <>
                <button
                  type="button"
                  className="calendar-btn save-draft-btn"
                  onClick={handleSaveDraft}
                >
                  <Save className="w-4 h-4" />
                  <span>Save Draft</span>
                </button>
                <button
                  type="button"
                  className="calendar-btn publish-btn"
                  onClick={handlePublish}
                >
                  <Share2 className="w-4 h-4" />
                  <span>Publish Calendar</span>
                </button>
              </>
            )}

            {!isEditing && calendar.status !== 'Published' && (
              <button
                type="button"
                className="calendar-btn publish-btn"
                onClick={handlePublish}
              >
                <Share2 className="w-4 h-4" />
                <span>Publish Calendar</span>
              </button>
            )}

            <button
              type="button"
              className="calendar-btn-subtle"
              onClick={handleResetToDefault}
              title="Reset to default template"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Student View Banner */}
      {!isEditor && (
        <div className="calendar-top-toolbar no-print">
          <div className="calendar-toolbar-left flex items-center gap-2">
            <span className="calendar-status-badge published">
              Published Academic Calendar
            </span>
            <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
              Gayatri Vidya Parishad College of Engineering for Women (Autonomous)
            </span>
          </div>
          <div className="calendar-toolbar-right flex items-center gap-2">
            <button
              type="button"
              className="calendar-btn print-card-btn"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" />
              <span>Print Calendar</span>
            </button>
          </div>
        </div>
      )}

      {/* Alert / Notice Message */}
      {notice && (
        <div className="calendar-notice-banner">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Official Academic Calendar Document View / Editable Grid */}
      <section className={`academic-calendar ${isEditing ? 'calendar-is-editing' : ''}`}>
        {/* Header Details */}
        <div className="calendar-institution">
          <div className="document-institution-heading">
            <img src={collegeLogoUrl} alt="GVPCEW logo" className="document-institution-logo" />
            <div>
              <b>Gayatri Vidya Parishad College of Engineering for Women</b>
              <span>(Autonomous), Madhurawada, Visakhapatnam – 530 048</span>
              <span>Affiliated to Andhra University, Visakhapatnam</span>
            </div>
          </div>
        </div>

        <h2>Academic Calendar</h2>

        {isEditing ? (
          <div className="calendar-title-edit">
            <label className="text-xs font-bold text-slate-500 block mb-1">Academic Year & Program Title:</label>
            <input
              type="text"
              className="cal-edit-title-input"
              value={calendar.title}
              onChange={(e) => handleUpdateTitle(e.target.value)}
              placeholder="e.g. II Year B. Tech. for the Academic Year 2025–26"
            />
          </div>
        ) : (
          <p>{calendar.title || 'II Year B. Tech. for the Academic Year 2025–26'}</p>
        )}

        {/* Semesters Tables */}
        {calendar.semesters.map((sem, semIndex) => (
          <div key={semIndex} className="calendar-semester">
            <div className="calendar-semester-header flex items-center justify-between">
              {isEditing ? (
                <input
                  type="text"
                  className="cal-semester-name-input"
                  value={sem.name}
                  onChange={(e) => handleUpdateSemesterName(semIndex, e.target.value)}
                  placeholder="Semester Name (e.g. I SEMESTER)"
                />
              ) : (
                <h3>{sem.name.toUpperCase()}</h3>
              )}
            </div>

            <div className="overflow">
              <table>
                <thead>
                  <tr>
                    <th className="cal-col-desc">DESCRIPTION</th>
                    <th className="cal-col-from">FROM</th>
                    <th className="cal-col-to">TO</th>
                    <th className="cal-col-duration">NO. OF WEEKS/DAYS</th>
                    {isEditing && <th className="cal-col-action">ACTION</th>}
                  </tr>
                </thead>
                <tbody>
                  {sem.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {/* Description */}
                      <td className="cal-col-desc">
                        {isEditing ? (
                          <input
                            type="text"
                            className="cal-cell-input cal-cell-desc"
                            value={row.description}
                            onChange={(e) => handleUpdateRow(semIndex, rowIndex, 'description', e.target.value)}
                            placeholder="Activity description"
                          />
                        ) : (
                          row.description
                        )}
                      </td>

                      {/* From Date */}
                      <td className="cal-col-from">
                        {isEditing ? (
                          <input
                            type="text"
                            className="cal-cell-input cal-cell-date"
                            value={row.from}
                            onChange={(e) => handleUpdateRow(semIndex, rowIndex, 'from', e.target.value)}
                            placeholder="DD-MM-YYYY"
                          />
                        ) : (
                          row.from || ''
                        )}
                      </td>

                      {/* To Date */}
                      <td className="cal-col-to">
                        {isEditing ? (
                          <input
                            type="text"
                            className="cal-cell-input cal-cell-date"
                            value={row.to}
                            onChange={(e) => handleUpdateRow(semIndex, rowIndex, 'to', e.target.value)}
                            placeholder="DD-MM-YYYY"
                          />
                        ) : (
                          row.to || ''
                        )}
                      </td>

                      {/* Duration / Weeks / Days */}
                      <td className="cal-col-duration">
                        {isEditing ? (
                          <input
                            type="text"
                            className="cal-cell-input cal-cell-duration"
                            value={row.duration}
                            onChange={(e) => handleUpdateRow(semIndex, rowIndex, 'duration', e.target.value)}
                            placeholder="e.g. 18 W or 03 days"
                          />
                        ) : (
                          row.duration || ''
                        )}
                      </td>

                      {/* Action (Delete row in edit mode) */}
                      {isEditing && (
                        <td className="cal-col-action">
                          <button
                            type="button"
                            className="cal-row-delete-btn"
                            title="Remove this event row"
                            onClick={() => handleDeleteRow(semIndex, rowIndex)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isEditing && (
              <div className="cal-add-row-bar">
                <button
                  type="button"
                  className="cal-add-row-btn"
                  onClick={() => handleAddRow(semIndex)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Row to {sem.name}</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Holidays Section */}
        <div className="calendar-notes">
          <div className="flex items-center justify-between mb-1">
            <b>Holidays</b>
            {isEditing && (
              <button
                type="button"
                className="cal-add-holiday-btn"
                onClick={handleAddHoliday}
              >
                <Plus className="w-3 h-3" />
                <span>Add Holiday</span>
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="cal-holidays-edit-list">
              {calendar.holidays.map((h, hIdx) => (
                <div key={hIdx} className="cal-holiday-edit-item">
                  <input
                    type="text"
                    className="cal-holiday-name-input"
                    value={h.name}
                    onChange={(e) => handleUpdateHoliday(hIdx, 'name', e.target.value)}
                    placeholder="Holiday Name (e.g. Dussehra)"
                  />
                  <span className="text-slate-400">:</span>
                  <input
                    type="text"
                    className="cal-holiday-date-input"
                    value={h.from}
                    onChange={(e) => handleUpdateHoliday(hIdx, 'from', e.target.value)}
                    placeholder="From (DD-MM-YYYY)"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="text"
                    className="cal-holiday-date-input"
                    value={h.to}
                    onChange={(e) => handleUpdateHoliday(hIdx, 'to', e.target.value)}
                    placeholder="To (DD-MM-YYYY)"
                  />
                  <button
                    type="button"
                    className="cal-holiday-del-btn"
                    title="Remove Holiday"
                    onClick={() => handleDeleteHoliday(hIdx)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            calendar.holidays.map((h, hIdx) => (
              <span key={hIdx}>
                {h.name}: {h.from}{h.to ? ` to ${h.to}` : ''}
              </span>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
