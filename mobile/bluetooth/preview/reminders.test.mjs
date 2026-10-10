import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('./app.js', import.meta.url), 'utf8')).split('// Browser reminder tests:')[1];
function harness({ permission = 'granted', resume } = {}) {
  const nodes = new Map(), timers = new Map(), audioInstances = [], notifications = [];
  let token = 0;
  const el = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', disabled: false,
      addEventListener(event, handler) { this[event] = handler; },
      showModal() { this.open = true; }, close() { this.open = false; this['closedHandler']?.(); }
    });
    return nodes.get(id);
  };
  el('remindersDialog').addEventListener = (event, callback) => { if (event === 'close') el('remindersDialog').closedHandler = callback; };
  class Audio {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.stopped = false; audioInstances.push(this); }
    async resume() { if (resume) await resume(); }
    async close() { this.state = 'closed'; }
    createOscillator() { const owner = this; return { frequency: {}, connect() {}, disconnect() {}, start() { owner.started = true; }, stop() { owner.stopped = true; } }; }
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; }
  }
  class Notification {
    static permission = permission;
    static async requestPermission() { return permission; }
    constructor(title) { this.title = title; notifications.push(this); }
    close() { this.closed = true; }
  }
  const window = { AudioContext: Audio, Notification, isSecureContext: true, addEventListener() {} };
  vm.runInNewContext('// Browser reminder tests:' + source, { el, window, Notification, Date,
    setTimeout(fn, ms) { const id = ++token; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return ++token; }, clearInterval() {}
  });
  return { el, timers, audioInstances, notifications, fire(ms) {
    const entry = [...timers].find(([, t]) => t.ms === ms);
    assert.ok(entry, 'Expected timer for ' + ms); timers.delete(entry[0]); entry[1].fn();
  } };
}
test('blocked desktop permission still displays the on-screen reminder', async () => {
  const h = harness({ permission: 'denied' });
  await h.el('testNotification').onclick();
  assert.equal(h.el('notificationPreview').hidden, false);
  assert.match(h.el('notificationStatus').textContent, /blocked/);
  assert.equal(h.notifications.length, 0);
  assert.equal(h.el('testNotification').disabled, false);
});
test('desktop notification errors give a visible fallback', async () => {
  const h = harness(); await h.el('testNotification').onclick();
  assert.equal(h.notifications.length, 1);
  h.notifications[0].onerror();
  assert.match(h.el('notificationStatus').textContent, /could not be shown/);
});
test('cancelling a countdown removes its timer and closes audio', async () => {
  const h = harness(); await h.el('testAlarm').onclick();
  assert.equal(h.timers.size, 1);
  h.el('stopAlarm').onclick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.audioInstances[0].state, 'closed');
  assert.equal(h.audioInstances[0].started, undefined);
});
test('alarm rings after five seconds and closing the panel stops it', async () => {
  const h = harness(); await h.el('testAlarm').onclick(); h.fire(5000);
  assert.equal(h.audioInstances[0].started, true);
  assert.match(h.el('alarmStatus').textContent, /ringing/);
  h.el('closeReminders').onclick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.audioInstances[0].state, 'closed');
  assert.equal(h.el('stopAlarm').hidden, true);
});
test('closing while audio permission is pending does not schedule a stale alarm', async () => {
  let resolve; const wait = new Promise(done => { resolve = done; });
  const h = harness({ resume: () => wait });
  const pending = h.el('testAlarm').onclick();
  h.el('closeReminders').onclick(); resolve(); await pending;
  assert.equal(h.timers.size, 0);
  assert.equal(h.audioInstances[0].state, 'closed');
});
test('alarm automatically finishes after fifteen seconds of sound', async () => {
  const h = harness(); await h.el('testAlarm').onclick(); h.fire(5000); h.fire(15000);
  assert.equal(h.audioInstances[0].state, 'closed');
  assert.match(h.el('alarmStatus').textContent, /finished/);
});
