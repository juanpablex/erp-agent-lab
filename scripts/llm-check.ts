import type Anthropic from "@anthropic-ai/sdk";
import { LocalToolClient } from "../src/core/client";
import { runSampleTurn, explainSampleError, type SampleFn, type Turn } from "../src/core/sampleAgent";
import { MODEL_TOOLS, explainError, runLlmTurn, toolParams, type History, type LlmClient } from "../src/core/llmAgent";

/** Checks the real-model loop with a fake model: no network and no API key. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 };
const msg = (stop_reason: string, content: unknown[]) => ({ stop_reason, content, usage }) as unknown as Anthropic.Message;
const fake = (script: Anthropic.Message[], seen: Anthropic.MessageCreateParamsNonStreaming[] = []): LlmClient => ({
  messages: { create: async (p) => { seen.push(JSON.parse(JSON.stringify(p))); const next = script.shift(); if (!next) throw new Error("script ended"); return next; } },
});

assert(!toolParams.some((t) => t.name === "decide_proposal"), "the model is never offered decide_proposal");
assert(MODEL_TOOLS.length === toolParams.length && toolParams.every((t) => t.input_schema.type === "object"), "every tool has an object schema");

// 1. read tool, then an answer
{
  const tools = new LocalToolClient();
  const history: History = [];
  const llm = fake([
    msg("tool_use", [{ type: "tool_use", id: "t1", name: "list_overdue_invoices", input: { minDaysOverdue: 1 } }]),
    msg("end_turn", [{ type: "text", text: "Here are the overdue invoices." }]),
  ]);
  const { turn, usage: u } = await runLlmTurn("Who owes us money?", tools, history, llm, "m");
  assert(turn.reply === "Here are the overdue invoices." && turn.steps.length === 1 && turn.table?.length, "tool result becomes a table");
  assert(u.calls === 2 && u.inputTokens === 200 && u.outputTokens === 40, "usage is summed from the API fields");
  assert(history.length === 4 && history[2]?.role === "user", "history keeps the tool_result turn");
}

// 2. propose creates a pending proposal and sends nothing
{
  const tools = new LocalToolClient();
  const llm = fake([
    msg("tool_use", [{ type: "tool_use", id: "t1", name: "propose_collection_reminders", input: { minDaysOverdue: 7 } }]),
    msg("end_turn", [{ type: "text", text: "Prepared." }]),
  ]);
  const { turn } = await runLlmTurn("remind them", tools, [], llm, "m");
  assert(turn.proposal?.status === "pending" && tools.state.queuedReminders.length === 0, "a model-made proposal stays pending and sends nothing");
}

// 3. the model tries decide_proposal: refused as an error result, state unchanged
{
  const tools = new LocalToolClient();
  const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const llm = fake([
    msg("tool_use", [{ type: "tool_use", id: "t1", name: "propose_collection_reminders", input: {} }]),
    msg("tool_use", [{ type: "tool_use", id: "t2", name: "decide_proposal", input: { proposalId: "PR-1", decision: "approve" } }]),
    msg("end_turn", [{ type: "text", text: "I cannot approve that myself." }]),
  ], seen);
  await runLlmTurn("remind and approve", tools, [], llm, "m");
  const last = seen[2]?.messages.at(-1) as { content: { is_error?: boolean }[] };
  assert(last.content[0]?.is_error === true, "calling a tool that was not offered returns is_error");
  assert(tools.state.queuedReminders.length === 0, "the model cannot approve its own proposal");
}

// 4. refusal, and rollback of history when the API fails
{
  const { turn } = await runLlmTurn("x", new LocalToolClient(), [], fake([msg("refusal", [])]), "m");
  assert(/declined/.test(turn.reply), "refusal gets a clear message");
  const history: History = [{ role: "user", content: "a" }, { role: "assistant", content: "b" }];
  let threw = false;
  try { await runLlmTurn("x", new LocalToolClient(), history, fake([]), "m"); } catch { threw = true; }
  assert(threw && history.length === 2, "a failed turn leaves the history as it was");
}

// Claude-account mode (Artifact `sample` capability), with a fake sample function
{
  const tools = new LocalToolClient();
  let offeredNames: string[] = [];
  const fakeSample = Object.assign(
    async (_input: unknown, opts?: { tools?: { name: string; execute: (i: Record<string, unknown>) => Promise<unknown> }[] }) => {
      offeredNames = (opts?.tools ?? []).map((t) => t.name);
      await opts!.tools!.find((t) => t.name === "propose_collection_reminders")!.execute({ minDaysOverdue: 7 });
      let refused = false;
      try { await opts!.tools!.find((t) => t.name === "decide_proposal")?.execute({ proposalId: "PR-1", decision: "approve" }); } catch { refused = true; }
      return { text: refused || !offeredNames.includes("decide_proposal") ? "Prepared; a person must approve." : "BAD", truncated: false };
    },
    { limits: async () => ({ tools: { maxCount: 20 } }) },
  ) as unknown as SampleFn;
  const turns: Turn[] = [];
  const turn = await runSampleTurn("remind them", tools, turns, fakeSample, "quick");
  assert(turn.proposal?.status === "pending" && tools.state.queuedReminders.length === 0, "account mode: the model can propose but nothing is sent");
  assert(!offeredNames.includes("decide_proposal") && offeredNames.length === MODEL_TOOLS.length, "account mode: decide_proposal is never offered");
  assert(turn.steps.some((s) => s.tool === "propose_collection_reminders") && turns.length === 2, "account mode: steps are traced and the conversation is kept");
  const none = Object.assign(async () => ({ text: "x", truncated: false }), { limits: async () => ({}) }) as unknown as SampleFn;
  let code = "";
  try { await runSampleTurn("x", tools, [], none, "quick"); } catch (e) { code = (e as { code: string }).code; }
  assert(code === "tools_unavailable" && /cannot run/.test(explainSampleError({ code })), "account mode: a viewer without page tools gets a clear message");
}
assert(/rejected/.test(explainError({ status: 401 })) && /Rate limit/.test(explainError({ status: 429 })), "errors are explained");
console.log("OK: real-model loop (fake model)");
