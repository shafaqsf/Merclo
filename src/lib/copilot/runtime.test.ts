import { describe, expect, it, vi } from "vitest";
import { runCopilotTurn } from "./runtime";

const fakeAgentFactory = () => ({}) as never;

function approval(callId: string, name: string, args: string) {
  return { rawItem: { callId, name, arguments: args } };
}

describe("runCopilotTurn", () => {
  it("returns a plain message when the run completes", async () => {
    const runFn = vi.fn(async () => ({
      finalOutput: "Here are your bots.",
      interruptions: [],
      state: { toString: () => "S", getInterruptions: () => [], approve() {}, reject() {} },
      history: [{ role: "assistant", content: "Here are your bots." }],
    }));

    const res = await runCopilotTurn({
      mode: "auto",
      priorItems: [],
      pendingState: null,
      turn: { kind: "message", text: "list my bots" },
      runFn,
      agentFactory: fakeAgentFactory,
    });

    expect(res.output).toEqual({ type: "message", content: "Here are your bots." });
    expect(res.pendingState).toBeNull();
    expect(res.items).toHaveLength(1);
  });

  it("returns approvals and persists state when the run interrupts", async () => {
    const interruptions = [approval("call_1", "delete_bot", '{"id":"b1"}')];
    const runFn = vi.fn(async () => ({
      finalOutput: undefined,
      interruptions,
      state: {
        toString: () => "SERIALIZED",
        getInterruptions: () => interruptions,
        approve() {},
        reject() {},
      },
      history: [],
    }));

    const res = await runCopilotTurn({
      mode: "accept",
      priorItems: [],
      pendingState: null,
      turn: { kind: "message", text: "delete bot b1" },
      runFn,
      agentFactory: fakeAgentFactory,
    });

    expect(res.output).toEqual({
      type: "approvals",
      pending: [{ approvalId: "call_1", toolName: "delete_bot", arguments: '{"id":"b1"}' }],
    });
    expect(res.pendingState).toBe("SERIALIZED");
  });

  it("resumes from a decision, approving the matching interruption", async () => {
    const approved: string[] = [];
    const interruptions = [approval("call_1", "delete_bot", '{"id":"b1"}')];
    const state = {
      toString: () => "S2",
      getInterruptions: () => interruptions,
      approve: (i: { rawItem?: { callId?: string } }) =>
        approved.push(i.rawItem!.callId!),
      reject() {},
    };
    // First call resolves the resumed run to a final message.
    const runFn = vi.fn(async () => ({
      finalOutput: "Deleted bot b1.",
      interruptions: [],
      state,
      history: [{ role: "assistant", content: "Deleted bot b1." }],
    }));

    // RunState.fromString is stubbed by the runtime seam: pass the state via a
    // fake deserializer through agentFactory-independent injection.
    const res = await runCopilotTurn({
      mode: "accept",
      priorItems: [],
      pendingState: "SERIALIZED",
      turn: {
        kind: "decision",
        decisions: [{ approvalId: "call_1", approve: true }],
      },
      runFn,
      agentFactory: fakeAgentFactory,
      // test-only injection of the deserialized state:
      deserializeState: async () => state,
    } as never);

    expect(approved).toEqual(["call_1"]);
    expect(res.output).toEqual({ type: "message", content: "Deleted bot b1." });
    expect(res.pendingState).toBeNull();
  });
});
