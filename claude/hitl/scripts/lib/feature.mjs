// Feature-level run (`/hitl:implement --feature <change-id>`; legacy tasks/planning files still accepted): resolve the tasks file, order its tasks,
// pick each task's lane and the next action, and build the one-screen feature summary report. Pure except resolve().
import { basename } from "node:path";
import { isKept, confOf, assignFNumbers } from "./report.mjs";

const prioNum = (p) => { const m = /P?(\d)/.exec(p || ""); return m ? Number(m[1]) : 9; };
const idNum = (id) => Number(String(id).replace(/^T-/, "")) || 0;
const stem = (f) => basename(String(f || "")).replace(/\.md$/, "");

/** Statuses that count as "implemented" in a feature run (skipped on resume; reviewed at the end). */
export const IMPLEMENTED = new Set(["green", "review", "verified", "done"]);

/** Feature key of an argument: change id for `.hitl/changes/<id>[/tasks.md]` / `.hitl/archive/<date>-<id>[/…]`, else the file stem. */
function featureKey(arg) {
  const a = String(arg).trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const m = /(?:^|\/)(changes|archive)\/([^/]+)(?:\/tasks\.md)?$/.exec(a);
  if (m) return m[1] === "archive" ? m[2].replace(/^\d{4}-\d{2}-\d{2}-/, "") : m[2];
  return stem(a);
}

/**
 * Tasks of one feature (design v3 §5.3). `arg` is a change id (the documented form: `--feature <change-id>`), a change
 * folder or tasks path, or a legacy tasks/planning path or bare name (`feat-x`, `feat-x.md`). Matches, in order: tasks
 * whose change is that id (the active change first, else its archived copy), the tasks file stem, then tasks whose
 * legacy `← Planning:` link has that name.
 * @returns {{name, file, change?, tasks:Task[]} | {error, candidates?:string[]}}
 */
export function resolveFeature(tasks, arg) {
  if (!arg || typeof arg !== "string") return { error: "missing feature file" };
  const want = featureKey(arg);
  if (!want) return { error: "missing feature file" };
  const all = tasks || [];
  const viaChange = all.filter((t) => t.change === want);
  if (viaChange.length) {
    const active = viaChange.filter((t) => !t.archived);
    const pick = active.length ? active : viaChange;
    const files = [...new Set(pick.map((t) => t.file))].sort();
    const file = files.at(-1);
    return { name: want, file, change: want, tasks: all.filter((t) => t.file === file) };
  }
  const files = [...new Set(all.map((t) => t.file).filter(Boolean))].sort();
  let file = files.find((f) => stem(f) === want && !all.some((t) => t.file === f && t.change));
  if (!file) {
    const viaPlanning = [...new Set(all.filter((t) => t.planning && stem(t.planning) === want).map((t) => t.file))];
    if (viaPlanning.length === 1) file = viaPlanning[0];
    else if (viaPlanning.length > 1) return { error: `planning ${want} has several tasks files`, candidates: viaPlanning };
  }
  if (!file) return { error: `no tasks file for ${arg} (run /hitl:tasks <change-id> first)`, candidates: files };
  return { name: stem(file), file, tasks: all.filter((t) => t.file === file) };
}

/**
 * Topological order by blocked-by (edges inside the feature), ties by prio then id. A cycle does not throw: the
 * remaining tasks are appended in prio/id order and listed in `cycle`.
 * @returns {{order:Task[], cycle:string[]}}
 */
export function orderTasks(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const cmp = (a, b) => prioNum(a.prio) - prioNum(b.prio) || idNum(a.id) - idNum(b.id);
  const indeg = new Map(tasks.map((t) => [t.id, (t.blockedBy || []).filter((d) => byId.has(d) && d !== t.id).length]));
  const order = []; const done = new Set();
  for (;;) {
    const ready = tasks.filter((t) => !done.has(t.id) && indeg.get(t.id) === 0).sort(cmp);
    if (!ready.length) break;
    const t = ready[0];
    order.push(t); done.add(t.id);
    for (const u of tasks) if (!done.has(u.id) && (u.blockedBy || []).includes(t.id)) indeg.set(u.id, indeg.get(u.id) - 1);
  }
  const cycle = tasks.filter((t) => !done.has(t.id)).sort(cmp);
  return { order: order.concat(cycle), cycle: cycle.map((t) => t.id) };
}

/** Lane of a task: low risk → fast; high risk → override when the user typed `--lane fast`, else normal (gates). */
export const laneOf = (risk, laneFast) => (risk === "low" ? "fast" : laneFast ? "override" : "normal");

/**
 * What the feature run does next with one task.
 * implement = /hitl:implement logic for its lane (fast/override run skeleton → tests → implement without gates);
 * skeleton|test = run that skill (it stops at its ⛔ gate); approve|approve-tests = stop, the human types /hitl:approve;
 * skip = already implemented; blocked = waits for a task outside the feature.
 */
export function actionFor(status, lane, testsLocked) {
  if (IMPLEMENTED.has(status)) return "skip";
  if (lane !== "normal") return "implement";
  switch (status) {
    case "todo": return "skeleton";
    case "skeleton": return "approve";
    case "approved": return "test";
    case "red": return testsLocked ? "implement" : "approve-tests";
    default: return "implement"; // wip
  }
}

/**
 * Plan a feature run.
 * o: {feature:{name,file,tasks}, allTasks, statuses, drift?, laneFast?}
 * @returns {{name, file, laneFast, items:[…], current:item|null, phase:"implement"|"review"|"blocked", cycle, stop:string|null}}
 */
export function planFeature(o) {
  const { feature, statuses, drift } = o;
  const st = statuses?.tasks || {};
  const all = new Map((o.allTasks || feature.tasks).map((t) => [t.id, t]));
  const ids = new Set(feature.tasks.map((t) => t.id));
  const { order, cycle } = orderTasks(feature.tasks);
  const items = order.map((t) => {
    const s = st[t.id] || { status: "todo", testsLocked: false, risk: t.risk || "high", override: false };
    const risk = t.risk || s.risk || "high";
    const lane = laneOf(risk, !!o.laneFast);
    const dItems = (drift?.items || []).filter((i) => i.task === t.id);
    const external = (t.blockedBy || []).filter((d) => !ids.has(d) && st[d]?.status !== "done");
    let action = actionFor(s.status, lane, s.testsLocked);
    if (action !== "skip" && external.length) action = "blocked";
    return { id: t.id, title: t.title || "", prio: t.prio || null, risk, riskReasons: t.riskReasons || [], status: s.status, lane,
      override: !!s.override, testsLocked: !!s.testsLocked, action, blockedBy: t.blockedBy || [], waitsFor: external,
      drift: { block: dItems.filter((i) => i.level === "block").length, warn: dItems.filter((i) => i.level === "warn").length } };
  });
  const current = items.find((i) => i.action !== "skip") || null;
  let stop = null;
  const blockDrift = items.find((i) => i.drift.block > 0);
  if (blockDrift) stop = `${blockDrift.id} has ${blockDrift.drift.block} block-level drift item(s): /hitl:sync, then rerun`;
  else if (current?.action === "blocked") stop = `${current.id} waits for ${current.waitsFor.join(", ")} (outside this feature)`;
  else if (current?.action === "approve") stop = `${current.id} skeleton waits for the human: /hitl:approve ${current.id}`;
  else if (current?.action === "approve-tests") stop = `${current.id} tests wait for the human: /hitl:approve ${current.id} tests`;
  const phase = !current ? "review" : stop ? "blocked" : "implement";
  return { name: feature.name, file: feature.file, laneFast: !!o.laneFast, items, current, phase, cycle, stop,
    overrideTasks: items.filter((i) => i.lane === "override").map((i) => i.id) };
}

const VERDICT_RANK = { FAIL: 0, "not reviewed": 1, "WITH FIXES": 2, PASS: 3 };

/** Pending (undecided) critical/important kept findings with their F-numbers. */
export function pendingFindings(findings, decisions, thr) {
  const all = findings?.findings || [];
  const d = assignFNumbers(all, decisions, thr);
  return all.filter((f) => isKept(f, thr) && ["critical", "important"].includes(f.severity))
    .map((f) => ({ F: d.keys[f.key], f }))
    .filter(({ F }) => !d.items[F]?.decision)
    .sort((a, b) => Number(String(a.F).slice(2)) - Number(String(b.F).slice(2)));
}

/**
 * One-screen feature summary.
 * o: {plan, perTask:{[T]:{verdict?, report?, l0?, findings?, decisions?, securityLens?}}, config, now,
 *     securityAudit?: {dir, report, at}} — a recorded full security audit (vendored security-audit skill).
 * @returns {{markdown, verdict, humanRequired, counts, securityLensTasks}}
 */
export function buildFeatureReport(o) {
  const thr = o.config?.review?.confidenceThreshold ?? 80;
  const { plan } = o;
  const rows = []; const cards = []; const human = [];
  const counts = { PASS: 0, "WITH FIXES": 0, FAIL: 0, "not reviewed": 0 };
  for (const it of plan.items) {
    const p = o.perTask?.[it.id] || {};
    const verdict = p.verdict || "not reviewed";
    counts[verdict] = (counts[verdict] || 0) + 1;
    const tc = p.l0?.trace?.counts || {};
    const pend = pendingFindings(p.findings, p.decisions, thr);
    for (const { F, f } of pend) cards.push(`- ${it.id} ${F} [${f.verdict === "needs_validation" ? "needs_validation" : f.severity} · conf ${confOf(f)}] ${f.title || f.key} — ${f.file || "?"}${f.line ? ":" + f.line : ""} → \`/hitl:review ${it.id} fix ${F}\` or accept/reject/defer`);
    if (it.override) human.push(`- ${it.id}: ⚠️ human-override (fast lane forced${it.riskReasons.length ? `; risk: ${it.riskReasons.join(", ")}` : ""}) — review every function in ${p.report || `reviews/${it.id}.review.md`}`);
    const risk = `${it.risk}${it.riskReasons.length ? ` (${it.riskReasons.join(", ")})` : ""}`;
    const trace = p.l0?.trace ? `⛔ ${tc.block || 0} · ⚠️ ${tc.warn || 0}` : "—";
    rows.push(`| ${it.id} | ${String(it.title).replace(/\|/g, "\\|")} | ${risk} | ${it.override ? "⚠️ yes" : "—"} | ${it.status} | ${verdict} | ${trace} | ${pend.length || "—"} |`);
  }
  const verdict = plan.items.length ? Object.keys(counts).filter((k) => counts[k]).sort((a, b) => VERDICT_RANK[a] - VERDICT_RANK[b])[0] : "not reviewed";
  const humanRequired = cards.length + human.length;
  const L = [];
  L.push(`# Feature ${plan.name}: ${plan.items.length} task${plan.items.length === 1 ? "" : "s"}`);
  L.push(`verdict: ${verdict} | PASS ${counts.PASS} · WITH FIXES ${counts["WITH FIXES"]} · FAIL ${counts.FAIL} · not reviewed ${counts["not reviewed"]} | override: ${plan.items.filter((i) => i.override).length} | human required: ${humanRequired}`);
  L.push(`tasks: ${plan.file} | generated: ${o.now || new Date().toISOString()}`);
  L.push("", "| task | title | risk | override | status | verdict | trace | pending |", "|---|---|---|---|---|---|---|---|", ...rows);
  L.push("", "## Findings needing a decision");
  L.push(...(cards.length ? cards : ["none"]));
  L.push("", "## Human review required (override)");
  L.push(...(human.length ? human : ["none"]));
  const securityLensTasks = plan.items.filter((it) => o.perTask?.[it.id]?.securityLens).map((it) => it.id);
  if (o.securityAudit || securityLensTasks.length) {
    L.push("", "## Security audit");
    if (o.securityAudit) L.push(`- full audit: ${o.securityAudit.report} (${o.securityAudit.at || "date unknown"})`);
    if (securityLensTasks.length) L.push(`- security lens ran: ${securityLensTasks.join(", ")}`);
    if (!o.securityAudit && securityLensTasks.length) L.push(`- 💡 full six-phase audit (suggestion, not run): \`/hitl:review --security-audit ${plan.file}\``);
  }
  if (plan.stop || plan.cycle.length) {
    L.push("", "## Stopped");
    if (plan.stop) L.push(`- ${plan.stop}`);
    if (plan.cycle.length) L.push(`- ⚠️ blocked-by cycle: ${plan.cycle.join(", ")}`);
  }
  return { markdown: L.join("\n") + "\n", verdict, humanRequired, counts, securityLensTasks };
}
