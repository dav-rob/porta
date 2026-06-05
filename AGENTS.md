# AGENTS.md

Brief notes for future agents working on Porta.

- Porta is a React web UI plus a local TypeScript proxy for Antigravity.
- This fork is Tailscale/iPhone first: keep the README and personal scripts
  focused on launching Antigravity/Codex over SSH and using Porta as a
  Codex-like mobile UI.
- The proxy talks to Antigravity's private local language server API, not a
  stable public Google SDK. Keep all assumptions isolated in `packages/proxy`.
- Main RPC transport lives in `packages/proxy/src/rpc.ts`; LS discovery lives in
  `packages/proxy/src/discovery.ts`; conversation routing lives in
  `packages/proxy/src/routing.ts`.
- Antigravity project/workspace RPCs currently used by Porta include
  `GetWorkspaceInfos`, `ValidateProject`, `CreateProject`, and
  `AddTrackedWorkspace`. Treat these as inferred private API calls, not a stable
  documented contract.
- Adding an existing local folder is handled by `POST /api/workspaces`, which
  validates an absolute path, sends a `file://` URI to Antigravity, then tracks
  the plain absolute path. Missing local `file://` workspaces are filtered out
  of `GET /api/workspaces` so deleted folders do not poison the UI.
- `POST /api/conversations` may also auto-register an explicitly requested
  local `file://` workspace if no current LS owns it yet, but only when the
  local path exists and is a directory. If registration or rediscovery does not
  produce an owning LS, the route still returns the clear 503 error.
- The sidebar must merge two sources: known workspaces from `/api/workspaces`
  and conversation summaries from `/api/conversations`. A workspace can exist
  before it has any conversations, so do not build the sidebar solely from
  conversations.
- Keep the sidebar clean: workspaces explicitly added through Porta may be
  shown with zero conversations, but tracked/recovered workspaces should only
  appear when they actually have conversations.
- Conversation summaries come primarily from Antigravity RPC
  `GetAllCascadeTrajectories`. Some older or unloaded history may have little
  or no workspace/title metadata until opened or warmed.
- Local Antigravity history has been observed under
  `~/.gemini/antigravity/conversations` as older `.pb` files and newer
  SQLite-style `.db` files with `.db-wal` sidecars. Porta only uses this as a
  fallback in `packages/proxy/src/metadata.ts`: it scans for likely workspace
  `file://` hints and plausible human titles, then maps workspace hints back to
  known workspaces to avoid treating arbitrary file links as projects.
- There is a warm-up path in `packages/proxy/src/routes/conversations.ts` that
  calls `GetCascadeTrajectorySteps` with a large offset for disk-only
  conversations. This appears to encourage Antigravity to load history, but it
  should be treated as a best-effort side effect rather than a guaranteed API.
- Workspace permission mode is UI-controlled and workspace-scoped. `Default`
  leaves command prompts manual; `Full access` auto-approves terminal command
  prompts only. File permission prompts must stay manual.
- Run `pnpm -r test` and `pnpm -r build` before claiming completion.
- `scripts/util/runporta.sh` is the repo copy of the personal
  `$HOME/runporta.sh` launcher.
- `scripts/util/launch_bg_app.zsh` is the `.zshrc` helper for
  `runantigravity`, `runcodex`, and `runporta` aliases.
