// P2 — next-step rules (§E.6).
const prioNum = (p) => { const m = /P?(\d)/.exec(p || ""); return m ? Number(m[1]) : 9; };
const idNum = (id) => Number(String(id).replace(/^T-/, "")) || 0;

/** Next command for one task given its computed status. Returns string|null. */
export function nextForTask(T, status, { risk = "high", testsLocked = false, reopenStage = null } = {}) {
  switch (status) {
    case "reopened": return reopenStage === "skeleton" ? `/hitl:skeleton ${T}` : `/hitl:test ${T}`;
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

const LOCK_DRIFT = new Set(["SIG_CHANGED", "INTENT_CHANGED", "ARCHIVED_BODY_CHANGED", "TODO_FLOW_CHANGED", "DELETED_LOCKED", "RENAMED", "DELETED_REFERENCED", "TEST_CHANGED", "TEST_DELETED", "TEST_SKIPPED", "STATUS_FORGED"]);

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
/** The next step when nothing is in flight: start new work through the router (0.11). */
export const NEW_WORK = "/hitl:go <describe the work>";
const CHANGE_REASON = { "archive-ready": "all tasks done; merge its spec deltas", tasks: "spec/design approved; no approved tasks yet",
  design: "spec approved; design missing or draft", spec: "proposal is still draft" };

/**
 * Overall next step. Order: drift on locked code → a recheck waiting for reopen → a note from an archived change that
 * a change must take in first (0.12, the forced amend) → the first unblocked task (prio, id; tasks of a change that waits
 * for another change are skipped) → an active change waiting for
 * its next phase (archive-ready, tasks, design, spec) → an approved v0.5 planning file without tasks → new work
 * (/hitl:go <describe the work>, 0.11: the one entry point for new work).
 * @param {{tasks:Task[], statuses:{tasks}, drift?, lock?, planning?:[{file,status,hasTasks}], changes?:[{id,phase}]}} o
 * @returns {{task:string|null, command:string, reason:string, change?:string}}
 */
export function computeNext({ tasks = [], statuses, drift, lock, planning = [], changes = [], notes = {} }) {
  const ld = lockedDrift(drift, lock);
  if (ld.length) return { task: ld[0].task || null, command: "/hitl:sync", reason: `${ld.length} drift item(s) on locked symbols (e.g. ${ld[0].code} ${ld[0].symbol})` };
  // 0.9: a recheck note waits for the human's reopen decision (/hitl:approve <change> reopen)
  const pend = (notes.pending || [])[0];
  if (pend) return { task: null, command: `/hitl:approve ${pend.change} reopen ${pend.id}`, reason: `${pend.id} (${pend.title}) waits for your reopen decision`, change: pend.change };
  // 0.12: a change holds a note from an archived change it has not taken in yet: amend it first (the whole change waits)
  const waits = notes.waits || [];
  const am = waits.find((x) => x.amend?.length);
  if (am) return { task: null, command: am.amend[0].apply, reason: `${am.change} must take in ${am.amend[0].id} (${am.amend[0].title}) from ${am.amend[0].source}, which is archived`, change: am.change };
  const waitOf = new Map(waits.filter((x) => x.for?.length).map((x) => [x.change, x]));
  const st = statuses?.tasks || {};
  const all = tasks.length ? tasks : Object.keys(st).map((id) => ({ id, prio: "P9", blockedBy: [] }));
  const isDone = (id) => st[id]?.status === "done";
  const frontier = all.filter((t) => !isDone(t.id) && (t.blockedBy || []).every(isDone))
    .sort((a, b) => prioNum(a.prio) - prioNum(b.prio) || idNum(a.id) - idNum(b.id));
  // tasks touched by an open note are skipped while another frontier task can go on; all blocked → apply the first note
  const byTask = notes.byTask || {};
  const free = frontier.filter((t) => !byTask[t.id]?.length && !waitOf.has(t.change));
  const skipped = frontier.filter((t) => byTask[t.id]?.length || waitOf.has(t.change))
    .map((t) => `${t.id} (${waitOf.has(t.change) ? `waits for ${waitOf.get(t.change).for[0].change}` : byTask[t.id][0].id})`);
  if (free.length) {
    const t = free[0];
    const s = st[t.id] || { status: "todo", next: nextForTask(t.id, "todo", { risk: t.risk }) };
    return { task: t.id, command: s.next || `/hitl:flow ${t.id}`, reason: `${t.id} is ${s.status}${skipped.length ? `; skipped ${skipped.join(", ")}: blocked by notes` : ""}` };
  }
  if (frontier.length) {
    const t = frontier[0];
    const wx = waitOf.get(t.change);
    if (wx) {
      // the whole change waits for another change: that change goes first (or, gone, the human dismisses its notes)
      const f = wx.for[0], other = changes.find((c) => c.id === f.change);
      const command = f.state === "gone" ? `/hitl:approve ${t.change} dismiss ${f.notes[0]} <reason>` : (other && nextForChange(other)) || `/hitl:flow ${f.change}`;
      return { task: null, command, reason: `${t.change} waits for ${f.change} (${f.notes.join(", ")})${f.state === "gone" ? `, which is gone` : " until it is archived"}`, change: f.state === "gone" ? t.change : f.change };
    }
    const n = byTask[t.id][0];
    return { task: t.id, command: n.apply, reason: `${t.id} is blocked by ${n.id} (${n.title})`, ...(n.change ? { change: n.change } : {}) };
  }
  const waiting = changes.filter((c) => c.phase in CHANGE_ORDER && !(c.phase === "archive-ready" && waitOf.has(c.id)))
    .sort((a, b) => CHANGE_ORDER[a.phase] - CHANGE_ORDER[b.phase] || String(a.id).localeCompare(String(b.id)))[0];
  if (waiting) return { task: null, command: nextForChange(waiting), reason: `change ${waiting.id}: ${CHANGE_REASON[waiting.phase]}`, change: waiting.id };
  if (all.length && !all.every((t) => isDone(t.id))) return { task: null, command: "/hitl:flow", reason: "no unblocked task (check blocked-by edges)" };
  const p = planning.find((x) => x.status === "approved" && !x.hasTasks);
  if (p) return { task: null, command: `/hitl:tasks ${p.file}`, reason: "approved planning has no tasks file" };
  return { task: null, command: NEW_WORK, reason: all.length ? "all tasks done" : "no tasks yet" };
}
