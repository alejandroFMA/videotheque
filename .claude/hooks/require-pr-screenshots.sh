#!/usr/bin/env bash
# PreToolUse hook (Bash): a pull request whose diff is purely frontend must
# carry at least one screenshot in its body. Exit 2 blocks the call and hands
# the message on stderr back to the agent.
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# Only `gh pr create` and `gh pr edit` carry a body worth checking.
grep -qE '\bgh[[:space:]]+pr[[:space:]]+(create|edit)\b' <<<"$cmd" || exit 0

# `gh pr edit` without a new body leaves the existing one alone.
if grep -qE '\bgh[[:space:]]+pr[[:space:]]+edit\b' <<<"$cmd" &&
  ! grep -qE '(--body|--body-file|-b|-F)([[:space:]=]|$)' <<<"$cmd"; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || true)
[[ -n "$base" ]] || exit 0

frontend=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  case "$file" in
    # Neutral: ride along with any change without making it backend.
    docs/* | *.md | src/constants/*) ;;
    src/pages/api/* | src/pages/auth/*) exit 0 ;;
    src/components/* | src/styles/* | src/layouts/* | public/* | src/pages/*.astro | src/pages/*/*.astro)
      frontend=1 ;;
    *) exit 0 ;;
  esac
done < <(git diff --name-only "$base"...HEAD; git diff --name-only HEAD)

[[ "$frontend" -eq 1 ]] || exit 0

body="$cmd"
body_file=$(grep -oE '(--body-file|-F)[[:space:]=]+[^[:space:]]+' <<<"$cmd" | head -n1 | sed -E 's/^(--body-file|-F)[[:space:]=]+//; s/^["'\'']//; s/["'\'']$//' || true)
if [[ -n "$body_file" && "$body_file" != "-" && -f "$body_file" ]]; then
  body+=$(cat "$body_file")
fi

if grep -qE '!\[[^]]*\]\([^)]+\)|<img[[:space:]]' <<<"$body"; then
  exit 0
fi

branch=$(git rev-parse --abbrev-ref HEAD)
cat >&2 <<EOF
Blocked: this branch only touches frontend files, so the PR body must show the
result with at least one screenshot.

1. Run the app and capture the affected views (Playwright MCP,
   browser_take_screenshot), desktop and phone width if layout changed.
2. Save them under docs/screenshots/${branch}/ and commit + push them on this
   branch.
3. Reference each one in the body as
   ![description](https://github.com/alejandroFMA/videotheque/raw/${branch}/docs/screenshots/${branch}/<file>.png)
4. Retry the gh command.
EOF
exit 2
