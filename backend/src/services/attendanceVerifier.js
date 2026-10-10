import crypto from 'node:crypto';
import {env} from '../config/env.js';
export function verifierReady() {
 try {const u=new URL(env.attendanceVerifierUrl);return Boolean(env.attendanceVerifierKey && (u.protocol==='https:' || (!env.production && u.protocol==='http:' && ['127.0.0.1','localhost'].includes(u.hostname))));}catch{return false;}
}
export const evidenceDigest=frames=>crypto.createHash('sha256').update(JSON.stringify(frames)).digest('hex');
export function verifiedDecision(result, expected) {
 return result?.identityVerified===true && result?.livenessVerified===true &&
 result.challengeId===expected.challengeId && result.studentId===expected.studentId &&
 result.evidenceDigest===expected.evidenceDigest &&
 typeof result.verifierVersion==='string' && result.verifierVersion.length>0 && result.verifierVersion.length<=120;
}
export async function verifyAttendanceEvidence(payload) {
 if(!verifierReady())throw new Error('Verifier unavailable');
 const response=await fetch(env.attendanceVerifierUrl,{
  method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.attendanceVerifierKey},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(20000),redirect:'error'
 });
 if(!response.ok)throw new Error('Verifier unavailable');
 return response.json();
}
