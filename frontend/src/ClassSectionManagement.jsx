import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {errorMessage} from './LiveWorkspaces.jsx';
const ordinal=y=>`${y}${y===1?'st':y===2?'nd':y===3?'rd':'th'} Year`;
const code=name=>String(name||'').split(/\s+/).map(x=>x[0]).join('').slice(0,5).toUpperCase();
function Card({title,meta,value,onClick}){return <button type="button" className="class-section-card" onClick={onClick}><div className="class-section-card__top"><span>{title}</span><small>{meta}</small></div><strong>{title}</strong><div className="class-section-card__footer"><b>{value}</b><em>Open</em></div></button>;}
export function ClassSectionManagement(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[departmentId,setDepartmentId]=useState(''),[year,setYear]=useState(''),[sectionId,setSectionId]=useState(''),[assignments,setAssignments]=useState([]),[subjectId,setSubjectId]=useState(''),[facultyId,setFacultyId]=useState(''),[assignmentsReady,setAssignmentsReady]=useState(false),[adding,setAdding]=useState(false),[form,setForm]=useState({name:'',code:'',subjectType:'theory',credits:'',semesterNumber:''}),[busy,setBusy]=useState(false);
 const load=async()=>{try{const r=await api.get('/management/catalog');setData(r.data);setError('');}catch(e){setError(errorMessage(e));}};useEffect(()=>{load();},[]);
 useEffect(()=>{
  let current=true;
  setAssignments([]);setAssignmentsReady(false);setSubjectId('');setFacultyId('');setError('');setNotice('');setAdding(false);
  if(sectionId)api.get(`/faculty-assignments/sections/${sectionId}`).then(r=>{if(current){setAssignments(r.data.assignments||[]);setAssignmentsReady(true);}}).catch(e=>{if(current)setError(errorMessage(e));});
  return ()=>{current=false;};
 },[sectionId]);
 if(!data)return <section className="panel"><p>{error||'Loading class and section management...'}</p></section>;
 const dept=data.departments.find(x=>x.id===departmentId),section=data.sections.find(x=>x.id===sectionId),sections=data.sections.filter(x=>x.department_id===departmentId),yearSections=sections.filter(x=>Number(x.year_number)===Number(year)),sectionSubjects=(data.sectionSubjects||[]).filter(x=>x.section_id===sectionId),faculty=section?data.faculty.filter(x=>x.department_id===section.department_id):[],bySubject=new Map(assignments.map(x=>[x.subject_id,x]));
 const reset=()=>{setDepartmentId('');setYear('');setSectionId('');};
 async function refreshSection(){setError('');setNotice('');setAssignmentsReady(false);await load();try{const r=await api.get(`/faculty-assignments/sections/${sectionId}`);setAssignments(r.data.assignments||[]);setAssignmentsReady(true);}catch(e){setError(errorMessage(e));}}
 async function saveFaculty(e){
  e.preventDefault();if(!assignmentsReady||busy)return;
  const old=bySubject.get(subjectId);if(!facultyId&&!old)return;
  setBusy(true);setError('');setNotice('');
  try{
   let saved;
   if(!facultyId)await api.delete(`/faculty-assignments/${old.id}`);
   else if(old)await api.patch(`/faculty-assignments/${old.id}`,{facultyId});
   else saved=await api.post('/faculty-assignments',{facultyId,sectionId,subjectId});
   setAssignments(previous=>[...previous.filter(x=>x.subject_id!==subjectId),...(facultyId?[{...old,id:old?.id||saved.data.id,subject_id:subjectId,faculty_id:facultyId,faculty_name:faculty.find(x=>x.id===facultyId)?.full_name}]:[])]);
   setNotice(`Faculty ${facultyId?'assignment saved':'assignment removed'} for ${dept.name}, Section ${section.section_name}.`);
  }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 }
 async function addSubject(e){e.preventDefault();setBusy(true);try{await api.post(`/management/sections/${sectionId}/subjects`,{...form,credits:form.credits===''?null:Number(form.credits),semesterNumber:Number(form.semesterNumber||section.semester_number)});setForm({name:'',code:'',subjectType:'theory',credits:'',semesterNumber:''});setAdding(false);await load();setNotice('Subject added to this section.');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 if(!departmentId)return <section className="class-section-overview"><div className="class-section-overview__header"><div><h2>Class &amp; Section Management</h2><p className="muted">Choose a department.</p></div><button onClick={load}>Refresh</button></div><div className="class-section-grid">{data.departments.map(x=>{const list=data.sections.filter(s=>s.department_id===x.id),students=list.reduce((n,s)=>n+Number(s.students||0),0),subjects=(data.sectionSubjects||[]).filter(s=>list.some(v=>v.id===s.section_id)).length;return <Card key={x.id} title={x.name} meta={`${list.length} sections · ${subjects} section subjects`} value={`${students} students`} onClick={()=>setDepartmentId(x.id)}/>;})}</div></section>;
 if(!year)return <section className="class-section-overview"><button onClick={reset}>Back to departments</button><h2>{dept?.name}</h2>{!sections.length&&<p>No sections are configured for this department yet.</p>}<div className="class-section-grid">{[...new Set(sections.map(s=>Number(s.year_number)))].sort((a,b)=>a-b).map(n=>{const list=sections.filter(s=>Number(s.year_number)===n);return <Card key={n} title={ordinal(n)} meta={`${list.length} sections`} value={`${list.reduce((sum,s)=>sum+Number(s.students||0),0)} students`} onClick={()=>setYear(String(n))}/>;})}</div></section>;
 if(!sectionId)return <section className="class-section-overview"><button onClick={()=>setYear('')}>Back to years</button><h2>{dept?.name} · {ordinal(Number(year))}</h2><p className="muted">Choose a section to view its subject cards.</p>{!yearSections.length&&<p>No sections are configured for this year. Go back and choose an available year.</p>}<div className="class-section-grid">{yearSections.map(x=><Card key={x.id} title={`${code(dept?.name)}-${x.section_name}`} meta={`Semester ${x.semester_number} / ${(data.sectionSubjects||[]).filter(s=>s.section_id===x.id).length} subjects`} value={`${x.students||0} students`} onClick={()=>setSectionId(x.id)}/>)}</div></section>;
 const selectedSubject=sectionSubjects.find(s=>s.subject_id===subjectId),currentAssignment=bySubject.get(subjectId);
 return <section className="portal-workspace"><div className="class-section-catalog-header"><div><button disabled={busy} onClick={()=>{if(subjectId){setSubjectId('');setNotice('');setError('');}else setSectionId('');}}>{subjectId?'Back to subjects':'Back to sections'}</button><h2>{dept?.name} · {ordinal(section.year_number)} · Section {section.section_name}</h2></div><button disabled={busy} onClick={refreshSection}>Refresh</button></div>{error&&<p className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}{selectedSubject?<section className="panel">
 <h3>{selectedSubject.code} - {selectedSubject.name}</h3>
 <p className="muted">{dept?.name} / {ordinal(section.year_number)} / Section {section.section_name} / Semester {section.semester_number}</p>
 <p>Current faculty: <strong>{currentAssignment?.faculty_name||'Not assigned'}</strong></p>
 <form className="portal-form" onSubmit={saveFaculty}>
  <label>Faculty<select value={facultyId} disabled={busy||!assignmentsReady} onChange={e=>setFacultyId(e.target.value)}>
   <option value="">{currentAssignment?'Unassign faculty':'Choose faculty'}</option>
   {faculty.map(f=><option key={f.id} value={f.id}>{f.full_name}</option>)}
  </select></label>
  <button disabled={busy||!assignmentsReady||(!facultyId&&!currentAssignment)||facultyId===(currentAssignment?.faculty_id||'')}>{busy?'Saving...':!facultyId&&currentAssignment?'Remove assignment':currentAssignment?'Save faculty change':'Assign faculty'}</button>
 </form>
 {!faculty.length&&<p>No faculty are available in this department. Add faculty to the department before assigning this subject.</p>}
 </section>:<><div className="section-heading"><h3>Subjects</h3><button onClick={()=>setAdding(!adding)}>+ Add Subject</button></div>{adding&&<form className="portal-form" onSubmit={addSubject}><label>Subject Name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Subject Code<input required value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></label><label>Subject Type<select value={form.subjectType} onChange={e=>setForm({...form,subjectType:e.target.value})}>{['theory','lab','elective','project','other'].map(x=><option key={x}>{x}</option>)}</select></label><label>Credits<input type="number" min="0" step="0.5" value={form.credits} onChange={e=>setForm({...form,credits:e.target.value})}/></label><label>Semester<input type="number" min="1" max="8" value={form.semesterNumber||section.semester_number} onChange={e=>setForm({...form,semesterNumber:e.target.value})}/></label><button disabled={busy}>Add Subject</button></form>}{!assignmentsReady?<p role="status">{error?'Faculty assignments could not be loaded. Use Refresh to try again.':'Loading faculty assignments...'}</p>:sectionSubjects.length?<><p className="muted">Choose a subject to assign faculty for this section.</p><div className="class-section-grid">{sectionSubjects.map(s=>{const assignment=bySubject.get(s.subject_id);return <button type="button" className="class-section-card" key={s.subject_id} onClick={()=>{setSubjectId(s.subject_id);setFacultyId(assignment?.faculty_id||'');setError('');setNotice('');}}>
 <div className="class-section-card__top"><span>{s.code}</span><small>{s.credits==null?'Credits not set':`${s.credits} credits`}</small></div>
 <strong>{s.name}</strong><p>{assignment?.faculty_name||'Faculty not assigned'}</p>
 <div className="class-section-card__footer"><b>{assignment?'Assigned':'Unassigned'}</b><em>{assignment?'Change faculty':'Assign faculty'}</em></div>
 </button>;})}</div></>:<p>No subjects have been added to this section. Use Add Subject to create the first subject card.</p>}</>}</section>;
}
