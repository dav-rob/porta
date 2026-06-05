import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LSInstance } from "../discovery.js";
import { RPCError } from "../rpc.js";

const mockGetInstances = vi.fn<() => Promise<LSInstance[]>>();
const mockGetInstance = vi.fn<() => Promise<LSInstance | undefined>>();
const mockRpcCall = vi.fn<
  (method: string, body: unknown, inst?: LSInstance) => Promise<unknown>
>();
const mockAccess = vi.fn<(path: string) => Promise<void>>();
const mockStat = vi.fn<
  (path: string) => Promise<{ isDirectory: () => boolean }>
>();

vi.mock("../routing.js", () => ({
  discovery: { getInstance: mockGetInstance, getInstances: mockGetInstances },
  rpc: { call: mockRpcCall },
}));
vi.mock("node:fs/promises", () => ({
  access: mockAccess,
  stat: mockStat,
}));

const { registerWorkspaceRoutes } = await import("../routes/workspaces.js");

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
  registerWorkspaceRoutes(hono);
  return hono;
}

describe("GET /api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ isDirectory: () => true });
  });

  it("falls back to conversation metadata when GetWorkspaceInfos has no workspaceInfos", async () => {
    const hubLS = makeInstance({ pid: 1, workspaceId: undefined });
    mockGetInstances.mockResolvedValue([hubLS]);
    mockRpcCall.mockImplementation(async (method: string) => {
      if (method === "GetWorkspaceInfos") {
        return {
          homeDirPath: "C:/Users/deepk",
          homeDirUri: "file:///C:/Users/deepk",
          geminiDirUri: "file:///C:/Users/deepk/.gemini",
        };
      }
      if (method === "GetAllCascadeTrajectories") {
        return {
          trajectorySummaries: {
            "c-hub": {
              workspaces: [
                {
                  workspaceFolderAbsoluteUri: "file:///C:/Users/deepk/porta",
                  gitRootAbsoluteUri: "file:///C:/Users/deepk/porta",
                },
              ],
            },
          },
        };
      }
      return {};
    });

    const res = await app().request("/api/workspaces");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.workspaceInfos).toEqual([
      {
        workspaceUri: "file:///C:/Users/deepk/porta",
        gitRootUri: "file:///C:/Users/deepk/porta",
        source: "conversation",
      },
    ]);
  });

  it("keeps GetWorkspaceInfos results and deduplicates conversation fallback workspaces", async () => {
    const ls = makeInstance({ pid: 2, workspaceId: "file_home_user_porta" });
    mockGetInstances.mockResolvedValue([ls]);
    mockRpcCall.mockImplementation(async (method: string) => {
      if (method === "GetWorkspaceInfos") {
        return {
          workspaceInfos: [
            {
              workspaceUri: "file:///home/user/porta",
              gitRootUri: "file:///home/user/porta",
            },
          ],
        };
      }
      if (method === "GetAllCascadeTrajectories") {
        return {
          trajectorySummaries: {
            "c1": {
              workspaces: [
                {
                  workspaceFolderAbsoluteUri: "file:///home/user/porta",
                  gitRootAbsoluteUri: "file:///home/user/porta",
                },
              ],
            },
          },
        };
      }
      return {};
    });

    const res = await app().request("/api/workspaces");
    const body = await res.json();

    expect(body.workspaceInfos).toHaveLength(1);
    expect(body.workspaceInfos[0].workspaceUri).toBe("file:///home/user/porta");
    expect(body.workspaceInfos[0].source).toBe("tracked");
  });

  it("filters local workspaces whose folders no longer exist", async () => {
    const ls = makeInstance({ pid: 5 });
    mockGetInstances.mockResolvedValue([ls]);
    mockAccess.mockImplementation(async (path: string) => {
      if (path.endsWith("/deleted-project")) {
        throw new Error("missing");
      }
    });
    mockRpcCall.mockImplementation(async (method: string) => {
      if (method === "GetWorkspaceInfos") {
        return {
          workspaceInfos: [
            {
              workspaceUri: "file:///Users/davidroberts/projects/deleted-project",
            },
            {
              workspaceUri: "file:///Users/davidroberts/projects/active-project",
            },
          ],
        };
      }
      if (method === "GetAllCascadeTrajectories") {
        return {};
      }
      return {};
    });

    const res = await app().request("/api/workspaces");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.workspaceInfos).toEqual([
      {
        workspaceUri: "file:///Users/davidroberts/projects/active-project",
        source: "tracked",
      },
    ]);
  });
});

describe("POST /api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ isDirectory: () => true });
  });

  it("rejects non-absolute folder paths", async () => {
    const res = await app().request("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ path: "relative/project" }),
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Path must be absolute");
    expect(mockRpcCall).not.toHaveBeenCalled();
  });

  it("validates, creates, and tracks an existing folder workspace", async () => {
    const ls = makeInstance({ pid: 3 });
    mockGetInstance.mockResolvedValue(ls);
    mockRpcCall.mockResolvedValue({});

    const res = await app().request("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ path: "/Users/davidroberts/projects/new-app" }),
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({
      workspaceUri: "file:///Users/davidroberts/projects/new-app",
      name: "new-app",
    });
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      1,
      "ValidateProject",
      { location: "file:///Users/davidroberts/projects/new-app" },
      ls,
    );
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      2,
      "CreateProject",
      {
        project: {
          name: "new-app",
          projectResources: {
            resources: [
              {
                gitFolder: {
                  folderUri: "file:///Users/davidroberts/projects/new-app",
                  allowWrite: true,
                },
              },
            ],
          },
        },
      },
      ls,
    );
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      3,
      "AddTrackedWorkspace",
      {
        workspace: "/Users/davidroberts/projects/new-app",
        isPassiveWorkspace: true,
      },
      ls,
    );
  });

  it("continues when Antigravity says the project already exists", async () => {
    const ls = makeInstance({ pid: 4 });
    mockGetInstance.mockResolvedValue(ls);
    mockRpcCall.mockImplementation(async (method: string) => {
      if (method === "CreateProject") {
        throw new RPCError("project already exists", "already_exists");
      }
      return {};
    });

    const res = await app().request("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ path: "/Users/davidroberts/projects/test-porta-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.workspaceUri).toBe(
      "file:///Users/davidroberts/projects/test-porta-1",
    );
    expect(mockRpcCall).toHaveBeenLastCalledWith(
      "AddTrackedWorkspace",
      {
        workspace: "/Users/davidroberts/projects/test-porta-1",
        isPassiveWorkspace: true,
      },
      ls,
    );
  });
});
