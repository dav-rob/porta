import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    getWorkspaces: vi.fn(),
    addWorkspace: vi.fn(),
  },
}));

const emptyConversations: Parameters<typeof useWorkspaces>[0] = [];

describe("useWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      clear: vi.fn(() => storage.clear()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks API and conversation-only workspaces as hidden when empty by default", async () => {
    vi.mocked(api.getWorkspaces).mockResolvedValue({
      workspaceInfos: [
        { workspaceUri: "file:///Users/davidroberts/projects/porta" },
        {
          workspaceUri:
            "file:///Users/davidroberts/projects/Tix-Appeal/extract-ticket-data",
          source: "conversation",
        },
      ],
    });

    const conversations: Parameters<typeof useWorkspaces>[0] = [
      {
        id: "cascade-1",
        summary: {
          workspaces: [
            {
              workspaceFolderAbsoluteUri:
                "file:///Users/davidroberts/projects/recovered-project",
              repository: {},
            },
          ],
        },
      },
    ];

    const { result } = renderHook(() => useWorkspaces(conversations, "porta"));

    await waitFor(() => {
      expect(result.current.workspaces).toEqual(
        expect.arrayContaining([
          {
            uri: "file:///Users/davidroberts/projects/porta",
            name: "porta",
            showWhenEmpty: false,
          },
          {
            uri: "file:///Users/davidroberts/projects/recovered-project",
            name: "recovered-project",
            showWhenEmpty: false,
          },
          {
            uri: "file:///Users/davidroberts/projects/Tix-Appeal/extract-ticket-data",
            name: "extract-ticket-data",
            showWhenEmpty: false,
          },
        ]),
      );
    });
  });

  it("marks workspaces added through Porta as visible when empty", async () => {
    vi.mocked(api.getWorkspaces).mockResolvedValue({
      workspaceInfos: [],
    });
    vi.mocked(api.addWorkspace).mockResolvedValue({
      workspaceUri: "file:///Users/davidroberts/projects/new-app",
      name: "new-app",
    });

    const { result } = renderHook(() =>
      useWorkspaces(emptyConversations, "new-app"),
    );

    let added:
      | Awaited<ReturnType<typeof result.current.addLocalWorkspace>>
      | undefined;
    await act(async () => {
      added = await result.current.addLocalWorkspace(
        "/Users/davidroberts/projects/new-app",
      );
    });

    expect(added).toEqual({
      uri: "file:///Users/davidroberts/projects/new-app",
      name: "new-app",
      showWhenEmpty: true,
    });
    expect(result.current.workspaces).toEqual([
      {
        uri: "file:///Users/davidroberts/projects/new-app",
        name: "new-app",
        showWhenEmpty: true,
      },
    ]);
  });
});
