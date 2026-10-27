// P2 — next-step rules (§E.6).
const prioNum = (p) => { const m = /P?(\d)/.exec(p || ""); return m ? Number(m[1]) : 9; };
const idNum = (id) => Number(String(id).replace(/^T-/, "")) || 0;

/** Next command for one task given its computed status. Returns string|null. */
export function nextForTask(T, status, { risk = "high", testsLocked = false } = {}) {
  switch (status) {
    case "todo": return risk === "high" ? `/hitl:skeleton ${T}` : `/hitl:implement ${T}`;
    case "skeleton": return `/hitl:approve ${T}`;
    case "approved": return `/hitl:test ${T}`;
    case "red": return !testsLocked && risk === "high" ? `/hitl:approve ${T} tests` : `/hitl:implement ${T}`;
    case "wip": return `/hitl:implement ${T}`;
    case "green": return `/hitl:review ${T}`;
    case "review": return `/hitl:review ${T} fix …`;
    case "verified": return `/hitl:approve ${T} done`;
    default: return null;
  }
}

const LOCK_DRIFT = new Set(["SIG_CHANGED", "INTENT_CHANGED", "DELETED_LOCKED", "DELETED_REFERENCED", "TEST_CHANGED", "TEST_DELETED", "TEST_SKIPPED", "STATUS_FORGED"]);

/** Drift items (warn/block) touching locked symbols/tests. */
export function lockedDrift(drift, lock) {
  return (drift?.items || []).filter((i) => (i.level === "warn" || i.level === "block") &&
    (LOCK_DRIFT.has(i.code) || lock?.symbols?.[i.symbol] || lock?.tests?.[i.symbol]));
}

/** Next command for a change phase (design v3 §6.4); null for implement/archived (tasks drive those). */
export function nextForChange(c) {
  switch (c?.phase) {
    case "spec": return `/hitl:plan ${c.id}`;
    case "design": return `/hitl:design ${c.id}`;
    case "tasks": return `/hitl:tasks ${c.id}`;
    case "archive-ready": return `/hitl:archive ${c.id}`;
    default: return null;
  }
}
const CHANGE_ORDER = { "archive-ready": 0, tasks: 1, design: 2, spec: 3 };
const CHANGE_REASON = { "archive-ready": "all tasks done; merge its spec deltas", tasks: "spec/design approved; no approved tasks yet",
  design: "spec approved; design missing or draft", spec: "proposal is still draft" };

/**
 * Overall next step. Order: drift on locked code → the first unblocked task (prio, id) → an active change waiting for
 * its next phase (archive-ready, tasks, design, spec) → an approved v0.5 planning file without tasks → /hitl:plan.
 * @param {{tasks:Task[], statuses:{tasks}, drift?, lock?, planning?:[{file,status,hasTasks}], changes?:[{id,phase}]}} o
 * @returns {{task:string|null, command:string, reason:string, change?:string}}
 */
export function computeNext({ tasks = [], statuses, drift, lock, planning = [], changes = [] }) {
  const ld = lockedDrift(drift, lock);
  if (ld.length) return { task: ld[0].task || null, command: "/hitl:sync", reason: `${ld.length} drift item(s) on locked symbols (e.g. ${ld[0].code} ${ld[0].symbol})` };
  const st = statuses?.tasks || {};
  const all = tasks.length ? tasks : Object.keys(st).map((id) => ({ id, prio: "P9", blockedBy: [] }));
  const isDone = (id) => st[id]?.status === "done";
  const frontier = all.filter((t) => !isDone(t.id) && (t.blockedBy || []).every(isDone))
    .sort((a, b) => prioNum(a.prio) - prioNum(b.prio) || idNum(a.id) - idNum(b.id));
  if (frontier.length) {
    const t = frontier[0];
    const s = st[t.id] || { status: "todo", next: nextForTask(t.id, "todo", { risk: t.risk }) };
    return { task: t.id, command: s.next || `/hitl:flow ${t.id}`, reason: `${t.id} is ${s.status}` };
  }
  const waiting = changes.filter((c) => c.phase in CHANGE_ORDER)
    .sort((a, b) => CHANGE_ORDER[a.phase] - CHANGE_ORDER[b.phase] || String(a.id).localeCompare(String(b.id)))[0];
  if (waiting) return { task: null, command: nextForChange(waiting), reason: `change ${waiting.id}: ${CHANGE_REASON[waiting.phase]}`, change: waiting.id };
  if (all.length && !all.every((t) => isDone(t.id))) return { task: null, command: "/hitl:flow", reason: "no unblocked task (check blocked-by edges)" };
  const p = planning.find((x) => x.status === "approved" && !x.hasTasks);
  if (p) return { task: null, command: `/hitl:tasks ${p.file}`, reason: "approved planning has no tasks file" };
  return { task: null, command: "/hitl:plan", reason: all.length ? "all tasks done" : "no tasks yet" };
}
