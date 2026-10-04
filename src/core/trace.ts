import type { AgentTurn, TraceStep } from "./agent";
import { TOOLS } from "./tools";

/**
 * Pricing used to turn token estimates into a cost. These numbers are ILLUSTRATIVE:
 * they do not belong to any real model or provider. The agent in this demo is
 * scripted, so tokens and cost are simulated to show what a trace panel reports.
 */
export const ILLUSTRATIVE_PRICING = { inputPerMillion: 1, outputPerMillion: 5 };

/** Rough rule of thumb: about 4 characters per token. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** Tokens a model would receive as fixed context: instructions plus the tool definitions. */
export const SYSTEM_TOKENS =
  220 + TOOLS.reduce((sum, t) => sum + estimateTokens(`${t.name} ${t.description} ${Object.keys(t.shape).join(" ")}`) + 40, 0);

export interface TurnTrace {
  index: number;
  prompt: string;
  startedAt: number;
  durationMs: number;
  steps: TraceStep[];
  tokens: { input: number; output: number };
  costUsd: number;
  /** How long the turn waited for a human decision, when it had an approval step. */
  humanWaitMs?: number;
}

export function costOf(tokens: { input: number; output: number }): number {
  return (tokens.input * ILLUSTRATIVE_PRICING.inputPerMillion + tokens.output * ILLUSTRATIVE_PRICING.outputPerMillion) / 1_000_000;
}

export function buildTrace(index: number, prompt: string, turn: AgentTurn, startedAt: number): TurnTrace {
  let input = SYSTEM_TOKENS + estimateTokens(prompt);
  let output = estimateTokens(turn.reply);
  for (const s of turn.steps) {
    output += estimateTokens(JSON.stringify(s.args)) + 12;
    input += Math.ceil(s.resultChars / 4);
  }
  const tokens = { input, output };
  return { index, prompt, startedAt, durationMs: turn.durationMs, steps: turn.steps, tokens, costUsd: costOf(tokens) };
}

/** Adds the human decision (and how long the person took) to a turn that was waiting for approval. */
export function withDecision(trace: TurnTrace, step: TraceStep, humanWaitMs: number): TurnTrace {
  return { ...trace, steps: [...trace.steps, step], humanWaitMs };
}

export interface ConversationSummary {
  turns: number;
  toolCalls: number;
  failedCalls: number;
  tokens: { input: number; output: number };
  costUsd: number;
  humanWaitMs: number;
}

export function summarize(traces: TurnTrace[]): ConversationSummary {
  const steps = traces.flatMap((t) => t.steps);
  const tokens = traces.reduce((a, t) => ({ input: a.input + t.tokens.input, output: a.output + t.tokens.output }), { input: 0, output: 0 });
  return {
    turns: traces.length,
    toolCalls: steps.length,
    failedCalls: steps.filter((s) => !s.ok).length,
    tokens,
    costUsd: traces.reduce((a, t) => a + t.costUsd, 0),
    humanWaitMs: traces.reduce((a, t) => a + (t.humanWaitMs ?? 0), 0),
  };
}
