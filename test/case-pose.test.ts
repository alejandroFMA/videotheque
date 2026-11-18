import { describe, expect, it } from 'vitest';
import {
  CASE_DEPTH,
  CASE_WIDTH,
  REST_RY,
  VISIBLE_HEIGHT,
  caseLayout,
  centrePose,
  flipTarget,
  homeAngle,
  isFront,
  lerpPose,
  nearestFace,
  poseFromRect,
} from '../src/lib/case-pose';

const viewport = { width: 1000, height: 800 };

describe('poseFromRect', () => {
  it('starts the flight exactly on the spine', () => {
    const p = poseFromRect({ left: 100, top: 200, width: 34, height: 172 }, viewport);
    const k = VISIBLE_HEIGHT / viewport.height;
    expect(p.x / k + viewport.width / 2).toBeCloseTo(117);
    expect(-p.y / k + viewport.height / 2).toBeCloseTo(286);
    expect(p.s / k).toBeCloseTo(172);
    expect(p.ry).toBeCloseTo(Math.PI / 2);
    expect(p.d).toBeCloseTo(34 / 172 / CASE_DEPTH);
  });

  it('puts the spine face, not the box centre, on the screen plane', () => {
    // Spine-on, the spine face sits half the front width nearer the camera than
    // the centre; on z = 0 it projects at exactly the DOM spine's size.
    const p = poseFromRect({ left: 100, top: 200, width: 34, height: 172 }, viewport);
    expect(p.z + (CASE_WIDTH / 2) * p.s).toBeCloseTo(0);
  });
});

describe('faces', () => {
  it('settles on the nearest face', () => {
    expect(nearestFace(0.1)).toBeCloseTo(REST_RY);
    expect(nearestFace(2.5)).toBeCloseTo(Math.PI - REST_RY);
    expect(nearestFace(REST_RY + 4 * Math.PI + 0.2)).toBeCloseTo(REST_RY + 4 * Math.PI);
    expect(nearestFace(-2.9)).toBeCloseTo(-Math.PI - REST_RY);
  });

  it('goes home the short way after many turns', () => {
    expect(homeAngle(7 * Math.PI)).toBeCloseTo(Math.PI / 2 + 6 * Math.PI);
    expect(homeAngle(-0.5)).toBeCloseTo(Math.PI / 2);
  });

  it('flips between front and back', () => {
    expect(isFront(REST_RY)).toBe(true);
    expect(isFront(flipTarget(REST_RY))).toBe(false);
    expect(isFront(flipTarget(Math.PI - REST_RY))).toBe(true);
  });
});

describe('caseLayout', () => {
  it('sizes the case by viewport', () => {
    expect(caseLayout({ width: 1600, height: 1000 }).caseHeight).toBe(700);
    expect(caseLayout({ width: 1600, height: 1000 }).narrow).toBe(false);
    const phone = caseLayout({ width: 390, height: 844 });
    expect(phone.narrow).toBe(true);
    expect(phone.cx).toBe(195);
  });

  it('puts a centre pose at rest with its real thickness', () => {
    const p = centrePose(caseLayout(viewport), viewport);
    expect(p.ry).toBe(REST_RY);
    expect(p.d).toBe(1);
  });
});

describe('lerpPose', () => {
  it('interpolates every field', () => {
    const a = { x: 0, y: 0, z: 0, s: 1, ry: 0, d: 2 };
    const b = { x: 2, y: 4, z: 6, s: 3, ry: 1, d: 1 };
    expect(lerpPose(a, b, 0.5)).toEqual({ x: 1, y: 2, z: 3, s: 2, ry: 0.5, d: 1.5 });
  });
});
