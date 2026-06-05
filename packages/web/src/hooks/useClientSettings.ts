/**
 * Global client settings stored in localStorage.
 *
 * A single key (`porta:settings`) holds all settings across workspaces.
 * Cross-tab sync via the `storage` event.
 */

import { useState, useEffect, useCallback } from "react";
import type { ClientSettings, PermissionMode } from "../types";
import { DEFAULT_MODEL } from "../constants";

const STORAGE_KEY = "porta:settings";

const DEFAULT_SETTINGS: ClientSettings = {
  defaultModel: DEFAULT_MODEL,
  defaultPlannerType: "conversational",
  workspacePermissionModes: {},
};

export function permissionModeForWorkspace(
  settings: ClientSettings,
  workspaceKey: string | null | undefined,
): PermissionMode {
  if (!workspaceKey) return "default";
  return settings.workspacePermissionModes[workspaceKey] ?? "default";
}

export function workspacePermissionPatch(
  settings: ClientSettings,
  workspaceKey: string,
  mode: PermissionMode,
): Pick<ClientSettings, "workspacePermissionModes"> {
  return {
    workspacePermissionModes: {
      ...settings.workspacePermissionModes,
      [workspaceKey]: mode,
    },
  };
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "default" || value === "full";
}

function normalizeWorkspacePermissionModes(
  value: unknown,
): ClientSettings["workspacePermissionModes"] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, PermissionMode] =>
      isPermissionMode(entry[1]),
    ),
  );
}

function readSettings(): ClientSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ClientSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      workspacePermissionModes: normalizeWorkspacePermissionModes(
        parsed.workspacePermissionModes,
      ),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: ClientSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable — silently degrade
  }
}

export function useClientSettings() {
  const [settings, setSettings] = useState<ClientSettings>(readSettings);

  // Listen for cross-tab storage events
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSettings(readSettings());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const updateSettings = useCallback((patch: Partial<ClientSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings } as const;
}
