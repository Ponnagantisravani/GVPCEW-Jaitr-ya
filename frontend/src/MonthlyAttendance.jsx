import React,{useEffect,useState} from 'react';
import {CalendarDays,Printer} from 'lucide-react';
import {api} from './api.js';
import {errorMessage} from './LiveWorkspaces.jsx';

export function MonthlyAttendance({subjectId,sectionId,students,subject,classAssignment,classroom,refreshKey}) {
 const [month,setMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let current=true;setRows([]);setError('');setLoading(false);
  if(!subjectId||!sectionId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
  setLoading(true);
  api.get('/faculty/attendance-register',{params:{subjectId,sectionId,month}}).then(r=>{if(current)setRows(r.data.attendance);}).catch(e=>{if(current)setError(errorMessage(e));}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[subjectId,sectionId,month,refreshKey]);
 const days=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate():0;
 const records=new Map(rows.map(row=>[row.student_id+':'+row.date,row.status]));
 const monthLabel=days?new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}):'Choose a month';
 const printRegister=()=>{document.body.classList.add('printing-monthly-register');try{window.print();}finally{document.body.classList.remove('printing-monthly-register');}};
 return <section className="monthly-register faculty-monthly-register">
  <div className="monthly-register__head"><h3><CalendarDays aria-hidden="true" size={26}/><span>Monthly Attendance{subject ? ` - ${subject.name} (${subject.code})` : ''}{classAssignment ? ` | ${classAssignment.department} — Section ${classAssignment.section_name}` : ''}{classroom ? ` | Room: ${classroom.room_code}` : ''} | {monthLabel}</span></h3><div className="monthly-register__tools"><label>Month <input type="month" required value={month} onChange={e=>setMonth(e.target.value)}/></label><button type="button" disabled={loading||!!error||!subjectId||!sectionId||!days||!students.length} onClick={printRegister}><Printer aria-hidden="true" size={22}/>Print Register</button></div></div>
  <p className="muted">P = Present · A = Absent · L = Late · — = Not recorded. Scroll horizontally to view all calendar days.</p>
  {error?<p role="alert" className="error">{error}</p>:loading?<p role="status">Loading register…</p>:!subjectId||!sectionId?<p>Choose a subject and assigned class to view attendance.</p>:!days?<p>Choose a valid month to view attendance.</p>:<div className="portal-table monthly-register__table" tabIndex={0} role="region" aria-label="Monthly attendance register, scroll horizontally"><table><thead><tr><th>S.No.</th><th>Roll Number</th><th>Name</th><th>Sec</th>{Array.from({length:days},(_,index)=><th key={index}>{index+1}</th>)}<th>Present</th><th>Absent</th><th>%</th></tr></thead><tbody>{students.map((student,index)=>{
   const entries=rows.filter(row=>row.student_id===student.id),present=entries.filter(row=>row.status==='present'||row.status==='late').length,absent=entries.filter(row=>row.status==='absent').length;
   return <tr key={student.id}><td>{index+1}</td><th scope="row">{student.roll_number}</th><td>{student.full_name}</td><td>{classAssignment?.section_name || student.section}</td>{Array.from({length:days},(_,day)=>{const status=records.get(student.id+':'+month+'-'+String(day+1).padStart(2,'0'));return <td className={'monthly-register__mark monthly-register__mark--'+(status||'empty')} key={day} title={status||'Not recorded'}>{({present:'P',absent:'A',late:'L'})[status]||'—'}</td>;})}<td className="monthly-register__total">{present}</td><td className="monthly-register__total monthly-register__total--absent">{absent}</td><td className={entries.length ? (present/entries.length >= .75 ? 'monthly-register__percentage--good' : 'monthly-register__percentage--low') : ''}>{entries.length?(100*present/entries.length).toFixed(2)+'%':'—'}</td></tr>;
  })}{!students.length&&<tr><td colSpan={days+7}>No students match your filters.</td></tr>}</tbody></table></div>}
 </section>;
}
