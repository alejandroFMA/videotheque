import { describe, expect, it } from 'vitest';
import { glowFilter, glowOnClose, glowOnOpen } from '../src/lib/case-glow';

describe('glowOnOpen', () => {
  it('is dark at rest and full at the top of the lift', () => {
    expect(glowOnOpen(0, 0.2)).toBe(0);
    expect(glowOnOpen(0.2, 0.2)).toBeCloseTo(1);
  });

  it('rises through the lift', () => {
    expect(glowOnOpen(0.05, 0.2)).toBeLessThan(glowOnOpen(0.15, 0.2));
  });

  it('is out by the end of its fade and stays out', () => {
    expect(glowOnOpen(0.2 + 0.4 * 0.8, 0.2)).toBeCloseTo(0);
    expect(glowOnOpen(1, 0.2)).toBe(0);
  });
});

describe('glowOnClose', () => {
  it('is dark leaving the centre, full at the drop, dark when seated', () => {
    expect(glowOnClose(0, 0.2)).toBe(0);
    expect(glowOnClose(0.8, 0.2)).toBeCloseTo(1);
    expect(glowOnClose(1, 0.2)).toBeCloseTo(0);
  });

  it('rises as the case nears its slot', () => {
    expect(glowOnClose(0.6, 0.2)).toBeLessThan(glowOnClose(0.75, 0.2));
  });
});

describe('glowFilter', () => {
  it('is none at level 0', () => {
    expect(glowFilter('hsl(0 0% 9%)', 0)).toBe('none');
  });

  it('lifts a dark spine to a visible lightness and keeps its hue', () => {
    const f = glowFilter('hsl(214 64% 28%)', 1);
    expect(f).toContain('hsl(214 64% 70% / 0.55)');
    expect(f).toContain('hsl(214 64% 70% / 0.3)');
    expect(f).toContain('3px');
    expect(f).toContain('12px');
  });

  it('keeps a light spine as it is', () => {
    expect(glowFilter('hsl(48 92% 80%)', 1)).toContain('hsl(48 92% 80% / 0.55)');
  });

  it('scales alpha with the level', () => {
    expect(glowFilter('hsl(0 0% 9%)', 0.5)).toContain('/ 0.275)');
  });

  it('falls back to warm white for a colour it cannot read', () => {
    expect(glowFilter('#2a2a2a', 1)).toContain('hsl(36 100% 92% / 0.55)');
  });
});
