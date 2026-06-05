# Workspace Permission Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a workspace-scoped UI permission mode that switches command prompts between manual approval and auto-approval.

**Architecture:** Store permission mode per workspace in existing client localStorage settings, pass the active mode through REST step fetches and WebSocket URLs, and make the proxy auto-approve command prompts only when effective mode is `full`. Keep the existing env flag only as a fallback for callers that send no explicit mode, so UI `default` can disable auto-approval even when old dev flags exist.

**Tech Stack:** TypeScript, React, Hono proxy routes, WebSocket query params, Vitest, React Testing Library.

---

## File Structure

- Modify `packages/web/src/types/index.ts`: add `PermissionMode` and workspace permission settings.
- Modify `packages/web/src/hooks/useClientSettings.ts`: add workspace key helpers and mode getter/setter.
- Modify `packages/web/src/api/client.ts`: send `permissionMode` on step fetches.
- Modify `packages/web/src/hooks/useStepsStream.ts`: include `permissionMode` in initial fetches, refresh fetches, and WebSocket URL.
- Modify `packages/web/src/components/ChatInput.tsx`: add composer permission selector.
- Modify `packages/web/src/components/SettingsPanel.tsx`: add workspace permission row.
- Modify `packages/web/src/App.tsx`: resolve workspace key/mode and wire settings into chat input/settings panel/streaming.
- Modify `packages/web/src/styles/input.css` and `packages/web/src/styles/settings.css`: style the permission selector using existing dropdown/select patterns.
- Modify `packages/proxy/src/auto-approve.ts`: accept explicit permission mode.
- Modify `packages/proxy/src/routes/conversations.ts`: read mode from REST query.
- Modify `packages/proxy/src/ws.ts`: read mode from WebSocket query and pass it through polling.
- Update tests in `packages/web/src/__tests__` and `packages/proxy/src/__tests__`.

### Task 1: Add Workspace Permission Setting Helpers

**Files:**
- Modify: `packages/web/src/types/index.ts`
- Modify: `packages/web/src/hooks/useClientSettings.ts`
- Test: `packages/web/src/__tests__/useClientSettings.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/web/src/__tests__/useClientSettings.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  permissionModeForWorkspace,
  useClientSettings,
  workspacePermissionPatch,
} from "../hooks/useClientSettings";

describe("workspace permission settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults unsaved workspaces to default permission mode", () => {
    expect(
      permissionModeForWorkspace(
        {
          defaultModel: null,
          defaultPlannerType: "conversational",
          workspacePermissionModes: {},
        },
        "file:///repo/a",
      ),
    ).toBe("default");
  });

  it("updates one workspace without changing another workspace", () => {
    const patch = workspacePermissionPatch(
      {
        defaultModel: null,
        defaultPlannerType: "conversational",
        workspacePermissionModes: {
          "file:///repo/b": "default",
        },
      },
      "file:///repo/a",
      "full",
    );

    expect(patch.workspacePermissionModes).toEqual({
      "file:///repo/a": "full",
      "file:///repo/b": "default",
    });
  });

  it("persists workspace permission mode through useClientSettings", () => {
    const { result, rerender } = renderHook(() => useClientSettings());

    act(() => {
      result.current.updateSettings(
        workspacePermissionPatch(
          result.current.settings,
          "file:///repo/a",
          "full",
        ),
      );
    });

    rerender();

    expect(
      permissionModeForWorkspace(result.current.settings, "file:///repo/a"),
    ).toBe("full");
    expect(
      permissionModeForWorkspace(result.current.settings, "file:///repo/b"),
    ).toBe("default");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @porta/web test -- useClientSettings.test.tsx
```

Expected: FAIL because `permissionModeForWorkspace`, `workspacePermissionPatch`, and `workspacePermissionModes` are not defined.

- [ ] **Step 3: Implement types and helpers**

Update `packages/web/src/types/index.ts`:

```ts
export type PermissionMode = "default" | "full";

export interface ClientSettings {
  /** Model ID used when the user hasn't explicitly picked one per-message. */
  defaultModel: string | null;
  /** Planner type used when the user hasn't explicitly picked one per-message. */
  defaultPlannerType: "conversational" | "planning";
  /** Workspace/project scoped command permission mode. */
  workspacePermissionModes: Record<string, PermissionMode>;
}
```

Update `packages/web/src/hooks/useClientSettings.ts`:

```ts
const DEFAULT_SETTINGS: ClientSettings = {
  defaultModel: DEFAULT_MODEL,
  defaultPlannerType: "conversational",
  workspacePermissionModes: {},
};

export function permissionModeForWorkspace(
  settings: ClientSettings,
  workspaceKey: string | null | undefined,
): import("../types").PermissionMode {
  if (!workspaceKey) return "default";
  return settings.workspacePermissionModes[workspaceKey] ?? "default";
}

export function workspacePermissionPatch(
  settings: ClientSettings,
  workspaceKey: string,
  mode: import("../types").PermissionMode,
): Pick<ClientSettings, "workspacePermissionModes"> {
  return {
    workspacePermissionModes: {
      ...settings.workspacePermissionModes,
      [workspaceKey]: mode,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @porta/web test -- useClientSettings.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/types/index.ts packages/web/src/hooks/useClientSettings.ts packages/web/src/__tests__/useClientSettings.test.tsx
git commit -m "feat(web): store workspace permission modes"
```

### Task 2: Pass Permission Mode Through API And WebSocket

**Files:**
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/hooks/useStepsStream.ts`
- Test: `packages/web/src/__tests__/api-client.test.ts`
- Test: `packages/web/src/__tests__/useStepsStream.test.tsx`

- [ ] **Step 1: Write failing API client test**

In `packages/web/src/__tests__/api-client.test.ts`, add:

```ts
it("sends permission mode on step fetches", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ steps: [], offset: 0 }),
    }),
  );

  await api.getSteps("cascade-1", 0, undefined, 20, "full");

  expect(fetch).toHaveBeenCalledWith(
    "/api/conversations/cascade-1/steps?offset=0&tail=20&permissionMode=full",
    expect.any(Object),
  );
});
```

- [ ] **Step 2: Write failing WebSocket test**

In `packages/web/src/__tests__/useStepsStream.test.tsx`, update the existing hook render:

```tsx
renderHook(() => useStepsStream("cascade-1", 0, undefined, false, "full"));
```

Add these assertions after the first WebSocket is created:

```tsx
expect(MockWebSocket.instances[0].url).toContain("permissionMode=full");
expect(getSteps).toHaveBeenCalledWith(
  "cascade-1",
  expect.any(Number),
  expect.anything(),
  expect.anything(),
  "full",
);
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter @porta/web test -- api-client.test.ts useStepsStream.test.tsx
```

Expected: FAIL because `getSteps` and `useStepsStream` do not accept or send permission mode.

- [ ] **Step 4: Implement API and WebSocket plumbing**

Update `packages/web/src/api/client.ts`:

```ts
  getSteps: (
    cascadeId: string,
    offset = 0,
    limit?: number,
    tail?: number,
    permissionMode?: import("../types").PermissionMode,
  ) => {
    const params = new URLSearchParams({ offset: String(offset) });
    if (limit !== undefined) params.set("limit", String(limit));
    if (tail !== undefined) params.set("tail", String(tail));
    if (permissionMode) params.set("permissionMode", permissionMode);
    return request<import("../types").StepsPageResponse>(
      `/api/conversations/${cascadeId}/steps?${params}`,
    );
  },
```

Update the existing positional signature in `packages/web/src/hooks/useStepsStream.ts`:

```ts
export function useStepsStream(
  cascadeId: string,
  totalStepCount?: number,
  onIdleTransition?: () => void,
  isConversationRunning = false,
  permissionMode?: import("../types").PermissionMode,
): UseStepsStreamResult {
```

Pass `permissionMode` to every `api.getSteps(...)` call in the hook.

When building the WebSocket URL, append the query parameter:

```ts
const params = new URLSearchParams();
if (permissionMode) params.set("permissionMode", permissionMode);
const suffix = params.toString() ? `?${params}` : "";
url = `${wsBase}/api/conversations/${cascadeId}/ws${suffix}`;
```

Use the same suffix in the non-`VITE_API_BASE` branch.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter @porta/web test -- api-client.test.ts useStepsStream.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/hooks/useStepsStream.ts packages/web/src/__tests__/api-client.test.ts packages/web/src/__tests__/useStepsStream.test.tsx
git commit -m "feat(web): send permission mode with step streams"
```

### Task 3: Gate Proxy Auto-Approval By Explicit Mode

**Files:**
- Modify: `packages/proxy/src/auto-approve.ts`
- Modify: `packages/proxy/src/routes/conversations.ts`
- Modify: `packages/proxy/src/ws.ts`
- Test: `packages/proxy/src/__tests__/auto-approve.test.ts`
- Test: `packages/proxy/src/__tests__/ws.test.ts`

- [ ] **Step 1: Write failing proxy tests**

In `packages/proxy/src/__tests__/auto-approve.test.ts`, add:

```ts
it("does not use env override when explicit default mode is provided", async () => {
  vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
  const approve = vi.fn().mockResolvedValue(undefined);

  await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve, "default");

  expect(approve).not.toHaveBeenCalled();
});

it("approves when explicit full mode is provided without env flag", async () => {
  const approve = vi.fn().mockResolvedValue(undefined);

  await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve, "full");

  expect(approve).toHaveBeenCalledTimes(1);
});
```

In `packages/proxy/src/__tests__/ws.test.ts`, add assertions to `validateWebSocketUpgrade`:

```ts
expect(
  validateWebSocketUpgrade(
    "/api/conversations/abc123/ws?permissionMode=full",
    "http://localhost:5173",
    3100,
  ),
).toEqual({ ok: true, cascadeId: "abc123", permissionMode: "full" });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @porta/proxy test -- auto-approve.test.ts ws.test.ts
```

Expected: FAIL because explicit permission mode is not supported yet.

- [ ] **Step 3: Implement explicit permission mode**

Update `packages/proxy/src/auto-approve.ts`:

```ts
export type PermissionMode = "default" | "full";

function shouldAutoApproveCommands(mode?: PermissionMode): boolean {
  if (mode) return mode === "full";
  return process.env.PORTA_AUTO_APPROVE_COMMANDS === "1";
}

export function isAutoApproveCommandsEnabled(): boolean {
  return shouldAutoApproveCommands();
}
```

Update `maybeAutoApproveCommands` signature:

```ts
export async function maybeAutoApproveCommands(
  cascadeId: string,
  steps: unknown[],
  approve: ApproveCommand,
  permissionMode?: PermissionMode,
): Promise<void> {
  if (!shouldAutoApproveCommands(permissionMode)) return;
  // existing scan
}
```

In `packages/proxy/src/routes/conversations.ts`, parse query mode:

```ts
const permissionMode =
  c.req.query("permissionMode") === "full" ? "full" : "default";
```

Pass it into `maybeAutoApproveCommands(...)`.

In `packages/proxy/src/ws.ts`, update validation result:

```ts
type UpgradeValidationResult =
  | {
      ok: true;
      cascadeId: string;
      permissionMode: import("./auto-approve.js").PermissionMode;
    }
  | { ok: false; code: "not_found" | "forbidden_origin" };
```

Parse mode from URL:

```ts
const permissionMode =
  url.searchParams.get("permissionMode") === "full" ? "full" : "default";
return { ok: true, cascadeId: match[1], permissionMode };
```

Pass `upgrade.permissionMode` into the WebSocket connection emit and thread it through `prepareFetchedStepsForPush`.

- [ ] **Step 4: Run proxy tests**

Run:

```bash
pnpm --filter @porta/proxy test -- auto-approve.test.ts ws.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/proxy/src/auto-approve.ts packages/proxy/src/routes/conversations.ts packages/proxy/src/ws.ts packages/proxy/src/__tests__/auto-approve.test.ts packages/proxy/src/__tests__/ws.test.ts
git commit -m "feat(proxy): gate command approval by permission mode"
```

### Task 4: Add Permission Selector UI

**Files:**
- Modify: `packages/web/src/components/ChatInput.tsx`
- Modify: `packages/web/src/components/SettingsPanel.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/styles/input.css`
- Modify: `packages/web/src/styles/settings.css`
- Test: `packages/web/src/__tests__/ChatInput.test.tsx`

- [ ] **Step 1: Write failing ChatInput test**

In `packages/web/src/__tests__/ChatInput.test.tsx`, add:

```tsx
it("shows and updates the permission mode selector", async () => {
  const onPermissionModeChange = vi.fn();
  render(
    <ChatInput
      onSend={vi.fn()}
      onStop={vi.fn()}
      isRunning={false}
      draft=""
      onDraftChange={vi.fn()}
      permissionMode="default"
      onPermissionModeChange={onPermissionModeChange}
    />,
  );

  await userEvent.click(screen.getByTitle("Select permission mode"));
  await userEvent.click(screen.getByText("Full access"));

  expect(onPermissionModeChange).toHaveBeenCalledWith("full");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @porta/web test -- ChatInput.test.tsx
```

Expected: FAIL because `ChatInput` does not accept or render permission mode.

- [ ] **Step 3: Implement composer selector**

In `packages/web/src/components/ChatInput.tsx`, import `PermissionMode` and add props:

```ts
permissionMode: PermissionMode;
onPermissionModeChange: (mode: PermissionMode) => void;
```

Add a `PERMISSION_OPTIONS` array:

```ts
const PERMISSION_OPTIONS: {
  value: PermissionMode;
  label: string;
  desc: string;
}[] = [
  {
    value: "default",
    label: "Default",
    desc: "Ask before running commands",
  },
  {
    value: "full",
    label: "Full access",
    desc: "Auto-approve terminal commands",
  },
];
```

Add a `PermissionModeSelector` component following the local `PlannerTypeSelector` pattern and render it before `ModelSelector`:

```tsx
<PermissionModeSelector
  permissionMode={permissionMode}
  onSelect={onPermissionModeChange}
/>
```

Use `title="Select permission mode"` on its button.

- [ ] **Step 4: Wire App settings**

In `packages/web/src/App.tsx`, import:

```ts
import {
  permissionModeForWorkspace,
  workspacePermissionPatch,
} from "./hooks/useClientSettings";
import type { PermissionMode } from "./types";
```

Resolve workspace key:

```ts
const workspacePermissionKey = currentWorkspaceUri ?? projectSlug ?? null;
const permissionMode = permissionModeForWorkspace(
  settings,
  workspacePermissionKey,
);
const handlePermissionModeChange = useCallback(
  (mode: PermissionMode) => {
    if (!workspacePermissionKey) return;
    updateSettings(
      workspacePermissionPatch(settings, workspacePermissionKey, mode),
    );
  },
  [settings, updateSettings, workspacePermissionKey],
);
```

Pass `permissionMode` to `ChatPanel` for streaming.

Pass to `ChatInput`:

```tsx
permissionMode={permissionMode}
onPermissionModeChange={handlePermissionModeChange}
```

Pass `workspacePermissionKey`, `workspacePermissionMode`, and `onWorkspacePermissionModeChange` to `SettingsPanel`.

- [ ] **Step 5: Add Settings page selector**

Update `SettingsPanel` props:

```ts
workspacePermissionMode: PermissionMode;
onWorkspacePermissionModeChange: (mode: PermissionMode) => void;
```

Add a Permissions section:

```tsx
<div className="settings-section">
  <h2 className="settings-section-title">Permissions</h2>
  <div className="settings-row">
    <div className="settings-row-info">
      <span className="settings-row-label">Workspace Permission Mode</span>
      <span className="settings-row-desc">
        Full access auto-approves terminal commands in this workspace only.
        File permission prompts remain manual.
      </span>
    </div>
    <select
      className="settings-select"
      value={workspacePermissionMode}
      onChange={(e) => {
        onWorkspacePermissionModeChange(e.target.value as PermissionMode);
        flashSaved();
      }}
    >
      <option value="default">Default permissions</option>
      <option value="full">Full access</option>
    </select>
  </div>
</div>
```

Update reset to include:

```ts
onWorkspacePermissionModeChange("default");
```

- [ ] **Step 6: Add CSS**

In `packages/web/src/styles/input.css`, reuse dropdown styles and add:

```css
.permission-selector .model-selector-btn {
  width: 128px;
}

.permission-selector.full .model-selector-btn {
  color: rgb(var(--c-error));
  border-color: rgb(var(--c-error) / 0.35);
  background: rgb(var(--c-error) / 0.08);
}
```

- [ ] **Step 7: Run ChatInput test**

Run:

```bash
pnpm --filter @porta/web test -- ChatInput.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/ChatInput.tsx packages/web/src/components/SettingsPanel.tsx packages/web/src/App.tsx packages/web/src/styles/input.css packages/web/src/styles/settings.css packages/web/src/__tests__/ChatInput.test.tsx
git commit -m "feat(web): add workspace permission selector"
```

### Task 5: Wire Permission Mode Into ChatPanel Streaming

**Files:**
- Modify: `packages/web/src/components/ChatPanel.tsx`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/__tests__/useStepsStream.test.tsx`

- [ ] **Step 1: Add prop and pass through**

In `packages/web/src/components/ChatPanel.tsx`, add:

```ts
permissionMode: import("../types").PermissionMode;
```

to `Props`, destructure `permissionMode`, and pass it into `useStepsStream`:

```ts
  } = useStepsStream(
    cascadeId,
    totalStepCount,
    onSidebarRefresh,
    isConversationRunning,
    permissionMode,
  );
```

Update `App.tsx`:

```tsx
<ChatPanel
  permissionMode={permissionMode}
/>
```

- [ ] **Step 2: Run stream tests**

Run:

```bash
pnpm --filter @porta/web test -- useStepsStream.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ChatPanel.tsx packages/web/src/App.tsx packages/web/src/__tests__/useStepsStream.test.tsx
git commit -m "feat(web): apply permission mode to chat streams"
```

### Task 6: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm -r test
```

Expected: PASS.

- [ ] **Step 2: Run full build**

Run:

```bash
pnpm -r build
```

Expected: PASS.

- [ ] **Step 3: Manual browser verification**

Start Porta:

```bash
PORTA_AUTO_APPROVE_COMMANDS=0 pnpm dev:tailscale
```

Open:

```text
http://100.123.104.63:5173
```

Verify:

- Default mode shows command approval card for `echo default-mode`.
- Full access mode auto-approves `echo full-access-mode`.
- Switching back to Default stops auto-approval.
- File permission prompts remain manual.

- [ ] **Step 4: Commit any verification-only doc updates**

If verification reveals that the manual steps in `docs/superpowers/specs/2026-06-05-workspace-permission-mode-design.md` need wording changes, commit that exact spec file:

```bash
git add docs/superpowers/specs/2026-06-05-workspace-permission-mode-design.md
git commit -m "docs: update permission mode verification"
```

If the spec file did not change, do not run a verification-doc commit.
