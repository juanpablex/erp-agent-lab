import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { call, HELP, type AgentTurn, type TraceStep } from "./agent";
import type { ToolClient } from "./client";
import { TOOLS } from "./tools";
import type { Proposal } from "./state";

/**
 * Optional real-model mode. A language model drives the same tools through the same ToolClient.
 * The model is only offered read and propose tools: decide_proposal is NOT exposed, so it can
 * prepare a change but only a person clicking Approve can apply it.
 */
export const MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (cheapest)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (most capable, costs more)" },
] as const;
export const DEFAULT_MODEL: string = MODELS[0].id;

export const SYSTEM =
  "You are the operations agent of Kettle Hill Roasters, a fictional coffee roastery. Answer questions about invoices, sales, coffee inventory and orders using the provided tools, and never invent numbers. " +
  "You can prepare payment reminders with propose_collection_reminders, but that only creates a proposal: tell the user a person must approve it in the card shown below your answer, and never claim reminders were sent. " +
  "Be concise. Amounts have no currency symbol.";

/** The subset of the SDK the loop needs, so tests can pass a fake. */
export interface LlmClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

export interface LlmUsage {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export type History = Anthropic.MessageParam[];

/** Tools the model may call: everything except the human-only write path. */
export const MODEL_TOOLS = TOOLS.filter((t) => t.kind !== "write");

export const toolParams: Anthropic.Tool[] = MODEL_TOOLS.map((t) => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(z.object(t.shape)) as Record<string, unknown>;
  return { name: t.name, description: t.description, input_schema: schema as Anthropic.Tool.InputSchema };
});

const MAX_ITERATIONS = 6;

export const TABLE_KEYS = ["invoices", "orders", "items", "topProducts"];

/** Turns an SDK error into a message a visitor can act on. */
export function explainError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 401) return "The API key was rejected. Check that you pasted the whole key.";
  if (status === 403) return "This key is not allowed to use that model.";
  if (status === 404) return "That model was not found for this key. Pick another one.";
  if (status === 429) return "Rate limit reached. Wait a moment and try again.";
  if (status === 400 && /credit|balance/i.test(String((err as Error).message))) return "The account behind this key has no API credit left.";
  if (status === 529 || (status !== undefined && status >= 500)) return "The API is overloaded or unavailable. Try again shortly.";
  if (status === undefined) return "Could not reach the API. Check your connection.";
  return `The API returned an error (${status}).`;
}

export async function runLlmTurn(
  prompt: string,
  tools: ToolClient,
  history: History,
  llm: LlmClient,
  model: string,
): Promise<{ turn: AgentTurn; usage: LlmUsage }> {
  const t0 = performance.now();
  const steps: TraceStep[] = [];
  const usage: LlmUsage = { model, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const rollbackTo = history.length;
  let table: AgentTurn["table"];
  let proposal: Proposal | undefined;
  let reply = "";

  history.push({ role: "user", content: prompt });
  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await llm.messages.create({ model, max_tokens: 4096, system: SYSTEM, tools: toolParams, messages: history });
      usage.calls += 1;
      usage.inputTokens += res.usage.input_tokens;
      usage.outputTokens += res.usage.output_tokens;
      usage.cacheReadTokens += res.usage.cache_read_input_tokens ?? 0;
      // Echo the full content back (thinking blocks included) so the conversation stays valid.
      history.push({ role: "assistant", content: res.content });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();

      if (res.stop_reason === "refusal") { reply = "The model declined to answer that request."; break; }
      if (res.stop_reason === "max_tokens") { reply = text || "The answer was cut off. Try a more specific question."; break; }
      if (res.stop_reason !== "tool_use") { reply = text || HELP; break; }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const args = (block.input ?? {}) as Record<string, unknown>;
        try {
          if (!MODEL_TOOLS.some((t) => t.name === block.name)) throw new Error(`Unknown tool: ${block.name}`);
          const result = await call(tools, steps, t0, block.name, args);
          const rec = result as Record<string, unknown>;
          for (const k of TABLE_KEYS) if (Array.isArray(rec?.[k])) table = rec[k] as AgentTurn["table"];
          if (rec && typeof rec === "object" && rec.kind === "collection_reminders") proposal = result as Proposal;
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: err instanceof Error ? err.message : String(err), is_error: true });
        }
      }
      history.push({ role: "user", content: results });
      if (i === MAX_ITERATIONS - 1) reply = "I stopped after too many tool calls. Try a simpler question.";
    }
  } catch (err) {
    history.length = rollbackTo; // do not keep a half-finished turn in the conversation
    throw err;
  }
  return { turn: { durationMs: Math.round((performance.now() - t0) * 10) / 10, steps, reply, table, proposal }, usage };
}
