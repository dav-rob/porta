# Workspace Permission Mode Design

## Goal

Turn the command auto-approval proof of concept into a user-controlled workspace setting in the Porta web UI.

The first product cut should let the user choose between default Antigravity command approval behavior and command auto-approval for a trusted workspace. The setting must be controlled through the UI, not by editing `.env`.

## Product Model

Permission mode is scoped to a workspace/project, not globally and not per message.

This matches the way Porta already presents workspaces through `projectSlug` routes and approximates Codex's project-level permission control. A trusted workspace can use full command access while another workspace keeps default approval prompts.

## Modes

The first cut supports two modes:

- `default`: Porta does not auto-approve command prompts. Antigravity approval cards remain visible and the user approves or rejects manually.
- `full`: Porta auto-approves terminal command prompts for conversations in the selected workspace.

The label `full` is intentionally user-facing as "Full access" because it matches the Codex mental model. The implementation scope is narrower: command prompts only. File permission prompts remain manual.

Future modes such as "Custom" or file-driven policy can be added later after there is a real persisted policy source to honor.

## UI

Add a compact permission selector to the chat composer near the model and planner selectors.

Behavior:

- Show the current workspace permission mode.
- Use a shield-style icon and concise label:
  - `Default`
  - `Full access`
- Open a small dropdown with two options:
  - `Default permissions`: "Ask before running commands"
  - `Full access`: "Auto-approve terminal commands"
- Selecting an option saves the mode for the current workspace.

Also add the same workspace permission setting to the Settings page for discoverability and intentional configuration.

The composer control is the primary fast switch. The Settings page is the explicit configuration surface.

## Persistence

Store the permission mode in the existing client settings localStorage key.

The settings object should gain a workspace-scoped map keyed by workspace identity:

```ts
workspacePermissionModes: Record<string, "default" | "full">
```

The key should be stable and workspace-specific. Prefer `currentWorkspaceUri` when available because it is a real workspace identity. Fall back to `projectSlug` only if no URI is available.

When there is no saved mode for a workspace, default to `default`.

## Backend Contract

The proxy must not rely on `PORTA_AUTO_APPROVE_COMMANDS` for the normal UI-controlled path.

The web client should send the active permission mode with requests that can expose or stream waiting command steps:

- REST step fetches.
- WebSocket step streaming.

The backend should auto-approve command prompts only when the effective permission mode is `full`.

For backwards compatibility and local testing, the existing env flag may remain as a development override, but UI-provided workspace mode is the intended product path.

## Data Flow

1. The user opens a workspace.
2. The client resolves the workspace key from `currentWorkspaceUri` or `projectSlug`.
3. The composer and Settings page read that workspace's permission mode from localStorage.
4. The user selects `Default` or `Full access`.
5. The setting is saved locally and reflected in both UI surfaces.
6. Step fetches and websocket streams include the active permission mode.
7. The proxy scans waiting `runCommand` steps.
8. If mode is `full`, the proxy sends `HandleCascadeUserInteraction` with `permission.allow = true`.
9. If mode is `default`, the proxy does nothing and the existing approval UI remains visible.

## Error Handling

Auto-approval failures must not break step fetching or websocket streaming.

If the proxy fails to auto-approve a command:

- Log the failure with the conversation id and de-dupe key.
- Continue returning or streaming steps.
- Leave the approval card visible so the user can approve manually.

## Safety

The first cut is intentionally limited:

- Only terminal command prompts are auto-approved.
- File permission prompts remain manual.
- The setting is workspace-scoped.
- The default mode is `default`.
- The UI label and descriptions must avoid implying that file access prompts are auto-approved.

Because `full` mode can execute terminal commands without manual approval, the UI should make the elevated-risk mode visually distinct from default mode.

## Testing

Unit tests should cover:

- Client settings default to `default` for workspaces without a saved mode.
- Changing permission mode for one workspace does not affect another workspace.
- Composer selector calls the settings update path.
- Settings page selector calls the settings update path.
- REST step fetch sends the active permission mode.
- WebSocket URL or handshake sends the active permission mode.
- Proxy auto-approval runs only for `full`.
- Proxy auto-approval does not run for `default`.
- Existing env override behavior remains covered if it is retained.

Manual verification:

1. Open workspace A and set permission mode to `Default`.
2. Ask Antigravity through Porta to run `echo default-mode`.
3. Confirm an approval card appears.
4. Switch workspace A to `Full access`.
5. Ask it to run `echo full-access-mode`.
6. Confirm the command proceeds without tapping Approve.
7. Open workspace B and confirm it still defaults to `Default`.
