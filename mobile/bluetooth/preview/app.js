const el = id => document.getElementById(id);
let state = { session: null, records: [] }, stream = null, cameraGeneration = 0, captureSession = null;
let opening = false, saving = false, captureDeadline = 0, pollBusy = false, cameraTimer = null;
const coordinator = new URLSearchParams(location.search).get('role') === 'coordinator';
function page(name) { for (const id of ['student', 'cameraScreen', 'coordinator']) el(id).hidden = id !== name; }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed. Please retry.');
  return result;
}
function stopCamera() {
  cameraGeneration++; opening = false;
  clearInterval(cameraTimer); cameraTimer = null;
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null; el('webcam').srcObject = null; el('capture').disabled = true;
}
function render() {
  el('connection').textContent = state.session ? 'Coordinator class is open - Ready (local demo)' : 'No class open - Ask the coordinator to open one';
  el('classStatus').textContent = state.session ? 'Class open - Students can submit' : 'Class closed';
  el('toggleClass').textContent = state.session ? 'Close class' : 'Open class';
  el('count').textContent = state.records.length + ' student' + (state.records.length === 1 ? '' : 's') + ' captured';
  const list = el('records'); list.replaceChildren();
  for (const record of state.records) {
    const row = document.createElement('div'); row.className = 'record';
    const img = document.createElement('img'); img.src = '/api/photo/' + record.recordId + '?t=' + record.recordedAt;
    img.alt = 'Capture for ' + record.studentId;
    const text = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = record.studentId;
    const detail = document.createElement('p'); detail.className = 'small'; detail.textContent = record.status + ' · ' + new Date(record.recordedAt).toLocaleTimeString();
    text.append(title, detail); row.append(img, text); list.append(row);
  }
  if (captureSession && !el('cameraScreen').hidden && captureSession !== state.session?.id && !saving) {
    stopCamera(); page('student'); el('receipt').textContent = 'Class closed or changed. No photo submitted. Try again when the coordinator opens a class.';
  }
}
let lastState = '';
async function poll() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const next = await api('/api/state'); state = next;
    const serialized = JSON.stringify(next);
    if (serialized !== lastState) { lastState = serialized; render(); }
    el('serverError').textContent = '';
  } catch {
    state.session = null; lastState = ''; render();
    el('serverError').textContent = 'Preview server unavailable. Run node preview/start.mjs and reload this page.';
  } finally { pollBusy = false; }
}
async function cameraAccess() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open http://localhost:4173 in Chrome or Edge to use the camera.');
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
}
function cameraError(error) {
  const errors = { NotAllowedError: 'Camera blocked. Use the address-bar camera/site settings to allow Camera, then retry.',
    NotFoundError: 'No webcam found. Connect a camera and retry.',
    NotReadableError: 'Camera is busy. Close other apps using it, then retry.',
    AbortError: 'Camera startup was interrupted. Please retry.' };
  return errors[error.name] || error.message || 'Camera could not open. Please retry.';
}
el('permissions').onclick = async () => {
  el('permissions').disabled = true;
  try {
    const access = await cameraAccess(); access.getTracks().forEach(track => track.stop());
    el('permissions').textContent = 'Camera permission ready';
    el('receipt').textContent = 'Camera allowed. Enter your ID and tap Mark attendance.';
  } catch (error) { el('receipt').textContent = cameraError(error); }
  finally { el('permissions').disabled = false; }
};
el('attendanceForm').onsubmit = async event => {
  event.preventDefault(); if (opening || saving) return;
  const id = el('studentId').value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,10}$/.test(id)) {
    el('idError').textContent = 'Enter 1-10 letters, numbers, _ or -.'; el('studentId').focus(); return;
  }
  el('idError').textContent = ''; el('studentId').value = id;
  opening = true; el('mark').disabled = true;
  try {
    state = await api('/api/state'); render();
    if (!state.session) throw new Error('Open the coordinator tab and click Open class first.');
    captureSession = state.session.id; captureDeadline = Date.now() + 40_000;
    page('cameraScreen'); el('captureStatus').textContent = 'Opening webcam - Allow camera access if prompted.';
    el('retryCamera').hidden = true; el('capture').disabled = true;
    const generation = ++cameraGeneration;
    const nextStream = await cameraAccess();
    if (generation !== cameraGeneration) { nextStream.getTracks().forEach(track => track.stop()); return; }
    stream = nextStream;
    const video = el('webcam'); video.srcObject = stream; await video.play();
    if (generation !== cameraGeneration) return;
    if (Date.now() >= captureDeadline) { stopCamera(); page('student'); el('receipt').textContent = 'Camera setup exceeded 40 seconds. Permission is now set; tap Mark attendance to retry.'; return; }
    el('captureStatus').textContent = 'Position your face, then capture. This demo does not verify identity.';
    el('capture').disabled = false;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (generation === cameraGeneration) { stopCamera(); el('captureStatus').textContent = 'Camera disconnected. Please retry.'; el('retryCamera').hidden = false; }
    });
    cameraTimer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((captureDeadline - Date.now()) / 1000));
      el('remaining').textContent = remaining + ' seconds remaining';
      if (!remaining && !saving) { stopCamera(); page('student'); el('receipt').textContent = 'Capture timed out. No record created. Tap Mark attendance to retry.'; }
    }, 250);
  } catch (error) {
    stopCamera();
    if (!el('cameraScreen').hidden) { el('captureStatus').textContent = cameraError(error); el('retryCamera').hidden = false; }
    else el('receipt').textContent = cameraError(error);
  } finally { opening = false; el('mark').disabled = false; }
};
el('capture').onclick = async () => {
  if (saving || !stream) return;
  const video = el('webcam');
  if (!video.videoWidth || video.readyState < 2) { el('captureStatus').textContent = 'Waiting for a camera frame. Please try again.'; return; }
  if (Date.now() >= captureDeadline) { stopCamera(); page('student'); el('receipt').textContent = 'Capture expired. Please try again.'; return; }
  saving = true; el('capture').disabled = true; el('cancelCapture').disabled = true;
  try {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / video.videoWidth);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL('image/jpeg', .75);
    el('captureStatus').textContent = 'Sending photo to the local coordinator preview...';
    const result = await api('/api/attendance', { sessionId: captureSession, studentId: el('studentId').value, photo });
    stopCamera(); page('student');
    el('receipt').textContent = 'Demo attendance ' + (result.replaced ? 'updated' : 'submitted') + ' for ' + result.studentId + '. See the photo in the coordinator tab. Pending verification.';
    await poll();
  } catch (error) { el('captureStatus').textContent = error.message; el('capture').disabled = !stream; }
  finally { saving = false; el('cancelCapture').disabled = false; }
};
el('cancelCapture').onclick = () => { stopCamera(); page('student'); el('receipt').textContent = 'Capture cancelled. No record created.'; };
el('retryCamera').onclick = () => { stopCamera(); page('student'); el('attendanceForm').requestSubmit(); };
el('toggleClass').onclick = async () => {
  el('toggleClass').disabled = true;
  try {
    await api(state.session ? '/api/close' : '/api/open', state.session ? { sessionId: state.session.id } : {});
    lastState = ''; await poll(); el('coordinatorError').textContent = '';
  } catch (error) { el('coordinatorError').textContent = error.message; await poll(); }
  finally { el('toggleClass').disabled = false; }
};
el('reset').onclick = () => { if (saving) return; stopCamera(); el('receipt').textContent = ''; el('studentId').value = ''; el('idError').textContent = ''; page(coordinator ? 'coordinator' : 'student'); };
window.addEventListener('pagehide', stopCamera);
page(coordinator ? 'coordinator' : 'student');
if (location.protocol === 'file:') {
  el('serverError').textContent = 'Use http://localhost:4173 instead of opening this file directly. Run node preview/start.mjs first.';
  el('mark').disabled = true; el('permissions').disabled = true; el('toggleClass').disabled = true;
} else { poll(); setInterval(poll, 1000); }

// Browser reminder tests: no background delivery or Android alarm simulation.
const reminderDialog = el('remindersDialog');
let reminderAudio = null, alarmTimer = null, alarmTicker = null, alarmStopTimer = null;
let alarmGeneration = 0, alarmOscillator = null, alarmGain = null, desktopReminder = null;
for (const id of ['studentReminders', 'coordinatorReminders']) el(id).onclick = () => reminderDialog.showModal();
function stopTestAlarm(message = 'Alarm stopped.') {
  alarmGeneration++;
  clearTimeout(alarmTimer); clearInterval(alarmTicker); clearTimeout(alarmStopTimer);
  alarmTimer = alarmTicker = alarmStopTimer = null;
  if (alarmOscillator) {
    try { alarmOscillator.stop(); } catch {}
    alarmOscillator.disconnect(); alarmOscillator = null;
  }
  if (alarmGain) { alarmGain.disconnect(); alarmGain = null; }
  const audio = reminderAudio; reminderAudio = null;
  if (audio && audio.state !== 'closed') audio.close().catch(() => {});
  el('testAlarm').disabled = false; el('stopAlarm').hidden = true;
  el('alarmStatus').textContent = message;
}
el('testNotification').onclick = async () => {
  el('testNotification').disabled = true;
  el('notificationPreview').hidden = false;
  el('notificationStatus').textContent = 'Reminder displayed below.';
  try {
    if (!('Notification' in window) || !window.isSecureContext) {
      el('notificationStatus').textContent = 'Reminder displayed below. Desktop notifications are unavailable here; use localhost in Chrome or Edge.';
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      el('notificationStatus').textContent = 'Reminder displayed below. Desktop notifications are blocked or not allowed. You can change this in the browser site settings.';
      return;
    }
    if (desktopReminder) desktopReminder.close();
    desktopReminder = new Notification('GVPCEW Attendance', {
      body: 'Time to mark your attendance. Open the student tab to continue.',
      tag: 'gvpcew-preview-test'
    });
    desktopReminder.onerror = () => {
      el('notificationStatus').textContent = 'Desktop notification could not be shown. The reminder is displayed below.';
    };
    el('notificationStatus').textContent = 'Desktop notification requested. If no banner appears, check Windows notification settings or Do not disturb. The reminder is also displayed below.';
  } catch {
    el('notificationStatus').textContent = 'Desktop notifications are unavailable. The reminder is displayed below.';
  } finally { el('testNotification').disabled = false; }
};
el('testAlarm').onclick = async () => {
  stopTestAlarm('Preparing alarm sound...');
  const generation = alarmGeneration;
  el('testAlarm').disabled = true; el('stopAlarm').hidden = false; el('stopAlarm').textContent = 'Cancel alarm';
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('This browser cannot play the test alarm. Try Chrome or Edge.');
    const audio = new Audio(); reminderAudio = audio;
    await audio.resume();
    if (generation !== alarmGeneration) return;
    if (audio.state !== 'running') throw new Error('Sound is blocked. Allow sound for this site and try again.');
    const due = Date.now() + 5000;
    const updateCountdown = () => { el('alarmStatus').textContent = 'Alarm in ' + Math.max(0, Math.ceil((due - Date.now()) / 1000)) + ' seconds...'; };
    updateCountdown(); alarmTicker = setInterval(updateCountdown, 250);
    alarmTimer = setTimeout(() => {
      if (generation !== alarmGeneration) return;
      clearInterval(alarmTicker); alarmTicker = null;
      try {
        if (audio.state !== 'running') throw new Error('Audio was paused by the browser. Try again with this tab active.');
        alarmOscillator = audio.createOscillator(); alarmGain = audio.createGain();
        alarmOscillator.type = 'sine'; alarmOscillator.frequency.value = 740;
        alarmOscillator.connect(alarmGain); alarmGain.connect(audio.destination);
        const start = audio.currentTime;
        // Gentle repeated beeps, with ramps to avoid clicks.
        alarmGain.gain.setValueAtTime(0, start);
        for (let i = 0; i < 20; i++) {
          const at = start + i * .75;
          alarmGain.gain.setValueAtTime(0, at);
          alarmGain.gain.linearRampToValueAtTime(.12, at + .03);
          alarmGain.gain.setValueAtTime(.12, at + .28);
          alarmGain.gain.linearRampToValueAtTime(0, at + .34);
        }
        alarmOscillator.start(start); alarmOscillator.stop(start + 15);
        el('alarmStatus').textContent = 'Alarm ringing - Time to mark attendance!';
        el('stopAlarm').textContent = 'Stop alarm';
        alarmStopTimer = setTimeout(() => stopTestAlarm('Test alarm finished.'), 15000);
      } catch (error) { stopTestAlarm(error.message || 'Could not play the alarm. Please retry.'); }
    }, 5000);
  } catch (error) {
    if (generation === alarmGeneration) stopTestAlarm(error.message || 'Could not enable sound. Check your browser sound settings.');
  }
};
el('stopAlarm').onclick = () => stopTestAlarm('Alarm cancelled or stopped.');
el('closeReminders').onclick = () => reminderDialog.close();
reminderDialog.addEventListener('close', () => stopTestAlarm('No alarm scheduled.'));
window.addEventListener('pagehide', () => {
  stopTestAlarm('No alarm scheduled.');
  if (desktopReminder) desktopReminder.close();
});
