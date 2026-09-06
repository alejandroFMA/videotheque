# Commit messages

- Conventional Commits: `type(optional-scope): summary`, `type` from the
  list in `git-workflow.md`.
- Subject: one line, imperative mood ("add", not "added" / "adds"), no
  trailing period, aim for 72 characters or fewer.
- Body: optional, one or two sentences on what changed and why. Not a
  changelog.
- Keep the `Co-Authored-By:` trailer this repo already uses. It credits
  the work without pointing at a transcript.
- Pull request titles follow the same rule as the subject: a
  Conventional-Commits line (`type(optional-scope): summary`), not a
  free-form phrase. For a single-commit PR the title is that commit's
  subject verbatim. CI enforces this (the `PR title` workflow).

## Never publish an assistant session link

**No `Claude-Session:` trailer, and no `https://claude.ai/code/session_...`
URL anywhere in the repository** — not in a commit message, a pull request
title or body, a review comment, a plan or spec, a code comment. Drop the
trailer even when the tooling proposes it; this rule outranks that default.

Why:

- **Privacy.** The link is a handle on a whole working session — file
  contents, absolute paths under a personal home directory, command output,
  environment details, and side conversations that were never meant to ship
  with the code.
- **Security.** It is a durable identifier tied to an account, sitting in a
  public repository. Publishing it invites access attempts and leaks the
  shape of the internal workflow for free.
- **Irreversible.** A pushed commit trailer cannot be unpublished. Forks,
  mirrors, and clones keep it after any edit here.

`Co-Authored-By: Claude ... <noreply@anthropic.com>` is fine and stays: it
is attribution, not a pointer into a transcript. Commits already on `main`
keep their trailers — rewriting published history is a separate, deliberate
decision, not something to do in passing.
