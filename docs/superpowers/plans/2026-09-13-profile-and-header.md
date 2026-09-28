# Profiles and the app header — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every account a `profiles` row and replace the placeholder
dashboard with a floating app header carrying live TMDB search, the theme
toggle, and an avatar menu.

**Architecture:** `Layout.astro` gains a named `header` slot; filling it renders
the chrome and suppresses the layout's standalone theme toggle, so `/login` is
untouched. The header is server-rendered from data the page already fetched and
calls nothing at render. Picking a search result computes the spine colour in
the browser (the only value the browser is trusted with) and POSTs to the
existing `POST /api/shelves/[id]/films`, walking down the user's shelves until
one accepts it.

**Tech Stack:** Astro 7 SSR on Vercel, Supabase Postgres with RLS, Vitest, plain
JavaScript in component `<script>` blocks. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-profile-and-header-design.md`

## Global Constraints

- **No new runtime libraries.** CLAUDE.md requires written justification; this
  feature needs none.
- **Every user-facing string lives in `src/constants/`**, in Castilian Spanish.
  Never inline in a component.
- **Code, comments and commit messages are in English.** Only the UI copy is
  Spanish.
- **No magic values inline.** A literal that carries meaning gets a name. `0`,
  `1`, `-1` and array indices are exempt.
- **Comments explain _why_, never _what_.** No commented-out code. JSDoc only
  where the signature does not already say how to call it.
- **Module-local types and constants stay in that module** under `src/lib/`.
  Only cross-module ones go to `src/types/` and `src/constants/`, which stay
  declarations-only.
- **The TMDB key never reaches the browser.** All TMDB traffic goes through
  `/api/tmdb`.
- **Rendering never calls TMDB.** Shelf data comes from the `films` cache.
- **The browser is trusted with the spine colour and nothing else.**
- **Commits are Conventional Commits**, imperative subject, no trailing period,
  ≤72 chars, ending with the trailer
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Never write a `Claude-Session:` trailer or a `claude.ai/code/session_…` URL
  anywhere in the repository**, even if tooling proposes one.
- **Work stays on the branch `feat/profile-and-header`.** Never commit to
  `main`. No git worktrees.
- Run `npm run lint`, `npm run typecheck` and `npm test` before each commit.
  A husky + lint-staged hook reformats staged files on commit; that is expected.

---

### Task 1: The `profiles` table

**Files:**

- Create: `supabase/migrations/20260913101500_profiles.sql`

**Interfaces:**

- Consumes: nothing.
- Produces: table `public.profiles` with columns `id uuid`, `display_name text
not null`, `avatar_url text`, `created_at timestamptz`. Every new
  `auth.users` row gets a matching profile whose `display_name` is the email's
  local part.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260913101500_profiles.sql`:

```sql
-- =====================================================================
--  profiles · the name and face the app header shows
--
--  One row per account, seeded at sign-up. Sign-up is a magic link with a
--  single field, so the display name starts as the email's local part and
--  the settings page (not built yet) is what makes it editable.
-- =====================================================================
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url   text,                       -- filled by the settings page, later
  created_at   timestamptz not null default now()
);

-- The ensure_rls event trigger already enabled RLS on create; this is
-- stated anyway so the file reads as a complete description of the table.
alter table public.profiles enable row level security;

-- No insert policy: the sign-up trigger is the only writer. No delete
-- policy either: the cascade from auth.users is the only remover.
create policy "read your own profile"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "edit your own profile"
  on public.profiles for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- =====================================================================
--  Seed the profile alongside the first shelf
--
--  Replaces the function from the initial schema. One trigger keeps
--  owning "what a new account comes with".
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shelves (owner, slug)
  values (
    new.id,
    substr(replace(new.id::text, '-', ''), 1, 10)
  );

  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

The `revoke` repeats what `20260829102802_harden_functions_and_fk_index.sql`
did, because `create or replace` resets the grant to the default of EXECUTE for
PUBLIC. Leaving it out silently reintroduces the advisor finding that migration
fixed.

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: the new migration is listed as applied.

- [ ] **Step 3: Verify the table and the trigger**

Confirm `public.profiles` exists with RLS enabled and two policies, and that
`handle_new_user` still has both inserts. Either the Supabase MCP tools
(`list_tables`, `list_migrations`) or:

```bash
npx supabase db push --dry-run
```

Expected: no pending migrations, `profiles` present with `rls_enabled: true`.

- [ ] **Step 4: Check for advisor regressions**

Run the Supabase security advisor (MCP `get_advisors` with type `security`).
Expected: no new findings. In particular no "policy exists but RLS disabled" and
no "function search_path mutable" on `handle_new_user`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260913101500_profiles.sql
git commit -m "feat(db): add profiles and seed one per new account"
```

---

### Task 2: `src/lib/profiles.ts`

**Files:**

- Create: `src/lib/profiles.ts`
- Test: `test/profiles.test.ts`

**Interfaces:**

- Consumes: table from Task 1.
- Produces:
  - `interface Profile { id: string; display_name: string; avatar_url: string | null }`
  - `getOwnProfile(sb: Db, userId: string): Promise<Profile | null>`

- [ ] **Step 1: Write the failing test**

Create `test/profiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fakeSupabase } from './helpers/fake-supabase';
import { getOwnProfile } from '../src/lib/profiles';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROW = { id: USER, display_name: 'alexfmarquez', avatar_url: null };

describe('getOwnProfile', () => {
  it('scopes the lookup to the given user', async () => {
    const sb = fakeSupabase({ profiles: { data: ROW, error: null } });

    expect(await getOwnProfile(sb.client, USER)).toEqual(ROW);
    expect(sb.opsFor('profiles')).toEqual(expect.arrayContaining([['eq', 'id', USER]]));
  });

  it('returns null when the profile is missing', async () => {
    const sb = fakeSupabase({ profiles: { data: null, error: null } });
    expect(await getOwnProfile(sb.client, USER)).toBeNull();
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({ profiles: { data: null, error: { message: 'boom' } } });
    await expect(getOwnProfile(sb.client, USER)).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/profiles.test.ts`
Expected: FAIL — cannot resolve `../src/lib/profiles`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/profiles.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = Pick<SupabaseClient, 'from'>;

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

const PROFILE_COLUMNS = 'id, display_name, avatar_url';

function fail(operation: string, error: { message: string }): never {
  throw new Error(`[profiles] ${operation} failed: ${error.message}`);
}

/** Null only if the sign-up trigger did not run; callers fall back to the email. */
export async function getOwnProfile(sb: Db, userId: string): Promise<Profile | null> {
  const { data, error } = await sb
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) fail('getOwnProfile', error);
  return (data as Profile | null) ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/profiles.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Lint, typecheck and commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/lib/profiles.ts test/profiles.test.ts
git commit -m "feat(profiles): read the signed-in user's profile"
```

---

### Task 3: `src/lib/colors.ts` — the spine colour

**Files:**

- Create: `src/lib/colors.ts`
- Test: `test/colors.test.ts`
- Reference only, do not modify: `shelf-prototype.html:260-303`

**Interfaces:**

- Consumes: `posterUrl` from `src/lib/tmdb-mapping.ts`.
- Produces:
  - `interface Spine { spineColor: string; spineDark: boolean }`
  - `spineFromPixels(data: Uint8ClampedArray): Spine` — pure; throws `RangeError`
    on an empty buffer
  - `fallbackSpine(tmdbId: number): Spine`
  - `spineFromPoster(posterPath: string | null, tmdbId: number): Promise<Spine>`
    — browser only, never rejects

`spineColor` is always a string matching `/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/`,
which is the exact shape `parseSpineColor` in `src/lib/shelf-actions.ts`
accepts.

- [ ] **Step 1: Write the failing test**

Create `test/colors.test.ts`. Note `PATTERN` is deliberately a copy of
`SPINE_COLOR_PATTERN` from `shelf-actions.ts`: the point of the assertion is to
catch the two halves drifting apart, which importing the same constant could not
do.

```ts
import { describe, expect, it } from 'vitest';
import { fallbackSpine, spineFromPixels } from '../src/lib/colors';

const PATTERN = /^hsl\((\d{1,3}) (\d{1,3})% (\d{1,3})%\)$/;

/** One flat colour repeated, as RGBA bytes — the shape a canvas hands back. */
function solid(r: number, g: number, b: number, pixels = 4): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

describe('spineFromPixels', () => {
  it('returns a string the add-film endpoint will accept', () => {
    expect(spineFromPixels(solid(200, 30, 30)).spineColor).toMatch(PATTERN);
  });

  it('keeps the hue of a saturated poster', () => {
    const [, hue] = PATTERN.exec(spineFromPixels(solid(200, 30, 30)).spineColor)!;
    expect(Number(hue)).toBeLessThan(20);
  });

  it('clamps saturation and lightness into the printable band', () => {
    for (const sample of [solid(0, 0, 0), solid(255, 255, 255), solid(255, 0, 255)]) {
      const [, , saturation, lightness] = PATTERN.exec(spineFromPixels(sample).spineColor)!;
      expect(Number(saturation)).toBeGreaterThanOrEqual(30);
      expect(Number(saturation)).toBeLessThanOrEqual(68);
      expect(Number(lightness)).toBeGreaterThanOrEqual(30);
      expect(Number(lightness)).toBeLessThanOrEqual(58);
    }
  });

  it('marks a spine dark below 45% lightness and light above it', () => {
    expect(spineFromPixels(solid(0, 0, 0)).spineDark).toBe(true);
    expect(spineFromPixels(solid(255, 255, 255)).spineDark).toBe(false);
  });

  it('refuses an empty buffer rather than dividing by zero', () => {
    expect(() => spineFromPixels(new Uint8ClampedArray(0))).toThrow(RangeError);
  });
});

describe('fallbackSpine', () => {
  it('is stable for one id and valid for every id', () => {
    expect(fallbackSpine(603)).toEqual(fallbackSpine(603));
    for (let id = 0; id < 10; id += 1) {
      expect(fallbackSpine(id).spineColor).toMatch(PATTERN);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/colors.test.ts`
Expected: FAIL — cannot resolve `../src/lib/colors`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/colors.ts`:

```ts
import { posterUrl } from './tmdb-mapping';

/**
 * The spine colour, computed in the browser from the public poster. Per
 * CLAUDE.md this is the only value the browser is trusted with, and it is
 * written once — by whoever adds the film first — and never recomputed.
 */

const SAMPLE_WIDTH = 18;
const SAMPLE_HEIGHT = 27;
const POSTER_SIZE = 'w92';

// Saturated pixels carry the poster's identity. Near-black and near-white ones
// are shadow and paper, so they are discounted rather than dropped: a poster
// that really is mostly black still has to yield some hue.
const BASE_WEIGHT = 0.25;
const SATURATION_WEIGHT = 1.5;
const FLAT_PIXEL_DISCOUNT = 0.2;
const MIN_LIVELY_LIGHTNESS = 0.12;
const MAX_LIVELY_LIGHTNESS = 0.9;

// The printable band. Outside it a spine either glows or turns to mud next to
// its neighbours on the plank.
const MIN_SATURATION = 0.3;
const MAX_SATURATION = 0.68;
const MIN_LIGHTNESS = 0.3;
const MAX_LIGHTNESS = 0.58;

// Sits inside the clamped band above, so both branches are reachable. It
// decides whether the spine title is drawn in bone or in ink.
const DARK_SPINE_LIGHTNESS = 0.45;

const FALLBACK_HUES = [8, 28, 44, 142, 192, 214, 268, 330];
const FALLBACK_SATURATION = 42;
const FALLBACK_LIGHTNESS = 40;

const BYTES_PER_PIXEL = 4;
const MAX_BYTE = 255;
const PERCENT = 100;
const DEGREES_PER_SECTOR = 60;
const SECTORS = 6;

export interface Spine {
  spineColor: string;
  spineDark: boolean;
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / MAX_BYTE;
  const green = g / MAX_BYTE;
  const blue = b / MAX_BYTE;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? SECTORS : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return [hue * DEGREES_PER_SECTOR, saturation, lightness];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function spine(hue: number, saturation: number, lightness: number): Spine {
  return {
    spineColor: `hsl(${Math.round(hue)} ${Math.round(saturation * PERCENT)}% ${Math.round(
      lightness * PERCENT,
    )}%)`,
    spineDark: lightness < DARK_SPINE_LIGHTNESS,
  };
}

/** Takes the RGBA bytes a canvas hands back. Pure, so the weighting is testable
 *  without a DOM — the vitest environment is `node`. */
export function spineFromPixels(data: Uint8ClampedArray): Spine {
  if (data.length === 0) throw new RangeError('[colors] cannot average an empty buffer');

  let red = 0;
  let green = 0;
  let blue = 0;
  let total = 0;

  for (let i = 0; i < data.length; i += BYTES_PER_PIXEL) {
    const [, saturation, lightness] = toHsl(data[i], data[i + 1], data[i + 2]);
    const lively = lightness > MIN_LIVELY_LIGHTNESS && lightness < MAX_LIVELY_LIGHTNESS;
    const weight =
      BASE_WEIGHT + saturation * SATURATION_WEIGHT * (lively ? 1 : FLAT_PIXEL_DISCOUNT);
    red += data[i] * weight;
    green += data[i + 1] * weight;
    blue += data[i + 2] * weight;
    total += weight;
  }

  const [hue, saturation, lightness] = toHsl(red / total, green / total, blue / total);
  return spine(
    hue,
    clamp(saturation, MIN_SATURATION, MAX_SATURATION),
    clamp(lightness, MIN_LIGHTNESS, MAX_LIGHTNESS),
  );
}

/** For a film with no poster, or a poster that will not load. Keyed on the id so
 *  the same film always gets the same colour. */
export function fallbackSpine(tmdbId: number): Spine {
  const hue = FALLBACK_HUES[Math.abs(tmdbId) % FALLBACK_HUES.length];
  return spine(hue, FALLBACK_SATURATION / PERCENT, FALLBACK_LIGHTNESS / PERCENT);
}

/** Browser only — needs a canvas. Never rejects: a colour must always come back,
 *  because the add-film request cannot be made without one. */
export function spineFromPoster(posterPath: string | null, tmdbId: number): Promise<Spine> {
  const url = posterUrl(posterPath, POSTER_SIZE);
  if (!url) return Promise.resolve(fallbackSpine(tmdbId));

  return new Promise((resolve) => {
    const image = new Image();
    // image.tmdb.org serves CORS headers; without this the canvas is tainted
    // and getImageData throws.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) return resolve(fallbackSpine(tmdbId));
        context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        resolve(spineFromPixels(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data));
      } catch {
        resolve(fallbackSpine(tmdbId));
      }
    };
    image.onerror = () => resolve(fallbackSpine(tmdbId));
    image.src = url;
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/colors.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Lint, typecheck and commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/lib/colors.ts test/colors.test.ts
git commit -m "feat(colors): compute a film's spine colour from its poster"
```

---

### Task 4: `src/lib/shelf-target.ts` — which shelf the film lands on

**Files:**

- Create: `src/lib/shelf-target.ts`
- Test: `test/shelf-target.test.ts`

**Interfaces:**

- Consumes: `SHELF_CAPACITY` from `src/constants`, `Spine` from
  `src/lib/colors.ts`.
- Produces:
  - `interface ShelfSlot { id: string; filmCount: number }`
  - `firstShelfWithRoom(shelves: ShelfSlot[]): ShelfSlot | null`
  - `type AddOutcome = { ok: true; shelfId: string; position: number } | { ok: false; reason: 'all_full' | 'failed' }`
  - `addFilmToFirstShelfWithRoom(shelves, film, doFetch?): Promise<AddOutcome>`
    where `film` is `{ tmdbId: number } & Spine`

- [ ] **Step 1: Write the failing test**

Create `test/shelf-target.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { addFilmToFirstShelfWithRoom, firstShelfWithRoom } from '../src/lib/shelf-target';
import { SHELF_CAPACITY } from '../src/constants';

const FILM = { tmdbId: 603, spineColor: 'hsl(210 42% 40%)', spineDark: true };
const full = (id: string) => ({ id, filmCount: SHELF_CAPACITY });
const room = (id: string) => ({ id, filmCount: 1 });

function reply(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

describe('firstShelfWithRoom', () => {
  it('returns null when there are no shelves', () => {
    expect(firstShelfWithRoom([])).toBeNull();
  });

  it('returns null when every shelf is full', () => {
    expect(firstShelfWithRoom([full('a'), full('b')])).toBeNull();
  });

  it('picks the first shelf with room, top to bottom', () => {
    expect(firstShelfWithRoom([full('a'), room('b'), room('c')])?.id).toBe('b');
  });

  it('treats an over-full shelf as full', () => {
    expect(firstShelfWithRoom([{ id: 'a', filmCount: SHELF_CAPACITY + 5 }])).toBeNull();
  });
});

describe('addFilmToFirstShelfWithRoom', () => {
  it('posts the film and its spine to the first shelf with room', async () => {
    const doFetch = vi.fn().mockResolvedValue(reply(201, { position: 4 }));

    const outcome = await addFilmToFirstShelfWithRoom([full('a'), room('b')], FILM, doFetch);

    expect(outcome).toEqual({ ok: true, shelfId: 'b', position: 4 });
    expect(doFetch).toHaveBeenCalledTimes(1);
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe('/api/shelves/b/films');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(FILM);
  });

  it('moves to the next shelf when the counts were stale and the server says 409', async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(reply(409, { error: 'shelf_full' }))
      .mockResolvedValueOnce(reply(201, { position: 0 }));

    const outcome = await addFilmToFirstShelfWithRoom([room('a'), room('b')], FILM, doFetch);

    expect(outcome).toEqual({ ok: true, shelfId: 'b', position: 0 });
    expect(doFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/shelves/a/films',
      '/api/shelves/b/films',
    ]);
  });

  it('reports all_full when every shelf refuses', async () => {
    const doFetch = vi.fn().mockResolvedValue(reply(409, { error: 'shelf_full' }));

    expect(await addFilmToFirstShelfWithRoom([room('a'), room('b')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'all_full',
    });
  });

  it('reports all_full without calling the server when nothing has room', async () => {
    const doFetch = vi.fn();

    expect(await addFilmToFirstShelfWithRoom([full('a')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'all_full',
    });
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('stops on a non-409 failure rather than retrying every shelf', async () => {
    const doFetch = vi.fn().mockResolvedValue(reply(500));

    expect(await addFilmToFirstShelfWithRoom([room('a'), room('b')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it('reports failed when the network throws', async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error('offline'));

    expect(await addFilmToFirstShelfWithRoom([room('a')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/shelf-target.test.ts`
Expected: FAIL — cannot resolve `../src/lib/shelf-target`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/shelf-target.ts`:

```ts
import { SHELF_CAPACITY } from '../constants';
import type { Spine } from './colors';

/**
 * Where a film picked from search lands. Films get dragged into order
 * afterwards, so the landing shelf only has to be reasonable, not chosen.
 */

const SHELF_FULL_STATUS = 409;

/** The path is built here rather than in `src/constants/`, which stays
 *  declarations-only. */
const shelfFilmsPath = (shelfId: string) => `/api/shelves/${shelfId}/films`;

export interface ShelfSlot {
  id: string;
  filmCount: number;
}

export type AddOutcome =
  | { ok: true; shelfId: string; position: number }
  | { ok: false; reason: 'all_full' | 'failed' };

function hasRoom(shelf: ShelfSlot): boolean {
  return shelf.filmCount < SHELF_CAPACITY;
}

export function firstShelfWithRoom(shelves: ShelfSlot[]): ShelfSlot | null {
  return shelves.find(hasRoom) ?? null;
}

/** Walks down the shelves with room. The counts come from the page render, so a
 *  second tab can have filled a shelf since: a 409 means "stale, try the next
 *  one", not "give up". */
export async function addFilmToFirstShelfWithRoom(
  shelves: ShelfSlot[],
  film: { tmdbId: number } & Spine,
  doFetch: typeof fetch = fetch,
): Promise<AddOutcome> {
  for (const shelf of shelves.filter(hasRoom)) {
    let response: Response;
    try {
      response = await doFetch(shelfFilmsPath(shelf.id), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(film),
      });
    } catch {
      return { ok: false, reason: 'failed' };
    }

    if (response.ok) {
      const { position } = (await response.json()) as { position: number };
      return { ok: true, shelfId: shelf.id, position };
    }
    if (response.status !== SHELF_FULL_STATUS) return { ok: false, reason: 'failed' };
  }

  return { ok: false, reason: 'all_full' };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/shelf-target.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Lint, typecheck and commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/lib/shelf-target.ts test/shelf-target.test.ts
git commit -m "feat(shelves): pick the landing shelf and retry past a stale count"
```

---

### Task 5: The header slot, the header row, and the dashboard

After this task the dashboard shows a floating header with the wordmark and the
theme toggle, and `/login` looks exactly as it did.

**Files:**

- Modify: `src/constants/index.ts` (append)
- Modify: `src/components/Wordmark.astro`
- Modify: `src/layouts/Layout.astro`
- Create: `src/components/Header.astro`
- Rewrite: `src/pages/index.astro`

**Interfaces:**

- Consumes: `getOwnProfile` (Task 2), `listOwnShelves` from `src/lib/shelves.ts`.
- Produces:
  - `Layout.astro` renders a named slot `header` above `<main>`, and skips
    `ThemeToggle` whenever that slot is filled.
  - `Wordmark.astro` takes `variant?: 'page' | 'bar'`, default `'page'`.
  - `Header.astro` takes `displayName: string`.

- [ ] **Step 1: Append the new copy to `src/constants/index.ts`**

```ts
export const HOME_PAGE_TITLE = 'Tu estantería · Videothèque';

export const HEADER_HOME_LABEL = 'Ir a tu estantería';

// The search placeholder is the one string the shelf spec names verbatim.
export const SEARCH_PLACEHOLDER = 'Busca una película para archivarla';
export const SEARCH_LABEL = 'Buscar películas';
export const SEARCH_RESULTS_LABEL = 'Resultados de la búsqueda';
export const SEARCH_ON_SHELF = 'Ya en la estantería';
export const SEARCH_EMPTY = 'No hay resultados';
export const SEARCH_FAILED = 'No se pudo buscar. Inténtalo otra vez.';
export const SEARCH_ADDING = 'Añadiendo…';
export const ADD_FAILED = 'No se pudo añadir la película. Inténtalo otra vez.';

export const ACCOUNT_MENU_LABEL = 'Tu cuenta';
export const SIGN_OUT = 'Cerrar sesión';

export const SHELVES_LOAD_FAILED = 'No se pudieron cargar tus estanterías.';
```

- [ ] **Step 2: Give `Wordmark.astro` a bar variant**

Replace the whole file with:

```astro
---
import { HEADER_HOME_LABEL, HOME_PATH, WORDMARK } from '../constants';

interface Props {
  variant?: 'page' | 'bar';
}

const { variant = 'page' } = Astro.props;
---

<h1 class:list={['wordmark', variant]}>
  {variant === 'bar' ? <a href={HOME_PATH} aria-label={HEADER_HOME_LABEL}>{WORDMARK}</a> : WORDMARK}
</h1>

<style>
  .wordmark {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    text-transform: uppercase;
  }

  /* Big Shoulders is already condensed, so at page size it gets size rather
     than tracking — wide letterspacing throws away the narrowness it was
     picked for. */
  .page {
    font-size: clamp(52px, 13vw, 140px);
    /* The grave on the È rides above cap height and overflows a tighter line
       box, so it needs the extra leading rather than 1 or below. */
    line-height: 1.1;
    letter-spacing: 0.02em;
    text-align: center;
  }

  /* At bar size the argument reverses: 23px of condensed caps needs the
     tracking the addendum specifies to read as a masthead and not as a label. */
  .bar {
    font-size: 23px;
    line-height: 1;
    letter-spacing: 0.16em;
  }

  .bar a {
    color: inherit;
    text-decoration: none;
  }
</style>
```

- [ ] **Step 3: Give `Layout.astro` the header slot**

In the frontmatter, after `const { title } = Astro.props;`, add:

```ts
// The layout's own toggle is `position: fixed` at the top right, so a header
// would land on top of it. A page that brings chrome brings its own toggle.
const hasHeader = Astro.slots.has('header');
```

Replace the `<body>` contents with:

```astro
  <body>
    {hasHeader ? <slot name="header" /> : <ThemeToggle />}
    <main><slot /></main>
    <Attribution />
  </body>
```

- [ ] **Step 4: Create `src/components/Header.astro`**

```astro
---
import ThemeToggle from './ThemeToggle.astro';
import Wordmark from './Wordmark.astro';

interface Props {
  displayName: string;
}

const { displayName } = Astro.props;
---

<header>
  <Wordmark variant="bar" />

  <div class="cluster">
    <div class="search-slot"></div>
    <ThemeToggle />
    <span class="name">{displayName}</span>
  </div>
</header>

<style>
  /* No band and no rule: the wall runs unbroken from the top of the page to
     the bottom, the way Attribution already treats the foot. */
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px var(--gutter);
  }

  .cluster {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .name {
    font-size: 13px;
    color: var(--ink);
    white-space: nowrap;
  }

  /* Below this the five elements stop fitting on one line: the cluster wraps,
     the field takes the full width underneath, and the name goes — the avatar
     already identifies the account, and the name is what the field needs the
     room from. */
  @media (max-width: 640px) {
    header {
      flex-wrap: wrap;
      row-gap: 10px;
    }

    .cluster {
      flex-wrap: wrap;
    }

    .search-slot {
      order: 1;
      flex-basis: 100%;
    }

    .name {
      display: none;
    }
  }
</style>
```

The `.search-slot` div and the missing avatar are placeholders that Tasks 6 and
7 replace. They exist so this task can be reviewed on its own.

`ThemeToggle` still carries `position: fixed` from its own styles; the next step
verifies whether it needs unpinning inside the header.

- [ ] **Step 5: Unpin the theme toggle when it sits in the header**

In `src/components/ThemeToggle.astro`, change the `button` rule from
`position: fixed; top: 14px; right: 14px; z-index: 10;` to:

```css
  button {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 50%;
    color: var(--muted);
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }
```

Then in `src/layouts/Layout.astro`, wrap the header-less branch so the signed-out
pages keep the floating toggle they have today:

```astro
    {hasHeader ? <slot name="header" /> : <div class="toggle-corner"><ThemeToggle /></div>}
```

and add to the layout's styles:

```astro
<style>
  .toggle-corner {
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 10;
  }
</style>
```

Positioning belongs to whoever places the component, not to the component; this
is what lets the same toggle sit in a fixed corner on `/login` and in a flex row
in the header.

- [ ] **Step 6: Rewrite `src/pages/index.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import { HOME_PAGE_TITLE, LOGIN_PATH, SHELVES_LOAD_FAILED } from '../constants';
import { getOwnProfile } from '../lib/profiles';
import { listOwnShelves, type ShelfSummary } from '../lib/shelves';

export const prerender = false;

const { user, supabase } = Astro.locals;
if (!user) return Astro.redirect(LOGIN_PATH);

const userId = user.sub as string;
const email = user.email as string;

let shelves: ShelfSummary[] = [];
let displayName = email;
let loadError: string | null = null;
try {
  const [profile, ownShelves] = await Promise.all([
    getOwnProfile(supabase, userId),
    listOwnShelves(supabase, userId),
  ]);
  // The sign-up trigger seeds a profile, so a missing one means something went
  // wrong at registration — the email is a usable name until settings exists.
  displayName = profile?.display_name ?? email;
  shelves = ownShelves;
} catch (err) {
  loadError = SHELVES_LOAD_FAILED;
  console.error('[index] dashboard query failed', err);
}
---

<Layout title={HOME_PAGE_TITLE}>
  <Header slot="header" displayName={displayName} />

  {loadError && <p role="alert">{loadError}</p>}

  <ul>
    {shelves.map((shelf) => <li>{shelf.name}</li>)}
  </ul>
</Layout>
```

The bare shelf list is a placeholder: drawing planks and spines is spec D. The
`/e/[slug]` links are dropped because that route does not exist and those links
404 today.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, sign in, and open `/`.
Expected: wordmark at top left, theme toggle and the display name at top right,
no band behind them, the wall continuous. Resize below 640px: the row wraps and
the name disappears. Open `/login` in a signed-out window: unchanged, toggle
still fixed in the corner.

- [ ] **Step 8: Lint, typecheck, build and commit**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add src/constants/index.ts src/components/Wordmark.astro src/components/ThemeToggle.astro src/components/Header.astro src/layouts/Layout.astro src/pages/index.astro
git commit -m "feat(header): float the app chrome over the wall"
```

---

### Task 6: `AvatarMenu.astro`

**Files:**

- Create: `src/components/AvatarMenu.astro`
- Modify: `src/components/Header.astro`

**Interfaces:**

- Consumes: `ACCOUNT_MENU_LABEL`, `SIGN_OUT`, `SIGNOUT_PATH` from
  `src/constants`.
- Produces: `AvatarMenu.astro` taking `displayName: string`. Replaces the
  `.name` span in `Header.astro`.

- [ ] **Step 1: Create `src/components/AvatarMenu.astro`**

```astro
---
import { ACCOUNT_MENU_LABEL, SIGN_OUT, SIGNOUT_PATH } from '../constants';

interface Props {
  displayName: string;
}

const { displayName } = Astro.props;

const INITIALS_WORDS = 2;
// A seeded name is the email's local part and has no spaces, so one letter is
// the normal case until the settings page can set a real name.
const initials = displayName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, INITIALS_WORDS)
  .map((word) => word[0].toUpperCase())
  .join('');
---

<div class="account">
  <button id="avatar-button" type="button" aria-haspopup="menu" aria-expanded="false">
    <span class="avatar" aria-hidden="true">{initials}</span>
    <span class="name">{displayName}</span>
    <span class="sr-only">{ACCOUNT_MENU_LABEL}</span>
  </button>

  <div id="avatar-menu" role="menu" aria-label={ACCOUNT_MENU_LABEL} hidden>
    <form method="POST" action={SIGNOUT_PATH}>
      <button type="submit" role="menuitem">{SIGN_OUT}</button>
    </form>
  </div>
</div>

<style>
  .account {
    position: relative;
  }

  #avatar-button {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
  }

  /* A portrait frame rather than chrome, so it keeps its ground in both
     themes. */
  .avatar {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #3a3430;
    color: #e8e2da;
    font-size: 12px;
    font-weight: 600;
  }

  .name {
    font-size: 13px;
    color: var(--ink);
    white-space: nowrap;
  }

  #avatar-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    min-width: 170px;
    padding: 5px;
    background: var(--field);
    border: 1px solid var(--hairline);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  }

  #avatar-menu button {
    width: 100%;
    padding: 9px 11px;
    background: none;
    border: 0;
    border-radius: 5px;
    text-align: left;
    font-size: 13.5px;
    color: var(--ink);
    cursor: pointer;
  }

  #avatar-menu button:hover {
    background: var(--track);
  }

  @media (max-width: 640px) {
    .name {
      display: none;
    }
  }
</style>

<script>
  const button = document.querySelector<HTMLButtonElement>('#avatar-button');
  const menu = document.querySelector<HTMLElement>('#avatar-menu');

  if (button && menu) {
    const close = () => {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };

    button.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      button.setAttribute('aria-expanded', String(!menu.hidden));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) {
        close();
        button.focus();
      }
    });

    // Pointerdown, not click: a click listener fires after the menu item's own
    // handler has already run and closed it, which double-toggles.
    document.addEventListener('pointerdown', (event) => {
      const target = event.target as Node;
      if (!menu.hidden && !menu.contains(target) && !button.contains(target)) close();
    });
  }
</script>
```

- [ ] **Step 2: Mount it in `Header.astro`**

Add `import AvatarMenu from './AvatarMenu.astro';` to the frontmatter, replace
`<span class="name">{displayName}</span>` with
`<AvatarMenu displayName={displayName} />`, and delete the now-unused `.name`
rule and the `.name { display: none }` line from the `@media` block.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev` and open `/`.
Expected: the avatar circle shows the first letter of the display name with the
name beside it. Clicking opens a menu with one entry, "Cerrar sesión". Escape
closes it and returns focus to the avatar. Clicking outside closes it. The entry
signs you out and lands you on `/login`. Below 640px the name is hidden and the
circle remains.

- [ ] **Step 4: Lint, typecheck, build and commit**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add src/components/AvatarMenu.astro src/components/Header.astro
git commit -m "feat(header): add the avatar menu with sign-out"
```

---

### Task 7: `SearchBar.astro` — the field and the results

Search only. Picking a result does nothing yet; Task 8 wires that.

**Files:**

- Create: `src/components/SearchBar.astro`
- Modify: `src/components/Header.astro`

**Interfaces:**

- Consumes: `searchFilms` and `posterUrl` from `src/lib/tmdb.ts`, the search copy
  from `src/constants`.
- Produces: `SearchBar.astro` taking `shelvedIds: number[]`. Replaces
  `.search-slot` in `Header.astro`. Emits nothing yet; Task 8 adds the click
  handler in this same file.

- [ ] **Step 1: Create `src/components/SearchBar.astro`**

```astro
---
// Only what the markup uses. The `<script>` block is a separate module and
// imports its own strings; repeating them here trips no-unused-vars.
import { SEARCH_LABEL, SEARCH_PLACEHOLDER, SEARCH_RESULTS_LABEL } from '../constants';

interface Props {
  shelvedIds: number[];
}

const { shelvedIds } = Astro.props;
---

<div class="search">
  <label class="sr-only" for="film-search">{SEARCH_LABEL}</label>
  <input
    id="film-search"
    type="search"
    autocomplete="off"
    placeholder={SEARCH_PLACEHOLDER}
    role="combobox"
    aria-expanded="false"
    aria-controls="film-results"
    aria-autocomplete="list"
  />

  <ul id="film-results" role="listbox" aria-label={SEARCH_RESULTS_LABEL} hidden></ul>

  {/* Announces "adding…" and the failure messages. Silent until Task 8. */}
  <p id="search-status" class="sr-only" role="status" aria-live="polite"></p>

  <script
    id="shelved-ids"
    type="application/json"
    set:html={JSON.stringify(shelvedIds)}
  />
</div>

<style>
  .search {
    position: relative;
  }

  /* The only surface in the whole header, so it carries the whole job of
     separating chrome from wall. A full radius does that in light theme, where
     tone alone barely registers. */
  input {
    width: 280px;
    max-width: 100%;
    padding: 9px 16px;
    background: var(--field);
    border: 1px solid var(--hairline);
    border-radius: 999px;
    font-size: 13px;
  }

  input::placeholder {
    color: var(--muted);
  }

  input:focus {
    border-color: var(--ink);
    outline: none;
  }

  input::-webkit-search-cancel-button {
    display: none;
  }

  #film-results {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    width: 340px;
    max-width: 92vw;
    max-height: 60vh;
    overflow-y: auto;
    margin: 0;
    padding: 5px;
    list-style: none;
    background: var(--field);
    border: 1px solid var(--hairline);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  }

  #film-results :global(li) {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 9px;
    border-radius: 5px;
    cursor: pointer;
  }

  #film-results :global(li[aria-selected='true']),
  #film-results :global(li:hover) {
    background: var(--track);
  }

  #film-results :global(img),
  #film-results :global(.no-poster) {
    width: 34px;
    height: 51px;
    flex: none;
    border-radius: 2px;
    object-fit: cover;
    background: var(--track);
  }

  #film-results :global(.title) {
    font-size: 13px;
    color: var(--ink);
  }

  #film-results :global(.meta) {
    font-size: 11.5px;
    color: var(--muted);
  }

  #film-results :global(.state) {
    margin-left: auto;
    font-size: 11px;
    color: var(--brass);
    white-space: nowrap;
  }

  #film-results :global(.notice) {
    padding: 12px 10px;
    font-size: 12.5px;
    color: var(--muted);
    cursor: default;
  }

  @media (max-width: 640px) {
    input {
      width: 100%;
    }

    #film-results {
      width: 100%;
    }
  }
</style>

<script>
  import { posterUrl, searchFilms, type TmdbSearchResult } from '../lib/tmdb';
  import { SEARCH_EMPTY, SEARCH_FAILED, SEARCH_ON_SHELF } from '../constants';

  const DEBOUNCE_MS = 250;
  const MIN_QUERY_LENGTH = 2;
  const THUMBNAIL_SIZE = 'w92';
  const YEAR_LENGTH = 4;

  const input = document.querySelector<HTMLInputElement>('#film-search');
  const list = document.querySelector<HTMLUListElement>('#film-results');
  const shelvedScript = document.querySelector<HTMLScriptElement>('#shelved-ids');
  const status = document.querySelector<HTMLElement>('#search-status');

  if (input && list && shelvedScript && status) {
    const shelved = new Set<number>(JSON.parse(shelvedScript.textContent ?? '[]'));
    let results: TmdbSearchResult[] = [];
    let active = -1;
    let timer: number | undefined;
    // Responses can land out of order; only the newest query may paint.
    let latest = 0;

    const setOpen = (open: boolean) => {
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
    };

    const close = () => {
      setOpen(false);
      active = -1;
    };

    const notice = (text: string) => {
      list.replaceChildren(Object.assign(document.createElement('li'), {
        className: 'notice',
        textContent: text,
      }));
      setOpen(true);
    };

    const paint = () => {
      list.replaceChildren(
        ...results.map((film, index) => {
          const item = document.createElement('li');
          item.role = 'option';
          item.dataset.index = String(index);
          item.setAttribute('aria-selected', String(index === active));

          const url = posterUrl(film.poster_path, THUMBNAIL_SIZE);
          if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.loading = 'lazy';
            item.append(img);
          } else {
            item.append(Object.assign(document.createElement('span'), {
              className: 'no-poster',
            }));
          }

          const text = document.createElement('div');
          text.append(Object.assign(document.createElement('div'), {
            className: 'title',
            textContent: film.title,
          }));
          text.append(Object.assign(document.createElement('div'), {
            className: 'meta',
            textContent: (film.release_date ?? '').slice(0, YEAR_LENGTH),
          }));
          item.append(text);

          if (shelved.has(film.id)) {
            item.append(Object.assign(document.createElement('span'), {
              className: 'state',
              textContent: SEARCH_ON_SHELF,
            }));
          }

          return item;
        }),
      );
      setOpen(true);
    };

    const run = async (query: string) => {
      const ticket = (latest += 1);
      try {
        const response = await searchFilms(query);
        if (ticket !== latest) return;
        results = response.results;
        active = -1;
        if (results.length === 0) return notice(SEARCH_EMPTY);
        paint();
      } catch {
        if (ticket === latest) notice(SEARCH_FAILED);
      }
    };

    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < MIN_QUERY_LENGTH) {
        results = [];
        close();
        return;
      }
      timer = window.setTimeout(() => run(query), DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') return close();
      if (list.hidden || results.length === 0) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        active = (active + step + results.length) % results.length;
        paint();
        list.children[active]?.scrollIntoView({ block: 'nearest' });
      }
    });

    document.addEventListener('pointerdown', (event) => {
      const target = event.target as Node;
      if (!list.hidden && !list.contains(target) && !input.contains(target)) close();
    });
  }
</script>
```

- [ ] **Step 2: Mount it in `Header.astro`**

Add `import SearchBar from './SearchBar.astro';`, add `shelvedIds: number[]` to
`Props`, destructure it, and replace `<div class="search-slot"></div>` with:

```astro
    <div class="search-slot"><SearchBar shelvedIds={shelvedIds} /></div>
```

- [ ] **Step 3: Feed the shelved ids from the page**

In `src/pages/index.astro`, add `getShelvedFilmIds` — it does not exist yet, so
add it to `src/lib/shelves.ts` first:

```ts
/** Every film id already on one of this user's shelves, for the search
 *  dropdown's "already there" badge. Reads the cache, never TMDB. */
export async function listShelvedFilmIds(sb: Db, shelfIds: string[]): Promise<number[]> {
  if (shelfIds.length === 0) return [];
  const { data, error } = await sb.from('shelf_items').select('film_id').in('shelf_id', shelfIds);
  if (error) fail('listShelvedFilmIds', error);
  return ((data as { film_id: number }[] | null) ?? []).map((row) => row.film_id);
}
```

`fakeSupabase` has no `in` method yet — add it next to `eq` in
`test/helpers/fake-supabase.ts`:

```ts
  in = (...a: unknown[]) => this.push('in', ...a);
```

Then in `index.astro`, after the shelves load, compute and pass:

```ts
const shelvedIds = await listShelvedFilmIds(
  supabase,
  ownShelves.map((shelf) => shelf.id),
);
```

and `<Header slot="header" displayName={displayName} shelvedIds={shelvedIds} />`.
Initialise `let shelvedIds: number[] = [];` alongside the other state so the
error path still renders.

- [ ] **Step 4: Add a test for `listShelvedFilmIds`**

Append to `test/shelves.test.ts`:

```ts
describe('listShelvedFilmIds', () => {
  it('returns nothing without asking when the user has no shelves', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null } });
    expect(await listShelvedFilmIds(sb.client, [])).toEqual([]);
    expect(sb.opsFor('shelf_items')).toEqual([]);
  });

  it('flattens the rows to plain ids, scoped to the given shelves', async () => {
    const sb = fakeSupabase({
      shelf_items: { data: [{ film_id: 603 }, { film_id: 604 }], error: null },
    });
    expect(await listShelvedFilmIds(sb.client, [SHELF])).toEqual([603, 604]);
    expect(sb.opsFor('shelf_items')).toEqual(expect.arrayContaining([['in', 'shelf_id', [SHELF]]]));
  });
});
```

Add `listShelvedFilmIds` to the import list at the top of that file.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, including the two new cases.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev` and open `/`.
Expected: typing two characters opens a dropdown after a beat with posters,
titles and years. Arrow keys move the highlight and Enter does nothing yet.
Escape and an outside click close it. A nonsense query shows "No hay
resultados". Below 640px the field is full width on its own row and the
dropdown matches it.

- [ ] **Step 7: Lint, typecheck, build and commit**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add src/components/SearchBar.astro src/components/Header.astro src/pages/index.astro src/lib/shelves.ts test/shelves.test.ts test/helpers/fake-supabase.ts
git commit -m "feat(header): search TMDB live from the header"
```

---

### Task 8: Picking a result adds the film

**Files:**

- Modify: `src/components/SearchBar.astro` (the `<script>` block only)
- Modify: `src/components/Header.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**

- Consumes: `spineFromPoster` (Task 3), `addFilmToFirstShelfWithRoom` and
  `ShelfSlot` (Task 4), `SHELF_FULL_MESSAGE`, `SEARCH_ADDING`, `ADD_FAILED`.
- Produces: nothing new. `SearchBar.astro` gains a `shelves: ShelfSlot[]` prop.

- [ ] **Step 1: Pass the shelf slots down**

In `src/lib/shelves.ts`, extend `ShelfSummary` and its column list so the count
travels with the shelf:

```ts
const SHELF_SUMMARY_COLUMNS = 'id, name, slug, accent_color, is_public, shelf_items(count)';
```

and add to the interface:

```ts
  /** PostgREST returns an aggregate as a one-element array. */
  shelf_items: { count: number }[];
```

Add a mapper below it:

```ts
import type { ShelfSlot } from './shelf-target';

/** The shape the browser's add flow needs: id and how full it is. */
export function toShelfSlots(shelves: ShelfSummary[]): ShelfSlot[] {
  return shelves.map((shelf) => ({
    id: shelf.id,
    filmCount: shelf.shelf_items[0]?.count ?? 0,
  }));
}
```

**Changing `SHELF_SUMMARY_COLUMNS` will break the existing `listOwnShelves`
test** if it asserts on the selected columns. Open `test/shelves.test.ts`, find
the `listOwnShelves` block, and update the expected `select` argument to the new
string before running the suite.

In `index.astro`, pass `shelves={toShelfSlots(shelves)}` to `<Header>`, and in
`Header.astro` add `shelves: ShelfSlot[]` to `Props` and forward it to
`<SearchBar>`.

- [ ] **Step 2: Write the failing test for `toShelfSlots`**

Append to `test/shelves.test.ts`:

```ts
describe('toShelfSlots', () => {
  it('flattens the PostgREST count aggregate', () => {
    expect(
      toShelfSlots([
        { id: 'a', name: 'A', slug: 'a', accent_color: null, is_public: true, shelf_items: [{ count: 7 }] },
        { id: 'b', name: 'B', slug: 'b', accent_color: null, is_public: true, shelf_items: [] },
      ]),
    ).toEqual([
      { id: 'a', filmCount: 7 },
      { id: 'b', filmCount: 0 },
    ]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/shelves.test.ts -t toShelfSlots`
Expected: FAIL — `toShelfSlots` is not exported.

- [ ] **Step 4: Run it again after Step 1's implementation**

Run: `npx vitest run test/shelves.test.ts -t toShelfSlots`
Expected: PASS.

- [ ] **Step 5: Wire the click handler in `SearchBar.astro`**

Extend the frontmatter `Props` with `shelves: ShelfSlot[]`, destructure it, and
serialise it beside the ids:

```astro
  <script id="shelf-slots" type="application/json" set:html={JSON.stringify(shelves)} />
```

The status line is already in the markup from Task 7; extend the guard so the
new script element joins it:

```ts
  const slotsScript = document.querySelector<HTMLScriptElement>('#shelf-slots');

  if (input && list && shelvedScript && status && slotsScript) {
```

In the `<script>` block, extend the imports:

```ts
  import { spineFromPoster } from '../lib/colors';
  import { addFilmToFirstShelfWithRoom, type ShelfSlot } from '../lib/shelf-target';
  import { ADD_FAILED, SEARCH_ADDING, SHELF_FULL_MESSAGE } from '../constants';
```

and add, after the `shelved` set is built:

```ts
    const slots: ShelfSlot[] = JSON.parse(slotsScript.textContent ?? '[]');

    const pick = async (index: number) => {
      const film = results[index];
      if (!film || shelved.has(film.id)) return;

      status.textContent = SEARCH_ADDING;
      // The colour has to exist before the request: the endpoint validates it,
      // and it is the one value the browser is trusted with.
      const spine = await spineFromPoster(film.poster_path ?? null, film.id);
      const outcome = await addFilmToFirstShelfWithRoom(slots, { tmdbId: film.id, ...spine });

      if (!outcome.ok) {
        const message = outcome.reason === 'all_full' ? SHELF_FULL_MESSAGE : ADD_FAILED;
        status.textContent = message;
        notice(message);
        return;
      }

      shelved.add(film.id);
      const slot = slots.find((candidate) => candidate.id === outcome.shelfId);
      if (slot) slot.filmCount += 1;
      status.textContent = '';
      paint();
    };
```

Then hook it up: add `if (event.key === 'Enter' && active >= 0) { event.preventDefault(); pick(active); }`
to the `keydown` handler, and add a click listener on the list:

```ts
    list.addEventListener('click', (event) => {
      const item = (event.target as HTMLElement).closest<HTMLLIElement>('li[data-index]');
      if (item) pick(Number(item.dataset.index));
    });
```

`paint()` re-runs after a successful add, so the row picks up its "Ya en la
estantería" badge without another round trip. The spine does not appear on the
wall until the next load; drawing it is spec D.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev` and open `/`.
Expected: searching and clicking a result marks it "Ya en la estantería" within
a second. Reload: the film is on a shelf. Check the `films` row's `spine_color`
is an `hsl(...)` string that plausibly matches the poster and that `spine_dark`
matches its lightness. Add films until a shelf hits 20 and confirm the next one
lands on the following shelf; with no shelf left, the status reads "Tienes la
estantería llena, crea otra para seguir añadiendo películas". Clicking a film
already marked as shelved does nothing.

- [ ] **Step 7: Lint, typecheck, build and commit**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add src/components/SearchBar.astro src/components/Header.astro src/pages/index.astro src/lib/shelves.ts test/shelves.test.ts
git commit -m "feat(header): archive a searched film onto the first shelf with room"
```

- [ ] **Step 8: Open the pull request**

```bash
git push -u origin feat/profile-and-header
gh pr create --base main --title "feat(header): add profiles and the floating app header"
```

The body summarises the spec's decisions and links it. Per the repo rules the
body must not contain a `Claude-Session:` trailer or any
`claude.ai/code/session_…` URL, and must end with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
