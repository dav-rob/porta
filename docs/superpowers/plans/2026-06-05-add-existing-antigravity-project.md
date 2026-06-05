# Add Existing Antigravity Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-cut Porta flow for adding an existing local folder as an Antigravity project/workspace.

**Architecture:** The proxy owns Antigravity RPC details and exposes a narrow `POST /api/workspaces` endpoint. The web app calls that endpoint from the workspace picker, refreshes the workspace list, and navigates to the new workspace slug. The initial backend calls `ValidateProject`, `CreateProject`, and `AddTrackedWorkspace` to cover both project creation and immediate workspace availability.

**Tech Stack:** Hono proxy, TypeScript, React, Vitest, existing Connect JSON RPC client.

---

### Task 1: Proxy Add Existing Workspace Route

**Files:**
- Modify: `packages/proxy/src/routes/workspaces.ts`
- Test: `packages/proxy/src/__tests__/workspaces-route.test.ts`

- [ ] Add failing tests for `POST /api/workspaces` validation and RPC sequence.
- [ ] Implement path validation, folder URI conversion, project payload construction, `ValidateProject`, `CreateProject`, and `AddTrackedWorkspace` calls.
- [ ] Run proxy workspace route tests.

### Task 2: Web API And Workspace Picker UI

**Files:**
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/hooks/useWorkspaces.ts`
- Modify: `packages/web/src/components/WorkspaceSelector.tsx`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/__tests__/api-client.test.ts`

- [ ] Add failing API client test for `addWorkspace`.
- [ ] Add API method and refresh hook support.
- [ ] Add an "Add folder" action to the existing workspace dropdown, prompt for an absolute path, call the API, select the resulting workspace, and navigate to it.
- [ ] Run focused web tests.

### Task 3: Verification

- [ ] Run `pnpm --filter @porta/proxy test -- workspaces-route`.
- [ ] Run `pnpm --filter @porta/web test -- api-client`.
- [ ] Run `pnpm -r test`.
- [ ] Run `pnpm -r build`.
