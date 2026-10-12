export const attendanceLabel = row => row?.status === 'LATE' || (row?.status === 'PRESENT' && row?.is_late)
  ? 'Present (Late)' : row?.status === 'PRESENT' ? 'Present' : row?.status === 'ABSENT' ? 'Absent' : 'Unmarked';

export function similarityLabel(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';
}

export const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export function sessionDeadline(session, receivedAt, requestDurationMs = 0) {
  const budget = Number.isFinite(session?.valid_for_ms) ? session.valid_for_ms
    : new Date(session?.expires_at).getTime() - new Date(session?.server_time || Date.now()).getTime();
  return receivedAt + Math.max(0, (Number.isFinite(budget) ? budget : 0) - requestDurationMs);
}

export function remainingSeconds(deadline, now) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

// Schedule the next read after completion so a slow connection never piles up requests.
export function pollAttendanceRead({read, onData, onError, interval = 0, now = monotonicNow, setTimer = setTimeout, clearTimer = clearTimeout}) {
  let stopped = false, timer, controller;
  const run = async () => {
    if (stopped) return;
    controller = new AbortController();
    const started = now();
    try {
      const result = await read(controller.signal);
      if (!stopped) onData(result.data, {receivedAt: now(), requestDurationMs: Math.max(0, now() - started)});
    } catch (error) {
      if (!stopped && !controller.signal.aborted) onError(error);
    } finally {
      if (!stopped && interval > 0) timer = setTimer(run, interval);
    }
  };
  void run();
  return () => { stopped = true; controller?.abort(); if (timer !== undefined) clearTimer(timer); };
}
