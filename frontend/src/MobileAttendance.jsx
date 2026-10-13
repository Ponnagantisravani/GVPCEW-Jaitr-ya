import {SubjectAttendanceControl,StudentSubjectAttendance} from './SubjectAttendance.jsx';
import {requestFaceEntry} from './face-entry.js';
import React, {useEffect, useRef, useState} from 'react';
import {api} from './api.js';
import {inCampusApp,openNativeAttendance} from './native-campus.js';
import {attendanceLabel, similarityLabel, monotonicNow, sessionDeadline, remainingSeconds, pollAttendanceRead} from './mobile-attendance.js';
import './mobile-attendance.css';
import {LocalFaceCamera} from './LocalFaceCamera.jsx';

const dateLabel = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : '—';
const sessionLabel = session => [session.section_name && `Section ${session.section_name}`, session.subject_name || `Period ${session.period}`, dateLabel(session.started_at || session.starts_at)].filter(Boolean).join(' · ');

function useAttendanceRead(path, interval = 0) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setError(''); setLoading(true);
    if (!path) {setLoading(false); return undefined;}
    return pollAttendanceRead({
      interval,
      read: signal => api.get(path, {signal}),
      onData: (data, timing) => {setResult({path, data, ...timing}); setError(''); setLoading(false);},
      onError: issue => {setError(issue.response?.data?.message || 'Attendance could not be refreshed. Check your connection and retry.'); setLoading(false); if ([401, 403, 404].includes(issue.response?.status)) setResult(null);},
    });
  }, [path, interval, refresh]);
  return {result: result?.path === path ? result : null, error, loading, retry: () => setRefresh(current => current + 1)};
}

function ReadError({resource}) {
  return resource.error ? <p className="error" role="alert">{resource.error} <button type="button" onClick={resource.retry}>Retry</button></p> : null;
}

function AttendanceTable({columns, rows, empty}) {
  return <div className="portal-table mobile-records"><table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map(({id, cells}) => <tr key={id}>{cells.map((cell, index) => <td key={columns[index]} data-label={columns[index]}>{cell ?? '—'}</td>)}</tr>) : <tr><td colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div>;
}

export function MobileAttendanceHistoryView({attendance = []}) {
  return <AttendanceTable columns={['Class', 'Started', 'Attendance', 'Method', 'Recorded']} empty="No mobile attendance sessions in your history yet." rows={attendance.map(row => ({id: row.session_id, cells: [row.subject_name || `Period ${row.period}`, dateLabel(row.starts_at), attendanceLabel(row), row.method || '—', dateLabel(row.created_at)]}))}/>;
}

export function MobileAttendanceHistory({guidance = false, demo = true}) {
  const demoConfig = useAttendanceRead('/local-attendance-demo/configuration');
  const demoMode = demoConfig.result?.data.enabled === true;
  const resource = useAttendanceRead(!demoConfig.loading && !demoMode ? '/attendance/history' : null, 15000);
  if (demoMode) return demo ? <LocalAttendanceDemo/> : null;
  return <section className="mobile-attendance">{demo && <LocalAttendanceDemo/>}<div className="portal-actions"><h3>My mobile attendance</h3><button type="button" onClick={resource.retry}>Refresh history</button></div>{guidance && <p className="mobile-attendance__guidance">Open the campus Android app to complete Bluetooth and face verification. If you miss the session, the app offers a brief late check-in after it closes.</p>}<p className="muted">Your own attendance results, including absences and late check-ins.</p><ReadError resource={resource}/>{resource.loading && !resource.result ? <p role="status">Loading your attendance…</p> : resource.result && <MobileAttendanceHistoryView attendance={resource.result.data.attendance || []}/>}</section>;
}

export function CoordinatorAttendanceView({session, seconds = 0}) {
  if (!session) return <p>No mobile attendance session has started for your assigned class yet.</p>;
  const open = session.status === 'open' && seconds > 0;
  const unmarked = Array.isArray(session.unmarked) ? session.unmarked : [];
  return <><div className="mobile-attendance__stats"><div><span>{open ? 'Time remaining' : 'Session'}</span><strong role="timer" aria-label="Attendance countdown">{open ? `${seconds}s` : 'Closed'}</strong></div><div><span>Marked</span><strong>{Number(session.present || 0) + Number(session.late || 0)}/{session.total || 0}</strong></div><div><span>Late</span><strong>{session.late || 0}</strong></div></div>{!open && <p className="muted">{session.final ? 'Attendance is final.' : 'The brief late check-in window remains open in the mobile app; counts may still change.'}</p>}<h4>{open ? 'Unmarked students' : 'Absent students'}</h4><AttendanceTable columns={['Roll number', 'Student']} rows={unmarked.map(row => ({id: row.student_id, cells: [row.roll_number, row.full_name]}))} empty={open ? 'Everyone on the session roster is marked.' : 'No absent students.'}/><p className="muted">The roster contains only students with approved mobile face enrollment. Counts are from the most recent successful refresh.</p></>;
}

export function CoordinatorMobileAttendance() {
  const demoConfig = useAttendanceRead('/local-attendance-demo/configuration');
  const demoMode = demoConfig.result?.data.enabled === true;
  const sessionsResource = useAttendanceRead(!demoConfig.loading && !demoMode ? '/attendance/sessions' : null, 4000), [selected, setSelected] = useState(''), [now, setNow] = useState(monotonicNow);
  const sessions = sessionsResource.result?.data.sessions || [];
  const selectedId = sessions.some(session => session.id === selected) ? selected : sessions[0]?.id || '';
  const statusResource = useAttendanceRead(selectedId ? `/attendance/session/${selectedId}/status` : null, 2000);
  const session = statusResource.result?.data;
  const seconds = session ? remainingSeconds(sessionDeadline(session, statusResource.result.receivedAt, statusResource.result.requestDurationMs), now) : 0;
  useEffect(() => {const timer = window.setInterval(() => setNow(monotonicNow()), 250); return () => window.clearInterval(timer);}, []);
  if (demoMode) return <><SubjectAttendanceControl/><details className="coordinator-session-details"><summary>Session roster &amp; face verification</summary><LocalAttendanceDemo coordinator subjectMode/></details><details className="coordinator-session-details"><summary>My attendance history</summary><StudentSubjectAttendance/></details></>;
  return <section className="mobile-attendance"><SubjectAttendanceControl/><LocalAttendanceDemo coordinator subjectMode/><h3>Mobile attendance session</h3>{inCampusApp()&&<button type="button" onClick={openNativeAttendance}>Open Bluetooth attendance</button>}<p className="mobile-attendance__guidance">Start attendance in the campus Android app on your bound phone so it can broadcast Bluetooth. Every student, including coordinators, completes their own face check in the app.</p><div className="portal-actions"><p className="muted">This dashboard shows your assigned class attendance. Sessions close automatically at the time limit selected by the coordinator.</p><button type="button" onClick={() => {sessionsResource.retry(); statusResource.retry();}}>Refresh status</button></div><ReadError resource={sessionsResource}/><ReadError resource={statusResource}/>{sessions.length > 0 && <label className="mobile-attendance__selector">Class session<select value={selectedId} onChange={event => setSelected(event.target.value)}>{sessions.map(row => <option key={row.id} value={row.id}>{sessionLabel(row)}</option>)}</select></label>}{sessionsResource.loading && !sessionsResource.result ? <p role="status">Loading class sessions…</p> : !selectedId ? <CoordinatorAttendanceView/> : statusResource.loading && !session ? <p role="status">Loading live attendance…</p> : session && <CoordinatorAttendanceView session={session} seconds={seconds}/>}<MobileAttendanceHistory demo={false}/></section>;
}

export function MobileAttendanceReportView({report}) {
  if (!report) return null;
  const {session, students = []} = report;
  return <section><h4>{sessionLabel(session)}</h4><p className="muted">{session.final ? 'Final report.' : 'The session is closed. Late check-ins can still update this report until ' + dateLabel(session.late_expires_at) + '.'}</p><AttendanceTable columns={['Roll number', 'Student', 'Attendance', 'Method', 'Similarity', 'Teacher review', 'Recorded']} rows={students.map(row => ({id: row.student_id, cells: [row.roll_number, row.full_name, attendanceLabel(row), row.method || '—', similarityLabel(row.similarity), row.review_required || row.is_late || row.method === 'fallback' ? 'Review required — late/fallback' : '—', dateLabel(row.created_at)]}))} empty="No students were eligible for this session roster."/></section>;
}

export function MobileAttendanceReports() {
  const sessionsResource = useAttendanceRead('/attendance/sessions', 10000), [selected, setSelected] = useState('');
  const sessions = (sessionsResource.result?.data.sessions || []).filter(session => session.status === 'closed');
  const selectedId = sessions.some(session => session.id === selected) ? selected : sessions[0]?.id || '';
  const reportResource = useAttendanceRead(selectedId ? `/attendance/session/${selectedId}/report` : null, 5000);
  return <section className="mobile-attendance"><div className="portal-actions"><h3>Mobile attendance reports</h3><button type="button" onClick={() => {sessionsResource.retry(); reportResource.retry();}}>Refresh reports</button></div><p className="muted">Read-only results for your authorized classes after the session closes. Late and fallback check-ins are flagged for teacher review.</p><ReadError resource={sessionsResource}/><ReadError resource={reportResource}/>{sessions.length > 0 && <label className="mobile-attendance__selector">Closed class session<select value={selectedId} onChange={event => setSelected(event.target.value)}>{sessions.map(row => <option key={row.id} value={row.id}>{sessionLabel(row)}</option>)}</select></label>}{sessionsResource.loading && !sessionsResource.result ? <p role="status">Loading available reports…</p> : !selectedId ? <p>No closed mobile sessions are available for your assigned classes.</p> : reportResource.loading && !reportResource.result ? <p role="status">Loading the attendance report…</p> : reportResource.result && <MobileAttendanceReportView report={reportResource.result.data}/>}</section>;
}


export function LocalAttendanceDemo({coordinator = false,subjectMode = false}) {
  const config = useAttendanceRead('/local-attendance-demo/configuration');
  const enabled = config.result?.data.enabled === true;
  const current = useAttendanceRead(enabled ? '/local-attendance-demo/current' : null, 1000);
  const options = useAttendanceRead(enabled && coordinator ? '/local-attendance-demo/sections' : null);
  const [duration,setDuration]=useState('60');
  const durationValid=Number.isInteger(Number(duration))&&Number(duration)>=30&&Number(duration)<=1800;
  const [section, setSection] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [now, setNow] = useState(monotonicNow);
  useEffect(() => {if (!enabled) return; const timer = window.setInterval(() => setNow(monotonicNow()), 250); return () => window.clearInterval(timer);}, [enabled]);
  if (!enabled) return null;
  const data = current.result?.data, session = data?.session, phase = data?.phase;
  const seconds = current.result ? Math.max(0, Math.ceil((Number(data?.remaining_ms || 0) - current.result.requestDurationMs - (now-current.result.receivedAt))/1000)) : 0;
  const sections = options.result?.data.sections || [], sectionId = section || sections[0]?.id || '';
  async function action(path, body) {
    setBusy(true); setMessage('');
    try {const response = await api.post('/local-attendance-demo/'+path, body);setMessage(path==='start'?'Demo session started. Open the student dashboard in a separate browser profile.':'Demo attendance saved: '+response.data.status);current.retry();}
    catch(error) {setMessage(error.response?.data?.message || 'The demo request failed. Check the backend connection.');current.retry();}
    finally {setBusy(false);}
  }
  const rows = data?.roster || [];
  return <section className="mobile-attendance local-attendance-demo" aria-label="Local browser attendance demo">
    <h3>Local browser attendance demo</h3>
    <p className="mobile-attendance__guidance">Local test: webcam face comparison and a heuristic blink check save separate demo attendance. Bluetooth, Play Integrity and production anti-spoofing are not tested.</p>
    <ReadError resource={current}/><ReadError resource={options}/>
    {coordinator && !subjectMode && <div className="portal-actions"><label>Assigned section <select value={sectionId} onChange={event=>setSection(event.target.value)} disabled={busy}>{sections.map(s=><option key={s.id} value={s.id}>Section {s.section_name} · Year {s.year_number}</option>)}</select></label><label>Time limit (seconds)<input type="number" min="30" max="1800" step="1" value={duration} onChange={e=>setDuration(e.target.value)} disabled={busy|| (!!session && phase!=='final')}/><small>30 seconds to 30 minutes</small></label><button type="button" disabled={busy || !durationValid || !sectionId || (!!session && phase!=='final')} onClick={()=>action('start',{section_id:sectionId,duration_seconds:Number(duration)})}>Start demo session</button></div>}
    {coordinator && !options.loading && !options.error && !sectionId && <p>Your account needs a coordinator assignment to its own section before starting.</p>}
    {current.loading && !data ? <p role="status">Loading demo session…</p> : !session ? <p>No demo session yet. Start one from the student coordinator dashboard.</p> : <>
      <dl className="attendance-session-details"><div><dt>Subject</dt><dd>{session.subject_name || 'Class attendance'}</dd></div><div><dt>Section</dt><dd>{session.department_name} · Year {session.year_number} · Section {session.section_name}</dd></div><div><dt>Classroom</dt><dd>{session.room_name || session.room_code || 'Not assigned'}</dd></div><div><dt>Batch</dt><dd>{session.batch_name || 'Full class'}</dd></div><div><dt>Periods</dt><dd>{session.covered_periods?.join(', ') || '—'}</dd></div><div><dt>Closes at</dt><dd>{dateLabel(session.expires_at)}</dd></div></dl>
      <p><strong>Section {session.section_name}</strong> · {phase==='main'?'Main check-in':phase==='late'?'Late check-in':'Finished'} · <span role="timer">{seconds}s</span></p>
      <p>Your demo attendance: <strong>{data.own_status || (data.eligible?'Not marked':'Not on this session roster')}</strong></p>
      
      {coordinator && <><p><strong>{rows.filter(r=>['PRESENT','LATE'].includes(r.status)).length}/{rows.length}</strong> marked · {rows.filter(r=>r.status==='LATE').length} late · {rows.filter(r=>r.status==='ABSENT').length} absent</p><AttendanceTable columns={['Roll number','Student','Demo attendance']} rows={rows.map((r,index)=>({id:r.roll_number || index,cells:[r.roll_number,r.full_name,r.status]}))} empty="No active students in this section."/></>}
    </>}
    <LocalFaceCamera autoOpen={!coordinator} enrolled={config.result?.data.face_enrolled === true} sessionId={session?.id} sectionName={session?.section_name} phase={phase} canCheckIn={!!data?.eligible && (!data.own_status || data.own_status==='ABSENT') && phase!=='final' && seconds>0} onSaved={()=>{config.retry();current.retry();}}/>
    {message && <p role="status">{message}</p>}
    <button type="button" onClick={current.retry}>Refresh demo</button>
  </section>;
}

export function LocalAttendanceAlerts({onOpen}) {
 const config=useAttendanceRead('/local-attendance-demo/configuration');
 const current=useAttendanceRead(config.result?.data.enabled===true?'/local-attendance-demo/current':null,1000);
 const seen=useRef(null),[permission,setPermission]=useState(()=>typeof Notification==='undefined'?'unsupported':Notification.permission);
 const data=current.result?.data,session=data?.session;
 const eligible=!!session&&data?.eligible&&data?.phase==='main'&&Number(data.remaining_ms)>0&&!['PRESENT','LATE'].includes(data.own_status);
 const latest=useRef(null);latest.current={session,eligible,onOpen};
 function enter(){const state=latest.current;if(!state?.eligible)return;requestFaceEntry(state.session.id);state.onOpen();}
 useEffect(()=>{if(!eligible||seen.current===session.id)return;seen.current=session.id;if(typeof Notification==='undefined'||Notification.permission!=='granted')return;const alert=new Notification('Class attendance is open',{body:'Tap to open your camera and blink once for Section '+session.section_name,tag:'campus-attendance-'+session.id});alert.onclick=()=>{window.focus();enter();alert.close();};return()=>alert.close();},[eligible,session?.id]);
 if(!eligible)return null;
 return <aside className="attendance-alert" aria-label="Attendance notification"><p><strong>Attendance is open · Section {session.section_name}</strong><br/>Tap to open your camera and blink once.</p><button onClick={enter}>Start Face Verification</button>{permission==='default'&&<button onClick={async()=>setPermission(await Notification.requestPermission())}>Enable attendance notifications</button>}</aside>;
}
