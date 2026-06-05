import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAutoApprovedCommandsForTests,
  maybeAutoApproveCommands,
} from "../auto-approve.js";

const eligibleStep = {
  status: "CORTEX_STEP_STATUS_WAITING",
  runCommand: {
    proposedCommandLine: "echo porta-auto-approve-poc",
  },
  metadata: {
    sourceTrajectoryStepInfo: {
      trajectoryId: "trajectory-1",
      stepIndex: 7,
    },
  },
};

describe("maybeAutoApproveCommands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearAutoApprovedCommandsForTests();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("does not approve commands when the env flag is disabled", async () => {
    const approve = vi.fn();

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).not.toHaveBeenCalled();
  });

  it("approves an eligible waiting command when the env flag is enabled", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).toHaveBeenCalledWith({
      cascadeId: "cascade-1",
      interaction: {
        trajectoryId: "trajectory-1",
        stepIndex: 7,
        permission: {
          allow: true,
        },
      },
    });
  });

  it("does not use env override when explicit default mode is provided", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands(
      "cascade-1",
      [eligibleStep],
      approve,
      "default",
    );

    expect(approve).not.toHaveBeenCalled();
  });

  it("approves when explicit full mode is provided without env flag", async () => {
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve, "full");

    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("ignores waiting steps that are not runCommand approvals", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands(
      "cascade-1",
      [
        {
          status: "CORTEX_STEP_STATUS_WAITING",
          userInput: { items: [{ text: "not a command" }] },
          metadata: {
            sourceTrajectoryStepInfo: {
              trajectoryId: "trajectory-1",
              stepIndex: 8,
            },
          },
        },
      ],
      approve,
    );

    expect(approve).not.toHaveBeenCalled();
  });

  it("does not approve the same command step twice", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);
    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("approves separate permission prompts on the same command step", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi.fn().mockResolvedValue(undefined);

    await maybeAutoApproveCommands(
      "cascade-1",
      [
        {
          ...eligibleStep,
          requestedInteraction: {
            permission: {
              resource: {
                action: "command",
                target: "curl -s http://localhost:3170/api/health",
              },
            },
          },
        },
      ],
      approve,
    );
    await maybeAutoApproveCommands(
      "cascade-1",
      [
        {
          ...eligibleStep,
          requestedInteraction: {
            permission: {
              resource: {
                action: "command",
                target: "jq .metadata",
              },
            },
          },
        },
      ],
      approve,
    );

    expect(approve).toHaveBeenCalledTimes(2);
  });

  it("retries a command step when the previous approval failed", async () => {
    vi.stubEnv("PORTA_AUTO_APPROVE_COMMANDS", "1");
    const approve = vi
      .fn()
      .mockRejectedValueOnce(new Error("LS unavailable"))
      .mockResolvedValueOnce(undefined);

    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);
    await maybeAutoApproveCommands("cascade-1", [eligibleStep], approve);

    expect(approve).toHaveBeenCalledTimes(2);
  });
});
