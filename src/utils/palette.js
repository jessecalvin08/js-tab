// Samples a wallpaper down to a tiny canvas and buckets the pixels so the UI can
// retint itself to whatever the background actually looks like.
const SAMPLE_SIZE = 44;
const BUCKET_SHIFT = 4; // 16 levels per channel

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

function relativeLuminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function extractPalette(source) {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let pixels;
  try {
    pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null; // tainted canvas
  }

  const buckets = new Map();
  let luminanceTotal = 0;
  let counted = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    if (a < 125) {
      continue;
    }

    luminanceTotal += relativeLuminance(r, g, b);
    counted += 1;

    const key = `${r >> BUCKET_SHIFT},${g >> BUCKET_SHIFT},${b >> BUCKET_SHIFT}`;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  if (!counted) {
    return null;
  }

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
      count: bucket.count
    }))
    .sort((a, b) => b.count - a.count);

  // Drop near-duplicates so a sunset doesn't return five shades of one orange.
  const distinct = [];
  for (const colour of ranked) {
    const tooClose = distinct.some((kept) => (
      Math.abs(kept.r - colour.r) + Math.abs(kept.g - colour.g) + Math.abs(kept.b - colour.b) < 76
    ));

    if (!tooClose) {
      distinct.push(colour);
    }

    if (distinct.length === 5) {
      break;
    }
  }

  return {
    colours: distinct.map((colour) => ({ ...colour, ...rgbToHsl(colour.r, colour.g, colour.b) })),
    luminance: luminanceTotal / counted
  };
}

// Turns a sampled colour into a dark, readable pane of tinted glass. Hue and a
// muted amount of saturation survive; lightness is pinned so text stays legible
// no matter how bright the wallpaper is.
export function tintFor(colour, luminance) {
  const saturation = Math.round(Math.min(Math.max(colour.s * 100, 8), 46));
  const lightness = luminance > 0.62 ? 20 : 14;
  return `hsl(${colour.h} ${saturation}% ${lightness}% / 0.78)`;
}

export function buildTheme(palette) {
  if (!palette?.colours?.length) {
    return null;
  }

  const [primary] = palette.colours;
  const { luminance } = palette;
  const saturation = Math.round(Math.min(Math.max(primary.s * 100, 8), 46));

  return {
    tints: palette.colours.map((colour) => tintFor(colour, luminance)),
    border: `hsl(${primary.h} ${Math.min(saturation + 10, 60)}% 72% / 0.20)`,
    chrome: `hsl(${primary.h} ${saturation}% ${luminance > 0.62 ? 24 : 17}% / 0.72)`,
    accent: `hsl(${primary.h} ${Math.min(saturation + 20, 70)}% 45%)`,
    shell: `hsl(${primary.h} ${Math.min(saturation, 30)}% 8%)`
  };
}
