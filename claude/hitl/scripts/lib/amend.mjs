// Amendments (0.17): a change to an approved spec delta or design of an active change that is not wording only gets
// its own brief file, `.hitl/changes/<id>/amend-<KEY>-A<n>-brief.md` (shared/amend-spec.md, template
// shared/templates/amend-brief.md), and ends in an amend task set in tasks.md (shared/task-changes.md). This module is
// the deterministic part: the amendment id, the route (brief or chat), the facts of round 1 (where each task stands,
// what the amendment touches by the traceability links and, 0.18, by the dependency pass over the call graph), the hold
// on touched tasks while the brief is open, and the checks AMEND_ORDER, AMEND_UNCOVERED and (0.18, merged or released
// old behaviour) AMEND_TEMP_NO_REMOVAL and AMEND_CONTRACT_SAME_DEPLOY. Pure functions plus small IO; the model writes
// the questions and the tasks.
import { readAmendBriefs, openAmendBrief } from "./brief.mjs";
import { noteHitsTask, refKind, specRefsTouch } from "./notes.mjs";
import { coversOf, lockedTasks, noteCtxFor, resolveRefLocal } from "./lock.mjs";
import { AMEND_ID_RE, DROPPED, TASK_KINDS, TEMP_NEEDS_DEPLOY, hasLockedTaskWork } from "./tasksmd.mjs";
import { resolveRef } from "./graph.mjs";
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

// ---------------------------------------------------------------- dependency pass (0.18)

/** Default depth (hops) of the dependency pass and the most callers it lists (it stops there and says so). */
export const CALL_DEPTH = 1;
export const CALL_LIMIT = 200;
/** What the dependency pass cannot see (printed with its result, shared/amend-spec.md §3). */
export const CALL_LIMITS = "static calls the code index resolves (plus @calls tags); not dynamic calls (callbacks, injected objects, string dispatch), reflection, calls from other services, or files of languages the indexer does not parse";

const isTestSym = (s) => !!s && (s.kind === "test" || s.kind === "suite");

/** Words of an identifier or a phrase: camelCase and snake_case split, lower-case (`ResetToken` → reset, token). */
export function identWords(text) {
  return String(text || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
const pluralOk = (w, e) => w === e || w === `${e}s` || w === `${e}es`;
/** True when the word list holds the entity's words in a row (the last one may be plural). */
function hasWords(words, ent) {
  if (!ent.length) return false;
  for (let i = 0; i + ent.length <= words.length; i++) {
    let ok = true;
    for (let k = 0; k < ent.length && ok; k++) ok = k === ent.length - 1 ? pluralOk(words[i + k], ent[k]) : words[i + k] === ent[k];
    if (ok) return true;
  }
  return false;
}

/** Entity names of a data-model.md: the `### <Entity>` headings under `## Entities` (template placeholders skipped). */
export function dataModelEntities(text) {
  const out = [];
  let inEnt = false;
  for (const line of String(text || "").split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) { inEnt = /^Entities\b/i.test(h2[1]); continue; }
    const h3 = inEnt && /^###\s+(.+?)\s*$/.exec(line);
    if (h3 && !/[{}]/.test(h3[1])) out.push(h3[1].replace(/`/g, "").trim());
  }
  return [...new Set(out)];
}

/**
 * The dependency pass (Bohner & Arnold's "dependency impact analysis", beside the traceability links): for every seed
 * symbol (one the amendment changes or removes), its callers up to `depth` hops over the code index call graph (index
 * `callers` plus symbols whose `@calls` tag names it), the tests that cover those callers (`@covers` in the index,
 * `covers` of locked tests, else `@ac` of an AC of the caller's own task; code in a test file that calls a changed symbol
 * is listed with the tests, not as a caller), and the data-model entities whose name the
 * seeds or callers carry in their name, signature or intent. Bounded: at most `limit` callers (`truncated` says when it
 * stopped). Deterministic order (hop, then id).
 * seeds: [{id, via}]. Returns {depth, limit, seeds:[{id, name, via}], callers:[{id, name, file, hop, calls, seed, via, tests}],
 * tests:[{id, title, owner, locked, caller, via}], entities:[{name, symbols, via}], truncated, limits}.
 */
export function callPass({ index, lock = {}, seeds = [], depth = CALL_DEPTH, limit = CALL_LIMIT, entities = [] }) {
  const S = index?.symbols || {};
  const res = (ref, file) => (index?.files ? resolveRef(index, ref, file) : resolveRefLocal(index, ref, file));
  const nameOf = (id) => S[id]?.name || shortName(id);
  const seedList = [];
  for (const x of seeds) {
    if (!S[x.id] || isTestSym(S[x.id])) continue;
    const have = seedList.find((y) => y.id === x.id);
    if (have) { if (!have.via.includes(x.via)) have.via.push(x.via); } else seedList.push({ id: x.id, name: nameOf(x.id), via: [x.via] });
  }
  seedList.sort((a, b) => (a.id < b.id ? -1 : 1));
  const seedIds = new Set(seedList.map((x) => x.id));
  let callsTo = null; // @calls edges, built once on first use
  const tagCallers = (id) => {
    if (!callsTo) {
      callsTo = new Map();
      for (const [sid, s] of Object.entries(S)) for (const r of s.tags?.calls || []) {
        const x = res(r, s.file);
        if (x?.id) { if (!callsTo.has(x.id)) callsTo.set(x.id, []); callsTo.get(x.id).push(sid); }
      }
    }
    return callsTo.get(id) || [];
  };
  const callersOf = (id) => [...new Set([...(S[id]?.callers || []), ...tagCallers(id)])].filter((c) => c !== id && S[c] && !isTestSym(S[c])).sort();
  // code in a test file (a fixture or helper that calls a changed symbol) is listed with the tests, not as a caller
  const testFiles = new Set(Object.values(S).filter(isTestSym).map((t) => t.file));
  const helpers = new Map();
  const found = new Map();
  let truncated = false;
  let frontier = [...seedIds];
  for (let hop = 1; hop <= Math.max(1, depth) && frontier.length; hop++) {
    const next = [];
    for (const target of frontier) for (const c of callersOf(target)) {
      if (seedIds.has(c)) continue;
      if (testFiles.has(S[c].file)) { if (!helpers.has(c)) helpers.set(c, target); continue; }
      const have = found.get(c);
      if (have) { if (have.hop === hop && !have.calls.includes(target)) have.calls.push(target); continue; }
      if (found.size >= limit) { truncated = true; continue; }
      const seed = hop === 1 ? target : found.get(target)?.seed ?? target;
      found.set(c, { id: c, name: nameOf(c), file: S[c].file, hop, calls: [target], seed });
      next.push(c);
    }
    frontier = next;
  }
  const callers = [...found.values()].sort((a, b) => a.hop - b.hop || (a.id < b.id ? -1 : 1)).map((x) => ({ ...x,
    via: x.hop === 1 ? `calls ${x.calls.map(nameOf).join(", ")}` : `calls ${x.calls.map(nameOf).join(", ")} (${x.hop} hops from ${nameOf(x.seed)})` }));
  // tests of the callers
  const callerIds = new Set(callers.map((c) => c.id));
  const tests = new Map();
  const addTest = (tid, caller, via) => {
    if (tests.has(tid)) return;
    const l = lock?.tests?.[tid];
    tests.set(tid, { id: tid, title: testTitle(index, tid), owner: l?.task ?? null, locked: l?.stage === "locked", caller: nameOf(caller), via });
  };
  for (const [tid, t] of Object.entries(S)) {
    if (t.kind !== "test") continue;
    for (const c of coversOf(index, t)) if (callerIds.has(c)) addTest(tid, c, `covers ${nameOf(c)}`);
  }
  for (const [tid, l] of Object.entries(lock?.tests || {})) for (const c of l.covers || []) if (callerIds.has(c)) addTest(tid, c, `covers ${nameOf(c)}`);
  const noCovers = Object.entries(S).filter(([, t]) => t.kind === "test" && !coversOf(index, t).length && (t.tags?.ac || []).length);
  for (const c of callers) {
    const own = new Set([...(S[c.id]?.tags?.task || []), ...lockedTasks(lock?.symbols?.[c.id])]);
    if (!own.size) continue;
    for (const [tid, t] of noCovers) {
      if (tests.has(tid)) continue;
      const ac = t.tags.ac.find((a) => own.has(a.slice(0, a.indexOf(".AC"))));
      if (ac) addTest(tid, c.id, `@ac ${ac} (a test of ${nameOf(c.id)}'s task, no @covers)`);
    }
  }
  for (const [h, target] of [...helpers].sort(([a], [b]) => (a < b ? -1 : 1)))
    tests.set(h, { id: h, title: nameOf(h), owner: null, locked: false, caller: null, via: `test-file code that calls ${nameOf(target)}` });
  for (const c of callers) c.tests = [...tests.values()].filter((t) => t.caller === c.name).map((t) => t.id).sort();
  // data-model entities the seeds or callers name
  const ents = [];
  for (const name of entities) {
    const ew = identWords(name);
    const hits = [];
    for (const id of [...seedIds, ...callerIds]) {
      const s = S[id];
      const where = [["name", s.name], ["signature", s.signature], ["intent", s.intent]].filter(([, t]) => hasWords(identWords(t), ew)).map(([w]) => w);
      if (where.length) hits.push(`${nameOf(id)} (${where.join(", ")})`);
    }
    if (hits.length) ents.push({ name, symbols: hits.map((h) => h.replace(/ \(.*$/, "")), via: `named in ${hits.join(", ")}` });
  }
  return { depth: Math.max(1, depth), limit, seeds: seedList, callers, tests: [...tests.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), entities: ents, truncated, limits: CALL_LIMITS };
}

/**
 * What an amendment touches. Traceability links: specs (the spec refs and their state in the change's view),
 * decisions, ACs of the change's tasks that reference a changed spec id, tasks whose **Why** cites a changed decision,
 * symbols (tagged `@dec` with a changed decision, named by a ref, or covered by a locked test of an affected AC), and the
 * locked tests of affected ACs or covering affected symbols — also tests a task of an archived change locked (they may
 * assert the old behaviour). 0.18 dependency pass (`calls`, callPass): the callers of every symbol the amendment changes
 * or removes — `@dec` of a changed decision, a symbol ref, a symbol a `contract`-class AC's locked test covers, and the
 * `modify` / `remove` rows of the amendment's own tasks (`amend`) — with their tests and the data-model entities.
 * ctx: {refs, tasks (all tasks, any change), change (id), view?, resolveSpecRef?, design?, index, lock, resolve?, archivedOf?,
 * amend?, impact?:[{ref, class}], depth?, limit?, entities?:[names from data-model.md]}
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
  // 0.18 dependency pass: seeds = symbols the amendment changes or removes
  const contractRefs = new Set((ctx.impact || []).filter((e) => e.class === "contract").map((e) => e.ref));
  const contractAcs = new Set(acs.filter((a) => a.via.some((v) => contractRefs.has(v))).map((a) => a.id));
  const seeds = [];
  for (const x of symbols.values()) for (const v of x.via) if (!v.startsWith("tested by ") || contractAcs.has(v.slice(10))) seeds.push({ id: x.id, via: v });
  if (ctx.amend) for (const t of tasks.filter((x) => x.amend === ctx.amend && x.change === change && !x.archived && x.status !== DROPPED)) for (const r of t.symbols || []) {
    if (!["modify", "remove"].includes(r.change)) continue;
    const id = S[`${r.file}#${r.ref}`] ? `${r.file}#${r.ref}` : ctx.resolve?.(r.ref)?.id;
    if (id && S[id]) seeds.push({ id, via: `${r.change} row of ${t.id}` });
  }
  const calls = callPass({ index, lock, seeds, depth: ctx.depth ?? CALL_DEPTH, limit: ctx.limit ?? CALL_LIMIT, entities: ctx.entities || [] });
  return { specs, decisions, acs, tasks: whyTasks, symbols: [...symbols.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), tests: tests.sort((a, b) => (a.id < b.id ? -1 : 1)), calls };
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
  L.push(...callLines(a.calls));
  return tidyMarkdown(L.join("\n")).replace(/\n+$/, "") + "\n";
}

/**
 * The `### Reached through calls` group of `## Affected` (0.18): the changed symbols the pass started from, their
 * callers with how each was reached, the callers' tests and data-model entities, and what the pass cannot see.
 */
export function callLines(calls) {
  if (!calls) return [];
  const L = ["", `### Reached through calls (${calls.depth} hop${calls.depth === 1 ? "" : "s"})`, "",
    `Code index call graph, from the symbols the amendment changes or removes. It sees ${calls.limits}.`, ""];
  if (!calls.seeds.length) return [...L, "- no changed symbol yet (a symbol ref, a @dec of a changed decision, or a modify/remove row of the amendment's tasks)"];
  L.push(...calls.seeds.map((x) => `- Changed: ${x.name} — ${x.via.join(", ")}`));
  L.push(...calls.callers.map((x) => `- Caller: ${x.name} — ${x.via}${x.tests.length ? `; ${x.tests.length} test(s)` : "; no test covers it"}`));
  L.push(...calls.tests.map((x) => `- Caller test: ${x.title} — ${x.via}${x.locked ? `; locked by ${x.owner}` : ""}`));
  L.push(...calls.entities.map((x) => `- Data: ${x.name} (data-model.md) — ${x.via}`));
  if (!calls.callers.length) L.push("- no callers found");
  if (calls.truncated) L.push(`- stopped at ${calls.limit} callers: the list is incomplete`);
  return L;
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
    // 0.18: merged or released old behaviour — a contract never stands free of the work it cleans up after
    if (tr === "merged" || tr === "released") for (const t of ts) {
      if (t.kind !== "contract" || (t.blockedBy || []).length || ranked.some((x) => KIND_RANK[x.kind] < KIND_RANK.contract)) continue;
      out.push({ task: t.id, amend: A, message: `AMEND_ORDER: ${t.id} (contract) has blocked-by: none; the old behaviour of ${A} is ${tr}: a contract runs after the expand, migrate and switch tasks it cleans up after (name them in blocked-by)` });
    }
    // 0.18: deploy groups follow blocked-by (a task never ships before a task it waits for)
    for (const t of ts) for (const b of t.blockedBy || []) {
      const x = byId.get(b);
      if (t.deploy != null && x?.amend === A && x.deploy != null && x.status !== DROPPED && x.deploy > t.deploy)
        out.push({ task: t.id, amend: A, message: `AMEND_ORDER: ${t.id} (deploy: ${t.deploy}) is blocked by ${b} (deploy: ${x.deploy}): a task ships in the same or a later deploy than the tasks it waits for` });
    }
  }
  return out;
}

/**
 * 0.18 — temporary items of a merged or released amendment (shared/formats/parallel-change.md). In a set whose
 * transition is `merged` or `released` (in-branch sets: no temp rule):
 * - AMEND_TEMP_NO_REMOVAL: every `expand` names at least one temporary item (`**Temp**: <name> (<type>) — <what>`:
 *   the old form kept alive, a dual write, a flag, a compatibility shim, an old API version, a dual-published event);
 *   every temporary item of the set is removed by a `contract` task of the set (`**Removes**: <name>`, or a `remove`
 *   Symbols row of that symbol); a `**Removes**:` name is a temporary item of the set;
 * - AMEND_CONTRACT_SAME_DEPLOY: a contract that removes a `data`, `api` or `event` item ships in a later deploy group
 *   than the task that added it (`deploy: <n>` in the meta line; a task without one is deploy 1); with `released`
 *   the contract must name its deploy group.
 * transitions: {<KEY>-A<n>: "branch"|"merged"|"released"|null}. Returns [{task, amend, code, message}].
 */
export function checkAmendTemp(tasks, transitions = {}) {
  const out = [];
  const groups = new Map();
  for (const t of tasks || []) if (t.amend && t.status !== DROPPED) { if (!groups.has(t.amend)) groups.set(t.amend, []); groups.get(t.amend).push(t); }
  for (const [A, ts] of groups) {
    const tr = transitions[A] || null;
    if (tr !== "merged" && tr !== "released") continue;
    const push = (task, code, message) => out.push({ task, amend: A, code, message: `${code}: ${message}` });
    const temps = new Map();
    for (const t of ts) for (const x of t.temps || []) {
      if (temps.has(x.name)) push(t.id, "AMEND_TEMP_NO_REMOVAL", `${t.id} declares temporary item ${x.name}, which ${temps.get(x.name).task} declares already: give each item one name`);
      else temps.set(x.name, { ...x, task: t.id, deploy: t.deploy ?? 1 });
    }
    for (const t of ts) if (t.kind === "expand" && !(t.temps || []).length)
      push(t.id, "AMEND_TEMP_NO_REMOVAL", `${t.id} (expand) names no temporary item: add "**Temp**: <name> (data|api|event|flag|shim) — <what>" for each thing that lets the old and the new form live side by side (the old form kept, a dual write, a flag, a shim), so a contract task can remove it`);
    const contracts = ts.filter((t) => t.kind === "contract");
    const removes = (c, name) => (c.removes || []).includes(name) || (c.symbols || []).some((r) => r.change === "remove" && (r.ref === name || `${r.file}#${r.ref}` === name || name.endsWith(`#${r.ref}`) || name.endsWith(`.${r.ref}`)));
    for (const [name, x] of temps) {
      const by = contracts.filter((c) => removes(c, name));
      if (!by.length) { push(x.task, "AMEND_TEMP_NO_REMOVAL", `temporary item ${name} (${x.type}) of ${x.task} has no contract task in ${A} that removes it: add a contract task with "**Removes**: ${name}" (or a remove row), blocked by ${x.task}`); continue; }
      if (!TEMP_NEEDS_DEPLOY.includes(x.type)) continue;
      for (const c of by) {
        if (c.deploy == null) {
          if (tr === "released") push(c.id, "AMEND_CONTRACT_SAME_DEPLOY", `${c.id} removes ${name} (${x.type}) of released behaviour (${A}): name its deploy group in the meta line (deploy: ${x.deploy + 1} or later; ${x.task} is deploy ${x.deploy}) so the drop ships after every reader and writer of the old form is gone`);
        } else if (c.deploy <= x.deploy)
          push(c.id, "AMEND_CONTRACT_SAME_DEPLOY", `${c.id} (deploy: ${c.deploy}) removes ${name} (${x.type}) that ${x.task} adds in deploy ${x.deploy}: the drop ships in a later deploy (deploy: ${x.deploy + 1} or later)`);
      }
    }
    for (const c of contracts) for (const name of c.removes || []) if (!temps.has(name))
      push(c.id, "AMEND_TEMP_NO_REMOVAL", `${c.id} removes ${name}, which no task of ${A} declares (**Temp**: ${name} (<type>) — <what>)`);
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
 *   row (tests of in-progress tasks reopen with their task);
 * - a caller the dependency pass found (0.18, `affected.calls`): a task with `amend: <A>` names it in ### Symbols or owns
 *   it, or `## Unchanged` lists it with a reason (e.g. "signature-compatible").
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
  for (const c of affected.calls?.callers || []) {
    const named = setTasks.some((t) => (t.symbols || []).some((r) => `${r.file}#${r.ref}` === c.id || c.id.endsWith(`#${r.ref}`)));
    const owners = [...new Set([...(S[c.id]?.tags?.task || []), ...lockedTasks(lock.symbols?.[c.id])])];
    if (named || owners.some((T) => byId.get(T)?.amend === amend && byId.get(T)?.status !== DROPPED) || isUnchanged(c.id, c.name, shortName(c.id))) continue;
    out.push({ ref: c.name, kind: "caller", message: `AMEND_UNCOVERED: ${c.name} (a caller: ${c.via}) — no task of ${amend} handles it: name it in ### Symbols of a task of ${amend}, or list it under ## Unchanged in ${file} with a reason (e.g. "signature-compatible")` });
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
  const { promises: fsp } = await import("node:fs");
  const { join } = await import("node:path");
  const entities = dataModelEntities(await fsp.readFile(join(root, c.entry.dir, "data-model.md"), "utf8").catch(() => ""));
  return { ...c, briefs, statusOf, entities, affectedOf: (refs, o = {}) => amendAffected({ refs, tasks: c.g.tasks, change: c.entry.id, view: c.view, resolveSpecRef: (v, r) => resolveSpecRef(v, r, c.ch),
    design: c.ch.design, index: c.g.index, lock: c.g.lock, resolve: c.resolve, entities, ...o }) };
}

/** AMEND_ORDER, AMEND_TEMP_NO_REMOVAL, AMEND_CONTRACT_SAME_DEPLOY and AMEND_UNCOVERED for every amendment of an active
 *  change that has tasks in tasks.md. */
export async function amendTaskErrors(root, config, tasks) {
  const out = [];
  const changes = [...new Set((tasks || []).filter((t) => t.amend && t.change && !t.archived).map((t) => t.change))];
  for (const change of changes) {
    let c;
    try { c = await changeAmendCtx(root, config, change); } catch { continue; }
    const transitions = Object.fromEntries(c.briefs.map((b) => [b.amend, normTransition(b.transition)]));
    for (const e of [...checkAmendOrder(c.tasks, transitions), ...checkAmendTemp(c.tasks, transitions)]) out.push({ task: e.task, file: c.tasks.find((t) => t.id === e.task)?.file ?? null, message: e.message });
    for (const b of c.briefs.filter((x) => x.status === "done" && x.amend && c.tasks.some((t) => t.amend === x.amend))) {
      for (const e of checkAmendCoverage({ amend: b.amend, brief: b, affected: c.affectedOf(b.refs, { amend: b.amend }), tasks: c.tasks, index: c.g.index, lock: c.g.lock, change }))
        out.push({ task: null, file: b.file, message: e.message });
    }
  }
  return out;
}
