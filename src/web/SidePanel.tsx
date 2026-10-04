import { useState } from "react";
import type { TurnTrace } from "../core/trace";
import { EvalPanel } from "./EvalPanel";
import { TracePanel } from "./TracePanel";

export function SidePanel({ traces }: { traces: TurnTrace[] }) {
  const [tab, setTab] = useState<"trace" | "evals">("trace");
  return (
    <aside className="side" aria-label="Trace and evals">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "trace"} onClick={() => setTab("trace")}>Trace</button>
        <button role="tab" aria-selected={tab === "evals"} onClick={() => setTab("evals")}>Evals</button>
      </div>
      {tab === "trace" ? <TracePanel traces={traces} /> : <EvalPanel />}
    </aside>
  );
}
