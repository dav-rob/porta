import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../components/Sidebar";

const defaultProps = {
  conversations: [],
  activeId: null,
  onSelect: vi.fn(),
  onNew: vi.fn(),
  onDelete: vi.fn(),
  onSettings: vi.fn(),
  loading: false,
  connected: true,
  isOpen: true,
  onToggle: vi.fn(),
};

describe("Sidebar", () => {
  it("shows conversations under matching workspace entries", () => {
    render(
      <Sidebar
        {...defaultProps}
        workspaces={[
          {
            uri: "file:///Users/davidroberts/projects/quick-scripts/test-porta-2",
            name: "test-porta-2",
          },
        ]}
        conversations={[
          {
            id: "cascade-1",
            summary: {
              summary: "Identify Current Working Directory",
              status: "CASCADE_RUN_STATUS_IDLE",
              lastModifiedTime: new Date().toISOString(),
              createdTime: new Date().toISOString(),
              trajectoryId: "trajectory-1",
              stepCount: 2,
              workspaces: [
                {
                  workspaceFolderAbsoluteUri:
                    "file:///Users/davidroberts/projects/quick-scripts/test-porta-2",
                  repository: {},
                },
              ],
            },
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Identify Current Working Directory"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No conversations yet")).not.toBeInTheDocument();
  });

  it("shows workspaces that do not have conversations yet", async () => {
    const onWorkspaceSelect = vi.fn();
    render(
      <Sidebar
        {...defaultProps}
        workspaces={[
          {
            uri: "file:///Users/davidroberts/projects/quick-scripts/test-porta-2",
            name: "test-porta-2",
          },
        ]}
        onWorkspaceSelect={onWorkspaceSelect}
      />,
    );

    await userEvent.click(screen.getByText("test-porta-2"));

    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    expect(onWorkspaceSelect).toHaveBeenCalledWith(
      "file:///Users/davidroberts/projects/quick-scripts/test-porta-2",
    );
  });
});
