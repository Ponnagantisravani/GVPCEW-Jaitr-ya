export function saveTimetableCache(key, value, storage = globalThis.localStorage) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
