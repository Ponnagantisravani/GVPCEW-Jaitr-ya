import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GraduationCap} from 'lucide-react';
import {api,readSession} from './api.js';
import './styles.css';
import './mobile.css';
import {destinationForRole,preferredRole} from './session.js';
const paths={student:'/student.html',student_coordinator:'/student-coordinator.html',faculty:'/faculty.html',academic_coordinator:'/academic-coordinator.html',admin:'/admin.html'};
function Login(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{const {data}=await api.post('/auth/login',{email,password});const role=preferredRole(data.user);if(!role){setError('No dashboard has been assigned to this account.');return;}localStorage.setItem('gvpcew_session',JSON.stringify({...data,activeRole:role}));window.location.assign(destinationForRole(role));}catch(e){if(e.response?.data?.enrollmentToken){sessionStorage.setItem('gvpcew_enrollment_token',e.response.data.enrollmentToken);window.location.assign('/enroll');return;}setError(e.response?.data?.message||'Could not reach the college portal. Please retry.');}finally{setBusy(false);}}
 return <main className="login"><section><div className="brand"><GraduationCap/> GVPCEW</div><p className="eyebrow">CAMPUS PORTAL</p><h1>Your campus, in one place.</h1><p className="muted">Sign in with your college account to access your assigned portal.</p></section><form onSubmit={submit}><h2>Welcome back</h2><label>College email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy?'Signing in…':'Sign in to portal'}</button><p>New student? <a href="/register">Create an account</a></p><p className="muted">For password resets or portal access, contact your administrator.</p></form></main>;
}
function Registration(){
 const [form,setForm]=useState({fullName:'',rollNumber:'',email:'',password:'',confirmPassword:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setError('');if(form.password!==form.confirmPassword)return setError('Passwords do not match.');setBusy(true);try{const {data}=await api.post('/auth/register',form);sessionStorage.setItem('gvpcew_enrollment_token',data.enrollmentToken);window.location.assign('/enroll');}catch(e){setError(e.response?.data?.message||'Could not create your account. Please retry.');}finally{setBusy(false);}}
 return <main className="login"><section><div className="brand"><GraduationCap/> GVPCEW</div><h1>Join your college portal.</h1><p className="muted">Create your account, complete face enrollment, then wait for administrator approval.</p></section><form onSubmit={submit}><h2>Student registration</h2>{[['fullName','Full name','text'],['rollNumber','Roll number','text'],['email','College email','email'],['password','Password','password'],['confirmPassword','Confirm password','password']].map(([key,label,type])=><label key={key}>{label}<input required type={type} minLength={type==='password'?8:undefined} maxLength={key==='rollNumber'?40:128} autoComplete={type==='password'?'new-password':key==='email'?'email':'off'} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}{error&&<p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy?'Creating account…':'Create account & continue'}</button><a href="/index.html">Back to sign in</a></form></main>;
}
function FaceEnrollment(){
 const [token]=useState(()=>sessionStorage.getItem('gvpcew_enrollment_token'));
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),video=useRef(null),stream=useRef(null);
 useEffect(()=>{if(!token){window.location.replace('/index.html');return;}let alive=true;if(!navigator.mediaDevices?.getUserMedia){setError('Camera access requires HTTPS or localhost and a supported browser.');return;}
 navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false}).then(s=>{if(!alive){s.getTracks().forEach(t=>t.stop());return;}stream.current=s;if(video.current)video.current.srcObject=s;}).catch(()=>{if(alive)setError('Camera access was unavailable. Check permissions, close other camera apps, then reload.');});
 return()=>{alive=false;stream.current?.getTracks().forEach(t=>t.stop());};},[token]);
 async function submit(e){e.preventDefault();if(!video.current?.videoWidth)return setError('Wait for the camera preview before capturing.');setBusy(true);setError('');try{const canvas=document.createElement('canvas');canvas.width=video.current.videoWidth;canvas.height=video.current.videoHeight;canvas.getContext('2d').drawImage(video.current,0,0);const headers={Authorization:'Bearer '+token};const {data}=await api.post('/auth/analyze-face',{image:canvas.toDataURL('image/jpeg',0.85)},{headers});await api.post('/auth/enroll-face',{faceProof:data.faceProof},{headers});stream.current?.getTracks().forEach(t=>t.stop());sessionStorage.removeItem('gvpcew_enrollment_token');setDone(true);}catch(e){setError(e.response?.data?.message||'Face verification failed. Please retry.');}finally{setBusy(false);}}
 return <main className="login"><section><div className="brand"><GraduationCap/> GVPCEW</div><h1>{done?'Enrollment complete.':'Confirm your identity.'}</h1><p className="muted">{done?'Your administrator can now review and assign portal access.':'Keep one face visible in the frame with good lighting.'}</p></section>{done?<section className="enrollment-success" role="status"><h2>Face enrollment saved</h2><p>Sign in after your administrator approves portal access.</p><a href="/index.html">Go to sign in</a></section>:<form onSubmit={submit}><h2>Face verification</h2><video className="face-video" ref={video} autoPlay playsInline muted/>{error&&<p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy?'Verifying…':'Capture & complete enrollment'}</button><a href="/index.html">Back to sign in</a></form>}</main>;
}
function App(){
 const path=window.location.pathname;
 if(path==='/register')return <Registration/>;
 if(path==='/enroll')return <FaceEnrollment/>;
 // The entry routes are always the sign-in screen. This also lets a user
 // replace an expired or previously cached session with another account.
 if(path==='/'||path==='/login'||path==='/index.html')return <Login/>;
 const session=readSession(),roles=session?.user?.roles||[];
 if(session?.token&&roles.length){window.location.replace(destinationForRole(preferredRole(session.user,session.activeRole)));return <p>Opening your portal…</p>;}
 return <Login/>;
}
createRoot(document.getElementById('root')).render(<App/>);

