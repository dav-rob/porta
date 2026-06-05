import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    getWorkspaces: vi.fn(),
    addWorkspace: vi.fn(),
  },
}));

describe("useWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks API workspaces as visible when empty and conversation-only workspaces as hidden when empty", async () => {
    vi.mocked(api.getWorkspaces).mockResolvedValue({
      workspaceInfos: [
        { workspaceUri: "file:///Users/davidroberts/projects/porta" },
      ],
    });

    const { result } = renderHook(() =>
      useWorkspaces(
        [
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
        ],
        "porta",
      ),
    );

    await waitFor(() => {
      expect(result.current.workspaces).toEqual(
        expect.arrayContaining([
          {
            uri: "file:///Users/davidroberts/projects/porta",
            name: "porta",
            showWhenEmpty: true,
          },
          {
            uri: "file:///Users/davidroberts/projects/recovered-project",
            name: "recovered-project",
            showWhenEmpty: false,
          },
        ]),
      );
    });
  });
});
