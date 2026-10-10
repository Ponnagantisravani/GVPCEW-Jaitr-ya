import { Router } from '../utils/router.js';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { requireAuth, requireEnrollmentAuth, tokenHash } from '../middleware/auth.js';
import {contextFor} from '../services/academicAccess.js';
import {randomUUID} from 'node:crypto';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  client: z.enum(['web','mobile']).optional().default('web'),
  rememberDevice: z.boolean().optional().default(false)
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  rollNumber: z.string().trim().min(3).max(40),
  email: z.string().trim().toLowerCase().email().refine((value) => value.endsWith('@gvpcew.ac.in'), 'Use your GVPCEW college email'),
  password: z.string().min(8).max(128),
  section: z.string().trim().max(12).optional()
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid login payload" });
  }

  const { email, password } = parsed.data;
  const result = await pool.query(
    `select u.id, u.full_name, u.role, u.password_hash, coalesce(s.face_enrollment_status, 'completed') face_enrollment_status,
      coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}'::text[]) roles
     from users u left join students s on s.user_id=u.id left join user_roles ur on ur.user_id=u.id where u.email = $1 and u.active group by u.id, s.face_enrollment_status limit 1`,
    [email]
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  if (parsed.data.client !== 'mobile' && user.face_enrollment_status !== 'completed') {
    const student=await pool.query('select id from students where user_id=$1',[user.id]);
    const enrollmentToken=jwt.sign({sub:user.id,studentId:student.rows[0]?.id,role:'student',purpose:'face-enrollment'},env.jwtSecret,{expiresIn:'30m'});
    return res.status(403).json({message:'Complete face enrollment first.',enrollmentToken});
  }
  if (!user.roles.length) return res.status(403).json({message:'Your account is awaiting administrator approval.'});

  const token = jwt.sign(
    { sub: user.id, email, role: user.role, roles: user.roles, name: user.full_name },
    env.jwtSecret,
    { expiresIn: parsed.data.rememberDevice ? "30d" : "8h", jwtid:randomUUID() }
  );

  res.json({
    token,
    user: { id: user.id, fullName: user.full_name, email, role: user.role, roles: user.roles }
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`select u.id,u.full_name,u.email,u.role,coalesce(array_agg(ur.role) filter(where ur.role is not null),'{}'::text[]) roles from users u left join user_roles ur on ur.user_id=u.id where u.id=$1 group by u.id`, [req.user.sub]);
  if (!rows[0]) return res.status(401).json({ message: 'Session user no longer exists' });
  res.json({ user: { id: rows[0].id, fullName: rows[0].full_name, email: rows[0].email, role: rows[0].role, roles: rows[0].roles } });
});
authRouter.get('/context',requireAuth,async(req,res)=>res.json(await contextFor(req)));
authRouter.post('/logout',requireAuth,async(req,res)=>{
 await pool.query('insert into revoked_auth_tokens(token_hash,user_id,expires_at) values($1,$2,$3) on conflict do nothing',[tokenHash(req),req.user.sub,new Date(req.tokenExpiresAt*1000)]);
 res.json({message:'Signed out. This session has been revoked.'});
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid registration details' });
  const { fullName, rollNumber, email, password, section } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const exists = await client.query('select 1 from users where email=$1 union all select 1 from students where roll_number=$2', [email, rollNumber]);
    if (exists.rowCount) { await client.query('rollback'); return res.status(409).json({ message: 'An account with this college email or roll number already exists' }); }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await client.query(`insert into users(full_name,email,password_hash,role) values($1,$2,$3,'student') returning id,full_name,email,role`, [fullName, email, passwordHash]);
    const student = await client.query(`insert into students(user_id,roll_number,section,face_enrollment_status) values($1,$2,$3,'pending') returning id`, [user.rows[0].id, rollNumber, section || 'A']);
    await client.query('commit');
    const enrollmentToken = jwt.sign({ sub: user.rows[0].id, studentId: student.rows[0].id, role: 'student', purpose: 'face-enrollment' }, env.jwtSecret, { expiresIn: '30m' });
    res.status(201).json({ enrollmentToken, student: { id: student.rows[0].id, fullName, rollNumber, email, faceEnrollmentStatus: 'pending' } });
  } catch (error) {
    await client.query('rollback');
    if (error.code === '23505') return res.status(409).json({ message: 'An account with this college email or roll number already exists' });
    throw error;
  } finally {
    client.release();
  }
});

authRouter.post('/enroll-face', requireEnrollmentAuth, async (req, res) => {
  let proof;
  try { proof=jwt.verify(req.body?.faceProof,env.jwtSecret,{algorithms:['HS256']}); } catch { return res.status(400).json({message:'Capture a new face image. Verification expired or is invalid.'}); }
  if(proof.purpose!=='face-proof'||proof.sub!==req.user.sub||proof.studentId!==req.user.studentId||proof.livenessVerified!==true||!Array.isArray(proof.embedding))return res.status(403).json({message:'Face verification does not belong to this enrollment.'});
  const client = await pool.connect();
  try {
    await client.query('begin');
    const student = await client.query(`select id, face_enrollment_status from students where id=$1 and user_id=$2 for update`, [req.user.studentId, req.user.sub]);
    if (!student.rowCount) { await client.query('rollback'); return res.status(403).json({ message: 'You are not authorized to enroll this face.' }); }
    if (student.rows[0].face_enrollment_status === 'completed') { await client.query('rollback'); return res.status(409).json({ message: 'Face enrollment is already complete.' }); }
    await client.query(`insert into face_embeddings(student_id,embedding,model_version) values($1,$2::jsonb,'face_recognition_v1')`, [req.user.studentId, JSON.stringify({ embedding: proof.embedding, sample_count: 1, metadata: { source: 'self-service-registration', enrolled_at: new Date().toISOString() } })]);
    await client.query(`update students set face_enrollment_status='completed', face_enrolled_at=now() where id=$1`, [req.user.studentId]);
    await client.query('commit');
    res.status(201).json({ message: 'Face enrollment completed successfully.' });
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
});
