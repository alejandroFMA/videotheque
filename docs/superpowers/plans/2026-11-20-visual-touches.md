# Visual Touches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roadmap step 5: a full-title label on clipped spines, a spine-coloured glow on the 3D case as it lifts, and a VHS-style spine on the 3D case.

**Architecture:** The glow is a CSS `drop-shadow` on the WebGL canvas, its level computed by pure functions in a new `src/lib/case-glow.ts` and set from the open/close tweens in `case-scene.ts`. The VHS spine is drawn in `spineCanvas` from a pure layout function in `case-details.ts`; the poster is passed at build time and the spine is redrawn when the logos settle. The hover label is a CSS `::after` on `.slot.clipped`, reading the slot's existing `data-title`; the bookcase script sets `.clipped`.

**Tech Stack:** Astro, plain TypeScript, Three.js 0.170 (existing), Vitest (`environment: 'node'`, so canvas and DOM are checked by hand).

**Spec:** `docs/superpowers/specs/2026-11-20-visual-touches-design.md`

## Global Constraints

- No magic values inline: every meaningful literal gets a named constant, co-located in its module (`.claude/.rules/constants-and-types.md`).
- User-facing strings live in `src/constants/`; code, comments and identifiers in English.
- Comments explain *why* only; JSDoc only where the signature does not say it.
- Rendering never calls TMDB: thumbnail and logo come from images already loaded from image.tmdb.org via the cache paths.
- The shelf spine's drawing (`Spine.astro` `.spine`/`.title` look) does not change.
- No catalogue number, no "HI-FI STEREO".
- **Do not commit.** Leave all changes unstaged; the owner commits after review.

## Review Focus

- A film with no poster: the case spine has no thumbnail and the title starts where it does today (`spineLayout` test in Task 2).
- A film whose companies have no loaded logo (none, all `logo_path` null, or all failed): only the "VHS" mark at the foot, nothing blank reserved (`spineLayout` + `firstLoaded` tests in Task 2).
- A spine colour that is not a valid `hsl()` (the `#2a2a2a` fallback in `filmFromSlot`): the glow falls back to warm white rather than an invalid filter (`glowFilter` test in Task 1).
- Closing or dismissing mid-glow, or aborting during load: the canvas filter is cleared, so the next open does not start glowing (manual check in Task 1).
- A film added from the search bar, and a window resized narrower: the clipped mark is recomputed so new or newly clipped spines get the label (manual check in Task 3).

---

### Task 1: Lift glow

**Files:**
- Create: `src/lib/case-glow.ts`
- Modify: `src/lib/case-scene.ts` (open tween ~l.494, close tween ~l.520, `teardown`/`abort`/`dismiss`)
- Test: `test/case-glow.test.ts`

**Interfaces:**
- Produces:
  - `glowOnOpen(t: number, liftShare: number): number`. `t` is the open run's progress 0..1. Rises with `easeOut` from 0 at `t=0` to 1 at `t=liftShare`, then falls to 0 at `t = liftShare + GLOW_FADE_SHARE * (1 - liftShare)`; 0 after. `GLOW_FADE_SHARE = 0.4`.
  - `glowOnClose(t: number, dropShare: number): number`. The mirror: 0 until `dropAt - GLOW_FADE_SHARE * dropAt` (with `dropAt = 1 - dropShare`), rising to 1 at `dropAt`, falling to 0 at `t=1`.
  - `glowFilter(spineColor: string, level: number): string`. `'none'` when `level <= 0`. Otherwise `drop-shadow(0 0 3px <c / 0.55·level>) drop-shadow(0 0 12px <c / 0.3·level>)`, where `<c>` is `hsl(H S% L%)` from `spineColor` with `L = max(L, GLOW_MIN_LIGHTNESS = 70)`. A colour not matching `SPINE_COLOR_PATTERN` (from `src/lib/spine.ts`) uses the warm white `hsl(36 100% 92%)`.

- [ ] **Step 1: Write the failing tests** in `test/case-glow.test.ts`:

```ts
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
```


- [ ] **Step 2: Run** `npx vitest run test/case-glow.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/case-glow.ts`** to the interfaces above. Pure, no DOM, no Three.js. Round alphas to 3 decimals so the strings stay stable.

- [ ] **Step 4: Run** `npx vitest run test/case-glow.test.ts`. Expected: PASS.

- [ ] **Step 5: Wire into `case-scene.ts`.**
  - Open tween: in its `run(OPEN_MS, (t) => …)` callback, set `canvas.style.filter = glowFilter(film.spineColor, glowOnOpen(t, OPEN_LIFT_SHARE))` (`film` from `filmFromSlot`; keep the colour in a variable the close can reach).
  - Close tween: same with `glowOnClose(t, CLOSE_DROP_SHARE)`.
  - Clear `canvas.style.filter = ''` in `teardown`, `abort` and at the start of `dismiss`.
  - Reduced motion needs no branch: `run` calls `step(1)`, where both functions return 0.

- [ ] **Step 6: Manual check** with `npm run dev`: open a dark, a yellow and a red film. The glow peaks at the top of the lift and is gone before the case reaches the centre; it returns on close. Close mid-flight and dismiss with Escape, then reopen: no glow left over. With "reduce motion" on in the OS: no glow.

---

### Task 2: VHS case spine

**Files:**
- Modify: `src/lib/case-details.ts` (add `spineLayout`, `firstLoaded`)
- Modify: `src/lib/case-textures.ts` (`spineCanvas`, `drawFormat`, `backCanvas`)
- Modify: `src/lib/case-scene.ts` (mesh build ~l.457, logo redraw ~l.468)
- Test: `test/case-details.test.ts`

**Interfaces:**
- Produces, in `case-details.ts`:
  - `interface SpineLayout { thumb: { top: number; height: number } | null; titleTop: number; titleMax: number; markMiddle: number; logo: { top: number; maxHeight: number } | null }`. All values in canvas px of a strip `SPINE_STRIP_WIDTH` (200) wide and `height` tall.
  - `spineLayout(height: number, hasThumb: boolean, hasLogo: boolean): SpineLayout`. With neither, `titleTop` equals today's `height * 13 / 172`. The foot block (mark, then logo if any) sits at the bottom with a bottom margin; the title runs from below the thumbnail (or from today's top) to a gap above the mark.
  - `firstLoaded<T>(items: (T | null)[]): T | null`.
- Changes, in `case-textures.ts`:
  - `spineCanvas(film: CaseFilm, depth: number, art: { poster: HTMLImageElement | null; logo: HTMLImageElement | null }): HTMLCanvasElement`.
  - `drawFormat(ctx, centreX: number, middle: number, color: string)`: centred on `centreX` instead of right-aligned.

- [ ] **Step 1: Write the failing tests** in `test/case-details.test.ts`, with `H = 200 / CASE_DEPTH`:

```ts
describe('spineLayout', () => {
  it('without thumbnail starts the title where the spine does today', () => {
    const l = spineLayout(H, false, false);
    expect(l.thumb).toBeNull();
    expect(l.titleTop).toBeCloseTo((H * 13) / 172);
  });
  it('starts the title below the thumbnail', () => {
    const l = spineLayout(H, true, true);
    expect(l.titleTop).toBeGreaterThan(l.thumb!.top + l.thumb!.height);
  });
  it('ends the title above the VHS mark', () => {
    for (const [thumb, logo] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const l = spineLayout(H, thumb, logo);
      expect(l.titleTop + l.titleMax).toBeLessThan(l.markMiddle);
    }
  });
  it('puts the logo below the mark and inside the strip', () => {
    const l = spineLayout(H, true, true);
    expect(l.logo!.top).toBeGreaterThan(l.markMiddle);
    expect(l.logo!.top + l.logo!.maxHeight).toBeLessThan(H);
  });
  it('reserves no logo room without a logo', () => {
    const withLogo = spineLayout(H, true, true);
    const without = spineLayout(H, true, false);
    expect(without.logo).toBeNull();
    expect(without.markMiddle).toBeGreaterThan(withLogo.markMiddle);
  });
});

describe('firstLoaded', () => {
  it('returns the first non-null entry, or null', () => {
    expect(firstLoaded([null, 'a', 'b'])).toBe('a');
    expect(firstLoaded([null, null])).toBeNull();
    expect(firstLoaded([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/case-details.test.ts`. Expected: FAIL, missing exports.

- [ ] **Step 3: Implement `spineLayout` and `firstLoaded`** in `case-details.ts`. Starting sizes, tuned by eye against the prototype: thumbnail 84% of the strip width, ratio 1 : 1.15, top margin 40px; mark 50px high; logo box 130×80px max; 16px gaps; 48px bottom margin.

- [ ] **Step 4: Run** `npx vitest run test/case-details.test.ts`. Expected: PASS.

- [ ] **Step 5: Draw it in `case-textures.ts`.**
  - `spineCanvas` keeps today's ground and gradients, then draws from `spineLayout(h, !!art.poster, !!art.logo)`:
    - thumbnail: `drawCover` of the poster into the box, framed by a thin rule (light on a dark spine, dark on a light one);
    - title: rotated as today, from `titleTop`, ellipsized to `titleMax`;
    - mark: `drawFormat(ctx, w / 2, markMiddle, inkFor(film))`;
    - logo: `tinted(logo, inkFor(film), lw, lh)`, fitted inside 130×80 keeping ratio, centred.
  - `drawFormat`: centre on `centreX`.
  - `backCanvas`: drop the `drawFormat` call; the band keeps only the wordmark. Remove `CASE_FORMAT` from that path if unused.

- [ ] **Step 6: Feed it in `case-scene.ts`.**
  - Build: `spineCanvas(film, CASE_DEPTH, { poster: posterImg, logo: null })`.
  - In the existing `Promise.all([backdrops, logos]).then(...)`: also dispose `opened.material[1].map`, set it to `toTexture(spineCanvas(film, CASE_DEPTH, { poster: posterImg, logo: firstLoaded(logoImgs) }))` and set `needsUpdate`.

- [ ] **Step 7: Manual check** with `npm run dev`: open a film with poster and studio logo, one without a logo (only VHS at the foot) and one without a poster (no thumbnail, title at the top). The back's top band shows only the wordmark. A long title ellipsizes above the mark.

---

### Task 3: Full-title hover label

**Files:**
- Modify: `src/components/Spine.astro` (styles)
- Modify: `src/components/Bookcase.astro` (script: init, `FILM_ADDED_EVENT` handler ~l.461, a resize listener)

**Interfaces:**
- Produces: the class `clipped` on a `.slot` whose `.title` has `scrollHeight > clientHeight`, and the function `markClipped(root: ParentNode): void` in the bookcase script.

- [ ] **Step 1: Style the label in `Spine.astro`.** `.slot.clipped:hover::after` and `.slot.clipped:has(.spine:focus-visible)::after` draw `content: attr(data-title)`: horizontal, `var(--font-ui)`, small, ink on paper using the `app.css` tokens, centred above the spine with a small gap, `white-space: nowrap`, `pointer-events: none`, `z-index` above neighbouring slots, `max-width` capped so a very long title wraps or ellipsizes rather than spanning the page. Never shown on `.slot.placeholder` or `.drag-ghost`. No transition under `prefers-reduced-motion`.

- [ ] **Step 2: Mark clipped spines in `Bookcase.astro`.** `markClipped(root)` toggles `clipped` on every `.slot[data-film-id]` in `root`. Call it once on load for `bookcase`, on the new slot after `plank.append(slot)` in the `FILM_ADDED_EVENT` handler, and on `resize` throttled to one `requestAnimationFrame`.

- [ ] **Step 3: Manual check** with `npm run dev`: hover a long title ("El Señor de los Anillos: La Comunidad del Anillo"): the label shows the full title at once. A short title shows nothing. Tab onto a clipped spine: the label shows. Add a long-titled film from the search bar: hovering it shows the label without a reload. Narrow the window under 820px: newly clipped spines get the label. Drag a spine: no label on the ghost or the gap.

---

### Task 4: Full verification

- [ ] **Step 1: Run** `npm test`. Expected: all suites pass.
- [ ] **Step 2: Run** `npm run lint`. Expected: no errors.
- [ ] **Step 3: Leave everything unstaged** (spec, plan, roadmap, code) and report to the owner for review.
