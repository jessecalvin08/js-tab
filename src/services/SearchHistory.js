const PREFIX = 'js-tab-history-';
const LIMIT = 40;

export function loadHistory(kind) {
  try {
    const list = JSON.parse(window.localStorage.getItem(PREFIX + kind) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function persist(kind, list) {
  try {
    window.localStorage.setItem(PREFIX + kind, JSON.stringify(list));
  } catch {
    // history is best-effort
  }
  return list;
}

// Most recent first, case-insensitive de-duplication.
export function addHistory(kind, query) {
  const value = query.trim();
  if (!value) {
    return loadHistory(kind);
  }
  const rest = loadHistory(kind).filter((item) => item.toLowerCase() !== value.toLowerCase());
  return persist(kind, [value, ...rest].slice(0, LIMIT));
}

export function removeHistory(kind, query) {
  return persist(kind, loadHistory(kind).filter((item) => item !== query));
}

// Past entries containing what is being typed, or the latest ones when nothing is typed.
export function matchHistory(list, typed, max) {
  const needle = typed.trim().toLowerCase();
  const hits = needle
    ? list.filter((item) => item.toLowerCase().includes(needle) && item.toLowerCase() !== needle)
    : list;
  return hits.slice(0, max);
}
