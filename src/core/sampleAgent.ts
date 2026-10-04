import { call, HELP, type AgentTurn, type TraceStep } from "./agent";
import type { ToolClient } from "./client";
import { MODEL_TOOLS, SYSTEM, TABLE_KEYS, toolParams } from "./llmAgent";
import type { Proposal } from "./state";

/**
 * Real-model mode for the claude.ai Artifact: the page asks Claude through the viewer's own Claude account
 * (the `sample` capability), so no API key is involved and the viewer's own usage pays. The model gets the same
 * tools as the API-key mode (read and propose only, never decide_proposal), running here in the page.
 * Outside an Artifact `window.claude` does not exist and this mode is simply unavailable.
 */
export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute(input: Record<string, unknown>): unknown;
}
export interface SampleOptions {
  tools?: SampleTool[];
  modelTier?: Tier;
}
export interface SampleFn {
  (input: string | Turn[], options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  limits?: () => Promise<{ tools?: { maxCount: number } }>;
}
export type Turn = { role: "user" | "assistant"; content: string };
export type Tier = "quick" | "default" | "complex";

export const TIERS: { id: Tier; label: string }[] = [
  { id: "quick", label: "Quick (fastest)" },
  { id: "default", label: "Balanced" },
  { id: "complex", label: "Thorough (slowest)" },
];

let cached: Promise<SampleFn | null> | undefined;

/** Resolves the `sample` function, or null when this page is not running inside a Claude viewer. */
export function getSample(): Promise<SampleFn | null> {
  cached ??= (async () => {
    const c = (globalThis as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
    if (!c?.use) return null;
    try {
      return ((await c.use("sample")) as SampleFn | null) ?? null;
    } catch {
      return null;
    }
  })();
  return cached;
}

export function explainSampleError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case "not_granted": return "Claude was not allowed for this page. Allow it when the permission window appears to use the real model.";
    case "sampling_disabled": return "Claude is not available for this account or organization.";
    case "session_expired": return "Your Claude session expired. Sign in again and retry.";
    case "rate_limited": return "Claude usage limit reached. Wait a while and try again.";
    case "refused": return "The model declined to answer that request.";
    case "empty_completion": return "The model gave no answer. Try asking in a different way.";
    case "tools_unavailable": return "This viewer cannot run the page's tools, so the real model cannot read the data here.";
    case "prompt_too_large": return "The conversation got too long. Reload the page to start again.";
    default: return `Claude could not answer (${code ?? "unknown error"}). Try again.`;
  }
}

const MAX_TURNS = 10;

/** One chat turn answered through the viewer's Claude account, with the same tools as the API-key mode. */
export async function runSampleTurn(prompt: string, tools: ToolClient, turns: Turn[], sample: SampleFn, tier: Tier): Promise<AgentTurn> {
  const limits = await sample.limits?.().catch(() => undefined);
  if (!limits?.tools) throw Object.assign(new Error("tools unavailable"), { code: "tools_unavailable" });
  const t0 = performance.now();
  const steps: TraceStep[] = [];
  let table: AgentTurn["table"];
  let proposal: Proposal | undefined;
  const offered: SampleTool[] = toolParams.slice(0, limits.tools.maxCount).map((p) => ({
    name: p.name,
    description: p.description ?? "",
    inputSchema: p.input_schema as Record<string, unknown>,
    execute: async (input) => {
      if (!MODEL_TOOLS.some((t) => t.name === p.name)) throw new Error(`Unknown tool: ${p.name}`);
      const result = await call(tools, steps, t0, p.name, input);
      const rec = result as Record<string, unknown>;
      for (const k of TABLE_KEYS) if (Array.isArray(rec?.[k])) table = rec[k] as AgentTurn["table"];
      if (rec && typeof rec === "object" && rec.kind === "collection_reminders") proposal = result as Proposal;
      return result;
    },
  }));
  const next: Turn[] = [...turns, { role: "user", content: prompt } as Turn].slice(-MAX_TURNS);
  const { text } = await sample([{ role: "user", content: SYSTEM }, ...next], { tools: offered, modelTier: tier });
  turns.splice(0, turns.length, ...next, { role: "assistant", content: text });
  return { durationMs: Math.round((performance.now() - t0) * 10) / 10, steps, reply: text || HELP, table, proposal };
}
