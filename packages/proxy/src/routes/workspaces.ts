/**
 * /api/workspaces route
 */

import type { Hono } from "hono";
import { access } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { discovery, rpc } from "../routing.js";
import { handleRPCError } from "../errors.js";
import { extractConversationWorkspaces } from "../metadata.js";
import { registerExistingLocalWorkspace } from "../workspace-projects.js";

async function localFileWorkspaceExists(workspaceUri: string): Promise<boolean> {
  if (!workspaceUri.startsWith("file://")) return true;
  try {
    await access(fileURLToPath(workspaceUri));
    return true;
  } catch {
    return false;
  }
}

export function registerWorkspaceRoutes(app: Hono): void {
  app.get("/api/workspaces", async (c) => {
    try {
      const instances = await discovery.getInstances();
      const workspaceMap = new Map<
        string,
        {
          workspaceUri: string;
          gitRootUri?: string;
          source?: "tracked" | "conversation";
        }
      >();
      let homeDirPath = "";
      let homeDirUri = "";

      await Promise.allSettled(
        instances.map(async (inst) => {
          try {
            const data = (await rpc.call("GetWorkspaceInfos", {}, inst)) as {
              homeDirPath?: string;
              homeDirUri?: string;
              workspaceInfos?: { workspaceUri: string; gitRootUri?: string }[];
            };
            if (data.homeDirPath) homeDirPath = data.homeDirPath;
            if (data.homeDirUri) homeDirUri = data.homeDirUri;
            for (const info of data.workspaceInfos ?? []) {
              if (!(await localFileWorkspaceExists(info.workspaceUri))) continue;
              workspaceMap.set(info.workspaceUri, {
                ...info,
                source: "tracked",
              });
            }
          } catch {
            // Skip unreachable instances
          }
        }),
      );

      await Promise.allSettled(
        instances.map(async (inst) => {
          try {
            const data = await rpc.call<{
              trajectorySummaries?: Record<string, Record<string, unknown>>;
            }>("GetAllCascadeTrajectories", {}, inst);
            for (const summary of Object.values(data.trajectorySummaries ?? {})) {
              for (const workspace of extractConversationWorkspaces(summary)) {
                const workspaceUri = workspace.workspaceFolderAbsoluteUri;
                if (!workspaceUri || workspaceMap.has(workspaceUri)) continue;
                if (!(await localFileWorkspaceExists(workspaceUri))) continue;
                workspaceMap.set(workspaceUri, {
                  workspaceUri,
                  source: "conversation",
                  ...(workspace.gitRootAbsoluteUri
                    ? { gitRootUri: workspace.gitRootAbsoluteUri }
                    : {}),
                });
              }
            }
          } catch {
            // Conversation summaries are a fallback for Antigravity 2.x hub LS.
          }
        }),
      );

      return c.json({
        homeDirPath,
        homeDirUri,
        workspaceInfos: Array.from(workspaceMap.values()),
      });
    } catch (err) {
      return handleRPCError(c, err);
    }
  });

  app.post("/api/workspaces", async (c) => {
    try {
      const body = await c.req.json<{ path?: unknown; name?: unknown }>();
      const folderPath = typeof body.path === "string" ? body.path.trim() : "";
      if (!folderPath) {
        return c.json({ error: "Path is required" }, 400);
      }
      if (!isAbsolute(folderPath)) {
        return c.json({ error: "Path must be absolute" }, 400);
      }

      const inst = await discovery.getInstance();
      if (!inst) {
        return c.json({ error: "No Language Server instance found" }, 503);
      }

      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : undefined;
      const workspace = await registerExistingLocalWorkspace(
        folderPath,
        inst,
        name,
      );
      if (!workspace) {
        return c.json({ error: "Path must be an existing directory" }, 400);
      }

      return c.json(
        { workspaceUri: workspace.workspaceUri, name: workspace.name },
        201,
      );
    } catch (err) {
      return handleRPCError(c, err);
    }
  });
}
