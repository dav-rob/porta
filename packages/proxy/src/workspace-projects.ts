import { stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LSInstance } from "./discovery.js";
import { RPCError } from "./rpc.js";
import { discovery, rpc } from "./routing.js";

export function localPathToWorkspaceUri(folderPath: string): string {
  return pathToFileURL(folderPath).href;
}

export function workspaceUriToLocalPath(workspaceUri: string): string | undefined {
  if (!workspaceUri.startsWith("file://")) return undefined;
  try {
    return fileURLToPath(workspaceUri);
  } catch {
    return undefined;
  }
}

export async function localDirectoryExists(folderPath: string): Promise<boolean> {
  try {
    return (await stat(folderPath)).isDirectory();
  } catch {
    return false;
  }
}

export async function registerExistingLocalWorkspace(
  folderPath: string,
  inst?: LSInstance,
  projectName?: string,
): Promise<{ workspaceUri: string; name: string; instance: LSInstance } | undefined> {
  if (!isAbsolute(folderPath)) return undefined;
  if (!(await localDirectoryExists(folderPath))) return undefined;

  const instance = inst ?? (await discovery.getInstance());
  if (!instance) return undefined;

  const workspaceUri = localPathToWorkspaceUri(folderPath);
  const name = projectName?.trim() || basename(folderPath);

  await rpc.call("ValidateProject", { location: workspaceUri }, instance);
  try {
    await rpc.call(
      "CreateProject",
      {
        project: {
          name,
          projectResources: {
            resources: [
              {
                gitFolder: {
                  folderUri: workspaceUri,
                  allowWrite: true,
                },
              },
            ],
          },
        },
      },
      instance,
    );
  } catch (err) {
    if (!(err instanceof RPCError) || err.code !== "already_exists") {
      throw err;
    }
  }

  await rpc.call(
    "AddTrackedWorkspace",
    {
      workspace: folderPath,
      isPassiveWorkspace: true,
    },
    instance,
  );

  return { workspaceUri, name, instance };
}
