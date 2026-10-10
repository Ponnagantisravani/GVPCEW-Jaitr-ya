import {MonthlyAttendance} from './MonthlyAttendance.jsx';
import {UploadedAttendance} from './UploadedAttendance.jsx';
import {WeeklyAttendance} from './WeeklyAttendance.jsx';
import {WeeklyTimetable} from './WeeklyTimetable.jsx';
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {DataTable,errorMessage,NotificationCenter} from './LiveWorkspaces.jsx';

const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const displayTime = value => String(value || '').slice(0, 5);

function PublishedTimetable({endpoint,fallbackEndpoint,title,description}){
 const [rows,setRows]=useState([]),[documents,setDocuments]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=async()=>{
  setError('');
  try { let response; try { response=await api.get(endpoint); } catch(error) { if(error.response?.status!==404||!fallbackEndpoint) throw error; response=await api.get(fallbackEndpoint); } setRows(response.data.timetable || []);setDocuments(response.data.documents || []); }
  catch(e){setError(errorMessage(e));}
  finally{setLoading(false);}
 };
 useEffect(()=>{
  load();
  const refresh=()=>load();
  const timer=window.setInterval(refresh,60000);
  window.addEventListener('focus',refresh);
  window.addEventListener('timetable-published',refresh);
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('timetable-published',refresh);};
 },[endpoint]);
 if(loading)return <section className="panel"><p role="status">Preparing your timetable from published student class schedules…</p></section>;
 if(error)return <section className="panel"><p role="alert">{error}</p><button onClick={load}>Retry</button></section>;
 return <>
  <div className="section-heading"><div><h2>{title}</h2><p className="muted">{description}</p></div><button onClick={load}>Refresh</button></div>
  {rows.length ? <WeeklyTimetable rows={rows} documents={documents} facultyView={endpoint==='/timetables/faculty'} onRefresh={load}/> : <section className="panel"><h3>No published classes yet</h3><p className="muted">Your timetable will appear automatically when the academic coordinator publishes a student timetable entry assigned to you.</p></section>}
 </>;
}

function TimetableCards({active,onSelect}){
 const cards=[['students','Student Timetable','View the complete published timetable that students see for every section you teach.'],['faculty','Faculty Timetable','View only your teaching periods, rooms, subjects, and sections.']];
 return <section className="attendance-card-grid timetable-card-grid">{cards.map(([id,title,description])=><button type="button" key={id} className={'attendance-card '+(active===id?'attendance-card--active':'')} onClick={()=>onSelect(id)}><span className="attendance-card__tag">{id==='students'?'Class view':'My schedule'}</span><strong>{title}</strong><p>{description}</p><span className="attendance-card__action">View timetable →</span></button>)}</section>;
}

function AssignmentCards({active,onSelect}){
 const cards=[['enter','Enter Assignment Marks','Record or update the assignment score for your selected students.','Enter marks'],['view','View All Assignment Marks','Open the class assignment-mark register with totals and percentages.','View register']];
 return <section className="attendance-card-grid timetable-card-grid">{cards.map(([id,title,description,action])=><button type="button" key={id} className={'attendance-card '+(active===id?'attendance-card--active':'')} onClick={()=>onSelect(id)}><span className="attendance-card__tag">{id==='enter'?'Marking':'Reports'}</span><strong>{title}</strong><p>{description}</p><span className="attendance-card__action">{action} →</span></button>)}</section>;
}

function AssignmentMarksRegister({students,marks,subject,classAssignment}){
 const assignmentMarks=new Map(marks.filter(mark=>mark.examination_type==='assignment').map(mark=>[mark.student_id,mark]));
 return <section className="monthly-register assignment-register"><div className="monthly-register__head"><h3><span aria-hidden="true">▣</span>Assignment Marks{subject?' - '+subject.name:''}{classAssignment?' | '+classAssignment.department+' — Section '+classAssignment.section_name:''}</h3><button type="button" onClick={()=>window.print()}>Print Register</button></div><div className="portal-table monthly-register__table"><table><thead><tr><th>S.No.</th><th>Roll Number</th><th>Name</th>{[1,2,3].map(number=><th key={number}>Assignment {number}<br/><small>(10)</small></th>)}<th>Total<br/><small>(30)</small></th><th>%</th></tr></thead><tbody>{students.map((student,index)=>{
  const mark=assignmentMarks.get(student.id),scores=Array.isArray(mark?.assignment_scores)&&mark.assignment_scores.length===3?mark.assignment_scores:null;
  const total=scores?scores.reduce((sum,score)=>sum+Number(score??0),0):null;
  const percent=total!==null?100*total/30:mark&&Number(mark.maximum_score)>0?100*Number(mark.score)/Number(mark.maximum_score):null;
  return <tr key={student.id}><td>{index+1}</td><th scope="row">{student.roll_number}</th><td>{student.full_name||'—'}</td>{[0,1,2].map(position=><td key={position}>{scores?.[position]??'—'}</td>)}<td className="assignment-register__total">{total??'—'}</td><td className={percent===null?'':percent<75?'assignment-register__low':'assignment-register__good'}>{percent===null?'—':percent.toFixed(2)+'%'}</td></tr>;
 })}{!students.length&&<tr><td colSpan="8">No students match your filters.</td></tr>}</tbody></table></div></section>;
}

const leaveDate = value => {
 const [year, month, day] = String(value || '').slice(0, 10).split('-');
 return year && month && day ? `${Number(day)}/${Number(month)}/${year}` : '—';
};

function StudentLeaveRequests({leaves, busy, onRefresh, onAction}){
 const decide = (request, action) => {
  const labels = { approved: 'Optional approval note:', rejected: 'Reason for rejecting this leave request:', message: 'What details do you need from the student?' };
  const note = window.prompt(labels[action], '');
  if (note !== null) onAction(request, action, note);
 };
 return <section className="leave-requests">
  <header className="leave-requests__header">
   <div><h3><span className="leave-requests__icon" aria-hidden="true"/>Student Leave Requests</h3><p>Review applications or ask the student for more details.</p></div>
   <button type="button" className="leave-requests__refresh" onClick={onRefresh} disabled={busy}>Refresh</button>
  </header>
  <div className="leave-requests__list">
   {leaves.length ? leaves.map(request => <article className={'leave-request leave-request--'+request.status} key={request.id}>
    <div className="leave-request__topline"><p><strong>{request.student_name}</strong><span> · {request.roll_number} · Section {request.section}</span></p><span className="leave-request__status">{request.status}</span></div>
    <p className="leave-request__summary"><strong>Leave:</strong> {leaveDate(request.start_date)} to {leaveDate(request.end_date)} <span>·</span> {request.reason}</p>
    {request.status === 'pending' ? <div className="leave-request__actions">
     <button type="button" className="leave-request__approve" disabled={busy} onClick={()=>decide(request,'approved')}>Approve</button>
     <button type="button" className="leave-request__reject" disabled={busy} onClick={()=>decide(request,'rejected')}>Reject</button>
     <button type="button" className="leave-request__details" disabled={busy} onClick={()=>decide(request,'message')}>Request Details</button>
    </div> : <p className="leave-request__review"><strong>{request.status === 'approved' ? 'Approved' : 'Rejected'}.</strong>{request.reviewer_note ? ` ${request.reviewer_note}` : ''}</p>}
   </article>) : <p className="leave-requests__empty">No leave requests are available for your assigned students.</p>}
  </div>
 </section>;
}

function AttendanceCards({active,onSelect}){
 const cards=[['daily','Daily Attendance','Mark or update attendance for one class date.','Daily entry'],['weekly','Weekly Attendance','Review attendance across the selected Monday–Saturday week.','Weekly register'],['monthly','Monthly Attendance','View the full calendar register and printable totals.','Monthly register']];
 return <section className="attendance-card-grid">{cards.map(([id,title,description,action])=><button type="button" key={id} className={'attendance-card '+(active===id?'attendance-card--active':'')} onClick={()=>onSelect(id)}><span className="attendance-card__tag">{id==='daily'?'Today':id==='weekly'?'This week':'This month'}</span><strong>{title}</strong><p>{description}</p><span className="attendance-card__action">{action} →</span></button>)}</section>;
}

export function FacultyDashboard({name,activeTab='overview',onNavigate,items=[]}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [subject,setSubject]=useState(''),[room,setRoom]=useState(''),[date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA')),[section,setSection]=useState(''),[search,setSearch]=useState('');
 const [attendanceView,setAttendanceView]=useState(''),[timetableView,setTimetableView]=useState(''),[assignmentView,setAssignmentView]=useState('view');
 const [attendanceLoading,setAttendanceLoading]=useState(false),[attendance,setAttendance]=useState({}),[scores,setScores]=useState({}),[examType,setExamType]=useState('mid_1'),[maximum,setMaximum]=useState('30');
 const [assignment,setAssignment]=useState({title:'',description:'',deadline:''}),[submissions,setSubmissions]=useState(null),[leaves,setLeaves]=useState([]),[announcementTargets,setAnnouncementTargets]=useState([]);
 const [request,setRequest]=useState({kind:'correction',details:''}),[announcement,setAnnouncement]=useState({title:'',description:'',departmentId:'',sectionId:''});
 const load=async()=>{
  try{setError('');const [r,l]=await Promise.all([api.get('/faculty/workspace'),api.get('/faculty/leave-requests')]);setData(r.data);setLeaves(l.data.requests);const first=r.data.classAssignments?.[0];setSection(current=>current||first?.section_id||'');setSubject(current=>current||first?.subject_id||'');setRoom(current=>current||r.data.classrooms[0]?.id||'');}
  catch(e){setError(errorMessage(e));}
 };
 useEffect(()=>{
  load();
  const refresh=()=>load();
  const timer=window.setInterval(refresh,60000);
  window.addEventListener('focus',refresh);
  window.addEventListener('timetable-published',refresh);
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('timetable-published',refresh);};
 },[]);
 useEffect(()=>{if(activeTab==='Attendance')setAttendanceView('');},[activeTab]);
 useEffect(()=>{if(activeTab==='My Timetable')setTimetableView('');},[activeTab]);
 useEffect(()=>{if(activeTab==='Assignments')setAssignmentView('view');},[activeTab]);
 useEffect(()=>{setAssignment(current=>({...current,sectionId:section}));},[section]);
 const loadAnnouncementTargets=async()=>{
  try{const response=await api.get('/faculty/announcement-targets');const targets=response.data.targets||[];setAnnouncementTargets(targets);setAnnouncement(current=>{const first=targets[0];return first&&!current.departmentId?{...current,departmentId:first.department_id,sectionId:first.section_id}:current;});}
  catch(e){setError(errorMessage(e));}
 };
 useEffect(()=>{if(activeTab==='Class Announcements')loadAnnouncementTargets();},[activeTab]);
 useEffect(()=>{
  setAttendance({});
  if(!subject){setAttendanceLoading(false);return;}
  let active=true;setAttendanceLoading(true);
  if(!section){setAttendanceLoading(false);return;}api.get('/faculty/attendance',{params:{subjectId:subject,sectionId:section,date}}).then(r=>{if(active)setAttendance(Object.fromEntries(r.data.attendance.map(x=>[x.student_id,x.status])));}).catch(e=>{if(active)setError(errorMessage(e));}).finally(()=>{if(active)setAttendanceLoading(false);});
  return()=>{active=false;};
 },[subject,section,date]);
 useEffect(()=>{
  const marks=(data?.marks||[]).filter(x=>x.subject_id===subject&&x.examination_type===examType);
  setScores(Object.fromEntries(marks.map(x=>[x.student_id,String(x.score)])));
  setMaximum(String(marks[0]?.maximum_score||30));
 },[data,subject,examType]);
 async function act(fn,text='Changes saved.'){setBusy(true);setError('');setNotice('');try{await fn();await load();setNotice(text);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 if(!data)return <section className="panel"><p role={error?'alert':'status'}>{error||'Loading your teaching workspace…'}</p>{error&&<button onClick={()=>{setError('');load();}}>Retry</button>}</section>;
 const students=data.students.filter(x=>(!subject||x.subject_ids?.includes(subject))&&(!section||x.academic_section_id===section)&&(!search||(x.roll_number+' '+x.full_name).toLowerCase().includes(search.toLowerCase())));
 const studentName=id=>data.students.find(s=>s.id===id)?.full_name||'Student';
 const announcementDepartments=[...new Map(announcementTargets.map(target=>[target.department_id,target.department])).entries()].map(([id,label])=>({id,label}));
 const announcementSections=announcementTargets.filter(target=>target.department_id===announcement.departmentId);
 const selectors=<div className="portal-form"><label>Assigned class / section<select value={section} onChange={e=>{const next=e.target.value;setSection(next);setSubject(data.classAssignments.find(item=>item.section_id===next)?.subject_id||'');}}><option value="">Choose assigned class</option>{[...new Map(data.classAssignments.map(item=>[item.section_id,item])).values()].map(item=><option key={item.section_id} value={item.section_id}>{item.department} · Year {item.year_number} · Section {item.section_name}</option>)}</select></label><label>Subject<select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">Choose subject</option>{data.classAssignments.filter(item=>!section||item.section_id===section).map(item=><option key={item.id} value={item.subject_id}>{item.code} — {item.subject}</option>)}</select></label><label>Search students<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or roll number"/></label></div>;
 let content;
 if(activeTab==='overview')content=<>{selectors}<StudentLeaveRequests leaves={leaves} busy={busy} onRefresh={load} onAction={(leave,action,note)=>act(()=>api.patch('/faculty/leave-requests/'+leave.id,{action,note}),'Leave request updated.')}/><AssignmentMarksRegister students={students} marks={data.marks.filter(mark=>mark.subject_id===subject)} subject={data.subjects.find(item=>item.id===subject)} classAssignment={data.classAssignments.find(item=>item.section_id===section&&item.subject_id===subject)}/></>;
 else if(activeTab==='My Profile')content=<><h2>My Profile</h2><p>{name}</p><p>Employee code: {data.profile.employee_code}</p><p>Department: {data.profile.department||'Not assigned'}</p><p>{data.profile.email}</p></>;
 else if(activeTab==='My Subjects')content=<DataTable columns={['Course code','Subject']} rows={data.subjects.map(s=>[s.code,s.name])}/>;
 else if(activeTab==='My Classes')content=<><h2>My assigned classes</h2><p className="muted">Classes assigned by the Academic Coordinator.</p><section className="attendance-card-grid timetable-card-grid">{data.classAssignments.map(item=><button type="button" className="attendance-card" key={item.id} onClick={()=>{setSection(item.section_id);setSubject(item.subject_id);onNavigate('My Students');}}><span className="attendance-card__tag">{item.department} · Year {item.year_number}</span><strong>{item.department}-{item.section_name}</strong><p>{item.code} · {item.subject}</p><span className="attendance-card__action">{item.students} Students →</span></button>)}</section>{!data.classAssignments.length&&<p className="muted">No class assignments are active for your account.</p>}</>;
 else if(activeTab==='My Timetable')content=<><TimetableCards active={timetableView} onSelect={setTimetableView}/>{timetableView==='students'&&<PublishedTimetable endpoint="/timetables/faculty/student-view" fallbackEndpoint="/timetables/faculty" title="Student Timetable" description="Published class schedules for the sections you teach, including periods handled by other faculty."/>}{timetableView==='faculty'&&<PublishedTimetable endpoint="/timetables/faculty" title="Faculty Timetable" description="Your teaching schedule generated automatically from published student timetables."/>}</>;
 else if(activeTab==='Attendance')content=!attendanceView?<><AttendanceCards active={attendanceView} onSelect={setAttendanceView}/><UploadedAttendance/></>:<><div className="section-heading"><div><h2>{attendanceView[0].toUpperCase()+attendanceView.slice(1)} Attendance</h2><p className="muted">Choose the subject, section, and students for this attendance register.</p></div><button type="button" onClick={()=>setAttendanceView('')}>← Back to attendance views</button></div>{selectors}{attendanceView==='daily'&&<section className="daily-attendance"><h3>Daily attendance entry</h3><div className="portal-form"><label>Date<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>Classroom<select value={room} onChange={e=>setRoom(e.target.value)}><option value="">Choose classroom</option>{data.classrooms.map(x=><option key={x.id} value={x.id}>{x.room_code}</option>)}</select></label></div><p className="muted">Choose a status for each student you want to record. Existing records are shown for the selected date.</p><DataTable columns={['Roll number','Student','Section','Status']} rows={students.map(x=>[x.roll_number,x.full_name,x.section,<select disabled={attendanceLoading} aria-label={'Attendance for '+x.roll_number} value={attendance[x.id]||''} onChange={e=>setAttendance({...attendance,[x.id]:e.target.value})}><option value="">Not recorded</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option></select>])}/><button disabled={busy||attendanceLoading||!subject||!room||!students.some(s=>attendance[s.id])} onClick={()=>act(()=>api.post('/faculty/attendance',{subjectId:subject,classroomId:room,date,entries:students.filter(s=>attendance[s.id]).map(s=>({studentId:s.id,status:attendance[s.id]}))}),'Attendance saved to student records.')}>Save daily attendance</button></section>}{attendanceView==='weekly'&&<WeeklyAttendance sectionId={section} subjectId={subject} subject={data.subjects.find(item=>item.id===subject)} students={students} refreshKey={data}/>} {attendanceView==='monthly'&&<MonthlyAttendance sectionId={section} classAssignment={data.classAssignments.find(item=>item.section_id===section&&item.subject_id===subject)} classroom={data.classrooms.find(item=>item.id===room)} subjectId={subject} subject={data.subjects.find(item=>item.id===subject)} students={students} refreshKey={data}/>}</>;
 else if(activeTab==='Marks')content=<>{selectors}<div className="portal-form"><label>Assessment<select value={examType} onChange={e=>setExamType(e.target.value)}>{['assignment','internal','mid_1','mid_2','semester'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label><label>Maximum marks<input type="number" min="1" max="1000" value={maximum} onChange={e=>setMaximum(e.target.value)}/></label></div><DataTable columns={['Roll number','Student','Score']} rows={students.map(x=>[x.roll_number,x.full_name,<input aria-label={'Marks for '+x.roll_number} type="number" min="0" max={maximum} step="0.01" value={scores[x.id]??''} onChange={e=>setScores({...scores,[x.id]:e.target.value})}/>])}/><button disabled={busy||!subject||!students.some(s=>scores[s.id]!==undefined&&scores[s.id]!=='')} onClick={()=>act(()=>api.post('/faculty/marks',{subjectId:subject,type:examType,maximum:Number(maximum),entries:students.filter(s=>scores[s.id]!==undefined&&scores[s.id]!=='').map(s=>({studentId:s.id,score:Number(scores[s.id])}))}),'Marks saved to student records.')}>Save marks</button></>;
 else if(activeTab==='Assignments')content=<><AssignmentCards active={assignmentView} onSelect={view=>{setAssignmentView(view);if(view==='enter')setExamType('assignment');}}/>{assignmentView&&selectors}{assignmentView==='enter'&&<><h3>Enter Assignment Marks</h3><div className="portal-form"><label>Maximum marks<input type="number" min="1" max="1000" value={maximum} onChange={e=>setMaximum(e.target.value)}/></label></div><DataTable columns={['Roll number','Student','Score']} rows={students.map(x=>[x.roll_number,x.full_name,<input aria-label={'Assignment marks for '+x.roll_number} type="number" min="0" max={maximum} step="0.01" value={scores[x.id]??''} onChange={e=>setScores({...scores,[x.id]:e.target.value})}/>])}/><button disabled={busy||!subject||!students.some(student=>scores[student.id]!==undefined&&scores[student.id]!=='')} onClick={()=>act(()=>api.post('/faculty/marks',{subjectId:subject,type:'assignment',maximum:Number(maximum),entries:students.filter(student=>scores[student.id]!==undefined&&scores[student.id]!=='').map(student=>({studentId:student.id,score:Number(scores[student.id])}))}),'Assignment marks saved.')}>Save assignment marks</button><form className="portal-form" onSubmit={e=>{e.preventDefault();act(async()=>{await api.post('/faculty/assignments',{...assignment,subjectId:subject,deadline:new Date(assignment.deadline).toISOString()});setAssignment({title:'',description:'',deadline:''});},'Assignment published.');}}><label>Assignment title<input required maxLength={200} value={assignment.title} onChange={e=>setAssignment({...assignment,title:e.target.value})}/></label><label>Instructions<textarea maxLength={10000} value={assignment.description} onChange={e=>setAssignment({...assignment,description:e.target.value})}/></label><label>Deadline<input required type="datetime-local" value={assignment.deadline} onChange={e=>setAssignment({...assignment,deadline:e.target.value})}/></label><button disabled={busy||!subject}>Publish assignment</button></form></>}{assignmentView==='view'&&<AssignmentMarksRegister students={students} marks={data.marks.filter(mark=>mark.subject_id===subject)} subject={data.subjects.find(item=>item.id===subject)} classAssignment={data.classAssignments.find(item=>item.section_id===section&&item.subject_id===subject)}/>}</>;
 else if(activeTab==='My Students')content=<>{selectors}<DataTable columns={['Roll number','Student','Department','Section']} rows={students.map(x=>[x.roll_number,x.full_name,x.department,x.section])}/></>;
 else if(activeTab==='Student Performance'||activeTab==='Academic Reports')content=<>{selectors}<h3>Recorded assessment results</h3><DataTable columns={['Student','Assessment','Score','Maximum','Percentage']} rows={data.marks.filter(x=>(!subject||x.subject_id===subject)&&students.some(s=>s.id===x.student_id)).map(x=>[studentName(x.student_id),x.examination_type,x.score,x.maximum_score,(100*Number(x.score)/Number(x.maximum_score)).toFixed(1)+'%'])}/><button onClick={()=>window.print()}>Print results</button></>;
 else if(activeTab==='Leave & Substitution'||activeTab==='Attendance Corrections')content=<>{activeTab==='Leave & Substitution'&&<StudentLeaveRequests leaves={leaves} busy={busy} onRefresh={load} onAction={(leave,action,note)=>act(()=>api.patch('/faculty/leave-requests/'+leave.id,{action,note}),'Leave request updated.')}/>}
 <h3>Request an academic coordinator review</h3><form className="portal-form" onSubmit={e=>{e.preventDefault();act(async()=>{await api.post('/faculty/requests',request);setRequest({...request,details:''});},'Request sent for coordinator review.');}}><label>Request type<select value={request.kind} onChange={e=>setRequest({...request,kind:e.target.value})}><option value="correction">Attendance correction</option><option value="substitution">Leave / substitution</option></select></label><label>Details<textarea required minLength={10} maxLength={4000} value={request.details} onChange={e=>setRequest({...request,details:e.target.value})}/></label><button disabled={busy}>Submit request</button></form><DataTable columns={['Type','Details','Status','Review note']} rows={data.requests.map(x=>[x.kind,x.details,x.status,x.reviewer_note])}/></>;
 else if(activeTab==='Class Announcements')content=<form className="portal-form" onSubmit={e=>{e.preventDefault();act(async()=>{await api.post('/notices',{...announcement,category:'academic'});setAnnouncement(current=>({...current,title:'',description:''}));},'Announcement published for the selected class.');}}><label>Department<select required value={announcement.departmentId} onChange={e=>{const departmentId=e.target.value;const first=announcementTargets.find(target=>target.department_id===departmentId);setAnnouncement({...announcement,departmentId,sectionId:first?.section_id||''});}}><option value="">Choose department</option>{announcementDepartments.map(department=><option key={department.id} value={department.id}>{department.label}</option>)}</select></label><label>Section<select required value={announcement.sectionId} onChange={e=>setAnnouncement({...announcement,sectionId:e.target.value})} disabled={!announcement.departmentId}><option value="">Choose section</option>{announcementSections.map(target=><option key={target.section_id} value={target.section_id}>Year {target.year_number} · Sem {target.semester_number} · Section {target.section_name} ({target.academic_year})</option>)}</select></label><label>Title<input required maxLength={200} value={announcement.title} onChange={e=>setAnnouncement({...announcement,title:e.target.value})}/></label><label>Announcement<textarea required maxLength={10000} value={announcement.description} onChange={e=>setAnnouncement({...announcement,description:e.target.value})}/></label><p className="muted">Only students in the selected department and section will receive this announcement.</p><button disabled={busy||!announcement.departmentId||!announcement.sectionId}>Publish announcement</button></form>;
 else content=<p>Select a teaching task from the menu.</p>;
 return <section className="panel portal-workspace">{error&&<p role="alert" className="error">{error}</p>}{notice&&<p className="portal-notice" role="status">{notice}</p>}{content}</section>;
}
