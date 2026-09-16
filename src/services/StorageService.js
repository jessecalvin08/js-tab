const hasChromeLocalStorage = () => Boolean(globalThis.chrome?.storage?.local);
const hasChromeSyncStorage = () => Boolean(globalThis.chrome?.storage?.sync);

// chrome.storage is async, so the very first paint would otherwise render the
// built-in defaults (green wallpaper and cards) before the real data arrives.
// Every write is mirrored to localStorage, which can be read synchronously
// during the first render to paint the correct board immediately.
const MIRROR_PREFIX = 'js-tab-sync:';

function writeMirror(key, value) {
  try {
    window.localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
  } catch {
    // mirror is an optimisation only
  }
}

// Dashboard state lives in chrome.storage.local: sync caps items at ~8KB, which
// the board outgrows once a few cards exist. Older installs are migrated on read.
export const StorageService = {
  // Read synchronously during the first render so nothing flashes.
  getSync(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(MIRROR_PREFIX + key)
        ?? (hasChromeLocalStorage() ? null : window.localStorage.getItem(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  async get(key, fallback = null) {
    if (hasChromeLocalStorage()) {
      const result = await chrome.storage.local.get(key);

      if (result[key] !== undefined) {
        return result[key];
      }

      if (hasChromeSyncStorage()) {
        const legacy = await chrome.storage.sync.get(key);
        if (legacy[key] !== undefined) {
          await chrome.storage.local.set({ [key]: legacy[key] });
          return legacy[key];
        }
      }

      return fallback;
    }

    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  },

  async set(key, value) {
    writeMirror(key, value);

    if (hasChromeLocalStorage()) {
      await chrome.storage.local.set({ [key]: value });
      return value;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
    return value;
  },

  async remove(key) {
    try {
      window.localStorage.removeItem(MIRROR_PREFIX + key);
    } catch {
      // ignore
    }

    if (hasChromeLocalStorage()) {
      await chrome.storage.local.remove(key);
      return;
    }

    window.localStorage.removeItem(key);
  }
};
