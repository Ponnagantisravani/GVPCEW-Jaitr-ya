import { AcademicManagement as LiveAcademicManagement, AcademicReports as LiveAcademicReports, NotificationCenter, SectionAssignment, StudentAssignments, AttendanceSessionControl, StudentCheckIn } from './LiveWorkspaces.jsx';
import { ClassSectionManagement } from './ClassSectionManagement.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Bell, BookOpen, Calendar, GraduationCap, Home, IdCard, LayoutDashboard,
  LogOut, Menu, RefreshCw, UserRound, X, CheckCircle2, AlertTriangle,
  Clock, MapPin, Award, FileText, Upload, Plus, Trash2, Eye, ShieldCheck,
  TrendingUp, Users, Check, Printer, QrCode, ClipboardList, BookMarked, Search, ArrowRight, ChevronDown
} from 'lucide-react';
import { TimetableManagement } from './TimetableManagement.jsx';
import { AcademicCalendarManagement } from './AcademicCalendarManagement.jsx';
import { SyllabusManagement } from './SyllabusManagement.jsx';
import { ExamScheduleManagement } from './ExamScheduleManagement.jsx';
import { DigitalIdCard } from './DigitalIdCard.jsx';
import { StudentProfileView } from './StudentProfileView.jsx';
import { FacultyDashboard } from './FacultyDashboard.jsx';
import {AccessResponsibilities,CoordinatorWorkspace,MyFaculty} from './AccessWorkspaces.jsx';
import {sectionLabel} from './PublicationAudience.jsx';
import logoUrl from '../assets/gvpcew-official-logo.png';

import { api } from './api.js';
import {accountStorageKey} from './session.js';
import {settlePortalRequests} from './portal-data.js';

function getSidebarIcon(item) {
  if (!item) return BookOpen;
  if (item === 'Dashboard') return LayoutDashboard;
  if (item.includes('Calendar')) return Calendar;
  if (item === 'Syllabus') return BookOpen;
  if (item.includes('Exam') || item.includes('Schedule')) return ClipboardList;
  if (item.includes('Digital ID')) return IdCard;
  if (item.includes('Profile')) return UserRound;
  if (item.includes('Attendance') || item.includes('Check-in') || item.includes('Mark Attendance')) return CheckCircle2;
  if (item.includes('Timetable')) return Clock;
  if (item.includes('Subject')) return BookMarked;
  if (item.includes('Faculty') || item.includes('User') || item.includes('People') || item.includes('Student')) return Users;
  if (item.includes('Assignment')) return FileText;
  if (item.includes('Marks') || item.includes('Result') || item.includes('Performance')) return Award;
  if (item.includes('Leave')) return FileText;
  if (item.includes('Notice') || item.includes('Announcement')) return Bell;
  if (item.includes('Notification')) return Bell;
  return BookOpen;
}

const menus = {
  admin: ['User Management', 'Responsibilities & Access', 'Academic Management', 'Section Assignment', 'Timetable Monitoring', 'Attendance Monitoring', 'Syllabus', 'Academic Calendar', 'Exam Schedule', 'Notices & Announcements', 'Notifications'],
  faculty: [
    'My Profile', 'My Subjects', 'My Classes', 'My Timetable', 'Syllabus', 'Academic Calendar', 'Notifications',
    'Attendance',
    'Assignments',
    'Marks',
    'My Students',
    'Student Performance',
    'Attendance Corrections',
    'Leave & Substitution',
    'Class Announcements',
    'Academic Reports',
    'Exam Schedule'
  ],
  academic_coordinator: ['Timetable Management', 'Syllabus', 'Conflict Detection', 'Class & Section Management', 'Academic Calendar', 'Exam Schedule', 'Academic Announcements', 'Academic Reports'],
  student: ['Academic Calendar', 'Mark Attendance', 'Syllabus', 'Exam Schedule', 'Digital ID', 'Student Profile', 'Attendance', 'My Timetable', 'My Subjects', 'My Faculty', 'Assignments', 'Internal Marks & Results', 'Leave Requests', 'Notices & Announcements', 'Notifications'],
  student_coordinator: ['Attendance Session', 'Class Timetable', 'Class Students', 'Class Attendance', 'Class Performance', 'Class Assignments', 'Class Announcements', 'Class Information', 'Syllabus', 'Academic Calendar', 'Exam Schedule', 'Notifications', 'Session QR & Timer']
};

const headlines = {
  admin: 'System Control Center',
  faculty: 'Teaching Operations',
  academic_coordinator: 'Academic Operations',
  student: 'Student Portal',
  student_coordinator: 'Classroom Operations'
};

const statLabels = {
  admin: ['Total Students', 'Total Faculty', 'Active Sessions', 'Active Notices'],
  faculty: ['Total Subjects', 'Today’s Classes', 'Active Sessions', 'Active Notices'],
  academic_coordinator: ['Total Subjects', 'Total Students', 'Total Faculty', 'Active Notices'],
  student: ['Attendance', 'Assignments', 'Upcoming Events', 'Notifications'],
  student_coordinator: ['Total Subjects', 'Classes Today', 'Session Status', 'Active Notices']
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatTime = value => value ? String(value).slice(0, 5) : '—';
const message = e => e.response?.data?.message || (e.request
  ? 'The college portal is temporarily unavailable. Please refresh or try again shortly.'
  : 'Unable to load this information. Please try again.');
const reminderStorageKey = 'gvpcew_dashboard_reminders_v1';
const timetableAlertSettingsKey = 'gvpcew_timetable_alert_settings_v1';
const timetableAlertSentKey = 'gvpcew_timetable_alerts_sent_v1';
const roleAudienceLabels = {
  faculty: 'Teachers',
  student: 'Students',
  student_coordinator: 'Student Coordinators',
  academic_coordinator: 'Academic Coordinators',
  admin: 'Campus Admin'
};

const defaultReminderTemplates = [
  { id: 'rem-1', title: 'First period readiness', audience: 'Teachers', time: '08:45', channel: 'Bell + dashboard', tone: 'high', date: '2026-08-24', note: 'Share room changes before the first bell.' },
  { id: 'rem-2', title: 'Attendance confirmation', audience: 'Students', time: '09:55', channel: 'Dashboard notification', tone: 'medium', date: '2026-08-24', note: 'Students should confirm attendance before the second hour ends.' },
  { id: 'rem-3', title: 'Coordinator daily roundup', audience: 'Student Coordinators', time: '12:20', channel: 'Silent reminder', tone: 'medium', date: '2026-08-24', note: 'Collect shortage, substitution, and class update notes.' },
  { id: 'rem-4', title: 'Timetable review alarm', audience: 'Academic Coordinators', time: '16:10', channel: 'Alarm alert', tone: 'high', date: '2026-08-24', note: 'Review next-day timetable conflicts and notices.' }
];

function getStoredReminders() {
  try {
    const saved = JSON.parse(localStorage.getItem(accountStorageKey(reminderStorageKey)) || '[]');
    return Array.isArray(saved) && saved.length ? saved : defaultReminderTemplates;
  } catch {
    return defaultReminderTemplates;
  }
}

function saveStoredReminders(reminders) {
  localStorage.setItem(accountStorageKey(reminderStorageKey), JSON.stringify(reminders));
}

function getTimetableAlertSettings() {
  try { return { enabled: true, minutes: 15, sound: true, ...JSON.parse(localStorage.getItem(accountStorageKey(timetableAlertSettingsKey)) || '{}') }; }
  catch { return { enabled: true, minutes: 15, sound: true }; }
}
function minutesUntilToday(time, now = new Date()) {
  const [hours, minutes] = String(time || '').slice(0, 5).split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const start = new Date(now); start.setHours(hours, minutes, 0, 0);
  return Math.round((start.getTime() - now.getTime()) / 60000);
}
function soundAlarm() {
  try { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; const context = new Audio(); const play = () => { const oscillator = context.createOscillator(), gain = context.createGain(); gain.gain.setValueAtTime(.08, context.currentTime); oscillator.frequency.setValueAtTime(880, context.currentTime); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .35); }; const resume = context.resume?.(); if (resume?.then) resume.then(play).catch(()=>{}); else play(); } catch { /* Audio is unavailable or blocked by the browser. */ }
}
function useTimetableAlerts(role, timetable) {
  const [settings, setSettings] = useState(getTimetableAlertSettings), [reminder, setReminder] = useState(null);
  const saveSettings = patch => { const next = { ...settings, ...patch }; localStorage.setItem(accountStorageKey(timetableAlertSettingsKey), JSON.stringify(next)); setSettings(next); };
  useEffect(() => {
    if (!settings.enabled || !['student', 'student_coordinator', 'faculty'].includes(role)) return undefined;
    const check = () => {
      const now = new Date(), dateKey = now.toLocaleDateString('en-CA'); let sent = {};
      try { sent = JSON.parse(localStorage.getItem(accountStorageKey(timetableAlertSentKey)) || '{}'); } catch { sent = {}; }
      const next = (timetable || []).filter(row => row.day_of_week === now.getDay()).map(row => ({ ...row, remaining: minutesUntilToday(row.start_time, now) })).filter(row => row.remaining !== null && row.remaining >= 0 && row.remaining <= Number(settings.minutes)).sort((a,b) => a.remaining - b.remaining)[0];
      if (!next) return;
      const key = `${dateKey}:${next.id}:${settings.minutes}`; if (sent[key]) return;
      sent[key] = true; localStorage.setItem(accountStorageKey(timetableAlertSentKey), JSON.stringify(sent));
      const message = `${next.subject || 'Your class'} starts in ${next.remaining} minute${next.remaining === 1 ? '' : 's'}${next.classroom ? ` in ${next.classroom}` : ''}.`;
      setReminder({ title: 'Upcoming class', message, target: role === 'student_coordinator' ? 'Class Timetable' : 'My Timetable' });
      if (settings.sound) soundAlarm();
      if (window.Notification?.permission === 'granted') new window.Notification('GVPCEW class reminder', { body: message });
    };
    check(); const timer = window.setInterval(check, 30000); return () => window.clearInterval(timer);
  }, [role, timetable, settings]);
  return { settings, saveSettings, reminder, dismiss: () => setReminder(null) };
}
function TimetableAlertSettings({ alerts }) {
  const enableBrowserAlerts = async () => { if (window.Notification) await window.Notification.requestPermission(); };
  return <section className="timetable-alert-settings"><div><h3>Class reminders & alarms</h3><p className="muted">Get an alert before your next timetable class while this portal is open.</p></div><label><input type="checkbox" checked={alerts.settings.enabled} onChange={e=>alerts.saveSettings({enabled:e.target.checked})}/> Enable automatic class reminders</label><label>Alert before<select value={alerts.settings.minutes} onChange={e=>alerts.saveSettings({minutes:Number(e.target.value)})}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option></select></label><label><input type="checkbox" checked={alerts.settings.sound} onChange={e=>alerts.saveSettings({sound:e.target.checked})}/> Play alarm sound</label>{'Notification' in window&&<button type="button" onClick={enableBrowserAlerts}>Enable browser pop-ups</button>}</section>;
}

function buildRoleNotifications(role, data, values) {
  return (data.notifications || []).slice(0, 5).map(row => ({
    id: row.id,
    title: row.title,
    detail: row.body,
    level: row.read_at ? 'low' : 'medium',
    meta: new Date(row.created_at).toLocaleDateString()
  }));
}

// Reusable Table Component
function Table({ columns, rows }) {
  return (
    <div className="overflow mobile-records">
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={row.id || i}>
                {row.map((cell, j) => <td key={j} data-label={columns[j]}>{cell ?? '—'}</td>)}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="muted" style={{ textAlign: 'center', padding: '24px' }}>
                No records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Stat Card
function Stat({ label, value, index, note = 'live data' }) {
  const icons = [QrCode, ClipboardList, Calendar, Bell];
  const Icon = icons[index % 4] || LayoutDashboard;
  return (
    <article className="stat-card">
      <span className={'icon ' + ['blue', 'green', 'orange', 'purple'][index % 4]}>
        <Icon />
      </span>
      <div>
        <p>{label}</p>
        <div className="stat-card-val-row">
          <strong>{value ?? '0'}</strong>
          <small>{note}</small>
        </div>
      </div>
    </article>
  );
}

function UserAccessManagement({ users = [], reload }) {
  const accessSections = [
    { value: 'student', title: 'Students', description: 'Students who can sign in to the Student Portal.' },
    { value: 'student_coordinator', title: 'Student Coordinators', description: 'Students approved to manage class coordination tasks.' },
    { value: 'faculty', title: 'Faculty', description: 'Teachers who can sign in to the Faculty Portal.' },
    { value: 'academic_coordinator', title: 'Academic Coordinators', description: 'Staff approved to manage academic coordination.' }
  ];
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState(null);
  const [people, setPeople] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [groupCatalog, setGroupCatalog] = useState([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [details, setDetails] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', rollNumber: '', section: 'A', employeeCode: '' });
  const [savingId, setSavingId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const sectionLabel = activeSection?.value === 'faculty' ? 'Faculty' : activeSection?.title?.slice(0, -1);
  const isStudentGroup = ['student', 'student_coordinator'].includes(activeSection?.value);
  const isGroupedRole = isStudentGroup || activeSection?.value === 'faculty';
  const managementGroups = useMemo(() => {
    const groups = new Map();
    const add = (department, section) => {
      const key = JSON.stringify([department || '__unassigned', isStudentGroup ? section || '' : '']);
      if (!groups.has(key)) groups.set(key, { key, department: department || '__unassigned', section: isStudentGroup ? section || '' : '' });
    };
    if (isStudentGroup) groupCatalog.forEach(group => add(group.department, group.section));
    else departments.forEach(department => add(department, ''));
    people.forEach(person => add(person.department, person.section));
    return [...groups.values()].map(group => ({ ...group, count: people.filter(person => (person.department || '__unassigned') === group.department && (!isStudentGroup || (person.section || '') === group.section)).length }));
  }, [groupCatalog, departments, people, isStudentGroup]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.full_name, user.email, user.role, ...(user.roles || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [query, users]);

  const filteredPeople = useMemo(() => {
    const term = query.trim().toLowerCase();
    return people.filter((person) => (!isGroupedRole ||
      ((!branchFilter || (person.department || '__unassigned') === branchFilter) && (!sectionFilter || person.section === sectionFilter))) && (!term ||
      [person.full_name, person.email, person.roll_number, person.employee_code]
        .some((value) => String(value || '').toLowerCase().includes(term))));
  }, [query, people, isGroupedRole, branchFilter, sectionFilter]);
  const sectionOptions = [...new Set(people.filter(person => !branchFilter || (person.department || '__unassigned') === branchFilter).map(person => person.section).filter(Boolean))].sort();
  const searchResults = filteredUsers.filter((user) => accessSections.some((section) =>
    (user.roles || [user.role]).includes(section.value)));

  async function updateRoles(user, nextRoles) {
    setSavingId(user.id);
    setError('');
    setNotice('');
    try {
      await api.patch(`/users/${user.id}/roles`, { roles: nextRoles });
      setNotice(`Access updated for ${user.full_name}.`);
      await reload?.();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(message(err));
    } finally {
      setSavingId('');
    }
  }

  async function openSection(section) {
    setGroupOpen(false);
    setBranchFilter('');
    setSectionFilter('');
    setPeople([]);
    setActiveSection(section);
    setEditing(null);
    setDetails(null);
    setFormOpen(false);
    setForm({ fullName: '', email: '', password: '', rollNumber: '', section: 'A', employeeCode: '' });
    setError('');
    try {
      const { data } = await api.get(`/admin/people?role=${section.value}`);
      setPeople(data.people || []);
      setDepartments(data.departments || []);
      setGroupCatalog(data.groups || []);
    } catch (err) {
      setError(message(err));
      setPeople([]);
    }
  }

  async function refreshPeople() {
    if (!activeSection) return;
    const { data } = await api.get(`/admin/people?role=${activeSection.value}`);
    setPeople(data.people || []);
    setDepartments(data.departments || []);
    setGroupCatalog(data.groups || []);
  }

  async function savePerson(event) {
    event.preventDefault();
    setSavingId('form');
    setError('');
    try {
      if (editing) {
        await api.patch(`/admin/people/${editing.id}`, form);
      } else {
        await api.post('/admin/people', { ...form, role: activeSection.value });
      }
      setNotice(editing ? 'Details updated.' : 'Account created and portal access granted.');
      setEditing(null);
      setFormOpen(false);
      setForm({ fullName: '', email: '', password: '', rollNumber: '', section: 'A', employeeCode: '' });
      await refreshPeople();
      await reload?.();
    } catch (err) {
      setError(message(err));
    } finally {
      setSavingId('');
    }
  }

  async function deletePerson(person) {
    if (!window.confirm(`Delete ${person.full_name}? This permanently removes their account and access.`)) return;
    setSavingId(person.id);
    setError('');
    try {
      await api.delete(`/admin/people/${person.id}`);
      setNotice(`${person.full_name} was deleted.`);
      await refreshPeople();
      await reload?.();
    } catch (err) {
      setError(message(err));
    } finally {
      setSavingId('');
    }
  }

  function startEdit(person) {
    setEditing(person);
    setDetails(null);
    setFormOpen(true);
    setForm({ fullName: person.full_name, email: person.email, password: '', rollNumber: person.roll_number || '', section: person.section || 'A', department: person.department || '', employeeCode: person.employee_code || '' });
  }

  return (
    <div className="access-management">
      <div className="access-toolbar">
        <div className="panel-head" style={{ marginBottom: 0 }}>
          <div>
            <span className="access-eyebrow">PEOPLE & PERMISSIONS</span>
            <h2 className="access-title">Manage portal access</h2>
            <p className="muted" style={{ margin: 0 }}>Choose a role to manage accounts and portal access.</p>
          </div>
        </div>
        <label className="access-search"><Search size={19} aria-hidden="true" /><input
          type="search"
          aria-label="Search portal accounts by name or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
        /></label>
        {notice && <p className="success-message" style={{ margin: 0 }}>{notice}</p>}
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      </div>

      {!activeSection && query.trim() && <section className="panel" style={{ margin: 0 }} aria-label="Account search results">
        <p className="muted" role="status">{searchResults.length ? `${searchResults.length} matching account${searchResults.length === 1 ? '' : 's'}` : 'No accounts match your search.'}</p>
        {searchResults.length > 0 && <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>Name</th><th>Email</th><th>Manage access</th></tr></thead>
          <tbody>{searchResults.map((user) => <tr key={user.id}>
            <td>{user.full_name}</td><td>{user.email}</td>
            <td><div className="people-actions">{accessSections.filter((section) => (user.roles || [user.role]).includes(section.value)).map((section) =>
              <button key={section.value} type="button" className="people-action" onClick={() => openSection(section)}>Open {section.title}</button>
            )}</div></td>
          </tr>)}</tbody>
        </table></div>}
      </section>}

      {!activeSection ? <div className="access-role-grid">
        {accessSections.map((section, index) => {
          const RoleIcon = [GraduationCap, Users, BookOpen, ShieldCheck][index];
          const count = users.filter((user) => (user.roles || [user.role]).includes(section.value)).length;
          return <button key={section.value} type="button" className={`access-role-card access-role-${index}`} onClick={() => openSection(section)}>
            <div className="access-card-top"><span className="access-role-icon"><RoleIcon size={23} aria-hidden="true" /></span><span className="access-count">{count} assigned</span></div>
            <div className="access-card-copy">
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
            <span className="access-card-footer">Manage accounts <ArrowRight size={17} aria-hidden="true" /></span>
          </button>;
        })}
      </div> : <section className="panel" style={{ margin: 0 }}>
        <div className="panel-head">
          <div><h2 style={{ marginBottom: '4px' }}>{activeSection.title} Management</h2><p className="muted" style={{ margin: 0 }}>Create, edit, or remove accounts in this section.</p></div>
          <button type="button" className="secondary" onClick={() => { setActiveSection(null); setEditing(null); setFormOpen(false); }}>Back to sections</button>
        </div>
        {isGroupedRole && !groupOpen && <div className="management-group-grid">
          {managementGroups.map(group => <button type="button" className="management-group-card" key={group.key} onClick={() => { setBranchFilter(group.department); setSectionFilter(group.section); setGroupOpen(true); }}>
            <span className="management-group-tag">{isStudentGroup ? `Section ${group.section || 'Unassigned'}` : 'Department'}</span>
            <h3>{group.department === '__unassigned' ? 'Unassigned department' : group.department}</h3>
            <div className="management-group-footer"><strong>{group.count} {isStudentGroup ? (activeSection.value === 'student' ? 'students' : 'coordinators') : 'faculty members'}</strong><ArrowRight size={16} aria-hidden="true" /></div>
          </button>)}
          <button type="button" className="management-group-card" onClick={() => { setBranchFilter(''); setSectionFilter(''); setGroupOpen(true); }}><h3>All {activeSection.title}</h3><p>View, search, or add accounts across departments.</p><strong>{people.length} accounts</strong></button>
        </div>}
        {(!isGroupedRole || groupOpen) && <>
        {isGroupedRole && <div className="student-group-filters">
          <button type="button" className="people-action" onClick={() => setGroupOpen(false)}>Back to {isStudentGroup ? 'sections' : 'departments'}</button>
          <label>Branch<select value={branchFilter} onChange={event => { setBranchFilter(event.target.value); setSectionFilter(''); }}><option value="">All branches</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}<option value="__unassigned">Unassigned</option></select></label>
          {isStudentGroup && <label>Section<select value={sectionFilter} onChange={event => setSectionFilter(event.target.value)}><option value="">All sections</option>{[...new Set([...sectionOptions, ...groupCatalog.filter(group => !branchFilter || group.department === branchFilter).map(group => group.section)])].sort().map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
          <span role="status">{filteredPeople.length} of {people.length} accounts</span>
          {(branchFilter || sectionFilter || query) && <button type="button" className="people-action" onClick={() => { setBranchFilter(''); setSectionFilter(''); setQuery(''); }}>Clear filters</button>}
        </div>}
        <div style={{ overflowX: 'auto', marginTop: '18px' }}>
          <table>
            <thead><tr><th>{isStudentGroup ? 'Roll Number' : activeSection.value === 'faculty' ? 'Employee Code' : 'Portal ID'}</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{filteredPeople.map((person) => <tr key={person.id}>
              <td>{person.roll_number || person.employee_code || person.id.slice(0, 8).toUpperCase()}</td><td>{person.full_name}{isGroupedRole && <small className="student-group-caption">{person.department || 'Unassigned'}{isStudentGroup ? ` · Section ${person.section || 'Unassigned'}` : ''}</small>}</td><td>{person.email.endsWith('@students.invalid') ? 'Email not provided' : person.email}</td><td>{sectionLabel}</td><td><span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '999px', background: person.email.endsWith('@students.invalid') ? '#fff3d6' : '#dcfce7', color: person.email.endsWith('@students.invalid') ? '#805800' : '#166534', fontSize: '12px', fontWeight: '700' }}>{person.email.endsWith('@students.invalid') ? 'Setup needed' : 'Active'}</span></td>
              <td><div className="people-actions"><button type="button" className="people-action" onClick={() => setDetails(person)}>View Details</button><button type="button" className="people-action people-action-edit" onClick={() => startEdit(person)}>Edit</button><button type="button" className="people-action people-action-delete" disabled={savingId === person.id} onClick={() => deletePerson(person)}>{savingId === person.id ? 'Deleting...' : 'Delete'}</button></div></td>
            </tr>)}
            {!filteredPeople.length && <tr><td colSpan="6" className="muted">{query.trim() || branchFilter || sectionFilter ? 'No accounts match your search and filters.' : `No ${activeSection.title.toLowerCase()} have been added yet.`}</td></tr>}</tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}><p className="muted" style={{ margin: 0 }}>Use Add to create an account and grant its portal access.</p><button type="button" className="people-add" onClick={() => { setEditing(null); setForm({ fullName: '', email: '', password: '', rollNumber: '', department: branchFilter === '__unassigned' ? '' : branchFilter, section: sectionFilter || '1', employeeCode: '' }); setFormOpen(true); }}>+ Add {sectionLabel}</button></div>
        </>}
      </section>}
      {formOpen && activeSection && <div className="timetable-modal-backdrop"><section className="timetable-modal-content"><div className="modal-header"><div><h2>{editing ? `Edit ${sectionLabel}` : `Add ${sectionLabel}`}</h2><p className="muted">Enter the account details for portal access.</p></div><button type="button" className="modal-close-btn" onClick={() => setFormOpen(false)}>X</button></div><form className="modal-form" onSubmit={savePerson}>
        <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <input type="email" placeholder="College email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className="full" type="password" autoComplete="new-password" minLength="8" aria-label={editing ? 'New password (optional)' : 'Temporary password'} placeholder={editing ? 'New password (leave blank to keep current)' : 'Temporary password (minimum 8 characters)'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} />
        {editing?.email?.endsWith('@students.invalid') && <p className="muted full">This imported student needs a college email and a new password before signing in.</p>}
        {isStudentGroup && <>
          <label className="student-group-field">Roll number<input placeholder="Roll number" value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} required /></label>
          <label className="student-group-field">Branch<input list="student-branch-options" placeholder="Select or type a branch" maxLength={120} value={form.department ?? ''} onChange={e => setForm({ ...form, department: e.target.value })} required /><datalist id="student-branch-options">{departments.map(name => <option key={name} value={name} />)}</datalist></label>
          <label className="student-group-field">Section<input placeholder="e.g. A, B, C" maxLength={30} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value.toUpperCase() })} required /></label>
        </>}
        {activeSection.value === 'faculty' && <input className="full" placeholder="Employee code" value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} required />}
        {activeSection.value === 'faculty' && <label className="student-group-field">Department<input list="faculty-departments" placeholder="Select or type a department" maxLength={120} value={form.department || ''} onChange={event => setForm({ ...form, department: event.target.value })} required /><datalist id="faculty-departments">{departments.map(name => <option key={name} value={name} />)}</datalist></label>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={() => setFormOpen(false)}>Cancel</button><button disabled={savingId === 'form'}>{savingId === 'form' ? 'Saving...' : editing ? 'Save changes' : 'Create account'}</button></div>
      </form></section></div>}
      {details && <div className="timetable-modal-backdrop"><section className="timetable-modal-content"><div className="modal-header"><div><h2>{details.full_name}</h2><p className="muted">{sectionLabel} account details</p></div><button type="button" className="modal-close-btn" onClick={() => setDetails(null)}>X</button></div><div style={{ display: 'grid', gap: '12px' }}><p><strong>Email:</strong> {details.email.endsWith('@students.invalid') ? 'Not provided' : details.email}</p><p><strong>Portal role:</strong> {sectionLabel}</p><p><strong>Department:</strong> {details.department || 'Unassigned'}</p>{isStudentGroup && details.roll_number && <p><strong>Roll number:</strong> {details.roll_number}</p>}{isStudentGroup && details.section && <p><strong>Section:</strong> {details.section}</p>}{details.employee_code && <p><strong>Employee code:</strong> {details.employee_code}</p>}<p><strong>Access:</strong> {details.email.endsWith('@students.invalid') ? 'Email and password setup needed' : 'Active'}</p></div></section></div>}
    </div>
  );
}

// Notice & Circular Form
function NoticeForm({ onCreated }) {
  const [scope,setScope]=useState(null);
  useEffect(()=>{api.get('/auth/context').then(({data})=>setScope(data)).catch(e=>setError(message(e)));},[]);
  const [form, setForm] = useState({ title: '', description: '', category: 'general' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const update = e => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/notices', form);
      onCreated?.(data.notice);
      setForm({ title: '', description: '', category: 'general' });
      setSuccess('Announcement published successfully.');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="workspace-form" onSubmit={submit} style={{ marginTop: '20px', background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
      <h3 className="full" style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Publish New Notice or Circular</h3>
      <label>Audience<select required={!scope?.institutionWide} value={form.sectionId||''} onChange={e=>{const s=scope?.sections.find(x=>x.id===e.target.value);setForm({...form,sectionId:s?.id||null,departmentId:s?.department_id||null});}}><option value="">{scope?.institutionWide?'Entire institution':'Choose an assigned class'}</option>{scope?.sections.map(s=><option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select></label>
      <input name="title" placeholder="Announcement title (e.g. Mid-II Timetable Circular)" value={form.title} onChange={update} required style={{ gridColumn: 'span 2' }} />
      <textarea name="description" placeholder="Details and instructions for students and staff..." value={form.description} onChange={update} required style={{ gridColumn: 'span 2', minHeight: '90px' }} />
      <select name="category" value={form.category} onChange={update}>
        <option value="general">General Circular</option>
        <option value="academic">Academic & Examination</option>
        <option value="class">Class & Department</option>
        <option value="events">Events & Workshops</option>
      </select>
      <button disabled={busy} style={{ background: '#087a62', color: '#fff', fontWeight: 'bold' }}>
        {busy ? 'Publishing…' : 'Publish Circular'}
      </button>
      {success && <p className="success-message full" style={{ margin: '6px 0 0' }}>{success}</p>}
      {error && <p className="error full" style={{ margin: '6px 0 0' }}>{error}</p>}
    </form>
  );
}

// Attendance Starter for Faculty / Coordinator
function AttendanceControl(){return <AttendanceSessionControl/>;}

function LeaveRequests() {
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {const {data}=await api.get('/students/leave-requests');setRequests(data.requests||[]);}
    catch(e){setError(message(e));}
  };

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/students/leave-requests', form);
      setNotice('Leave request submitted to Class Incharge for approval.');
      setForm({ startDate: '', endDate: '', reason: '' });
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Leave request was not saved. Please retry.');
    } finally {
      setBusy(false);
      setTimeout(() => setNotice(''), 4000);
    }
  }

  return (
    <div>
      <form className="workspace-form leave-form" onSubmit={submit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
        <h3 className="full" style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Apply for Student Leave</h3>
        <label>
          From Date
          <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required />
        </label>
        <label>
          To Date
          <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required />
        </label>
        <label className="full">
          Reason for Leave
          <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Explain your reason for leave (medical, personal, family event)..." required />
        </label>
        <button disabled={busy} style={{ gridColumn: 'span 2', background: '#087a62', color: '#fff', fontWeight: 'bold' }}>
          {busy ? 'Submitting…' : 'Submit Leave Application'}
        </button>
        {notice && <p className="success-message full" style={{ margin: '6px 0 0' }}>{notice}</p>}
        {error && <p className="error full" style={{ margin: '6px 0 0' }}>{error}</p>}
      </form>

      <div className="portal-actions"><h3>My Leave Application History</h3><button onClick={load} disabled={busy}>Refresh history</button></div>
      <Table
        columns={['From Date', 'To Date', 'Reason', 'Faculty Response', 'Status', 'Submitted On']}
        rows={requests.map(x => [
          new Date(x.start_date).toLocaleDateString(),
          new Date(x.end_date).toLocaleDateString(),
          x.reason,
          x.reviewer_note || 'No response yet',
          <span className={`status ${x.status}`}>{x.status}</span>,
          new Date(x.created_at).toLocaleDateString()
        ])}
      />
    </div>
  );
}

// Student Calendar Banner Highlight
function StudentCalendarHighlight({ onNavigate }) {
  const [calendar, setCalendar] = useState(null);
  useEffect(() => {
    api.get('/academic-documents/calendar')
      .then(r => setCalendar(r.data.documents?.find(x => x.key === 'main')?.payload || null))
      .catch(() => {});
  }, []);

  const semester = calendar?.semesters?.[0];
  const events = semester?.events || [
    { title: 'Commencement of Class Work', dates: '07-07-2025' },
    { title: 'Instruction Period for the Semester', dates: '07-07-2025 to 07-11-2025 (18 W)' },
    { title: 'I Mid Examinations', dates: '01-09-2025 to 03-09-2025 (03 days)' },
    { title: 'II Mid Examinations', dates: '05-11-2025 to 07-11-2025 (03 days)' }
  ];

  return (
    <div className="calendar-highlight-card">
      <div className="calendar-highlight-header">
        <div className="calendar-highlight-title-group">
          <Calendar style={{ width: 19, height: 19, color: '#184c3c' }} />
          <h2>Academic Calendar Highlights — {semester?.title || 'I Semester'}</h2>
          <span className="calendar-highlight-badge">Live Published</span>
        </div>
        <button className="calendar-highlight-btn" onClick={() => onNavigate('Academic Calendar')}>
          View Full Calendar <ArrowRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </button>
      </div>
      <div className="calendar-milestones-grid">
        {events.slice(0, 4).map((evt, idx) => (
          <div key={idx} className="calendar-milestone-box">
            <span className="milestone-title">{evt.title}</span>
            <span className="milestone-dates">{evt.dates || evt.date || '07-07-2025'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Class & Section Management View (Academic Coordinator)
function AcademicReports(){return <LiveAcademicReports/>;}
function ReminderCenter(){return <NotificationCenter/>;}

function DashboardHome({ role, name, student, items, statValues, notifications, onNavigate }) {
  const campusLabel = student.profile?.department || headlines[role];
  const quickHighlights = {
    faculty: [
      { icon: Clock, title: 'Today’s flow', text: 'Track periods, attendance, and announcements from one clean space.' },
      { icon: BookMarked, title: 'Class readiness', text: 'Keep lesson slots, rooms, and student updates aligned.' }
    ],
    student: [
      { icon: Award, title: 'Academic focus', text: 'Check attendance, assignments, timetable, and notices quickly.' },
      { icon: Clock, title: 'Next class clarity', text: 'Use reminders and the timetable to stay prepared every hour.' }
    ],
    student_coordinator: [
      { icon: Users, title: 'Class coordination', text: 'Manage attendance sessions, notices, and room updates easily.' },
      { icon: Bell, title: 'Reminder support', text: 'Push clean class alerts before sessions start.' }
    ],
    academic_coordinator: [
      { icon: ShieldCheck, title: 'Academic control', text: 'Oversee timetable, sections, exams, calendar, and notices from one dashboard.' },
      { icon: TrendingUp, title: 'Daily review', text: 'Catch timetable clashes and send reminders before they become issues.' }
    ],
    admin: [
      { icon: ShieldCheck, title: 'Campus overview', text: 'Monitor the overall portal, notices, and academic operations.' },
      { icon: Users, title: 'System visibility', text: 'See where support or approvals are needed next.' }
    ]
  };

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="hero-badge">GVPCEW Smart Campus</div>
          <h1>{role === 'academic_coordinator' ? 'Academic coordination, made clear and elegant.' : `Welcome, ${name.split(' ')[0]}`}</h1>
          <p>{campusLabel} portal with a cleaner layout, logo-based branding, quick actions, and reminder support for every role.</p>
          <div className="hero-actions">
            <button onClick={() => onNavigate(items[0] || 'Dashboard')}>Open workspace</button>
            <button className="secondary" onClick={() => onNavigate(role === 'student' ? 'Notifications' : role === 'faculty' ? 'Class Announcements' : 'Academic Announcements')}>View alerts</button>
          </div>
        </div>
        <div className="hero-brand-card">
          <img src={logoUrl} alt="GVPCEW logo" className="brand-logo-mark" />
          <div>
            <p>Gayatri Vidya Parishad</p>
            <strong>College of Engineering for Women</strong>
            <span>Elegant role dashboard with notifications, reminders, and streamlined actions.</span>
          </div>
        </div>
      </section>

      <section className="profile profile--elevated">
        <div className="brand-avatar-wrap">
          <img src={logoUrl} alt="GVPCEW logo" className="avatar-logo" />
          <div className="avatar">{name[0] || 'G'}</div>
        </div>
        <div>
          <h2>{name}</h2>
          <p>{campusLabel} • GVPCEW</p>
        </div>
      </section>

      <section className="stats">
        {statLabels[role].map((label, index) => (
          <Stat key={label} label={label} value={statValues[index]} index={index} note={index === 3 ? 'Live attention points' : 'Live campus overview'} />
        ))}
      </section>

      <section className="dashboard-split">
        <article className="panel spotlight-panel">
          <div className="panel-head">
            <h2>Priority notifications</h2>
            <span>{notifications.length} active</span>
          </div>
          <div className="alert-stack">
            {notifications.map(item => (
              <div key={item.id} className={`alert-row ${item.level}`}>
                <Bell />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <small>{item.meta}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Quick highlights</h2>
            <button onClick={() => onNavigate(items[0] || 'Dashboard')}>Open main module</button>
          </div>
          <div className="quick-highlight-list">
            {(quickHighlights[role] || []).map(item => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="quick-highlight-item">
                  <span className="icon blue"><Icon /></span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="grid" style={{ marginTop: '18px' }}>
        {role === 'student' && (
          <StudentCalendarHighlight onNavigate={onNavigate} />
        )}
        {items.map(item => (
          <article className="panel module-card" key={item}>
            <div className="panel-head">
              <h2>{item}</h2>
              <button onClick={() => onNavigate(item)}>Open</button>
            </div>
            <p className="muted">{item === 'Timetable Management' ? 'Design, publish, and monitor class slots with less clutter.' : 'Open live academic records and actions in a cleaner workspace.'}</p>
          </article>
        ))}
      </section>
    </>
  );
}

function StudentCoordinatorHome({ items, data, onNavigate, faculty = false }) {
  const today = new Date().getDay();
  const upcomingClasses = (data.timetable || [])
    .filter(item => item.day_of_week === today)
    .slice()
    .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
    .slice(0, 3);
  const spotlightNotice = (data.notices || [])[0];
  const sessionCount = Number(data.values?.sessions || 0);
  const attendanceTarget = faculty ? 'Attendance' : 'Attendance Session';
  const timetableTarget = faculty ? 'My Timetable' : 'Class Timetable';

  return (
    <>
      <section className="panel dashboard-home-actions"><h2>All Sections</h2><div className="compact-action-list">{items.map(item => <button className="compact-action" key={item} onClick={() => onNavigate(item)}>{item}</button>)}</div></section>


      <section className="grid coordinator-grid" style={{ marginTop: '18px' }}>
        <article className="panel">
          <div className="panel-head">
            <h2>Attendance</h2>
            <span>{sessionCount ? `${sessionCount} live` : 'No live session'}</span>
          </div>
          <p className="muted" style={{ marginBottom: '12px' }}>
            {faculty
              ? 'Record attendance, review class records, and follow up on any pending corrections.'
              : sessionCount
              ? 'An attendance session is already running. You can stop it or share the code from the session workspace.'
              : 'No active attendance session right now. Start one before the next class begins.'}
          </p>
          <button className="coordinator-start" onClick={() => onNavigate(attendanceTarget)}>
            {faculty ? 'Open Attendance' : sessionCount ? 'Manage Live Session' : 'Start Attendance'}
          </button>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Today’s classes</h2>
            <button onClick={() => onNavigate(timetableTarget)}>Open timetable</button>
          </div>
          {upcomingClasses.length ? (
            <div className="alert-stack">
              {upcomingClasses.map((item, index) => (
                <div key={`${item.subject || 'subject'}-${index}`} className="alert-row low">
                  <Clock />
                  <div>
                    <strong>{item.subject || 'Scheduled class'}</strong>
                    <p>{formatTime(item.start_time)} to {formatTime(item.end_time)} {item.classroom ? `| ${item.classroom}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No classes are scheduled for today.</p>
          )}
        </article>

        <article className="panel span2">
          <div className="panel-head">
            <h2>Announcements</h2>
            <button onClick={() => onNavigate('Class Announcements')}>Open announcements</button>
          </div>
          {spotlightNotice ? (
            <div className="alert-row medium">
              <Bell />
              <div>
                <strong>{spotlightNotice.title}</strong>
                <p>{spotlightNotice.description || 'A class update is ready for review.'}</p>
              </div>
              <small>{spotlightNotice.category || 'Notice'}</small>
            </div>
          ) : (
            <p className="muted">No active announcements right now.</p>
          )}
        </article>
      </section>
    </>
  );
}

// Main Exported RoleDashboard Component
export function RoleDashboard({ role, name, active, onNavigate, onLogout, onRoleChange, roles = [] }) {
  const [data, setData] = useState({ subjects: [], timetable: [], notices: [], events: [], values: {} });
  const [student, setStudent] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationRef = useRef(null);
  useEffect(() => {
    const screen = window.matchMedia('(max-width: 900px)');
    const resized = () => { if (!screen.matches) setMobileOpen(false); };
    screen.addEventListener('change', resized);
    return () => screen.removeEventListener('change', resized);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setMobileOpen(false);
  }, [active, role]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement;
    const scrollY = window.scrollY;
    const savedStyle = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    Object.assign(document.body.style, { position: 'fixed', top: '-' + scrollY + 'px', width: '100%' });
    const focusable = () => [...navigationRef.current.querySelectorAll('button:not(:disabled), select, a[href]')];
    focusable()[0]?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key !== 'Tab') return;
      const controls = focusable(), first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      Object.assign(document.body.style, savedStyle);
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  const canPublish = ['admin', 'faculty', 'academic_coordinator', 'student_coordinator'].includes(role);
  const canSessions = ['faculty', 'student_coordinator'].includes(role);

  const load = async () => {
    setLoading(true);
    setError('');
    let session; try { session = JSON.parse(localStorage.getItem('gvpcew_session') || '{}'); } catch { onLogout?.(); return; }
    if (!session?.token) {
      onLogout?.();
      return;
    }



    try {
      const timetableUrl = role==='student' ? '/timetables/student' : role==='student_coordinator'?'/timetable': role === 'faculty' ? '/timetables/faculty' : role === 'academic_coordinator' ? '/timetables/coordinator' : '/timetable';
      const requests = [
        api.get(`/dashboard?role=${role}`), api.get('/subjects'), api.get(timetableUrl),
        api.get('/notices'), api.get('/events'),
        role === 'admin' ? api.get('/users') : Promise.resolve({ data: { users: [] } }),
        api.get('/notifications')
      ];
      const studentPaths = ['dashboard', 'profile', 'attendance', 'assignments', 'marks'];
      const {failed, responses} = await settlePortalRequests([
        ...requests,
        ...(['student','student_coordinator'].includes(role) ? studentPaths.map(path => api.get('/students/' + path)) : [])
      ]);
      if (failed) setError('Some portal information could not be loaded. Use Refresh to retry.');
      const base = responses.slice(0, 7);
      let studentData = {};
      if (['student','student_coordinator'].includes(role)) {
        const s = responses.slice(7).map(result => result.data);
        studentData = {
          dashboard: s[0], profile: s[1]?.profile, attendance: s[2],
          assignments: s[3]?.assignments, marks: s[4]?.marks
        };
      }

      setData({
        values: base[0].data.values || {},
        subjects: base[1].data.subjects || [],
        timetable: base[2].data.timetable || [],
        notices: base[3].data.notices || [],
        events: base[4].data.events || [],
        users: base[5].data.users || [],
        notifications: base[6].data.notifications || []
      });
      setStudent(studentData);
    } catch (e) {
      if ([401, 403].includes(e.response?.status) || e.response?.data?.message?.toLowerCase().includes('token')) {
        localStorage.removeItem('gvpcew_session');
        window.location.replace('/index.html');
      } else {
        setError(message(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [role]);

  const items = menus[role] || [];
  const mobileLinks = {
    student: [['Home','Dashboard',Home],['Schedule','My Timetable',Calendar],['ID Card','Digital ID',IdCard]],
    faculty: [['Home','Dashboard',Home],['Schedule','My Timetable',Calendar],['Attendance','Attendance',CheckCircle2]],
    admin: [['Home','Dashboard',Home],['People','User Management',Users],['Academics','Academic Management',BookOpen]],
    academic_coordinator: [['Home','Dashboard',Home],['Schedule','Timetable Management',Calendar],['Syllabus','Syllabus',BookOpen]],
    student_coordinator: [['Home','Dashboard',Home],['Schedule','Class Timetable',Calendar],['Session','Attendance Session',QrCode]]
  }[role] || [];
  const isHome = active === 'Dashboard';

  const values = role === 'student'
    ? {
        attendance: `${student.dashboard?.attendance ?? 0}%`,
        assignments: student.dashboard?.pendingAssignments ?? 0,
        events: data.events.length,
        notifications: student.dashboard?.notifications?.filter(n => !n.read_at).length ?? 0
      }
    : data.values;

  const statValues = role === 'student'
    ? [values.attendance, values.assignments, values.events, values.notifications]
    : role === 'faculty'
    ? [values.subjects ?? 0, data.timetable.filter(t => t.day_of_week === new Date().getDay()).length || 0, values.sessions ?? 0, values.notices ?? 0]
    : role === 'student_coordinator'
    ? [
        values.subjects ?? data.subjects.length,
        data.timetable.filter(t => t.day_of_week === new Date().getDay()).length || 0,
        values.sessions ? 'Live' : 'Ready',
        values.notices || data.notices.length || 0
      ]
    : role === 'academic_coordinator'
    ? [values.subjects ?? 0, values.students ?? 0, values.faculty ?? 0, values.notices ?? 0]
    : [values.students ?? 0, values.faculty ?? 0, values.sessions ?? 0, values.notices ?? 0];

  const notifications = buildRoleNotifications(role, data, values);
  const unreadCount = (data.notifications || []).filter(row=>!row.read_at).length;
  const timetableAlerts = useTimetableAlerts(role, data.timetable);

  const panelDescriptions = {
    'Academic Calendar': 'View official academic year calendar, semester schedules & holidays.',
    'Syllabus': 'View course structures and official syllabus PDFs published by the academic coordinator.',
    'Exam Schedule': 'View Mid-I, Mid-II internals & regular examination timetables.',
    'Digital ID': 'View and print your college student record.',
    'My Timetable': 'Check weekly class schedule, subject slots, and classroom locations.',
    'Attendance': 'Track live subject-wise attendance and minimum criteria.',
    'Student Profile': 'View your registered personal and academic college details.',
    'Assignments': 'View ongoing assignments, submission status, and deadlines.',
    'Internal Marks & Results': 'Check internal examination marks, mid evaluations, and results.',
    'Notices & Announcements': 'Official circulars, events, and college notices.',
    'Leave Requests': 'Submit and track student leave requests.',
    'Timetable Management': 'Create, edit, validate, and publish department timetables.',
    'Conflict Detection': 'Institution-wide faculty and classroom collision detector.',
    'Class & Section Management': 'Manage classroom allocations, sections, and class incharge assignments.',
    'Academic Reports': 'View institutional analytics and academic performance summaries.',
    'Section Assignment': 'Assign selected students to their official department and class section.',
    'Attendance Session': 'Start, manage, and close secure attendance sessions for your class.',
    'Class Timetable': 'View the published class timetable with subjects, times, and rooms.',
    'Class Announcements': 'Publish and review important updates for your class.',
    'Class Information': 'View official class subjects, sections, and faculty details.',
    'Session QR & Timer': 'Share session QR codes and track active attendance time.'
  };

  return (
    <div className="shell">
      {/* Sidebar */}
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside ref={navigationRef} aria-label="All portal sections" id="portal-navigation" className={mobileOpen ? 'open' : ''}>
        <button className="sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X /></button>
        <div className="brand">
          <img src={logoUrl} alt="GVPCEW logo" className="sidebar-logo" />
          <div>
            <span>GVPCEW</span>
            <small>Campus Portal</small>
          </div>
        </div>
        <p className="school">College of Engineering for Women</p>

        {roles.length > 1 ? (
          <select className="role-switch" value={role} onChange={e => onRoleChange(e.target.value)}>
            {roles.map(r => <option key={r} value={r}>{r.replaceAll('_', ' ').toUpperCase()}</option>)}
          </select>
        ) : (
          <div className="sidebar-role-badge">
            <span>{role.replaceAll('_', ' ').toUpperCase()}</span>
            <ChevronDown style={{ width: 14, height: 14 }} />
          </div>
        )}

        <nav>
          <button className={isHome ? 'active' : ''} onClick={() => { onNavigate('Dashboard'); setMobileOpen(false); }}>
            <LayoutDashboard /> Dashboard
          </button>
          {items.map(item => {
            const ItemIcon = getSidebarIcon(item);
            return (
              <button key={item} className={active === item ? 'active' : ''} onClick={() => { onNavigate(item); setMobileOpen(false); }}>
                <ItemIcon /> {item}
              </button>
            );
          })}
        </nav>

        <button className="logout" onClick={onLogout}><LogOut /> Sign out</button>
      </aside>

      {/* Main Content */}
      <main inert={mobileOpen} className="content">
        <header>
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="portal-navigation">
            {mobileOpen ? <X /> : <Menu />}
          </button>
          <div>
            <p className="eyebrow">{role.replaceAll('_', ' ').toUpperCase()} PORTAL</p>
            <h1>{isHome ? `Welcome, ${name.split(' ')[0]}` : active}</h1>
          </div>
          <button className="notification" onClick={() => onNavigate('Notifications')} title="Open notifications" aria-label="Open notifications">
            <Bell />
            <i>{unreadCount}</i>
          </button>
        </header>

        {error && <p className="error" style={{ marginBottom: '16px' }}>{error}</p>}
        {timetableAlerts.reminder && <aside className="timetable-reminder-popup" role="alert"><Bell /><div><strong>{timetableAlerts.reminder.title}</strong><p>{timetableAlerts.reminder.message}</p></div><button onClick={()=>{onNavigate(timetableAlerts.reminder.target);timetableAlerts.dismiss();}}>Open timetable</button><button className="timetable-reminder-close" aria-label="Dismiss class reminder" onClick={timetableAlerts.dismiss}>×</button></aside>}

        {role === 'student' && student?.profile && !student.profile.academic_section_id && (
          <div className="unassigned-student-notice" role="alert">
            <AlertTriangle />
            <div>
              <strong>Official Class Section Pending Assignment</strong>
              <p>Your student registration is confirmed. Your academic coordinator or administrator will assign you to your class section (Year, Branch &amp; Section). Once assigned, your class timetable, subject attendance, assignments, and faculty will appear automatically.</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading your academic workspace…</div>
        ) : role === 'faculty' && !isHome && !['Exam Schedule','Notifications','Syllabus','Academic Calendar'].includes(active) ? (
          <FacultyDashboard
            name={name}
            items={items}
            activeTab={isHome ? 'overview' : active}
            onNavigate={onNavigate}
          />
        ) : isHome ? (
          <>
            <section className="stats">
              {statLabels[role].map((label, index) => (
                <Stat key={label} label={label} value={statValues[index]} index={index} />
              ))}
            </section>

            {role === 'student' && (
              <StudentCalendarHighlight onNavigate={onNavigate} />
            )}

            <section className="panel dashboard-home-actions">
              <div className="panel-head" style={{ marginBottom: '6px' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#111827', margin: 0 }}>{role === 'student' ? 'Today' : 'All Sections'}</h2>
                  <p className="muted" style={{ fontSize: '12.5px', margin: '4px 0 0', color: '#6b7280' }}>
                    {role === 'student' ? 'Choose a task to continue. All other tools are in the menu.' : 'Open any of your portal sections below.'}
                  </p>
                </div>
              </div>
              <div className="compact-action-list">
                {(role === 'student' ? [
                  { title: 'Academic Calendar', desc: 'View official academic year calendar, semester schedules & holidays.' },
                  { title: 'Syllabus', desc: 'View course structures and official syllabus PDFs published by the academic coordinator.' },
                  { title: 'Exam Schedule', desc: 'View Mid-I, Mid-II internals & regular examination timetables.' },
                  { title: 'Digital ID', desc: 'View, customize, and print your official college digital ID card.' }
                ] : items.map(item => ({
                  title: item === 'Digital ID' ? 'Digital ID Card' : item,
                  desc: panelDescriptions[item] || 'Open workspace'
                }))).map(item => (
                  <button className="compact-action" key={item.title} onClick={() => onNavigate(item.title === 'Digital ID Card' ? 'Digital ID' : item.title)}>
                    <span>{item.title}</span>
                    <small>{item.desc}</small>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <Workspace
            role={role}
            title={active}
            data={data}
            student={student}
            name={name}
            canPublish={canPublish}
            canSessions={canSessions}
            reload={load}
            values={values}
            timetableAlerts={timetableAlerts}
          />
        )}
      </main>
      {/* Mobile Bottom Navigation */}
      <nav inert={mobileOpen} className="bottom-nav" aria-label="Mobile navigation">
        {mobileLinks.map(([label,target,Icon]) => <button key={target} className={active === target ? 'selected' : ''} aria-current={active === target ? 'page' : undefined} onClick={() => {onNavigate(target);setMobileOpen(false);}}><Icon/><span>{label}</span></button>)}
        <button className={mobileOpen ? 'selected' : ''} aria-label="All sections" aria-expanded={mobileOpen} aria-controls="portal-navigation" onClick={() => setMobileOpen(!mobileOpen)}><Menu/><span>All Sections</span></button>
      </nav>
    </div>
  );
}

// Workspace Component rendering active sub-modules
function Workspace({ role, title, data, student, name, canPublish, canSessions, reload, values, timetableAlerts }) {
  let content;

  const subjects = (data.subjects || []).map(x=>[x.code,x.name,x.department,x.faculty||'Not assigned']);
  const notices = (data.notices || []).map(x=>[x.title,x.category,new Date(x.published_at).toLocaleDateString(),x.description]);
  const studentAttendance = (student.attendance?.subjects || []).map(x=>[x.code,x.name,x.classes,x.present,x.percentage==null?'—':x.percentage+'%']);
  const studentAssignments = (student.assignments || []).map(x=>[x.title,x.subject,new Date(x.deadline).toLocaleString(),x.status]);
  const studentMarks = (student.marks || []).map(x=>[x.code,x.name,x.examination_type,x.score+'/'+x.maximum_score,x.percentage+'%']);

  // Routing
  if(title==='My Faculty'){
    content=<MyFaculty/>;
  } else if(title==='Responsibilities & Access'){
    content=<AccessResponsibilities/>;
  } else if(role==='student_coordinator'&&['Class Students','Class Attendance','Class Performance','Class Assignments','Class Information'].includes(title)){
    content=<CoordinatorWorkspace title={title}/>;
  } else if (title === 'Mark Attendance') {
    content = <StudentCheckIn/>;
  } else if (title === 'User Management') {
    content = <UserAccessManagement users={data.users || []} reload={reload} />;
  } else if (title === 'Timetable Management' || title.includes('Timetable') || title === 'Conflict Detection' || title.includes('Timetable Monitoring')) {
    content = <TimetableManagement role={role} rows={data.timetable} reload={reload} student={student} initialView={title === 'Conflict Detection' ? 'conflicts' : 'grid'} />;
  } else if (title === 'Class & Section Management') {
    content = <ClassSectionManagement />;
  } else if (title === 'Academic Reports') {
    content = <AcademicReports />;
  } else if (title === 'Academic Management') {
    content = <LiveAcademicManagement/>;
  } else if (title === 'Section Assignment') {
    content = <SectionAssignment/>;
  } else if (title === 'Attendance Monitoring') {
    content = <LiveAcademicReports/>;
  } else if (title.includes('Subject') || title.includes('Class Information')) {
    content = <Table columns={['Code', 'Subject Title', 'Department', 'Faculty Incharge']} rows={subjects} />;
  } else if (title === 'Attendance' && role === 'student') {
    content = <Table columns={['Course Code', 'Subject Title', 'Classes Held', 'Classes Attended', 'Attendance %']} rows={studentAttendance} />;
  } else if (title.includes('Assignments')) {
    content = <StudentAssignments assignments={student.assignments||[]} reload={reload}/>;
  } else if (title === 'Leave Requests' && role === 'student') {
    content = <LeaveRequests />;
  } else if (title.includes('Marks') || title.includes('Results')) {
    content = <Table columns={['Code', 'Subject Title', 'Assessment Type', 'Score', 'Percentage']} rows={studentMarks} />;
  } else if (title === 'Syllabus') {
    content = <SyllabusManagement role={role} />;
  } else if (title.includes('Calendar')) {
    content = <AcademicCalendarManagement role={role} />;
  } else if (title.includes('Exam') || title.includes('Schedule')) {
    content = <ExamScheduleManagement role={role} />;
  } else if (title.includes('Notice') || title.includes('Announcement')) {
    content = (
      <>
        <Table columns={['Circular Title', 'Category', 'Published Date', 'Details']} rows={notices} />
        <ReminderCenter role={role} />
        {canPublish && <NoticeForm onCreated={reload} />}
      </>
    );
  } else if (title.includes('Notification')) {
    content = (
      <>
        <div className="panel" style={{ padding: '0', boxShadow: 'none', border: '0', marginBottom: '16px' }}>
          <div className="alert-stack">
            {buildRoleNotifications(role, data, values).map(item => (
              <div key={item.id} className={`alert-row ${item.level}`}>
                <Bell />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <small>{item.meta}</small>
              </div>
            ))}
          </div>
        </div>
        <TimetableAlertSettings alerts={timetableAlerts} />
        <ReminderCenter role={role} />
      </>
    );
  } else if ((title.includes('Attendance') || title.includes('Session')) && canSessions) {
    content = <AttendanceControl subjects={data.subjects} onChanged={reload} />;
  } else if (title === 'Student Profile') {
    content = <StudentProfileView student={student} name={name} />;
  } else if (title.includes('Digital ID') || title === 'Digital ID') {
    content = <DigitalIdCard student={student} />;
  } else {
    content = (
      <>
        <Table columns={['Event Title', 'Category', 'Date & Time', 'Location']} rows={(data.events || []).map(x => [x.title, x.category, new Date(x.starts_at).toLocaleString(), x.location])} />
        <p className="muted" style={{ marginTop: '14px' }}>This workspace displays the official academic records and actions available to your role.</p>
      </>
    );
  }

  return (
    <section className="grid">
      <article className="panel span2">
        <div className="panel-head">
          <h2>{title}</h2>
          <button onClick={reload}><RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Refresh</button>
        </div>
        {content}
      </article>
    </section>
  );
}
