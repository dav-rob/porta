import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LSInstance } from "../discovery.js";
import { clearAutoApprovedCommandsForTests } from "../auto-approve.js";

const mockGetInstances = vi.fn<() => Promise<LSInstance[]>>();
const mockRpcCall = vi.fn<
  (method: string, body: unknown, inst: LSInstance) => Promise<unknown>
>();
const mockRpcForConversation = vi.fn<
  (
    method: string,
    cascadeId: string,
    body?: Record<string, unknown>,
    pinnedInstance?: LSInstance,
    readOnly?: boolean,
  ) => Promise<unknown>
>();
const mockScanDiskConversations = vi.fn<
  () => Promise<
    { id: string; mtime: string; title?: string; workspaceUris?: string[] }[]
  >
>();

const conversationAffinity = new Map<string, string>();
const conversationInstanceAffinity = new Map<string, LSInstance>();

vi.mock("../routing.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    discovery: {
      getInstances: mockGetInstances,
      getInstance: async () => (await mockGetInstances())[0] ?? null,
    },
    rpc: { call: mockRpcCall },
    rpcForConversation: mockRpcForConversation,
    conversationAffinity,
    conversationInstanceAffinity,
  };
});

vi.mock("../metadata.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    scanDiskConversations: mockScanDiskConversations,
  };
});

const { registerConversationRoutes } = await import("../routes/conversations.js");

const makeInstance = (overrides: Partial<LSInstance> = {}): LSInstance => ({
  pid: 1000 + Math.floor(Math.random() * 9000),
  httpsPort: 9000 + Math.floor(Math.random() * 1000),
  httpPort: 0,
  lspPort: 0,
  csrfToken: "test-csrf",
  source: "daemon" as const,
  ...overrides,
});

function app() {
  const hono = new Hono();
  registerConversationRoutes(hono);
  return hono;
}

describe("GET /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    conversationAffinity.clear();
    conversationInstanceAffinity.clear();
    clearAutoApprovedCommandsForTests();
    mockRpcForConversation.mockReset();
    mockScanDiskConversations.mockResolvedValue([]);
  });

  it("keeps workspace-backed conversations from an unscoped Antigravity 2.x hub LS", async () => {
    const hubLS = makeInstance({ pid: 1, workspaceId: undefined });
    mockGetInstances.mockResolvedValue([hubLS]);
    mockRpcCall.mockResolvedValue({
      trajectorySummaries: {
        "c-hub": {
          summary: "Hub conversation",
          stepCount: 9,
          lastModifiedTime: "2026-06-01T00:00:00.000Z",
          workspaces: [{ workspaceFolderAbsoluteUri: "file:///home/user/project" }],
        },
      },
    });

    const res = await app().request("/api/conversations");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body.trajectorySummaries)).toEqual(["c-hub"]);
    expect(conversationAffinity.get("c-hub")).toBe("file_home_user_project");
  });

  it("still filters scoped LS conversations for workspaces not served by any running scoped LS", async () => {
    const scopedLS = makeInstance({
      pid: 2,
      workspaceId: "file_home_user_projectA",
    });
    mockGetInstances.mockResolvedValue([scopedLS]);
    mockRpcCall.mockResolvedValue({
      trajectorySummaries: {
        "c-other": {
          summary: "Other project",
          stepCount: 9,
          lastModifiedTime: "2026-06-01T00:00:00.000Z",
          workspaces: [{ workspaceFolderAbsoluteUri: "file:///home/user/projectB" }],
        },
      },
    });

    const res = await app().request("/api/conversations");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.trajectorySummaries).toEqual({});
  });

  it("normalizes workspaces from trajectoryMetadata for frontend consumers", async () => {
    const hubLS = makeInstance({ pid: 3, workspaceId: undefined });
    mockGetInstances.mockResolvedValue([hubLS]);
    mockRpcCall.mockResolvedValue({
      trajectorySummaries: {
        "c-meta": {
          summary: "Metadata-only workspace",
          stepCount: 9,
          lastModifiedTime: "2026-06-01T00:00:00.000Z",
          trajectoryMetadata: {
            workspaces: [
              { workspaceFolderAbsoluteUri: "file:///home/user/project" },
            ],
          },
        },
      },
    });

    const res = await app().request("/api/conversations");
    const body = await res.json();

    expect(body.trajectorySummaries["c-meta"].workspaces).toEqual([
      { workspaceFolderAbsoluteUri: "file:///home/user/project" },
    ]);
  });

  it("uses disk workspace metadata for unloaded conversations", async () => {
    const hubLS = makeInstance({ pid: 4, workspaceId: undefined });
    mockGetInstances.mockResolvedValue([hubLS]);
    mockRpcCall.mockResolvedValue({ trajectorySummaries: {} });
    mockScanDiskConversations.mockResolvedValue([
      {
        id: "disk-cascade",
        mtime: "2026-06-01T00:00:00.000Z",
        title: "Please do pwd",
        workspaceUris: ["file:///home/user/project"],
      },
    ]);

    const res = await app().request("/api/conversations");
    const body = await res.json();

    expect(body.trajectorySummaries["disk-cascade"].workspaces).toEqual([
      { workspaceFolderAbsoluteUri: "file:///home/user/project" },
    ]);
    expect(body.trajectorySummaries["disk-cascade"].summary).toBe(
      "Please do pwd",
    );
    expect(conversationAffinity.get("disk-cascade")).toBe(
      "file_home_user_project",
    );
  });
});

describe("GET /api/conversations/:id/steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    conversationAffinity.clear();
    conversationInstanceAffinity.clear();
    clearAutoApprovedCommandsForTests();
    mockRpcForConversation.mockReset();
    mockScanDiskConversations.mockResolvedValue([]);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("uses env fallback for command approval when permission mode is omitted", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    mockRpcForConversation.mockImplementation(async (method) => {
      if (method === "GetCascadeTrajectorySteps") {
        return {
          steps: [
            {
              status: "CORTEX_STEP_STATUS_WAITING",
              runCommand: {
                proposedCommandLine: "echo route-env-fallback",
              },
              metadata: {
                sourceTrajectoryStepInfo: {
                  trajectoryId: "trajectory-1",
                  stepIndex: 7,
                },
              },
            },
          ],
        };
      }
      return {};
    });

    const res = await app().request(
      "/api/conversations/cascade-steps-env/steps?limit=1",
    );

    expect(res.status).toBe(200);
    expect(mockRpcForConversation).toHaveBeenCalledWith(
      "HandleCascadeUserInteraction",
      "cascade-steps-env",
      expect.objectContaining({
        cascadeId: "cascade-steps-env",
        interaction: expect.objectContaining({
          trajectoryId: "trajectory-1",
          stepIndex: 7,
        }),
      }),
    );
  });

  it("does not use env fallback for command approval with explicit default mode", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    mockRpcForConversation.mockImplementation(async (method) => {
      if (method === "GetCascadeTrajectorySteps") {
        return {
          steps: [
            {
              status: "CORTEX_STEP_STATUS_WAITING",
              runCommand: {
                proposedCommandLine: "echo route-explicit-default",
              },
              metadata: {
                sourceTrajectoryStepInfo: {
                  trajectoryId: "trajectory-1",
                  stepIndex: 8,
                },
              },
            },
          ],
        };
      }
      return {};
    });

    const res = await app().request(
      "/api/conversations/cascade-steps-default/steps?limit=1&permissionMode=default",
    );

    expect(res.status).toBe(200);
    expect(
      mockRpcForConversation.mock.calls.some(
        ([method]) => method === "HandleCascadeUserInteraction",
      ),
    ).toBe(false);
  });
});

describe("POST /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    conversationAffinity.clear();
    conversationInstanceAffinity.clear();
    clearAutoApprovedCommandsForTests();
    mockScanDiskConversations.mockResolvedValue([]);
  });

  it("sets the Antigravity 2.x required trajectory source and caches unscoped hub ownership", async () => {
    const hubLS = makeInstance({ pid: 4, workspaceId: undefined });
    mockGetInstances.mockResolvedValue([hubLS]);
    mockRpcCall.mockResolvedValue({ cascadeId: "new-cascade" });

    const res = await app().request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceFolderAbsoluteUri: "file:///home/user/project",
        fileAccessGranted: true,
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.cascadeId).toBe("new-cascade");
    expect(mockRpcCall).toHaveBeenCalledWith(
      "StartCascade",
      expect.objectContaining({
        source: "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
        workspaceFolderAbsoluteUri: "file:///home/user/project",
        workspaceUris: ["file:///home/user/project"],
      }),
      hubLS,
    );
    expect(conversationAffinity.get("new-cascade")).toBe(
      "file_home_user_project",
    );
    expect(conversationInstanceAffinity.get("new-cascade")).toBe(hubLS);
  });

  it("accepts latest Antigravity workspaceUris requests", async () => {
    const hubLS = makeInstance({ pid: 5, workspaceId: undefined });
    mockGetInstances.mockResolvedValue([hubLS]);
    mockRpcCall.mockResolvedValue({ cascadeId: "new-cascade" });

    const res = await app().request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceUris: ["file:///home/user/project"],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockRpcCall).toHaveBeenCalledWith(
      "StartCascade",
      expect.objectContaining({
        workspaceFolderAbsoluteUri: "file:///home/user/project",
        workspaceUris: ["file:///home/user/project"],
      }),
      hubLS,
    );
    expect(conversationAffinity.get("new-cascade")).toBe(
      "file_home_user_project",
    );
  });

  it("infers a single known workspace when creating without workspace metadata", async () => {
    const hubLS = makeInstance({ pid: 6, workspaceId: undefined });
    mockGetInstances.mockResolvedValue([hubLS]);
    mockRpcCall.mockImplementation(async (method) => {
      if (method === "GetWorkspaceInfos") return { workspaceInfos: [] };
      if (method === "GetAllCascadeTrajectories") {
        return {
          trajectorySummaries: {
            existing: {
              trajectoryMetadata: {
                workspaces: [
                  { workspaceFolderAbsoluteUri: "file:///home/user/project" },
                ],
              },
            },
          },
        };
      }
      return { cascadeId: "new-cascade" };
    });

    const res = await app().request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileAccessGranted: true }),
    });

    expect(res.status).toBe(201);
    expect(mockRpcCall).toHaveBeenCalledWith(
      "StartCascade",
      expect.objectContaining({
        workspaceFolderAbsoluteUri: "file:///home/user/project",
        workspaceUris: ["file:///home/user/project"],
      }),
      hubLS,
    );
  });

  it("starts a conversation on an LS that lists the requested workspace", async () => {
    const scopedLS = makeInstance({
      pid: 7,
      workspaceId: "file_home_user_other-project",
    });
    mockGetInstances.mockResolvedValue([scopedLS]);
    mockRpcCall.mockImplementation(async (method) => {
      if (method === "GetWorkspaceInfos") {
        return {
          workspaceInfos: [
            { workspaceUri: "file:///home/user/requested-project" },
          ],
        };
      }
      if (method === "StartCascade") return { cascadeId: "new-cascade" };
      return {};
    });

    const res = await app().request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceFolderAbsoluteUri: "file:///home/user/requested-project",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockRpcCall).toHaveBeenCalledWith(
      "StartCascade",
      expect.objectContaining({
        workspaceFolderAbsoluteUri: "file:///home/user/requested-project",
        workspaceUris: ["file:///home/user/requested-project"],
      }),
      scopedLS,
    );
    expect(conversationAffinity.get("new-cascade")).toBe(
      "file_home_user_requested-project",
    );
    expect(conversationInstanceAffinity.get("new-cascade")).toBe(scopedLS);
  });
});
