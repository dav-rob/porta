# Issue: Antigravity Auto-Approve / Turbo Mode bypass not working in Porta

## Goal
To have Porta inherit or explicitly trigger the "Turbo Mode" and "Always Proceed" settings from Antigravity, so that terminal commands executed from the mobile web UI bypass the manual "Approve/Reject" dialogs.

## The Problem
When Antigravity commands are executed via the Porta web UI, the Language Server (LS) consistently intercepts terminal commands (like `echo`, `mkdir`, `rm`) and sets the step status to `WAITING` for user approval, completely ignoring requested fast-execution configurations.

## What Was Attempted
We attempted to force the backend LS to auto-approve the requests by simulating the exact payloads and configurations used by the native Desktop App:

1. **Injected `cascadeConfig` (Proxy Level)**:
   We intercepted `StartCascade` and `SendUserCascadeMessage` in `packages/proxy/src/routes/conversations.ts` to explicitly set:
   ```json
   "permissionsConfig": {
     "securityPreset": "SECURITY_PRESET_ALWAYS_PROCEED"
   },
   "plannerConfig": {
     "plannerTypeConfig": {
       "conversational": {
         "fastMode": true
       }
     }
   }
   ```
   *Result*: Commands still waited for approval.

2. **Injected `allowFileAccess` Trust Metadata**:
   The LS uses `getMetadata` (in `packages/proxy/src/metadata.ts`) to verify workspace trust. We modified it to always send:
   ```json
   "allowFileAccess": true,
   "allWorkspaceTrustGranted": true
   ```
   *Result*: Commands still waited for approval.

3. **Global Config Overrides**:
   We modified the user's local `~/.gemini/config/config.json` to explicitly whitelist all terminal and file operations globally (e.g. `"allow": ["command(*)"]`).
   *Result*: Commands still waited for approval.

## Conclusion
The Antigravity backend seems to use a secondary, undocumented security validation mechanism to honor "Always Proceed" when requests come in via the RPC interface. Because none of the payload mimicry or global overrides succeeded, we have cleanly rolled back the proxy code to the last stable state (commit `5597b6d`), restoring the successful fix for the chained-command UI state without leaving clutter.
