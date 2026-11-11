import { describe, expect, it } from 'vitest';
import { safeSpineColor, spineWidth } from '../src/lib/spine';

const PLANK_WIDTH = 756;
const SLOTS = 20;
const GAP = 3;
const PADDING = 28;

describe('spineWidth', () => {
  it('gives a film the same width every time', () => {
    expect(spineWidth(603)).toBe(spineWidth(603));
  });

  it('varies between films', () => {
    const widths = new Set([600, 601, 602, 603].map(spineWidth));
    expect(widths.size).toBeGreaterThan(1);
  });

  it('averages out to a full plank, so twenty spines neither overflow nor leave a hole', () => {
    const run = Array.from({ length: SLOTS }, (_, id) => spineWidth(id));
    const total = run.reduce((sum, width) => sum + width, 0) + GAP * (SLOTS - 1) + PADDING;
    expect(Math.abs(total - PLANK_WIDTH)).toBeLessThanOrEqual(2);
  });

  it('still answers for an id that is not a positive integer', () => {
    expect(spineWidth(-7)).toBeGreaterThan(0);
    expect(spineWidth(7.9)).toBeGreaterThan(0);
  });
});

describe('safeSpineColor', () => {
  it('passes the form colors.ts writes', () => {
    expect(safeSpineColor('hsl(210 42% 40%)')).toBe('hsl(210 42% 40%)');
  });

  it.each(['red;position:fixed', 'url(javascript:1)', 'hsl(210, 42%, 40%)', '', null, undefined])(
    'falls back to the blank spine for %j',
    (raw) => {
      expect(safeSpineColor(raw)).toBe('hsl(0 0% 100%)');
    },
  );
});
