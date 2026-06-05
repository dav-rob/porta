import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  permissionModeForWorkspace,
  useClientSettings,
  workspacePermissionPatch,
} from "../hooks/useClientSettings";

if (!globalThis.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
    configurable: true,
  });
}

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

  it("defaults legacy stored settings without workspace permission modes", () => {
    localStorage.setItem(
      "porta:settings",
      JSON.stringify({
        defaultModel: null,
        defaultPlannerType: "conversational",
      }),
    );

    const { result } = renderHook(() => useClientSettings());

    expect(
      permissionModeForWorkspace(result.current.settings, "file:///repo/a"),
    ).toBe("default");
  });

  it("defaults stored null workspace permission modes", () => {
    localStorage.setItem(
      "porta:settings",
      JSON.stringify({
        defaultModel: null,
        defaultPlannerType: "conversational",
        workspacePermissionModes: null,
      }),
    );

    const { result } = renderHook(() => useClientSettings());

    expect(
      permissionModeForWorkspace(result.current.settings, "file:///repo/a"),
    ).toBe("default");
  });

  it("filters invalid stored workspace permission modes", () => {
    localStorage.setItem(
      "porta:settings",
      JSON.stringify({
        defaultModel: null,
        defaultPlannerType: "conversational",
        workspacePermissionModes: {
          "file:///repo/a": "dangerous",
          "file:///repo/b": "full",
        },
      }),
    );

    const { result } = renderHook(() => useClientSettings());

    expect(
      permissionModeForWorkspace(result.current.settings, "file:///repo/a"),
    ).toBe("default");
    expect(
      permissionModeForWorkspace(result.current.settings, "file:///repo/b"),
    ).toBe("full");
  });
});
