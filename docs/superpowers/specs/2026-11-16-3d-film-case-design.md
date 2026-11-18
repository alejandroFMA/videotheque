# 3D film case — design

**Date:** 2026-11-16
**Roadmap:** step 3, "3D film case"
**Builds on:** `2026-08-29-shelf-visual-direction-design.md` §5 and its
2026-09-06 addendum. Where this document and §5 disagree, this one wins
(see "What changes from the visual spec").

## Intent

When an owner or a visitor picks a film, the case becomes the reason to show
someone the shelf. You lift a VHS case off the plank, it flies to the centre
of the screen, you turn it in your hand and read the back, the way you did in
a video shop in the 90s. The back cover is the point: scenes from the film,
the synopsis set large enough to read, and the billing block.

Today the pulled-out case is a static image plus a record panel
(`FilmCase.astro`). That stays as the no-WebGL fallback only.

## Goals

- The case leaves its own slot, flies to the centre and returns to that
  slot on close.
- The case turns a full 360° under the pointer or finger, so the back is
  readable.
- The back cover is a 90s-style sleeve built from cached data: three
  scenes, synopsis, cast and crew, production
  companies.
- It works on a phone with touch.

## Non-goals

- The critic's quote and stars on the back. That is roadmap step 4; this
  step leaves no reserved space for it, the synopsis simply flows.
- Spanish synopses and titles (step 5). The back draws whatever the cache
  holds; credits and company names are not translated anyway.
- Changing the shelf itself. Spines stay CSS/DOM.
- A Blu-ray or DVD format.

## Anti-goals

- **Rendering a shelf must not call TMDB.** Opening a case must not either.
  Every face is drawn from the `films` cache.
- **No invented content.** No fake reviews, no made-up credits. A missing
  field means that part of the back is left out, not filled with
  placeholder text.
- **No cost on the shelf render.** Three.js and the GPU only come into play
  when a case is opened.

## Approaches considered

Three were built as a throwaway spike (one page, the same ten films, a
switch between them) and tried by the owner:

- **A · Flight from the slot, ±90°.** A full-viewport canvas; the case
  lifts out of its slot, turns towards the front as it flies to the centre,
  and goes back on close. It turns ±90° and springs back to rest on
  release. Most striking, and the most work (screen-to-world mapping,
  zoom, scroll).
- **B · Appears in the centre.** The canvas only fills the case's box next
  to the record; the spine stays on the shelf and the case fades in with a
  slight turn. Cheap, but it loses "I took it off the shelf", and the
  shadow clips at the box edges.
- **C · A, plus a bigger case, a full turn, and a 90s back cover.** Picked.
  The owner liked reading the synopsis on the back more than in a side
  panel, and the full turn is what makes the back reachable.

## What changes from the visual spec

| §5 said | Now |
|---|---|
| Turn limited to ±90°, springs back to rest | Full 360°, no inertia; on release it settles on the nearest face (front or back) |
| Back cover: thumbnail + synopsis + year/director + barcode | 90s sleeve: three scenes, synopsis, billing block, company logos, barcode |
| Record panel: title, year, director, synopsis, remove | Title, year · director, remove, flip, close — no synopsis, it is on the back |
| Three.js "from a CDN" | From npm, loaded with a dynamic `import()` on first open (see Constraints) |
| Sleeve proportions not stated | Front 0.56 × height, thickness 0.14 × height (see The case) |

## The case

### Proportions

- Front width / height = **0.56**, a VHS slipcase (~120 × 205 mm). 0.64
  read as a paperback book.
- Thickness / height = **0.14**. The shelf spine is ~0.2 (34 × 172 px),
  which read as too fat once turned.
- **The case leaves the slot exactly as wide as the DOM spine** and
  thins to 0.14 during the flight (a scale on the depth axis), and widens
  back just before it lands. The shelf spines do not change.

### Faces

- **Front:** the poster from `image.tmdb.org`, cropped to 0.56 from its
  2:3 ("cover").
- **Spine (left of the front):** `films.spine_color` with the same
  cardboard shading as the CSS spine, and the title down it in Archivo
  Narrow, as on the shelf.
- **Open side (right of the front):** the sleeve's two cardboard walls in
  the spine colour, and between them the black cassette sitting inside,
  shaded with an inner shadow so it reads as depth, not a flat panel or an
  empty box. Ribbed grips near both ends, each rib a lit ridge over a dark
  groove so it shows under the light. A **plain white label strip**,
  identical on every tape, no title, about 54 % of the height. (Aged and
  per-film labels were tried and dropped.)
- **Top and bottom:** the spine colour, slightly darkened.
- **Back:** see below.

### Material and light

As §5: a `MeshPhysicalMaterial` with clearcoat over the printed texture,
one directional key light with a soft shadow on a shadow-catching plane
behind the case, a faint rim light, and a small room environment for the
specular. The shadow plane sits behind the case at a distance proportional
to its size, so the small case near the shelf does not throw a far shadow.

## The back cover

Drawn once per open into a canvas texture, about 1000 px wide. From top to
bottom:

1. **Band** in the spine colour: `VIDEOTHEQUE` on the left in Big
   Shoulders, and on the right the word **`VHS` set in our own type** (Big
   Shoulders, inside a thin rule box), both in the band's ink (light on a
   dark spine colour, dark on a light one).
2. **Scenes:** one large 16:9 backdrop across the width, two smaller ones
   side by side under it, each with a thin off-white frame. A scene never
   repeats: a backdrop nearly identical to one already framed is dropped,
   two scenes sit side by side, one is framed large, and with no backdrop
   the poster stands in.
3. **Synopsis** in Archivo, large enough to read comfortably. No title
   or year: the spine and the front already carry them. It gets
   whatever height is left between the scenes and the billing block, and
   ends in "…" if cut.
4. **Billing block**, centred, Archivo Narrow, uppercase: six cast names on
   the first lines, never breaking a name across lines; under them, smaller
   and dimmer, `GUION`, `MÚSICA`, `FOTOGRAFÍA`, `MONTAJE`, `PRODUCIDA POR`,
   each followed by up to two names, closed by `DIRIGIDA POR {director}`.
   A job with no one credited is left out.
5. **Bottom row:** a decorative barcode on the left (made up from the TMDB
   id, not a real EAN); production company logos on the right as light
   silhouettes, or the company name when TMDB has no logo. Companies that do
   not fit are dropped rather than overlapping the barcode.
8. A thin strip of the spine colour along the bottom edge.

Not on the back, on purpose: "PAL", "COLOR · ESTÉREO HI-FI" and any TMDB
credit line. TMDB is already credited in the site footer.

All the fixed labels (`DIRIGIDA POR`, the job names, `Dar la vuelta`, …)
live in `src/constants/` like every other user-facing string.

## Interaction

- **Open:** clicking a spine hides it in its slot, lifts the case up and
  slightly towards the viewer, then flies it to the centre while turning it
  from spine-on to its rest angle (~0.35 rad, spine side showing, as §5
  asks). The shelf dims behind. The record panel fades in near the end.
- **Size:** the case is large: on desktop up to ~700 px tall (bounded by
  86 % of the viewport height and 60 % of its width), on a phone ~56 % of
  the height.
- **Turn:** horizontal drag turns the case around its vertical axis with no
  limit. There is no inertia: the case only moves while it is being
  dragged. On release it settles from where it is to whichever face it is
  nearest: the front at the rest angle, or the back with the spine on the
  right (as when you flip a tape in your hand).
- **Dar la vuelta:** a button in the record panel flips between front and
  back. It is also the keyboard path to the back.
- **Close:** `Esc`, the close button, or a click/tap that does not land on
  the case or the record. The case turns back to spine-on the short way
  round, flies home and lands in its slot; the spine reappears.
- **Remove:** "Quitar de la estantería" has no slot to fly back to. The
  case fades out where it is, then the slot is removed as today. If the
  request fails, the case stays open with the error, as today.
- **Record panel:** title, year · director, "Quitar de la estantería" (owner
  only, as today), "Dar la vuelta", "Cerrar". Desktop: to the right of the
  case. Phone: under the case, scrollable.
- **Reduced motion:** no flight; the case appears at the centre at rest and
  disappears on close. Turning still works.
- **No WebGL:** the current static `FilmCase` view, unchanged.

## Data

### New cached fields on `films`

All filled server-side by `POST /api/shelves/[id]/films`, from the same
TMDB call it already makes, extended with
`append_to_response=credits,images` (credits is already appended). The
browser keeps its only write, `spine_color`. The TMDB → row mapping stays
in `toFilmRow` (`src/lib/tmdb-mapping.ts`).

- **Backdrop paths:** up to three, relative like `poster_path`, chosen from
  the textless backdrops (`iso_639_1` null) ordered by vote count.
- **Cast:** the first six names in billing order.
- **Crew for the billing block:** for each of screenplay (Screenplay,
  Writer), music (Original Music Composer, Music), photography (Director of
  Photography), editing (Editor), producer (Producer), up to two names.
  Stored by job key, not by Spanish label — the labels are UI strings.
- **Production companies:** up to three, each a name and an optional
  relative `logo_path`.

Images (backdrops, logos) are served from `image.tmdb.org`, never rehosted.
They are drawn into a WebGL texture, so they load with
`crossOrigin = 'anonymous'`; `colors.ts` already proves image.tmdb.org
allows this for posters.

### Films already in the cache

They have none of the new fields, and nothing in the app can fill them:
`films` allows `INSERT` to signed-in users and no `UPDATE` at all ("nothing
updates or deletes films from the client"), and the server writes with the
user's session, not a service key. `ensureFilmCached` only inserts a
missing row, so adding an already-cached film does not refresh it.

**My call:** keep it that way. No new update path in the app — any
function a signed-in session could call to rewrite a cached row would also
be callable from a browser, which is exactly what the "browser is trusted
with the spine colour and nothing else" rule forbids. Instead:

- Rows cached **after** this step get the new fields on insert, through
  the endpoint as today.
- Rows cached **before** it are filled once by a **one-off backfill
  script**, run locally by the owner with the Supabase service-role key
  and the TMDB token, both read from the environment and never committed.
  It refetches each row with the same `toFilmRow` mapping and fills only
  the new columns. It is not part of the deployed app.

Until a row is backfilled, its back degrades as described above (poster
crop, no billing block).

### Getting it to the page

The shelf read stays one PostgREST call (`shelf_items(position, films(*))`)
and picks up the new columns on its own. The extra per-film data reaches the
case the way today's fields do, on the slot.

A film added from the search bar gets its slot filled from the add
endpoint's response (`{ position, film }`, where `film` is the cached row),
as `Bookcase.astro` already does for title, year, director, overview and
poster. That row now carries the new columns too, so the new case works
straight away without a reload.

### Images

- **The front texture uses its own poster size, `w780`.** image.tmdb.org
  only sends CORS headers when the request carries an Origin, so a
  `crossOrigin` request for a URL that a plain `<img>` already cached is
  refused (see the comment in `colors.ts`). The static fallback shows
  `w500` with a plain `<img>`, and `w154` is the spine-colour read; `w780`
  keeps the texture in its own cache entry and is sharper at ~700 px tall.
- Backdrops load at `w780`, company logos at `w185`; neither is shown
  anywhere else as a plain `<img>`.
- **Loading:** the flight starts once the poster and the fonts are ready
  (the front and spine are what you see in flight). The back is drawn when
  the backdrops and logos have loaded, and swapped into the texture then.
  An image that fails or takes more than a few seconds is treated as
  missing, which falls back as described in "The back cover".

## Constraints

- **Three.js from npm, loaded with a dynamic `import()`** on the first case
  open, so Vite splits it out of the shelf's bundle. This replaces §5's
  "from a CDN": no third-party script host, consistent with self-hosting
  the fonts, and the same "only when opened" cost. CLAUDE.md already
  accepts Three.js for the pulled-out case only.
- One WebGL renderer, created on first open and reused; the case's
  geometry and textures are disposed on close.
- The canvas text uses the self-hosted faces already in `public/fonts/`
  (Big Shoulders, Archivo, Archivo Narrow). Wait for them before drawing.
- **No VHS logo.** The official mark is a JVC trademark, and Commons
  hosting it grants no right to use it. The band names the format with the
  plain word `VHS` in Big Shoulders, describing the format without copying
  the logo's lettering. Do not draw anything that imitates the official
  logo's shapes.
- The bookcase scales with CSS `zoom` on large screens
  (`Bookcase.astro`). The flight starts from the spine's on-screen rect, so
  it must come out right at every zoom step.
- The case lives inside the existing `<dialog>`, so focus handling, `Esc`
  and returning focus to the spine stay native.

## Left to the builder

- How the extra per-film fields ride on the slot (one JSON data attribute,
  several attributes, or a lookup keyed by film id).
- Column types for the new fields (arrays, `jsonb`) and the backfill's
  shape (a script or an admin-only endpoint), within "server-side only".
- Exact easing curves and durations. The spike used ~1 s to open, ~0.85 s
  to close, ~0.5 s to settle on a face after release; use those as a
  starting point.
- Whether arrow keys also turn the case, in addition to "Dar la vuelta".
- Unit tests: at least the pure parts — the TMDB → row mapping for the new
  fields, the billing-block assembly, the "nearest face" maths and the
  screen-to-world mapping. Canvas drawing and the 3D scene are checked by
  hand, including touch on a real phone, before the step closes (the
  roadmap asks for this).

## Known gaps

- **The best-voted backdrop is sometimes promotional art, not a scene**
  (Heat's is close to the poster). Accepted for now; picking "least like
  the poster" can come later.
- **Company order is TMDB's.** When three do not fit, the dropped one can
  be the most recognisable (Alien loses 20th Century Fox). Accepted for
  now.
