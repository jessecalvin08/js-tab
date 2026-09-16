import { useEffect, useState } from 'react';
import { WallpaperStore } from '../services/WallpaperStore.js';

// Resolves the active wallpaper into something renderable. Uploaded media is a
// blob in IndexedDB, so it needs an object URL that is revoked when it changes.
export function useWallpaperMedia(wallpaper) {
  const [media, setMedia] = useState({ kind: 'default' });

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    if (!wallpaper || wallpaper.kind === 'default') {
      setMedia({ kind: 'default' });
      return undefined;
    }

    if (wallpaper.kind === 'preset') {
      setMedia({ kind: 'image', url: wallpaper.url });
      return undefined;
    }

    WallpaperStore.get(wallpaper.uploadId).then((record) => {
      if (cancelled) {
        return;
      }

      if (!record) {
        setMedia({ kind: 'default' });
        return;
      }

      objectUrl = URL.createObjectURL(record.blob);
      setMedia({ kind: record.kind === 'video' ? 'video' : 'image', url: objectUrl });
    }).catch(() => {
      if (!cancelled) {
        setMedia({ kind: 'default' });
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [wallpaper]);

  return media;
}
