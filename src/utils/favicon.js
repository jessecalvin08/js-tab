// Previously every bookmark's domain was sent to a third-party icon service on
// every new tab, which leaks the user's saved sites. Chrome can serve icons from
// its own local cache instead, with no network request at all.
const canUseChromeFavicons = () => Boolean(globalThis.chrome?.runtime?.getURL);

export function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function faviconUrl(url) {
  if (!url) {
    return '';
  }

  if (canUseChromeFavicons()) {
    try {
      const endpoint = new URL(chrome.runtime.getURL('/_favicon/'));
      endpoint.searchParams.set('pageUrl', url);
      endpoint.searchParams.set('size', '32');
      return endpoint.toString();
    } catch {
      // fall through to the remote service below
    }
  }

  const hostname = getHostname(url);
  return hostname ? `https://icons.duckduckgo.com/ip3/${hostname}.ico` : '';
}

const LETTER_COLOURS = ['#4f7f5a', '#6b5b8f', '#8f5b5b', '#5b7f8f', '#8f7f5b', '#5f8f6f'];

// Drawn locally as a data URI so a missing icon never triggers a network call.
export function letterAvatar(url, title = '') {
  const source = (title || getHostname(url) || '?').trim();
  const letter = (source[0] || '?').toUpperCase();
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }

  const background = LETTER_COLOURS[hash % LETTER_COLOURS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="${background}"/><text x="16" y="21" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">${letter}</text></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
