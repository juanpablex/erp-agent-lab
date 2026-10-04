import { useEffect, useRef, useState } from "react";
import { clearConfig, loadConfig, RealModelDialog, saveConfig, type RealConfig } from "./RealModel";
import { explainError, runLlmTurn, type History } from "../core/llmAgent";
import { LocalToolClient } from "../core/client";
import Anthropic from "@anthropic-ai/sdk";
import { HELP, runTurn, type AgentTurn, type TraceStep } from "../core/agent";
import type { Proposal } from "../core/state";
import { buildTrace, buildRealTrace, withDecision, type TurnTrace } from "../core/trace";
import { SidePanel } from "./SidePanel";

type Decision = { status: "approved" | "rejected"; queued: number };

interface Msg {
  id: number;
  role: "user" | "agent";
  text: string;
  turn?: AgentTurn;
  decision?: Decision;
  extraSteps?: TraceStep[];
  traceIndex?: number;
  finishedAt?: number;
}

const SUGGESTIONS = [
  "Who has overdue invoices?",
  "Remind the customers who owe us money",
  "Sales in the last 30 days",
  "What is below reorder level?",
  "Show me the latest orders",
];

const fmt = (v: string | number) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v);

function Table({ rows }: { rows: Record<string, string | number>[] }) {
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]!);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c} className={typeof r[c] === "number" ? "num" : undefined}>{fmt(r[c]!)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <figure className="bars">
      <figcaption>{title}</figcaption>
      {items.map((i) => (
        <div className="bar-row" key={i.label}>
          <span className="bar-label">{i.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></span>
          <span className="bar-value">{fmt(i.value)}</span>
        </div>
      ))}
    </figure>
  );
}

function Steps({ steps }: { steps: TraceStep[] }) {
  if (steps.length === 0) return null;
  return (
    <details className="steps">
      <summary>{steps.length} tool call{steps.length === 1 ? "" : "s"}</summary>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className={s.ok ? undefined : "failed"}>
            <code>{s.tool}</code>
            <span className="args">{JSON.stringify(s.args)}</span>
            <span className="ms">{s.durationMs} ms</span>
            <div className="preview">{s.preview}</div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function ProposalCard({ proposal, decision, onDecide, busy }: { proposal: Proposal; decision?: Decision; onDecide: (d: "approve" | "reject") => void; busy: boolean }) {
  const shown = proposal.recipients.slice(0, 6);
  return (
    <section className={`proposal ${decision?.status ?? "pending"}`} aria-label="Action waiting for approval">
      <div className="proposal-head">
        <span className="tag">{decision ? decision.status : "Needs your approval"}</span>
        <strong>{proposal.title}</strong>
      </div>
      <p>{proposal.description}</p>
      <Table rows={shown.map((r) => ({ customer: r.customer, email: r.email, invoices: r.invoices, amount: r.amount, "days overdue": r.maxDaysOverdue }))} />
      {proposal.recipients.length > shown.length && <p className="muted">and {proposal.recipients.length - shown.length} more</p>}
      {!decision ? (
        <div className="actions">
          <button className="primary" onClick={() => onDecide("approve")} disabled={busy}>Approve and queue emails</button>
          <button onClick={() => onDecide("reject")} disabled={busy}>Reject</button>
        </div>
      ) : (
        <p className="result">{decision.status === "approved" ? `Approved: ${decision.queued} reminder emails queued.` : "Rejected: nothing was sent."}</p>
      )}
    </section>
  );
}

export function App() {
  const client = useRef(new LocalToolClient());
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: "agent", text: `Hi, I'm the operations agent of Kettle Hill Roasters. ${HELP}` }]);
  const initial = useRef(loadConfig());
  const [real, setReal] = useState<RealConfig | null>(initial.current.config);
  const [remembered, setRemembered] = useState(initial.current.remembered);
  const [dialog, setDialog] = useState(false);
  const history = useRef<History>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [traces, setTraces] = useState<TurnTrace[]>([]);
  const [showTrace, setShowTrace] = useState(() => (typeof window === "undefined" ? true : window.matchMedia("(min-width: 900px)").matches));
  const seq = useRef(1);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A block body on purpose: an effect must return nothing or a cleanup function, and some browsers and
    // extensions make scrollIntoView return a value, which React would then try to call as a cleanup.
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { id: seq.current++, role: "user", text: prompt }]);
    const startedAt = Date.now();
    try {
      let turn: AgentTurn;
      let trace: (i: number) => TurnTrace;
      if (real) {
        const llm = new Anthropic({ apiKey: real.apiKey, dangerouslyAllowBrowser: true });
        const r = await runLlmTurn(prompt, client.current, history.current, llm, real.model);
        turn = r.turn;
        trace = (i) => buildRealTrace(i, prompt, r.turn, startedAt, r.usage);
      } else {
        turn = await runTurn(prompt, client.current);
        trace = (i) => buildTrace(i, prompt, turn, startedAt);
      }
      const index = traces.length;
      setTraces((t) => [...t, trace(t.length)]);
      setMsgs((m) => [...m, { id: seq.current++, role: "agent", text: turn.reply, turn, traceIndex: index, finishedAt: Date.now() }]);
    } catch (err) {
      setMsgs((m) => [...m, { id: seq.current++, role: "agent", text: real ? `The real model could not answer. ${explainError(err)}` : `Something went wrong while answering: ${err instanceof Error ? err.message : String(err)}` }]);
    }
    setBusy(false);
  }

  async function decide(msgId: number, proposal: Proposal, decision: "approve" | "reject") {
    setBusy(true);
    const started = performance.now();
    const args = { proposalId: proposal.id, decision };
    let res: { status: Decision["status"]; queued: number };
    try {
      res = (await client.current.callTool("decide_proposal", args)) as { status: Decision["status"]; queued: number };
    } catch (err) {
      setMsgs((m) => [...m, { id: seq.current++, role: "agent", text: `Could not apply the decision: ${err instanceof Error ? err.message : String(err)}` }]);
      setBusy(false);
      return;
    }
    const json = JSON.stringify(res);
    const step: TraceStep = { id: Date.now(), tool: "decide_proposal", kind: "write", args, ok: true, startMs: 0, durationMs: Math.round((performance.now() - started) * 10) / 10, resultChars: json.length, preview: json };
    const msg = msgs.find((x) => x.id === msgId);
    const humanStep: TraceStep = { id: Date.now() + 1, tool: "human_approval", kind: "human", args: { proposalId: proposal.id }, ok: true, startMs: 0, durationMs: 0, resultChars: 0, preview: `human chose to ${decision}` };
    const waited = Date.now() - (msg?.finishedAt ?? Date.now());
    if (msg?.traceIndex !== undefined) setTraces((t) => t.map((x) => (x.index === msg.traceIndex ? withDecision(withDecision(x, humanStep, waited), step, waited) : x)));
    setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, decision: { status: res.status, queued: res.queued }, extraSteps: [...(x.extraSteps ?? []), step] } : x)));
    setBusy(false);
  }

  return (
    <div className="app">
      {dialog && (
        <RealModelDialog
          current={real}
          remembered={remembered}
          onClose={() => setDialog(false)}
          onSave={(c, rem) => { saveConfig(c, rem); setReal(c); setRemembered(rem); history.current = []; setDialog(false); }}
          onRemove={() => { clearConfig(); setReal(null); setRemembered(false); history.current = []; setDialog(false); }}
        />
      )}
      <header>
        <div>
          <h1>ERP Agent Lab</h1>
          <p className="muted">Kettle Hill Roasters, a fictional coffee roastery</p>
        </div>
        <div className="head-right">
          {real
            ? <span className="badge live" title="A Claude model decides which tools to call, using your own API key from this browser.">Real model · {real.model} · your key</span>
            : <span className="badge" title="The tools are real and also available over MCP. The agent follows a script and does not use a language model.">Scripted agent · fictional data</span>}
          <button className="toggle" onClick={() => setDialog(true)}>{real ? "Model settings" : "Use a real model"}</button>
          {real && <button className="toggle" onClick={() => { setReal(null); history.current = []; }}>Back to script</button>}
          <button className="toggle" onClick={() => setShowTrace((v) => !v)} aria-pressed={showTrace}>{showTrace ? "Hide panel" : "Show panel"}</button>
        </div>
      </header>

      <div className={`body ${showTrace ? "with-trace" : ""}`}>
        <div className="col-chat">

      <main className="chat" aria-live="polite">
        {msgs.map((m) => (
          <article key={m.id} className={`msg ${m.role}`}>
            <p>{m.text}</p>
            {m.turn?.chart && <Bars {...m.turn.chart} />}
            {m.turn?.table && <Table rows={m.turn.table} />}
            {m.turn?.proposal && (
              <ProposalCard proposal={m.turn.proposal} decision={m.decision} busy={busy} onDecide={(d) => decide(m.id, m.turn!.proposal!, d)} />
            )}
            {m.turn && <Steps steps={[...m.turn.steps, ...(m.extraSteps ?? [])]} />}
          </article>
        ))}
        <div ref={end} />
      </main>

      <footer>
        <div className="chips">
          {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <input id="prompt" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about invoices, sales, stock or orders..." aria-label="Message" />
          <button className="primary" disabled={busy || !input.trim()}>Send</button>
        </form>
      </footer>
        </div>
        {showTrace && <SidePanel traces={traces} />}
      </div>
    </div>
  );
}
