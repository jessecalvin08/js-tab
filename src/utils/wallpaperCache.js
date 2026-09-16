// Preset wallpapers are fetched from the network. Keeping a copy in the Cache
// Storage API means the same wallpaper paints instantly on later tabs and still
// works with no connection.
const CACHE_NAME = 'js-tab-wallpapers-v1';

export async function wallpaperBlobUrl(url) {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return { url, revoke: false };
  }

  if (globalThis.caches) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);

      if (hit) {
        return { url: URL.createObjectURL(await hit.blob()), revoke: true };
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`wallpaper fetch failed: ${response.status}`);
      }

      await cache.put(url, response.clone());
      return { url: URL.createObjectURL(await response.blob()), revoke: true };
    } catch {
      // fall through to a plain fetch below
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`wallpaper fetch failed: ${response.status}`);
  }

  return { url: URL.createObjectURL(await response.blob()), revoke: true };
}
