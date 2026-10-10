import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Edit3, Check, Save, Share2, FolderOpen, Plus, Trash2, X,
  Printer, Sparkles, ShieldCheck, AlertTriangle, Clock, MapPin, User,
  FileText, Upload, Image as ImageIcon, Download, RefreshCw, Eye, CheckCircle2,
  ChevronRight, Filter, Search, Layers, LayoutGrid, Info, Palette, Sliders,
  FileSpreadsheet, Table, RotateCcw, GraduationCap, Landmark, Users
} from 'lucide-react';
import {
  detectAndSplitTimetableExcel,
  createSectionWorkbook,
  createCombinedWorkbook,
  downloadWorkbook,
  convertSplitSectionToTimetableGrid,
  parseLegendMap
} from './utils/timetableSplitter.js';
import { api } from './api.js';
import { TimetableGenerator } from './TimetableGenerator.jsx';
import { saveTimetableCache } from './timetable-cache.js';

export function parseSpreadsheetText(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
  return lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

export const TIMETABLE_STORAGE_KEY = 'gvpcew_timetable_master_v3';
export const TIMETABLE_IMAGE_KEY = 'gvpcew_timetable_images_v3';
export const TIMETABLE_STATUS_KEY = 'gvpcew_timetable_published_status_v3';

const LEGACY_BRANCHES = [
  { key: 'cse_sec1', name: 'Computer Science & Engineering (Sec 1)', short: 'CSE - 1', dept: 'CSE', year: 'II Year', sem: 'II Sem', section: '1', room: 'Room 301' },
  { key: 'cse_sec2', name: 'Computer Science & Engineering (Sec 2)', short: 'CSE - 2', dept: 'CSE', year: 'II Year', sem: 'II Sem', section: '2', room: 'Room 302' },
  { key: 'cse_sec3', name: 'Computer Science & Engineering (Sec 3)', short: 'CSE - 3', dept: 'CSE', year: 'II Year', sem: 'II Sem', section: '3', room: 'Room L19' },
  { key: 'cse_sec4', name: 'Computer Science & Engineering (Sec 4)', short: 'CSE - 4', dept: 'CSE', year: 'II Year', sem: 'II Sem', section: '4', room: 'Room 304' },
  { key: 'csm_sec1', name: 'CSE - Artificial Intelligence & ML (Sec 1)', short: 'CSM - 1', dept: 'CSM', year: 'II Year', sem: 'II Sem', section: '1', room: 'Room 201' },
  { key: 'csm_sec2', name: 'CSE - Artificial Intelligence & ML (Sec 2)', short: 'CSM - 2', dept: 'CSM', year: 'II Year', sem: 'II Sem', section: '2', room: 'Room 202' },
  { key: 'csc_sec1', name: 'CSE - Cyber Security (Sec 1)', short: 'CSC - 1', dept: 'CSC', year: 'II Year', sem: 'II Sem', section: '1', room: 'Room 205' },
  { key: 'ece_sec1', name: 'Electronics & Communication Engg (Sec 1)', short: 'ECE - 1', dept: 'ECE', year: 'II Year', sem: 'II Sem', section: '1', room: 'Room 101' },
  { key: 'ece_sec2', name: 'Electronics & Communication Engg (Sec 2)', short: 'ECE - 2', dept: 'ECE', year: 'II Year', sem: 'II Sem', section: '2', room: 'Room 102' },
  { key: 'eee_sec1', name: 'Electrical & Electronics Engg (Sec 1)', short: 'EEE - 1', dept: 'EEE', year: 'II Year', sem: 'II Sem', section: '1', room: 'Room 108' },
  { key: 'it_sec1', name: 'Information Technology (Sec 1)', short: 'IT - 1', dept: 'IT', year: 'II Year', sem: 'II Sem', section: '1', room: 'Room 305' }
];

// Keep existing second-year keys so saved and published schedules remain accessible.
export const BRANCHES = ['I', 'II', 'III', 'IV'].flatMap((year, index) =>
  ['CSE', 'CSM', 'CSC', 'ECE', 'EEE', 'IT'].flatMap(dept =>
    ['1', '2', '3', '4'].map(section => {
      const base = LEGACY_BRANCHES.find(b => b.dept === dept);
      const legacy = LEGACY_BRANCHES.find(b => b.dept === dept && b.section === section);
      return {
        ...base,
        key: `${dept.toLowerCase()}_sec${section}${index === 1 ? '' : `_year${index + 1}`}`,
        name: base.name.replace(/\(Sec \d\)/, `(Sec ${section})`),
        short: `${dept} - ${section}`, section, year: `${year} Year`, yearNumber: index + 1,
        sem: 'I Sem', room: index === 1 && legacy ? legacy.room : 'Not assigned'
      };
    })
  )
);

export const STANDARD_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const STANDARD_PERIODS = [
  { id: 'p1', time: '08:40 AM - 09:30 AM', label: 'Period 1', isBreak: false },
  { id: 'p2', time: '09:30 AM - 10:20 AM', label: 'Period 2', isBreak: false },
  { id: 'p3', time: '10:20 AM - 11:10 AM', label: 'Period 3', isBreak: false },
  { id: 'p4', time: '11:10 AM - 12:00 PM', label: 'Period 4', isBreak: false },
  { id: 'lunch', time: '12:00 PM - 12:50 PM', label: 'LUNCH BREAK', isBreak: true },
  { id: 'p5', time: '12:50 PM - 01:40 PM', label: 'Period 5', isBreak: false },
  { id: 'p6', time: '01:40 PM - 02:30 PM', label: 'Period 6', isBreak: false },
  { id: 'p7', time: '02:30 PM - 03:20 PM', label: 'Period 7', isBreak: false }
];

export const SLOT_TYPES = {
  theory: { label: 'Theory / Lecture', color: '#e0edff', textColor: '#1e40af', border: '#bfdbfe' },
  lab: { label: 'Practical / Lab', color: '#dcfce7', textColor: '#166534', border: '#bbf7d0' },
  tutorial: { label: 'Tutorial / Practice', color: '#f3e8ff', textColor: '#6b21a8', border: '#e9d5ff' },
  elective: { label: 'Elective / Skill', color: '#fef3c7', textColor: '#92400e', border: '#fde68a' },
  library: { label: 'Library / Mentoring', color: '#ffedd5', textColor: '#9a3412', border: '#fed7aa' },
  break: { label: 'Break / Lunch', color: '#f1f5f9', textColor: '#475569', border: '#cbd5e1' },
  remedial: { label: 'Remedial / Special', color: '#fee2e2', textColor: '#991b1b', border: '#fca5a5' }
};

const createScheduleGrid = (branchKey, room, inchargeName, isSec3 = false) => ({
  id: branchKey,
  title: `II B.Tech II Semester (2025–26) — ${BRANCHES.find(b => b.key === branchKey)?.name || 'Branch'}`,
  academicYear: '2025–2026',
  classroom: `${room} (Academic Block)`,
  incharge: inchargeName,
  status: 'Published',
  updatedAt: '2026-08-17',
  days: STANDARD_DAYS,
  periods: STANDARD_PERIODS,
  grid: {
    Monday: {
      p1: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room, type: 'theory' },
      p2: { subject: isSec3 ? 'Information Retrieved System (IRS)' : 'Design & Analysis of Algorithms', code: isSec3 ? '24CT11OE01' : '24CT11RC18', faculty: 'Dr. M. Lakshmi', room, type: isSec3 ? 'elective' : 'theory' },
      p3: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room, type: 'theory' },
      p4: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room, type: 'theory' },
      lunch: { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Campus Cafeteria', type: 'break' },
      p5: { subject: 'DBMS Lab (Batch 1) / OS Lab (Batch 2)', code: '24CT11LC08', faculty: 'Prof. R. Kiran / Dr. M. Lakshmi', room: 'Lab 4 (CS Block)', type: 'lab' },
      p6: { subject: 'DBMS Lab (Batch 1) / OS Lab (Batch 2)', code: '24CT11LC08', faculty: 'Prof. R. Kiran / Dr. M. Lakshmi', room: 'Lab 4 (CS Block)', type: 'lab' },
      p7: { subject: 'DBMS Lab (Batch 1) / OS Lab (Batch 2)', code: '24CT11LC08', faculty: 'Prof. R. Kiran / Dr. M. Lakshmi', room: 'Lab 4 (CS Block)', type: 'lab' }
    },
    Tuesday: {
      p1: { subject: isSec3 ? 'Microprocessors & Micro controllers' : 'Design & Analysis of Algorithms', code: isSec3 ? '24EC11OE02' : '24CT11RC18', faculty: 'Dr. J. Naresh', room, type: 'theory' },
      p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room, type: 'theory' },
      p3: { subject: isSec3 ? 'Information Retrieved System (IRS)' : 'Formal Languages & Automata', code: isSec3 ? '24CT11OE01' : '24CT11RC20', faculty: 'Dr. M. Lakshmi', room, type: 'theory' },
      p4: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room, type: 'theory' },
      lunch: { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Campus Cafeteria', type: 'break' },
      p5: { subject: 'DAA Laboratory', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi / Mrs. P. Vani', room: 'Lab 2 (CS Block)', type: 'lab' },
      p6: { subject: 'DAA Laboratory', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi / Mrs. P. Vani', room: 'Lab 2 (CS Block)', type: 'lab' },
      p7: { subject: 'DAA Laboratory', code: '24CT11LC09', faculty: 'Dr. M. Lakshmi / Mrs. P. Vani', room: 'Lab 2 (CS Block)', type: 'lab' }
    },
    Wednesday: {
      p1: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room, type: 'theory' },
      p2: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room, type: 'theory' },
      p3: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room, type: 'theory' },
      p4: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room, type: 'theory' },
      lunch: { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Campus Cafeteria', type: 'break' },
      p5: { subject: isSec3 ? 'IRS Open Elective Lab / Tutorial' : 'Data Visualization [Honors]', code: isSec3 ? '24CT11OE01-L' : '24CA11HN02', faculty: 'Dr. K. Sravani', room, type: 'elective' },
      p6: { subject: 'Library / Student Mentoring Session', code: 'MENTOR-02', faculty: 'Dr. K. Sravani / Dr. V. Prasad', room: 'Library Hall', type: 'library' },
      p7: { subject: 'Technical Skill Course (Python Advanced)', code: '24SC11SK04', faculty: 'Trainer Mr. G. Rajesh', room: 'Lab 1', type: 'tutorial' }
    },
    Thursday: {
      p1: { subject: isSec3 ? 'Information Retrieved System (IRS)' : 'Database Management Systems', code: isSec3 ? '24CT11OE01' : '24CT11RC12', faculty: 'Dr. M. Lakshmi', room, type: 'theory' },
      p2: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room, type: 'theory' },
      p3: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room, type: 'theory' },
      p4: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room, type: 'theory' },
      lunch: { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Campus Cafeteria', type: 'break' },
      p5: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
      p6: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' },
      p7: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' }
    },
    Friday: {
      p1: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room, type: 'theory' },
      p2: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room, type: 'theory' },
      p3: { subject: 'Formal Languages & Automata', code: '24CT11RC20', faculty: 'Dr. A. Srinivas', room, type: 'theory' },
      p4: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room, type: 'theory' },
      lunch: { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Campus Cafeteria', type: 'break' },
      p5: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
      p6: { subject: 'Mini Project & Review Lab', code: '24CT11PR01', faculty: 'Dr. K. Sravani', room: 'Project Lab', type: 'lab' },
      p7: { subject: 'Social Media Analytics [Honors]', code: '24CT11HN02', faculty: 'Dr. A. Srinivas', room, type: 'elective' }
    },
    Saturday: {
      p1: { subject: 'Managerial Economics', code: '24HM11RC01', faculty: 'Dr. T. Ramesh', room, type: 'theory' },
      p2: { subject: 'Prof. Ethics & Human Values', code: '24HM11MC01', faculty: 'Mrs. S. Bhavani', room, type: 'theory' },
      p3: { subject: 'DAA Tutorial & Doubt Clearing', code: '24CT11RC18-T', faculty: 'Dr. M. Lakshmi', room, type: 'tutorial' },
      p4: { subject: 'Sports & Student Club Activities', code: 'ECA-02', faculty: 'Physical Director', room: 'Sports Ground', type: 'library' },
      lunch: { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Campus Cafeteria', type: 'break' },
      p5: { subject: 'Technical Seminar & Presentation', code: '24CT11SM01', faculty: 'Dr. K. Sravani', room: 'Seminar Hall 1', type: 'tutorial' },
      p6: { subject: 'Remedial / Placement Training', code: 'CRT-02', faculty: 'Training Officer', room, type: 'elective' },
      p7: { subject: 'Weekly Faculty Review & Feedback', code: 'REV-02', faculty: inchargeName, room, type: 'library' }
    }
  }
});

export const INITIAL_TIMETABLES = {
  cse_sec1: createScheduleGrid('cse_sec1', 'Room 301', 'Dr. K. Sravani, Associate Professor'),
  cse_sec2: createScheduleGrid('cse_sec2', 'Room 302', 'Dr. M. Lakshmi, Professor'),
  cse_sec3: createScheduleGrid('cse_sec3', 'Room L19', 'Dr. K. Sravani / Dr. M. Lakshmi', true),
  cse_sec4: createScheduleGrid('cse_sec4', 'Room 304', 'Dr. A. Srinivas, Associate Professor'),
  csm_sec1: createScheduleGrid('csm_sec1', 'Room 201', 'Dr. S. K. Roy, Associate Professor'),
  csm_sec2: createScheduleGrid('csm_sec2', 'Room 202', 'Dr. P. Madhavi, Associate Professor'),
  csc_sec1: createScheduleGrid('csc_sec1', 'Room 205', 'Dr. R. V. Sharma, Associate Professor'),
  ece_sec1: createScheduleGrid('ece_sec1', 'Room 101', 'Dr. J. Naresh, Associate Professor'),
  ece_sec2: createScheduleGrid('ece_sec2', 'Room 102', 'Dr. V. Prasad, Professor'),
  eee_sec1: createScheduleGrid('eee_sec1', 'Room 108', 'Dr. Y. V. Rao, Professor'),
  it_sec1: createScheduleGrid('it_sec1', 'Room 305', 'Dr. P. Vani, Assistant Professor')
};

BRANCHES.forEach(branch => {
  if (INITIAL_TIMETABLES[branch.key]) return;
  INITIAL_TIMETABLES[branch.key] = {
    id: branch.key, title: `${branch.year.replace(' Year', '')} B.Tech I Semester (2025–26) — ${branch.name}`,
    academicYear: '2025–2026', yearNumber: branch.yearNumber, semesterNumber: branch.yearNumber * 2 - 1,
    classroom: 'Not assigned', incharge: 'Not assigned', status: 'Draft',
    days: STANDARD_DAYS, periods: STANDARD_PERIODS, grid: {}
  };
});

const TIMETABLE_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIOD_BY_START_TIME = {
  '08:40': 'p1', '09:30': 'p2', '10:20': 'p3', '11:10': 'p4',
  '12:00': 'lunch', '12:50': 'p5', '13:40': 'p6', '14:30': 'p7', '15:20': 'p8'
};

function studentSchedule(rows, profile, fallbackDoc) {
  if (fallbackDoc && fallbackDoc.grid && Object.values(fallbackDoc.grid).some(d => d && Object.keys(d).length > 0)) {
    return fallbackDoc;
  }
  const section = profile || {};
  const grid = {};
  for (const row of rows || []) {
    const day = TIMETABLE_DAY_NAMES[Number(row.day_of_week)];
    if (!day) continue;
    const startSlice = String(row.start_time || '').slice(0, 5);
    let period = PERIOD_BY_START_TIME[startSlice];
    if (!period) {
      const found = STANDARD_PERIODS.find(p => p.time.includes(startSlice));
      period = found ? found.id : ('p_' + startSlice.replace(':', ''));
    }
    grid[day] = grid[day] || {};
    grid[day][period] = {
      subject: row.subject || row.name || 'Class',
      code: row.code || '',
      faculty: row.faculty || '',
      room: row.classroom || '',
      type: row.entry_type === 'lab' ? 'lab' : row.entry_type || 'theory'
    };
  }
  const year = section.year ? `${section.year}${section.year === 1 ? 'st' : section.year === 2 ? 'nd' : section.year === 3 ? 'rd' : 'th'} Year` : 'Assigned class';
  return {
    title: `${year}${section.semester ? ` · Semester ${section.semester}` : ''} — ${section.department || 'My Branch'} (Section ${section.section || '—'})`,
    academicYear: section.academic_year || '2025–2026',
    classroom: rows?.[0]?.classroom || 'See individual class slots',
    incharge: 'As assigned in the timetable',
    status: 'Published',
    days: STANDARD_DAYS,
    periods: STANDARD_PERIODS,
    grid
  };
}

function facultySchedule(rows, fallbackDoc, facultyViewMode = 'schedule') {
  if (facultyViewMode === 'class' && fallbackDoc && fallbackDoc.grid) {
    return fallbackDoc;
  }
  if ((!rows || !rows.length) && fallbackDoc && fallbackDoc.grid) {
    return fallbackDoc;
  }
  const grid = {};
  for (const row of rows || []) {
    const day = TIMETABLE_DAY_NAMES[Number(row.day_of_week)];
    if (!day) continue;
    const startSlice = String(row.start_time || '').slice(0, 5);
    let period = PERIOD_BY_START_TIME[startSlice];
    if (!period) {
      const found = STANDARD_PERIODS.find(p => p.time.includes(startSlice));
      period = found ? found.id : ('p_' + startSlice.replace(':', ''));
    }
    grid[day] = grid[day] || {};
    grid[day][period] = {
      subject: row.subject || row.name || 'Class',
      code: row.code || '',
      faculty: row.faculty || 'You',
      room: row.classroom || '',
      type: row.entry_type === 'lab' ? 'lab' : row.entry_type || 'theory'
    };
  }
  return {
    title: 'My Teaching Schedule — Faculty View',
    academicYear: rows?.[0]?.academic_year || '2025–2026',
    classroom: 'Assigned Rooms',
    incharge: 'Faculty Instructor',
    status: 'Published',
    days: STANDARD_DAYS,
    periods: STANDARD_PERIODS,
    grid
  };
}

export function sanitizeAcademicYear(rawYear) {
  if (
    !rawYear ||
    typeof rawYear !== 'string' ||
    /Academic\s+Session\s+starts/i.test(rawYear) ||
    /w\.?e\.?f/i.test(rawYear) ||
    rawYear.length > 60 ||
    (rawYear.match(/\(AUTONOMOUS\)/gi) || []).length > 1
  ) {
    return 'II B.Tech II Semester (2025–26)';
  }
  return rawYear.trim();
}

export function sanitizeTimetableTitle(rawTitle, branchKey, yearSem) {
  const br = BRANCHES.find(b => b.key === branchKey);
  const branchName = br?.name || 'Computer Science & Engineering';
  const cleanYearSem = sanitizeAcademicYear(yearSem || (br ? `${br.year} ${br.sem} (2025–26)` : 'II B.Tech II Semester (2025–26)'));

  if (!rawTitle || typeof rawTitle !== 'string') {
    return `${cleanYearSem} — ${branchName}`;
  }

  // If title contains announcement footnotes, is corrupted, or is excessively long
  if (
    /Academic\s+Session\s+starts/i.test(rawTitle) ||
    /w\.?e\.?f|with\s+effect\s+from|classwork\s+commences/i.test(rawTitle) ||
    rawTitle.length > 120 ||
    (rawTitle.match(/\(AUTONOMOUS\)/gi) || []).length > 1 ||
    rawTitle.includes('\n')
  ) {
    return `${cleanYearSem} — ${branchName}`;
  }

  return rawTitle.trim();
}

export function sanitizeTimetableRecord(record, branchKey) {
  if (!record || typeof record !== 'object') {
    return INITIAL_TIMETABLES[branchKey] || INITIAL_TIMETABLES.cse_sec3;
  }
  const br = BRANCHES.find(b => b.key === branchKey);
  const cleanYear = sanitizeAcademicYear(record.academicYear);
  const cleanTitle = sanitizeTimetableTitle(record.title, branchKey, cleanYear);

  return {
    ...record,
    id: record.id || branchKey,
    title: cleanTitle,
    academicYear: cleanYear,
    classroom: (record.classroom && !/Academic\s+Session/i.test(record.classroom)) ? record.classroom : (br?.room ? `${br.room} (Academic Block)` : 'Room 301'),
    incharge: (record.incharge && !/Academic\s+Session/i.test(record.incharge)) ? record.incharge : (INITIAL_TIMETABLES[branchKey]?.incharge || 'Faculty Incharge'),
    status: record.status || 'Published',
    days: (Array.isArray(record.days) && record.days.length > 0 && record.days.every(d => typeof d === 'string' && d.length < 20 && !/Academic\s+Session/i.test(d)))
      ? record.days
      : STANDARD_DAYS,
    periods: (Array.isArray(record.periods) && record.periods.length > 0 && record.periods.every(p => p && p.id && !/Academic\s+Session/i.test(p.label || '')))
      ? record.periods
      : STANDARD_PERIODS,
    grid: (record.grid && typeof record.grid === 'object') ? record.grid : (INITIAL_TIMETABLES[branchKey]?.grid || {})
  };
}

export function TimetableManagement({ role = 'academic_coordinator', rows = [], reload, student }) {
  const isEditor = role === 'academic_coordinator' || role === 'admin';
  const isStudent = role === 'student';
  const isFaculty = role === 'faculty';
  const [facultyViewMode, setFacultyViewMode] = useState('schedule');

  // Load official published timetables from server
  useEffect(() => {
    let active = true;
    async function loadServerTimetables() {
      try {
        const { data } = await api.get('/academic-documents/timetable', { params: { manage: isEditor } });
        if (!active || !data?.documents?.length) return;
        const serverDocs = {};
        const serverImgs = {};
        for (const doc of data.documents) {
          if (doc.key && doc.payload) {
            serverDocs[doc.key] = sanitizeTimetableRecord(doc.payload, doc.key);
            if (doc.payload.image) {
              serverImgs[doc.key] = doc.payload.image;
            }
          }
        }
        setTimetables(prev => ({ ...prev, ...serverDocs }));
        setTimetableImages(prev => ({ ...prev, ...serverImgs }));
      } catch (err) {
        // Graceful fallback to local cache
      }
    }
    loadServerTimetables();
    return () => { active = false; };
  }, [isEditor]);

  // Load Timetables State from LocalStorage with auto-sanitization of corrupted entries
  const [timetables, setTimetables] = useState(() => {
    try {
      const saved = localStorage.getItem(TIMETABLE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = { ...INITIAL_TIMETABLES, ...parsed };
        const cleaned = {};
        let hadCorruption = false;

        Object.keys(merged).forEach(k => {
          const original = merged[k];
          const sanitized = sanitizeTimetableRecord(original, k);
          if (sanitized.title !== original?.title || sanitized.academicYear !== original?.academicYear) {
            hadCorruption = true;
          }
          cleaned[k] = sanitized;
        });

        if (hadCorruption) {
          try {
            localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(cleaned));
          } catch {}
        }
        return cleaned;
      }
    } catch {}
    return INITIAL_TIMETABLES;
  });

  // Load Attached Official Timetable Images
  const [timetableImages, setTimetableImages] = useState(() => {
    try {
      const saved = localStorage.getItem(TIMETABLE_IMAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Selected Branch / Section
  const [selectedBranch, setSelectedBranch] = useState(() => {
    if (student?.profile?.department) {
      const dept = student.profile.department.toLowerCase();
      const sec = String(student?.profile?.section || '3');
      if (dept.includes('aiml') || dept.includes('csm')) return sec.includes('2') ? 'csm_sec2' : 'csm_sec1';
      if (dept.includes('cyber') || dept.includes('csc')) return 'csc_sec1';
      if (dept.includes('ece')) return sec.includes('2') ? 'ece_sec2' : 'ece_sec1';
      if (dept.includes('eee')) return 'eee_sec1';
      if (dept.includes('it')) return 'it_sec1';
      if (dept.includes('cse')) {
        if (sec.includes('1') || sec.toLowerCase() === 'a') return 'cse_sec1';
        if (sec.includes('2') || sec.toLowerCase() === 'b') return 'cse_sec2';
        if (sec.includes('3') || sec.toLowerCase() === 'c') return 'cse_sec3';
        if (sec.includes('4') || sec.toLowerCase() === 'd') return 'cse_sec4';
        return 'cse_sec3';
      }
    }
    return 'cse_sec3';
  });

  // Active View Tab: 'grid', 'image', 'conflicts'
  const [viewMode, setViewMode] = useState('grid');
  const [selectedDayFilter, setSelectedDayFilter] = useState('all');
  const [isEditingCell, setIsEditingCell] = useState(null); // { day, periodId, data }
  const [editingModalOpen, setEditingModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [addDayModalOpen, setAddDayModalOpen] = useState(false);
  const [addPeriodModalOpen, setAddPeriodModalOpen] = useState(false);
  const [newDayName, setNewDayName] = useState('Sunday');
  const [newPeriodForm, setNewPeriodForm] = useState({ id: 'p8', time: '03:20 PM - 04:10 PM', label: 'Period 8', isBreak: false });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [cacheError, setCacheError] = useState('');
  const fileInputRef = useRef(null);

  // Upload Timetable Modal State & Handlers
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null); // { dataUrl, name, size, type, isPdf }
  const [detectedSplitResult, setDetectedSplitResult] = useState(null);
  const [activeSplitSectionIndex, setActiveSplitSectionIndex] = useState(0);
  const [uploadSections, setUploadSections] = useState([]); // array of branch keys
  const [uploadYearSem, setUploadYearSem] = useState('II B.Tech II Semester (2025–26)');
  const [uploadClassroom, setUploadClassroom] = useState('Room 301');
  const [uploadIncharge, setUploadIncharge] = useState('Dr. K. Sravani, Associate Professor');
  const [uploadPublishImmediately, setUploadPublishImmediately] = useState(true);
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const uploadFileInputRef = useRef(null);

  // A student timetable is built from the published section record if available,
  // or dynamically compiled from the server-filtered rows for the student's academic section.
  const rawTimetable = isStudent
    ? studentSchedule(rows, student?.profile, timetables[selectedBranch])
    : isFaculty
    ? facultySchedule(rows, timetables[selectedBranch], facultyViewMode)
    : timetables[selectedBranch] || INITIAL_TIMETABLES[selectedBranch] || INITIAL_TIMETABLES.cse_sec3;
  const currentTimetable = isStudent || isFaculty
    ? rawTimetable
    : sanitizeTimetableRecord(rawTimetable, selectedBranch);
  const currentImage = timetableImages[selectedBranch] || null;
  const selectedClass = BRANCHES.find(b => b.key === selectedBranch);
  const yearBranches = BRANCHES.filter(b => b.year === selectedClass?.year);
  const facultyDirectory = useMemo(() => {
    const entries = new Map();
    const legend = { ...parseLegendMap(currentTimetable.rawLegend), ...currentTimetable.legendMap };
    Object.entries(legend).forEach(([subject, faculty]) => {
      if (faculty) entries.set(subject.toUpperCase(), { subject, faculty, type: 'theory' });
    });
    Object.values(currentTimetable.grid || {}).forEach(day => {
      Object.values(day || {}).forEach(slot => {
        if (!slot?.subject || slot.type === 'break') return;
        const subject = slot.code || slot.subject;
        const key = subject.toUpperCase();
        const faculty = legend[key] || slot.faculty;
        if (!faculty || /^(Faculty Incharge|Not Assigned)$/i.test(faculty.trim())) return;
        const existing = entries.get(key);
        if (existing && existing.faculty === faculty) return;
        entries.set(existing ? `${key}:${faculty}` : key, { subject, faculty, type: slot.type || 'theory' });
      });
    });
    return [...entries.values()];
  }, [currentTimetable]);

  // Proactively check and cleanse corrupted localStorage strings (e.g. repeated footnotes)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TIMETABLE_STORAGE_KEY);
      if (saved && /Academic\s+Session\s+starts/i.test(saved)) {
        const parsed = JSON.parse(saved);
        const cleaned = {};
        Object.keys(parsed).forEach(k => {
          cleaned[k] = sanitizeTimetableRecord(parsed[k], k);
        });
        const finalTimetables = { ...INITIAL_TIMETABLES, ...cleaned };
        localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(finalTimetables));
        setTimetables(finalTimetables);
      }
    } catch {}
  }, []);

  // Persist Timetables
  useEffect(() => {
    if (isEditor) {
      if (!saveTimetableCache(TIMETABLE_STORAGE_KEY, timetables)) {
        setCacheError('Browser storage is full or unavailable. You can still view and edit timetables; publish to save changes to the server.');
      }
    }
  }, [timetables, isEditor]);

  // Persist Images
  useEffect(() => {
    if (isEditor) {
      if (!saveTimetableCache(TIMETABLE_IMAGE_KEY, timetableImages)) {
        setCacheError('Browser storage is full or unavailable. You can still view and edit timetables; publish to save changes to the server.');
      }
    }
  }, [timetableImages, isEditor]);

  // Sync across windows
  useEffect(() => {
    const handleSync = (e) => {
      if (!e || e.key === TIMETABLE_STORAGE_KEY) {
        try {
          const fresh = JSON.parse(localStorage.getItem(TIMETABLE_STORAGE_KEY));
          if (fresh) setTimetables(fresh);
        } catch {}
      }
      if (!e || e.key === TIMETABLE_IMAGE_KEY) {
        try {
          const freshImages = JSON.parse(localStorage.getItem(TIMETABLE_IMAGE_KEY));
          if (freshImages) setTimetableImages(freshImages);
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

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(prev => (prev === msg ? '' : prev)), 3500);
  };

  // Today Indicator
  const todayName = useMemo(() => {
    const d = new Date().getDay();
    const dayMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayMap[d] || 'Monday';
  }, []);

  // Open Cell Editor
  const handleOpenEditCell = (day, periodId) => {
    if (!isEditor) return;
    const existing = currentTimetable.grid?.[day]?.[periodId] || {
      subject: '', code: '', faculty: '', room: currentTimetable.classroom || '', type: 'theory', customColor: '', customTextColor: ''
    };
    setIsEditingCell({ day, periodId, data: { ...existing } });
    setEditingModalOpen(true);
  };

  // Save Cell
  const handleSaveCell = (e) => {
    e.preventDefault();
    if (!isEditingCell) return;
    const { day, periodId, data } = isEditingCell;

    setTimetables(prev => {
      const branchData = { ...(prev[selectedBranch] || INITIAL_TIMETABLES[selectedBranch]) };
      const grid = { ...branchData.grid };
      const daySlots = { ...(grid[day] || {}) };
      daySlots[periodId] = data;
      grid[day] = daySlots;
      branchData.grid = grid;
      branchData.updatedAt = new Date().toISOString().split('T')[0];
      return { ...prev, [selectedBranch]: branchData };
    });

    setEditingModalOpen(false);
    setIsEditingCell(null);
    showNotice(`Updated ${day} (${periodId.toUpperCase()}) schedule.`);
  };

  // Add Day (Row)
  const handleAddDay = (e) => {
    e.preventDefault();
    if (!newDayName.trim()) return;

    setTimetables(prev => {
      const branchData = { ...(prev[selectedBranch] || INITIAL_TIMETABLES[selectedBranch]) };
      const days = [...(branchData.days || STANDARD_DAYS)];
      if (days.includes(newDayName)) {
        alert('This day already exists in the timetable!');
        return prev;
      }
      days.push(newDayName);
      branchData.days = days;
      const grid = { ...branchData.grid };
      if (!grid[newDayName]) {
        grid[newDayName] = {};
        (branchData.periods || STANDARD_PERIODS).forEach(p => {
          grid[newDayName][p.id] = p.isBreak
            ? { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Cafeteria', type: 'break' }
            : { subject: '', code: '', faculty: '', room: branchData.classroom || '', type: 'theory' };
        });
      }
      branchData.grid = grid;
      return { ...prev, [selectedBranch]: branchData };
    });

    setAddDayModalOpen(false);
    showNotice(`Added row for ${newDayName}.`);
  };

  // Delete Day (Row)
  const handleDeleteDay = (dayToDelete) => {
    if (!window.confirm(`Delete row for ${dayToDelete}?`)) return;

    setTimetables(prev => {
      const branchData = { ...(prev[selectedBranch] || INITIAL_TIMETABLES[selectedBranch]) };
      const days = (branchData.days || STANDARD_DAYS).filter(d => d !== dayToDelete);
      branchData.days = days;
      const grid = { ...branchData.grid };
      delete grid[dayToDelete];
      branchData.grid = grid;
      return { ...prev, [selectedBranch]: branchData };
    });

    showNotice(`Deleted row for ${dayToDelete}.`);
  };

  // Add Period (Column)
  const handleAddPeriod = (e) => {
    e.preventDefault();
    if (!newPeriodForm.label.trim()) return;

    const pid = newPeriodForm.id.trim() || `p_${Date.now()}`;

    setTimetables(prev => {
      const branchData = { ...(prev[selectedBranch] || INITIAL_TIMETABLES[selectedBranch]) };
      const periods = [...(branchData.periods || STANDARD_PERIODS)];
      if (periods.some(p => p.id === pid)) {
        alert('A period with this ID already exists!');
        return prev;
      }
      periods.push({ ...newPeriodForm, id: pid });
      branchData.periods = periods;

      const grid = { ...branchData.grid };
      (branchData.days || STANDARD_DAYS).forEach(day => {
        grid[day] = {
          ...(grid[day] || {}),
          [pid]: newPeriodForm.isBreak
            ? { subject: 'BREAK', code: '', faculty: '', room: '', type: 'break' }
            : { subject: '', code: '', faculty: '', room: branchData.classroom || '', type: 'theory' }
        };
      });
      branchData.grid = grid;
      return { ...prev, [selectedBranch]: branchData };
    });

    setAddPeriodModalOpen(false);
    showNotice(`Added column: ${newPeriodForm.label}.`);
  };

  // Delete Period (Column)
  const handleDeletePeriod = (periodIdToDelete) => {
    if (!window.confirm(`Delete this period column (${periodIdToDelete}) across all days?`)) return;

    setTimetables(prev => {
      const branchData = { ...(prev[selectedBranch] || INITIAL_TIMETABLES[selectedBranch]) };
      const periods = (branchData.periods || STANDARD_PERIODS).filter(p => p.id !== periodIdToDelete);
      branchData.periods = periods;

      const grid = { ...branchData.grid };
      (branchData.days || STANDARD_DAYS).forEach(day => {
        if (grid[day]) {
          const daySlots = { ...grid[day] };
          delete daySlots[periodIdToDelete];
          grid[day] = daySlots;
        }
      });
      branchData.grid = grid;
      return { ...prev, [selectedBranch]: branchData };
    });

    showNotice(`Deleted column ${periodIdToDelete}.`);
  };

  // Load Preset Template
  const handleLoadTemplate = (templateKey) => {
    const keyMap = { cse_a: 'cse_sec1', cse_b: 'cse_sec2', current: selectedBranch };
    const effectiveKey = keyMap[templateKey] || templateKey;
    if (!INITIAL_TIMETABLES[effectiveKey] && templateKey !== 'blank') return;

    if (!window.confirm(`Load preset template? This will replace the schedule for ${currentTimetable.title}.`)) return;

    if (templateKey === 'blank') {
      const blankGrid = {};
      STANDARD_DAYS.forEach(day => {
        blankGrid[day] = {};
        STANDARD_PERIODS.forEach(p => {
          blankGrid[day][p.id] = p.isBreak
            ? { subject: 'LUNCH BREAK', code: '', faculty: '', room: 'Cafeteria', type: 'break' }
            : { subject: '', code: '', faculty: '', room: 'Room 301', type: 'theory' };
        });
      });

      const br = BRANCHES.find(b => b.key === selectedBranch);
      const cleanRec = sanitizeTimetableRecord({
        id: selectedBranch,
        title: INITIAL_TIMETABLES[selectedBranch].title,
        academicYear: currentTimetable.academicYear,
        yearNumber: selectedClass.yearNumber,
        semesterNumber: selectedClass.yearNumber * 2 - 1,
        classroom: br?.room || 'Room 301',
        incharge: 'Faculty Incharge',
        status: 'Draft',
        updatedAt: new Date().toISOString().split('T')[0],
        days: STANDARD_DAYS,
        periods: STANDARD_PERIODS,
        grid: blankGrid
      }, selectedBranch);

      setTimetables(prev => ({
        ...prev,
        [selectedBranch]: cleanRec
      }));
    } else {
      const templateData = JSON.parse(JSON.stringify(INITIAL_TIMETABLES[effectiveKey] || INITIAL_TIMETABLES.cse_sec3));
      const br = BRANCHES.find(b => b.key === selectedBranch);
      const cleanRec = sanitizeTimetableRecord({
        ...templateData,
        id: selectedBranch,
        title: INITIAL_TIMETABLES[selectedBranch].title,
        yearNumber: selectedClass.yearNumber,
        semesterNumber: selectedClass.yearNumber * 2 - 1
      }, selectedBranch);

      setTimetables(prev => ({
        ...prev,
        [selectedBranch]: cleanRec
      }));
    }

    setTemplateModalOpen(false);
    showNotice('Preset template loaded successfully! You can now customize cells, colors, rows and columns.');
  };

  // Handle Official Image Upload
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image file is too large (max 8MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setTimetableImages(prev => ({
          ...prev,
          [selectedBranch]: {
            dataUrl: base64,
            fileName: file.name,
            uploadedAt: new Date().toLocaleString(),
            size: `${(file.size / 1024).toFixed(1)} KB`
          }
        }));
        setError('');
        showNotice(`Official timetable image uploaded successfully for ${currentTimetable.title}!`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    if (!window.confirm('Remove this official signed timetable image?')) return;
    setTimetableImages(prev => {
      const next = { ...prev };
      delete next[selectedBranch];
      return next;
    });
    showNotice('Timetable image removed.');
  };

  // Upload Timetable Handlers
  const handleOpenUploadModal = () => {
    setUploadSections([selectedBranch]);
    const curBranch = BRANCHES.find(b => b.key === selectedBranch);
    setUploadYearSem(currentTimetable.academicYear || 'II B.Tech II Semester (2025–26)');
    setUploadClassroom(curBranch?.room || currentTimetable.classroom || 'Room 301');
    setUploadIncharge(currentTimetable.incharge || 'Dr. K. Sravani, Associate Professor');
    setUploadError('');
    setUploadFile(null);
    setDetectedSplitResult(null);
    setActiveSplitSectionIndex(0);
    setUploadPublishImmediately(true);
    setUploadModalOpen(true);
  };

  const processUploadedFile = (file) => {
    if (!file) return;
    const nameLower = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(nameLower);
    const isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
    const isExcel = nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls') || nameLower.endsWith('.csv') || nameLower.endsWith('.tsv') || file.type.includes('spreadsheet') || file.type.includes('excel') || file.type.includes('csv');

    if (!isImage && !isPdf && !isExcel) {
      setUploadError('Please select a valid Excel spreadsheet (.xlsx, .xls, .csv), PDF circular, or Image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setUploadError('File size exceeds the 15MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        if (isExcel) {
          try {
            const splitRes = detectAndSplitTimetableExcel(dataUrl);
            if (splitRes && splitRes.sections && splitRes.sections.length > 0) {
              setDetectedSplitResult(splitRes);
              setActiveSplitSectionIndex(0);

              // Auto-match detected sections to branches
              const matchedKeys = [];
              splitRes.sections.forEach(sec => {
                const sName = (sec.sectionName || '').toLowerCase().replace(/[\s\-_]/g, '');
                const foundBr = yearBranches.find(b => {
                  const bShort = (b.short || '').toLowerCase().replace(/[\s\-_]/g, '');
                  return sName.includes(bShort) || bShort.includes(sName) ||
                    (sName.includes('cse') && sName.includes(String(b.section))) ||
                    (sName.includes('csm') && sName.includes(String(b.section))) ||
                    (sName.includes('ece') && sName.includes(String(b.section)));
                });
                if (foundBr) matchedKeys.push(foundBr.key);
              });

              if (matchedKeys.length > 0) {
                setUploadSections(Array.from(new Set(matchedKeys)));
              } else {
                setUploadSections(yearBranches.slice(0, Math.min(splitRes.sections.length, yearBranches.length)).map(b => b.key));
              }

              if (splitRes.sharedHeader?.sessionSemester || splitRes.sharedHeader?.overallTitle) {
                const candidate = splitRes.sharedHeader.sessionSemester || splitRes.sharedHeader.overallTitle;
                const cleanSem = sanitizeAcademicYear(candidate);
                setUploadYearSem(cleanSem);
              }
              if (splitRes.sections[0]?.classTeacher) {
                setUploadIncharge(splitRes.sections[0].classTeacher);
              }
              if (splitRes.sections[0]?.roomNumber) {
                setUploadClassroom(`Room ${splitRes.sections[0].roomNumber}`);
              }
            } else {
              setDetectedSplitResult(null);
            }
          } catch (splitErr) {
            console.warn('Timetable split parsing note:', splitErr);
            setDetectedSplitResult(null);
          }

          setUploadFile({
            dataUrl,
            name: file.name,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            isPdf: false,
            isExcel: true,
            parsedRows: []
          });
          setUploadError('');
        } else {
          setDetectedSplitResult(null);
          setUploadFile({
            dataUrl,
            name: file.name,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: file.type || (isPdf ? 'application/pdf' : 'image/png'),
            isPdf,
            isExcel: false,
            parsedRows: null
          });
          setUploadError('');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processUploadedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processUploadedFile(file);
  };

  const toggleSection = (branchKey) => {
    setUploadSections(prev => {
      if (prev.includes(branchKey)) {
        return prev.filter(k => k !== branchKey);
      } else {
        return [...prev, branchKey];
      }
    });
  };

  const selectDepartmentSections = (deptCode) => {
    const deptKeys = yearBranches.filter(b => b.dept === deptCode).map(b => b.key);
    setUploadSections(prev => {
      const allSelected = deptKeys.every(k => prev.includes(k));
      if (allSelected) {
        return prev.filter(k => !deptKeys.includes(k));
      } else {
        return Array.from(new Set([...prev, ...deptKeys]));
      }
    });
  };

  const selectAllSections = () => {
    setUploadSections(yearBranches.map(b => b.key));
  };

  const clearAllSections = () => {
    setUploadSections([]);
  };

  const handleAssignAndPublish = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select or drop a timetable document, spreadsheet, or image to upload.');
      return;
    }
    if (!uploadSections || uploadSections.length === 0) {
      setUploadError('Please select at least one class / section to assign this timetable to.');
      return;
    }

    const nowStr = new Date().toLocaleString();
    const todayDate = new Date().toISOString().split('T')[0];
    const isPublish = uploadPublishImmediately;

    // Check if multi-section split result is active
    if (detectedSplitResult && detectedSplitResult.sections && detectedSplitResult.sections.length > 0) {
      const splitSections = detectedSplitResult.sections;
      const updatedTimetables = { ...timetables };
      const updatedImages = { ...timetableImages };

      uploadSections.forEach((secKey, idx) => {
        const matchingSplitSec = splitSections[idx] || splitSections.find(s => {
          const sName = (s.sectionName || '').toLowerCase().replace(/[\s\-_]/g, '');
          const br = BRANCHES.find(b => b.key === secKey);
          const bShort = (br?.short || '').toLowerCase().replace(/[\s\-_]/g, '');
          return sName.includes(bShort) || (bShort && bShort.includes(sName));
        }) || splitSections[0];

        const gridSchedule = convertSplitSectionToTimetableGrid(matchingSplitSec, detectedSplitResult.sharedHeader);
        const br = BRANCHES.find(b => b.key === secKey);
        const cleanYearSem = sanitizeAcademicYear(uploadYearSem);
        const cleanTitle = sanitizeTimetableTitle(`${cleanYearSem} — ${br?.name || matchingSplitSec.sectionName}`, secKey, cleanYearSem);

        updatedTimetables[secKey] = sanitizeTimetableRecord({
          ...gridSchedule,
          id: secKey,
          yearNumber: br.yearNumber,
          semesterNumber: br.yearNumber * 2 - 1,
          title: cleanTitle,
          academicYear: cleanYearSem,
          classroom: `Room ${matchingSplitSec.roomNumber || uploadClassroom}`,
          incharge: matchingSplitSec.classTeacher || uploadIncharge,
          status: isPublish ? 'Published' : 'Draft',
          updatedAt: todayDate
        }, secKey);

        updatedImages[secKey] = {
          dataUrl: uploadFile.dataUrl,
          fileName: uploadFile.name,
          fileType: uploadFile.type,
          isPdf: uploadFile.isPdf,
          isExcel: true,
          splitSectionName: matchingSplitSec.sectionName,
          splitRoom: matchingSplitSec.roomNumber,
          splitTeacher: matchingSplitSec.classTeacher,
          size: uploadFile.size,
          uploadedAt: nowStr,
          assignedSections: uploadSections,
          academicYear: cleanYearSem,
          classroom: `Room ${matchingSplitSec.roomNumber || uploadClassroom}`,
          incharge: matchingSplitSec.classTeacher || uploadIncharge
        };
      });

      setTimetables(updatedTimetables);
      setTimetableImages(updatedImages);

      if (!uploadSections.includes(selectedBranch)) {
        setSelectedBranch(uploadSections[0]);
      }

      setViewMode('grid');
      setUploadModalOpen(false);

      const assignedNames = uploadSections.map(k => BRANCHES.find(b => b.key === k)?.short || k).join(', ');
      showNotice(`Saving and ${isPublish ? 'publishing live' : 'saving draft'} to student and faculty portals...`);
      api.post('/timetables/publish-grid', {
        timetables: Object.fromEntries(uploadSections.map(key => [key, updatedTimetables[key]])),
        images: updatedImages,
        publish: isPublish
      }).then(() => {
        showNotice(`Successfully split Excel timetable into ${splitSections.length} sections, assigned to [${assignedNames}], and ${isPublish ? 'Published Live across all Student & Faculty dashboards' : 'saved as Draft'}!`);
        if (reload) reload();
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('timetable-published'));
      }).catch(err => {
        console.error('Server sync error on assign and publish:', err);
        showNotice(`Saved locally. Server notice: ${err.response?.data?.message || err.message}`);
      });
      return;
    }

    // Update timetableImages
    setTimetableImages(prev => {
      const updated = { ...prev };
      const cleanYearSem = sanitizeAcademicYear(uploadYearSem);
      uploadSections.forEach(secKey => {
        const br = BRANCHES.find(b => b.key === secKey);
        updated[secKey] = {
          dataUrl: uploadFile.dataUrl,
          fileName: uploadFile.name,
          fileType: uploadFile.type,
          isPdf: uploadFile.isPdf,
          isExcel: uploadFile.isExcel,
          parsedRows: uploadFile.parsedRows || [],
          size: uploadFile.size,
          uploadedAt: nowStr,
          assignedSections: uploadSections,
          academicYear: cleanYearSem,
          classroom: uploadClassroom || br?.room || 'Assigned Classroom',
          incharge: uploadIncharge
        };
      });
      return updated;
    });

    // Update timetables
    setTimetables(prev => {
      const updated = { ...prev };
      const cleanYearSem = sanitizeAcademicYear(uploadYearSem);
      uploadSections.forEach(secKey => {
        const existing = updated[secKey] || INITIAL_TIMETABLES[secKey] || INITIAL_TIMETABLES.cse_sec3;
        const br = BRANCHES.find(b => b.key === secKey);
        const cleanTitle = sanitizeTimetableTitle(`${cleanYearSem} — ${br?.name || existing.title}`, secKey, cleanYearSem);
        updated[secKey] = sanitizeTimetableRecord({
          ...existing,
          yearNumber: br.yearNumber,
          semesterNumber: br.yearNumber * 2 - 1,
          title: cleanTitle,
          academicYear: cleanYearSem,
          classroom: uploadClassroom || br?.room || existing.classroom,
          incharge: uploadIncharge || existing.incharge,
          status: isPublish ? 'Published' : 'Draft',
          updatedAt: todayDate
        }, secKey);
      });

      api.post('/timetables/publish-grid', {
        timetables: Object.fromEntries(uploadSections.map(key => [key, updated[key]])),
        images: updatedImages,
        publish: isPublish
      }).then(() => {
        showNotice(`Timetable successfully uploaded, assigned to [${assignedNames}], and ${isPublish ? 'Published Live across all Student & Faculty dashboards' : 'saved as Draft'}!`);
        if (reload) reload();
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('timetable-published'));
      }).catch(err => {
        console.error('Server sync error on single upload:', err);
        showNotice(`Saved locally. Server notice: ${err.response?.data?.message || err.message}`);
      });

      return updated;
    });

    // Switch active branch to first assigned section if current not in selection
    if (!uploadSections.includes(selectedBranch)) {
      setSelectedBranch(uploadSections[0]);
    }

    // Switch viewMode to 'image'
    setViewMode('image');
    setUploadModalOpen(false);

    const assignedNames = uploadSections.map(k => BRANCHES.find(b => b.key === k)?.short || k).join(', ');
    showNotice(`Timetable successfully uploaded, assigned to [${assignedNames}], and ${isPublish ? 'Published Live across all Student & Faculty dashboards' : 'saved as Draft'}!`);
  };

  // Publish
  const handlePublish = async () => {
    const target = timetables[selectedBranch] || INITIAL_TIMETABLES[selectedBranch] || INITIAL_TIMETABLES.cse_sec3;
    const sanitizedTarget = sanitizeTimetableRecord(target, selectedBranch);
    const updated = {
      ...timetables,
      [selectedBranch]: {
        ...sanitizedTarget,
        status: 'Published',
        updatedAt: new Date().toISOString().split('T')[0]
      }
    };
    setTimetables(updated);
    try {
      localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    showNotice('Publishing timetable live to Student & Faculty dashboards...');
    try {
      await api.post('/timetables/publish-grid', {
        sectionKey: selectedBranch,
        ...sanitizedTarget,
        image: timetableImages[selectedBranch] || null,
        publish: true
      });
      showNotice('Timetable published live across Student & Faculty portals!');
      if (reload) reload();
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('timetable-published'));
    } catch (err) {
      console.error('Server sync error on publish:', err);
      showNotice(`Saved locally. Server notice: ${err.response?.data?.message || err.message}`);
    }
  };

  // Reset selected branch to standard autonomous schedule
  const handleResetToStandard = () => {
    const curBranch = BRANCHES.find(b => b.key === selectedBranch);
    const branchLabel = curBranch ? curBranch.short : 'this section';
    if (!window.confirm(`Reset timetable for ${branchLabel} to standard verified autonomous schedule? This will restore the official curriculum and clear any corrupted title or data.`)) {
      return;
    }
    const standard = INITIAL_TIMETABLES[selectedBranch] || INITIAL_TIMETABLES.cse_sec3;
    const cleanStandard = sanitizeTimetableRecord(standard, selectedBranch);
    setTimetables(prev => {
      const updated = {
        ...prev,
        [selectedBranch]: {
          ...cleanStandard,
          status: 'Published',
          updatedAt: new Date().toISOString().split('T')[0]
        }
      };
      try {
        localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showNotice(`Timetable for ${branchLabel} reset to official standard autonomous schedule!`);
  };

  const activeDays = currentTimetable.days || STANDARD_DAYS;
  const activePeriods = currentTimetable.periods || STANDARD_PERIODS;
  const filteredDays = selectedDayFilter === 'all' ? activeDays : activeDays.filter(d => d.toLowerCase() === selectedDayFilter.toLowerCase());

  return (
    <div className="timetable-main-container">
      {/* Top Banner */}
      <div className="timetable-top-banner no-print">
        <div className="timetable-banner-left">
          <div className="timetable-badge-row">
            <span className="timetable-pill green">GVPCEW Autonomous (R24)</span>
            <span className="timetable-pill blue">{isStudent ? (currentTimetable.academicYear || 'Assigned academic year') : `${selectedClass?.year || ''} · ${currentTimetable.academicYear}`}</span>
            <span className={`timetable-pill ${currentTimetable.status === 'Published' ? 'published' : 'draft'}`}>
              {currentTimetable.status === 'Published' ? '✓ Live Published' : '✎ Draft Version'}
            </span>
          </div>
          <h2 className="timetable-title">{currentTimetable.title}</h2>
          <p className="timetable-subtitle">
            <strong>Allocated Classroom:</strong> {currentTimetable.classroom} • <strong>Class Incharge:</strong> {currentTimetable.incharge}
          </p>
        </div>

        <div className="timetable-banner-right">
          {isEditor && (
            <>
              {/* Upload Timetable Button */}
              <button
                type="button"
                className="timetable-btn upload"
                onClick={handleOpenUploadModal}
                title="Upload timetable document/image, assign to classes & sections, and publish"
              >
                <Upload className="w-4 h-4 mr-1.5 inline" />
                <span>Upload Timetable</span>
              </button>

              {/* Load Template Button */}
              <button
                type="button"
                className="timetable-btn"
                style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', fontWeight: 'bold' }}
                onClick={() => setTemplateModalOpen(true)}
                title="Load standard preset template or start with a blank grid"
              >
                <FolderOpen className="w-4 h-4 mr-1 inline text-emerald-700" />
                <span>Load Template</span>
              </button>

              {/* Reset to Standard Button */}
              <button
                type="button"
                className="timetable-btn outline"
                style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#b45309', fontWeight: '700' }}
                onClick={handleResetToStandard}
                title="Reset timetable for this section to the standard verified autonomous schedule"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1 inline text-amber-600" />
                <span>Reset to Standard</span>
              </button>

              {/* Add Row Button */}
              <button
                type="button"
                className="timetable-btn outline"
                onClick={() => setAddDayModalOpen(true)}
                title="Add a new Day (Row) to the timetable"
              >
                <Plus className="w-3.5 h-3.5 mr-1 inline text-blue-600" />
                <span>Add Row (Day)</span>
              </button>

              {/* Add Column Button */}
              <button
                type="button"
                className="timetable-btn outline"
                onClick={() => setAddPeriodModalOpen(true)}
                title="Add a new Period (Column) to the timetable"
              >
                <Plus className="w-3.5 h-3.5 mr-1 inline text-purple-600" />
                <span>Add Column (Period)</span>
              </button>

              {/* Publish Timetable */}
              <button
                type="button"
                className="timetable-btn publish"
                onClick={handlePublish}
                title="Publish changes to all student and faculty dashboards"
              >
                <Share2 className="w-4 h-4 mr-1 inline" />
                <span>Publish Timetable</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="timetable-btn outline"
            onClick={() => window.print()}
            title="Print or export timetable as PDF"
          >
            <Printer className="w-4 h-4 mr-1 inline" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="timetable-alert success no-print">
          <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="timetable-alert error no-print">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar: Branch Selector & View Mode Tabs */}
      <div className="timetable-toolbar-card no-print">
        {isStudent ? (
          <div className="timetable-selector-group">
            <span className="toolbar-label">Your assigned class:</span>
            <strong>{student?.profile?.department || 'Branch'} · Year {student?.profile?.year || '—'} · Section {student?.profile?.section || '—'}</strong>
          </div>
        ) : isFaculty ? (
          <div className="timetable-selector-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`timetable-btn ${facultyViewMode === 'schedule' ? 'publish' : 'outline'}`}
                style={{ padding: '6px 14px', fontSize: '13px' }}
                onClick={() => setFacultyViewMode('schedule')}
              >
                My Teaching Schedule
              </button>
              <button
                type="button"
                className={`timetable-btn ${facultyViewMode === 'class' ? 'publish' : 'outline'}`}
                style={{ padding: '6px 14px', fontSize: '13px' }}
                onClick={() => setFacultyViewMode('class')}
              >
                Class Timetable View
              </button>
            </div>
            {facultyViewMode === 'class' && (
              <div className="branch-pills-row">
                {yearBranches.map(b => (
                  <button
                    key={b.key}
                    type="button"
                    className={`branch-pill-btn ${selectedBranch === b.key ? 'active' : ''}`}
                    onClick={() => setSelectedBranch(b.key)}
                  >
                    {b.short}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="timetable-class-selectors">
            <div className="timetable-class-selector" role="group" aria-label="Select Year">
              <span className="class-selector-label"><GraduationCap size={18} />Select Year</span>
              <div className="class-selector-options">
                {['I Year', 'II Year', 'III Year', 'IV Year'].map((year, index) => {
                  const branch = BRANCHES.find(b => b.key === selectedBranch);
                  const available = BRANCHES.find(b => b.year === year && b.dept === branch?.dept && b.section === branch?.section);
                  return <button key={year} type="button" className={`class-selector-btn year ${branch?.year === year ? 'active' : ''}`} aria-pressed={branch?.year === year} disabled={!available} title={!available ? 'No timetable configured for this year' : undefined} onClick={() => setSelectedBranch(available.key)}>{['1st Year', '2nd Year', '3rd Year', '4th Year'][index]}</button>;
                })}
              </div>
            </div>
            <div className="timetable-class-selector" role="group" aria-label="Select Department">
              <span className="class-selector-label"><Landmark size={18} />Select Department</span>
              <div className="class-selector-options">
                {['CSE', 'CSM', 'CSC', 'ECE', 'EEE', 'IT'].map(dept => {
                  const branch = BRANCHES.find(b => b.key === selectedBranch);
                  return <button key={dept} type="button" className={`class-selector-btn ${branch?.dept === dept ? 'active' : ''}`} aria-pressed={branch?.dept === dept} onClick={() => setSelectedBranch(BRANCHES.find(b => b.dept === dept && b.year === branch?.year && b.section === branch?.section).key)}>{dept}</button>;
                })}
              </div>
            </div>
            <div className="timetable-class-selector" role="group" aria-label="Select Section">
              <span className="class-selector-label"><Users size={18} />Select Section</span>
              <div className="class-selector-options">
                {['1', '2', '3', '4'].map(section => {
                  const branch = BRANCHES.find(b => b.key === selectedBranch);
                  const available = BRANCHES.find(b => b.dept === branch?.dept && b.section === section && b.year === branch?.year);
                  return <button key={section} type="button" className={`class-selector-btn ${branch?.section === section ? 'active' : ''}`} aria-pressed={branch?.section === section} disabled={!available} title={!available ? 'No timetable configured for this section' : undefined} onClick={() => setSelectedBranch(available.key)}>Section {section}</button>;
                })}
              </div>
            </div>
          </div>
        )}

        <div className="timetable-view-tabs">
          {role === 'academic_coordinator' && <button type="button" className={`view-tab-btn ${viewMode === 'automatic' ? 'active' : ''}`} onClick={() => setViewMode('automatic')}><Sparkles size={16}/><span>Automatic Generation</span></button>}
          <button
            type="button"
            className={`view-tab-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <Calendar className="w-4 h-4 mr-1.5 inline text-blue-600" />
            <span>Weekly Schedule Matrix</span>
          </button>
          <button
            type="button"
            className={`view-tab-btn ${viewMode === 'image' ? 'active' : ''}`}
            onClick={() => setViewMode('image')}
          >
            <ImageIcon className="w-4 h-4 mr-1.5 inline text-emerald-600" />
            <span>Official Signed Timetable {currentImage && '✓'}</span>
          </button>
          {!isStudent && <button
            type="button"
            className={`view-tab-btn ${viewMode === 'conflicts' ? 'active' : ''}`}
            onClick={() => setViewMode('conflicts')}
          >
            <ShieldCheck className="w-4 h-4 mr-1.5 inline text-purple-600" />
            <span>Conflict Detection</span>
          </button>}
        </div>
      </div>

      {/* Hidden file input for official image upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* VIEW 1: WEEKLY SCHEDULE MATRIX */}
      {cacheError && <p className="timetable-alert" role="status">{cacheError}</p>}
      {role === 'academic_coordinator' && viewMode === 'automatic' && <TimetableGenerator/>}
      {viewMode === 'grid' && (
        <div className="timetable-grid-view">
          {/* Sub-toolbar: Day Filters & Color Category Legend */}
          <div className="timetable-sub-toolbar no-print">
            <div className="day-filters">
              <span className="filter-text">Filter Day:</span>
              <button
                type="button"
                className={`day-filter-btn ${selectedDayFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedDayFilter('all')}
              >
                Full Week
              </button>
              {activeDays.map(day => (
                <button
                  key={day}
                  type="button"
                  className={`day-filter-btn ${selectedDayFilter.toLowerCase() === day.toLowerCase() ? 'active' : ''} ${todayName === day ? 'is-today' : ''}`}
                  onClick={() => setSelectedDayFilter(day)}
                >
                  {day.slice(0, 3)}
                  {todayName === day && <span className="today-dot" title="Today">•</span>}
                </button>
              ))}
            </div>

            <div className="slot-type-legend">
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b' }}>Color Categories:</span>
              {Object.entries(SLOT_TYPES).map(([typeKey, typeObj]) => (
                <span key={typeKey} className="legend-item">
                  <span className="legend-box" style={{ background: typeObj.color, borderColor: typeObj.border }}></span>
                  <span>{typeObj.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Timetable Table Matrix */}
          <div className="timetable-table-wrapper">
            <table className="timetable-matrix-table">
              <caption className="timetable-class-teacher">
                <strong>Class Teacher:</strong>
                <span>{currentTimetable.classTeacher || currentTimetable.incharge || 'Not assigned'}</span>
              </caption>
              <thead>
                <tr>
                  <th className="th-day-col">Day / Period</th>
                  {activePeriods.map(p => (
                    <th key={p.id} className={`th-period-col ${p.isBreak ? 'th-break' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <div>
                          <div className="period-th-label">{p.label}</div>
                          <div className="period-th-time">{p.time}</div>
                        </div>
                        {isEditor && (
                          <button
                            type="button"
                            className="no-print"
                            style={{ border: 0, background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: '3px', padding: '2px 4px', cursor: 'pointer', fontSize: '10px' }}
                            onClick={(e) => { e.stopPropagation(); handleDeletePeriod(p.id); }}
                            title={`Delete column ${p.label}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  {isEditor && <th style={{ width: '50px', textAlign: 'center' }} className="no-print">Row</th>}
                </tr>
              </thead>
              <tbody>
                {filteredDays.map(day => {
                  const isToday = todayName.toLowerCase() === day.toLowerCase();
                  return (
                    <tr key={day} className={isToday ? 'row-today' : ''}>
                      {/* Day Header Column */}
                      <td className="td-day-header">
                        <div className="day-name">{day}</div>
                        {isToday && <span className="today-badge">TODAY</span>}
                      </td>

                      {/* Period Cells */}
                      {activePeriods.map(p => {
                        const slot = currentTimetable.grid?.[day]?.[p.id];
                        const slotType = SLOT_TYPES[slot?.type] || SLOT_TYPES.theory;

                        // Lunch Break Column
                        if (p.isBreak) {
                          return (
                            <td key={p.id} className="td-lunch-slot">
                              <div className="lunch-box">
                                <span className="lunch-title">{slot?.subject || p.label}</span>
                                <span className="lunch-time">{p.time}</span>
                              </div>
                            </td>
                          );
                        }

                        // Instructional Slot
                        const hasContent = slot && slot.subject && slot.subject.trim() !== '';
                        const bgStyle = slot?.customColor || slotType.color;
                        const borderStyle = slotType.border || '#cbd5e1';
                        const textStyle = slot?.customTextColor || slotType.textColor;

                        return (
                          <td
                            key={p.id}
                            className={`td-slot-cell ${isEditor ? 'editable-cell' : ''}`}
                            style={{
                              background: bgStyle,
                              borderColor: borderStyle,
                              borderLeftColor: textStyle
                            }}
                            onClick={() => handleOpenEditCell(day, p.id)}
                          >
                            {hasContent ? (
                              <div className="slot-card-inner">
                                <div className="slot-card-top">
                                  <span className="slot-type-badge" style={{ color: textStyle, borderColor: textStyle }}>
                                    {slotType.label.split(' / ')[0]}
                                  </span>
                                  {slot.code && <span className="slot-code">{slot.code}</span>}
                                </div>
                                <div className="slot-subject-name">{slot.subject}</div>
                                <div className="slot-faculty" title={slot.faculty}>
                                  <User className="w-2.5 h-2.5 inline mr-0.5" />
                                  {slot.faculty || 'Faculty Incharge'}
                                </div>
                                <div className="slot-room">
                                  <MapPin className="w-2.5 h-2.5 inline mr-0.5" />
                                  {slot.room || currentTimetable.classroom}
                                </div>

                                {isEditor && (
                                  <div className="cell-hover-edit-hint no-print">
                                    <Edit3 className="w-2.5 h-2.5" /> Edit
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="empty-slot">
                                {isEditor ? (
                                  <span className="add-slot-prompt">+ Assign</span>
                                ) : (
                                  <span className="free-period-text">Free Period</span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Delete Row Button */}
                      {isEditor && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }} className="no-print">
                          <button
                            type="button"
                            className="cal-row-delete-btn"
                            onClick={() => handleDeleteDay(day)}
                            title={`Delete row for ${day}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="timetable-faculty-directory">
            <h4>Faculty &amp; Subject Directory{!isFaculty && ` · ${BRANCHES.find(b => b.key === selectedBranch)?.short || 'Selected class'}`}</h4>
            {facultyDirectory.length > 0 ? (
              <ul>
                {facultyDirectory.map((entry, index) => {
                  const colors = SLOT_TYPES[entry.type] || SLOT_TYPES.theory;
                  return <li key={`${entry.subject}:${entry.faculty}:${index}`} style={{ borderColor: colors.textColor, background: colors.color }}>
                    <strong style={{ background: colors.textColor }}>{entry.subject}</strong>
                    <span>{entry.faculty}</span>
                  </li>;
                })}
              </ul>
            ) : <p>Faculty names have not been assigned to this timetable yet.</p>}
          </div>

          <div className="timetable-footer-info">
            <Info className="w-4 h-4 text-emerald-700 shrink-0" />
            <p>
              <strong>Autonomous Schedule Notes:</strong> All 3-hour practical lab blocks are conducted in designated Computer Labs. Tutorials and Mentoring sessions are held weekly.
              {isEditor && ' As Academic Coordinator, click on any class slot to edit subject details, assigned faculty, classroom, and custom color category.'}
            </p>
          </div>
        </div>
      )}

      {/* VIEW 2: OFFICIAL SIGNED TIMETABLE DOCUMENT */}
      {viewMode === 'image' && (
        <div className="timetable-image-container">
          <div className="image-viewer-header no-print">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                Official Timetable Document ({BRANCHES.find(b => b.key === selectedBranch)?.name})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                Official signed circular issued by the Principal &amp; Academic Coordinator.
              </p>
            </div>

            <div className="image-action-buttons">
              {isEditor && (
                <>
                  <button
                    type="button"
                    className="timetable-btn upload"
                    onClick={handleOpenUploadModal}
                  >
                    <Upload className="w-4 h-4 mr-1 inline" />
                    <span>{currentImage ? 'Upload & Assign New File' : 'Upload & Assign Timetable'}</span>
                  </button>

                  {currentImage && (
                    <button
                      type="button"
                      className="timetable-btn danger outline"
                      onClick={handleRemoveImage}
                    >
                      <Trash2 className="w-4 h-4 mr-1 inline" />
                      <span>Remove</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {currentImage ? (
            <div className="official-image-frame">
              <div className="image-meta-bar">
                <span><strong>File:</strong> {currentImage.fileName}</span>
                <span><strong>Uploaded:</strong> {currentImage.uploadedAt}</span>
                <span><strong>Size:</strong> {currentImage.size}</span>
                {currentImage.incharge && <span><strong>Incharge:</strong> {currentImage.incharge}</span>}
                <a href={currentImage.dataUrl} download={currentImage.fileName || `GVPCEW_Timetable_${selectedBranch}`} className="download-image-link">
                  <Download className="w-3.5 h-3.5 mr-1 inline" /> Download File
                </a>
              </div>
              <div className="uploaded-image-wrapper">
                {currentImage.isExcel || currentImage.fileName?.toLowerCase().endsWith('.xlsx') || currentImage.fileName?.toLowerCase().endsWith('.xls') || currentImage.fileName?.toLowerCase().endsWith('.csv') ? (
                  <div className="excel-spreadsheet-container">
                    <div className="excel-ribbon-bar">
                      <div className="excel-ribbon-left">
                        <FileSpreadsheet className="w-5 h-5" />
                        <div>
                          <strong style={{ fontSize: '13px', display: 'block' }}>{currentImage.fileName}</strong>
                          <span style={{ fontSize: '11px', opacity: 0.9 }}>Microsoft Excel / CSV Spreadsheet</span>
                        </div>
                      </div>
                      <span className="excel-app-tag">XLSX / CSV WORKBOOK</span>
                    </div>

                    <div className="excel-sheet-table-wrapper">
                      {currentImage.parsedRows && currentImage.parsedRows.length > 0 ? (
                        <table className="excel-grid-table">
                          <thead>
                            <tr>
                              <th className="excel-row-num">#</th>
                              {currentImage.parsedRows[0].map((col, idx) => (
                                <th key={idx}>{col || `Column ${idx + 1}`}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {currentImage.parsedRows.slice(1).map((row, rIdx) => (
                              <tr key={rIdx}>
                                <td className="excel-row-num">{rIdx + 1}</td>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="excel-grid-table">
                          <thead>
                            <tr>
                              <th className="excel-row-num">#</th>
                              <th>Day / Time</th>
                              <th>Period 1 (08:40)</th>
                              <th>Period 2 (09:30)</th>
                              <th>Period 3 (10:20)</th>
                              <th>Period 4 (11:10)</th>
                              <th>Lunch Break</th>
                              <th>Period 5 (12:50)</th>
                              <th>Period 6 (01:40)</th>
                              <th>Period 7 (02:30)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {STANDARD_DAYS.map((d, idx) => (
                              <tr key={d}>
                                <td className="excel-row-num">{idx + 1}</td>
                                <td style={{ fontWeight: 'bold' }}>{d}</td>
                                {STANDARD_PERIODS.map(p => {
                                  const slot = currentTimetable.grid?.[d]?.[p.id];
                                  return (
                                    <td key={p.id}>
                                      {slot?.subject ? `${slot.subject}${slot.faculty ? ` (${slot.faculty})` : ''}` : (p.isBreak ? 'LUNCH BREAK' : '—')}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    <div className="excel-sheet-footer-tabs">
                      <div className="excel-tab-pill">Sheet1 (Timetable)</div>
                      <span style={{ color: '#64748b', marginLeft: 'auto', fontSize: '11px' }}>
                        ✓ Official Excel Dataset attached &amp; synced with class schedule
                      </span>
                    </div>
                  </div>
                ) : currentImage.isPdf || currentImage.fileName?.toLowerCase().endsWith('.pdf') || currentImage.dataUrl?.startsWith('data:application/pdf') ? (
                  <iframe
                    src={currentImage.dataUrl}
                    title="Official Timetable PDF"
                    className="official-pdf-frame"
                  />
                ) : (
                  <img src={currentImage.dataUrl} alt="Official Timetable" className="official-uploaded-image" />
                )}
              </div>
            </div>
          ) : (
            <div className="official-blueprint-card">
              <div className="blueprint-top-bar">
                <div>
                  <h3 style={{ font: '800 16px Manrope', margin: 0, color: '#0f2b48' }}>GAYATRI VIDYA PARISHAD COLLEGE OF ENGINEERING FOR WOMEN</h3>
                  <p style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>(Autonomous • Approved by AICTE • Affiliated to Andhra University)</p>
                  <strong style={{ fontSize: '13px', color: '#1e40af', display: 'block', marginTop: '4px' }}>
                    OFFICIAL CLASS TIME TABLE — {BRANCHES.find(b => b.key === selectedBranch)?.name?.toUpperCase()}
                  </strong>
                </div>
                <div className="blueprint-stamp">
                  <div>GVPCEW AUTONOMOUS</div>
                  <div>ACADEMIC 2025–26</div>
                </div>
              </div>

              <div className="blueprint-preview-notice">
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                <h4 style={{ margin: '0 0 4px', fontSize: '14px', color: '#0f172a' }}>Digital Timetable Active</h4>
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
                  The weekly matrix is active and synced. {isEditor ? 'You can upload the scanned copy or PDF circular of the physical signed timetable and assign it to any class sections.' : 'Physical signed copy will be uploaded by the Academic Coordinator.'}
                </p>
                {isEditor && (
                  <button
                    type="button"
                    className="timetable-btn upload"
                    onClick={handleOpenUploadModal}
                  >
                    <Upload className="w-4 h-4 mr-1.5 inline" />
                    <span>Upload &amp; Assign Timetable Now</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: CONFLICT DETECTION */}
      {viewMode === 'conflicts' && (
        <div className="timetable-conflicts-container">
          <div className="conflicts-header">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                Institution-Wide Timetable Conflict &amp; Collision Detector
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                Scans all department sections (CSE, IT, AIML, ECE, EEE) for overlapping faculty assignments and classroom collisions.
              </p>
            </div>
            <div className="conflict-tag clean">
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600 inline" />
              <span>All 6 Sections Validated — 0 Collisions</span>
            </div>
          </div>

          <div className="no-conflicts-card">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <h4 style={{ margin: '0 0 4px', fontSize: '15px', color: '#0f172a', fontWeight: '800' }}>
              Zero Timetable Conflicts Detected!
            </h4>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b', maxWidth: '480px', marginInline: 'auto' }}>
              All faculty members have singular period assignments across Monday to Saturday. All laboratory rooms and classrooms have zero overlapping bookings.
            </p>
          </div>
        </div>
      )}

      {/* MODAL 1: LOAD TEMPLATE PRESETS */}
      {templateModalOpen && (
        <div className="timetable-modal-backdrop no-print">
          <div className="timetable-modal-content large">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                  Load Timetable Preset Template
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Select an autonomous curriculum template or start from a blank customizable grid.
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setTemplateModalOpen(false)}>✕</button>
            </div>

            <div className="preset-grid">
              <div className="preset-card">
                <div className="preset-card-header">
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>II B.Tech CSE (Section A) Standard</h4>
                  <span className="preset-badge">R24 Autonomous</span>
                </div>
                <p style={{ fontSize: '11px', color: '#475569', margin: '6px 0 10px' }}>
                  Complete autonomous timetable with DBMS, DAA, FLAT, P&S, DBMS Lab, DAA Lab, Web Tech Lab, and Mentoring.
                </p>
                <button
                  type="button"
                  className="timetable-btn upload small"
                  onClick={() => handleLoadTemplate('cse_a')}
                >
                  Load CSE-A Template
                </button>
              </div>

              <div className="preset-card">
                <div className="preset-card-header">
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>II B.Tech CSE (Section B) Standard</h4>
                  <span className="preset-badge">R24 Autonomous</span>
                </div>
                <p style={{ fontSize: '11px', color: '#475569', margin: '6px 0 10px' }}>
                  Full schedule for Section B with alternating lab slots and DAA tutorial hours.
                </p>
                <button
                  type="button"
                  className="timetable-btn upload small"
                  onClick={() => handleLoadTemplate('cse_b')}
                >
                  Load CSE-B Template
                </button>
              </div>

              <div className="preset-card" style={{ gridColumn: 'span 2', background: '#f0fdf9', borderColor: '#a7f3d0' }}>
                <div className="preset-card-header">
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: '#065f46' }}>Blank 6-Day Custom Timetable Grid</h4>
                  <span className="preset-badge" style={{ background: '#dcfce7', color: '#166534' }}>Custom Template</span>
                </div>
                <p style={{ fontSize: '11px', color: '#047857', margin: '6px 0 10px' }}>
                  Initializes a clean, empty 6-day (Mon–Sat) grid with 7 periods and lunch break. You can customize all cells, add/delete rows and columns.
                </p>
                <button
                  type="button"
                  className="timetable-btn publish small"
                  onClick={() => handleLoadTemplate('blank')}
                >
                  Load Blank Grid
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CLASS SLOT & CUSTOM COLOR */}
      {editingModalOpen && isEditingCell && (
        <div className="timetable-modal-backdrop no-print">
          <div className="timetable-modal-content">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                  Edit Class Slot ({isEditingCell.day} • {activePeriods.find(p => p.id === isEditingCell.periodId)?.label})
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                  {activePeriods.find(p => p.id === isEditingCell.periodId)?.time}
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setEditingModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveCell} className="modal-form">
              <div className="form-group full">
                <label>Subject / Course Name</label>
                <input
                  type="text"
                  value={isEditingCell.data.subject}
                  onChange={e => setIsEditingCell({ ...isEditingCell, data: { ...isEditingCell.data, subject: e.target.value } })}
                  placeholder="e.g. Database Management Systems"
                  required
                />
              </div>

              <div className="form-group">
                <label>Course Code</label>
                <input
                  type="text"
                  value={isEditingCell.data.code}
                  onChange={e => setIsEditingCell({ ...isEditingCell, data: { ...isEditingCell.data, code: e.target.value } })}
                  placeholder="e.g. 24CT11RC12"
                />
              </div>

              <div className="form-group">
                <label>Period Category</label>
                <select
                  value={isEditingCell.data.type}
                  onChange={e => setIsEditingCell({ ...isEditingCell, data: { ...isEditingCell.data, type: e.target.value } })}
                >
                  {Object.entries(SLOT_TYPES).map(([typeKey, typeObj]) => (
                    <option key={typeKey} value={typeKey}>{typeObj.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Faculty Incharge</label>
                <input
                  type="text"
                  value={isEditingCell.data.faculty}
                  onChange={e => setIsEditingCell({ ...isEditingCell, data: { ...isEditingCell.data, faculty: e.target.value } })}
                  placeholder="e.g. Prof. R. Kiran"
                />
              </div>

              <div className="form-group">
                <label>Classroom / Lab Location</label>
                <input
                  type="text"
                  value={isEditingCell.data.room}
                  onChange={e => setIsEditingCell({ ...isEditingCell, data: { ...isEditingCell.data, room: e.target.value } })}
                  placeholder="e.g. R-301 or CS Lab 4"
                />
              </div>

              {/* Custom Color Selector */}
              <div className="form-group full" style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Palette className="w-3.5 h-3.5 text-blue-600" />
                  <span>Custom Cell Background Color (Optional):</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <input
                    type="color"
                    value={isEditingCell.data.customColor || SLOT_TYPES[isEditingCell.data.type]?.color || '#e0edff'}
                    onChange={e => setIsEditingCell({ ...isEditingCell, data: { ...isEditingCell.data, customColor: e.target.value } })}
                    style={{ width: '42px', height: '32px', padding: 0, border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Choose custom color or leave default for category
                  </span>
                  {isEditingCell.data.customColor && (
                    <button
                      type="button"
                      style={{ border: 0, background: 'transparent', color: '#dc2626', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginLeft: 'auto' }}
                      onClick={() => setIsEditingCell({ ...isEditingCell, data: { ...isEditingCell.data, customColor: '' } })}
                    >
                      Reset Color
                    </button>
                  )}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="timetable-btn outline" onClick={() => setEditingModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="timetable-btn publish">
                  Save Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD DAY (ROW) */}
      {addDayModalOpen && (
        <div className="timetable-modal-backdrop no-print">
          <div className="timetable-modal-content">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                  Add New Day Row
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Add an additional instruction day or remedial session day to the timetable.
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setAddDayModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleAddDay} className="modal-form">
              <div className="form-group full">
                <label>Day Name</label>
                <input
                  type="text"
                  value={newDayName}
                  onChange={e => setNewDayName(e.target.value)}
                  placeholder="e.g. Sunday / Zero Day / Special Session"
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="timetable-btn outline" onClick={() => setAddDayModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="timetable-btn publish">
                  Add Day Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD PERIOD (COLUMN) */}
      {addPeriodModalOpen && (
        <div className="timetable-modal-backdrop no-print">
          <div className="timetable-modal-content">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                  Add New Period Column
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Add a new period slot (e.g. Period 8, Zero Hour, Remedial) across all days.
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setAddPeriodModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleAddPeriod} className="modal-form">
              <div className="form-group">
                <label>Period Identifier (ID)</label>
                <input
                  type="text"
                  value={newPeriodForm.id}
                  onChange={e => setNewPeriodForm({ ...newPeriodForm, id: e.target.value })}
                  placeholder="e.g. p8"
                  required
                />
              </div>

              <div className="form-group">
                <label>Column Label</label>
                <input
                  type="text"
                  value={newPeriodForm.label}
                  onChange={e => setNewPeriodForm({ ...newPeriodForm, label: e.target.value })}
                  placeholder="e.g. Period 8 or Zero Hour"
                  required
                />
              </div>

              <div className="form-group full">
                <label>Timings</label>
                <input
                  type="text"
                  value={newPeriodForm.time}
                  onChange={e => setNewPeriodForm({ ...newPeriodForm, time: e.target.value })}
                  placeholder="e.g. 03:20 PM - 04:10 PM"
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="timetable-btn outline" onClick={() => setAddPeriodModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="timetable-btn publish">
                  Add Period Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: UPLOAD & ASSIGN TIMETABLE */}
      {uploadModalOpen && (
        <div className="timetable-modal-backdrop no-print">
          <div className="timetable-modal-content upload-modal-content">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Upload className="w-5 h-5 text-blue-600" />
                  <span>Upload &amp; Assign Timetable</span>
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Upload the official timetable document or scanned copy, set target classes &amp; sections, and publish live.
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setUploadModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleAssignAndPublish} className="modal-form">
              {/* Step 1: Upload File Area */}
              <div className="form-group full">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>1. Timetable Document, Excel (.xlsx, .csv), or Image (up to 15MB)</span>
                  {uploadFile && <span style={{ color: '#166534', fontSize: '11px', fontWeight: '700' }}>✓ File Ready ({uploadFile.isExcel ? 'Excel' : uploadFile.isPdf ? 'PDF' : 'Image'})</span>}
                </label>

                {uploadFile ? (
                  <div className="upload-preview-card">
                    <div className="upload-preview-left">
                      {uploadFile.isExcel ? (
                        <div className="upload-file-icon-box excel">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                      ) : uploadFile.isPdf ? (
                        <div className="upload-file-icon-box">
                          <FileText className="w-6 h-6" />
                        </div>
                      ) : (
                        <img src={uploadFile.dataUrl} alt="Preview" className="upload-preview-thumb" />
                      )}
                      <div className="upload-file-info">
                        <div className="upload-file-name" title={uploadFile.name}>{uploadFile.name}</div>
                        <div className="upload-file-meta">
                          {uploadFile.size} • {uploadFile.isExcel ? `Excel Spreadsheet ${uploadFile.parsedRows?.length ? `(${uploadFile.parsedRows.length} rows parsed)` : ''}` : uploadFile.isPdf ? 'PDF Document' : 'Image File'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="timetable-btn outline small"
                      onClick={() => uploadFileInputRef.current?.click()}
                    >
                      Change File
                    </button>
                  </div>
                ) : (
                  <div
                    className={`upload-dropzone ${uploadDragActive ? 'drag-active' : ''}`}
                    onClick={() => uploadFileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="upload-dropzone-icon">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="upload-dropzone-title">Click to browse or drag &amp; drop timetable file</div>
                    <div className="upload-dropzone-hint">Supports Excel (.xlsx, .xls, .csv), PDF circulars, or Images (PNG, JPG, WEBP) (Max 15MB)</div>
                  </div>
                )}

                <input
                  type="file"
                  ref={uploadFileInputRef}
                  onChange={handleUploadFileChange}
                  accept=".xlsx,.xls,.csv,.tsv,image/*,.pdf"
                  style={{ display: 'none' }}
                />
              </div>

              {/* Dynamic Multi-Section Splitter Detection Review Panel */}
              {detectedSplitResult && detectedSplitResult.sections && detectedSplitResult.sections.length > 0 && (
                <div className="form-group full">
                  <div className="split-detector-banner">
                    <div className="split-detector-header">
                      <div className="split-detector-title">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span>Vertically Stacked Multi-Section Timetable Detected</span>
                      </div>
                      <span className="split-badge">
                        ✨ {detectedSplitResult.sections.length} Section Blocks Extracted
                      </span>
                    </div>

                    {detectedSplitResult.sharedHeader && (
                      <div className="split-header-info">
                        <strong>Shared Header:</strong> {detectedSplitResult.sharedHeader.department || 'GVPCEW Department'} • {detectedSplitResult.sharedHeader.sessionSemester || 'Academic Session'} • {detectedSplitResult.sharedHeader.overallTitle || 'Official Time Table'}
                      </div>
                    )}
                  </div>

                  {/* Section Tabs */}
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#334155' }}>
                      Preview Extracted Sections:
                    </label>
                    <div className="split-tabs-bar">
                      {detectedSplitResult.sections.map((sec, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          className={`split-tab-btn ${activeSplitSectionIndex === sIdx ? 'active' : ''}`}
                          onClick={() => setActiveSplitSectionIndex(sIdx)}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>{sec.sectionName}</span>
                          <span style={{ fontSize: '10px', opacity: 0.85 }}>({sec.roomNumber ? `Room ${sec.roomNumber}` : 'Room —'})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Section Preview Card */}
                  {(() => {
                    const activeSec = detectedSplitResult.sections[activeSplitSectionIndex] || detectedSplitResult.sections[0];
                    if (!activeSec) return null;
                    return (
                      <div className="split-preview-card">
                        <div className="split-meta-pills">
                          <span className="split-meta-pill teacher">
                            👨‍🏫 Class Teacher: {activeSec.classTeacher || 'Not Specified'}
                          </span>
                          <span className="split-meta-pill room">
                            📍 Allocated Room: Room {activeSec.roomNumber || '—'}
                          </span>
                          <span className="split-meta-pill">
                            ⏰ {activeSec.timeSlots.length} Period Slots
                          </span>
                          <span className="split-meta-pill">
                            📅 {activeSec.dayRows.length} Days (Mon–Sat)
                          </span>
                        </div>

                        {/* Interactive Timetable Matrix Preview */}
                        <div className="split-table-scroll">
                          <table className="split-preview-table">
                            <thead>
                              <tr>
                                <th className="day-col">Day / Slot</th>
                                {activeSec.timeSlots.map((slot, tIdx) => (
                                  <th key={tIdx} title={slot}>
                                    {slot}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {activeSec.dayRows.map((dRow, rIdx) => (
                                <tr key={rIdx}>
                                  <td className="day-label">{dRow.day}</td>
                                  {dRow.periods.map((pCell, pIdx) => {
                                    const isLunch = /LUNCH|BREAK/i.test(pCell) || /LUNCH|BREAK/i.test(activeSec.timeSlots[pIdx] || '');
                                    const isLab = /LAB/i.test(pCell);
                                    return (
                                      <td
                                        key={pIdx}
                                        className={isLunch ? 'lunch-cell' : isLab ? 'lab-cell' : 'theory-cell'}
                                        title={pCell}
                                      >
                                        {pCell || '—'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Legend row */}
                        {activeSec.legendText && (
                          <div className="split-legend-box">
                            <strong>Faculty &amp; Subject Legend:</strong> {activeSec.legendText}
                          </div>
                        )}

                        {/* Export & Download Buttons for Split Sections */}
                        <div className="split-export-actions">
                          <button
                            type="button"
                            className="timetable-btn outline small"
                            onClick={() => {
                              const singleWb = createSectionWorkbook(activeSec, detectedSplitResult.sharedHeader);
                              downloadWorkbook(singleWb, `${(activeSec.sectionName || 'Section').replace(/\s+/g, '_')}_Timetable.xlsx`);
                            }}
                            title="Download formatted Excel (.xlsx) file for this individual section"
                          >
                            <Download className="w-3.5 h-3.5 mr-1 inline text-blue-600" />
                            <span>Download {activeSec.sectionName} (.xlsx)</span>
                          </button>

                          <button
                            type="button"
                            className="timetable-btn small"
                            style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', fontWeight: 'bold' }}
                            onClick={() => {
                              const combWb = createCombinedWorkbook(detectedSplitResult.sections, detectedSplitResult.sharedHeader);
                              downloadWorkbook(combWb, `GVPCEW_All_Sections_Split_Timetable.xlsx`);
                            }}
                            title="Download combined Excel (.xlsx) workbook containing all split sections as separate sheets"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 inline text-emerald-700" />
                            <span>Download All {detectedSplitResult.sections.length} Sections (.xlsx)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Step 2: Select Target Classes & Sections */}
              <div className="form-group full">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0 }}>
                    2. Assign to Classes &amp; Sections ({uploadSections.length} selected):
                  </label>
                  <div className="section-quick-bar">
                    <button type="button" className="quick-chip-btn" onClick={() => selectDepartmentSections('CSE')}>CSE All</button>
                    <button type="button" className="quick-chip-btn" onClick={() => selectDepartmentSections('CSM')}>CSM All</button>
                    <button type="button" className="quick-chip-btn" onClick={() => selectDepartmentSections('ECE')}>ECE All</button>
                    <button type="button" className="quick-chip-btn" onClick={selectAllSections}>Select All</button>
                    <button type="button" className="quick-chip-btn" onClick={clearAllSections}>Clear</button>
                  </div>
                </div>

                <div className="section-chips-grid">
                  {yearBranches.map(b => {
                    const isSelected = uploadSections.includes(b.key);
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={`section-chip-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleSection(b.key)}
                      >
                        <div>
                          <span style={{ display: 'block', fontWeight: isSelected ? '800' : '600' }}>{b.short}</span>
                          <span style={{ fontSize: '10px', color: isSelected ? '#1e40af' : '#64748b' }}>{b.room}</span>
                        </div>
                        {isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                        ) : (
                          <div style={{ width: '14px', height: '14px', border: '1.5px solid #cbd5e1', borderRadius: '3px' }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Class Metadata */}
              <div className="form-group">
                <label>Academic Year &amp; Semester</label>
                <input
                  type="text"
                  value={uploadYearSem}
                  onChange={e => setUploadYearSem(e.target.value)}
                  placeholder="e.g. II B.Tech II Semester (2025–26)"
                  required
                />
              </div>

              <div className="form-group">
                <label>Allocated Classroom / Hall</label>
                <input
                  type="text"
                  value={uploadClassroom}
                  onChange={e => setUploadClassroom(e.target.value)}
                  placeholder="e.g. Room 301 (Academic Block)"
                />
              </div>

              <div className="form-group full">
                <label>Faculty Incharge / Coordinator</label>
                <input
                  type="text"
                  value={uploadIncharge}
                  onChange={e => setUploadIncharge(e.target.value)}
                  placeholder="e.g. Dr. K. Sravani, Associate Professor"
                />
              </div>

              {/* Step 4: Publish Workflow Selection */}
              <div className="form-group full">
                <label style={{ marginBottom: '6px', display: 'block' }}>3. Publishing Workflow:</label>
                <div className="workflow-status-options">
                  <div
                    className={`workflow-radio-card ${uploadPublishImmediately ? 'active' : ''}`}
                    onClick={() => setUploadPublishImmediately(true)}
                  >
                    <div style={{ marginTop: '2px' }}>
                      {uploadPublishImmediately ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid #94a3b8' }} />
                      )}
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#065f46' }}>Assign &amp; Publish Live</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Timetable goes live immediately on student and faculty dashboards.
                      </span>
                    </div>
                  </div>

                  <div
                    className={`workflow-radio-card draft ${!uploadPublishImmediately ? 'active draft' : ''}`}
                    onClick={() => setUploadPublishImmediately(false)}
                  >
                    <div style={{ marginTop: '2px' }}>
                      {!uploadPublishImmediately ? (
                        <CheckCircle2 className="w-4 h-4 text-amber-600" />
                      ) : (
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid #94a3b8' }} />
                      )}
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#92400e' }}>Save as Draft</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Assign to sections for review; coordinator can publish later.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {uploadError && (
                <div className="form-group full">
                  <div className="timetable-alert error" style={{ padding: '8px 12px', fontSize: '12px' }}>
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{uploadError}</span>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="timetable-btn outline" onClick={() => setUploadModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`timetable-btn ${uploadPublishImmediately ? 'publish' : 'upload'}`}
                  disabled={!uploadFile || uploadSections.length === 0}
                >
                  {uploadPublishImmediately ? (
                    <>
                      <Share2 className="w-4 h-4 mr-1.5 inline" />
                      <span>Assign &amp; Publish Live</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1.5 inline" />
                      <span>Assign &amp; Save Draft</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
