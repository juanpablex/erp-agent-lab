# ERP Agent Lab

An agent that operates a **fictional ERP** through an **MCP server**, with **human approval for every action that changes something**.

Everything here is invented: the company ("Kettle Hill Roasters", a coffee roastery that sells to cafés), the customers, the invoices and the numbers. Any resemblance to real businesses is a coincidence.

**Live demo:** https://juanpablex.github.io/erp-agent-lab/

## What is real and what is not

| Piece | Status |
| --- | --- |
| MCP server (`src/mcp/server.ts`) | Real. Standard MCP over stdio, usable from any MCP client. |
| Tools, data model, approval flow (`src/core`) | Real. Shared by the MCP server and the browser demo. |
| Web chat with approval cards and tool-call log | Real. |
| **The agent that answers in the chat** | **Scripted, not a language model.** It reads the intent of a message with simple rules and calls tools in a fixed order. It exists to exercise the tools and the approval flow at zero API cost. |

The agent is behind a small `ToolClient` interface, so a model-driven loop can replace the script without touching the tools.

## The approval rule

Agents can **propose** a change but cannot **execute** it:

1. `propose_collection_reminders` prepares payment reminder emails and returns a *pending* proposal. Nothing is sent.
2. A person reviews it (recipients, invoices and amounts) and approves or rejects it.
3. Only `decide_proposal` applies the decision. Approving queues the emails. A proposal can be decided once.

## Tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `list_overdue_invoices` | read | Unpaid invoices past their due date, oldest first |
| `get_sales_summary` | read | Revenue, order count and best sellers for the last N days |
| `check_inventory` | read | Coffee stock in kg, optionally only items below reorder level |
| `list_orders` | read | Recent sales orders, filterable by status |
| `propose_collection_reminders` | propose | Creates a pending proposal; sends nothing |
| `decide_proposal` | write | Applies a human approve/reject decision |

## Run it

```bash
npm install
npm run dev          # web demo on http://localhost:5173
npm run mcp          # MCP server over stdio
npm run mcp:smoke    # starts the server and exercises it like an MCP client
npm run build        # production build of the web demo
```

### Use the MCP server from a client

Add it to any MCP client configuration, for example:

```json
{
  "mcpServers": {
    "erp-agent-lab": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/erp-agent-lab"
    }
  }
}
```

You can also try it with the official inspector: `npx @modelcontextprotocol/inspector npx tsx src/mcp/server.ts`.

## Project layout

```
src/
  core/        data model and fictional data, tool registry, ToolClient, scripted agent
  mcp/         MCP server (stdio) built from the tool registry
  web/         React chat with approval cards and a tool-call log
scripts/       MCP smoke test
```

## Roadmap

1. MCP server, chat and human approval (this version).
2. Trace panel: every step, duration, and simulated token cost per conversation.
3. Evals: prompts with expected tool calls, run automatically with a pass/fail table.
4. Optional: a real language model behind the same `ToolClient`, voice input and generated UI.

## License

MIT. See [LICENSE](LICENSE).
