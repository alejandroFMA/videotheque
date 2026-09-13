import { describe, expect, it } from 'vitest';
import { fallbackSpine, spineFromPixels } from '../src/lib/colors';

const PATTERN = /^hsl\((\d{1,3}) (\d{1,3})% (\d{1,3})%\)$/;

/** One flat colour repeated, as RGBA bytes — the shape a canvas hands back. */
function solid(r: number, g: number, b: number, pixels = 4): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

describe('spineFromPixels', () => {
  it('returns a string the add-film endpoint will accept', () => {
    expect(spineFromPixels(solid(200, 30, 30)).spineColor).toMatch(PATTERN);
  });

  it('keeps the hue of a saturated poster', () => {
    const [, hue] = PATTERN.exec(spineFromPixels(solid(200, 30, 30)).spineColor)!;
    expect(Number(hue)).toBeLessThan(20);
  });

  it('clamps saturation and lightness into the printable band', () => {
    for (const sample of [solid(0, 0, 0), solid(255, 255, 255), solid(255, 0, 255)]) {
      const [, , saturation, lightness] = PATTERN.exec(spineFromPixels(sample).spineColor)!;
      expect(Number(saturation)).toBeGreaterThanOrEqual(30);
      expect(Number(saturation)).toBeLessThanOrEqual(68);
      expect(Number(lightness)).toBeGreaterThanOrEqual(30);
      expect(Number(lightness)).toBeLessThanOrEqual(58);
    }
  });

  it('marks a spine dark below 45% lightness and light above it', () => {
    expect(spineFromPixels(solid(0, 0, 0)).spineDark).toBe(true);
    expect(spineFromPixels(solid(255, 255, 255)).spineDark).toBe(false);
  });

  it('refuses an empty buffer rather than dividing by zero', () => {
    expect(() => spineFromPixels(new Uint8ClampedArray(0))).toThrow(RangeError);
  });
});

describe('fallbackSpine', () => {
  it('is stable for one id and valid for every id', () => {
    expect(fallbackSpine(603)).toEqual(fallbackSpine(603));
    for (let id = 0; id < 10; id += 1) {
      expect(fallbackSpine(id).spineColor).toMatch(PATTERN);
    }
  });
});
