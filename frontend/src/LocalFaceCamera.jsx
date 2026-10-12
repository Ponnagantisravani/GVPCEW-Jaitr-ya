import React,{useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {listenFaceEntry,consumeFaceEntry} from './face-entry.js';
export function LocalFaceCamera({enrolled,sessionId,sectionName,canCheckIn,phase,onSaved,autoOpen=false}) {
 const autoEntered=useRef(null);
 const video=useRef(null),stream=useRef(null),operation=useRef(0),controller=useRef(null),opening=useRef(false),attempts=useRef({id:null,count:0});
 const [stage,setStage]=useState('closed'),[error,setError]=useState(''),[consent,setConsent]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const stageRef=useRef(stage);stageRef.current=stage;
 function stop(){opening.current=false;operation.current++;controller.current?.abort();stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;setReady(false);setBusy(false);}
 function close(){stop();setStage('closed');}
 useEffect(()=>()=>{operation.current++;controller.current?.abort();stream.current?.getTracks().forEach(t=>t.stop());},[]);
 useEffect(()=>{if(stageRef.current!=='closed'&&stageRef.current!=='success'&&enrolled&&!canCheckIn){stop();setError('This check-in window has closed or attendance is already recorded.');setStage('error');}},[canCheckIn,enrolled,phase]);
 useEffect(()=>{stop();setStage('closed');attempts.current={id:sessionId,count:0};},[sessionId]);
 useEffect(()=>{if(!autoOpen||!enrolled||!canCheckIn||!sessionId||autoEntered.current===sessionId)return;const frame=requestAnimationFrame(()=>{autoEntered.current=sessionId;void open();});return()=>cancelAnimationFrame(frame);},[autoOpen,enrolled,canCheckIn,sessionId]);
 useEffect(()=>listenFaceEntry(id=>{if(id===sessionId&&canCheckIn){consumeFaceEntry(id);void open();}}),[sessionId,canCheckIn,enrolled]);
 useEffect(()=>{if(stage==='closed')return;const previous=document.activeElement,old=document.body.style.overflow;document.body.style.overflow='hidden';const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...document.querySelectorAll('.face-dialog button:not(:disabled),.face-dialog input:not(:disabled)')];if(nodes.length){e.preventDefault();let i=nodes.indexOf(document.activeElement);nodes[(i+(e.shiftKey?-1:1)+nodes.length)%nodes.length].focus();}}};document.addEventListener('keydown',key);document.querySelector('.face-dialog button')?.focus();return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);previous?.focus?.();};},[stage==='closed']);
 async function open(){if(opening.current||stream.current||busy)return;if(enrolled&&!canCheckIn)return;opening.current=true;setError('');setStage('opening');const current=++operation.current;
  try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera requires localhost or HTTPS and a supported browser.');const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:480},height:{ideal:360}},audio:false});if(current!==operation.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;for(let i=0;!video.current&&i<60&&current===operation.current;i++)await new Promise(r=>requestAnimationFrame(r));if(current!==operation.current)return;if(!video.current)throw Error('Camera view could not open. Please try again.');video.current.srcObject=media;await video.current.play();if(current!==operation.current)return;opening.current=false;setReady(true);setStage(enrolled?'blink':'enroll');if(enrolled)void verify();}
  catch(e){if(current!==operation.current)return;stop();setError(e.name==='NotAllowedError'?'Allow camera access in your browser, then try again.':e.name==='NotFoundError'?'No webcam was found. Connect a camera and try again.':e.name==='NotReadableError'?'Camera is busy. Close other camera apps and try again.':e.message);setStage('error');}}
 function capture(){const v=video.current;if(!v?.videoWidth||!stream.current?.active)throw Error('Wait for a live camera preview.');const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(480*v.videoHeight/v.videoWidth);if(canvas.height>720)throw Error('Unsupported camera dimensions.');canvas.getContext('2d').drawImage(v,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',0.65);}
 async function enroll(){setBusy(true);const current=++operation.current;controller.current=new AbortController();try{await api.post('/local-attendance-demo/face/enroll',{image:capture(),consent:true},{signal:controller.current.signal});if(current!==operation.current)return;stop();setStage('closed');onSaved();}catch(e){if(current===operation.current){setError(e.response?.data?.message||e.message);setBusy(false);}}}
 async function verify(){if(attempts.current.count>=3){stop();setStage('error');setError('Three attempts used for this session.');return;}attempts.current.count++;setBusy(true);setError('');setStage('blink');const current=++operation.current;controller.current=new AbortController();try{
 const {data}=await api.post('/local-attendance-demo/challenge',{session_id:sessionId},{signal:controller.current.signal});if(current!==operation.current)return;const frames=[];
 for(let i=0;i<32;i++){if(current!==operation.current)return;frames.push(capture());await new Promise(r=>setTimeout(r,125));}
 if(current!==operation.current)return;setStage('matching');const result=await api.post('/local-attendance-demo/check-in',{session_id:sessionId,challenge_id:data.challenge_id,frames},{signal:controller.current.signal});if(current!==operation.current)return;
 if(!result.data.face_verified||!result.data.blink_observed||!['PRESENT','LATE'].includes(result.data.status))throw Error('Verification was not confirmed. Attendance was not marked.');setStatus(result.data.status);stop();setStage('success');onSaved();
 }catch(e){if(current===operation.current){stop();setError(e.response?.data?.message||e.message||'Face not recognized, try again');setStage('error');}}}
 const success=stage==='success',matching=stage==='matching';
 return <section className="local-face-camera" aria-label="Face verification">
 <button className="face-start" type="button" disabled={enrolled&&!canCheckIn} onClick={()=>void open()}>▣ {enrolled?'Start Face Verification':'Register local face reference'}</button>
 {enrolled&&!canCheckIn&&<p className="muted">Face verification is available during an eligible, unmarked session.</p>}
 {stage!=='closed'&&<div className="face-overlay"><section className={'face-dialog face-'+stage} role="dialog" aria-modal="true" aria-labelledby="face-title">
 <button className="face-close" aria-label="Close camera" onClick={close}>×</button><div className="face-session">{sectionName?'Section '+sectionName:'Attendance'} · Local demo</div>
 <div className="face-preview"><video ref={video} autoPlay playsInline muted aria-label="Live front camera"/><div className="face-oval"><span>{success?'✓':matching?'◌':'◉'}</span></div><strong>{success?'Face matched':matching?'Checking records…':stage==='opening'?'Opening camera…':'Look at the camera'}</strong></div>
 <div className="face-sheet"><h3 id="face-title">{success?'Attendance marked':matching?'Checking your face':stage==='enroll'?'Save your face reference':stage==='error'?'Verification incomplete':'Blink once'}</h3>
 <p>{success?'Face matched with your saved reference.':matching?'Comparing your face and blink with your saved reference.':stage==='enroll'?'Keep one face visible in good lighting.':'Keep your face inside the oval. Blink once slowly, then open your eyes.'}</p>
 <div className="face-checks">{['Camera','Face','Blink','Match'].map((label,i)=><div key={label}><span className={(success||(i===0&&ready))?'complete':''}>{success||(i===0&&ready)?'✓':'○'}</span>{label}</div>)}</div>
 {success&&<><p className="face-confirmation">You are marked {status}{sectionName?' for Section '+sectionName:''}.</p><button className="face-start" onClick={close}>Done</button></>}
 {stage==='enroll'&&<><label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> I agree to save a separate face template for this local test.</label><button className="face-start" disabled={!ready||busy||!consent} onClick={enroll}>{busy?'Saving…':'Save local face reference'}</button></>}
 {error&&<p role="alert" className="error">{error}</p>}{stage==='error'&&(!enrolled||canCheckIn)&&attempts.current.count<3&&<button className="face-start" onClick={()=>void open()}>Try again</button>}
 <p className="face-demo-note">Local webcam demo: identity and heuristic blink checks. Bluetooth and production anti-spoofing are tested in the Android app.</p>
 </div></section></div>}
 </section>;
}
