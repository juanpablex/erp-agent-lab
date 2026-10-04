import { runEvals } from "../src/core/evals";

const { results, summary } = await runEvals();
const icon = { pass: "PASS", fail: "FAIL", "known-gap": "GAP ", "unexpected-pass": "NOTE" } as const;

for (const r of results) {
  console.log(`${icon[r.status]}  [${r.category}] ${r.name}`);
  for (const c of r.checks) if (!c.ok) console.log(`        - ${c.label}${c.detail ? ` (${c.detail})` : ""}`);
  if (r.status === "known-gap") console.log(`        known gap: ${r.knownGap}`);
  if (r.status === "unexpected-pass") console.log("        this known gap now passes: remove its knownGap flag");
}
console.log(`\n${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.knownGaps} known gap(s), ${summary.unexpectedPasses} unexpected pass(es)`);
if (!summary.ok) process.exit(1);
