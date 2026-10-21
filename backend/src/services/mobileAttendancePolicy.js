import crypto from 'node:crypto';
import {z} from 'zod';
export const MODEL='mobilefacenet-v1';
export const embeddingSchema=z.array(z.number().finite().min(-100).max(100)).length(192).refine(v=>v.some(x=>x!==0),'Embedding must be nonzero');
export const deviceSchema=z.string().min(16).max(160).regex(/^[A-Za-z0-9_-]+$/);
export const submissionSchema=z.object({student_id:z.string().uuid(),device_id:deviceSchema,challenge_id:z.string().uuid(),challenge_type:z.literal('blink'),liveness_result:z.literal(true),embedding_model:z.literal(MODEL),embedding:embeddingSchema,ble_token:z.string().regex(/^[a-f0-9]{24}$/),timestamp:z.string().datetime(),integrity_token:z.string().min(1).max(20000)}).strict();
export function cosineSimilarity(a,b){
 if(!embeddingSchema.safeParse(a).success||!embeddingSchema.safeParse(b).success)throw new Error('Invalid MobileFaceNet template');
 let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
 return Math.max(-1,Math.min(1,dot/Math.sqrt(aa*bb)));
}
// This exact ordered JSON is also serialized by the mobile client before SHA-256.
export function requestHash(sessionId,p,method){return crypto.createHash('sha256').update(JSON.stringify([sessionId,p.student_id,p.device_id,p.challenge_id,p.challenge_type,p.liveness_result,p.embedding_model,p.embedding,p.ble_token||null,p.timestamp,method])).digest('base64url');}
export function tokenSlot(start,now){return Math.floor((now-new Date(start).getTime())/8000);}
export function tokenAccepted(slot,current){return current>=0&&current<=7&&(slot===current||slot===current-1);}
export function windowOpen(session,method,now=Date.now()){
 const start=new Date(session.starts_at).getTime(),end=new Date(session.expires_at).getTime();
 return method==='ble'?session.status==='open'&&!session.stopped_at&&now>=start&&now<end:now>=end&&now<new Date(session.late_expires_at).getTime();
}
export function threshold(){const n=Number(process.env.MOBILE_FACE_THRESHOLD);if(!Number.isFinite(n)||n<=0||n>=1)throw Object.assign(new Error('Configure a calibrated MOBILE_FACE_THRESHOLD before enabling attendance.'),{status:503});return n;}
