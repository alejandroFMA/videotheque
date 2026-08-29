# Commit messages

- Conventional Commits: `type(optional-scope): summary`, `type` from the
  list in `git-workflow.md`.
- Subject: one line, imperative mood ("add", not "added" / "adds"), no
  trailing period, aim for 72 characters or fewer.
- Body: optional, one or two sentences on what changed and why. Not a
  changelog.
- Keep the `Co-Authored-By:` and `Claude-Session:` trailers this repo
  already uses.
- Pull request titles follow the same rule as the subject: a
  Conventional-Commits line (`type(optional-scope): summary`), not a
  free-form phrase. For a single-commit PR the title is that commit's
  subject verbatim. CI enforces this (the `PR title` workflow).
