// P2 — verdict (§E.9.2), F-number assignment (§E.8) and review markdown (§E.9.3). Pure.
import { label } from "./risk.mjs";

const SEV_ORDER = { critical: 0, important: 1, minor: 2 };
export const confOf = (f) => f.verifiedConfidence ?? f.confidence ?? 0;
export const isKept = (f, thr) => (f.keep ?? confOf(f) >= thr) && confOf(f) >= thr;
const shortName = (index, id) => index?.symbols?.[id]?.name || String(id || "").split("#").pop();

export function emptyDecisions() { return { schema: "hitl.decisions/1", items: {}, keys: {} }; }

/**
 * Assign stable F-numbers to kept findings (severity, then verifiedConfidence desc). Existing keys keep numbers.
 * Mutates and returns decisions ({items, keys:{key:"F-n"}}).
 */
export function assignFNumbers(findings, decisions, thr) {
  const d = { schema: "hitl.decisions/1", items: {}, keys: {}, ...(decisions || {}) };
  d.items = d.items || {}; d.keys = d.keys || {};
  for (const [F, it] of Object.entries(d.items)) if (it.key && !d.keys[it.key]) d.keys[it.key] = F;
  const used = new Set(Object.values(d.keys).concat(Object.keys(d.items)));
  let max = 0; for (const F of used) max = Math.max(max, Number(String(F).replace("F-", "")) || 0);
  const kept = (findings || []).filter((f) => isKept(f, thr))
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || confOf(b) - confOf(a) || String(a.key).localeCompare(String(b.key)));
  for (const f of kept) if (f.key && !d.keys[f.key]) d.keys[f.key] = `F-${++max}`;
  return d;
}

/** §E.9.2 */
export function computeVerdict({ l0, findings, decisions, risk, thr }) {
  const t = l0?.tests || {};
  const blocks = l0?.drift?.summary?.block || 0;
  const fs = (findings || []).filter((f) => isKept(f, thr));
  const decOf = (f) => { const F = decisions?.keys?.[f.key]; return F ? decisions.items?.[F]?.decision : undefined; };
  let verdict = "PASS";
  if (!l0 || (t.fail || 0) + (t.error || 0) > 0 || blocks > 0 || (l0?.trace?.counts?.block || 0) > 0) verdict = "FAIL"; // no L0 evidence → never PASS
  else if (fs.some((f) => ["critical", "important"].includes(f.severity) && !["reject", "defer"].includes(decOf(f)))) verdict = "WITH FIXES";
  const humanSyms = Object.values(risk?.symbols || {}).filter((s) => s.route === "HUMAN").length;
  const humanFix = fs.filter((f) => f.fixOwner === "human").length;
  const undecidedCrit = fs.filter((f) => f.severity === "critical" && !decOf(f)).length;
  return { verdict, humanRequired: humanSyms + humanFix + undecidedCrit };
}

const stepNum = (s) => { const m = /^\s*(\d+)\./.exec(s || ""); return m ? Number(m[1]) : null; };
const words = (s, n = 3) => String(s || "").replace(/^\s*\d+\.\s*/, "").split(/\s+/).slice(0, n).join(" ");

/** lock.todos[i] ↔ flowSteps of the same number. */
export function intentVsBody(lockEntry, sym) {
  const todos = lockEntry?.todos || [];
  if (!todos.length) return "no TODO flow recorded";
  const have = new Set((sym?.flowSteps || []).map(stepNum).filter((n) => n !== null));
  const still = new Set((sym?.todos || []).map(stepNum).filter((n) => n !== null));
  return todos.map((t, i) => { const n = stepNum(t) ?? i + 1; return `${n} ${words(t)} ${have.has(n) ? "✓" : still.has(n) ? "✗ (TODO left)" : "✗"}`; }).join(" · ");
}

function gateRow(g, l0) {
  let result = g.result;
  if (g.name === "tests" && l0?.tests) {
    const t = l0.tests; const total = (t.pass || 0) + (t.fail || 0) + (t.error || 0);
    result = g.result === "skip" ? "skip" : `${t.pass || 0}/${total} ${g.result}`;
  }
  if (g.name === "drift" && l0?.drift) {
    const items = l0.drift.items || [];
    const c = (codes) => items.filter((i) => codes.includes(i.code)).length;
    result = `sig ${c(["SIG_CHANGED"])} · intent ${c(["INTENT_CHANGED"])} · tests ${c(["TEST_CHANGED", "TEST_DELETED", "TEST_SKIPPED"])} changed` + (l0.drift.summary?.block ? ` · ${l0.drift.summary.block} block` : "");
  }
  if (g.name === "trace" && l0?.trace) {
    const acs = l0.trace.acs || []; const c = l0.trace.counts || {};
    result = `AC ${acs.filter((a) => a.proven).length}/${acs.length} proven · ${c.block || 0} block · ${c.warn || 0} warn ${g.result}`;
  }
  const name = g.name === "drift" ? "drift vs lock" : g.name;
  return `| ${name} | ${result} | ${String(g.detail ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")} |`;
}

/**
 * Build the review markdown.
 * o: {taskId, title, l0, findings(doc), decisions, risk(incl. override), statuses, lock, index, config, head, now, prevReport?}
 * @returns {{markdown, verdict, humanRequired, decisions}}
 */
export function buildReport(o) {
  const thr = o.config?.review?.confidenceThreshold ?? 80;
  const fdoc = o.findings || { findings: [], setAside: [] };
  const all = fdoc.findings || [];
  const decisions = assignFNumbers(all, o.decisions, thr);
  const { verdict, humanRequired } = computeVerdict({ l0: o.l0, findings: all, decisions, risk: o.risk, thr });
  const lenses = [...new Set([...(o.lensesRan || []), ...all.map((f) => f.lens).filter(Boolean)])];
  const lensList = (lenses.length ? lenses : o.risk?.lenses || []).join(", ");
  const L = [];
  L.push(`# Review ${o.taskId}: ${o.title || ""}`.trimEnd());
  L.push(`verdict: ${verdict} | risk: ${(o.risk?.score ?? 0).toFixed(2)} (${label(o.risk?.score ?? 0)}) | human required: ${humanRequired} | head: ${o.head || "no-git"}`);
  L.push(`generated: ${o.now || new Date().toISOString()} | lenses: ${lensList || "—"} | threshold: conf>=${thr}`);
  if (o.risk?.override) L.push(`⚠️ human-override: the user forced the fast lane (skeleton/tests approved without gates) — every function is routed to the human (L2)`);
  L.push("", "## Gates (L0)", "| gate | result | detail |", "|---|---|---|");
  const gates = o.l0?.gates || [];
  if (!gates.length) L.push("| l0 | skip | not run (hitl-index l0 " + o.taskId + ") |");
  for (const g of gates) L.push(gateRow(g, o.l0));

  L.push("", "## Trace");
  const tr = o.l0?.trace;
  if (!tr) L.push("- not computed");
  else {
    const acs = tr.acs || [];
    for (const a of acs.slice(0, 10)) {
      const n = a.tests || 0;
      L.push(`- ${a.id}${a.reqs?.length ? ` (${a.reqs.join(", ")})` : ""} — ${n} test${n === 1 ? "" : "s"} ${a.proven ? "✅ proven" : "⚠️ not proven"}`);
    }
    if (acs.length > 10) L.push(`… +${acs.length - 10} more`);
    if (!acs.length) L.push("- no acceptance criteria");
    for (const i of (tr.items || []).filter((x) => x.level !== "info").slice(0, 5)) L.push(`${i.level === "block" ? "⛔" : "⚠️"} ${i.code} ${i.ref} — ${i.message}`);
  }

  L.push("", "## Functions (sorted by risk)", "| symbol | impl | status | risk | reasons | route |", "|---|---|---|---|---|---|");
  const rs = Object.entries(o.risk?.symbols || {}).sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1));
  for (const [id, r] of rs) {
    const S = o.index?.symbols?.[id];
    L.push(`| ${shortName(o.index, id)} | ${S?.tags?.impl || o.lock?.symbols?.[id]?.impl || "?"} | ${o.statuses?.symbols?.[id]?.status || "?"} | ${r.score.toFixed(2)} | ${r.reasons.join(", ") || "—"} | ${r.route} |`);
  }

  const kept = all.filter((f) => isKept(f, thr));
  const major = kept.filter((f) => ["critical", "important"].includes(f.severity))
    .sort((a, b) => Number(decisions.keys[a.key]?.slice(2)) - Number(decisions.keys[b.key]?.slice(2)));
  L.push("", "## Findings needing a decision");
  if (!major.length) L.push("none");
  for (const f of major) {
    const F = decisions.keys[f.key]; const d = decisions.items[F];
    const owner = f.fixOwner === "human" ? "human" : "agent (test-first)";
    const dec = d ? `${d.decision}${d.note ? ` (${d.note})` : ""}` : `pending → \`/hitl:review ${o.taskId} fix ${F}\` or reply accept/reject/defer`;
    const nv = f.verdict === "needs_validation"; // upstream security-audit: blocked lead, no severity, human validates
    L.push(`### ${F} [${nv ? "needs_validation" : f.severity} · conf ${confOf(f)}] ${f.title || f.key} — ${f.file || "?"}${f.line ? ":" + f.line : ""}`);
    L.push(`evidence: ${String(f.evidence || "").replace(/\n/g, " ")} | fix owner: ${owner} | decision: ${dec}`);
    if (nv) L.push(`blocker: ${String(f.blocker || "unstated").replace(/\n/g, " ")} — validate it (plan below), then accept (fix) or reject`);
    if (f.suggestedFix) L.push(`suggested fix: ${String(f.suggestedFix).replace(/\n/g, " ")}`);
    const sp = o.l0?.trace?.spec?.[f.symbol];
    if (sp) {
      const ids = [(sp.decisions || []).join(", "), (sp.requirements || []).join(", ")].filter(Boolean).join(" · ");
      L.push(`spec: ${ids}${["intent", "scope", "todo-flow"].includes(f.category) ? ` — reply "amend ${F}" to accept + amend the spec` : ""}`);
    }
  }

  L.push("", "## Intent vs body (HUMAN-routed only)");
  const human = rs.filter(([, r]) => r.route === "HUMAN");
  if (!human.length) L.push("none");
  for (const [id] of human) L.push(`${shortName(o.index, id)}: ${intentVsBody(o.lock?.symbols?.[id], o.index?.symbols?.[id])}`);

  L.push("", "## Set aside / out of scope");
  const aside = fdoc.setAside || [];
  if (!aside.length) L.push("- none"); else for (const s of aside) L.push(`- ${s}`);

  const collapsed = all.filter((f) => !isKept(f, thr) || f.severity === "minor");
  L.push("", `## Collapsed: minor or conf<${thr} (${collapsed.length})`, "<details><summary>show</summary>", "");
  for (const f of collapsed) L.push(`- [${f.severity} · conf ${confOf(f)}] ${f.title || f.key} — ${f.file || "?"}${f.line ? ":" + f.line : ""}`);
  L.push("</details>");

  L.push("", "## Outcome log");
  const present = new Set(all.map((f) => f.key));
  const decided = Object.entries(decisions.items).sort((a, b) => Number(a[0].slice(2)) - Number(b[0].slice(2)));
  if (!decided.length) L.push("- none");
  for (const [F, d] of decided) {
    const outcome = present.has(d.key) ? (d.decision === "accept" ? "open (fix pending)" : d.decision)
      : d.decision === "accept" ? "fixed, re-review pass" : `${d.decision}, no longer reported`;
    L.push(`- ${F} ${d.decision} → ${outcome}${d.note ? ` — ${d.note}` : ""}`);
  }
  return { markdown: L.join("\n") + "\n", verdict, humanRequired, decisions };
}
