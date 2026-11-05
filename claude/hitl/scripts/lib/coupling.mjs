// Change coupling (0.10): the `after:` / `relates:` header of a proposal, the link graph across active and archived
// changes, the overlap evidence between two changes, the validate items, and the `order` notes an `after:` link keeps
// in the dependent change. A link is symmetric for reconcile (the change that archives second owns it); `after` is
// directional for the pause and the cycle check. Nothing here releases a block: order notes are only created or grown.
import { join } from "node:path";
import { readText } from "./fsutil.mjs";
import { parseProposal } from "./specmd.mjs";
import { lockedTasks, taskSymbolIds } from "./lock.mjs";
import { readNotesDoc, specRefsTouch, todayIso, nextNoteId, updateNotes, validateRefs } from "./notes.mjs";

export const STRONG_TYPES = new Set(["same-id", "ac-ref", "serves-ref", "rule-ref", "symbol", "contract"]);
const CHANGED_OPS = ["MODIFIED", "REMOVED"];

// ---------------------------------------------------------------- link graph
/**
 * loadLinkGraph(root) -> {nodes: Map key -> node, byId(id) -> node|null, records: Map activeId -> {reconciled}}.
 * node = {id, dir, archived, archiveDate, created, links:[{rel, change, level, line}]}; active nodes win over archived
 * ones with the same id (latest archive otherwise).
 */
export async function loadLinkGraph(root) {
  const { listChanges } = await import("./changes.mjs");
  const nodes = [];
  for (const e of await listChanges(root).catch(() => [])) {
    const text = await readText(join(root, e.dir, "proposal.md"), null);
    const p = text === null ? null : parseProposal(text, `${e.dir}/proposal.md`);
    nodes.push({ id: e.id, dir: e.dir, archived: e.archived, archiveDate: e.archiveDate, created: p?.created ?? null, links: p?.links || [] });
  }
  const records = new Map();
  for (const n of nodes.filter((x) => !x.archived)) records.set(n.id, (await readNotesDoc(root, n.dir).catch(() => ({ meta: {} }))).meta?.reconciled || {});
  return graphOf(nodes, records);
}

/** Pure graph from nodes + records (tests build it directly). */
export function graphOf(nodes, records = new Map()) {
  const byId = (id) => nodes.find((n) => !n.archived && n.id === id) || nodes.filter((n) => n.archived && n.id === id).at(-1) || null;
  return { nodes, records, byId };
}

/** True when `target` was archived before `declarer` was created (a link to it is pointless: its spec is living). */
function archivedBefore(target, declarer) {
  return !!(target?.archived && target.archiveDate && declarer?.created && target.archiveDate < declarer.created);
}

/**
 * Links of an active change: [{change, rel: after|before|relates, level, declaredIn, archived, unknown, stale, reconcile}].
 * after = this change waits for `change`; before = `change` waits for this one. reconcile: null (target active) |
 * "pending" | "done" (a recorded run against the archived target).
 */
export function linksOf(graph, id) {
  const me = graph.byId(id);
  if (!me) return [];
  const out = new Map();
  const put = (l) => {
    const cur = out.get(l.change);
    if (!cur || (cur.rel === "relates" && l.rel !== "relates")) out.set(l.change, l);
  };
  for (const l of me.links) if (l.change !== id) put({ change: l.change, rel: l.rel === "after" ? "after" : "relates", level: l.level, declaredIn: id });
  for (const n of graph.nodes) {
    if (n.id === id) continue;
    for (const l of n.links) if (l.change === id && (!n.archived || graph.byId(n.id) === n)) put({ change: n.id, rel: l.rel === "after" ? "before" : "relates", level: l.level, declaredIn: n.id });
  }
  const rec = graph.records.get(id) || {};
  return [...out.values()].sort((a, b) => a.change.localeCompare(b.change)).map((l) => {
    const t = graph.byId(l.change);
    const stale = l.declaredIn === id && archivedBefore(t, me);
    const archived = !!t?.archived;
    return { ...l, archived, unknown: !t, stale, reconcile: !t || !archived || stale ? null : rec[l.change]?.archived ? "done" : "pending" };
  });
}

/** Archived linked changes this active change still owes a reconcile: [{from, command}]. */
export function reconcilePending(graph, id) {
  return linksOf(graph, id).filter((l) => l.reconcile === "pending").map((l) => ({ from: l.change, command: `/hitl:plan ${id} reconcile ${l.change}` }));
}

/** The `after` edges between active changes: a cycle through `id`, as a list of ids, or null. */
export function cycleThrough(graph, id) {
  const next = (x) => (graph.byId(x)?.archived ? [] : (graph.byId(x)?.links || []).filter((l) => l.rel === "after" && graph.byId(l.change) && !graph.byId(l.change).archived).map((l) => l.change));
  const path = [];
  const seen = new Set();
  const dfs = (x) => {
    if (x === id && path.length) return true;
    if (seen.has(x)) return false;
    seen.add(x); path.push(x);
    for (const y of next(x)) if (dfs(y)) return true;
    path.pop();
    return false;
  };
  return dfs(id) ? [...path, id] : null;
}

// ---------------------------------------------------------------- evidence
const changedIds = (ch) => {
  const m = new Map();
  for (const d of ch?.deltas || []) for (const b of d.blocks) if (CHANGED_OPS.includes(b.op)) m.set(b.id, { op: b.op, block: b, capability: d.capability || d.folder });
  return m;
};
const acsOf = (ch) => (ch?.tasksDoc?.tasks || []).flatMap((t) => (t.acs || []).map((a) => ({ ac: a.id, task: t.id, reqs: a.reqs || [] })));
const liveDecisions = (ch) => (ch?.design?.decisions || []).filter((d) => !["rejected", "superseded", "deprecated"].includes(d.status));
const contractBase = (f) => f.replace(/^contracts\//, "").replace(/\.[^.]+(\.[^.]+)?$/, "").replace(/^cli-/, "");
/** Decisions of a change whose text names a contract file (path, file name or base name). */
export function decisionsNaming(ch, file) {
  const name = file.replace(/^contracts\//, ""), base = contractBase(file).toLowerCase();
  return liveDecisions(ch).filter((d) => {
    const t = `${d.decision} ${d.why}`.toLowerCase();
    return t.includes(file.toLowerCase()) || t.includes(name.toLowerCase()) || (base.length >= 3 && t.includes(base));
  });
}

/** Symbols of a change's tasks: Map id -> [T…] (### Symbols rows, @task tags, symbols the task locked). */
export function changeSymbols(ch, index, lock) {
  const out = new Map();
  const add = (id, T) => { if (!out.has(id)) out.set(id, []); if (!out.get(id).includes(T)) out.get(id).push(T); };
  for (const t of ch?.tasksDoc?.tasks || []) {
    for (const id of index ? taskSymbolIds(index, t.id, t) : []) add(id, t.id);
    for (const [id, l] of Object.entries(lock?.symbols || {})) if (lockedTasks(l).includes(t.id)) add(id, t.id);
  }
  return out;
}

/** A readable, uniquely resolving ref for a symbol id (its name after `#` when that resolves to it, else the id). */
export function symbolRef(index, id, resolve) {
  const short = id.includes("#") ? id.slice(id.indexOf("#") + 1) : id;
  return resolve && resolve(short)?.id === id ? short : id;
}

/**
 * couplingEvidence(a, b, {index, lock, resolve}) -> {level: strong|low|none, evidence:[{type, ref, detail}], refsA:[ref],
 * symbolsA:{ref:id}}. a and b are parsed changes (readChange). `refsA` = refs in a's own words that the overlap touches
 * (used for the order note's refs).
 */
export function couplingEvidence(a, b, { index = null, lock = null, resolve = null } = {}) {
  const ev = [], refsA = new Set(), symbolsA = {};
  const push = (type, ref, detail, refs = []) => { if (!ev.some((e) => e.type === type && e.ref === ref)) ev.push({ type, ref, detail }); for (const r of refs) refsA.add(r); };
  const modA = changedIds(a), modB = changedIds(b);
  const acsA = acsOf(a), acsB = acsOf(b);
  const acsTouching = (acs, id) => acs.filter((x) => x.reqs.some((r) => specRefsTouch(id, r)));
  const aUses = (id) => acsTouching(acsA, id).map((x) => x.ac);
  for (const [id, x] of modA) if (modB.has(id)) push("same-id", id, `${x.op} by ${a.id}, ${modB.get(id).op} by ${b.id}`, [...(x.op === "MODIFIED" ? [id] : []), ...aUses(id)]);
  for (const [id, x] of modB) {
    const acs = aUses(id);
    if (acs.length) push("ac-ref", id, `${x.op} by ${b.id}; ${a.id} ${acs.join(", ")} name it`, [id, ...acs]);
    const decs = liveDecisions(a).filter((d) => d.serves.includes(id)).map((d) => d.id);
    if (decs.length) push("serves-ref", id, `${x.op} by ${b.id}; ${a.id} ${decs.join(", ")} serve it`, [id, ...decs]);
    const users = (a.deltas || []).flatMap((d) => d.blocks.filter((bl) => bl.op !== "REMOVED" && (bl.rules || []).includes(id)).map((bl) => bl.id));
    if (users.length) push("rule-ref", id, `${x.op} by ${b.id}; ${a.id} ${users.join(", ")} apply it`, [id, ...users]);
  }
  for (const [id, x] of modA) {
    const acs = acsTouching(acsB, id).map((y) => y.ac);
    if (acs.length) push("ac-ref", id, `${x.op} by ${a.id}; ${b.id} ${acs.join(", ")} name it`, [...(x.op === "MODIFIED" ? [id] : []), ...aUses(id)]);
    const decs = liveDecisions(b).filter((d) => d.serves.includes(id)).map((d) => d.id);
    if (decs.length) push("serves-ref", id, `${x.op} by ${a.id}; ${b.id} ${decs.join(", ")} serve it`, x.op === "MODIFIED" ? [id] : []);
  }
  if (index || lock) {
    const sa = changeSymbols(a, index, lock), sb = changeSymbols(b, index, lock);
    for (const [id, ta] of sa) if (sb.has(id)) {
      const ref = symbolRef(index || { symbols: {} }, id, resolve);
      symbolsA[ref] = id;
      push("symbol", ref, `${a.id} ${ta.join(", ")} and ${b.id} ${sb.get(id).join(", ")}`, [ref]);
    }
  }
  for (const f of (a.contracts || []).filter((x) => (b.contracts || []).includes(x)))
    push("contract", f, `both changes have ${f}`, decisionsNaming(a, f).map((d) => d.id));
  const capsB = new Set((b.deltas || []).map((d) => d.capability || d.folder));
  for (const d of a.deltas || []) { const c = d.capability || d.folder; if (capsB.has(c)) push("capability", c, `both change ${c}`); }
  const level = ev.some((e) => STRONG_TYPES.has(e.type)) ? "strong" : ev.length ? "low" : "none";
  return { level, evidence: ev, refsA: [...refsA], symbolsA };
}

/** Index, lock and a symbol resolver for evidence (empty when the project has none yet). */
export async function evidenceContext(root) {
  const [{ readIndex }, { readLock }, { resolveRef }] = await Promise.all([import("./indexer.mjs"), import("./lock.mjs"), import("./graph.mjs")]);
  const index = (await readIndex(root).catch(() => null)) || { symbols: {}, files: {} };
  const lock = await readLock(root).catch(() => ({ symbols: {}, tasks: {}, tests: {} }));
  return { index, lock, resolve: (r) => resolveRef(index, r) };
}

/** One-line evidence summary: `ACC-R1 same-id · UserService.createUser symbol`. */
export const evidenceLine = (ev) => ev.map((e) => `${e.ref} ${e.type}`).join(" · ") || "none";

// ---------------------------------------------------------------- validate items
/**
 * Coupling items of an active change for `spec validate`: header targets (self, unknown, archived before creation),
 * `after` cycles, understated links (evidence strong, no after/before link) and pending reconciles.
 * others = the other active parsed changes; ectx = evidenceContext (optional: no understated check without it).
 */
export function couplingItems(graph, ch, others = [], ectx = null) {
  const items = [];
  const file = `${ch.dir}/proposal.md`;
  const it = (level, code, ref, line, message) => items.push({ level, code, file, ref, line: line ?? null, message });
  const me = graph.byId(ch.id);
  for (const l of ch.proposal?.links || []) {
    const t = graph.byId(l.change);
    if (l.change === ch.id) it("error", "COUPLING_SELF", l.change, l.line, "a change cannot be linked to itself");
    else if (!t) it("error", "COUPLING_UNKNOWN", l.change, l.line, `${l.change} is not an active or archived change`);
    else if (archivedBefore(t, me)) it("error", "COUPLING_ARCHIVED", l.change, l.line, `${l.change} was archived (${t.archiveDate}) before this change started: its spec is already living, drop the link`);
  }
  const cyc = cycleThrough(graph, ch.id);
  if (cyc) it("error", "COUPLING_CYCLE", ch.id, (ch.proposal?.links || []).find((l) => l.rel === "after")?.line, `"after" links form a cycle: ${cyc.join(" → ")}; one change must not wait`);
  const links = linksOf(graph, ch.id);
  if (ectx) for (const o of others) {
    const ev = couplingEvidence(ch, o, ectx);
    if (ev.level !== "strong") continue;
    const l = links.find((x) => x.change === o.id);
    if (l && l.rel !== "relates") continue;
    it("warn", "COUPLING_UNDERSTATED", o.id, null, `${o.id}: evidence says strong (${evidenceLine(ev.evidence.filter((e) => STRONG_TYPES.has(e.type)))}) but the link is ${l ? "relates (low)" : "missing"}; the change that waits gets "| after: <other> (strong)" (the human decides)`);
  }
  const pend = links.filter((l) => l.reconcile === "pending");
  for (const l of pend) it("warn", "RECONCILE_PENDING", l.change, null, `${l.change} is archived and ${ch.id} never reconciled against it (${pend.length} pending): /hitl:plan ${ch.id} reconcile ${l.change}`);
  return items;
}

// ---------------------------------------------------------------- order notes
/**
 * Keep one `order` note per `after:` link to an active change in the dependent change (created once; refs only grow
 * while it is open; a dismissed, deferred or applied one is never recreated). Edges in a cycle are skipped.
 * Returns [{change, from, note, created, added:[refs]}].
 */
export async function syncOrderNotes(root, { graph, active, living, ectx, only = null }) {
  const { effectiveView, resolveSpecRef, findInView } = await import("./changes.mjs");
  const out = [];
  for (const a of active) {
    if (only && a.id !== only) continue;
    if (cycleThrough(graph, a.id)) continue;
    for (const l of (a.proposal?.links || []).filter((x) => x.rel === "after")) {
      const b = active.find((x) => x.id === l.change);
      if (!b || b.id === a.id) continue;
      const ev = couplingEvidence(a, b, ectx);
      const view = effectiveView(living, a);
      const tasks = a.tasksDoc?.tasks || [];
      const v = validateRefs(ev.refsA, { view, resolveSpecRef: (vw, r) => resolveSpecRef(vw, r, a), findInView, design: a.design, tasks, index: ectx.index, resolve: ectx.resolve });
      const bad = new Set(v.errors.map((e) => e.slice(0, e.indexOf(":"))));
      const refs = ev.refsA.filter((r) => !bad.has(r));
      const doc = await readNotesDoc(root, a.dir);
      const cur = doc.notes.find((n) => n.kind === "order" && n.meta?.coupling?.from === b.id);
      if (cur && (cur.status !== "open" || refs.every((r) => cur.refs.includes(r)))) continue;
      const res = await updateNotes(root, a.dir, a.id, (ns) => {
        const n = ns.find((x) => x.kind === "order" && x.meta?.coupling?.from === b.id);
        if (n) {
          const added = refs.filter((r) => !n.refs.includes(r));
          n.refs.push(...added);
          Object.assign(n.refTitles, Object.fromEntries(added.map((r) => [r, v.titles[r]]).filter(([, t]) => t)));
          n.meta = { ...n.meta, symbols: { ...(n.meta.symbols || {}), ...v.symbols } };
          return { note: n.id, created: false, added };
        }
        const id = nextNoteId(ns);
        ns.push({ id, title: `Wait for ${b.id}`, kind: "order", refs, refTitles: Object.fromEntries(refs.map((r) => [r, v.titles[r]]).filter(([, t]) => t)), status: "open",
          deferredTo: null, from: `coupling header (after: ${b.id})`, at: todayIso(), acks: [], reason: null, resolved: null,
          text: `${a.id} runs after ${b.id} (strong coupling): the tasks these refs touch wait until ${b.id} is archived; then /hitl:plan ${a.id} reconcile ${b.id} turns its changes into notes here and closes this one. Overlap: ${evidenceLine(ev.evidence)}.`,
          meta: { coupling: { from: b.id, rel: "after" }, ...(Object.keys(v.symbols).length ? { symbols: v.symbols } : {}) } });
        return { note: id, created: true, added: refs };
      });
      out.push({ change: a.id, from: b.id, ...res });
    }
  }
  return out;
}
