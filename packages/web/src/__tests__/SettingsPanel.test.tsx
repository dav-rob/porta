import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../components/SettingsPanel";

vi.mock("../api/client", () => ({
  api: {
    models: vi.fn().mockResolvedValue({ clientModelConfigs: [] }),
  },
}));

describe("SettingsPanel", () => {
  it("clears all workspace permission modes when resetting all settings", async () => {
    const onUpdate = vi.fn();
    const onWorkspacePermissionModeChange = vi.fn();

    render(
      <SettingsPanel
        settings={{
          defaultModel: "model-a",
          defaultPlannerType: "planning",
          workspacePermissionModes: {
            "file:///repo/a": "full",
            "file:///repo/b": "full",
          },
        }}
        onUpdate={onUpdate}
        workspacePermissionKey="file:///repo/a"
        workspacePermissionMode="full"
        onWorkspacePermissionModeChange={onWorkspacePermissionModeChange}
        onBack={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Reset all settings to defaults"));

    expect(onUpdate).toHaveBeenCalledWith({
      defaultModel: null,
      defaultPlannerType: "conversational",
      workspacePermissionModes: {},
    });
    expect(onWorkspacePermissionModeChange).not.toHaveBeenCalled();
  });
});
