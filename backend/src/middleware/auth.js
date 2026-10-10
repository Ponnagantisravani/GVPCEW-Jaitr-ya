import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import crypto from 'node:crypto';
export const tokenHash = req => crypto.createHash('sha256').update((req.headers.authorization||'').slice(7)).digest('hex');

function decode(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try { return jwt.verify(header.slice(7), env.jwtSecret, { algorithms: ['HS256'] }); }
  catch { return null; }
}
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = decode(req);
  if (!token || token.purpose || !token.sub || !Number.isFinite(token.exp)) return res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  if (req.user?.sub === token.sub && req.authChecked) return next();
  const { rows } = await pool.query(`select u.id, u.full_name, u.email, u.role,
    coalesce(array_agg(r.role) filter(where r.role is not null),'{}'::text[]) roles
    from users u left join user_roles r on r.user_id=u.id where u.id=$1 and u.active
    and not exists(select 1 from revoked_auth_tokens rt where rt.token_hash=$2 and rt.expires_at>now()) group by u.id`, [token.sub,tokenHash(req)]);
  if (!rows[0] || !rows[0].roles.length) return res.status(401).json({ message: 'Portal access is no longer available. Contact your administrator.' });
  const activeRole = req.get('X-Portal-Role');
  if (activeRole && !rows[0].roles.includes(activeRole)) return res.status(403).json({message:'This dashboard is not assigned to your account.'});
  req.user = { sub: rows[0].id, name: rows[0].full_name, email: rows[0].email, role: rows[0].role,
    activeRole: activeRole || (rows[0].roles.includes(rows[0].role) ? rows[0].role : rows[0].roles[0]),
    roles: activeRole ? [activeRole] : rows[0].roles };
  req.authChecked = true;
  res.set('Cache-Control','private, no-store');
  req.tokenExpiresAt=token.exp;
  next();
});
export function requireEnrollmentAuth(req, res, next) {
  const token = decode(req);
  if (!token || token.purpose !== 'face-enrollment' || !token.studentId) return res.status(401).json({ message: 'A valid enrollment session is required.' });
  req.user = token; next();
}
export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.some(role => (req.user.roles || []).includes(role))) return res.status(403).json({ message: 'You do not have access to this resource' });
    next();
  };
}
