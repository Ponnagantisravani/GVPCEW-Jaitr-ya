import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
dotenv.config({path:new URL('../.env',import.meta.url)});
let database;try{database=new URL(process.env.DATABASE_URL);}catch{throw new Error('Set a working local DATABASE_URL in backend/.env.');}
assert(['postgres:','postgresql:'].includes(database.protocol)&&['localhost','127.0.0.1','[::1]'].includes(database.hostname),'Local browser demo startup requires PostgreSQL on this computer.');
// These settings apply only to this process; the saved deployment .env is unchanged.
process.env.NODE_ENV='development';process.env.LOCAL_ATTENDANCE_DEMO='true';process.env.LOCAL_ATTENDANCE_DEMO_ONLY='true';
console.log('Starting LOCAL BROWSER DEMO. Webcam comparison and heuristic blink; no Bluetooth; official attendance is unaffected.');
await import('./migrate-local-attendance-demo.js');
await import('./migrate-subject-attendance.js');
for(const name of ['face_detection_yunet_2023mar.onnx','face_recognition_sface_2021dec_int8.onnx']){try{await access(new URL('../../.tmp/local-face-models/'+name,import.meta.url));}catch{throw new Error('Run python tools/setup-local-face-models.py from the project root before starting the webcam demo.');}}
process.env.LOCAL_FACE_SERVICE_KEY=crypto.randomBytes(32).toString('hex');
const faceProcess=spawn(process.env.LOCAL_DEMO_PYTHON||'python',['-u',fileURLToPath(new URL('../../tools/local-attendance-face-service.py',import.meta.url))],{env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
faceProcess.stdout.on('data',data=>console.log(data.toString().trim()));faceProcess.stderr.on('data',data=>console.error(data.toString().trim()));let faceError;faceProcess.on('error',error=>{faceError=error;});process.on('exit',()=>faceProcess.kill());process.on('SIGINT',()=>{faceProcess.kill();process.exit(0);});process.on('SIGTERM',()=>{faceProcess.kill();process.exit(0);});
let ready=false;for(let i=0;i<30;i++){if(faceError||faceProcess.exitCode!==null)break;try{const r=await fetch('http://127.0.0.1:5002/health',{signal:AbortSignal.timeout(500)});const data=await r.json();if(r.ok&&data.model==='opencv-sface-demo-v1'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!ready){faceProcess.kill();throw new Error('Local webcam service could not start. Check Python/OpenCV, models and free port 5002.');}
await import('../src/server.js');
