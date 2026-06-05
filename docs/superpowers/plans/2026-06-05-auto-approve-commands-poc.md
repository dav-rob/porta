# Auto-Approve Commands PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in proxy-side proof of concept that automatically approves waiting terminal command steps.

**Architecture:** Create a focused `auto-approve.ts` helper in the proxy package. The helper scans fetched steps, de-dupes by conversation/trajectory/step index, and calls the existing `HandleCascadeUserInteraction` permission shape when `PORTA_AUTO_APPROVE_COMMANDS=1`.

**Tech Stack:** TypeScript, Hono proxy routes, Vitest, Antigravity Connect RPC JSON payloads.

---

## File Structure

- Create `packages/proxy/src/auto-approve.ts`: owns env parsing, command-step detection, de-duping, logging, and approval RPC calls.
- Create `packages/proxy/src/__tests__/auto-approve.test.ts`: unit tests for disabled mode, eligible command approval, ignored steps, de-duping, and failure retry behavior.
- Modify `packages/proxy/src/routes/conversations.ts`: call the helper after `GetCascadeTrajectorySteps` route responses assemble `stepsArray`.

### Task 1: Add Failing Tests For Auto-Approve Helper

**Files:**
- Create: `packages/proxy/src/__tests__/auto-approve.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/proxy/src/__tests__/auto-approve.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAutoApprovedCommandsForTests,
  maybeAutoApproveCommands,
} from "../auto-approve.js";

const eligibleStep = {
  status: "CORTEX_STEP_STATUS_WAITING",
  runCommand: {
    proposedCommandLine: "echo porta-auto-approve-poc",
  },
  metadata: {
    sourceTrajectoryStepInfo: {
      trajectoryId: "trajectory-1",
      stepIndex: 7,
    },
  },
};

describe("maybeAutoApproveCommands", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    clearAutoApprovedCommandsForTests();
  });

  it("does not approve commands when the env flag is disabled", async () => {
    const approve = vi.fn();

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).not.toHaveBeenCalled();
  });

  it("approves an eligible waiting command when the env flag is enabled", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).toHaveBeenCalledWith({
      cascadeId: "cascade-1",
      interaction: {
        trajectoryId: "trajectory-1",
        stepIndex: 7,
        permission: {
          allow: true,
        },
      },
    });
  });

  it("ignores waiting steps that are not runCommand approvals", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands(
      "cascade-1",
      [
        {
          status: "CORTEX_STEP_STATUS_WAITING",
          userInput: { items: [{ text: "not a command" }] },
          metadata: {
            sourceTrajectoryStepInfo: {
              trajectoryId: "trajectory-1",
              stepIndex: 8,
            },
          },
        },
      ],
      approve,
    );

    expect(approve).not.toHaveBeenCalled();
  });

  it("does not approve the same command step twice", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);
    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("retries a command step when the previous approval failed", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi
      .fn()
      .mockRejectedValueOnce(new Error("LS unavailable"))
      .mockResolvedValueOnce(undefined);

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);
    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @porta/proxy test -- auto-approve.test.ts
```

Expected: FAIL because `../auto-approve.js` does not exist.

### Task 2: Implement Auto-Approve Helper

**Files:**
- Create: `packages/proxy/src/auto-approve.ts`
- Test: `packages/proxy/src/__tests__/auto-approve.test.ts`

- [ ] **Step 1: Add minimal helper implementation**

Create `packages/proxy/src/auto-approve.ts`:

```ts
type ApproveCommandRequest = {
  cascadeId: string;
  interaction: {
    trajectoryId: string;
    stepIndex: number;
    permission: {
      allow: true;
    };
  };
};

type ApproveCommand = (request: ApproveCommandRequest) => Promise<unknown>;

const approvedCommandKeys = new Set<string>();

export function clearAutoApprovedCommandsForTests(): void {
  approvedCommandKeys.clear();
}

function isAutoApproveCommandsEnabled(): boolean {
  return process.env.PORTA_AUTO_APPROVE_COMMANDS === "1";
}

function valueAtPath(
  value: Record<string, unknown>,
  key: string,
): unknown {
  return value[key];
}

function commandText(runCommand: Record<string, unknown>): string {
  for (const key of ["proposedCommandLine", "commandLine", "command"]) {
    const value = valueAtPath(runCommand, key);
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "(unknown command)";
}

function approvalCandidate(
  cascadeId: string,
  step: unknown,
): { key: string; request: ApproveCommandRequest; command: string } | undefined {
  if (!step || typeof step !== "object") return undefined;
  const record = step as Record<string, unknown>;
  if (record.status !== "CORTEX_STEP_STATUS_WAITING") return undefined;
  if (!record.runCommand || typeof record.runCommand !== "object") return undefined;

  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;
  const sourceInfo = (metadata as Record<string, unknown>).sourceTrajectoryStepInfo;
  if (!sourceInfo || typeof sourceInfo !== "object") return undefined;

  const trajectoryId = (sourceInfo as Record<string, unknown>).trajectoryId;
  const stepIndex = (sourceInfo as Record<string, unknown>).stepIndex;
  if (typeof trajectoryId !== "string" || trajectoryId.length === 0) {
    return undefined;
  }
  if (typeof stepIndex !== "number") return undefined;

  const key = `${cascadeId}:${trajectoryId}:${stepIndex}`;
  return {
    key,
    command: commandText(record.runCommand as Record<string, unknown>),
    request: {
      cascadeId,
      interaction: {
        trajectoryId,
        stepIndex,
        permission: {
          allow: true,
        },
      },
    },
  };
}

export async function maybeAutoApproveCommands(
  cascadeId: string,
  steps: unknown[],
  approve: ApproveCommand,
): Promise<void> {
  if (!isAutoApproveCommandsEnabled()) return;

  for (const step of steps) {
    const candidate = approvalCandidate(cascadeId, step);
    if (!candidate) continue;
    if (approvedCommandKeys.has(candidate.key)) continue;

    try {
      await approve(candidate.request);
      approvedCommandKeys.add(candidate.key);
      console.log(
        `[auto-approve] approved command ${candidate.key}: ${candidate.command}`,
      );
    } catch (err) {
      console.error(
        `[auto-approve] failed command ${candidate.key}: ${String(err)}`,
      );
    }
  }
}
```

- [ ] **Step 2: Run helper tests**

Run:

```bash
pnpm --filter @porta/proxy test -- auto-approve.test.ts
```

Expected: PASS.

### Task 3: Wire Helper Into Conversation Step Fetching

**Files:**
- Modify: `packages/proxy/src/routes/conversations.ts`
- Test: `packages/proxy/src/__tests__/auto-approve.test.ts`

- [ ] **Step 1: Import helper**

In `packages/proxy/src/routes/conversations.ts`, add:

```ts
import { maybeAutoApproveCommands } from "../auto-approve.js";
```

- [ ] **Step 2: Call helper after steps are assembled**

In the `GET /api/conversations/:id/steps` route, after the exact-limit slice and before `return c.json(...)`, call:

```ts
      await maybeAutoApproveCommands(id, stepsArray, (request) =>
        rpcForConversation("HandleCascadeUserInteraction", id, request),
      );
```

- [ ] **Step 3: Run proxy tests**

Run:

```bash
pnpm --filter @porta/proxy test
```

Expected: PASS.

### Task 4: Full Verification

**Files:**
- Build: `packages/proxy/src/auto-approve.ts`
- Build: `packages/proxy/src/routes/conversations.ts`

- [ ] **Step 1: Run TypeScript build**

Run:

```bash
pnpm --filter @porta/proxy build
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run repository tests if proxy verification is clean**

Run:

```bash
pnpm --filter @porta/proxy test
```

Expected: PASS.

- [ ] **Step 3: Inspect working tree**

Run:

```bash
git status --short
git diff --stat
```

Expected: changed files are limited to the plan, helper, tests, and route wiring.
