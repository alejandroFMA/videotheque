# Git workflow

- Branch names are `<type>/<kebab-case-description>`.
- `<type>` is one of: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`,
  `ci`, `perf`, `build`, `style`, `revert`.
- `main` is the only branch without a prefix.
- Examples: `feat/shelf-drag-reorder`, `fix/tmdb-empty-query`, `ci/cache-npm`.

## Integration

- **Every change that touches the repo gets its own new branch and its own
  PR** — features, fixes, CI tweaks, edits to these rule files, one-liners.
  No exceptions for "small".
- `main` moves **only** through a merged PR. Never commit to `main` directly,
  never `git merge` into `main` locally.
- Branch from an up-to-date `main`; open the PR with `--base main`.
- **No git worktrees.** Work in place on the branch. This holds until the
  repo owner explicitly lifts it — including when a tool or workflow asks
  for one (skip that step, use a normal branch).
