/**
 * Shared metadata and disk-scanning utilities for the proxy.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ConversationWorkspaceMetadata {
  workspaceFolderAbsoluteUri?: string;
  gitRootAbsoluteUri?: string;
  repository?: {
    computedName?: string;
    gitOriginUrl?: string;
  };
  branchName?: string;
}

export interface DiskConversationMetadata {
  id: string;
  mtime: string;
  title?: string;
  workspaceUris?: string[];
}

const CONVERSATIONS_DIR = join(
  homedir(),
  ".gemini",
  "antigravity",
  "conversations",
);

/**
 * Build the metadata object that the LS requires on write RPCs.
 * Mirrors what the VS Code extension sends via MetadataProvider.
 */
export async function getMetadata(
  fileAccessGranted = false,
): Promise<Record<string, unknown>> {
  const meta: Record<string, unknown> = {
    ideName: "porta",
    ideVersion: "0.1.0",
    extensionVersion: "0.1.0",
  };
  if (fileAccessGranted) {
    meta.allowFileAccess = true;
    meta.allWorkspaceTrustGranted = true;
  }
  return meta;
}

export function extractFileWorkspaceUrisFromBuffer(buffer: Buffer): string[] {
  const text = buffer.toString("utf8");
  const matches = text.match(/file:\/\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g);
  if (!matches) return [];
  return [...new Set(matches)];
}

function isPlausibleDiskTitle(value: string): boolean {
  const text = cleanDiskTitle(value);
  if (text.length < 4 || text.length > 160) return false;
  if (text.startsWith("@")) return false;
  if (text.startsWith("#")) return false;
  if (text.startsWith("<")) return false;
  if (text.startsWith("- ")) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/file:\/\//i.test(text)) return false;
  if (/[0-9a-f]{8}-[0-9a-f]{4}/i.test(text)) return false;
  if (/^(CREATE|table|index|sqlite|[A-Za-z]?main$)/i.test(text)) return false;
  if (/^-?table/i.test(text)) return false;
  if (
    /(battle_mode_infos|trajectory_metadata_blob|executor_metadata|gen_metadata|idx_steps|steps_status|steps_step_type|tablesteps|stepssteps)/i.test(text)
  ) {
    return false;
  }
  if (/^(Conversation History|Here are the conversation IDs)/i.test(text)) {
    return false;
  }
  if (/^(USER Objective|System Prompt|Chat Messages|Tools)$/i.test(text)) {
    return false;
  }
  if (/^\{.*\}$/.test(text)) return false;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text)) return false;
  if (!/\s/.test(text)) return false;
  return /[A-Za-z]/.test(text);
}

function cleanDiskTitle(value: string): string {
  const text = value.trim().replace(/["'`]+$/, "");
  return text.replace(/^[A-Z](?=[A-Z][a-z])/, "");
}

export function extractDiskConversationTitleFromBuffer(
  buffer: Buffer,
): string | undefined {
  const text = buffer.toString("utf8");
  const matches = text.match(/[\x20-\x7E]{4,}/g);
  if (!matches) return undefined;

  for (const match of matches) {
    const title = cleanDiskTitle(match);
    if (isPlausibleDiskTitle(title)) return title;
  }
  return undefined;
}

function diskConversationIdForFile(file: string): string | undefined {
  if (file.endsWith(".db-wal")) return file.slice(0, -".db-wal".length);
  if (file.endsWith(".db")) return file.slice(0, -".db".length);
  if (file.endsWith(".pb")) return file.slice(0, -".pb".length);
  return undefined;
}

/** Scan disk for conversation files not loaded in memory */
export async function scanDiskConversations(): Promise<DiskConversationMetadata[]> {
  try {
    const files = await readdir(CONVERSATIONS_DIR);
    const results = new Map<string, DiskConversationMetadata>();
    for (const file of files) {
      const id = diskConversationIdForFile(file);
      if (!id) continue;
      try {
        const path = join(CONVERSATIONS_DIR, file);
        const s = await stat(path);
        let workspaceUris: string[] | undefined;
        let title: string | undefined;
        try {
          const buffer = await readFile(path);
          workspaceUris = extractFileWorkspaceUrisFromBuffer(buffer);
          title = extractDiskConversationTitleFromBuffer(buffer);
        } catch {
          workspaceUris = undefined;
          title = undefined;
        }

        const existing = results.get(id);
        const nextWorkspaceUris =
          workspaceUris && workspaceUris.length > 0
            ? [
                ...new Set([
                  ...(existing?.workspaceUris ?? []),
                  ...workspaceUris,
                ]),
              ]
            : existing?.workspaceUris;
        const nextTitle = existing?.title ?? title;
        if (
          !existing ||
          new Date(s.mtime).getTime() > new Date(existing.mtime).getTime()
        ) {
          results.set(id, {
            id,
            mtime: s.mtime.toISOString(),
            ...(nextTitle ? { title: nextTitle } : {}),
            ...(nextWorkspaceUris && nextWorkspaceUris.length > 0
              ? { workspaceUris: nextWorkspaceUris }
              : {}),
          });
        } else if (
          (nextWorkspaceUris && nextWorkspaceUris.length > 0) ||
          nextTitle
        ) {
          results.set(id, {
            ...existing,
            ...(nextTitle ? { title: nextTitle } : {}),
            ...(nextWorkspaceUris && nextWorkspaceUris.length > 0
              ? { workspaceUris: nextWorkspaceUris }
              : {}),
          });
        }
      } catch {
        results.set(id, { id, mtime: new Date().toISOString() });
      }
    }
    return [...results.values()];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function workspaceArray(value: unknown): ConversationWorkspaceMetadata[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((workspace) => ({
    ...(typeof workspace.workspaceFolderAbsoluteUri === "string"
      ? { workspaceFolderAbsoluteUri: workspace.workspaceFolderAbsoluteUri }
      : {}),
    ...(typeof workspace.gitRootAbsoluteUri === "string"
      ? { gitRootAbsoluteUri: workspace.gitRootAbsoluteUri }
      : {}),
    ...(isRecord(workspace.repository)
      ? {
          repository: {
            ...(typeof workspace.repository.computedName === "string"
              ? { computedName: workspace.repository.computedName }
              : {}),
            ...(typeof workspace.repository.gitOriginUrl === "string"
              ? { gitOriginUrl: workspace.repository.gitOriginUrl }
              : {}),
          },
        }
      : {}),
    ...(typeof workspace.branchName === "string"
      ? { branchName: workspace.branchName }
      : {}),
  }));
}

/**
 * Extract workspace metadata from a conversation summary.
 *
 * Antigravity 1.x exposed this at `summary.workspaces`. Antigravity 2.x still
 * exposes that for loaded conversations, but also mirrors it under
 * `summary.trajectoryMetadata.workspaces` and may only expose URI strings in
 * `summary.trajectoryMetadata.workspaceUris`.
 */
export function extractConversationWorkspaces(
  summary: unknown,
): ConversationWorkspaceMetadata[] {
  if (!isRecord(summary)) return [];

  const topLevel = workspaceArray(summary.workspaces);
  if (topLevel.length > 0) return topLevel;

  const trajectoryMetadata = summary.trajectoryMetadata;
  if (!isRecord(trajectoryMetadata)) return [];

  const metadataWorkspaces = workspaceArray(trajectoryMetadata.workspaces);
  if (metadataWorkspaces.length > 0) return metadataWorkspaces;

  if (!Array.isArray(trajectoryMetadata.workspaceUris)) return [];
  return trajectoryMetadata.workspaceUris
    .filter((uri): uri is string => typeof uri === "string")
    .map((uri) => ({ workspaceFolderAbsoluteUri: uri }));
}

export function getPrimaryWorkspaceUri(summary: unknown): string | undefined {
  return extractConversationWorkspaces(summary)[0]?.workspaceFolderAbsoluteUri;
}

export function withNormalizedConversationWorkspaces<T extends Record<string, unknown>>(
  summary: T,
): T {
  if (Array.isArray(summary.workspaces) && summary.workspaces.length > 0) {
    return summary;
  }

  const workspaces = extractConversationWorkspaces(summary);
  if (workspaces.length === 0) return summary;
  return { ...summary, workspaces };
}
