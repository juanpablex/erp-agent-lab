import { LocalToolClient } from "../src/core/client";
import { runTurn } from "../src/core/agent";
import { ILLUSTRATIVE_PRICING, SYSTEM_TOKENS, buildTrace, costOf, estimateTokens, summarize } from "../src/core/trace";

/** Checks the arithmetic behind the trace panel: tokens, cost and totals. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

assert(estimateTokens("abcd") === 1 && estimateTokens("abcde") === 2, "about 4 characters per token, rounded up");
assert(Math.abs(costOf({ input: 1_000_000, output: 1_000_000 }) - (ILLUSTRATIVE_PRICING.inputPerMillion + ILLUSTRATIVE_PRICING.outputPerMillion)) < 1e-9, "cost uses the illustrative pricing");

const client = new LocalToolClient();
const turn = await runTurn("Who has overdue invoices?", client);
assert(turn.steps.length === 1 && turn.steps[0]?.tool === "list_overdue_invoices", "overdue question calls one tool");
const first = buildTrace(0, "Who has overdue invoices?", turn, Date.now());
assert(first.tokens.input > SYSTEM_TOKENS, "input tokens include the system context and the tool result");
assert(first.costUsd > 0 && Math.abs(first.costUsd - costOf(first.tokens)) < 1e-12, "cost matches the token estimate");

const second = buildTrace(1, "hello", await runTurn("hello", client), Date.now());
assert(second.steps.length === 0, "a message with no intent calls no tools");

const sum = summarize([first, second]);
assert(sum.turns === 2 && sum.toolCalls === 1, "summary counts turns and tool calls");
assert(sum.tokens.input === first.tokens.input + second.tokens.input, "summary adds token totals");
console.log("OK: trace arithmetic");
