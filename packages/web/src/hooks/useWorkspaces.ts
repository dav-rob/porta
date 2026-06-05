import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api/client";

/** Extract a short slug from a workspace URI: file:///home/user/work/porta → porta */
function slugFromUri(uri: string): string {
  return uri.replace("file://", "").split("/").pop() ?? uri;
}

/** Resolve a slug back to a full workspace URI using the workspace list. */
function uriFromSlug(
  slug: string,
  workspaces: WorkspaceEntry[],
): string | undefined {
  return workspaces.find((w) => slugFromUri(w.uri) === slug)?.uri;
}

export interface WorkspaceEntry {
  uri: string;
  name: string;
  showWhenEmpty: boolean;
}

interface ConversationEntry {
  id: string;
  summary: {
    workspaces?: {
      workspaceFolderAbsoluteUri?: string;
      repository?: { computedName?: string };
    }[];
  };
}

interface UseWorkspacesResult {
  workspaces: WorkspaceEntry[];
  currentWorkspaceUri: string | undefined;
  refreshWorkspaces: () => Promise<void>;
  addLocalWorkspace: (path: string) => Promise<WorkspaceEntry>;
}

/**
 * Merge workspace sources: LS API + conversation metadata.
 * Returns a stable list of known workspaces and the resolved URI for the current URL slug.
 */
export function useWorkspaces(
  conversations: ConversationEntry[],
  projectSlug: string | undefined,
): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const wsInitialized = useRef(false);
  const conversationWorkspaces = useMemo(() => {
    const fromConvs = new Map<string, string>();
    for (const conv of conversations) {
      const ws = conv.summary.workspaces?.[0];
      if (!ws?.workspaceFolderAbsoluteUri) continue;
      const uri = ws.workspaceFolderAbsoluteUri;
      const name =
        ws.repository?.computedName?.split("/").pop() ??
        uri.replace("file://", "").split("/").pop() ??
        uri;
      fromConvs.set(uri, name);
    }
    return fromConvs;
  }, [conversations]);

  const refreshWorkspaces = useCallback(async () => {
    const data = await api.getWorkspaces();
    const fromApi = (data.workspaceInfos ?? []).map((w) => ({
      uri: w.workspaceUri,
      name:
        w.workspaceUri.replace("file://", "").split("/").pop() ??
        w.workspaceUri,
      showWhenEmpty: true,
    }));
    const merged = new Map<string, WorkspaceEntry>();
    for (const w of fromApi) merged.set(w.uri, w);
    for (const [uri, name] of conversationWorkspaces) {
      if (!merged.has(uri)) {
        merged.set(uri, { uri, name, showWhenEmpty: false });
      }
    }
    const list = Array.from(merged.values());
    setWorkspaces(list);
    wsInitialized.current = true;
  }, [conversationWorkspaces]);

  useEffect(() => {
    refreshWorkspaces()
      .catch(() => {
        const list = Array.from(conversationWorkspaces, ([uri, name]) => ({
          uri,
          name,
          showWhenEmpty: false,
        }));
        setWorkspaces(list);
        wsInitialized.current = true;
      });
  }, [conversationWorkspaces, refreshWorkspaces]);

  const addLocalWorkspace = useCallback(
    async (path: string) => {
      const created = await api.addWorkspace(path);
      const workspace = {
        uri: created.workspaceUri,
        name: created.name,
        showWhenEmpty: true,
      };
      setWorkspaces((prev) => {
        const next = new Map(prev.map((w) => [w.uri, w]));
        next.set(workspace.uri, workspace);
        return Array.from(next.values());
      });
      await refreshWorkspaces().catch(() => undefined);
      return workspace;
    },
    [refreshWorkspaces],
  );

  const currentWorkspaceUri = useMemo(
    () => (projectSlug ? uriFromSlug(projectSlug, workspaces) : undefined),
    [projectSlug, workspaces],
  );

  return { workspaces, currentWorkspaceUri, refreshWorkspaces, addLocalWorkspace };
}

export { slugFromUri, uriFromSlug };
