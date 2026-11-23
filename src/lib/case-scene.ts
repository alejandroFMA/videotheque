/**
 * The pulled-out VHS case in Three.js: renderer, scene, and the controller
 * that flies the case out of its slot, turns it and flies it home. The only
 * module that imports `three`; Bookcase loads it with a dynamic import on the
 * first open, so neither the library nor the GPU touch the shelf render.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { distinctScenes, firstLoaded, parseCaseDetails, type CaseDetails } from './case-details';
import {
  CAMERA_Z,
  CASE_DEPTH,
  CASE_WIDTH,
  DRAG_RAD_PER_PX,
  FOV_DEG,
  caseLayout,
  centrePose,
  flipTarget,
  homeAngle,
  lerpPose,
  nearestFace,
  poseFromRect,
  type Pose,
} from './case-pose';
import { glowFilter, glowOnClose, glowOnOpen } from './case-glow';
import {
  backCanvas,
  edgeCanvas,
  frontCanvas,
  loadCaseFonts,
  sideCanvas,
  spineCanvas,
  type CaseFilm,
  type CaseImages,
} from './case-textures';
import { posterUrl } from './tmdb-mapping';

export interface CaseControllerOptions {
  /** Full-viewport element the canvas is mounted in. */
  layer: HTMLElement;
  /** A click or tap that missed the case: the owner should close the dialog. */
  onCloseRequest: () => void;
}

export interface CaseController {
  open(slot: HTMLElement): Promise<void>;
  flip(): void;
  close(): Promise<void>;
  /** Fade the case out where it is: after a remove there is no slot to return to. */
  dismiss(): Promise<void>;
  /** Drop whatever is out at once, mid-load or mid-flight, with no animation:
   *  for when the dialog closed by some other route. Safe to call when idle. */
  abort(): void;
  /** Re-fit after the viewport changed. */
  resize(): void;
  /** True while an animation runs or while no case is fully out yet (still
   *  loading, or already closed): the moments a close or a flip must wait. */
  readonly busy: boolean;
  /** True between open() and the case appearing, while its images load:
   *  there is nothing to fly home yet, so a close can just abort. */
  readonly loading: boolean;
}

/** Set on the slot while its case is out, so the DOM spine hides. */
export const SLOT_OUT = 'case-out';

// Sizes kept apart from the static fallback's w500 <img>: image.tmdb.org only
// sends CORS headers to requests with an Origin, so a crossOrigin load of a
// URL an <img> already cached is refused (see colors.ts).
const TEXTURE_POSTER_SIZE = 'w780';
const BACKDROP_SIZE = 'w780';
const LOGO_SIZE = 'w185';
const IMAGE_TIMEOUT_MS = 4000;
/** Mean greyscale difference (0-255) below which two scenes count as the same
 *  still; measured on the cached films, repeats scored 10-17 and the closest
 *  genuinely different pair 27. */
const SCENE_REPEAT_THRESHOLD = 22;
const SAMPLE_W = 16;
const SAMPLE_H = 9;

const OPEN_MS = 1050;
const OPEN_LIFT_SHARE = 0.2;
const CLOSE_MS = 850;
const CLOSE_DROP_SHARE = 0.2;
const SETTLE_MS = 500;
const DISMISS_MS = 260;
const DISMISS_SCALE = 0.94;
const LIFT = 0.24;
const LIFT_TOWARDS = 0.4;
const OPEN_ARC = 0.5;
const CLOSE_ARC = 0.4;
/** The turn finishes a little ahead of the travel. */
const TURN_LEAD = 1.2;
const CLICK_SLOP_PX = 4;

const MAX_PIXEL_RATIO = 2;
const ENV_INTENSITY = 0.55;
const KEY_COLOR = 0xfff3e2;
const KEY_INTENSITY = 2.6;
const KEY_POSITION = new THREE.Vector3(-3, 4, 9);
const SHADOW_MAP = 2048;
const SHADOW_EXTENT = 8;
const SHADOW_FAR = 30;
const SHADOW_BIAS = -0.0004;
const RIM_COLOR = 0xbfd4ff;
const RIM_INTENSITY = 0.7;
const RIM_POSITION = new THREE.Vector3(5, 1, -4);
const SHADOW_OPACITY = 0.38;
const SHADOW_PLANE_SIZE = 80;
/** The shadow wall sits this far behind the case, in proportion to its size. */
const SHADOW_DISTANCE = 0.14;
const ROUGHNESS = 0.6;
const CLEARCOAT_ROUGHNESS = 0.12;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 100;
const WHITE = 0xffffff;
/** A face whose image never arrived: dark plastic rather than a blank. */
const MISSING_MAP_COLOR = 0x2a2a2a;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

function hasWebGL(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

/** A tiny greyscale grid to compare scenes by; null if the pixels cannot be
 *  read (a tainted canvas), which keeps that scene rather than guess. */
function sampleGrid(img: HTMLImageElement): number[] | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
    const data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const grid: number[] = [];
    for (let i = 0; i < data.length; i += 4)
      grid.push((data[i]! + data[i + 1]! + data[i + 2]!) / 3);
    return grid;
  } catch {
    return null;
  }
}

const withoutRepeats = (scenes: HTMLImageElement[]) =>
  distinctScenes(scenes.map(sampleGrid), SCENE_REPEAT_THRESHOLD).map((i) => scenes[i]!);

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Resolves to null on error or after IMAGE_TIMEOUT_MS: a missing image only
 *  degrades the back, it never holds the case. A miss is not cached, so the
 *  next open tries again once the network recovers. */
function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let pending = imageCache.get(url);
  if (!pending) {
    pending = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    }).then((img) => {
      if (!img) imageCache.delete(url);
      return img;
    });
    imageCache.set(url, pending);
  }
  return pending;
}

function filmFromSlot(slot: HTMLElement): CaseFilm {
  const year = Number(slot.dataset.year);
  return {
    id: Number(slot.dataset.filmId),
    title: slot.dataset.title ?? '',
    year: Number.isFinite(year) && year > 0 ? year : null,
    director: slot.dataset.director || null,
    overview: slot.dataset.overview || null,
    spineColor: slot.style.getPropertyValue('--spine').trim() || '#2a2a2a',
    spineDark: Boolean(slot.querySelector('.spine.dark')),
  };
}

export function createCaseController(options: CaseControllerOptions): CaseController | null {
  if (!hasWebGL()) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room).texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = ENV_INTENSITY;

  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.z = CAMERA_Z;

  const key = new THREE.DirectionalLight(KEY_COLOR, KEY_INTENSITY);
  key.position.copy(KEY_POSITION);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(key.shadow.camera, {
    left: -SHADOW_EXTENT,
    right: SHADOW_EXTENT,
    top: SHADOW_EXTENT,
    bottom: -SHADOW_EXTENT,
    far: SHADOW_FAR,
  });
  key.shadow.bias = SHADOW_BIAS;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY);
  rim.position.copy(RIM_POSITION);
  scene.add(rim);

  const shadowWall = new THREE.Mesh(
    new THREE.PlaneGeometry(SHADOW_PLANE_SIZE, SHADOW_PLANE_SIZE),
    new THREE.ShadowMaterial({ opacity: SHADOW_OPACITY }),
  );
  shadowWall.receiveShadow = true;
  scene.add(shadowWall);

  let mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial[]> | null = null;
  let pose: Pose | null = null;
  let slot: HTMLElement | null = null;
  let busy = false;
  /** The viewport changed mid-tween: recentre the case when it ends. */
  let relayout = false;
  let drag: { x: number; ry: number; moved: boolean; onCase: boolean } | null = null;
  let tween: { start: number; ms: number; step: (t: number) => void; done: () => void } | null =
    null;
  /** Bumped by every open and abort, so an open still awaiting its images
   *  knows it was abandoned. */
  let generation = 0;
  /** The opened film's spine colour, which tints its glow both ways. */
  let glowColor = '';

  const glow = (level: number) => {
    canvas.style.filter = glowFilter(glowColor, level);
  };

  const viewport = () => ({ width: innerWidth, height: innerHeight });

  const toTexture = (source: HTMLCanvasElement | HTMLImageElement) => {
    const t =
      source instanceof HTMLCanvasElement
        ? new THREE.CanvasTexture(source)
        : new THREE.Texture(source);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    return t;
  };

  const plastic = (map: THREE.Texture | null) =>
    new THREE.MeshPhysicalMaterial({
      map,
      color: map ? WHITE : MISSING_MAP_COLOR,
      roughness: ROUGHNESS,
      clearcoat: 1,
      clearcoatRoughness: CLEARCOAT_ROUGHNESS,
    });

  const apply = () => {
    if (!mesh || !pose) return;
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.scale.set(pose.s, pose.s, pose.s * pose.d);
    mesh.rotation.y = pose.ry;
    shadowWall.position.set(0, 0, pose.z - pose.s * SHADOW_DISTANCE);
    key.target.position.set(pose.x, pose.y, 0);
  };

  const frame = (now: number) => {
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.ms);
      tween.step(t);
      if (t === 1) {
        const { done } = tween;
        tween = null;
        done();
      }
    }
    apply();
    renderer.render(scene, camera);
  };

  const recentre = () => {
    if (!pose) return;
    const vp = viewport();
    pose = centrePose(caseLayout(vp), vp, pose.ry);
  };

  const run = (ms: number, step: (t: number) => void) =>
    new Promise<void>((resolve) => {
      busy = true;
      const done = () => {
        busy = false;
        // A tween aims at the layout it started from; one that ran through a
        // resize lands off-centre until the case is placed again.
        if (relayout) {
          relayout = false;
          recentre();
        }
        resolve();
      };
      if (reducedMotion.matches || ms === 0) {
        step(1);
        done();
        return;
      }
      tween = { start: performance.now(), ms, step, done };
    });

  const fit = () => {
    const { width, height } = viewport();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const disposeCase = () => {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    for (const m of mesh.material) {
      m.map?.dispose();
      m.dispose();
    }
    mesh = null;
  };

  const teardown = () => {
    renderer.setAnimationLoop(null);
    canvas.style.filter = '';
    disposeCase();
    canvas.remove();
    slot?.classList.remove(SLOT_OUT);
    slot = null;
    pose = null;
    drag = null;
  };

  /** Ends a running tween early, resolving whoever awaits it. */
  const cancelTween = () => {
    const running = tween;
    tween = null;
    running?.done();
  };

  const abort = () => {
    generation++;
    cancelTween();
    busy = false;
    teardown();
  };

  const spineRect = () => (slot?.querySelector('.spine') ?? slot)!.getBoundingClientRect();
  const lifted = (home: Pose): Pose => ({
    ...home,
    y: home.y + home.s * LIFT,
    z: home.s * LIFT_TOWARDS,
  });

  const hitsCase = (event: PointerEvent) => {
    if (!mesh) return false;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      -((event.clientY - r.top) / r.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(mesh).length > 0;
  };

  const settleTo = (target: number) => {
    const from = pose!.ry;
    return run(SETTLE_MS, (t) => {
      pose = { ...pose!, ry: from + (target - from) * easeOut(t) };
    });
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (!pose || busy) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, ry: pose.ry, moved: false, onCase: hitsCase(event) };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || !pose) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > CLICK_SLOP_PX) drag.moved = true;
    if (drag.onCase) pose = { ...pose, ry: drag.ry + dx * DRAG_RAD_PER_PX };
  });
  const endDrag = () => {
    const d = drag;
    drag = null;
    if (!d || !pose) return;
    if (busy) return;
    if (d.onCase) void settleTo(nearestFace(pose.ry));
    else if (!d.moved) options.onCloseRequest();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  return {
    get busy() {
      return busy || !pose;
    },

    get loading() {
      return slot !== null && !pose;
    },

    async open(target) {
      if (slot || busy) return;
      busy = true;
      slot = target;
      const ticket = ++generation;
      const film = filmFromSlot(target);
      glowColor = film.spineColor;
      const details: CaseDetails = parseCaseDetails(target.dataset.case);
      const rect = spineRect();

      const poster = loadImage(posterUrl(target.dataset.poster, TEXTURE_POSTER_SIZE));
      const backdrops = Promise.all(
        details.backdrops.map((p) => loadImage(posterUrl(p, BACKDROP_SIZE))),
      );
      const logos = Promise.all(
        details.companies.map((c) => loadImage(posterUrl(c.logo_path, LOGO_SIZE))),
      );
      const [posterImg] = await Promise.all([poster, loadCaseFonts()]);
      if (ticket !== generation) return;

      const front = posterImg ? toTexture(frontCanvas(posterImg, details.scores)) : null;
      const images: CaseImages = { poster: posterImg, backdrops: [], logos: [] };
      const edge = toTexture(edgeCanvas(film));
      mesh = new THREE.Mesh(new THREE.BoxGeometry(CASE_WIDTH, 1, CASE_DEPTH), [
        plastic(toTexture(sideCanvas(film, CASE_DEPTH))),
        plastic(toTexture(spineCanvas(film, CASE_DEPTH, { poster: posterImg, logo: null }))),
        plastic(edge),
        plastic(edge.clone()),
        plastic(front),
        plastic(toTexture(backCanvas(film, details, images))),
      ]);
      mesh.castShadow = true;
      scene.add(mesh);

      // The back and the spine are redrawn once the scenes and logos have settled.
      const opened = mesh;
      void Promise.all([backdrops, logos]).then(([scenes, logoImgs]) => {
        if (mesh !== opened) return;
        const spine = opened.material[1];
        spine.map?.dispose();
        spine.map = toTexture(
          spineCanvas(film, CASE_DEPTH, { poster: posterImg, logo: firstLoaded(logoImgs) }),
        );
        spine.needsUpdate = true;
        const back = opened.material[5];
        back.map?.dispose();
        back.map = toTexture(
          backCanvas(film, details, {
            poster: posterImg,
            backdrops: withoutRepeats(
              scenes.filter((img): img is HTMLImageElement => img !== null),
            ),
            logos: logoImgs,
          }),
        );
        back.needsUpdate = true;
      });

      options.layer.append(canvas);
      fit();
      target.classList.add(SLOT_OUT);
      const vp = viewport();
      const home = poseFromRect(rect, vp);
      const up = lifted(home);
      const to = centrePose(caseLayout(vp), vp);
      pose = home;
      renderer.setAnimationLoop(frame);
      busy = false;
      await run(OPEN_MS, (t) => {
        glow(glowOnOpen(t, OPEN_LIFT_SHARE));
        if (t < OPEN_LIFT_SHARE) {
          pose = lerpPose(home, up, easeOut(t / OPEN_LIFT_SHARE));
          return;
        }
        const u = (t - OPEN_LIFT_SHARE) / (1 - OPEN_LIFT_SHARE);
        const p = lerpPose(up, to, easeInOut(u));
        p.ry = up.ry + (to.ry - up.ry) * easeInOut(Math.min(1, u * TURN_LEAD));
        p.z += Math.sin(u * Math.PI) * to.s * OPEN_ARC;
        pose = p;
      });
    },

    flip() {
      if (!pose || busy || drag) return;
      void settleTo(flipTarget(pose.ry));
    },

    async close() {
      if (!pose || busy) return;
      drag = null;
      const from = { ...pose };
      const homeRy = homeAngle(from.ry);
      const home = { ...poseFromRect(spineRect(), viewport()), ry: homeRy };
      const up = lifted(home);
      const dropAt = 1 - CLOSE_DROP_SHARE;
      await run(CLOSE_MS, (t) => {
        glow(glowOnClose(t, CLOSE_DROP_SHARE));
        if (t < dropAt) {
          const u = t / dropAt;
          const p = lerpPose(from, up, easeInOut(u));
          p.ry = from.ry + (homeRy - from.ry) * easeInOut(Math.min(1, u * TURN_LEAD));
          p.z += Math.sin(u * Math.PI) * from.s * CLOSE_ARC;
          pose = p;
          return;
        }
        pose = lerpPose(up, home, easeIn((t - dropAt) / CLOSE_DROP_SHARE));
      });
      teardown();
    },

    async dismiss() {
      if (!pose) {
        abort();
        return;
      }
      drag = null;
      cancelTween();
      canvas.style.filter = '';
      const from = { ...pose };
      canvas.style.transition = `opacity ${DISMISS_MS}ms ease`;
      canvas.style.opacity = '0';
      await run(DISMISS_MS, (t) => {
        pose = { ...from, s: from.s * (1 - (1 - DISMISS_SCALE) * t) };
      });
      canvas.style.transition = '';
      canvas.style.opacity = '';
      teardown();
    },

    abort,

    resize() {
      if (!pose) return;
      fit();
      if (busy) relayout = true;
      else recentre();
    },
  };
}
