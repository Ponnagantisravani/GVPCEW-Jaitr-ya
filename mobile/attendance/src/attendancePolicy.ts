import type {PushEvent} from './types';
export function acceptsPush(event: PushEvent | null, userId: string, now=Date.now()): boolean {
  return !!event && event.type==='attendance_session' && event.user_id===userId && /^[a-f0-9-]{36}$/i.test(event.session_id) && Number.isFinite(Date.parse(event.expires_at)) && Date.parse(event.expires_at)>now;
}
export function secondsRemaining(expires: string, now=Date.now()): number {
  const end=Date.parse(expires);
  return Number.isFinite(end)?Math.max(0,Math.ceil((end-now)/1000)):0;
}
