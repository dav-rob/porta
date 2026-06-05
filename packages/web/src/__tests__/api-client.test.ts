import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ok",
            proxy: { port: 3100, uptime: 1 },
            languageServers: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(api.health()).resolves.toMatchObject({ status: "ok" });
  });

  it("throws a clear error when the API returns HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><html><body>Not JSON</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(api.health()).rejects.toThrow(
      "API returned non-JSON for /api/health: <!doctype html><html><body>Not JSON</body></html>",
    );
  });

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

  it("posts an absolute path when adding a workspace", async () => {
    const workspacePath = "/home/user/projects/new-app";
    const workspaceUri = "file:///home/user/projects/new-app";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          workspaceUri,
          name: "new-app",
          projectId: "project-123",
        }),
      }),
    );

    await expect(api.addWorkspace(workspacePath)).resolves.toEqual({
      workspaceUri,
      name: "new-app",
      projectId: "project-123",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/workspaces",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: workspacePath }),
      }),
    );
  });

  it("sends projectId when starting a workspace conversation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ cascadeId: "cascade-1" }),
      }),
    );

    await api.startConversation(
      "file:///home/user/projects/new-app",
      false,
      "project-123",
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/conversations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          workspaceFolderAbsoluteUri: "file:///home/user/projects/new-app",
          projectId: "project-123",
          fileAccessGranted: false,
        }),
      }),
    );
  });
});
