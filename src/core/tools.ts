import { z } from "zod";
import { daysBetween, isoDaysAgo } from "./data";
import type { ErpState, Proposal, ReminderRecipient } from "./state";

/**
 * Tool registry shared by the MCP server and the browser demo. Read tools only
 * look at the data. The single write path is decide_proposal: agents can only
 * PROPOSE changes (propose_*), and nothing is executed until a human approves.
 */
export type ToolKind = "read" | "propose" | "write";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  shape: z.ZodRawShape;
  run: (state: ErpState, args: Record<string, unknown>) => unknown;
}

const money = (n: number) => Math.round(n * 100) / 100;

interface OverdueRow {
  invoice: string;
  customerId: string;
  customer: string;
  email: string;
  amount: number;
  due: string;
  daysOverdue: number;
}

function overdueInvoices(state: ErpState, minDaysOverdue: number): OverdueRow[] {
  const customers = new Map(state.data.customers.map((c) => [c.id, c]));
  return state.data.invoices
    .filter((i) => !i.paid)
    .map((i) => {
      const c = customers.get(i.customerId);
      return {
        invoice: i.id,
        customerId: i.customerId,
        customer: c?.name ?? i.customerId,
        email: c?.email ?? "",
        amount: i.amount,
        due: i.due,
        daysOverdue: daysBetween(i.due),
      };
    })
    .filter((r) => r.daysOverdue >= minDaysOverdue)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_overdue_invoices",
    title: "List overdue invoices",
    description: "Lists unpaid invoices that are past their due date, oldest first.",
    kind: "read",
    shape: {
      minDaysOverdue: z.number().int().min(1).default(1).describe("Only invoices at least this many days overdue"),
      limit: z.number().int().min(1).max(100).default(15).describe("Maximum rows to return"),
    },
    run: (state, args) => {
      const rows = overdueInvoices(state, Number(args.minDaysOverdue ?? 1));
      const limit = Number(args.limit ?? 15);
      return {
        total: rows.length,
        totalAmount: money(rows.reduce((s, r) => s + r.amount, 0)),
        invoices: rows.slice(0, limit).map(({ customerId: _c, email: _e, ...rest }) => rest),
      };
    },
  },
  {
    name: "get_sales_summary",
    title: "Sales summary",
    description: "Revenue, order count and the best-selling coffees for the last N days.",
    kind: "read",
    shape: { days: z.number().int().min(1).max(120).default(30).describe("Window size in days") },
    run: (state, args) => {
      const days = Number(args.days ?? 30);
      const since = isoDaysAgo(days);
      const orders = state.data.orders.filter((o) => o.date >= since && o.status !== "cancelled");
      const bySku = new Map<string, number>();
      for (const o of orders) for (const l of o.lines) bySku.set(l.sku, (bySku.get(l.sku) ?? 0) + l.kg);
      const products = new Map(state.data.products.map((p) => [p.sku, p]));
      const revenue = orders.reduce((s, o) => s + o.total, 0);
      return {
        days,
        orders: orders.length,
        revenue: money(revenue),
        averageOrder: orders.length ? money(revenue / orders.length) : 0,
        topProducts: [...bySku]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([sku, kg]) => ({ product: products.get(sku)?.name ?? sku, origin: products.get(sku)?.origin ?? "", kg })),
      };
    },
  },
  {
    name: "check_inventory",
    title: "Check inventory",
    description: "Green and roasted coffee stock in kilograms, optionally only items below their reorder level.",
    kind: "read",
    shape: {
      belowReorderOnly: z.boolean().default(false).describe("Return only items below the reorder level"),
      query: z.string().optional().describe("Filter by product name or origin"),
    },
    run: (state, args) => {
      const q = typeof args.query === "string" ? args.query.toLowerCase() : "";
      const items = state.data.products
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.origin.toLowerCase().includes(q))
        .filter((p) => !args.belowReorderOnly || p.stockKg < p.reorderKg)
        .map((p) => ({ sku: p.sku, product: p.name, origin: p.origin, stockKg: p.stockKg, reorderKg: p.reorderKg, status: p.stockKg < p.reorderKg ? "reorder" : "ok" }));
      return { total: items.length, items };
    },
  },
  {
    name: "list_orders",
    title: "List orders",
    description: "Recent sales orders, optionally filtered by status.",
    kind: "read",
    shape: {
      status: z.enum(["open", "shipped", "delivered", "cancelled"]).optional().describe("Filter by status"),
      days: z.number().int().min(1).max(120).default(14).describe("Window size in days"),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum rows to return"),
    },
    run: (state, args) => {
      const since = isoDaysAgo(Number(args.days ?? 14));
      const customers = new Map(state.data.customers.map((c) => [c.id, c.name]));
      const rows = state.data.orders
        .filter((o) => o.date >= since && (!args.status || o.status === args.status))
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        total: rows.length,
        orders: rows.slice(0, Number(args.limit ?? 10)).map((o) => ({
          order: o.id,
          date: o.date,
          customer: customers.get(o.customerId) ?? o.customerId,
          kg: o.lines.reduce((s, l) => s + l.kg, 0),
          total: o.total,
          status: o.status,
        })),
      };
    },
  },
  {
    name: "propose_collection_reminders",
    title: "Propose payment reminders",
    description:
      "Prepares payment reminder emails for customers with overdue invoices. It does NOT send anything: it creates a proposal that a human must approve with decide_proposal.",
    kind: "propose",
    shape: {
      minDaysOverdue: z.number().int().min(1).default(7).describe("Include invoices at least this many days overdue"),
    },
    run: (state, args) => {
      const rows = overdueInvoices(state, Number(args.minDaysOverdue ?? 7));
      const byCustomer = new Map<string, ReminderRecipient>();
      for (const r of rows) {
        const cur = byCustomer.get(r.customerId) ?? { customerId: r.customerId, customer: r.customer, email: r.email, invoices: 0, amount: 0, maxDaysOverdue: 0 };
        cur.invoices += 1;
        cur.amount = money(cur.amount + r.amount);
        cur.maxDaysOverdue = Math.max(cur.maxDaysOverdue, r.daysOverdue);
        byCustomer.set(r.customerId, cur);
      }
      const recipients = [...byCustomer.values()].sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue);
      const proposal: Proposal = {
        id: `PR-${state.proposalSeq++}`,
        kind: "collection_reminders",
        title: `Send payment reminders to ${recipients.length} customers`,
        description: `${rows.length} invoices at least ${args.minDaysOverdue} days overdue, ${money(recipients.reduce((s, r) => s + r.amount, 0)).toLocaleString("en-US")} in total. Nothing is sent until this is approved.`,
        recipients,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      state.proposals.set(proposal.id, proposal);
      return proposal;
    },
  },
  {
    name: "decide_proposal",
    title: "Approve or reject a proposal",
    description:
      "Applies the human decision on a pending proposal. Call it ONLY after a person has approved or rejected the proposal; approving queues the reminder emails.",
    kind: "write",
    shape: {
      proposalId: z.string().describe("Proposal id, for example PR-1"),
      decision: z.enum(["approve", "reject"]).describe("The human decision"),
    },
    run: (state, args) => {
      const proposal = state.proposals.get(String(args.proposalId));
      if (!proposal) throw new Error(`Unknown proposal: ${String(args.proposalId)}`);
      if (proposal.status !== "pending") throw new Error(`Proposal ${proposal.id} was already ${proposal.status}`);
      proposal.decidedAt = new Date().toISOString();
      if (args.decision === "reject") {
        proposal.status = "rejected";
        return { proposalId: proposal.id, status: "rejected", queued: 0 };
      }
      proposal.status = "approved";
      for (const r of proposal.recipients) {
        state.queuedReminders.push({ proposalId: proposal.id, email: r.email, customer: r.customer, amount: r.amount, queuedAt: proposal.decidedAt });
      }
      return { proposalId: proposal.id, status: "approved", queued: proposal.recipients.length };
    },
  },
];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Validates arguments against the tool schema (applying defaults) and runs the tool. */
export function runTool(state: ErpState, name: string, args: Record<string, unknown>): unknown {
  const tool = findTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const parsed = z.object(tool.shape).parse(args);
  return tool.run(state, parsed);
}
