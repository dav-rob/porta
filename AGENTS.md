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
- The sidebar must merge two sources: known workspaces from `/api/workspaces`
  and conversation summaries from `/api/conversations`. A workspace can exist
  before it has any conversations, so do not build the sidebar solely from
  conversations.
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
- `scripts_davidroberts/runporta.sh` is the repo copy of the personal
  `$HOME/runporta.sh` launcher.
- `scripts_davidroberts/launch_bg_app.zsh` is the `.zshrc` helper for
  `runantigravity`, `runcodex`, and `runporta` aliases.

---

## ⚠️ TEMPORARY: Rollback State (remove once resolved)

The branch was rolled back on 2026-06-05 to a known-safe commit before the
auto-initialise workspace-on-send work was attempted. The work from those 6
commits is preserved and can be recovered.

- **HEAD**: `d08976b` — Safety marker before auto-initialise workspace-on-send
- **Stash**: `wip: workspace-on-send feature (6 commits from backup/pre-rollback)`
  — recoverable any time with `git stash pop` or `git stash apply`
- **Tag**: `backup/pre-rollback` — permanent pointer to the old HEAD (`810499e`)

The stash contains changes across these areas:
- `feat: add workspace project support`
- `fix: auto-register local workspace on send`
- `fix: hide empty recovered workspaces`
- `fix: hide tracked workspaces until used`
- `chore: move utility scripts to scripts util`
- `docs: add agent permissions section`

To inspect without applying: `git stash show -p stash@{0}`
To apply selectively: `git checkout stash@{0} -- <path>`
To view the old commits: `git log backup/pre-rollback`

**Remove this section once the workspace-on-send work has been replanned and
re-implemented (or permanently abandoned).**
