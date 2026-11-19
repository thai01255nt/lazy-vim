// Amendments (0.17): a change to an approved spec delta or design of an active change that is not wording only gets
// its own brief file, `.hitl/changes/<id>/amend-<KEY>-A<n>-brief.md` (shared/amend-spec.md, template
// shared/templates/amend-brief.md), and ends in an amend task set in tasks.md (shared/task-changes.md). This module is
// the deterministic part: the amendment id, the route (brief or chat), the facts of round 1 (where each task stands,
// what the amendment touches by the traceability links), the hold on touched tasks while the brief is open, and the
// checks AMEND_ORDER and AMEND_UNCOVERED. Pure functions plus small IO; the model writes the questions and the tasks.
import { readAmendBriefs, openAmendBrief } from "./brief.mjs";
import { noteHitsTask, refKind, specRefsTouch } from "./notes.mjs";
import { lockedTasks, noteCtxFor } from "./lock.mjs";
import { AMEND_ID_RE, DROPPED, TASK_KINDS, hasLockedTaskWork } from "./tasksmd.mjs";
import { resolveCovered } from "./testplan.mjs";
import { tidyMarkdown } from "./mdstyle.mjs";

/** Order of the work kinds (revert is not ordered: it restores base for half-done work the human chose not to keep). */
export const KIND_RANK = { prep: 1, expand: 2, migrate: 3, switch: 4, contract: 5 };
/**
 * The transition answer of the amend brief ("is the old behaviour only in this branch · merged · released?") picks the
 * shape of the amend task set: in-branch → (prep) → switch → contract; merged or released → prep → expand → migrate →
 * switch → contract (released: stored data and clients exist; step 1 gives no data-migration guidance yet).
 */
export const TRANSITIONS = {
  branch: ["prep", "switch", "contract", "revert"],
  merged: TASK_KINDS,
  released: TASK_KINDS,
};
/** `branch` | `merged` | `released` from the header value (also "in-branch", "only in this branch", …), else null. */
export function normTransition(v) {
  const x = String(v ?? "").trim().toLowerCase();
  if (!x || /^(?:—|-|none|\?)$/.test(x)) return null;
  if (/branch/.test(x)) return "branch";
  if (/^merged/.test(x)) return "merged";
  if (/^released/.test(x)) return "released";
  return null;
}

export const isAmendId = (s) => AMEND_ID_RE.test(String(s ?? ""));
const amendNum = (id) => Number(/-A(\d+)$/.exec(String(id ?? ""))?.[1] ?? 0);

/** Next amendment id of a change: `<KEY>-A<max+1>` over its amend brief files and every `amend:` / `superseded:` id of its tasks. */
export function nextAmendId(key, briefs = [], tasks = []) {
  let max = 0;
  const bump = (id) => { if (id && String(id).startsWith(`${key}-A`)) max = Math.max(max, amendNum(id)); };
  for (const b of briefs) bump(b.amend);
  for (const t of tasks) { bump(t.amend); for (const x of t.superseded || []) bump(x.amend); }
  return `${key}-A${max + 1}`;
}

/**
 * Route of an amendment (shared/amend-spec.md §1), deterministic:
 * - archived change → chat, `mini-change` (a new change `fix-<slug>` with its own key, spec only);
 * - an amend brief of the change is open → brief (continue it: one open amend brief per change);
 * - no ids yet → brief (the scope is still open);
 * - only task-level ids (task, AC, symbol) and no class above wording → chat, `tasks-update` (/hitl:tasks <id> update);
 *   a task-level id with a behaviour or contract class is a spec gap → brief (it needs a MODIFIED scenario first);
 * - spec or decision ids whose every class is `wording` → chat, `gate` (the one-gate flow: delta preview, Impact, Apply?);
 * - anything else → brief.
 * impact: [{ref, class}] (the classes the model proposes; the human confirms them later). Returns {route, chat, reason}.
 */
export function routeAmend({ refs = [], impact = [], archived = false, open = null } = {}) {
  if (archived) return { route: "chat", chat: "mini-change", reason: "the change is archived: a mini change fix-<slug> (its own change key, spec only)" };
  if (open) return { route: "brief", chat: null, reason: `amend brief ${open.amend} is open: continue it (one open amend brief per change)` };
  const all = [...new Set([...refs, ...impact.map((e) => e.ref)])];
  if (!all.length) return { route: "brief", chat: null, reason: "no ids yet: the scope of the amendment is still open" };
  const cls = new Map(impact.map((e) => [e.ref, e.class]));
  const meaning = all.filter((r) => ["spec", "decision"].includes(refKind(r)));
  const taskLevel = all.filter((r) => !meaning.includes(r));
  const gap = taskLevel.filter((r) => cls.has(r) && cls.get(r) !== "wording");
  if (gap.length) return { route: "brief", chat: null, reason: `${gap.join(", ")}: a behaviour or contract change on task level is a spec gap (a MODIFIED scenario or a new decision first)` };
  if (!meaning.length) return { route: "chat", chat: "tasks-update", reason: "only tasks, ACs, symbols or tests change: /hitl:tasks <id> update (no spec or design meaning changes)" };
  const unclassed = meaning.filter((r) => !cls.has(r));
  if (unclassed.length) return { route: "brief", chat: null, reason: `spec or design ids without a class (${unclassed.join(", ")}); every class wording → chat` };
  if (meaning.every((r) => cls.get(r) === "wording")) return { route: "chat", chat: "gate", reason: "every Impact class is wording: nothing reopens; the one-gate chat flow" };
  return { route: "brief", chat: null, reason: `${meaning.filter((r) => cls.get(r) !== "wording").map((r) => `${r}=${cls.get(r)}`).join(", ")}: the business or design meaning changes` };
}

/** Pseudo note for the matchers of notes.mjs (an amend brief's `refs:` touch tasks the way a note's refs do). */
const asNote = (refs, symbols = {}) => ({ kind: "spec", refs: refs || [], status: "open", acks: [], meta: { symbols } });

/** Tasks (not dropped) the refs touch: {T: [via refs]}. */
export function touchedTasks(refs, tasks, index, lock, api = null) {
  const out = {};
  if (!(refs || []).length) return out;
  const n = asNote(refs);
  for (const t of tasks || []) {
    if (t.status === DROPPED) continue;
    const via = noteHitsTask(n, noteCtxFor(index, lock, t, api));
    if (via.length) out[t.id] = via;
  }
  return out;
}

/**
 * Hold of an open amend brief (decision 9 of the research): touched tasks do not move while the amendment is
 * discussed — /hitl:implement stops, the frontier skips them, the implementer hook refuses their symbols. Done
 * tasks are never held (nothing to build). changes: [{change, brief}] (the open amend brief of each active change).
 * Returns {T: {amend, change, file, via, apply}}.
 */
export function amendHolds(changes, tasks, index, lock, api = null, statusOf = () => null) {
  const out = {};
  for (const { change, brief } of changes || []) {
    if (!brief || brief.status === "done") continue;
    const mine = (tasks || []).filter((t) => t.change === change && !t.archived);
    const hit = touchedTasks(brief.refs, mine, index, lock, api);
    for (const [T, via] of Object.entries(hit)) {
      if (lock?.tasks?.[T]?.doneAt || statusOf(T) === "done") continue;
      const cmd = `${brief.skill === "design" ? "/hitl:design" : "/hitl:plan"} ${change} amend`;
      out[T] = { amend: brief.amend, change, file: brief.file, via, apply: brief.counts?.unanswered ? `answer ${brief.file}, then ${cmd}` : cmd };
    }
  }
  return out;
}

/** The open amend brief of every active change: [{change, dir, brief}] (best effort). */
export async function readOpenAmends(root, entries) {
  const out = [];
  for (const e of entries || []) {
    const brief = openAmendBrief(await readAmendBriefs(root, e.dir).catch(() => []));
    if (brief) out.push({ change: e.id, dir: e.dir, brief });
  }
  return out;
}

const shortName = (id) => String(id).slice(String(id).indexOf("#") + 1);
const testTitle = (index, id) => index?.symbols?.[id]?.test?.titlePath?.at(-1) || shortName(id);

/**
 * What an amendment touches, by the traceability links only (step 1: no call-graph pass yet):
 * specs (the spec refs and their state in the change's view), decisions, ACs of the change's tasks that reference a
 * changed spec id, tasks whose **Why** cites a changed decision, symbols (tagged `@dec` with a changed decision, named
 * by a ref, or covered by a locked test of an affected AC), and the locked tests of affected ACs or covering affected
 * symbols — also tests a task of an archived change locked (they may assert the old behaviour).
 * ctx: {refs, tasks (all tasks, any change), change (id), view?, resolveSpecRef?, design?, index, lock, resolve?, archivedOf?}
 */
export function amendAffected(ctx) {
  const { refs = [], tasks = [], change, index = { symbols: {} }, lock = {}, design = null } = ctx;
  const S = index.symbols || {};
  const mine = tasks.filter((t) => t.change === change && !t.archived && t.status !== DROPPED);
  const specRefs = refs.filter((r) => refKind(r) === "spec");
  const decRefs = refs.filter((r) => refKind(r) === "decision");
  const symRefs = refs.filter((r) => refKind(r) === "symbol");
  const specs = specRefs.map((id) => {
    const r = ctx.resolveSpecRef && ctx.view ? ctx.resolveSpecRef(ctx.view, id) : { status: "ok" };
    return { id, title: (r.scenario || r.block)?.title ?? null, state: r.status };
  });
  const decisions = decRefs.map((id) => { const d = (design?.decisions || []).find((x) => x.id === id); return { id, decision: d?.decision ?? null, status: d?.status ?? "unknown" }; });
  const acs = [];
  for (const t of mine) for (const a of t.acs || []) {
    const via = specRefs.filter((r) => (a.reqs || []).some((x) => specRefsTouch(r, x)));
    if (refs.includes(a.id) || refs.includes(t.id)) via.push(refs.includes(a.id) ? a.id : t.id);
    if (via.length) acs.push({ id: a.id, task: t.id, via, superseded: a.superseded || null });
  }
  const whyTasks = mine.filter((t) => (t.decisions || []).some((d) => decRefs.includes(d))).map((t) => ({ id: t.id, via: t.decisions.filter((d) => decRefs.includes(d)) }));
  const symbols = new Map();
  const addSym = (id, via) => { if (!S[id]) return; const x = symbols.get(id) || { id, name: S[id].name || shortName(id), via: [] }; if (!x.via.includes(via)) x.via.push(via); symbols.set(id, x); };
  for (const [id, s] of Object.entries(S)) for (const d of s.tags?.dec || []) if (decRefs.includes(d)) addSym(id, `@dec ${d}`);
  for (const r of symRefs) { const id = ctx.resolve?.(r)?.id; if (id) addSym(id, r); }
  const acIds = new Set(acs.map((a) => a.id));
  const locked = Object.entries(lock.tests || {}).filter(([, x]) => x.stage === "locked");
  for (const [, x] of locked) if ((x.ac || []).some((a) => acIds.has(a))) for (const c of x.covers || []) addSym(c, `tested by ${(x.ac || []).find((a) => acIds.has(a))}`);
  const tests = [];
  const ownerChange = (T) => tasks.find((t) => t.id === T)?.change ?? lock.tasks?.[T]?.change ?? null;
  const archivedOf = ctx.archivedOf || ((T) => !!tasks.find((t) => t.id === T)?.archived || !!lock.tasks?.[T]?.archivedAt);
  for (const [id, x] of locked) {
    const byAc = (x.ac || []).filter((a) => acIds.has(a));
    const bySym = (x.covers || []).filter((c) => symbols.has(c));
    if (!byAc.length && !bySym.length) continue;
    tests.push({ id, title: testTitle(index, id), owner: x.task || null, change: ownerChange(x.task), archived: !!archivedOf(x.task), done: !!lock.tasks?.[x.task]?.doneAt,
      ac: x.ac || [], via: byAc.length ? byAc : bySym.map((c) => `covers ${S[c]?.name || shortName(c)}`) });
  }
  return { specs, decisions, acs, tasks: whyTasks, symbols: [...symbols.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), tests: tests.sort((a, b) => (a.id < b.id ? -1 : 1)) };
}

/**
 * Where each task of the change stands (round 1 facts): status, lock (skeleton, tests, done), the amend meta, and the
 * refs that touch it. statusOf(T) → computed status.
 */
export function whereTasksStand(tasks, change, { index, lock, api = null, refs = [], statusOf = () => null } = {}) {
  const mine = (tasks || []).filter((t) => t.change === change && !t.archived);
  const hit = touchedTasks(refs, mine, index, lock, api);
  return mine.map((t) => {
    const lt = lock?.tasks?.[t.id] || {};
    const testsLocked = !!lt.testsAt || Object.values(lock?.tests || {}).some((x) => x.task === t.id && x.stage === "locked");
    return { id: t.id, title: t.title, status: statusOf(t.id) || t.status || "todo", locked: { skeleton: !!lt.skeletonAt, tests: testsLocked, done: !!lt.doneAt },
      lockedWork: hasLockedTaskWork(lock, t.id), amend: t.amend || null, kind: t.kind || null, touched: hit[t.id] || [] };
  });
}

/** The per-state rule of shared/task-changes.md that applies to a task: edit | reopen | keep-done | dropped. */
export function stateRule(row) {
  if (row.status === DROPPED) return "dropped";
  if (row.locked.done || row.status === "done") return "keep-done";
  if (row.lockedWork || !["todo"].includes(row.status)) return "reopen";
  return "edit";
}

const label = (r) => ({ edit: "todo: edit in place or drop", reopen: "in progress: reopen in place, refresh its TODO steps", "keep-done": "done: never reopened; a new task takes over", dropped: "dropped" }[r]);

/**
 * Markdown of the facts a new amend brief starts with (header, Description, `## Where the change stands`,
 * `## Affected`), formatted the way prettier prints it. The model appends `## Round 1` (template amend-brief.md).
 */
export function renderAmendBriefHead({ change, key, amend, from = [], refs = [], skill = "plan", today, description, stands = [], affected, notes = [] }) {
  const L = [`# Amend brief — ${change} · ${amend}`, "",
    `> change: ${change} | key: ${key} | kind: amend | amend: ${amend} | from: ${from.length ? from.join(", ") : "none"} | refs: ${refs.length ? refs.join(", ") : "none"} | transition: — | skill: ${skill} | status: open | round: 1 | updated: ${today}`,
    `> next: answer the \`>\` lines, then run /hitl:${skill} ${change} amend`, "",
    "## Description", "", description || "(the change, in the user's words)", "",
    "## Where the change stands", "",
    "| task | title | status | locked | touched via | rule |", "| --- | --- | --- | --- | --- | --- |",
    ...stands.map((r) => `| ${r.id} | ${String(r.title).replace(/\|/g, "\\|")} | ${r.status} | ${[r.locked.skeleton && "skeleton", r.locked.tests && "tests", r.locked.done && "done"].filter(Boolean).join(", ") || "—"} | ${r.touched.join(", ") || "—"} | ${label(stateRule(r))} |`)];
  if (!stands.length) L.push("| — | no tasks yet | — | — | — | — |");
  L.push("", "## Affected", "");
  const a = affected || { specs: [], decisions: [], acs: [], tasks: [], symbols: [], tests: [] };
  const lines = [
    ...a.specs.map((x) => `- Spec: ${x.id}${x.title ? ` (${x.title})` : ""} — ${x.state === "ok" ? "in the change's view" : x.state}`),
    ...a.decisions.map((x) => `- Decision: ${x.id}${x.decision ? ` (${x.decision})` : ""} — ${x.status}`),
    ...a.acs.map((x) => `- AC: ${x.id} of ${x.task} — via ${x.via.join(", ")}${x.superseded ? ` (superseded by ${x.superseded.by})` : ""}`),
    ...a.tasks.map((x) => `- Task: ${x.id} — its Why cites ${x.via.join(", ")}`),
    ...a.symbols.map((x) => `- Symbol: ${x.name} — ${x.via.join(", ")}`),
    ...a.tests.map((x) => `- Test: ${x.title} — locked by ${x.owner || "?"}${x.archived ? ` (archived change ${x.change || "?"})` : x.done ? " (done)" : ""}; ${x.via.join(", ")}`),
    ...notes.map((n) => `- Note: ${n.id} (${n.title}) — ${n.status}${n.refs?.length ? `, refs ${n.refs.join(", ")}` : ""}`),
  ];
  L.push(...(lines.length ? lines : ["- nothing found by the traceability links (ACs, Why, @dec, locked tests)"]));
  return tidyMarkdown(L.join("\n")).replace(/\n+$/, "") + "\n";
}

// ---------------------------------------------------------------- checks of a written amend task set

/** Transitively: does task `b` (via blocked-by) come after task `a`? */
function after(byId, b, a, seen = new Set()) {
  for (const x of byId.get(b)?.blockedBy || []) {
    if (x === a) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    if (after(byId, x, a, seen)) return true;
  }
  return false;
}

/**
 * AMEND_ORDER: within one amendment, a task of a later kind comes after (blocked-by, transitively) every task of an
 * earlier kind (prep → expand → migrate → switch → contract); a kind the transition answer does not allow (expand or
 * migrate when the old behaviour is only in this branch); an expand without a contract (the old form would stay).
 * transitions: {<KEY>-A<n>: "branch"|"merged"|"released"|null}. Returns [{task, amend, message}].
 */
export function checkAmendOrder(tasks, transitions = {}) {
  const out = [];
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const groups = new Map();
  for (const t of tasks || []) if (t.amend && t.status !== DROPPED) { if (!groups.has(t.amend)) groups.set(t.amend, []); groups.get(t.amend).push(t); }
  for (const [A, ts] of groups) {
    const tr = transitions[A] || null;
    const allowed = tr ? TRANSITIONS[tr] : null;
    for (const t of ts) if (t.kind && allowed && !allowed.includes(t.kind))
      out.push({ task: t.id, amend: A, message: `AMEND_ORDER: ${t.id} kind ${t.kind} is for old behaviour that is merged or released; ${A} says it is only in this branch (transition: ${tr}): change it in place (switch) instead` });
    const ranked = ts.filter((t) => KIND_RANK[t.kind]);
    for (const b of ranked) for (const a of ranked) {
      if (KIND_RANK[a.kind] >= KIND_RANK[b.kind]) continue;
      if (!after(byId, b.id, a.id)) out.push({ task: b.id, amend: A, message: `AMEND_ORDER: ${b.id} (${b.kind}) must come after ${a.id} (${a.kind}) in ${A}: add blocked-by ${a.id}` });
    }
    if (ts.some((t) => t.kind === "expand") && !ts.some((t) => t.kind === "contract"))
      out.push({ task: ts.find((t) => t.kind === "expand").id, amend: A, message: `AMEND_ORDER: ${A} expands (${ts.filter((t) => t.kind === "expand").map((t) => t.id).join(", ")}) without a contract task: plan the removal of the old form in the same set` });
  }
  return out;
}

/**
 * AMEND_UNCOVERED: every item the amendment touches (amendAffected of its `refs:`) is handled by its task set, or
 * listed under `## Unchanged` in its brief with a reason. Handled means (shared/task-changes.md):
 * - an AC: its task carries `amend: <A>` (edited or reopened in place), the AC has a `superseded:` line, or its task is dropped;
 * - a task whose Why cites a changed decision: it carries `amend: <A>`, is dropped, or every AC is superseded;
 * - a spec id that is still in the view: some AC of a live task references it (a removed one needs no AC);
 * - a symbol: a task with `amend: <A>` names it in ### Symbols (modify or remove), or a task with `amend: <A>` owns it;
 * - a locked test of a done task or an archived change: a task with `amend: <A>` names it in a `rewrite:` or `covered:`
 *   row (tests of in-progress tasks reopen with their task).
 * Returns [{ref, kind, message}].
 */
export function checkAmendCoverage({ amend, brief, affected, tasks, index = { symbols: {} }, lock = {}, change }) {
  const out = [];
  const S = index.symbols || {};
  const unchanged = new Set((brief?.unchanged || []).map((u) => u.id));
  const isUnchanged = (...ids) => ids.some((x) => x && unchanged.has(x));
  const mine = (tasks || []).filter((t) => t.change === change && !t.archived);
  const byId = new Map(mine.map((t) => [t.id, t]));
  const setTasks = mine.filter((t) => t.amend === amend && t.status !== DROPPED);
  const file = brief?.file || `amend-${amend}-brief.md`;
  const miss = (ref, kind, what) => out.push({ ref, kind, message: `AMEND_UNCOVERED: ${ref} (${what}) — no task of ${amend} handles it: edit it under ${amend}, supersede it, drop its task, or list it under ## Unchanged in ${file} with a reason` });
  for (const a of affected.acs || []) {
    const t = byId.get(a.task);
    if (!t || t.status === DROPPED || t.amend === amend || a.superseded || t.acs.find((x) => x.id === a.id)?.superseded || isUnchanged(a.id, a.task)) continue;
    miss(a.id, "ac", `AC of ${a.task}, via ${a.via.join(", ")}`);
  }
  for (const x of affected.tasks || []) {
    const t = byId.get(x.id);
    if (!t || t.status === DROPPED || t.amend === amend || (t.acs.length && t.acs.every((a) => a.superseded)) || isUnchanged(x.id)) continue;
    miss(x.id, "task", `its Why cites ${x.via.join(", ")}`);
  }
  for (const s of affected.specs || []) {
    if (s.state !== "ok" || isUnchanged(s.id)) continue;
    const live = mine.filter((t) => t.status !== DROPPED).some((t) => t.acs.some((a) => !a.superseded && (a.reqs || []).some((r) => specRefsTouch(s.id, r) || specRefsTouch(r, s.id))));
    if (!live) miss(s.id, "spec", `${s.title || "spec id"}: no AC of a live task references it`);
  }
  for (const s of affected.symbols || []) {
    if (!(s.via || []).some((v) => !v.startsWith("tested by"))) continue; // reached only through a test: the test item covers it
    const named = setTasks.some((t) => (t.symbols || []).some((r) => `${r.file}#${r.ref}` === s.id || s.id.endsWith(`#${r.ref}`)));
    const owners = [...new Set([...(S[s.id]?.tags?.task || []), ...lockedTasks(lock.symbols?.[s.id])])];
    if (named || owners.some((T) => byId.get(T)?.amend === amend) || isUnchanged(s.id, s.name, shortName(s.id))) continue;
    miss(s.name, "symbol", s.via.join(", "));
  }
  for (const x of affected.tests || []) {
    const own = byId.get(x.owner);
    // a test of an in-progress task of this change reopens with its task; when its AC is affected the AC item reports it
    // (a test the set's own tasks own — before or after done — is the set's work)
    if (own && (own.amend === amend || own.status === DROPPED || (!x.done && x.via.some((v) => /\.AC\d+$/.test(v))))) continue;
    const named = setTasks.some((t) => (t.testPlan || []).some((r) => ["rewrite", "covered"].includes(r.test) && r.detail && resolveCovered(index, r.detail).includes(x.id)))
      || lock.tests?.[x.id]?.takenFrom;
    if (named || isUnchanged(x.id, x.title)) continue;
    miss(x.title, "test", `locked by ${x.owner || "?"}${x.archived ? ` of archived ${x.change || "?"}` : x.done ? " (done)" : ""}; ${x.via.join(", ")}`);
  }
  return out;
}

/** Affected-items context of one change for the CLI commands (amend start / check, tasks --check). */
export async function changeAmendCtx(root, config, changeId) {
  const { loadChangeCtx } = await import("../cmd/note.mjs");
  const c = await loadChangeCtx(root, config, changeId);
  const { resolveSpecRef } = await import("./changes.mjs");
  const briefs = await readAmendBriefs(root, c.entry.dir);
  const statusOf = (T) => c.g.statuses?.tasks?.[T]?.status ?? null;
  return { ...c, briefs, statusOf, affectedOf: (refs) => amendAffected({ refs, tasks: c.g.tasks, change: c.entry.id, view: c.view, resolveSpecRef: (v, r) => resolveSpecRef(v, r, c.ch),
    design: c.ch.design, index: c.g.index, lock: c.g.lock, resolve: c.resolve }) };
}

/** AMEND_ORDER and AMEND_UNCOVERED for every amendment of an active change that has tasks in tasks.md. */
export async function amendTaskErrors(root, config, tasks) {
  const out = [];
  const changes = [...new Set((tasks || []).filter((t) => t.amend && t.change && !t.archived).map((t) => t.change))];
  for (const change of changes) {
    let c;
    try { c = await changeAmendCtx(root, config, change); } catch { continue; }
    const transitions = Object.fromEntries(c.briefs.map((b) => [b.amend, normTransition(b.transition)]));
    for (const e of checkAmendOrder(c.tasks, transitions)) out.push({ task: e.task, file: c.tasks.find((t) => t.id === e.task)?.file ?? null, message: e.message });
    for (const b of c.briefs.filter((x) => x.status === "done" && x.amend && c.tasks.some((t) => t.amend === x.amend))) {
      for (const e of checkAmendCoverage({ amend: b.amend, brief: b, affected: c.affectedOf(b.refs), tasks: c.tasks, index: c.g.index, lock: c.g.lock, change }))
        out.push({ task: null, file: b.file, message: e.message });
    }
  }
  return out;
}
