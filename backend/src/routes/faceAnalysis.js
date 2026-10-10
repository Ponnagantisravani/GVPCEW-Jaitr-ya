import {Router} from '../utils/router.js';
import {requireEnrollmentAuth} from '../middleware/auth.js';
import {env} from '../config/env.js';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import crypto from 'node:crypto';

export const faceAnalysisRouter=Router();
faceAnalysisRouter.post('/analyze-face',requireEnrollmentAuth,async(req,res)=>{
  const parsed=z.object({image:z.string().max(12_000_000).regex(/^data:image\/(jpeg|png);base64,/)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:'Capture a valid image no larger than 8 MB.'});

  if(!env.faceApiUrl) {
    if(env.production) {
      return res.status(503).json({message:'Online face verification is not configured. Contact the college enrollment desk.'});
    }
    // Development / local fallback: generate deterministic 128-d embedding for testing
    const hash = crypto.createHash('sha256').update(parsed.data.image).digest();
    const mockEmbedding = Array.from({length: 128}, (_, i) => ((hash[i % 32] + i * 7) % 200 - 100) / 100);
    const faceProof = jwt.sign({purpose:'face-proof',sub:req.user.sub,studentId:req.user.studentId,embedding:mockEmbedding,livenessVerified:true},env.jwtSecret,{expiresIn:'5m'});
    return res.json({faceProof,faceCount:1});
  }

  let response;
  try{response=await fetch(env.faceApiUrl.replace(/\/$/,'')+'/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Face-Service-Key':env.faceServiceKey},body:JSON.stringify(parsed.data),signal:AbortSignal.timeout(30000)});}
  catch{return res.status(503).json({message:'Face verification service is unavailable. Try again or contact the enrollment desk.'});}
  if(!response.ok)return res.status(422).json({message:'The image could not be analyzed. Capture a new image.'});
  const analysis=await response.json();
  if(analysis.faceCount!==1||!analysis.hasEmbedding||!Array.isArray(analysis.embedding)||analysis.embedding.length<32)return res.status(422).json({message:'Exactly one clear face must be visible. Improve the lighting and retry.'});
  if(analysis.livenessVerified!==true)return res.status(503).json({message:'Secure liveness verification is unavailable. Complete enrollment at the college enrollment desk.'});
  const faceProof=jwt.sign({purpose:'face-proof',sub:req.user.sub,studentId:req.user.studentId,embedding:analysis.embedding,livenessVerified:true},env.jwtSecret,{expiresIn:'2m'});
  res.json({faceProof,faceCount:1});
});
