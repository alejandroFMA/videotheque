# Visual touches

Roadmap step 5. Builds on the 3D case
(`docs/superpowers/specs/2026-11-16-3d-film-case-design.md`).

## Intent

Small details that make the shelf feel finished: a title you can always
read, a lift that feels like taking a tape off a shelf, and a case spine
that reads as a real 90s VHS sleeve (reference: rental-store spines with a
picture on top, the title, and a "VHS" mark and studio logo at the foot).

Everything drawn comes from the `films` cache. Nothing is invented: a film
without a poster or a logo goes without that piece.

## Goals

1. **Full title on hover.** A spine whose title is clipped shows the full
   title in a small label, at once, on hover and on keyboard focus.
2. **Glow while lifting.** The 3D case's silhouette glows faintly in its
   own spine colour as it lifts out of its slot.
3. **A VHS case spine.** The 3D case's spine carries a poster thumbnail at
   the top, the title, and at the foot the "VHS" mark and the first
   production company's logo.

## Non-goals

- The shelf spine (`Spine.astro`) does not change its drawing. Only the 3D
  case spine gets the thumbnail, mark and logo.
- No catalogue number, no "HI-FI STEREO": both were prototyped and dropped.
- No hover label on touch: tapping a spine opens the case, which shows the
  title.

## Design

### 1. Hover label

A label of our own, not the native `title` attribute: the native tooltip
waits about a second, looks like the OS, and never shows on keyboard focus.

- Shown on `.slot:hover` and `.slot:has(.spine:focus-visible)`, the same
  triggers that lift the spine today.
- Only on spines whose title is clipped. The browser marks them: a spine is
  clipped when its `.title` has `scrollHeight > clientHeight`. That is
  measured when the bookcase renders, when a film is added in the page, and
  on window resize (the slot widths change on narrow screens), and kept as a
  class or data attribute on the slot.
- Ink-on-paper chip above the spine, horizontal text, the UI font, kept
  within the viewport.
- Not shown while dragging, and not on the placeholder slot.

### 2. Lift glow

A CSS `drop-shadow` on the transparent WebGL canvas, so the glow follows
the case's exact silhouette as it turns. Chosen over an in-scene halo (a
radial sprite behind the case), which does not follow the edges, and over
a shader rim, which reads as a hard line on a box this flat.

- Colour: the film's spine colour, lightened so a dark spine still glows.
- Two stacked shadows, a tight one and a wide one. The prototype's normal
  intensity: about `drop-shadow(0 0 3px rgba(c, .55·g)) drop-shadow(0 0
  12px rgba(c, .3·g))`, with `g` the glow level from 0 to 1.
- Timing on open: `g` rises with the lift (the first `OPEN_LIFT_SHARE` of
  the open run) to 1, then falls to 0 over the first part of the flight to
  the centre. On close, the mirror: it rises as the case nears its slot and
  falls as it settles. `filter` is `none` whenever `g` is 0, so the filter
  costs nothing while the case sits open or closed.
- `prefers-reduced-motion`: no glow.
- No WebGL means no 3D case and so no glow; the static fallback is
  untouched.

If the filter stutters on a weak phone, the in-scene halo is the fallback
plan; it would not change anything else.

### 3. VHS case spine

All in `spineCanvas` (`src/lib/case-textures.ts`), top to bottom:

- **Thumbnail:** a cover crop of the poster, framed by a thin rule, near the
  top. The poster is already loaded when the case mesh is built, so it is
  passed in. No poster: no thumbnail, and the title starts at the top as
  today.
- **Title:** starts below the thumbnail and ends above the foot block;
  ellipsized as today.
- **"VHS" mark:** the existing `drawFormat` rule box, horizontal and
  centred near the foot. It leaves the back cover: the back's top band keeps
  only the wordmark.
- **Logo:** the first entry of `films.companies` whose logo loaded, tinted
  in the spine's ink colour, centred below the mark, fitted to a max width
  and height. Logos load after the mesh is built: the spine is redrawn when
  they settle, in the same callback that already redraws the back. No logo:
  only the mark.

## Roadmap

Step 4 is marked done (2026-11-20, PR #26). Step 5 gains the VHS case
spine as a third bullet.

## Left to the builder

- Exact sizes and gaps on the spine canvas (thumbnail ratio, mark size,
  logo box), tuned by eye against the prototype.
- How the lightened glow colour is derived from `spine_color` (an `hsl()`
  string).
- The label's exact placement and chrome, within the design tokens in
  `app.css`; its strings, if any, go in `src/constants/`.
