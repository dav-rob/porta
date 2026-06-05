import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api/client";

/** Extract a short slug from a workspace URI: file:///home/user/work/porta → porta */
function slugFromUri(uri: string): string {
  return uri.replace("file://", "").split("/").pop() ?? uri;
}

/** Resolve a slug back to a full workspace URI using the workspace list. */
function uriFromSlug(
  slug: string,
  workspaces: WorkspaceOption[],
): string | undefined {
  return workspaces.find((w) => slugFromUri(w.uri) === slug)?.uri;
}

export interface WorkspaceOption {
  uri: string;
  name: string;
  projectId?: string;
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
  workspaces: WorkspaceOption[];
  currentWorkspaceUri: string | undefined;
  currentProjectId: string | undefined;
  refreshWorkspaces: () => Promise<void>;
  addLocalWorkspace: (path: string) => Promise<WorkspaceOption>;
}

/**
 * Merge workspace sources: LS API + conversation metadata.
 * Returns a stable list of known workspaces and the resolved URI for the current URL slug.
 */
export function useWorkspaces(
  conversations: ConversationEntry[],
  projectSlug: string | undefined,
): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
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
        w.projectName ??
        w.workspaceUri.replace("file://", "").split("/").pop() ??
        w.workspaceUri,
      projectId: w.projectId,
    }));
    const merged = new Map<string, WorkspaceOption>();
    for (const w of fromApi) merged.set(w.uri, w);
    for (const [uri, name] of conversationWorkspaces) {
      if (!merged.has(uri)) merged.set(uri, { uri, name });
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
        projectId: created.projectId,
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
  const currentProjectId = useMemo(
    () => workspaces.find((w) => w.uri === currentWorkspaceUri)?.projectId,
    [currentWorkspaceUri, workspaces],
  );

  return {
    workspaces,
    currentWorkspaceUri,
    currentProjectId,
    refreshWorkspaces,
    addLocalWorkspace,
  };
}

export { slugFromUri, uriFromSlug };
