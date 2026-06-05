type ApproveCommandRequest = {
  cascadeId: string;
  interaction: {
    trajectoryId: string;
    stepIndex: number;
    permission: {
      allow: true;
    };
  };
};

type ApproveCommand = (request: ApproveCommandRequest) => Promise<unknown>;

export type PermissionMode = "default" | "full";

const approvedCommandKeys = new Set<string>();

export function clearAutoApprovedCommandsForTests(): void {
  approvedCommandKeys.clear();
}

function shouldAutoApproveCommands(mode?: PermissionMode): boolean {
  if (mode) return mode === "full";
  return process.env.PORTA_AUTO_APPROVE_COMMANDS === "1";
}

export function permissionModeFromQuery(
  value: string | null | undefined,
): PermissionMode | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "full") return "full";
  return "default";
}

export function isAutoApproveCommandsEnabled(): boolean {
  return shouldAutoApproveCommands();
}

function commandText(runCommand: Record<string, unknown>): string {
  for (const key of ["proposedCommandLine", "commandLine", "command"]) {
    const value = runCommand[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "(unknown command)";
}

function requestedPermissionResourceKey(step: Record<string, unknown>): string {
  const requestedInteraction = step.requestedInteraction;
  if (!requestedInteraction || typeof requestedInteraction !== "object") {
    return "permission";
  }

  const permission = (requestedInteraction as Record<string, unknown>).permission;
  if (!permission || typeof permission !== "object") return "permission";

  const resource = (permission as Record<string, unknown>).resource;
  if (!resource || typeof resource !== "object") return "permission";

  const action = (resource as Record<string, unknown>).action;
  const target = (resource as Record<string, unknown>).target;
  if (typeof action !== "string" || typeof target !== "string") {
    return "permission";
  }

  return `${action}:${target}`;
}

function approvalCandidate(
  cascadeId: string,
  step: unknown,
): { key: string; request: ApproveCommandRequest; command: string } | undefined {
  if (!step || typeof step !== "object") return undefined;
  const record = step as Record<string, unknown>;
  if (record.status !== "CORTEX_STEP_STATUS_WAITING") return undefined;
  if (!record.runCommand || typeof record.runCommand !== "object") {
    return undefined;
  }

  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;
  const sourceInfo = (metadata as Record<string, unknown>)
    .sourceTrajectoryStepInfo;
  if (!sourceInfo || typeof sourceInfo !== "object") return undefined;

  const trajectoryId = (sourceInfo as Record<string, unknown>).trajectoryId;
  const stepIndex = (sourceInfo as Record<string, unknown>).stepIndex;
  if (typeof trajectoryId !== "string" || trajectoryId.length === 0) {
    return undefined;
  }
  if (typeof stepIndex !== "number") return undefined;

  const permissionKey = requestedPermissionResourceKey(record);
  const key = `${cascadeId}:${trajectoryId}:${stepIndex}:${permissionKey}`;
  return {
    key,
    command: commandText(record.runCommand as Record<string, unknown>),
    request: {
      cascadeId,
      interaction: {
        trajectoryId,
        stepIndex,
        permission: {
          allow: true,
        },
      },
    },
  };
}

export async function maybeAutoApproveCommands(
  cascadeId: string,
  steps: unknown[],
  approve: ApproveCommand,
  permissionMode?: PermissionMode,
): Promise<void> {
  if (!shouldAutoApproveCommands(permissionMode)) return;

  for (const step of steps) {
    const candidate = approvalCandidate(cascadeId, step);
    if (!candidate) continue;
    if (approvedCommandKeys.has(candidate.key)) continue;

    try {
      await approve(candidate.request);
      approvedCommandKeys.add(candidate.key);
      console.log(
        `[auto-approve] approved command ${candidate.key}: ${candidate.command}`,
      );
    } catch (err) {
      console.error(
        `[auto-approve] failed command ${candidate.key}: ${String(err)}`,
      );
    }
  }
}
