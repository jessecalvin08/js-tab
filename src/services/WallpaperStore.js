// Uploaded wallpapers can be tens of megabytes (especially video), which is far
// beyond chrome.storage limits, so the blobs live in IndexedDB instead.
const DB_NAME = 'js-tab-wallpapers';
const STORE = 'uploads';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(mode, handler) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let outcome;

    try {
      outcome = handler(store);
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(outcome?.result ?? outcome);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  }));
}

// Content hash rather than name/size — a renamed copy of the same file (or a
// re-download) should still be recognised as the same upload.
async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const WallpaperStore = {
  hashFile,

  // `hash` is optional: pass a precomputed one, pass `null` to deliberately
  // skip hashing (e.g. a file too large to hash cheaply), or omit it to have
  // it computed here.
  async add(file, hash) {
    const record = {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      blob: file,
      mime: file.type,
      kind: file.type.startsWith('video') ? 'video' : 'image',
      name: file.name,
      hash: hash === undefined ? await hashFile(file) : hash,
      addedAt: Date.now()
    };

    await runTransaction('readwrite', (store) => store.put(record));
    return record;
  },

  async list() {
    const records = await runTransaction('readonly', (store) => store.getAll());
    return (records ?? []).sort((a, b) => b.addedAt - a.addedAt);
  },

  async findByHash(hash) {
    const records = await this.list();
    return records.find((record) => record.hash === hash) ?? null;
  },

  async get(id) {
    return runTransaction('readonly', (store) => store.get(id));
  },

  async remove(id) {
    return runTransaction('readwrite', (store) => store.delete(id));
  }
};
