// Keeps the last recording whose upload failed, so it can be saved to disk.
const DB = 'vidpitch';
const STORE = 'failed';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export const saveFailed = (blob, title) => tx('readwrite', (s) => s.put({ blob, title, at: Date.now() }, 'last'));
export const loadFailed = () => tx('readonly', (s) => s.get('last'));
export const clearFailed = () => tx('readwrite', (s) => s.delete('last'));
