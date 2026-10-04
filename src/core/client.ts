import { createState, type ErpState } from "./state";
import { runTool } from "./tools";

/** Anything that can execute a tool: the in-browser demo or a real MCP connection. */
export interface ToolClient {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** Runs the shared tool registry in the same process (used by the browser demo and the tests). */
export class LocalToolClient implements ToolClient {
  readonly state: ErpState;

  constructor(state: ErpState = createState()) {
    this.state = state;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return runTool(this.state, name, args);
  }
}
