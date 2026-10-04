import type { ToolClient } from "./client";
import { findTool, type ToolKind } from "./tools";
import type { Proposal } from "./state";

export interface TraceStep {
  id: number;
  tool: string;
  kind: ToolKind | "human";
  args: Record<string, unknown>;
  ok: boolean;
  /** Milliseconds since the start of the turn when the call began. */
  startMs: number;
  durationMs: number;
  /** Size of the full JSON result, used to estimate tokens. */
  resultChars: number;
  preview: string;
}

export interface AgentTurn {
  durationMs: number;
  steps: TraceStep[];
  reply: string;
  table?: Record<string, string | number>[];
  chart?: { title: string; items: { label: string; value: number }[] };
  proposal?: Proposal;
}

let stepSeq = 1;

async function call(client: ToolClient, steps: TraceStep[], t0: number, tool: string, args: Record<string, unknown>): Promise<any> {
  const started = performance.now();
  const base = { id: stepSeq++, tool, kind: (findTool(tool)?.kind ?? "read") as ToolKind, args, startMs: Math.round((started - t0) * 10) / 10 };
  try {
    const result = await client.callTool(tool, args);
    const json = JSON.stringify(result);
    steps.push({ ...base, ok: true, durationMs: Math.round((performance.now() - started) * 10) / 10, resultChars: json.length, preview: json.slice(0, 160) });
    return result;
  } catch (err) {
    steps.push({ ...base, ok: false, durationMs: Math.round((performance.now() - started) * 10) / 10, resultChars: 0, preview: String(err) });
    throw err;
  }
}

export const HELP =
  "I can look at overdue invoices, sales, coffee inventory and orders, and I can prepare payment reminders for your approval. Try: \"Who has overdue invoices?\", \"Remind customers who owe us money\", \"Sales in the last 30 days\" or \"What is below reorder level?\".";

function daysFrom(prompt: string, fallback: number): number {
  const m = /(\d{1,3})\s*(day|d\b)/i.exec(prompt);
  if (m) return Math.min(Number(m[1]), 120);
  if (/week/i.test(prompt)) return 7;
  if (/month/i.test(prompt)) return 30;
  return fallback;
}

/**
 * A scripted agent: it reads the intent of the message with simple rules and calls
 * the tools in a fixed order. It is NOT a language model. It exists to exercise the
 * tool layer, the approval flow and the trace viewer without any API cost, and it
 * exposes the same ToolClient interface a real model-driven loop would use.
 */
export async function runTurn(prompt: string, client: ToolClient): Promise<AgentTurn> {
  const t0 = performance.now();
  const turn = await plan(prompt, client, t0);
  return { ...turn, durationMs: Math.round((performance.now() - t0) * 10) / 10 };
}

async function plan(prompt: string, client: ToolClient, t0: number): Promise<Omit<AgentTurn, "durationMs">> {
  const steps: TraceStep[] = [];
  const t = prompt.toLowerCase();

  if (/remind|chase|follow.?up|nudge|dun/.test(t)) {
    const overdue = await call(client, steps, t0, "list_overdue_invoices", { minDaysOverdue: 7, limit: 5 });
    if (overdue.total === 0) return { steps, reply: "There are no invoices more than 7 days overdue, so there is nothing to send." };
    const proposal = (await call(client, steps, t0, "propose_collection_reminders", { minDaysOverdue: 7 })) as Proposal;
    return {
      steps,
      proposal,
      reply: `I found ${overdue.total} invoices more than 7 days overdue (${overdue.totalAmount.toLocaleString("en-US")} in total). I prepared reminder emails, but nothing is sent until you approve.`,
    };
  }

  if (/overdue|unpaid|owe|late|invoice|receivable/.test(t)) {
    const res = await call(client, steps, t0, "list_overdue_invoices", { minDaysOverdue: 1, limit: 10 });
    return {
      steps,
      reply: `${res.total} invoices are overdue, ${res.totalAmount.toLocaleString("en-US")} in total. The oldest ones:`,
      table: res.invoices,
    };
  }

  if (/sale|revenue|sold|best.?sell/.test(t)) {
    const days = daysFrom(t, 30);
    const res = await call(client, steps, t0, "get_sales_summary", { days });
    return {
      steps,
      reply: `In the last ${res.days} days there were ${res.orders} orders worth ${res.revenue.toLocaleString("en-US")} (average ${res.averageOrder.toLocaleString("en-US")}).`,
      chart: { title: "Best sellers (kg)", items: res.topProducts.map((p: any) => ({ label: `${p.product} (${p.origin})`, value: p.kg })) },
      table: res.topProducts,
    };
  }

  if (/stock|inventory|reorder|beans|running low/.test(t)) {
    const res = await call(client, steps, t0, "check_inventory", { belowReorderOnly: true });
    return {
      steps,
      reply: res.total ? `${res.total} coffees are below their reorder level:` : "Every coffee is above its reorder level.",
      table: res.items,
    };
  }

  if (/order/.test(t)) {
    const res = await call(client, steps, t0, "list_orders", { days: daysFrom(t, 14), limit: 8 });
    return { steps, reply: `${res.total} orders in the period. The most recent:`, table: res.orders };
  }

  return { steps, reply: HELP };
}
