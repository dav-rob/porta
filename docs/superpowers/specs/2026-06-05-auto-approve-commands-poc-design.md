# Auto-Approve Commands PoC Design

## Goal

Prove that Porta can make Antigravity proceed through terminal command permission prompts without manual user approval.

This proof of concept does not need to prove that Antigravity's native "Turbo Mode" or "Always Proceed" setting is being inherited. It only needs to show that Porta can produce the equivalent command approval outcome through the RPC interface.

## Scope

The PoC covers terminal command approval prompts only.

Included:

- Waiting `runCommand` steps.
- Automatic approval through the existing `HandleCascadeUserInteraction` RPC shape.
- An explicit opt-in environment flag.
- In-memory de-duping so repeated polling does not repeatedly approve the same step.
- Clear proxy logs for each auto-approved command.

Excluded:

- File permission prompts.
- UI settings or toggles.
- Persistent policy storage.
- Native Antigravity config inheritance.
- Attempts to inject `cascadeConfig`, workspace trust metadata, or global Gemini config values.

## Architecture

Add a small proxy-side auto-approval helper. The helper receives a conversation id and a batch of fetched steps, finds waiting command steps, and approves each unseen command step.

The feature is disabled by default. It is enabled only when:

```bash
PORTA_AUTO_APPROVE_COMMANDS=1
```

The proxy already exposes manual command approval through `POST /api/conversations/:id/command-action`, which calls:

```json
{
  "cascadeId": "<conversation id>",
  "interaction": {
    "trajectoryId": "<trajectory id>",
    "stepIndex": 123,
    "permission": {
      "allow": true
    }
  }
}
```

The PoC reuses that same RPC shape internally. It does not depend on the browser being open and does not add frontend behavior.

## Detection

A step is eligible for auto-approval when all of these are true:

- `step.status === "CORTEX_STEP_STATUS_WAITING"`
- `step.runCommand` exists
- `step.metadata.sourceTrajectoryStepInfo.trajectoryId` is a non-empty string
- `step.metadata.sourceTrajectoryStepInfo.stepIndex` is a number

The helper may log the command text from `runCommand.proposedCommandLine`, `runCommand.commandLine`, or `runCommand.command`, whichever is available first.

## De-Duping

The proxy tracks approved command keys in memory:

```text
<conversation id>:<trajectory id>:<step index>
```

If a key has already been approved, the helper skips it. This prevents polling and websocket refreshes from spamming the language server with duplicate approvals.

This state is intentionally not persisted. A proxy restart may approve an already-waiting command again, which is acceptable for the PoC.

## Data Flow

1. The web UI or websocket polling fetches conversation steps.
2. The proxy returns the steps as usual.
3. If `PORTA_AUTO_APPROVE_COMMANDS=1`, the proxy also scans those steps for waiting command approvals.
4. For each unseen waiting command, the proxy calls `HandleCascadeUserInteraction` with `permission.allow = true`.
5. The proxy emits the existing conversation activation signal so websocket polling wakes up and observes the command progressing.

The approval can happen after the response that first exposes the waiting step. That is acceptable for the PoC: the next poll or websocket refresh should show that the command proceeded.

## Error Handling

Auto-approval failures should not break normal step fetching.

If an approval call fails:

- Log the error with the conversation id and step key.
- Do not throw from the step-fetch route.
- Leave the step visible so the user can still approve manually.

The implementation should mark a step as de-duped only after a successful approval. A failed approval can be retried by the next scan.

## Testing

Unit tests should cover:

- Disabled mode does not call approval RPC.
- Enabled mode approves one eligible waiting command.
- Non-command waiting steps are ignored.
- Already-approved command keys are skipped.
- Approval failures do not throw from the scanner.

Manual verification:

1. Start Antigravity and Porta with `PORTA_AUTO_APPROVE_COMMANDS=1`.
2. From the Porta web UI, ask Antigravity to run a harmless command such as `echo porta-auto-approve-poc`.
3. Confirm the command proceeds without tapping Approve in the Porta UI.
4. Confirm the proxy logs include an auto-approval line.

## Safety

This PoC is intentionally unsafe and should be treated as local-only test behavior.

The flag name is explicit, the feature is disabled by default, and the implementation should not auto-approve file permission prompts. Any later product feature needs a separate design for trust boundaries, UI controls, workspace scoping, audit logging, and persistence.
