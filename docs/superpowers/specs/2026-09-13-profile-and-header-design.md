# Videothèque — profiles and the app header

**Date:** 2026-09-13
**Status:** approved, ready for an implementation plan.
**Amends:** `2026-08-29-shelf-visual-direction-design.md` §4 and
`2026-09-06-shelf-visual-direction-addendum.md` §1. Everything not contradicted
here still holds.

The signed-in page is still the raw placeholder `index.astro` shipped with the
auth work: a heading, a list of shelf links, a sign-out button. This spec covers
the chrome that replaces it, and the profile row the chrome needs in order to
name anybody.

---

## 1. What this is one quarter of

The owner's request — a header with live search, a theme toggle, an avatar with
a display name, an avatar menu holding settings and sign-out, plus a wood
texture and a circular add-shelf button — spans four pieces. Splitting them was
a deliberate decision on 2026-09-13, not an accident of sequencing.

| | Piece | Status |
|---|---|---|
| **A** | **Profiles** — `profiles` table, seeded at sign-up | **This spec** |
| **B** | **Header** — wordmark, live search, theme toggle, avatar, menu | **This spec** |
| **C** | **Settings** — edit display name, upload an avatar, delete the account | Deferred |
| **D** | **The scene** — wood texture, plank, spines, the circular `+`, per-shelf share | Deferred |

**C is deferred because it is not a settings form, it is three unrelated
problems.** Deleting an account needs the Supabase Admin API with a service-role
key — the anon key cannot remove a row from `auth.users` — plus a cascade
decision and a confirmation that cannot misfire. Uploading an avatar opens
Supabase Storage, which this project does not use at all and which cuts against
the CLAUDE.md constraint of keeping Supabase bandwidth near zero.

**D is deferred because it is the wall and the furniture, not the chrome.** It
is also what the found wood texture belongs to.

### Sharing lives in D, not in the avatar menu

The parent spec put "Compartir perfil" in the avatar menu. That is dropped.
What this data model makes shareable is **a shelf** — `is_public` and `slug` are
columns on `shelves`, not on the user. An avatar-menu entry would presume the
`/u/[handle]` route wins over `/e/[slug]`, and addendum §8 left exactly that
question open. A share control per shelf, next to its postit, tells the truth
about what is being shared and sits where the user is already looking. It ships
with D.

---

## 2. A · Profiles

### Table

```
public.profiles
  id            uuid  primary key  references auth.users(id) on delete cascade
  display_name  text  not null
  avatar_url    text  null
  created_at    timestamptz not null default now()
```

`avatar_url` ships now although only C fills it. The column costs the same today
as later and saves a migration.

### Seeding

`handle_new_user` already gives every new user a shelf. It gains the profile
insert in the same function, so one trigger keeps owning "what a new account
comes with":

```sql
insert into public.profiles (id, display_name)
values (new.id, split_part(new.email, '@', 1));
```

The function stays `security definer` with `set search_path = ''`, so every
table reference stays schema-qualified.

**The display name is not collected at sign-up.** The owner decided this on
2026-09-06 and reaffirmed it on 2026-09-13. One of the two original reasons has
since dissolved — it was "blocked on the `profiles` table", which this spec
builds — but the other stands on its own: a magic-link sign-up with a second
field is odd friction, because the second field changes nothing about the email
that gets sent. `alexfmarquez@gmail.com` becomes `alexfmarquez`, and C makes it
editable.

The consequence is worth stating plainly: **until C ships, a user cannot change
their display name.** Accepted.

### Row level security

The owner selects and updates their own row. Insert is not granted to anyone —
the trigger is the only writer. Delete is not granted either; the cascade from
`auth.users` handles it.

**There is deliberately no public read policy.** A public shelf page will want
to name its owner, but `/e/[slug]` does not exist yet — `index.astro` links to
it and those links 404 today, which addendum §8 already records as open. Writing
a public policy now would be designing the access rules of a screen nobody has
designed. It comes with that route.

### Module

`src/lib/profiles.ts`, shaped like `shelves.ts`: a `Profile` interface and
`getOwnProfile(sb, userId)`. Types and constants that belong to it stay in it,
per the constants-and-types rule.

---

## 3. B · The header

### 3.1 It floats. There is no band.

**This overrides addendum §1.** That section made the chrome permanently dark in
both themes, and the reason it gave was structural: dark bands at top and
bottom frame the wall like a bookcase unit, which is what stopped the light
theme from reading as an unfinished dark theme.

The owner chose a floating header instead — no background, no bottom rule, the
wall continuous from the top of the page to the bottom, exactly as
`Attribution.astro` already treats the footer. **Once the bands are gone, the
argument for a permanently dark chrome goes with them**, because there is no
band left to be dark. So the rest of §1 falls too:

- The search field **follows the theme**. It reuses the existing `--field`
  token: `#131313` on the `#1a1a1a` wall in dark, `#ffffff` on `#fcfcfc` in
  light. This is literally the field `/login` already renders, which is the
  point — the signed-in and signed-out registers stop diverging.
- There is no results dropdown or avatar menu "hanging off the bar", so neither
  is pinned dark either. Both follow the theme.
- Brass keeps its per-theme values. The chrome-only fixed brass in §1 existed
  only to sit on a permanently dark band.

The field is a **pill** — full radius, not the 8px `--radius` token. It is the
only surface in the whole header, so it carries the whole job of separating
chrome from wall, and a distinct shape does that where a distinct tone alone
would not in light theme.

The avatar circle keeps its `#3a3430` ground in both themes. It is a portrait
frame, not chrome.

### 3.2 Order in the row

Wordmark hard left. Everything else in one cluster hard right: **search, theme
toggle, avatar, display name.**

The parent spec left placement to the artboards and the addendum put the field
between wordmark and avatar with `flex: 1`. Both are superseded. The owner's
reason for the right cluster is that the eye goes to the top-right corner first
when it wants to search a screen; the side effect is that the wordmark is left
alone on its side, which is what the parent spec wanted for it anyway — "the one
big gesture".

The field does not flex to fill: **280px**, fixed. Addendum §5 gave it `flex: 1`
with a 500px cap, which was right for a field centred in a bar and wrong for one
in a cluster — a growing field would push the wordmark and the avatar apart and
dissolve the grouping the order exists to create. The value is a starting point
to tune by eye, not a derived constant.

### 3.3 Small screens

The five elements stop fitting on one line well before 390px. **Below 640px the
cluster wraps and the search field takes its own full-width row underneath**,
and the display name is hidden at the same breakpoint — the avatar already
identifies the account, so the name is the first thing that can go. One
breakpoint drives both, because the name is what the field needs the room from.

This costs about 45px of permanent height and gives up the top-right corner that
motivated the desktop order. Both were accepted over the alternatives: a
collapsing magnifier adds a tap to the primary action of the whole product, and
shrinking the wordmark to an initial produces the logo the parent spec
explicitly refused ("Sin icono").

Plank behaviour at this width is unchanged from addendum §6 — 5 slots, centred,
wall visible either side — and belongs to D.

### 3.4 Where it lives

`Layout.astro` gains a **named `header` slot**. When the slot is filled it
renders above `<main>` and the layout **does not render the standalone
`ThemeToggle`**; the header carries its own. When the slot is empty — `/login`
and every other signed-out page — the layout behaves exactly as it does today.

This is the whole reason for a slot rather than a second layout: the toggle is
`position: fixed; top: 14px; right: 14px`, so a header rendered under an
unconditional layout toggle would collide with it. One conditional beats a
duplicated shell.

Data flows in from the page, which already has a session: `index.astro` fetches
the profile and the shelves server-side and passes them down. The header fetches
nothing at render.

### 3.5 Components

| File | Responsibility |
|---|---|
| `components/Header.astro` | The row and its wrapping behaviour. Owns no state. |
| `components/SearchBar.astro` | The field, the dropdown, the query and add scripts |
| `components/AvatarMenu.astro` | Initials, display name, the menu and its dismissal |
| `lib/colors.ts` | Spine colour from a poster. Named in CLAUDE.md; does not exist yet |
| `lib/profiles.ts` | See §2 |

### 3.6 Live search

Debounced at 250ms, minimum two characters, against `/api/tmdb?op=search`, which
already exists and already keeps the key server-side. `src/lib/tmdb.ts` already
exposes `searchFilms`.

Each row: `w92` poster thumbnail, title, year, and **"Ya en la estantería"** when
the TMDB id appears in the set of the user's filmed ids, serialised into the page
at render. Rendering the header never calls TMDB — the CLAUDE.md rule holds,
because this set comes from the `films` cache through the page, not from a
lookup.

Keyboard: arrow keys move through results, Enter picks, Escape closes and
returns focus to the field. The dropdown is dismissed on outside click and on
blur.

### 3.7 Picking a result adds the film

Three things happen, and the first is the one the markup does not suggest.

**The spine colour is computed in the browser first.** `POST
/api/shelves/[id]/films` validates a body of `{ tmdbId, spineColor, spineDark }`
and `parseSpineColor` demands a literal `hsl(h s% l%)`. This is the CLAUDE.md
rule — the browser is trusted with the spine colour and nothing else — so the
colour must exist before the request is made.

`shelf-prototype.html` already does this (lines 279–303): it draws the `w92`
poster into an 18×27 canvas, walks the pixels weighting each by saturation while
discounting near-black and near-white, and clamps the result to 30–58%
lightness and 30–68% saturation. That gets ported into `lib/colors.ts`, split in
two so the arithmetic is testable without a canvas:

- `spineFromPixels(data: Uint8ClampedArray): string` — pure, takes RGBA bytes.
- a thin browser wrapper that loads the image with `crossOrigin = 'anonymous'`,
  draws it, and calls the pure half. On a missing poster or a load error it
  falls back to the prototype's hue-from-id function.

`spineDark` is not in the prototype and is derived here: **true below 45%
lightness**, which sits inside the already-clamped 30–58% band and decides
whether the spine title is drawn in bone or ink.

**A colour that comes out indeterminate falls back to white** — added by the
owner on 2026-09-13, after review found that a non-integer TMDB id indexed the
fallback palette with a fraction and emitted `hsl(NaN 42% 40%)`, which
`parseSpineColor` rejects, so the film could not be shelved at all.

White is `hsl(0 0% 100%)`, the one deliberate exception to the 30–58% lightness
clamp: it is not a derived colour, it is the marker for "no colour could be
extracted", and reading as blank is the point.

The boundary is narrow and deliberate. **A film with no poster, or whose poster
fails to load, keeps its id-keyed hue** from the eight-colour palette. Only a
value that is not a usable colour turns white. Routing the poster-less case to
white as well would collapse every such film onto one identical blank spine and
lose the palette's variety across a whole shelf — and films without a poster on
TMDB are common enough for that to show.

**Then it picks a shelf: the first one with room, top to bottom.** No picker, no
active-shelf state. The owner's reason is that the films get dragged into order
afterwards anyway, so the initial landing only has to be reasonable. The
existing `SHELF_FULL_MESSAGE` was already written for a world with one implicit
target, which corroborates it.

**On a 409 `shelf_full` the client retries the next shelf with room** rather
than giving up. The counts came from the render and go stale the moment a second
tab adds something. When every shelf refuses, `SHELF_FULL_MESSAGE` is shown.
Shelf choice is a pure function, `firstShelfWithRoom(shelves)`, so the ordering
rule is testable on its own.

A successful add updates the "Ya en la estantería" set in place. Drawing the new
spine is D's problem; until then the shelf appears on the next load.

### 3.8 The avatar menu

Initials from the display name on the `#3a3430` circle, the name beside it.
**Initials are the first character of each of the first two whitespace-separated
words, uppercased** — so a seeded name gives one letter (`alexfmarquez` → `A`)
and a name set in C can give two. One letter is the normal case until C ships,
not a degraded one.

The menu holds **Cerrar sesión** and nothing else, posting to the existing
`SIGNOUT_PATH`.

**Settings is not in the menu.** It would point at `/settings`, which is C and
does not exist; shipping a link to a 404 is worse than shipping one fewer entry.
The owner approved separating them on 2026-09-13. The entry appears when C does.

The theme toggle is not in the menu either — it is its own control in the row.
That supersedes the parent spec, which put it inside the menu because there was
nowhere else for it.

Dismissal on outside click, on Escape, and on focus leaving the menu.

### 3.9 Copy

Every user-facing string goes in `src/constants/`, in Castilian Spanish, per
CLAUDE.md. New strings include the search placeholder ("Busca una película para
archivarla", from addendum §5), the already-on-a-shelf badge, the empty and
error states of the dropdown, the menu labels, and the avatar button's
accessible name.

---

## 4. Handover notes

Recorded here so they survive to the specs that own them.

- **The spine is a gradient, not a flat fill** — decided 2026-09-13, belongs to
  **D**. The gradient is *not* stored: `films.spine_color` stays a single
  validated `hsl()` value. It is derived in CSS with relative colour, three
  stops with the highlight off-centre near 38% so the spine reads as curved
  board catching a light from one side rather than as a flat ramp. Interpolating
  in `oklch` keeps one set of offsets working across every hue; the same offsets
  in `hsl` blow out the yellows. The reason not to store it is that the `films`
  cache is global — one bad gradient written today would be every shelf's
  gradient forever — and lighting is a decision we will retune by eye many
  times. This also matches the "specular sheen" the addendum already assumed
  when it sized the spine title.
- **Dragging between two shelves needs a new RPC.** `reorder_shelf` reorders
  within one shelf. Cross-shelf movement has no server call today. Belongs to D.
- **`profiles` needs a public read policy** when `/e/[slug]` or `/u/[handle]`
  gets built. See §2.

---

## 5. Out of scope

Named so the plan does not drift into them: wood texture, plank, spines,
postits, the circular add-shelf button and per-shelf sharing (**D**); the
settings page, avatar upload and account deletion (**C**); the `/login` and
`/register` split, which is agreed but explicitly not to be started until the
owner reopens it; cross-shelf drag.

---

## 6. Testing

Vitest, in `test/`, following the existing suites.

- `colors.test.ts` — `spineFromPixels` against known pixel buffers: a saturated
  poster, a near-monochrome one, a fully black one. Assert the returned string
  parses under the endpoint's own `SPINE_COLOR_PATTERN`, so the two halves
  cannot drift apart. Assert the `spineDark` threshold at either side of 45%.
- `profiles.test.ts` — `getOwnProfile` mapping and its error path, in the shape
  `shelves.test.ts` already uses.
- `firstShelfWithRoom` — no shelves, all full, a mixed run, and the retry order
  after a 409.

The components are markup and are not unit tested. The header is verified by
running the app.
