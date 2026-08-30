# Videothèque · Magic-link auth and SSR sessions

Date: 2026-08-30
Status: approved for planning

## Goal

Wire Supabase magic-link authentication into the Astro SSR app so that
`index.astro` is owner-only and can render the signed-in user's shelves on the
server. Third sub-project in the work order (TMDB proxy → Supabase layer →
**auth** → port the shelf).

Deliverable: the Supabase client layer, an `/login` page, the email
confirmation route, a session-populating middleware, a signed-in `index.astro`
that lists the user's shelves, and sign-out. Porting `shelf-prototype.html` to
components stays out of scope.

## Scope

In scope:

- Add `@supabase/supabase-js` and `@supabase/ssr` (pinned, lockfile committed).
- `src/lib/supabase.ts`: server and browser client factories over the
  `@supabase/ssr` cookie adapter, plus co-located auth constants.
- `src/middleware.ts`: per-request server client, `getClaims()`, populate
  `Astro.locals`. No redirects here.
- `src/pages/login.astro`: email form, calls `signInWithOtp` in a client
  script, shows a "check your inbox" state; redirects to `/` if already signed
  in.
- `src/pages/auth/confirm.ts`: verifies the emailed `token_hash` with
  `verifyOtp`, sets the session cookies, redirects.
- `src/pages/auth/signout.ts`: `signOut`, redirect to `/login`.
- `src/pages/index.astro`: redirect to `/login` when unauthenticated;
  otherwise SSR the owner's shelves.
- `src/lib/auth-confirm.ts`: pure handler for the confirm route, unit-tested in
  the style of `src/lib/tmdb-proxy.ts`.
- `astro.config.mjs` + `.env.example`: the two public Supabase env vars.
- `supabase/README.md`: the dashboard steps (redirect URLs, email template).

Out of scope (later sub-projects):

- Porting `shelf-prototype.html` to Astro components (`Shelf`, `Spine`,
  `SearchBar`, `FilmCase`).
- `/e/[slug].astro` public shelf route. It needs no session; it is built with
  the shelf components.
- Adding, reordering, or deleting films; anything calling `place_film` /
  `reorder_shelf` from the client.
- Shelf CRUD UI (rename, accent colour, `is_public`, slug edit).
- Rate-limit UX beyond surfacing Supabase's own error text.
- Playwright / automated end-to-end auth (needs inbox access; manual checklist
  instead).
- Custom email branding beyond the one template line `verifyOtp` requires.

## Decisions

### 1. Cookie-based SSR sessions via `@supabase/ssr`

`createServerClient(url, key, { cookies: { getAll, setAll } })` bound to Astro's
cookie API on every request; `createBrowserClient(url, key)` in the browser for
`signInWithOtp` and `signOut`. This is the only option consistent with
`output: 'server'` and "`index.astro` requires a session" in `CLAUDE.md`: the
server reads the session, so it can both gate the page and run the shelves
query with the user's JWT (RLS applies server-side exactly as it would in the
browser).

Rejected: client-only auth (session in `localStorage`, client-side redirect).
It makes `index.astro` a client-rendered shell, flashes unauthenticated
content, and cannot SSR the shelf list — it would have to be undone in the next
sub-project.

### 2. Dependency justification (`CLAUDE.md` requires it)

- **`@supabase/supabase-js`** — the official client. Hand-rolling GoTrue OTP
  verification, session refresh, and PostgREST query building is far more code
  and risk than it saves. `CLAUDE.md` already commits to "Supabase: Postgres,
  magic-link auth, row level security"; the client is implied. Shipped cost:
  the browser bundle is the meaningful one (~40 KB gzip for the auth +
  PostgREST paths actually imported). Accepted — it is the core of the app's
  data layer, used again in every later sub-project.
- **`@supabase/ssr`** — small. Provides `createServerClient` /
  `createBrowserClient` and the `getAll` / `setAll` cookie adapter that keeps
  the chunked `sb-<ref>-auth-token` cookies in sync between server and browser.
  The alternative is serialising those cookie chunks by hand, fragile and
  coupled to `supabase-js` internals.

Both are pinned to an exact version and the lockfile is committed (Supabase
supply-chain guidance).

### 3. Open sign-up

`signInWithOtp` with `shouldCreateUser` left at its default (`true`): anyone
with a valid email gets an account, and the `on_auth_user_created` trigger
seeds their first shelf. Private shelves stay protected by RLS regardless of
who can sign in. No allowlist.

Accepted risk: an attacker who completes email verification for many addresses
creates one seeded (public, empty) shelf each. Supabase's built-in OTP send
rate limits (per address and per hour, project-wide) bound this; for a
two-user app it is not worth an allowlist or a captcha. If it ever matters, the
contained fix is an allowlist check before `signInWithOtp` plus tightening the
Auth rate-limit settings — no schema change.

### 4. `token_hash` + `verifyOtp`, not PKCE `exchangeCodeForSession`

The email link carries a `token_hash`; `src/pages/auth/confirm.ts` calls
`supabase.auth.verifyOtp({ type, token_hash })`. This works when the link is
opened on a different device from the one that requested it (request on a
laptop, open on a phone) — the PKCE `?code` flow cannot, because its code
verifier lives in a cookie on the requesting browser. Cost: one line in the
Supabase email template (below). This is Supabase's current recommended SSR
flow.

### 5. Middleware populates, pages gate

`src/middleware.ts` only builds `locals.supabase` and resolves `locals.user`.
The redirect lives in the page: `index.astro` does `if (!Astro.locals.user)
return Astro.redirect(LOGIN_PATH)`. One protected page today; no route-matcher
list to keep in sync. When the shelf editor arrives and there are several
protected pages, a matcher can move into the middleware then.

The user is resolved with **`getClaims()`** (verifies the JWT signature locally
against the project's asymmetric signing keys, no round-trip to the auth
server) — the current recommended call for route protection. `getUser()` is the
fallback if the project has not enabled asymmetric JWT signing keys (then
`getClaims()` would round-trip anyway). Never `getSession()` for an auth
decision server-side — it does not verify. Whichever call is used, run it
**immediately** after `createServerClient` with nothing in between, or session
refresh races cause sporadic logouts.

### 6. `index.astro` scope this phase: auth + list shelves

Signed in, `index.astro` renders a plain server-side list of the user's
shelves (`name`, `slug`, `accent_color`, `is_public`) and a sign-out button. No
shelf visuals, no create/edit. This exercises the authenticated server query
and the RLS path before the visual port.

## File structure

```
package.json                     + @supabase/supabase-js, @supabase/ssr (pinned)
astro.config.mjs                 env.schema: PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY
.env.example                     + those two, with the "publishable key is public" note
src/
  env.d.ts                       declare App.Locals { supabase: SupabaseClient; user: JwtPayload | null }
  lib/
    supabase.ts                  serverClient(cookies) / browserClient(); auth constants
    auth-confirm.ts              pure handler: (ctx) -> { status, location }
  middleware.ts                  per-request serverClient -> locals; no redirect
  pages/
    login.astro                  email form + client script (signInWithOtp); "check inbox" state
    auth/
      confirm.ts                 thin wrapper over auth-confirm.ts; sets cookies; redirects
      signout.ts                 POST -> signOut() -> redirect LOGIN_PATH
    index.astro                  guard -> redirect LOGIN_PATH; else SSR shelves list + signout
test/
  auth-confirm.test.ts           vitest, mirrors test/tmdb-proxy.test.ts
supabase/README.md               + "Auth setup" section (redirect URLs, email template)
```

`src/lib/supabase.ts` follows `tmdb-proxy.ts`: the testable logic is a plain
module, the `.ts` route files are thin Astro wrappers. Auth constants
(`LOGIN_PATH`, `CONFIRM_PATH`, `SIGNOUT_PATH`, `POST_LOGIN_PATH`, the OTP
`type`) are co-located in `supabase.ts` per `constants-and-types.md`. If
`index.astro` and `login.astro` both need `LOGIN_PATH`, promote just the path
constants to `src/constants/`.

## Modules

### `src/lib/supabase.ts`

```ts
import { createServerClient, createBrowserClient, parseCookieHeader } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';

export const LOGIN_PATH = '/login';
export const CONFIRM_PATH = '/auth/confirm';
export const SIGNOUT_PATH = '/auth/signout';
export const POST_LOGIN_PATH = '/';
export const OTP_TYPE = 'email' as const; // EmailOtpType for verifyOtp

export function serverClient(
  cookies: AstroCookies,
  requestHeaders: Headers,
  responseHeaders: Headers,
) {
  return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get('Cookie') ?? '');
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          responseHeaders.set(key, value);
        }
      },
    },
  });
}

export function browserClient() {
  return createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}
```

Notes for the plan:

- Pin `@supabase/ssr` first, then match `setAll`'s signature to that version's
  types. Current docs (verified against context7, Sept 2026) show
  `setAll(cookiesToSet, headers)` where `headers` carries `Cache-Control` /
  `Expires` / `Pragma` so a CDN never caches a response that sets a session
  cookie — copying them onto the response headers is not optional. If the
  pinned version's types show a one-argument `setAll`, drop the second loop.
- `responseHeaders` is `Astro.response.headers` in a page/endpoint and
  `context.request` has no response object in middleware — there,
  `setAll` runs against the headers of the `Response` returned by `next()`.
  The plan resolves this: either wrap `next()` and copy headers, or (simpler,
  and enough here) skip the cache headers in middleware since middleware only
  reads the session and the auth cookies are refreshed with `HttpOnly` +
  `SameSite=Lax` regardless. Pages that call `verifyOtp` / `signOut` do have
  `Astro.response.headers` and must pass it.
- `parseCookieHeader` may return `value: string | undefined`; coerce to `''`
  before handing tuples back if the pinned version's types require it.
- `PUBLIC_SUPABASE_ANON_KEY` holds whichever the project has — a modern
  **publishable** key (preferred) or a legacy **anon** key. Both are safe in
  the browser; RLS is the protection. The env var name stays
  `..._ANON_KEY` to match every existing reference in the repo and DB spec.

### `src/middleware.ts`

```ts
import { defineMiddleware } from 'astro:middleware';
import { serverClient } from './lib/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = serverClient(
    context.cookies,
    context.request.headers,
    context.response?.headers ?? new Headers(),
  );
  // Nothing between createServerClient and this call — see Decision 5.
  const { data } = await supabase.auth.getClaims();
  context.locals.supabase = supabase;
  context.locals.user = data?.claims ?? null;
  return next();
});
```

- `locals.user` carries the verified JWT claims (`sub` is the user id, used as
  `owner` in the shelves query). If a later page needs the full user record it
  calls `locals.supabase.auth.getUser()` itself.
- A thrown or errored `getClaims()` (network, expired/absent refresh token)
  resolves to `user: null` — treat it as signed out, do not 500.
- No redirect. `login.astro` and `index.astro` read `Astro.locals.user`.
- The exact `context` field for the outgoing response headers is confirmed
  against the pinned Astro version in the plan; the fallback `new Headers()`
  keeps `setAll` from throwing if it is absent (cache headers are non-critical
  for a read-only middleware pass — see the `supabase.ts` notes).

### `src/lib/auth-confirm.ts`

Pure, injectable, no Astro imports — the unit-test seam.

```ts
export interface AuthConfirmContext {
  params: URLSearchParams;
  verifyOtp: (args: { type: EmailOtpType; token_hash: string }) => Promise<{ error: unknown }>;
}
export interface AuthConfirmResult {
  status: 303;
  location: string; // POST_LOGIN_PATH, `next`, or `${LOGIN_PATH}?error=link`
}

export async function handleAuthConfirm(ctx: AuthConfirmContext): Promise<AuthConfirmResult>;
```

Behaviour:

| Input | Result |
| --- | --- |
| `token_hash` present, `verifyOtp` returns no error | 303 → `next` if it is a same-origin absolute path, else `POST_LOGIN_PATH` |
| `token_hash` missing, or `verifyOtp` returns an error, or it throws | 303 → `${LOGIN_PATH}?error=link` |

`type` comes from the query (`type` param) when present and in the allowed set
(`email`, `magiclink`, `recovery`), else defaults to `OTP_TYPE`. `next` is
accepted only when it starts with `/` and not `//` (open-redirect guard).

### `src/pages/auth/confirm.ts`

```ts
export const prerender = false;
export const GET: APIRoute = async ({ locals, url, redirect }) => {
  const { status, location } = await handleAuthConfirm({
    params: url.searchParams,
    verifyOtp: (args) => locals.supabase.auth.verifyOtp(args),
  });
  return redirect(location, status);
};
```

`verifyOtp` writes the fresh `sb-<ref>-auth-token` cookies as a side effect via
the client's `setAll` → `Astro.cookies.set`. The confirm and signout routes
reuse `locals.supabase`; the plan verifies the cookie writes land on the
outgoing response (they go through the shared `Astro.cookies`, so they do). If
the pinned Astro version makes `Astro.response.headers` reachable only from the
page and not the middleware-built client, the plan rebuilds a one-off
`serverClient(Astro.cookies, Astro.request.headers, Astro.response.headers)` in
these two routes instead.

### `src/pages/auth/signout.ts`

```ts
export const prerender = false;
export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  return redirect(LOGIN_PATH, 303);
};
```

POST only, triggered by a real `<form method="POST" action="/auth/signout">` on
`index.astro` — no JS needed, and GET stays side-effect free. Cross-site
sign-out (a mild CSRF: an attacker can only log you out) is blocked by Astro's
`security.checkOrigin`, on by default for on-demand pages, which rejects
form-encoded POSTs whose `Origin` does not match. The plan confirms it is not
disabled in `astro.config.mjs`; no CSRF token is added.

### `src/pages/login.astro`

- If `Astro.locals.user`, `return Astro.redirect(POST_LOGIN_PATH)`.
- Renders `<form>` with an `email` input. A client `<script>` imports
  `browserClient`, calls
  `signInWithOtp({ email, options: { emailRedirectTo: \`${location.origin}${CONFIRM_PATH}\` } })`,
  and swaps the form for a "check your inbox" message on success.
- On error, shows `error.message` inline and leaves the form in place.
- Reads `?error=link` on load and shows "That link didn't work — request a new
  one."
- No framework: `document.querySelector` + one event listener, matching the
  "plain JavaScript for the app shell" rule.

### `src/pages/index.astro`

```astro
---
export const prerender = false;
const { user, supabase } = Astro.locals;
if (!user) return Astro.redirect(LOGIN_PATH);

const { data: shelves, error } = await supabase
  .from('shelves')
  .select('id, name, slug, accent_color, is_public')
  .eq('owner', user.sub) // REQUIRED — see below
  .order('created_at', { ascending: true });
---
```

Renders the user's email (`user.email` claim), a `<ul>` of shelves (name,
`/e/<slug>`, a public/private marker), and the sign-out form. `error` renders a
plain inline message.

**`.eq('owner', user.sub)` is mandatory, not cosmetic.** The `shelves` SELECT
policy is `using (is_public or owner = (select auth.uid()))` — it deliberately
also exposes *other users'* public shelves so the `/e/[slug]` route can read
them without a session. Without the explicit owner filter, the home page would
list every public shelf on the platform alongside the user's own. RLS is the
security boundary (a private shelf of another user still never returns);
`.eq('owner', …)` is the correctness boundary for "my shelves".

## Auth flow

1. `/login`: user submits email → `browserClient.auth.signInWithOtp({ email,
   options: { emailRedirectTo: origin + CONFIRM_PATH } })`. Default
   `shouldCreateUser: true` → open sign-up. UI switches to "check your inbox".
2. Supabase sends the templated email. The link is
   `${SITE_URL}/auth/confirm?token_hash=…&type=email` (template edit below).
3. Any browser opens the link → middleware builds a server client → `GET
   /auth/confirm` → `handleAuthConfirm` → `verifyOtp({ type, token_hash })`.
   On success the client's `setAll` writes the `sb-<ref>-auth-token` cookies;
   303 → `/`.
4. First successful verification inserts the `auth.users` row →
   `on_auth_user_created` trigger seeds the first shelf → it is already present
   when `index.astro` queries.
5. `index.astro`: middleware resolved `locals.user`; page runs the `shelves`
   select with the user's JWT and renders the list.
6. Sign-out: `index.astro`'s form POSTs `/auth/signout` → `signOut()` clears
   the cookies → 303 → `/login`.

## Error handling

| Case | Handling |
| --- | --- |
| `signInWithOtp` fails (network, Supabase OTP rate limit ~1/60 s per email) | Inline message on `/login` using `error.message`; form preserved. |
| `/auth/confirm` with no `token_hash`, a `verifyOtp` error, or a throw | 303 → `/login?error=link`; login shows a friendly line. |
| `next` query param not a safe same-origin path | Ignored; redirect to `POST_LOGIN_PATH`. |
| `getClaims()` errors/throws in middleware | `locals.user = null`; user is treated as signed out. |
| Signed-in user visits `/login` | 303 → `/`. |
| `shelves` select returns an error | Inline message on `index.astro`; page still renders. |

## Env and Supabase configuration

`astro.config.mjs` → `env.schema`:

```js
PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
PUBLIC_SUPABASE_ANON_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
```

`optional: true` keeps `astro build` green in CI with an empty `.env`, matching
the existing `TMDB_ACCESS_TOKEN` treatment. `context: 'client'` public vars are
also readable server-side, so the middleware can import them.

`.env.example` gains:

```
# Supabase project URL and browser-safe key (Project Settings → API).
# The key is public by design; row level security is what protects data.
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
```

Dashboard steps, documented in `supabase/README.md` under a new "Auth setup"
section:

- **Authentication → URL Configuration**: Site URL = the production Vercel URL.
  Redirect URLs = exact paths only: `http://localhost:3000/auth/confirm` and
  `https://<vercel-domain>/auth/confirm`. `signInWithOtp` passes
  `emailRedirectTo` from the browser's `location.origin`, so this allowlist is
  what stops a magic link being aimed at an attacker's host — keep it tight. If
  Vercel preview deploys need to log in, add one narrowly-scoped wildcard
  (`https://videotheque-*-<team>.vercel.app/auth/confirm`), not `**`.
- **Authentication → Email Templates → Magic Link**: set the link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  (the default template uses `{{ .ConfirmationURL }}`, which drives the PKCE
  `?code` flow instead).
- **Authentication → Providers → Email**: "Confirm email" / magic link enabled;
  "Enable email signups" on (open sign-up).

## Testing

- **Unit — `test/auth-confirm.test.ts`** (mirrors `test/tmdb-proxy.test.ts`,
  injected deps, no network):
  - `token_hash` present + `verifyOtp` ok → 303 to `POST_LOGIN_PATH`.
  - valid same-origin `next` → 303 to `next`.
  - `next` of `//evil.com`, `https://evil.com`, or `not-a-path` → 303 to
    `POST_LOGIN_PATH`.
  - missing `token_hash` → 303 to `/login?error=link`, `verifyOtp` not called.
  - `verifyOtp` returns `{ error }` → 303 to `/login?error=link`.
  - `verifyOtp` throws → 303 to `/login?error=link`.
  - `type` from an allowed query value is forwarded; an unknown `type` falls
    back to `OTP_TYPE`.
- `serverClient` / `browserClient` are not unit-tested (thin SDK wrappers);
  covered by the manual checklist.
- **Manual checklist** (record in the plan, run against the hosted project):
  1. `npm run dev`, open `/` → redirected to `/login`.
  2. Submit email → "check your inbox"; email arrives.
  3. Open the link **in a different browser** → land on `/` signed in.
  4. `/` lists exactly one shelf (the sign-up seed) with its slug.
  5. Create a second shelf via SQL → reload → both listed, in `created_at`
     order.
  6. Create a **public** shelf owned by a different user via SQL → reload `/` →
     it does **not** appear (owner filter), but `GET /e/<that-slug>` still
     serves it.
  7. Sign out → back to `/login`; revisiting `/` redirects to `/login`.
  8. Visit `/auth/confirm` with no query → `/login?error=link` with the
     message shown.
  9. Signed in, open `/login` → redirected to `/`.
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all
  green. No Playwright in this sub-project.

## CLAUDE.md updates

None required. `src/lib/supabase.ts`, `src/middleware.ts`, and the `login` /
`auth/*` pages are consistent with the documented structure; the "Structure"
block already lists `supabase.ts` and `index.astro`. If anything, add
`src/middleware.ts` to the tree in a later docs pass — not load-bearing for
this change.

## Acceptance criteria

- `npm run build`, `typecheck`, `lint`, and `test` pass.
- With real Supabase credentials in `.env`, the manual checklist passes end to
  end, including opening the magic link on a second device/browser.
- `index.astro` performs exactly one Supabase query to render (the `shelves`
  select, filtered `.eq('owner', user.sub)`); it never calls TMDB, and it never
  lists a shelf the signed-in user does not own.
- The Supabase key in the client bundle is the publishable/anon key only; no
  service-role key anywhere in the repo or the shipped JS.
- `src/lib/auth-confirm.ts` has no Astro import and is fully covered by
  `test/auth-confirm.test.ts`.
- `.env.example` and `supabase/README.md` document every new variable and
  dashboard setting.
