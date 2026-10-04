import { useEffect, useState } from "react";
import { runEvals, type EvalResult, type EvalSummary, type Status } from "../core/evals";

const LABEL: Record<Status, string> = { pass: "pass", fail: "fail", "known-gap": "known gap", "unexpected-pass": "now passes" };

export function EvalPanel() {
  const [data, setData] = useState<{ results: EvalResult[]; summary: EvalSummary } | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setData(await runEvals());
    setRunning(false);
  }

  useEffect(() => {
    void run();
  }, []);

  const s = data?.summary;
  return (
    <div className="side-content">
      <h2>Evals</h2>
      <p className="note">
        Each case sends a message to the scripted agent (or calls the tools directly) against fresh data and checks what happened. They cover routing, safety (nothing changes without a human decision) and the approval flow.
      </p>
      <div className="eval-actions">
        <button className="primary" onClick={() => void run()} disabled={running}>{running ? "Running..." : "Run evals"}</button>
        {s && (
          <span className={`eval-total ${s.ok ? "ok" : "bad"}`}>
            {s.passed}/{s.total} passed{s.failed ? `, ${s.failed} failed` : ""}{s.knownGaps ? `, ${s.knownGaps} known gap` : ""}
          </span>
        )}
      </div>
      <ul className="evals">
        {data?.results.map((r) => (
          <li key={r.id} className={`eval ${r.status}`}>
            <details>
              <summary>
                <span className={`pill pill-${r.status}`}>{LABEL[r.status]}</span>
                <span className="eval-name">{r.name}</span>
                <span className="eval-cat">{r.category}</span>
              </summary>
              {r.prompt && <p className="eval-prompt">"{r.prompt}"</p>}
              <ul className="checks">
                {r.checks.map((c) => (
                  <li key={c.label} className={c.ok ? "ok" : "bad"}>
                    <span aria-hidden>{c.ok ? "✓" : "✗"}</span> {c.label}
                    {c.detail && <span className="check-detail"> ({c.detail})</span>}
                  </li>
                ))}
              </ul>
              {r.knownGap && <p className="muted">Known gap: {r.knownGap}</p>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
