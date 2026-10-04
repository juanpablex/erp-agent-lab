import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Starts the MCP server as a child process and exercises it like a real MCP client would. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/server.ts"] });
const client = new Client({ name: "smoke-test", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log("tools:", names.join(", "));
assert(names.includes("propose_collection_reminders") && names.includes("decide_proposal"), "expected tools are listed");

const text = (res: any): any => JSON.parse(res.content[0].text);

const overdue = text(await client.callTool({ name: "list_overdue_invoices", arguments: { minDaysOverdue: 1 } }));
assert(overdue.total > 0, "there are overdue invoices");
console.log("overdue invoices:", overdue.total);

const proposal = text(await client.callTool({ name: "propose_collection_reminders", arguments: { minDaysOverdue: 7 } }));
assert(proposal.status === "pending" && proposal.recipients.length > 0, "proposal is created as pending");
console.log("proposal:", proposal.id, proposal.title);

const rejected = text(await client.callTool({ name: "decide_proposal", arguments: { proposalId: proposal.id, decision: "reject" } }));
assert(rejected.status === "rejected" && rejected.queued === 0, "rejecting queues nothing");

const again = (await client.callTool({ name: "decide_proposal", arguments: { proposalId: proposal.id, decision: "approve" } })) as any;
assert(again.isError === true, "a decided proposal cannot be decided twice");

const second = text(await client.callTool({ name: "propose_collection_reminders", arguments: { minDaysOverdue: 7 } }));
const approved = text(await client.callTool({ name: "decide_proposal", arguments: { proposalId: second.id, decision: "approve" } }));
assert(approved.status === "approved" && approved.queued === second.recipients.length, "approving queues one email per recipient");
console.log("approved:", approved.proposalId, "queued", approved.queued);

console.log("OK");
await client.close();
