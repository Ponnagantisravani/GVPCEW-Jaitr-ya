import type {EnrollmentStatus} from './types';
export const MODEL = 'mobilefacenet-v1';
export const MODEL_SHA256 = 'be4bc7cfc53f7bc336d0f28b1ab92535f618c913a422b683210750f6b5354854';
export function enrollmentScreen(status: EnrollmentStatus, deviceId: string): 'setup' | 'pending' | 'rejected' | 'wrong-device' | 'ready' {
  // The server flag is authoritative; only an admin reset reopens registration.
  return status.face_enrolled === true ? 'ready' : 'setup';
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
