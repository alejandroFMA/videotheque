import { describe, expect, it } from 'vitest';
import { parsePostitColor, postitInk } from '../src/lib/postit';

describe('parsePostitColor', () => {
  it('accepts #rrggbb and lower-cases it', () => {
    expect(parsePostitColor('#9E2F26')).toBe('#9e2f26');
  });

  it.each(['#fff', '9e2f26', 'red', 'hsl(4 61% 38%)', '#9e2f26;position:fixed', '', null, 7])(
    'rejects %j',
    (raw) => {
      expect(parsePostitColor(raw)).toBeNull();
    },
  );
});

describe('postitInk', () => {
  it('letters a dark card in white', () => {
    expect(postitInk('#9e2f26')).toBe('#ffffff');
    expect(postitInk('#000000')).toBe('#ffffff');
  });

  it('letters a pale card in ink', () => {
    expect(postitInk('#ffe95c')).toBe('#171412');
    expect(postitInk('#ffffff')).toBe('#171412');
  });
});
