# Videothèque · Dev tooling + ways-of-working rules

Date: 2026-08-29
Status: approved for planning

## Goal

Put a working-practices layer on the repo: written rules for how we write
code and history, plus the tooling that enforces the mechanical parts.

Deliverable: rule files under `.claude/.rules/`, an ESLint + Prettier setup,
Husky git hooks (commit-msg, pre-commit, pre-push), a GitHub Actions CI
workflow, a PR template, and two placeholder folders for cross-cutting
declarations. No application code changes beyond what the formatter and
`eslint --fix` touch automatically.

## Scope

In scope:

- `.claude/.rules/` — five rule files, imported from `CLAUDE.md`.
- ESLint 10 flat config + Prettier, with scripts.
- Husky 9 + commitlint + lint-staged; commit-msg / pre-commit / pre-push hooks.
- `.github/workflows/ci.yml`.
- `.github/pull_request_template.md`.
- `src/types/` and `src/constants/` (empty modules) + a `CLAUDE.md` Structure note.
- A one-time `prettier --write .` normalization of the existing tree, as its
  own commit.

Out of scope (deliberately, YAGNI):

- Type-checked ESLint rules (`recommendedTypeChecked`) — slower; revisit later.
- `astro check` / `@astrojs/check` — `tsc --noEmit` covers today's `.ts`;
  revisit when `.astro` files carry real logic.
- Test coverage collection or thresholds in CI.
- Release automation, changelog, semantic-release, commitizen.
- Dependabot / Renovate.
- GitHub branch-protection rules (repo settings, not files) — noted as a
  manual follow-up.
- Refactoring existing `src/lib/*` magic values (the new rule flags them as
  warnings only; leaving them is allowed).

## Decisions

### 1. Rules live in `.claude/.rules/`, activated by `CLAUDE.md` imports

Claude Code does not auto-load `.claude/.rules/`. `CLAUDE.md` gains a short
`## Ways of working` section that `@`-imports each rule file, which is what
makes them load. The rule files are also readable on their own for humans.

Five files:

| File | Rule |
| --- | --- |
| `constants-and-types.md` | No magic values inline — a literal that carries meaning gets a name. Module-local types/constants stay beside their module in `src/lib/`. Cross-cutting ones go in `src/types/` (interfaces, type aliases) and `src/constants/` (values). |
| `git-workflow.md` | Branches are `<type>/<kebab-description>` where `<type>` ∈ feat, fix, docs, test, refactor, chore, ci, perf, build, style, revert. `main` is the only unprefixed branch. |
| `commit-messages.md` | Conventional Commits: `type(optional-scope): summary`. Subject one line, imperative, ≤ ~72 chars. Optional body of 1–2 sentences summarising what and why. Keep the existing `Co-Authored-By:` / `Claude-Session:` trailers. PR titles follow the same rule (a single-commit PR's title is that commit's subject verbatim). |
| `comments.md` | Comment only where the code is genuinely ambiguous or the *why* is not obvious from the code. Explain *why*, never *what*. No comments that restate the code; no commented-out code. JSDoc only on exported API whose signature does not speak for itself. |
| `model-selection.md` | Pick the lightest model that fits: planning / orchestration / architecture / whole-branch review → heavy (Opus); multi-file features, integration, debugging, non-trivial diff review → Sonnet; transcription from a complete spec, single-file edits, config tweaks, running commands → Haiku. When between tiers, start lighter and escalate on a stall. |

### 2. ESLint 10 flat config, non-type-checked, Prettier for formatting

- `eslint.config.js` (ESM). Layers: `@eslint/js` recommended →
  `typescript-eslint` recommended (not the type-checked variant) →
  `eslint-plugin-astro` recommended for `*.astro` → `eslint-config-prettier`
  last, to switch off stylistic rules.
- `no-magic-numbers`: `'warn'`, `{ ignore: [-1, 0, 1], ignoreArrayIndexes:
  true, ignoreDefaultValues: true, enforceConst: true }`. Disabled entirely
  for `test/**` and config files.
- Warnings do not fail the command. `lint` runs `eslint .` with no
  `--max-warnings`. (Raising to `--max-warnings 0` is a later toggle.)
- Prettier config is `.prettierrc` (JSON): single quotes, semicolons,
  `trailingComma: all`, `printWidth: 100`, `plugins: ["prettier-plugin-astro"]`.
- Ignore across both: `dist/`, `.vercel/`, `.astro/`, `node_modules/`,
  `coverage/`, `package-lock.json`.

### 3. Husky 9, hooks kept thin

Husky 9 hooks are plain scripts (no sourcing boilerplate).

- `.husky/commit-msg` → `npx --no-install commitlint --edit "$1"`
- `.husky/pre-commit` → `npx lint-staged`
- `.husky/pre-push` → branch-name regex check, then `npm run lint`, then
  `npm run typecheck`, then `npm test`. First failure aborts the push.

Branch-name check (POSIX `sh` + `grep -E`):

```
^(main|(feat|fix|docs|test|refactor|chore|ci|perf|build|style|revert)/[a-z0-9._-]+)$
```

against `git branch --show-current`; non-match prints the expected shape to
stderr and exits 1.

`lint-staged` config lives as a `"lint-staged"` key in `package.json` (no
extra root file). It runs `eslint --fix` + `prettier --write` on staged
`*.{ts,astro,mjs,cjs,js}`, and `prettier --write` on staged
`*.{json,md,yml,yaml}`.

`commitlint.config.js` extends `@commitlint/config-conventional`, overrides
`type-enum` to the list in decision 1, and disables `subject-case`,
`body-max-line-length`, and `footer-max-line-length` (the trailers and any
pasted URL must not fail the hook; the "short summary" rule is a written
convention, not a linted one).

### 4. CI is one job, mirrors the pre-push gate plus build

`.github/workflows/ci.yml`, triggers: `push` to `main` and any
`pull_request`. One job on `ubuntu-latest`, Node 24, `npm ci`, then
`format:check` → `lint` → `typecheck` → `test` → `build`, in that order.
`actions/setup-node` with `cache: npm`. Action majors pinned
(`checkout@v4`, `setup-node@v4`).

### 5. Placeholder folders are real empty modules

`src/types/index.ts` and `src/constants/index.ts` each contain only
`export {};`. They exist so the convention has a home and imports resolve
later; their purpose is documented in `constants-and-types.md` and the
`CLAUDE.md` Structure list, not in a file comment.

### 6. One isolated formatting commit

`prettier --write .` is run once against the current tree and committed on
its own as `style: apply prettier formatting`, so no logic commit is mixed
with reflow noise. `eslint --fix` output (if any) rides in the same commit.

## File structure

```
.claude/.rules/
  constants-and-types.md
  git-workflow.md
  commit-messages.md
  comments.md
  model-selection.md
.github/
  workflows/ci.yml
  pull_request_template.md
.husky/
  commit-msg
  pre-commit
  pre-push
eslint.config.js
commitlint.config.js
.prettierrc
.prettierignore
src/types/index.ts
src/constants/index.ts
```

(`lint-staged` is configured via a `"lint-staged"` key in `package.json`.)

`package.json` gains scripts `lint`, `lint:fix`, `format`, `format:check`,
`typecheck`, `prepare` (`husky`), and devDependencies: `eslint@^10`,
`typescript-eslint@^8`, `@eslint/js@^10`, `eslint-plugin-astro@^3`,
`eslint-config-prettier@^10`, `prettier@^3`, `prettier-plugin-astro@^0.14`,
`husky@^9`, `@commitlint/cli@^21`, `@commitlint/config-conventional@^21`,
`lint-staged@^17`. `CLAUDE.md` gains the `## Ways of working` section and a
`src/types` / `src/constants` line in `## Structure`.

If an install fails on an ESLint 10 peer-range conflict from any plugin,
fall back to `eslint@^9` (+ `@eslint/js@^9`) and note it. `typescript-eslint`
may print a peer warning against `typescript@^7`; a warning is fine, an
install error triggers the same fallback pattern.

## PR template

`.github/pull_request_template.md`:

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

## Testing

Tooling is verified by running it, not by unit tests.

- `npm run lint` exits 0 (warnings from `no-magic-numbers` in `src/lib/*`
  are expected and allowed).
- `npm run format:check` exits 0 after the decision-6 normalization commit.
- `npm run typecheck` exits 0.
- `npm test` — 29 passing, unchanged.
- `npm run build` — completes.
- commit-msg hook: a commit with `bad message` is rejected; `chore: valid
  conventional subject` is accepted.
- pre-push hook: on a branch named `nonsense`, `git push` is blocked by the
  branch-name check; on `chore/dev-tooling-and-rules` it proceeds to
  lint/typecheck/test.
- pre-commit hook: staging a badly-formatted file and committing leaves it
  formatted.
- CI: the pull request that introduces this change runs the workflow to
  green.

## Acceptance criteria

- `.claude/.rules/` holds the five files; `CLAUDE.md` `@`-imports all five
  under `## Ways of working`.
- `comments.md` states the ambiguity-only commenting rule.
- `model-selection.md` states the Opus / Sonnet / Haiku tiering by task kind.
- ESLint + Prettier installed and configured; the six new scripts run and
  pass on the current tree.
- Husky installed; the three hooks exist and behave as in Testing.
- `.github/workflows/ci.yml` runs `format:check`, `lint`, `typecheck`,
  `test`, `build` on push-to-main and PRs.
- `.github/pull_request_template.md` has the four sections above.
- `src/types/index.ts` and `src/constants/index.ts` exist; `CLAUDE.md`
  Structure mentions them.
- The formatting normalization is a single separate commit.
- No `src/**` file other than the two new `index.ts` and formatter-only
  reflow is changed.
