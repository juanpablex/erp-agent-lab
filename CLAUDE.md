# ERP Agent Lab: context for Claude

A portfolio project: an agent that operates a fictional ERP through an MCP server, with human approval for every write action. Built from scratch, original code, MIT license.

## Hard rules

- All data is fictional and invented: the company, customers, emails (`example.com` only), amounts. No real people, companies, brands or data.
- No code, names, rules or data taken from any employer or client project.
- Be honest in the README and UI: the default chat agent is **scripted, not a language model**. The real-model mode (`src/core/llmAgent.ts`) is optional, uses the visitor's own API key (never ship or commit a key) and must be labeled as such. Never expose `decide_proposal` to the model.
- Everything written in the repo (code, comments, UI text, README, commit messages) is in English. Reply to the user in Spanish.

## Architecture

- `src/core`: data (`data.ts`), state (`state.ts`), tool registry (`tools.ts`), `ToolClient` (`client.ts`), scripted agent (`agent.ts`), optional real-model loops (`llmAgent.ts` with the visitor's API key, `sampleAgent.ts` with their Claude account inside an Artifact; tested with a fake model in `scripts/llm-check.ts`). No browser or Node APIs, so it runs in both.
- `src/mcp/server.ts`: MCP server over stdio, built from the registry.
- `src/web`: React chat, approval cards, tool-call log.
- Tool kinds: `read`, `propose` (creates a pending proposal, changes nothing) and `write` (`decide_proposal`, the only way a change is applied, after a human decision).

## Commands

`npm run dev`, `npm run mcp`, `npm run mcp:smoke`, `npm run evals`, `npm test`, `npm run typecheck`, `npm run build`.

## Working style

- Be efficient with tokens; no screenshots unless asked.
- Before pushing, run `npm run typecheck`, `npm test`, `npm run build` and `npm run mcp:smoke`.
- Trace panel (`src/core/trace.ts`, `src/web/TracePanel.tsx`): durations are real, tokens and cost are simulated and must stay labeled as such.
- Evals (`src/core/evals.ts`): every behavior change to the agent or tools needs a case. Known limitations go in with a `knownGap`, never by weakening a check. CI fails on a failing case and on a known gap that starts passing.
- Roadmap: optional real-model mode (needs API credit, keep it off by default).
- Commits use the author identity configured in this repo (Juan Pablo) with a `Co-Authored-By` trailer for Claude.
