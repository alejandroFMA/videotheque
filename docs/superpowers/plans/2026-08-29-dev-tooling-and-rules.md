# Dev Tooling + Ways-of-Working Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add written working-practice rules plus the ESLint/Prettier/Husky/CI tooling that enforces the mechanical parts.

**Architecture:** Four independent slices — rule docs, linting+formatting, git hooks, CI+PR-template. No application logic changes; the only `src/**` edits are two new empty modules and whatever `prettier --write` / `eslint --fix` reflow.

**Tech Stack:** ESLint 10 (flat config), typescript-eslint 8, Prettier 3, Husky 9, commitlint 21, lint-staged 17, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-dev-tooling-and-rules-design.md`

## Global Constraints

- Branch for this work: `chore/dev-tooling-and-rules` (already checked out). Conventional-commit subjects; keep the `Co-Authored-By:` / `Claude-Session:` trailers already used in this repo's history.
- Rules live in `.claude/.rules/`; `CLAUDE.md` activates them with `@`-imports under a `## Ways of working` section.
- ESLint: flat config `eslint.config.js` (ESM), **non-type-checked** presets. `no-magic-numbers` = `'warn'` with `{ ignore: [-1, 0, 1], ignoreArrayIndexes: true, ignoreDefaultValues: true, enforceConst: true }`; turned **off** for `test/**` and config files. Warnings must NOT fail the command (`eslint .`, no `--max-warnings`).
- Prettier `.prettierrc` (JSON): `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 100`, `plugins: ["prettier-plugin-astro"]`.
- Shared ignore list (both tools): `dist/`, `.vercel/`, `.astro/`, `node_modules/`, `coverage/` (Prettier also ignores `package-lock.json`).
- Husky 9 hooks are plain scripts (no sourcing boilerplate). `pre-push` order: branch-name check → `npm run lint` → `npm run typecheck` → `npm test`; first failure aborts.
- Branch-name regex (POSIX `sh` + `grep -E`): `^(main|(feat|fix|docs|test|refactor|chore|ci|perf|build|style|revert)/[a-z0-9._-]+)$`.
- commitlint: `extends: ['@commitlint/config-conventional']`; `type-enum` = `feat, fix, docs, test, refactor, chore, ci, perf, build, style, revert`; `subject-case`, `body-max-line-length`, `footer-max-line-length` all disabled (`[0]`).
- CI `.github/workflows/ci.yml`: triggers `push` to `main` and any `pull_request`; one job, `ubuntu-latest`, Node `24`, `npm ci`, then `format:check` → `lint` → `typecheck` → `test` → `build`. Actions pinned to `@v4`.
- `src/types/index.ts` and `src/constants/index.ts` contain exactly `export {};`.
- The `prettier --write .` normalization is its **own** commit (`style: ...`), separate from the config commit.
- Do not change any `src/**` file other than the two new `index.ts` and formatter/`--fix` reflow. Do not touch `dependencies` (only `devDependencies` + `scripts`).
- Version pins: `eslint@^10.9.1`, `@eslint/js@^10.9.1`, `typescript-eslint@^8.68.0`, `eslint-plugin-astro@^3.1.0`, `eslint-config-prettier@^10.1.8`, `prettier@^3.9.6`, `prettier-plugin-astro@^0.14.1`, `husky@^9.1.7`, `@commitlint/cli@^21.2.2`, `@commitlint/config-conventional@^21.2.2`, `lint-staged@^17.4.1`. If `npm install` errors on an ESLint 10 peer-range conflict, fall back to `eslint@^9` + `@eslint/js@^9` and note it. A `typescript-eslint` peer *warning* against `typescript@^7` is acceptable; an install *error* triggers the same fallback thinking.
- `npm test` stays at 29 passing throughout.

---

### Task 1: Rules files + cross-cutting folders + CLAUDE.md wiring

**Files:**
- Create: `.claude/.rules/constants-and-types.md`
- Create: `.claude/.rules/git-workflow.md`
- Create: `.claude/.rules/commit-messages.md`
- Create: `.claude/.rules/comments.md`
- Create: `src/types/index.ts`
- Create: `src/constants/index.ts`
- Modify: `CLAUDE.md` (add `## Ways of working`; add two lines to the `## Structure` tree)

**Interfaces:**
- Consumes: nothing.
- Produces: the `.claude/.rules/*.md` paths that `CLAUDE.md` imports; the `src/types/` and `src/constants/` folders referenced by `constants-and-types.md` and by later application code (not this plan).

No automated test — verified by file existence and `git grep` checks.

- [ ] **Step 1: Create `.claude/.rules/constants-and-types.md`**

```markdown
# Constants and types

- No magic values inline. A literal that carries meaning — a URL, a size, a
  limit, an HTTP status, a key — gets a name. `0`, `1`, `-1`, and array
  indices are exempt.
- Types and constants that belong to one module stay with it, co-located in
  that module's file under `src/lib/`.
- Types and constants shared across modules go in `src/types/` (interfaces,
  type aliases) and `src/constants/` (values). Keep those two folders
  declarations-only — no logic.
```

- [ ] **Step 2: Create `.claude/.rules/git-workflow.md`**

```markdown
# Git workflow

- Branch names are `<type>/<kebab-case-description>`.
- `<type>` is one of: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`,
  `ci`, `perf`, `build`, `style`, `revert`.
- `main` is the only branch without a prefix.
- Examples: `feat/shelf-drag-reorder`, `fix/tmdb-empty-query`, `ci/cache-npm`.
```

- [ ] **Step 3: Create `.claude/.rules/commit-messages.md`**

```markdown
# Commit messages

- Conventional Commits: `type(optional-scope): summary`, `type` from the
  list in `git-workflow.md`.
- Subject: one line, imperative mood ("add", not "added" / "adds"), no
  trailing period, aim for 72 characters or fewer.
- Body: optional, one or two sentences on what changed and why. Not a
  changelog.
- Keep the `Co-Authored-By:` and `Claude-Session:` trailers this repo
  already uses.
```

- [ ] **Step 4: Create `.claude/.rules/comments.md`**

```markdown
# Comments

- Comment only where the code is genuinely ambiguous, or where the *why* is
  not visible in the code itself — a workaround, a non-obvious ordering, a
  spec quirk.
- Explain *why*, never *what*. A comment that restates the code is noise;
  delete it and let the names carry the meaning.
- No commented-out code. Delete it; git remembers.
- JSDoc only on exported API whose signature does not already say what it is
  and how to call it.
```

- [ ] **Step 5: Create `src/types/index.ts` and `src/constants/index.ts`**

Both files, identical content:

```ts
export {};
```

- [ ] **Step 6: Edit `CLAUDE.md` — add the `## Ways of working` section**

Insert this block immediately after the closing ` ``` ` of the `## Structure` code block and its blank line, directly before `## Database`:

```markdown
## Ways of working

@.claude/.rules/constants-and-types.md
@.claude/.rules/git-workflow.md
@.claude/.rules/commit-messages.md
@.claude/.rules/comments.md

```

- [ ] **Step 7: Edit `CLAUDE.md` — extend the Structure tree**

In the `## Structure` code block, replace:

```
  components/          Shelf, Spine, SearchBar, FilmCase
  lib/                 supabase.ts, tmdb.ts, colors.ts
  styles/
```

with:

```
  components/          Shelf, Spine, SearchBar, FilmCase
  lib/                 supabase.ts, tmdb.ts, colors.ts
  types/               cross-cutting interfaces and type aliases
  constants/           cross-cutting constant values
  styles/
```

- [ ] **Step 8: Verify**

Run:
```bash
ls .claude/.rules/*.md
cat src/types/index.ts src/constants/index.ts
grep -n "Ways of working" CLAUDE.md
grep -c "@.claude/.rules/" CLAUDE.md   # expect 4
grep -n "types/\|constants/" CLAUDE.md
```
Expected: four rule files listed; both `index.ts` print `export {};`; the section header and 4 `@`-import lines present; the two tree lines added.

- [ ] **Step 9: Commit**

```bash
git add .claude/.rules CLAUDE.md src/types src/constants
git commit -m "docs: add ways-of-working rules and cross-cutting folders"
```

---

### Task 2: ESLint + Prettier

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (5 scripts, 7 devDependencies)
- Modify: `package-lock.json` (via `npm install`)
- Modify: whatever `prettier --write .` and `eslint . --fix` reflow (formatting only)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: npm scripts `lint`, `lint:fix`, `format`, `format:check`, `typecheck` — consumed by Task 3's `pre-push` hook and Task 4's CI job.

- [ ] **Step 1: Add scripts and devDependencies to `package.json`**

Add to `"scripts"` (keep existing):

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"format": "prettier --write .",
"format:check": "prettier --check .",
"typecheck": "tsc --noEmit"
```

Add to `"devDependencies"` (keep existing, keep alphabetical if the file is):

```json
"@eslint/js": "^10.9.1",
"eslint": "^10.9.1",
"eslint-config-prettier": "^10.1.8",
"eslint-plugin-astro": "^3.1.0",
"prettier": "^3.9.6",
"prettier-plugin-astro": "^0.14.1",
"typescript-eslint": "^8.68.0"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: resolves and writes `package-lock.json`. On an ESLint 10 peer conflict, drop `eslint` and `@eslint/js` to `^9`, re-install, and record the substitution in the report.

- [ ] **Step 3: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', '.vercel/', '.astro/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      'no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          enforceConst: true,
        },
      ],
    },
  },
  {
    files: ['test/**', '**/*.config.{js,ts,mjs}', 'eslint.config.js'],
    rules: { 'no-magic-numbers': 'off' },
  },
  prettier,
);
```

- [ ] **Step 4: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-astro"],
  "overrides": [{ "files": "*.astro", "options": { "parser": "astro" } }]
}
```

- [ ] **Step 5: Create `.prettierignore`**

```
dist/
.vercel/
.astro/
node_modules/
coverage/
package-lock.json
```

- [ ] **Step 6: Commit the config (no reflow yet)**

```bash
git add package.json package-lock.json eslint.config.js .prettierrc .prettierignore
git commit -m "build: add eslint and prettier config and scripts"
```

- [ ] **Step 7: Sanity-check the linter runs**

Run: `npm run lint`
Expected: it executes (exit 0). `no-magic-numbers` **warnings** in `src/lib/tmdb-proxy.ts` (status codes, cache TTLs) are expected and allowed. If there are ESLint **errors**, note each — most will be auto-fixed in the next step; fix any that remain by hand (never by loosening a rule).

- [ ] **Step 8: Apply formatting + safe fixes**

Run:
```bash
npx prettier --write .
npx eslint . --fix
```
Then re-run the gates:
```bash
npm run format:check   # exit 0
npm run lint           # exit 0 (warnings ok)
npm run typecheck      # exit 0
npm test               # 29 passing
```
If `typecheck` or `test` regressed, a `--fix` changed behaviour — revert that specific change (`git checkout -- <file>`) and leave it for a human; do not force it green.

- [ ] **Step 9: Commit the reflow**

```bash
git add -A
git commit -m "style: apply prettier and eslint --fix"
```

---

### Task 3: Husky + commitlint + lint-staged

**Files:**
- Modify: `package.json` (`prepare` script, 4 devDependencies, `"lint-staged"` key)
- Modify: `package-lock.json` (via `npm install`)
- Create: `commitlint.config.js`
- Create: `.husky/commit-msg`
- Create: `.husky/pre-commit`
- Create: `.husky/pre-push`

**Interfaces:**
- Consumes: Task 2's `lint` / `typecheck` scripts (called by `pre-push`), and `eslint` / `prettier` binaries (called by `lint-staged`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add to `package.json`**

Add to `"scripts"`:

```json
"prepare": "husky"
```

Add to `"devDependencies"`:

```json
"@commitlint/cli": "^21.2.2",
"@commitlint/config-conventional": "^21.2.2",
"husky": "^9.1.7",
"lint-staged": "^17.4.1"
```

Add a top-level `"lint-staged"` key:

```json
"lint-staged": {
  "*.{ts,astro,mjs,cjs,js}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

- [ ] **Step 2: Install (runs `prepare` → `husky`)**

Run: `npm install`
Expected: `husky` runs during `prepare`, creates `.husky/` and sets `core.hooksPath=.husky/_`. Confirm: `git config core.hooksPath` prints `.husky/_`.

- [ ] **Step 3: Create `commitlint.config.js`**

```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'test', 'refactor', 'chore', 'ci', 'perf', 'build', 'style', 'revert'],
    ],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
```

- [ ] **Step 4: Create `.husky/commit-msg`**

```sh
npx --no-install commitlint --edit "$1"
```

- [ ] **Step 5: Create `.husky/pre-commit`**

```sh
npx lint-staged
```

- [ ] **Step 6: Create `.husky/pre-push`**

```sh
branch="$(git branch --show-current)"
valid='^(main|(feat|fix|docs|test|refactor|chore|ci|perf|build|style|revert)/[a-z0-9._-]+)$'
if ! printf '%s' "$branch" | grep -Eq "$valid"; then
  printf 'pre-push: branch "%s" must be "main" or "<type>/<kebab-case>"\n' "$branch" >&2
  exit 1
fi

npm run lint || exit 1
npm run typecheck || exit 1
npm test || exit 1
```

- [ ] **Step 7: Make hooks executable**

Run: `chmod +x .husky/commit-msg .husky/pre-commit .husky/pre-push`

- [ ] **Step 8: Verify commitlint**

Run:
```bash
echo 'bad message' | npx --no-install commitlint
echo 'chore: valid conventional subject' | npx --no-install commitlint
```
Expected: first exits non-zero (type / subject errors); second exits 0.

- [ ] **Step 9: Verify the branch-name guard**

Run:
```bash
valid='^(main|(feat|fix|docs|test|refactor|chore|ci|perf|build|style|revert)/[a-z0-9._-]+)$'
printf '%s' "nonsense"                   | grep -Eq "$valid" && echo MATCH || echo "BLOCKED (correct)"
printf '%s' "chore/dev-tooling-and-rules" | grep -Eq "$valid" && echo "MATCH (correct)" || echo BLOCKED
```
Expected: `BLOCKED (correct)` then `MATCH (correct)`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json commitlint.config.js .husky
git commit -m "build: add husky hooks, commitlint and lint-staged"
```
The `commit-msg` hook runs on this commit — the subject above is valid, so it passes. The `pre-commit` hook runs `lint-staged` on the staged files.

---

### Task 4: GitHub Actions CI + PR template

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: Task 2's `format:check` / `lint` / `typecheck` scripts and the existing `test` / `build` scripts.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Create `.github/pull_request_template.md`**

```markdown
## Description
<!-- What this PR does and why -->

## Type of change & what changed
<!-- feat / fix / docs / test / refactor / chore / ci / perf / build / style -->
<!-- Bullet list of the concrete changes -->

## Files affected
<!-- Key files and what changed in each -->

## Testing
<!-- How this was verified: commands run, output, manual checks -->
```

- [ ] **Step 3: Verify the workflow is well-formed**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/on:\s/.test(y)||!/npm run build/.test(y)) throw new Error('bad workflow'); console.log('ok')"`
Expected: `ok`. (The real proof is the workflow running on this branch's PR, checked at handoff.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/pull_request_template.md
git commit -m "ci: run format, lint, typecheck, test and build on push and PR"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| `.claude/.rules/` four files | Task 1 (steps 1–4) |
| `CLAUDE.md` `## Ways of working` with 4 `@`-imports | Task 1 (step 6) |
| `comments.md` ambiguity-only rule | Task 1 (step 4) |
| `src/types/index.ts` + `src/constants/index.ts` = `export {};` | Task 1 (step 5) |
| `CLAUDE.md` Structure mentions the two folders | Task 1 (step 7) |
| ESLint 10 flat config, non-type-checked, config-prettier last | Task 2 (step 3) |
| `no-magic-numbers` warn + ignores + off for test/config | Task 2 (step 3) |
| Warnings don't fail `lint` | Task 2 (steps 3, 7, 8 — `eslint .` with no `--max-warnings`) |
| Prettier config values | Task 2 (step 4) |
| Shared ignore lists | Task 2 (steps 3, 5) |
| Six new scripts | Task 2 (step 1) + Task 3 (step 1, `prepare`) |
| Isolated `style:` formatting commit | Task 2 (steps 6 vs 9) |
| devDependency pins + eslint@^9 fallback | Global Constraints; Task 2 (steps 1–2) |
| Husky 9 thin hooks | Task 3 (steps 4–6) |
| `pre-push` order: branch-check → lint → typecheck → test | Task 3 (step 6) |
| Branch-name regex | Task 3 (steps 6, 9) |
| commitlint config-conventional + type-enum + disabled case/length rules | Task 3 (step 3) |
| `lint-staged` as a `package.json` key | Task 3 (step 1) |
| CI triggers + Node 24 + step order | Task 4 (step 1) |
| PR template four sections | Task 4 (step 2) |
| No `src/**` change beyond the two `index.ts` + reflow | Task 2 (step 8 caveat), Global Constraints |

No gaps.

**2. Placeholder scan** — no `TBD` / `TODO` / "handle edge cases" / "similar to". Every file's full content is inline. Verification steps carry exact commands and expected output.

**3. Type / name consistency** — script names (`lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `prepare`) are identical in Task 2 step 1, Task 3 step 1, Task 3 step 6 (`pre-push`), and Task 4 step 1 (CI). The branch-name regex is byte-identical in Global Constraints, Task 3 step 6, and Task 3 step 9. The commit-type list is identical in `git-workflow.md` (Task 1), `commitlint.config.js` (Task 3 step 3), and the PR template (Task 4 step 2). The ignore list matches between `eslint.config.js` and `.prettierignore` (Prettier additionally ignores `package-lock.json`).
