import { describe, expect, it } from 'vitest';
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_PX,
  canDropOn,
  deleteShelfTitle,
  edgeScrollStep,
  movedFarEnough,
  SHELF_DRAG_THRESHOLD_PX,
  SPINE_DRAG_THRESHOLD_PX,
} from '../src/lib/shelf-rules';
import { SHELF_CAPACITY } from '../src/constants';

describe('canDropOn', () => {
  it('refuses a full shelf the film is not already on', () => {
    expect(canDropOn(SHELF_CAPACITY, false)).toBe(false);
  });

  it('accepts a shelf with room', () => {
    expect(canDropOn(SHELF_CAPACITY - 1, false)).toBe(true);
  });

  it("always accepts the film's own shelf, full or not", () => {
    expect(canDropOn(SHELF_CAPACITY, true)).toBe(true);
  });
});

describe('deleteShelfTitle', () => {
  it('names a labelled shelf and counts its films', () => {
    expect(deleteShelfTitle('Terror', 12)).toBe('¿Borrar «Terror» y sus 12 películas?');
  });

  it('falls back to "esta balda" without a label', () => {
    expect(deleteShelfTitle(null, 2)).toBe('¿Borrar esta balda y sus 2 películas?');
  });

  it('uses the singular for one film', () => {
    expect(deleteShelfTitle('Terror', 1)).toBe('¿Borrar «Terror» y su película?');
  });

  it('mentions no films on an empty shelf', () => {
    expect(deleteShelfTitle(null, 0)).toBe('¿Borrar esta balda?');
  });
});

describe('edgeScrollStep', () => {
  const HEIGHT = 800;

  it('does not scroll away from the edges', () => {
    expect(edgeScrollStep(HEIGHT / 2, HEIGHT)).toBe(0);
    expect(edgeScrollStep(AUTO_SCROLL_EDGE_PX, HEIGHT)).toBe(0);
    expect(edgeScrollStep(HEIGHT - AUTO_SCROLL_EDGE_PX, HEIGHT)).toBe(0);
  });

  it('scrolls down near the bottom, faster the closer the finger is', () => {
    const near = edgeScrollStep(HEIGHT - AUTO_SCROLL_EDGE_PX / 2, HEIGHT);
    const nearer = edgeScrollStep(HEIGHT - 1, HEIGHT);
    expect(near).toBeGreaterThan(0);
    expect(nearer).toBeGreaterThan(near);
    expect(edgeScrollStep(HEIGHT, HEIGHT)).toBe(AUTO_SCROLL_MAX_PX);
  });

  it('scrolls up near the top', () => {
    expect(edgeScrollStep(1, HEIGHT)).toBeLessThan(0);
    expect(edgeScrollStep(0, HEIGHT)).toBe(-AUTO_SCROLL_MAX_PX);
  });

  it('never exceeds the maximum step past the viewport', () => {
    expect(edgeScrollStep(-50, HEIGHT)).toBe(-AUTO_SCROLL_MAX_PX);
    expect(edgeScrollStep(HEIGHT + 50, HEIGHT)).toBe(AUTO_SCROLL_MAX_PX);
  });
});

describe('movedFarEnough', () => {
  it('lifts a spine once the mouse travels the threshold in any direction', () => {
    expect(movedFarEnough('spine', SPINE_DRAG_THRESHOLD_PX, 0)).toBe(true);
    expect(movedFarEnough('spine', 0, SPINE_DRAG_THRESHOLD_PX - 1)).toBe(false);
  });

  it('does not lift a shelf on the jitter of a click on its postit', () => {
    expect(movedFarEnough('shelf', 4, 6)).toBe(false);
    expect(movedFarEnough('shelf', 0, SHELF_DRAG_THRESHOLD_PX - 1)).toBe(false);
  });

  it('lifts a shelf only on vertical travel, the only way a shelf moves', () => {
    expect(movedFarEnough('shelf', SHELF_DRAG_THRESHOLD_PX * 3, 0)).toBe(false);
    expect(movedFarEnough('shelf', 0, -SHELF_DRAG_THRESHOLD_PX)).toBe(true);
  });
});
