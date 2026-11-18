/**
 * The 3D case's geometry and poses, in plain numbers: no Three.js, no DOM,
 * so the maths behind the flight and the turning is testable in node.
 *
 * World units: the camera looks down -z from CAMERA_Z, and the plane z = 0
 * is VISIBLE_HEIGHT tall on screen. A pose's `s` is the case's height in
 * those units, `ry` its turn about the vertical axis, and `d` a multiplier
 * on its thickness — the case leaves the shelf as wide as the DOM spine and
 * thins to its real depth on the way out.
 */

export interface Pose {
  x: number;
  y: number;
  z: number;
  s: number;
  ry: number;
  d: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CaseLayout {
  /** Where the case's centre sits on screen, in CSS pixels. */
  cx: number;
  cy: number;
  caseHeight: number;
  narrow: boolean;
}

/** A VHS slipcase: front width and thickness as fractions of its height. */
export const CASE_WIDTH = 0.56;
export const CASE_DEPTH = 0.14;
/** Turned slightly towards its spine, which sits left of the front. */
export const REST_RY = 0.35;
export const FOV_DEG = 22;
export const CAMERA_Z = 10;
export const VISIBLE_HEIGHT = 2 * CAMERA_Z * Math.tan(((FOV_DEG / 2) * Math.PI) / 180);
export const NARROW_PX = 760;
export const DRAG_RAD_PER_PX = 0.009;

const SPINE_ON = Math.PI / 2;
const TURN = 2 * Math.PI;

const DESKTOP_MAX_HEIGHT = 700;
const DESKTOP_HEIGHT_SHARE = 0.86;
const DESKTOP_WIDTH_SHARE = 0.6;
const DESKTOP_SHIFT_MAX = 210;
const DESKTOP_SHIFT_SHARE = 0.22;
const NARROW_HEIGHT_SHARE = 0.56;
const NARROW_MAX_HEIGHT = 460;
const NARROW_TOP = 40;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    s: lerp(a.s, b.s, t),
    ry: lerp(a.ry, b.ry, t),
    d: lerp(a.d, b.d, t),
  };
}

const pixelsToWorld = (viewport: Viewport) => VISIBLE_HEIGHT / viewport.height;

/** The case standing in the slot: spine-on, exactly over the DOM spine. The
 *  box is pushed back so its spine face, not its centre, lies on z = 0, where
 *  world units map to screen pixels without perspective growth. */
export function poseFromRect(rect: ScreenRect, viewport: Viewport): Pose {
  const k = pixelsToWorld(viewport);
  const s = rect.height * k;
  return {
    x: (rect.left + rect.width / 2 - viewport.width / 2) * k,
    y: -(rect.top + rect.height / 2 - viewport.height / 2) * k,
    z: -(CASE_WIDTH / 2) * s,
    s,
    ry: SPINE_ON,
    d: rect.width / rect.height / CASE_DEPTH,
  };
}

export function caseLayout(viewport: Viewport): CaseLayout {
  const { width: w, height: h } = viewport;
  if (w >= NARROW_PX) {
    return {
      cx: w / 2 - Math.min(DESKTOP_SHIFT_MAX, w * DESKTOP_SHIFT_SHARE),
      cy: h / 2,
      caseHeight: Math.min(DESKTOP_MAX_HEIGHT, h * DESKTOP_HEIGHT_SHARE, w * DESKTOP_WIDTH_SHARE),
      narrow: false,
    };
  }
  const caseHeight = Math.min(h * NARROW_HEIGHT_SHARE, NARROW_MAX_HEIGHT);
  return { cx: w / 2, cy: NARROW_TOP + caseHeight / 2, caseHeight, narrow: true };
}

export function centrePose(layout: CaseLayout, viewport: Viewport, ry = REST_RY): Pose {
  const k = pixelsToWorld(viewport);
  return {
    x: (layout.cx - viewport.width / 2) * k,
    y: -(layout.cy - viewport.height / 2) * k,
    z: 0,
    s: layout.caseHeight * k,
    ry,
    d: 1,
  };
}

const nearestTurnOf = (angle: number, ry: number) => angle + TURN * Math.round((ry - angle) / TURN);

const FRONT = REST_RY;
/** The back, with the spine on the right: a tape flipped in the hand. */
const BACK = Math.PI - REST_RY;

export function nearestFace(ry: number): number {
  const front = nearestTurnOf(FRONT, ry);
  const back = nearestTurnOf(BACK, ry);
  return Math.abs(front - ry) <= Math.abs(back - ry) ? front : back;
}

export function isFront(ry: number): boolean {
  return Math.cos(ry - FRONT) > Math.cos(ry - BACK);
}

/** From the nearest face to the other one, always turning the same way. */
export function flipTarget(ry: number): number {
  const face = nearestFace(ry);
  return face + (isFront(face) ? BACK - FRONT : TURN - (BACK - FRONT));
}

/** Spine-on again, the short way round however many turns the case made. */
export function homeAngle(ry: number): number {
  return nearestTurnOf(SPINE_ON, ry);
}
