import { useEffect, useState } from 'react';
import { buildTheme, extractPalette } from '../utils/palette.js';
import { wallpaperBlobUrl } from '../utils/wallpaperCache.js';

// Remote wallpapers are served without CORS headers, so drawing them straight to
// a canvas taints it. Fetching the bytes first (allowed by the extension's host
// permissions) and sampling a local blob avoids that entirely.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = url;
  });
}

// preload="metadata" plus a manual currentTime seek is unreliable across
// browsers for firing `loadeddata` (some never decode a frame without an
// active play()), which left video wallpapers stuck on the previous theme
// forever. Actually playing the clip — the same approach the per-card
// sampler uses successfully — guarantees a frame gets decoded.
function loadVideoFrame(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('video decode failed'));
    video.src = url;
    video.play().catch(() => {});
  });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export function useAdaptiveTheme(media) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    if (!media || media.kind === 'default' || !media.url) {
      setTheme(null);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = '';
    let videoSource = null;

    (async () => {
      try {
        const local = await wallpaperBlobUrl(media.url);
        if (local.revoke) {
          objectUrl = local.url;
        }

        // A stalled decode must not leave the theme frozen on whatever the
        // previous wallpaper looked like — cap the wait and fall back.
        const source = media.kind === 'video'
          ? await withTimeout(loadVideoFrame(local.url), 4000)
          : await loadImage(local.url);

        if (media.kind === 'video') {
          videoSource = source;
        }

        if (cancelled) {
          return;
        }

        setTheme(buildTheme(extractPalette(source)));
      } catch {
        if (!cancelled) {
          setTheme(null);
        }
      } finally {
        // This is a one-shot sample, not a live preview — nothing needs it to
        // keep decoding. Left running, it's a third video decoder alongside
        // the visible background and the per-card sampler's own loop.
        if (videoSource) {
          videoSource.pause();
          videoSource.removeAttribute('src');
          videoSource.load();
        }
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [media]);

  return theme;
}
