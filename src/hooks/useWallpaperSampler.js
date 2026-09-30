import { useCallback, useEffect, useRef, useState } from 'react';
import { tintFor } from '../utils/palette.js';
import { wallpaperBlobUrl } from '../utils/wallpaperCache.js';

// The wallpaper is painted into a small offscreen canvas using the same "cover"
// geometry the page uses, so a card's screen rectangle maps straight onto it.
// That lets each card read the colour of the patch of wallpaper it is actually
// sitting on, rather than sharing one global tint.
const SAMPLE_WIDTH = 240;
const VIDEO_RESAMPLE_MS = 900;

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
  }

  h = Math.round(h * 60);
  if (h < 0) {
    h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = url;
  });
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('video decode failed'));
    video.src = url;
    video.play().catch(() => {});
  });
}

export function useWallpaperSampler(media) {
  const canvasRef = useRef(null);
  const sourceRef = useRef(null);
  const [version, setVersion] = useState(0);

  const paint = useCallback(() => {
    const source = sourceRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) {
      return false;
    }

    const viewportW = window.innerWidth || 1;
    const viewportH = window.innerHeight || 1;
    const width = SAMPLE_WIDTH;
    const height = Math.max(1, Math.round(SAMPLE_WIDTH * (viewportH / viewportW)));

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return false;
    }

    const sw = source.naturalWidth || source.videoWidth;
    const sh = source.naturalHeight || source.videoHeight;
    if (!sw || !sh) {
      return false;
    }

    // Mirror background-size: cover / object-fit: cover.
    const scale = Math.max(width / sw, height / sh);
    const dw = sw * scale;
    const dh = sh * scale;

    try {
      context.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    let timer = null;

    sourceRef.current = null;
    canvasRef.current = null;

    if (!media || media.kind === 'default' || !media.url) {
      setVersion((v) => v + 1);
      return undefined;
    }

    (async () => {
      try {
        const local = await wallpaperBlobUrl(media.url);
        if (local.revoke) {
          objectUrl = local.url;
        }

        const source = media.kind === 'video' ? await loadVideo(local.url) : await loadImage(local.url);
        if (cancelled) {
          return;
        }

        sourceRef.current = source;
        canvasRef.current = document.createElement('canvas');
        paint();
        setVersion((v) => v + 1);

        // A motion background keeps changing, so re-read it on a slow timer —
        // only while the tab is actually visible.
        if (media.kind === 'video') {
          timer = setInterval(() => {
            if (document.hidden) {
              return;
            }
            if (paint()) {
              setVersion((v) => v + 1);
            }
          }, VIDEO_RESAMPLE_MS);
        }
      } catch {
        if (!cancelled) {
          sourceRef.current = null;
          canvasRef.current = null;
          setVersion((v) => v + 1);
        }
      }
    })();

    const onResize = () => {
      if (paint()) {
        setVersion((v) => v + 1);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      if (timer) {
        clearInterval(timer);
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [media, paint]);

  // Raw pixels of the wallpaper under an on-screen rectangle.
  const readRect = useCallback((rect) => {
    const canvas = canvasRef.current;
    if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }

    const scaleX = canvas.width / (window.innerWidth || 1);
    const scaleY = canvas.height / (window.innerHeight || 1);

    const x = Math.max(0, Math.min(canvas.width - 1, Math.round(rect.left * scaleX)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.round(rect.top * scaleY)));
    const w = Math.max(1, Math.min(canvas.width - x, Math.round(rect.width * scaleX)));
    const h = Math.max(1, Math.min(canvas.height - y, Math.round(rect.height * scaleY)));

    try {
      return context.getImageData(x, y, w, h).data;
    } catch {
      return null;
    }
  }, []);

  // WCAG relative luminance (0 black - 1 white) of the wallpaper under a rect,
  // used to pick text/icon colour for controls that sit on bare background.
  const sampleLuminance = useCallback((rect) => {
    const pixels = readRect(rect);
    if (!pixels) {
      return null;
    }

    const linear = (value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };

    let total = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 125) {
        continue;
      }
      total += 0.2126 * linear(pixels[i]) + 0.7152 * linear(pixels[i + 1]) + 0.0722 * linear(pixels[i + 2]);
      count += 1;
    }

    return count ? total / count : null;
  }, [readRect]);

  // Average the wallpaper under a card's on-screen rectangle.
  const sampleRect = useCallback((rect) => {
    const pixels = readRect(rect);
    if (!pixels) {
      return null;
    }

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 125) {
        continue;
      }
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      count += 1;
    }

    if (!count) {
      return null;
    }

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    const hsl = rgbToHsl(r, g, b);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return tintFor(hsl, luminance);
  }, [readRect]);

  return { sampleRect, sampleLuminance, version, ready: Boolean(canvasRef.current) };
}
