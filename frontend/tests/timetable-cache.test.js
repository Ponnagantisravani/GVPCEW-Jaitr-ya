import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTimetableCache } from '../src/timetable-cache.js';

test('full browser storage does not crash timetable startup', () => {
  const storage = { setItem() { throw new DOMException('Quota exceeded', 'QuotaExceededError'); } };
  assert.equal(saveTimetableCache('timetable', { grid: {} }, storage), false);
});

test('unavailable browser storage does not crash timetable startup', () => {
  assert.equal(saveTimetableCache('timetable', {}, undefined), false);
});

test('timetable changes are cached when browser storage is available', () => {
  const entries = new Map();
  const storage = { setItem(key, value) { entries.set(key, value); } };
  assert.equal(saveTimetableCache('timetable', { grid: {} }, storage), true);
  assert.deepEqual(JSON.parse(entries.get('timetable')), { grid: {} });
});
