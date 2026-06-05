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
- Workspace permission mode is UI-controlled and workspace-scoped. `Default`
  leaves command prompts manual; `Full access` auto-approves terminal command
  prompts only. File permission prompts must stay manual.
- Run `pnpm -r test` and `pnpm -r build` before claiming completion.
- `scripts_davidroberts/runporta.sh` is the repo copy of the personal
  `$HOME/runporta.sh` launcher.
- `scripts_davidroberts/launch_bg_app.zsh` is the `.zshrc` helper for
  `runantigravity`, `runcodex`, and `runporta` aliases.
