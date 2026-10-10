import dotenv from 'dotenv';
import crypto from 'node:crypto';
dotenv.config({ path: new URL('../../.env', import.meta.url) });
const production = process.env.NODE_ENV === 'production';
const secret = process.env.JWT_SECRET;
function assertProductionSecret(name, value) {
  if (production && (!value || value.length < 32 || /change_me|replace-with|your.*secret/i.test(value))) {
    throw new Error(`Production requires a unique ${name} of at least 32 characters.`);
  }
}
assertProductionSecret('JWT_SECRET', secret);
assertProductionSecret('ENROLLMENT_API_KEY', process.env.ENROLLMENT_API_KEY);
assertProductionSecret('DATASET_ADMIN_API_KEY', process.env.DATASET_ADMIN_API_KEY);
if (process.env.FACE_API_URL) assertProductionSecret('FACE_SERVICE_KEY', process.env.FACE_SERVICE_KEY);
export const env = {
  production,
  port: Number(process.env.PORT || 4000),
  jwtSecret: secret || crypto.randomBytes(48).toString('hex'),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSslMode: process.env.DATABASE_SSL_MODE || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || (production ? '' : 'http://localhost:5173,http://127.0.0.1:5173')).split(',').map(x=>x.trim()).filter(Boolean),
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  enrollmentApiKey: process.env.ENROLLMENT_API_KEY || '',
  datasetAdminApiKey: process.env.DATASET_ADMIN_API_KEY || '',
  attendanceVerifierUrl: process.env.ATTENDANCE_VERIFIER_URL || '',
  attendanceVerifierKey: process.env.ATTENDANCE_VERIFIER_KEY || '',
  faceApiUrl: process.env.FACE_API_URL || '',
  faceServiceKey: process.env.FACE_SERVICE_KEY || '',
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || 'auto',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
};
if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) throw new Error('Invalid PORT');
