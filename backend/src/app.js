import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { router } from './routes/index.js';
import { env } from './config/env.js';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  app.use(helmet({ contentSecurityPolicy: env.production ? { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'", ...env.allowedOrigins], frameSrc: ["'self'", 'blob:'], objectSrc: ["'none'"],
    upgradeInsecureRequests: []
  }} : false }));
  app.use(cors({ origin(origin, callback) { callback(null, !origin || env.allowedOrigins.includes(origin)); } }));
  app.use(express.json({ limit: '25mb' }));
  app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true }));
  app.use('/api/auth/register', rateLimit({ windowMs: 60*60*1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/enrollment', rateLimit({ windowMs: 15*60*1000, limit: 40, standardHeaders: true, legacyHeaders: false }));
  app.use(morgan(env.production ? 'combined' : 'dev'));
  app.use('/api', router);
  app.use('/api', (_req,res) => res.status(404).json({message:'API route not found.'}));
  const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: 0 }));
    const pages = { '/':'index.html', '/login':'index.html', '/register':'index.html', '/enroll':'index.html',
      '/student':'student.html','/faculty':'faculty.html','/admin':'admin.html','/student-coordinator':'student-coordinator.html','/academic-coordinator':'academic-coordinator.html',
      '/student-dashboard':'student.html', '/faculty-dashboard':'faculty.html', '/admin-dashboard':'admin.html',
      '/student/coordinator':'student-coordinator.html', '/academic-coordinator/dashboard':'academic-coordinator.html' };
    app.get(Object.keys(pages), (req,res) => res.sendFile(dist + pages[req.path]));
  }
  app.use((err, _req, res, _next) => {
    if (res.headersSent) return _next(err);
    const code = err.code;
    const status = [400,403,404,409,413,422,429,503].includes(err.status) ? err.status : err.type === 'entity.parse.failed' || ['22P02','22007','22008','23514'].includes(code) ? 400 : code === '23505' ? 409 : code === '23503' ? 409 : 500;
    if (status === 500) console.error('Request failed:', code || err.name, err.message, err.stack);
    res.status(status).json({message: err.message || (status===403 || status===400 ? 'Check the entered fields.' : status === 413 ? 'File or request is too large.' : status === 409 ? 'This record conflicts with existing or related records.' : 'The server could not complete this request. Please try again.'), code, detail: err.detail, stack: err.stack});
  });
  return app;
}
