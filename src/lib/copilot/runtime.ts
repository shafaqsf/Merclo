/**
 * Orchestrates one copilot turn on top of the Agents SDK `run()` loop.
 *
 * Two entry shapes:
 *  - message: run the agent on prior history + the new user message.
 *  - decision: rehydrate the saved RunState, apply approve/reject per the
 *    user's choices, and resume the run.
 *
 * `runFn`, `agentFactory`, and `deserializeState` are injectable seams so this
 * is unit-testable without a live model.
 */
import { run, RunState, type Agent } from "@openai/agents";
import { buildCopilotAgent } from "./agent";
import type { CopilotMode } from "@/lib/db/copilot-conversations";

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  arguments: string;
}

export type CopilotTurnOutput =
  | { type: "message"; content: string }
  | { type: "approvals"; pending: PendingApproval[] };

interface ApprovalLike {
  rawItem?: { name?: string; arguments?: string; callId?: string };
}
interface StateLike {
  toString(): string;
  getInterruptions(): ApprovalLike[];
  approve(i: ApprovalLike): void;
  reject(i: ApprovalLike): void;
}
interface RunLike {
  finalOutput?: unknown;
  interruptions?: ApprovalLike[];
  state: StateLike;
  history: unknown[];
}

export type RunFn = (agent: Agent, input: unknown) => Promise<RunLike>;

export interface CopilotTurnInput {
  mode: CopilotMode;
  priorItems: unknown[];
  pendingState: string | null;
  turn:
    | { kind: "message"; text: string }
    | { kind: "decision"; decisions: { approvalId: string; approve: boolean }[] };
  runFn?: RunFn;
  agentFactory?: (mode: CopilotMode) => Agent;
  /** Test-only seam; defaults to RunState.fromString. */
  deserializeState?: (agent: Agent, str: string) => Promise<StateLike>;
}

export interface CopilotTurnResult {
  output: CopilotTurnOutput;
  items: unknown[];
  pendingState: string | null;
}

const approvalId = (i: ApprovalLike): string => i.rawItem?.callId ?? "";

function toPending(interruptions: ApprovalLike[]): PendingApproval[] {
  return interruptions.map((i) => ({
    approvalId: approvalId(i),
    toolName: i.rawItem?.name ?? "unknown",
    arguments: i.rawItem?.arguments ?? "{}",
  }));
}

function summarize(result: RunLike): CopilotTurnResult {
  const interruptions = result.interruptions ?? [];
  if (interruptions.length > 0) {
    return {
      output: { type: "approvals", pending: toPending(interruptions) },
      items: result.history,
      pendingState: result.state.toString(),
    };
  }
  return {
    output: {
      type: "message",
      content:
        typeof result.finalOutput === "string"
          ? result.finalOutput
          : JSON.stringify(result.finalOutput ?? ""),
    },
    items: result.history,
    pendingState: null,
  };
}

export async function runCopilotTurn(
  input: CopilotTurnInput
): Promise<CopilotTurnResult> {
  const runFn = input.runFn ?? (run as unknown as RunFn);
  const makeAgent = input.agentFactory ?? ((mode) => buildCopilotAgent({ mode }));
  const deserialize =
    input.deserializeState ??
    ((agent, str) =>
      RunState.fromString(agent as never, str) as unknown as Promise<StateLike>);

  const agent = makeAgent(input.mode);

  if (input.turn.kind === "message") {
    const messages = [
      ...input.priorItems,
      { role: "user", content: input.turn.text },
    ];
    const result = await runFn(agent, messages);
    return summarize(result);
  }

  // decision: rehydrate, apply approvals, resume.
  if (!input.pendingState) {
    throw new Error("No pending approval state to resume.");
  }
  const state = await deserialize(agent, input.pendingState);
  const byId = new Map(input.turn.decisions.map((d) => [d.approvalId, d.approve]));
  for (const item of state.getInterruptions()) {
    const decision = byId.get(approvalId(item));
    if (decision === true) state.approve(item);
    else if (decision === false) state.reject(item);
  }
  const result = await runFn(agent, state);
  return summarize(result);
}
