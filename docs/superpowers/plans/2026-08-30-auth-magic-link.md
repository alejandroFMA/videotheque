# Magic-link Auth & SSR Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase magic-link authentication so `index.astro` is owner-only and renders the signed-in user's shelves on the server.

**Architecture:** `@supabase/ssr` cookie-based sessions. A per-request server client is built in `src/middleware.ts`, which resolves the user from verified JWT claims and puts `{ supabase, user }` on `Astro.locals`. Pages gate themselves (`index.astro` redirects to `/login` when there is no user). Login runs client-side (`signInWithOtp`); the emailed link lands on `GET /auth/confirm`, which calls `verifyOtp({ token_hash, type })` and sets the session cookies. Sign-out is a `POST` form to `/auth/signout`.

**Tech Stack:** Astro 7 SSR (`output: 'server'`, Vercel adapter), `@supabase/supabase-js`, `@supabase/ssr`, Vitest, plain DOM JS for the login script.

**Spec:** `docs/superpowers/specs/2026-08-30-auth-magic-link-design.md`

## Global Constraints

- **Exact-pin new dependencies and commit the lockfile.** `@supabase/supabase-js@2.112.4`, `@supabase/ssr@0.12.5`, installed with `--save-exact` (no `^`).
- **The service-role / secret Supabase key never appears in the repo or shipped JS.** Only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` (browser-safe; RLS is the protection).
- **Never make an auth decision from `getSession()` server-side.** Use `getClaims()` (verifies the JWT; falls back to a server call under a symmetric secret).
- **`index.astro` must filter shelves by `.eq('owner', user.sub)`.** The `shelves` SELECT policy is `is_public or owner = auth.uid()`, so RLS alone does not scope the list to the signed-in user.
- **No magic values inline** for URLs, paths, and keys — name them (`src/constants/`). HTTP status codes may be inline literals, matching `src/lib/tmdb-proxy.ts`.
- **Testable logic lives in plain `.ts` modules** with injected dependencies (the `src/lib/tmdb-proxy.ts` pattern); `.astro` and `src/pages/**` files stay thin wrappers.
- **CI gate (must stay green):** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, in that order.
- **Commit messages:** Conventional Commits, imperative subject ≤72 chars, keep the `Co-Authored-By:` and `Claude-Session:` trailers this repo uses.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/constants/index.ts` (modify) | Shared route paths, the OTP-type allowlist, the link-error query string. Declarations only. |
| `src/lib/supabase-cookies.ts` (create) | `makeCookieAdapter` — pure `{ getAll, setAll }` bridging a request `Cookie` header + Astro's `cookies.set` + a response `Headers`. Unit-tested. |
| `src/lib/supabase.ts` (create) | `serverClient()` / `browserClient()` factories over `@supabase/ssr`; missing-env guard. Thin wrapper, not unit-tested. |
| `src/lib/auth-session.ts` (create) | `resolveUser(supabase)` — verified claims or `null`, never throws. Unit-tested. |
| `src/lib/auth-confirm.ts` (create) | `handleAuthConfirm(ctx)` — pure decision for the confirm route (redirect target from `token_hash` / `type` / `next`). Unit-tested. |
| `src/middleware.ts` (create) | Build the request-scoped server client, populate `Astro.locals`, flush any refresh cookies' cache headers onto the response. |
| `src/pages/auth/confirm.ts` (create) | `GET` endpoint: run `handleAuthConfirm` against a real `verifyOtp`, return the redirect with session cookies set. |
| `src/pages/auth/signout.ts` (create) | `POST` endpoint: `signOut()`, redirect to `/login`. |
| `src/pages/login.astro` (create) | Server: bounce to `/` if already signed in. Client: email form → `signInWithOtp`, "check your inbox" state, `?error=link` message. |
| `src/pages/index.astro` (modify) | Replace the placeholder: gate to a signed-in user, SSR the owner's shelves, sign-out form. |
| `src/env.d.ts` (modify) | Declare `App.Locals { supabase, user }`. |
| `astro.config.mjs` (modify) | Add `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` to `env.schema`. |
| `.env.example` (modify) | Document the two public vars. |
| `supabase/README.md` (modify) | "Auth setup (hosted)" + "Testing magic links locally" runbook. |
| `test/supabase-cookies.test.ts`, `test/auth-session.test.ts`, `test/auth-confirm.test.ts` (create) | Unit tests for the three pure modules. |

---

## Task 1: Scaffolding — dependencies, env schema, locals typing, route constants

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Modify: `astro.config.mjs`
- Modify: `.env.example`
- Modify: `src/env.d.ts`
- Modify: `src/constants/index.ts`

**Interfaces:**
- Produces:
  - `PUBLIC_SUPABASE_URL: string | undefined`, `PUBLIC_SUPABASE_ANON_KEY: string | undefined` importable from `astro:env/client`.
  - `App.Locals { supabase: SupabaseClient; user: JwtPayload | null }`.
  - From `src/constants/index.ts`: `HOME_PATH`, `LOGIN_PATH`, `CONFIRM_PATH`, `SIGNOUT_PATH` (all `string`), `LINK_ERROR_QUERY: string`, `OTP_TYPES: readonly ['email','magiclink','recovery']`, `DEFAULT_OTP_TYPE: EmailOtpType`.

- [ ] **Step 1: Install the pinned dependencies**

```bash
npm install --save-exact @supabase/supabase-js@2.112.4 @supabase/ssr@0.12.5
```

- [ ] **Step 2: Verify they landed unpinned-free**

Run: `node -e "const p=require('./package.json');console.log(p.dependencies['@supabase/supabase-js'],p.dependencies['@supabase/ssr'])"`
Expected: `2.112.4 0.12.5` (exact, no `^`). If they show a caret, edit `package.json` to the bare versions and re-run `npm install`.

- [ ] **Step 3: Add the public env vars to `astro.config.mjs`**

In the `env.schema` object, after the `TMDB_ACCESS_TOKEN` line, add:

```js
      // Browser-safe: the anon/publishable key is public by design; row level
      // security is the protection. `optional: true` keeps `astro build` green
      // in CI with an empty .env, like TMDB_ACCESS_TOKEN.
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
```

- [ ] **Step 4: Document the vars in `.env.example`**

Append:

```
# Supabase project URL and browser-safe key (Project Settings -> API -> Project URL
# and the publishable/anon key). The key is public by design; row level security
# is what protects data. Both must be set for the app to serve any page.
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 5: Declare `App.Locals` in `src/env.d.ts`**

Replace the file contents with:

```ts
/// <reference types="astro/client" />

// TMDB_ACCESS_TOKEN is declared in `astro.config.mjs` under `env.schema` and
// read via `astro:env/server`; Astro generates its types (`.astro/env.d.ts`).

declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    user: import('@supabase/supabase-js').JwtPayload | null;
  }
}
```

If `npm run typecheck` in Step 8 reports `JwtPayload` is not exported from `@supabase/supabase-js`, change both `import('@supabase/supabase-js')` above to `import('@supabase/auth-js')`. The same fallback applies to every `@supabase/supabase-js` **type-only** import in later tasks (`JwtPayload`, `EmailOtpType`, `SupabaseClient`): if one is not re-exported, import it from `@supabase/auth-js` instead. Value imports (`createServerClient`, `createBrowserClient`) always come from `@supabase/ssr`.

- [ ] **Step 6: Write the shared route constants in `src/constants/index.ts`**

Replace the file contents (`export {};`) with:

```ts
import type { EmailOtpType } from '@supabase/supabase-js';

export const HOME_PATH = '/';
export const LOGIN_PATH = '/login';
export const CONFIRM_PATH = '/auth/confirm';
export const SIGNOUT_PATH = '/auth/signout';

// Appended to LOGIN_PATH when a magic link fails to verify.
export const LINK_ERROR_QUERY = 'error=link';

// The email template sends `type=email`; the others are accepted defensively.
export const OTP_TYPES = ['email', 'magiclink', 'recovery'] as const;
export const DEFAULT_OTP_TYPE: EmailOtpType = 'email';
```

- [ ] **Step 7: Format the changed files**

Run: `npx prettier --write astro.config.mjs .env.example src/env.d.ts src/constants/index.ts`
Expected: prettier rewrites/keeps each file; no error.

- [ ] **Step 8: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS. `typecheck` resolves `@supabase/*` types; `build` succeeds with an empty `.env` (vars are `optional`).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json astro.config.mjs .env.example src/env.d.ts src/constants/index.ts
git commit -m "$(cat <<'EOF'
feat: scaffold Supabase auth deps, env vars, and route constants

Pin @supabase/supabase-js and @supabase/ssr, expose the two public
Supabase env vars via astro:env, type App.Locals, and add the shared
auth route constants.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 2: Cookie adapter (`src/lib/supabase-cookies.ts`)

**Files:**
- Create: `src/lib/supabase-cookies.ts`
- Test: `test/supabase-cookies.test.ts`

**Interfaces:**
- Consumes: `parseCookieHeader` from `@supabase/ssr`; `CookieOptions` type from `@supabase/ssr`; `AstroCookies` type from `astro`.
- Produces: `makeCookieAdapter(cookies: Pick<AstroCookies, 'set'>, requestHeaders: Headers, responseHeaders: Headers): { getAll(): { name: string; value: string }[]; setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[], headers: Record<string, string>): void }`.

- [ ] **Step 1: Write the failing test**

Create `test/supabase-cookies.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeCookieAdapter } from '../src/lib/supabase-cookies';

function setup(cookieHeader = '') {
  const set = vi.fn();
  const req = new Headers(cookieHeader ? { cookie: cookieHeader } : {});
  const res = new Headers();
  return { adapter: makeCookieAdapter({ set }, req, res), set, res };
}

describe('makeCookieAdapter.getAll', () => {
  it('parses the Cookie header into name/value pairs', () => {
    const { adapter } = setup('sb-ref-auth-token=abc; other=xyz');
    expect(adapter.getAll()).toEqual([
      { name: 'sb-ref-auth-token', value: 'abc' },
      { name: 'other', value: 'xyz' },
    ]);
  });

  it('returns [] when there is no Cookie header', () => {
    const { adapter } = setup();
    expect(adapter.getAll()).toEqual([]);
  });
});

describe('makeCookieAdapter.setAll', () => {
  it('writes every cookie through cookies.set with its options', () => {
    const { adapter, set } = setup();
    adapter.setAll(
      [
        { name: 'a', value: '1', options: { path: '/' } },
        { name: 'b', value: '2', options: { path: '/', httpOnly: true } },
      ],
      {},
    );
    expect(set).toHaveBeenNthCalledWith(1, 'a', '1', { path: '/' });
    expect(set).toHaveBeenNthCalledWith(2, 'b', '2', { path: '/', httpOnly: true });
  });

  it('copies response headers onto the response Headers object', () => {
    const { adapter, res } = setup();
    adapter.setAll([], { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' });
    expect(res.get('Cache-Control')).toBe('private, no-store');
    expect(res.get('Pragma')).toBe('no-cache');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/supabase-cookies.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/supabase-cookies'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/supabase-cookies.ts`:

```ts
import { parseCookieHeader } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * The `{ getAll, setAll }` pair `@supabase/ssr`'s `createServerClient` needs,
 * wired to a request's `Cookie` header (read), Astro's `cookies.set` (session
 * cookie writes, which Astro serialises onto whatever Response the handler
 * returns), and a `Headers` object for the no-store cache headers that must
 * ride along with any `Set-Cookie`.
 */
export function makeCookieAdapter(
  cookies: Pick<AstroCookies, 'set'>,
  requestHeaders: Headers,
  responseHeaders: Headers,
) {
  return {
    getAll() {
      return parseCookieHeader(requestHeaders.get('cookie') ?? '');
    },
    setAll(cookiesToSet: CookieToSet[], headers: Record<string, string>) {
      for (const { name, value, options } of cookiesToSet) {
        cookies.set(name, value, options as Parameters<AstroCookies['set']>[2]);
      }
      for (const [key, value] of Object.entries(headers)) {
        responseHeaders.set(key, value);
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/supabase-cookies.test.ts`
Expected: PASS (5 assertions across 4 `it` blocks).

If `getAll` returns objects with extra keys, check the installed `@supabase/ssr` version is `0.12.5` (its `parseCookieHeader` returns exactly `{ name, value }`).

- [ ] **Step 5: Format, lint, typecheck**

Run: `npx prettier --write src/lib/supabase-cookies.ts test/supabase-cookies.test.ts && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase-cookies.ts test/supabase-cookies.test.ts
git commit -m "$(cat <<'EOF'
feat: add the @supabase/ssr cookie adapter

makeCookieAdapter bridges a request Cookie header, Astro's cookies.set,
and a response Headers object for the no-store cache headers.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 3: Supabase client factories (`src/lib/supabase.ts`)

**Files:**
- Create: `src/lib/supabase.ts`

**Interfaces:**
- Consumes: `createServerClient`, `createBrowserClient` from `@supabase/ssr`; `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` from `astro:env/client`; `makeCookieAdapter` from `./supabase-cookies`; `AstroCookies` from `astro`.
- Produces:
  - `serverClient(cookies: AstroCookies, requestHeaders: Headers, responseHeaders: Headers): SupabaseClient`
  - `browserClient(): SupabaseClient`

- [ ] **Step 1: Write the implementation**

Create `src/lib/supabase.ts`:

```ts
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';
import type { AstroCookies } from 'astro';
import { makeCookieAdapter } from './supabase-cookies';

function credentials(): { url: string; key: string } {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must be set — see .env.example',
    );
  }
  return { url: PUBLIC_SUPABASE_URL, key: PUBLIC_SUPABASE_ANON_KEY };
}

/** Request-scoped client for middleware, pages, and endpoints. Never cache it. */
export function serverClient(
  cookies: AstroCookies,
  requestHeaders: Headers,
  responseHeaders: Headers,
) {
  const { url, key } = credentials();
  return createServerClient(url, key, {
    cookies: makeCookieAdapter(cookies, requestHeaders, responseHeaders),
  });
}

/** Browser client for the login form (`signInWithOtp`) and sign-out. */
export function browserClient() {
  const { url, key } = credentials();
  return createBrowserClient(url, key);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `createServerClient`'s `cookies` option rejects the adapter's return type, confirm `makeCookieAdapter` returns both `getAll` and `setAll` (Task 2) — `@supabase/ssr@0.12.5` requires both.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS (no page imports `supabase.ts` yet; this only checks it compiles under the Astro/Vite pipeline).

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/lib/supabase.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "$(cat <<'EOF'
feat: add Supabase server and browser client factories

serverClient wraps createServerClient with the cookie adapter;
browserClient wraps createBrowserClient. Both throw a clear error when
the public env vars are missing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 4: Session resolver (`src/lib/auth-session.ts`)

**Files:**
- Create: `src/lib/auth-session.ts`
- Test: `test/auth-session.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`, `JwtPayload` types from `@supabase/supabase-js`.
- Produces: `resolveUser(supabase: { auth: Pick<SupabaseClient['auth'], 'getClaims'> }): Promise<JwtPayload | null>`.

- [ ] **Step 1: Write the failing test**

Create `test/auth-session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveUser } from '../src/lib/auth-session';

const claims = {
  iss: 'https://x.supabase.co/auth/v1',
  sub: '11111111-1111-1111-1111-111111111111',
  aud: 'authenticated',
  exp: 1,
  iat: 1,
  role: 'authenticated',
  aal: 'aal1',
  session_id: '22222222-2222-2222-2222-222222222222',
  email: 'a@b.com',
};

const withGetClaims = (impl: () => Promise<unknown>) =>
  ({ auth: { getClaims: impl } }) as Parameters<typeof resolveUser>[0];

describe('resolveUser', () => {
  it('returns the claims when getClaims succeeds', async () => {
    const supabase = withGetClaims(async () => ({
      data: { claims, header: { alg: 'RS256', kid: 'k', typ: 'JWT' }, signature: new Uint8Array() },
      error: null,
    }));
    expect(await resolveUser(supabase)).toEqual(claims);
  });

  it('returns null when there is no session (data null, no error)', async () => {
    const supabase = withGetClaims(async () => ({ data: null, error: null }));
    expect(await resolveUser(supabase)).toBeNull();
  });

  it('returns null when getClaims resolves an error', async () => {
    const supabase = withGetClaims(async () => ({ data: null, error: new Error('bad jwt') }));
    expect(await resolveUser(supabase)).toBeNull();
  });

  it('returns null when getClaims throws (network)', async () => {
    const supabase = withGetClaims(async () => {
      throw new Error('network down');
    });
    expect(await resolveUser(supabase)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auth-session.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/auth-session'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth-session.ts`:

```ts
import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js';

type WithGetClaims = { auth: Pick<SupabaseClient['auth'], 'getClaims'> };

/**
 * The verified JWT claims for the current request, or `null` when there is no
 * session or the token cannot be trusted. Never throws — a transport failure
 * against the auth server is treated as "signed out".
 */
export async function resolveUser(supabase: WithGetClaims): Promise<JwtPayload | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    return data?.claims ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/auth-session.test.ts`
Expected: PASS (4 `it` blocks).

- [ ] **Step 5: Format, lint, typecheck**

Run: `npx prettier --write src/lib/auth-session.ts test/auth-session.test.ts && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-session.ts test/auth-session.test.ts
git commit -m "$(cat <<'EOF'
feat: resolve the request user from verified JWT claims

resolveUser calls getClaims and returns the claims or null, swallowing
transport errors as "signed out".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 5: Confirm handler (`src/lib/auth-confirm.ts`)

**Files:**
- Create: `src/lib/auth-confirm.ts`
- Test: `test/auth-confirm.test.ts`

**Interfaces:**
- Consumes: `EmailOtpType` type from `@supabase/supabase-js`; `HOME_PATH`, `LOGIN_PATH`, `LINK_ERROR_QUERY`, `OTP_TYPES`, `DEFAULT_OTP_TYPE` from `../constants`.
- Produces:
  - `interface AuthConfirmContext { params: URLSearchParams; verifyOtp: (args: { token_hash: string; type: EmailOtpType }) => Promise<{ error: unknown }> }`
  - `interface AuthConfirmResult { status: 303; location: string }`
  - `handleAuthConfirm(ctx: AuthConfirmContext): Promise<AuthConfirmResult>`

- [ ] **Step 1: Write the failing test**

Create `test/auth-confirm.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { handleAuthConfirm } from '../src/lib/auth-confirm';

const FAIL = '/login?error=link';

function ctx(qs: string, verifyOtp = vi.fn().mockResolvedValue({ error: null })) {
  return { params: new URLSearchParams(qs), verifyOtp };
}

describe('handleAuthConfirm', () => {
  it('verifies the token and redirects home on success', async () => {
    const c = ctx('token_hash=abc&type=email');
    const res = await handleAuthConfirm(c);
    expect(c.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'email' });
    expect(res).toEqual({ status: 303, location: '/' });
  });

  it('honours a safe same-origin `next`', async () => {
    const res = await handleAuthConfirm(ctx('token_hash=abc&type=email&next=/shelf/xyz'));
    expect(res.location).toBe('/shelf/xyz');
  });

  it.each(['//evil.com', 'https://evil.com', 'evil', '/\\evil'])(
    'ignores an unsafe `next` (%s) and redirects home',
    async (next) => {
      const res = await handleAuthConfirm(
        ctx(`token_hash=abc&type=email&next=${encodeURIComponent(next)}`),
      );
      expect(res.location).toBe('/');
    },
  );

  it('falls back to type=email for an unknown `type`', async () => {
    const c = ctx('token_hash=abc&type=bogus');
    await handleAuthConfirm(c);
    expect(c.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'email' });
  });

  it('redirects to the link error when token_hash is missing, without verifying', async () => {
    const c = ctx('type=email');
    const res = await handleAuthConfirm(c);
    expect(c.verifyOtp).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 303, location: FAIL });
  });

  it('redirects to the link error when verifyOtp returns an error', async () => {
    const c = ctx('token_hash=abc&type=email', vi.fn().mockResolvedValue({ error: new Error('expired') }));
    expect((await handleAuthConfirm(c)).location).toBe(FAIL);
  });

  it('redirects to the link error when verifyOtp throws', async () => {
    const c = ctx('token_hash=abc&type=email', vi.fn().mockRejectedValue(new Error('boom')));
    expect((await handleAuthConfirm(c)).location).toBe(FAIL);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auth-confirm.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/auth-confirm'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth-confirm.ts`:

```ts
import type { EmailOtpType } from '@supabase/supabase-js';
import {
  DEFAULT_OTP_TYPE,
  HOME_PATH,
  LINK_ERROR_QUERY,
  LOGIN_PATH,
  OTP_TYPES,
} from '../constants';

export interface AuthConfirmContext {
  params: URLSearchParams;
  verifyOtp: (args: { token_hash: string; type: EmailOtpType }) => Promise<{ error: unknown }>;
}

export interface AuthConfirmResult {
  status: 303;
  location: string;
}

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return HOME_PATH;
  }
  return raw;
}

function resolveType(raw: string | null): EmailOtpType {
  return raw && (OTP_TYPES as readonly string[]).includes(raw)
    ? (raw as EmailOtpType)
    : DEFAULT_OTP_TYPE;
}

/**
 * Decides where `GET /auth/confirm` sends the browser. Pure: the caller injects
 * the real `verifyOtp`, whose cookie side effects land on the response.
 */
export async function handleAuthConfirm(ctx: AuthConfirmContext): Promise<AuthConfirmResult> {
  const failure: AuthConfirmResult = {
    status: 303,
    location: `${LOGIN_PATH}?${LINK_ERROR_QUERY}`,
  };

  const tokenHash = ctx.params.get('token_hash');
  if (!tokenHash) return failure;

  try {
    const { error } = await ctx.verifyOtp({
      token_hash: tokenHash,
      type: resolveType(ctx.params.get('type')),
    });
    if (error) return failure;
  } catch {
    return failure;
  }

  return { status: 303, location: safeNext(ctx.params.get('next')) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/auth-confirm.test.ts`
Expected: PASS (the `it.each` expands to 4 cases; 10 assertions total).

- [ ] **Step 5: Full test run, format, lint, typecheck**

Run: `npx prettier --write src/lib/auth-confirm.ts test/auth-confirm.test.ts && npm run lint && npm run typecheck && npm test`
Expected: all PASS; `npm test` now runs `supabase-cookies`, `auth-session`, `auth-confirm`, plus the existing `tmdb` suites.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-confirm.ts test/auth-confirm.test.ts
git commit -m "$(cat <<'EOF'
feat: add the pure /auth/confirm redirect handler

handleAuthConfirm verifies token_hash via an injected verifyOtp, guards
the `next` param against open redirects, and falls back to
/login?error=link on any failure.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 6: Middleware (`src/middleware.ts`)

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `defineMiddleware` from `astro:middleware`; `serverClient` from `./lib/supabase`; `resolveUser` from `./lib/auth-session`.
- Produces: populates `context.locals.supabase` and `context.locals.user` for every request; flushes refresh-cookie cache headers onto the response.

- [ ] **Step 1: Write the implementation**

Create `src/middleware.ts`:

```ts
import { defineMiddleware } from 'astro:middleware';
import { serverClient } from './lib/supabase';
import { resolveUser } from './lib/auth-session';

export const onRequest = defineMiddleware(async (context, next) => {
  // `setAll` cannot see the final Response yet, so collect any cache headers
  // a token refresh emits and copy them on after `next()`. Session cookies go
  // through `context.cookies`, which Astro serialises onto the response itself.
  const refreshHeaders = new Headers();
  const supabase = serverClient(context.cookies, context.request.headers, refreshHeaders);

  context.locals.supabase = supabase;
  // Nothing between serverClient and the claims read — a late refresh that
  // lands after the response is committed would be lost.
  context.locals.user = await resolveUser(supabase);

  const response = await next();
  refreshHeaders.forEach((value, key) => response.headers.set(key, value));
  return response;
});
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS. `build` does not execute the middleware, so a missing `.env` is fine here.

- [ ] **Step 3: Smoke-test against real credentials (if available)**

Only if `.env` has `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`:
Run: `npm run dev`, then in another shell `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/`
Expected: `200` (the placeholder `index.astro` still renders; the middleware ran without throwing). Stop the dev server.
If `.env` is empty, skip — Task 9 covers the live run.

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/middleware.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts
git commit -m "$(cat <<'EOF'
feat: populate Astro.locals with the Supabase client and user

Per-request middleware builds the server client, resolves the verified
user, and flushes any refresh-cookie cache headers onto the response.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 7: Auth endpoints (`src/pages/auth/confirm.ts`, `src/pages/auth/signout.ts`)

**Files:**
- Create: `src/pages/auth/confirm.ts`
- Create: `src/pages/auth/signout.ts`

**Interfaces:**
- Consumes: `APIRoute` from `astro`; `serverClient` from `../../lib/supabase`; `handleAuthConfirm` from `../../lib/auth-confirm`; `LOGIN_PATH` from `../../constants`.
- Produces: `GET /auth/confirm` and `POST /auth/signout` HTTP endpoints.

- [ ] **Step 1: Write `src/pages/auth/confirm.ts`**

```ts
import type { APIRoute } from 'astro';
import { handleAuthConfirm } from '../../lib/auth-confirm';
import { serverClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, request, url }) => {
  // Own the response headers so verifyOtp's no-store cache headers survive.
  const headers = new Headers();
  const supabase = serverClient(cookies, request.headers, headers);

  const { status, location } = await handleAuthConfirm({
    params: url.searchParams,
    verifyOtp: (args) => supabase.auth.verifyOtp(args),
  });

  headers.set('Location', location);
  return new Response(null, { status, headers });
};
```

- [ ] **Step 2: Write `src/pages/auth/signout.ts`**

```ts
import type { APIRoute } from 'astro';
import { LOGIN_PATH } from '../../constants';
import { serverClient } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  const headers = new Headers();
  const supabase = serverClient(cookies, request.headers, headers);
  await supabase.auth.signOut();

  headers.set('Location', LOGIN_PATH);
  return new Response(null, { status: 303, headers });
};
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS. `build` should report the two new routes (`/auth/confirm`, `/auth/signout`) as on-demand endpoints.

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/pages/auth/confirm.ts src/pages/auth/signout.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/auth/confirm.ts src/pages/auth/signout.ts
git commit -m "$(cat <<'EOF'
feat: add /auth/confirm and /auth/signout endpoints

confirm runs handleAuthConfirm against the real verifyOtp; signout
clears the session and redirects to /login. Both own their response
headers so the no-store cache headers ride with Set-Cookie.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 8: Login page (`src/pages/login.astro`)

**Files:**
- Create: `src/pages/login.astro`

**Interfaces:**
- Consumes: `Astro.locals.user`; `browserClient` from `../lib/supabase`; `CONFIRM_PATH`, `HOME_PATH` from `../constants`.
- Produces: the `/login` route.

- [ ] **Step 1: Write the page**

Create `src/pages/login.astro`:

```astro
---
import { HOME_PATH } from '../constants';

export const prerender = false;

if (Astro.locals.user) return Astro.redirect(HOME_PATH);
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Sign in · Videothèque</title>
  </head>
  <body>
    <main>
      <h1>Videothèque</h1>
      <form id="login-form">
        <label>
          Email
          <input type="email" name="email" autocomplete="email" required />
        </label>
        <button type="submit">Send me a link</button>
      </form>
      <p id="login-status" role="status" aria-live="polite"></p>
    </main>

    <script>
      import { browserClient } from '../lib/supabase';
      import { CONFIRM_PATH } from '../constants';

      const form = document.querySelector<HTMLFormElement>('#login-form');
      const status = document.querySelector<HTMLParagraphElement>('#login-status');

      if (form && status) {
        if (new URLSearchParams(location.search).get('error') === 'link') {
          status.textContent = 'That link didn’t work — request a new one.';
        }

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const email = String(new FormData(form).get('email') ?? '').trim();
          if (!email) return;

          const button = form.querySelector('button');
          if (button) button.disabled = true;
          status.textContent = 'Sending…';

          const { error } = await browserClient().auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${location.origin}${CONFIRM_PATH}` },
          });

          if (error) {
            status.textContent = error.message;
            if (button) button.disabled = false;
            return;
          }

          form.hidden = true;
          status.textContent = `Check ${email} for a sign-in link.`;
        });
      }
    </script>
  </body>
</html>
```

- [ ] **Step 2: Typecheck, build, lint, format**

Run: `npx prettier --write src/pages/login.astro && npm run lint && npm run typecheck && npm run build`
Expected: all PASS. `build` lists `/login` as an on-demand route and bundles the client script (it imports `supabase.ts`, so the `PUBLIC_SUPABASE_*` values are inlined at build — empty is fine for CI, real values in a real build).

- [ ] **Step 3: Visual check (if credentials available)**

Only with a real `.env`: `npm run dev`, open `http://localhost:3000/login`, confirm the form renders and the browser console shows no import errors. Do not submit yet (Task 10 runs the full flow). Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/pages/login.astro
git commit -m "$(cat <<'EOF'
feat: add the /login magic-link page

Server-bounces a signed-in visitor to home; client script sends the OTP
email via signInWithOtp, shows an inbox prompt, and surfaces
?error=link.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 9: Home page (`src/pages/index.astro`)

**Files:**
- Modify: `src/pages/index.astro` (replace the placeholder body entirely)

**Interfaces:**
- Consumes: `Astro.locals.user`, `Astro.locals.supabase`; `LOGIN_PATH`, `SIGNOUT_PATH` from `../constants`.
- Produces: the authenticated `/` route.

- [ ] **Step 1: Rewrite the page**

Replace the whole contents of `src/pages/index.astro` with:

```astro
---
import { LOGIN_PATH, SIGNOUT_PATH } from '../constants';

export const prerender = false;

const { user, supabase } = Astro.locals;
if (!user) return Astro.redirect(LOGIN_PATH);

// `.eq('owner', user.sub)` is REQUIRED: the shelves SELECT policy also exposes
// other users' public shelves (for /e/[slug]), so RLS alone would not scope
// this list to the signed-in user.
const { data: shelves, error } = await supabase
  .from('shelves')
  .select('id, name, slug, accent_color, is_public')
  .eq('owner', user.sub)
  .order('created_at', { ascending: true });
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Videothèque</title>
  </head>
  <body>
    <main>
      <h1>Videothèque</h1>
      <p>Signed in as {user.email}</p>

      {error && <p role="alert">Could not load your shelves: {error.message}</p>}

      <ul>
        {
          (shelves ?? []).map((shelf) => (
            <li>
              <a href={`/e/${shelf.slug}`}>{shelf.name}</a>
              {!shelf.is_public && <span> (private)</span>}
            </li>
          ))
        }
      </ul>

      <form method="POST" action={SIGNOUT_PATH}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Typecheck, build, lint, format**

Run: `npx prettier --write src/pages/index.astro && npm run lint && npm run typecheck && npm run build`
Expected: all PASS. If typecheck complains that `shelves` rows are `any`, that is acceptable here (no generated DB types in this sub-project); do not add a cast unless lint fails.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "$(cat <<'EOF'
feat: gate the home page and list the owner's shelves

index.astro redirects anonymous visitors to /login and server-renders
the signed-in user's shelves, filtered by owner, with a sign-out form.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

---

## Task 10: Supabase auth runbook + integration verification

**Files:**
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: dashboard setup docs and a signed-off manual checklist.

- [ ] **Step 1: Add the runbook to `supabase/README.md`**

Insert a new section immediately before `## Apply to a hosted project`:

```markdown
## Auth setup (hosted project)

The app uses magic-link (email OTP) auth via `@supabase/ssr`. Configure the
linked project once:

1. **Authentication → Providers → Email:** enable email provider and magic
   link; keep "Enable email signups" on (sign-up is open by design).
2. **Authentication → URL Configuration:**
   - **Site URL:** the production URL (e.g. `https://videotheque.vercel.app`).
   - **Redirect URLs:** exact paths only —
     `http://localhost:3000/auth/confirm` and
     `https://<prod-domain>/auth/confirm`. `signInWithOtp` sends
     `emailRedirectTo` from the browser's origin, so this allowlist is what
     stops a link being aimed elsewhere. For Vercel previews add one narrow
     wildcard (`https://videotheque-*-<team>.vercel.app/auth/confirm`), not
     `**`.
3. **Authentication → Email Templates → Magic Link:** set the link to

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

   The default template uses `{{ .ConfirmationURL }}`, which drives the PKCE
   `?code` flow instead and breaks cross-device sign-in.
4. **Local `.env`:** set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
   from **Project Settings → API** (Project URL, and the publishable/anon key).

### Testing magic links locally

With the local stack (`supabase start`), emails are caught by Inbucket at
http://127.0.0.1:54324 — no real delivery. The local API URL and anon key come
from `supabase status`. Against the hosted project, real email is sent to the
address you enter.
```

- [ ] **Step 2: Format and commit the docs**

```bash
npx prettier --write supabase/README.md
git add supabase/README.md
git commit -m "$(cat <<'EOF'
docs: document the Supabase auth dashboard setup

Redirect URL allowlist, the magic-link email template override, and how
to test links locally via Inbucket.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKs6CQEN796cnajnTJ4xA7
EOF
)"
```

- [ ] **Step 3: Run the full CI gate locally**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`
Expected: every step PASS. Fix anything red before continuing.

- [ ] **Step 4: Run the manual auth checklist**

Prereq: a real `.env` (hosted project configured per Step 1) **or** the local
stack running with the email template edited in `supabase/config.toml` /
Studio. Start `npm run dev`.

1. Open `http://localhost:3000/` → redirected to `/login`.
2. Submit your email → the form is replaced by "Check <email> for a sign-in link".
3. Retrieve the email (Inbucket locally, or your inbox) and open the link **in a different browser** than the one that requested it → you land on `/` signed in, showing "Signed in as <email>".
4. `/` lists exactly one shelf — the sign-up seed — linking to `/e/<slug>`.
5. In SQL, insert a second shelf for your user, then reload `/` → both shelves listed, oldest first.
6. In SQL, insert a **public** shelf owned by a *different* user → reload `/` → it does **not** appear; `curl http://localhost:3000/e/<that-slug>` still serves it (status 200).
7. Click **Sign out** → back at `/login`; opening `/` again redirects to `/login`.
8. Open `http://localhost:3000/auth/confirm` with no query string → redirected to `/login?error=link` and the page shows "That link didn’t work — request a new one."
9. While signed in, open `http://localhost:3000/login` → redirected to `/`.

- [ ] **Step 5: Record the checklist result**

Append a short note to the PR description (or a comment) listing which steps
passed and the environment used (hosted vs local). If any step fails, stop and
fix the underlying task before merging.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
| --- | --- |
| Decision 1 — cookie-based SSR sessions | 2, 3, 6 |
| Decision 2 — dependency pinning + lockfile | 1 (Global Constraints) |
| Decision 3 — open sign-up (`shouldCreateUser` default) | 8 (no override passed) |
| Decision 4 — `token_hash` + `verifyOtp` | 5, 7, 10 (template) |
| Decision 5 — middleware populates, `getClaims`, call it first | 4, 6 |
| Decision 6 — `index.astro` lists shelves | 9 |
| `src/lib/supabase.ts` factories + missing-env guard | 3 |
| `src/middleware.ts` | 6 |
| `src/lib/auth-confirm.ts` + open-redirect guard | 5 |
| `src/pages/auth/confirm.ts`, `signout.ts` | 7 |
| `src/pages/login.astro` (form, inbox state, `?error=link`) | 8 |
| `src/pages/index.astro` (guard, `.eq('owner', user.sub)`, signout form) | 9 |
| Env schema + `.env.example` | 1 |
| CSRF on signout via Astro `checkOrigin` | Not disabled in `astro.config.mjs`; no code needed (verified in Task 7 build — POST endpoint only). |
| Redirect-URL allowlist to exact paths | 10 |
| Unit tests mirroring `tmdb-proxy.test.ts` | 2, 4, 5 |
| Manual E2E checklist incl. cross-device | 10 |
| `supabase/README.md` auth section | 10 |

No spec requirement is left without a task.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" — every code step carries full source. The only angle-bracket tokens (`<prod-domain>`, `<team>`, `<slug>`, `<email>`) are runtime values the operator fills in, inside doc/checklist prose, not code.

**Type consistency:**
- `makeCookieAdapter(cookies, requestHeaders, responseHeaders)` — same 3-arg shape in Tasks 2, 3, 6, 7.
- `serverClient(cookies, requestHeaders, responseHeaders)` — consistent in Tasks 3, 6, 7.
- `resolveUser(supabase)` returns `JwtPayload | null` — consumed as `Astro.locals.user` (Task 1 typing) and `user.sub` / `user.email` (Task 9).
- `handleAuthConfirm(ctx)` / `AuthConfirmContext` / `AuthConfirmResult` — defined in Task 5, consumed in Task 7 with the matching `{ params, verifyOtp }` shape.
- Constant names `HOME_PATH`, `LOGIN_PATH`, `CONFIRM_PATH`, `SIGNOUT_PATH`, `LINK_ERROR_QUERY`, `OTP_TYPES`, `DEFAULT_OTP_TYPE` — defined in Task 1, used verbatim in Tasks 5, 7, 8, 9.
- `status: 303` literal used identically in `auth-confirm.ts` and both endpoints.
