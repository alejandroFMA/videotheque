import { posterUrl } from './tmdb-mapping';

/**
 * The spine colour, computed in the browser from the public poster. Per
 * CLAUDE.md this is the only value the browser is trusted with, and it is
 * written once — by whoever adds the film first — and never recomputed.
 */

const SAMPLE_WIDTH = 18;
const SAMPLE_HEIGHT = 27;
// Deliberately NOT the w92 the search dropdown renders its thumbnails at.
// image.tmdb.org only sends Access-Control-Allow-Origin when the request
// carries an Origin header, so a plain <img> caches a CORS-less response; a
// later crossOrigin request for that same URL is refused against the cache
// entry and every spine silently falls back. A separate size keeps the two
// uses in separate cache entries, so reading pixels can never break the
// visible thumbnail — and the thumbnail can never break the colour.
const POSTER_SIZE = 'w154';

// Saturated pixels carry the poster's identity. Near-black and near-white ones
// are shadow and paper, so they are discounted rather than dropped: a poster
// that really is mostly black still has to yield some hue.
const BASE_WEIGHT = 0.25;
const SATURATION_WEIGHT = 1.5;
const FLAT_PIXEL_DISCOUNT = 0.2;
const MIN_LIVELY_LIGHTNESS = 0.12;
const MAX_LIVELY_LIGHTNESS = 0.9;

// The printable band. Outside it a spine either glows or turns to mud next to
// its neighbours on the plank.
const MIN_SATURATION = 0.3;
const MAX_SATURATION = 0.68;
const MIN_LIGHTNESS = 0.3;
const MAX_LIGHTNESS = 0.58;

// Sits inside the clamped band above, so both branches are reachable. It
// decides whether the spine title is drawn in bone or in ink.
const DARK_SPINE_LIGHTNESS = 0.45;

const FALLBACK_HUES = [8, 28, 44, 142, 192, 214, 268, 330];
const FALLBACK_SATURATION = 42;
const FALLBACK_LIGHTNESS = 40;

// `films.spine_color` is a global cache: one bad write is every user's spine
// for that film. This is not a derived colour — it is the marker for "no
// colour could be extracted" — so it deliberately sits outside the 30-58%
// lightness clamp every real spine obeys; reading as blank is the point.
const WHITE_SPINE: Spine = { spineColor: 'hsl(0 0% 100%)', spineDark: false };

const BYTES_PER_PIXEL = 4;
const MAX_BYTE = 255;
const PERCENT = 100;
const DEGREES_PER_SECTOR = 60;
const SECTORS = 6;

export interface Spine {
  spineColor: string;
  spineDark: boolean;
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / MAX_BYTE;
  const green = g / MAX_BYTE;
  const blue = b / MAX_BYTE;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? SECTORS : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return [hue * DEGREES_PER_SECTOR, saturation, lightness];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function spine(hue: number, saturation: number, lightness: number): Spine {
  return {
    spineColor: `hsl(${Math.round(hue)} ${Math.round(saturation * PERCENT)}% ${Math.round(
      lightness * PERCENT,
    )}%)`,
    spineDark: lightness < DARK_SPINE_LIGHTNESS,
  };
}

/** Takes the RGBA bytes a canvas hands back. Pure, so the weighting is testable
 *  without a DOM — the vitest environment is `node`. */
export function spineFromPixels(data: Uint8ClampedArray): Spine {
  if (data.length === 0) throw new RangeError('[colors] cannot average an empty buffer');

  let red = 0;
  let green = 0;
  let blue = 0;
  let total = 0;

  for (let i = 0; i < data.length; i += BYTES_PER_PIXEL) {
    const [, saturation, lightness] = toHsl(data[i], data[i + 1], data[i + 2]);
    const lively = lightness > MIN_LIVELY_LIGHTNESS && lightness < MAX_LIVELY_LIGHTNESS;
    const weight =
      BASE_WEIGHT + saturation * SATURATION_WEIGHT * (lively ? 1 : FLAT_PIXEL_DISCOUNT);
    red += data[i] * weight;
    green += data[i + 1] * weight;
    blue += data[i + 2] * weight;
    total += weight;
  }

  const [hue, saturation, lightness] = toHsl(red / total, green / total, blue / total);
  // Unreachable today: total accumulates at least BASE_WEIGHT per pixel, so
  // this division cannot produce NaN. Kept as a last-resort net so a future
  // change to the weighting cannot write NaN into a cache every user shares.
  if (!Number.isFinite(hue) || !Number.isFinite(saturation) || !Number.isFinite(lightness)) {
    return WHITE_SPINE;
  }
  return spine(
    hue,
    clamp(saturation, MIN_SATURATION, MAX_SATURATION),
    clamp(lightness, MIN_LIGHTNESS, MAX_LIGHTNESS),
  );
}

/** For a film with no poster, or a poster that will not load. Keyed on the id so
 *  the same film always gets the same colour. A non-integer id (e.g. from a
 *  malformed caller) has no place in FALLBACK_HUES and would otherwise divide
 *  down to `hsl(NaN ...)`, which the server rejects. */
export function fallbackSpine(tmdbId: number): Spine {
  if (!Number.isSafeInteger(tmdbId)) return WHITE_SPINE;
  const hue = FALLBACK_HUES[Math.abs(tmdbId) % FALLBACK_HUES.length];
  return spine(hue, FALLBACK_SATURATION / PERCENT, FALLBACK_LIGHTNESS / PERCENT);
}

/** Browser only — needs a canvas. Never rejects: a colour must always come back,
 *  because the add-film request cannot be made without one. */
export function spineFromPoster(posterPath: string | null, tmdbId: number): Promise<Spine> {
  const url = posterUrl(posterPath, POSTER_SIZE);
  if (!url) return Promise.resolve(fallbackSpine(tmdbId));

  return new Promise((resolve) => {
    const image = new Image();
    // image.tmdb.org serves CORS headers; without this the canvas is tainted
    // and getImageData throws.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) return resolve(fallbackSpine(tmdbId));
        context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        resolve(spineFromPixels(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data));
      } catch {
        resolve(fallbackSpine(tmdbId));
      }
    };
    image.onerror = () => resolve(fallbackSpine(tmdbId));
    image.src = url;
  });
}
