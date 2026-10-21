import type {EnrollmentStatus} from './types';
export const MODEL = 'mobilefacenet-v1';
export const MODEL_SHA256 = 'be4bc7cfc53f7bc336d0f28b1ab92535f618c913a422b683210750f6b5354854';
export function enrollmentScreen(status: EnrollmentStatus, deviceId: string): 'setup' | 'pending' | 'rejected' | 'wrong-device' | 'needs-reset' | 'ready' {
  if(status.bound_device_id&&status.bound_device_id!==deviceId)return 'wrong-device';
  if(status.enrollment_status==='pending')return 'pending';
  if(status.enrollment_status==='rejected')return 'rejected';
  if(!status.face_enrolled&&status.enrollment_status==='required'&&!status.bound_device_id)return 'setup';
  if(!status.face_enrolled||status.embedding_model!==MODEL||status.enrollment_status!=='approved'||!status.bound_device_id)return 'needs-reset';
  return 'ready';
}
export function validatePassword(current: string, next: string, confirmation: string): string | null {
  if (!current) return 'Enter your current password.';
  if (next.length < 12 || next.length > 128) return 'Use a new password with 12–128 characters.';
  if (current === next) return 'Choose a password different from your current password.';
  if (next !== confirmation) return 'The new passwords do not match.';
  return null;
}
export function validateApiBase(input: string): string {
  const value = input.trim().replace(/\/+$/, '');
  if (value.includes('<') || value.includes('>')) throw new Error('Replace <your-service-name> with the actual Render service name before signing in.');
  // Production and debug credentials are sent only over HTTPS.
  if (!/^https:\/\/[^/?#@:]+(?::[0-9]+)?(?:\/[^?#]*)?\/api$/.test(value)) throw new Error('Enter the campus HTTPS address ending in /api.');
  return value;
}
