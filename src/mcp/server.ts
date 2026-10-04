import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createState } from "../core/state";
import { TOOLS, runTool } from "../core/tools";

/**
 * MCP server for the fictional ERP of Kettle Hill Roasters. It runs over stdio,
 * so any MCP client (an IDE, a desktop assistant, the MCP Inspector) can launch
 * it with `npm run mcp`. The tool definitions come from the shared registry.
 */
const state = createState();
const server = new McpServer({ name: "erp-agent-lab", version: "0.1.0" });

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.shape,
      annotations: { readOnlyHint: tool.kind === "read", destructiveHint: false, idempotentHint: tool.kind !== "write" },
    },
    async (args: Record<string, unknown>) => {
      try {
        const result = runTool(state, tool.name, args);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }] };
      }
    }
  );
}

await server.connect(new StdioServerTransport());
console.error("erp-agent-lab MCP server ready (stdio)");
