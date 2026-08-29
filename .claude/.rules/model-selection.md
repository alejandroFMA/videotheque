# Model selection

Pick the lightest model that fits the work:

- **Planning and orchestration** — writing specs and implementation plans,
  architecture and design decisions, coordinating multi-step work, and
  whole-branch or otherwise high-stakes review — use a heavy model (Opus).
- **Medium tasks** — multi-file features, integration work, debugging, and
  reviewing a non-trivial diff — use Sonnet.
- **Purely mechanical work** — transcribing code from a complete spec,
  single-file edits, config tweaks, and running commands to report their
  output — use Haiku.

When unsure between two tiers, start with the lighter one and escalate only
if it stalls.
