import { summarize, ILLUSTRATIVE_PRICING, type TurnTrace } from "../core/trace";

const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 4)}`;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

function TurnCard({ trace }: { trace: TurnTrace }) {
  const timed = trace.steps.filter((s) => s.kind !== "human");
  const total = Math.max(trace.durationMs, ...timed.map((s) => s.startMs + s.durationMs), 0.1);
  return (
    <section className="turn-card">
      <h3>
        <span className="turn-no">#{trace.index + 1}</span> {trace.prompt}
      </h3>
      <p className="turn-meta">
        {ms(trace.durationMs)} · {trace.real?.reported === false ? "tokens not reported" : `${trace.tokens.input + trace.tokens.output} tokens`}{trace.real && trace.real.reported !== false ? ` (real, ${trace.real.calls} model calls${trace.real.cacheReadTokens ? `, ${trace.real.cacheReadTokens} cached` : ""})` : ` · ${usd(trace.costUsd)}`}
      </p>
      {trace.steps.length === 0 ? (
        <p className="muted">No tool was called.</p>
      ) : (
        <ol className="timeline">
          {trace.steps.map((s) => {
            const left = s.kind === "human" ? 0 : (s.startMs / total) * 100;
            const width = s.kind === "human" ? 100 : Math.max((s.durationMs / total) * 100, 3);
            return (
              <li key={s.id} className={s.ok ? undefined : "failed"}>
                <div className="tl-head">
                  <code>{s.tool}</code>
                  <span className={`kind kind-${s.kind}`}>{s.kind}</span>
                  <span className="tl-ms">{s.kind === "human" ? `waited ${ms(trace.humanWaitMs ?? 0)}` : ms(s.durationMs)}</span>
                </div>
                <div className="tl-track" aria-hidden>
                  <span className={`tl-bar kind-${s.kind}`} style={{ marginLeft: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function TracePanel({ traces }: { traces: TurnTrace[] }) {
  const sum = summarize(traces);
  return (
    <div className="side-content">
      <h2>Trace</h2>
      <dl className="tiles">
        <div><dt>Turns</dt><dd>{sum.turns}</dd></div>
        <div><dt>Tool calls</dt><dd>{sum.toolCalls}</dd></div>
        <div><dt>{sum.realTurns ? "Tokens" : "Tokens (est.)"}</dt><dd>{sum.realTurns && !sum.reportedTurns ? "not reported" : (sum.tokens.input + sum.tokens.output).toLocaleString("en-US")}</dd></div>
        <div><dt>{sum.realTurns ? "Cost" : "Cost (illustrative)"}</dt><dd>{sum.realTurns ? (sum.reportedTurns ? "see your Anthropic console" : "your Claude plan") : usd(sum.costUsd)}</dd></div>
        <div><dt>Waiting for humans</dt><dd>{ms(sum.humanWaitMs)}</dd></div>
        <div><dt>Failed calls</dt><dd>{sum.failedCalls}</dd></div>
      </dl>
      {sum.realTurns > sum.reportedTurns && (
        <p className="note">
          {sum.realTurns - sum.reportedTurns} of {sum.turns} turns were answered by Claude through your own Claude account: the platform does not report tokens or cost, and the usage counts against your plan.
        </p>
      )}
      {sum.reportedTurns > 0 && (
        <p className="note">
          {sum.reportedTurns} of {sum.turns} turns were answered by a real model through an API key: their token counts come from the API usage fields (sum of all model calls in the turn). Turns answered by the script still show estimates, and no cost is computed for real turns because no price list is bundled.
        </p>
      )}
      <p className="note">
        Durations are real: they are measured on the tool calls. Tokens and cost are <strong>simulated</strong>, because the agent is scripted: about 4 characters per token, at
        ${ILLUSTRATIVE_PRICING.inputPerMillion} / ${ILLUSTRATIVE_PRICING.outputPerMillion} per million input / output tokens, which are not the prices of any real model.
      </p>
      {traces.length === 0 ? <p className="muted">Ask the agent something to see its trace here.</p> : [...traces].reverse().map((t) => <TurnCard key={t.index} trace={t} />)}
    </div>
  );
}
