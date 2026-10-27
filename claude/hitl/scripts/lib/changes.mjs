// Changes and living specs on disk (design v3 §2.1, §5.1, §6): listing, reading, the effective spec view, spec id
// allocation, change phase, validation, base hashes, and the merge/archive runner (atomic writes + folder move).
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "./project.mjs";
import { readJson, readText, writeTextAtomic, stableJson } from "./fsutil.mjs";
import { HITL_PREFIX } from "./paths.mjs";
import { ARCHIVE_DIR_RE, CAP_RE, NO_BEHAVIOUR_TYPES, allocate, archiveDirName, changeType, formatId, isChangeId, parseId, rewriteIds, sortIds } from "./specids.mjs";
const RX_CLAR = /\[NEEDS CLARIFICATION:/;
import { artifactDecision, bizLint, blockHash, findClarifications, parseDelta, parseDesign, parseGlossary, parseLivingSpec, parseProposal, usedIds } from "./specmd.mjs";
import { lintContract, lintFlow, lintRequirement, lintRule, lintStateMachines, vagueTermsFrom } from "./speclint.mjs";
import { GLOSSARY_REL, SPECS_REL, mergeChange, planCapability, specRel } from "./specmerge.mjs";
export { SPECS_REL };

export const CHANGES_REL = `${HITL_PREFIX}changes`;
export const ARCHIVE_REL = `${HITL_PREFIX}archive`;
export const BASE_SCHEMA = "hitl.spec-base/1";
/** Scratch files removed by archive (§4.5). */
export const SCRATCH = [".scout.json", ".spec-review.json"];
/** Codes the merge itself reports as conflicts; validate errors with these codes do not fail the merge precondition. */
const MERGE_CODES = new Set(["DELTA_ID_TAKEN", "DELTA_TARGET_MISSING", "DELTA_NEW_CAP_NOT_ADDED_ONLY", "PURPOSE_MISSING", "CAP_KEY_CHANGED", "CAP_EMPTY", "CAP_KEY_DUP", "BASE_CHANGED"]);

const ls = async (dir) => (await fs.readdir(dir, { withFileTypes: true }).catch(() => []));
const isDir = async (p) => !!(await fs.stat(p).catch(() => null))?.isDirectory();

// ---------------------------------------------------------------- listing + reading
/** listChanges(root, {archived}) -> [{id, dir (root-relative), archived, archiveDate}] — active (by id), then archived (by dir). */
export async function listChanges(root, { archived = true } = {}) {
  const P = paths(root); const out = [];
  for (const e of (await ls(P.changes)).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)))
    if (!e.name.startsWith(".") && e.name !== "archive") out.push({ id: e.name, dir: `${CHANGES_REL}/${e.name}`, archived: false, archiveDate: null });
  if (archived) for (const e of (await ls(P.archive)).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const m = e.name.match(ARCHIVE_DIR_RE);
    out.push({ id: m ? m[2] : e.name, dir: `${ARCHIVE_REL}/${e.name}`, archived: true, archiveDate: m ? m[1] : null });
  }
  return out;
}

/** Active change with this id, else the latest archived one; null when unknown. */
export async function findChange(root, id) {
  const all = await listChanges(root);
  return all.find((c) => !c.archived && c.id === id) || all.filter((c) => c.archived && (c.id === id || c.dir.endsWith(`/${id}`))).at(-1) || null;
}

/** readLiving(root) -> {specs: Map cap -> {doc, text, file}, glossary: {doc, text, file}|null} */
export async function readLiving(root) {
  const P = paths(root); const specs = new Map();
  for (const e of (await ls(P.specs)).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = specRel(e.name);
    const text = await readText(join(root, file), null);
    if (text !== null) specs.set(e.name, { doc: parseLivingSpec(text, file), text, file });
  }
  const gt = await readText(join(root, GLOSSARY_REL), null);
  return { specs, glossary: gt === null ? null : { doc: parseGlossary(gt, GLOSSARY_REL), text: gt, file: GLOSSARY_REL } };
}

/** readChange(root, entry) -> parsed change (proposal, deltas, glossary delta, design, contracts, tasks, base). */
export async function readChange(root, entry) {
  const dir = entry.dir; const abs = join(root, dir);
  const ch = { id: entry.id, dir, archived: entry.archived, archiveDate: entry.archiveDate, files: [], texts: new Map(),
    proposal: null, deltas: [], glossaryDelta: null, design: null, dataModel: false, contracts: [], contractTexts: new Map(), tasksFile: null, tasksDoc: null, base: {}, legacy: false };
  const read = async (rel) => { const t = await readText(join(root, rel), null); if (t !== null) { ch.files.push(rel); ch.texts.set(rel, t); } return t; };
  let t;
  if ((t = await read(`${dir}/proposal.md`)) !== null) ch.proposal = parseProposal(t, `${dir}/proposal.md`);
  for (const e of (await ls(join(abs, "specs"))).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = `${dir}/specs/${e.name}/spec.md`;
    if ((t = await read(rel)) !== null) { const d = parseDelta(t, rel); d.folder = e.name; ch.deltas.push(d); }
  }
  if ((t = await read(`${dir}/glossary.md`)) !== null) ch.glossaryDelta = parseGlossary(t, `${dir}/glossary.md`, { delta: true });
  if ((t = await read(`${dir}/design.md`)) !== null) ch.design = parseDesign(t, `${dir}/design.md`);
  ch.dataModel = (await readText(join(abs, "data-model.md"), null)) !== null;
  if (ch.dataModel) ch.files.push(`${dir}/data-model.md`);
  ch.contracts = (await listFilesRec(join(abs, "contracts"))).map((f) => `contracts/${f}`);
  ch.contractTexts = new Map();
  for (const f of ch.contracts) if (/\.(json|ya?ml|md)$/i.test(f)) {
    const st = await fs.stat(join(abs, f)).catch(() => null);
    if (st && st.size <= 1024 * 1024) { const ct = await readText(join(abs, f), null); if (ct !== null) ch.contractTexts.set(f, ct); }
  }
  if ((t = await read(`${dir}/tasks.md`)) !== null) {
    ch.tasksFile = `${dir}/tasks.md`;
    const { parseTasksMd } = await import("./tasksmd.mjs");
    ch.tasksDoc = parseTasksMd(t, ch.tasksFile);
  }
  ch.base = (await readJson(join(abs, ".base.json"), null))?.blocks || {};
  ch.legacy = (await readText(join(abs, ".legacy/planning.md"), null)) !== null;
  return ch;
}

async function listFilesRec(dir, pre = "") {
  const out = [];
  for (const e of await ls(dir)) {
    if (e.isDirectory()) out.push(...(await listFilesRec(join(dir, e.name), `${pre}${e.name}/`)));
    else if (e.isFile()) out.push(`${pre}${e.name}`);
  }
  return out.sort();
}

export async function readActiveChanges(root) {
  const out = [];
  for (const e of await listChanges(root, { archived: false })) out.push(await readChange(root, e));
  return out;
}

// ---------------------------------------------------------------- effective view (§5.1)
const viewBlock = (b, capability, origin) => ({ kind: b.kind, id: b.id, title: b.title, text: b.livingText ?? b.text, origin, capability,
  statement: b.statement ?? null, priority: b.priority ?? null, quality: b.quality ?? null, rules: b.rules || [], scenarios: (b.scenarios || []).map((s) => ({ id: s.id, title: s.title, steps: s.steps || [] })) });

/** effectiveView(living, change|null) -> {view:"living"|"change", change, capabilities: Map cap -> {key, blocks[], retired:Set}, ids:Set}.
 *  Active change: living ⊕ its deltas (REMOVED absent, MODIFIED replaced, ADDED appended). Archived/none: living only. */
export function effectiveView(living, change = null) {
  const caps = new Map();
  for (const [cap, l] of living.specs) caps.set(cap, { key: l.doc.key, blocks: l.doc.blocks.map((b) => viewBlock(b, cap, "living")), retired: new Set(l.doc.retired.map((r) => r.id)) });
  const active = change && !change.archived;
  if (active) for (const d of change.deltas) {
    const cap = d.capability || d.folder;
    if (!caps.has(cap)) caps.set(cap, { key: d.key, blocks: [], retired: new Set() });
    const c = caps.get(cap);
    for (const b of d.blocks) {
      const i = c.blocks.findIndex((x) => x.id === b.id);
      if (b.op === "REMOVED") { if (i >= 0) c.blocks.splice(i, 1); }
      else if (b.op === "MODIFIED") { if (i >= 0) c.blocks[i] = viewBlock(b, cap, "modified"); }
      else if (i < 0) c.blocks.push(viewBlock(b, cap, "added"));
    }
  }
  const ids = new Set();
  for (const c of caps.values()) for (const b of c.blocks) { ids.add(b.id); for (const s of b.scenarios) ids.add(s.id); }
  return { view: active ? "change" : "living", change: change?.id ?? null, capabilities: caps, ids };
}

// ---------------------------------------------------------------- spec context for task refs (§5.1, §5.3)
/**
 * loadSpecContext(root) -> {living, entries:[{entry, change, view}]} — every active and archived change with its effective
 * view (active: living ⊕ own deltas; archived: living). Used by tasks --check, trace, context, Linear.
 */
export async function loadSpecContext(root) {
  const living = await readLiving(root);
  const entries = [];
  for (const e of await listChanges(root)) {
    const change = await readChange(root, e);
    entries.push({ entry: e, change, view: effectiveView(living, change) });
  }
  return { living, entries };
}

/** The change context of a task: by its tasks file folder (changes/<id>, archive/<dir>), else by `← Change:` id
 *  (active first, else the latest archived). null when the task has no change or it is not found. */
export function changeForTask(ctx, task) {
  if (!ctx || !task) return null;
  if (task.changeDir) { const x = ctx.entries.find((c) => c.entry.dir === task.changeDir); if (x) return x; }
  if (!task.change) return null;
  return ctx.entries.find((c) => !c.entry.archived && c.entry.id === task.change)
    || ctx.entries.filter((c) => c.entry.archived && c.entry.id === task.change).at(-1) || null;
}

/** Block (and scenario) of a spec id in a view: {block, scenario, capability} or null. */
export function findInView(view, id) {
  const p = parseId(id);
  if (!p) return null;
  const want = p.kind === "S" ? p.req : p.id;
  for (const [cap, c] of view.capabilities) {
    const block = c.blocks.find((b) => b.id === want);
    if (!block) continue;
    if (p.kind !== "S") return { block, scenario: null, capability: cap };
    const scenario = block.scenarios.find((s) => s.id === id);
    return scenario ? { block, scenario, capability: cap } : null;
  }
  return null;
}

/**
 * resolveSpecRef(view, id, change) -> {status:"ok"|"removed"|"retired"|"unknown"|"bad", kind:"R"|"S"|"BR"|"UC"|null, block, scenario, capability}.
 * "removed": REMOVED (or a scenario dropped by MODIFIED) by the given active change; "retired": in some `## Retired IDs`.
 */
export function resolveSpecRef(view, id, change = null) {
  const p = parseId(id);
  if (!p) return { status: "bad", kind: null, block: null, scenario: null, capability: null };
  const hit = findInView(view, id);
  if (hit) return { status: "ok", kind: p.kind, ...hit };
  const want = p.kind === "S" ? p.req : p.id;
  if (change && !change.archived) for (const d of change.deltas) for (const b of d.blocks) {
    if (b.id !== want) continue;
    if (b.op === "REMOVED") return { status: "removed", kind: p.kind, block: null, scenario: null, capability: d.capability || d.folder };
    if (b.op === "MODIFIED" && p.kind === "S" && !(b.scenarios || []).some((s) => s.id === id)) return { status: "removed", kind: p.kind, block: null, scenario: null, capability: d.capability || d.folder };
  }
  for (const [cap, c] of view.capabilities) if (c.retired.has(id) || c.retired.has(want)) return { status: "retired", kind: p.kind, block: null, scenario: null, capability: cap };
  return { status: "unknown", kind: p.kind, block: null, scenario: null, capability: null };
}

/** Trace/check code for an unresolved spec ref kind. */
export const unknownCode = (kind) => (kind === "S" ? "SCN_UNKNOWN" : kind === "R" ? "REQ_UNKNOWN" : "RULE_UNKNOWN");

// ---------------------------------------------------------------- id allocation (§2.2)
/** Capability key from the living spec or any active delta; null when unknown. */
export function capabilityKey(living, changes, cap) {
  return living.specs.get(cap)?.doc.key || changes.flatMap((c) => c.deltas).find((d) => d.capability === cap && d.key)?.key || null;
}

/** Numbers in use for a capability: living (blocks, scenarios, retired) + every active change's delta. */
export function usedForCapability(living, changes, cap) {
  const used = usedIds(living.specs.get(cap)?.doc || null);
  for (const c of changes) for (const d of c.deltas) if (d.capability === cap) usedIds(d, used);
  return used;
}

/** nextSpecIds(living, changes, cap, kind "R"|"BR"|"UC", count) -> ["ACC-R5", …]; throws when the key is unknown. */
export function nextSpecIds(living, changes, cap, kind = "R", count = 1) {
  const key = capabilityKey(living, changes, cap);
  if (!key) throw Object.assign(new Error(`capability ${cap} has no key yet (no living spec and no delta declares one)`), { code: 1 });
  if (!["R", "BR", "UC"].includes(kind)) throw Object.assign(new Error("--kind takes R|BR|UC"), { usage: true });
  return allocate(usedForCapability(living, changes, cap)[kind], count).map((n) => formatId(key, kind, n));
}

/** nextScenarioIds(living, changes, reqId, count) -> ["ACC-R3.S3", …] (living + every active delta + retired scenarios). */
export function nextScenarioIds(living, changes, reqId, count = 1) {
  const p = parseId(reqId);
  if (!p || p.kind !== "R") throw Object.assign(new Error(`--scenario needs a requirement id (got ${reqId})`), { usage: true });
  const ks = new Set();
  for (const doc of [...[...living.specs.values()].map((l) => l.doc), ...changes.flatMap((c) => c.deltas)]) {
    const u = usedIds(doc);
    for (const k of u.S.get(reqId) || []) ks.add(k);
  }
  return allocate(ks, count).map((k) => `${reqId}.S${k}`);
}

// ---------------------------------------------------------------- tasks + phase (§6.4)
let statusCache = null;
/** Computed task statuses for a parsed tasks doc: {total, done, byStatus, notDone[], next (first not-done task's next)}. */
export async function taskCounts(root, config, tasksDoc) {
  const tasks = tasksDoc?.tasks || [];
  if (!tasks.length) return { total: 0, done: 0, byStatus: {}, notDone: [], next: null };
  if (!statusCache || statusCache.root !== root) {
    const [{ readIndex }, { readLock }, { readState }] = await Promise.all([import("./indexer.mjs"), import("./lock.mjs"), import("./state.mjs")]);
    statusCache = { root, index: (await readIndex(root).catch(() => null)) || { symbols: {}, files: {} }, lock: await readLock(root), state: await readState(root) };
  }
  const { computeStatuses } = await import("./status.mjs");
  const st = computeStatuses(statusCache.index, statusCache.lock, statusCache.state, config || {}, tasks).tasks;
  const out = { total: tasks.length, done: 0, byStatus: {}, notDone: [], next: null };
  for (const t of tasks) {
    const s = st[t.id]?.status || "todo";
    out.byStatus[s] = (out.byStatus[s] || 0) + 1;
    if (s === "done") out.done++;
    else { out.notDone.push(t.id); if (!out.next) out.next = st[t.id]?.next || `/hitl:implement ${t.id}`; }
  }
  return out;
}
export const resetStatusCache = () => { statusCache = null; };

export function designState(ch) {
  if (ch.design) return ch.design.status || "draft";
  return artifactDecision(ch.proposal, "design") === "skipped" ? "skipped" : "missing";
}

/** changePhase({archived, proposal, design, tasks, tasksSkipped, taskCounts}) -> phase (§6.4). */
export function changePhase({ archived, proposal, design, tasks, tasksSkipped = false, taskCounts: tc = { total: 0, done: 0 } }) {
  if (archived) return "archived";
  if (proposal !== "approved") return "spec";
  if (design !== "approved" && design !== "skipped") return "design";
  if (tasks === "missing" && tasksSkipped) return "archive-ready";
  if (tasks === "missing" || tasks === "draft") return "tasks";
  if (tc.done < tc.total) return "implement";
  return "archive-ready";
}

/** One hitl.change/1 entry. */
export async function changeInfo(root, config, ch) {
  const proposal = ch.proposal ? ch.proposal.status || "draft" : "missing";
  const design = designState(ch);
  const tasks = ch.tasksDoc ? ch.tasksDoc.status || "draft" : "missing";
  const tc = await taskCounts(root, config, ch.tasksDoc);
  const tasksSkipped = artifactDecision(ch.proposal, "tasks") === "skipped" || !!ch.proposal?.noBehaviourChange && !ch.deltas.length;
  const phase = changePhase({ archived: ch.archived, proposal, design, tasks, tasksSkipped, taskCounts: tc });
  const next = { spec: `/hitl:plan ${ch.id}`, design: `/hitl:design ${ch.id}`, tasks: `/hitl:tasks ${ch.id}`, implement: tc.next, "archive-ready": `/hitl:archive ${ch.id}`, archived: null }[phase];
  return { id: ch.id, dir: ch.dir, archived: ch.archived, title: ch.proposal?.title ?? null, proposal, design,
    capabilities: ch.deltas.map((d) => d.capability || d.folder), contracts: ch.contracts.length, tasksFile: ch.tasksFile, tasks,
    taskCounts: { total: tc.total, done: tc.done, byStatus: tc.byStatus }, phase, next };
}

// ---------------------------------------------------------------- validation (§6.1)
const IT = (level, code, file, ref, line, message) => ({ level, code, file: file ?? null, ref: ref ?? null, line: line ?? null, message });

/** validateLiving(living) -> {items, targets} */
export function validateLiving(living) {
  const items = []; const targets = [];
  const keyOwner = new Map(); const rules = new Set();
  for (const l of living.specs.values()) for (const b of l.doc.blocks) if (b.kind === "rule") rules.add(b.id);
  for (const [cap, l] of living.specs) {
    targets.push({ kind: "living", id: cap, files: [l.file] });
    items.push(...l.doc.items);
    if (l.doc.capability && l.doc.capability !== cap) items.push(IT("error", "SPEC_PARSE", l.file, cap, null, `meta capability "${l.doc.capability}" ≠ folder "${cap}"`));
    if (l.doc.key) {
      if (keyOwner.has(l.doc.key)) items.push(IT("error", "CAP_KEY_DUP", l.file, l.doc.key, null, `key ${l.doc.key} is used by ${keyOwner.get(l.doc.key)} and ${cap}`));
      else keyOwner.set(l.doc.key, cap);
    }
    for (const b of l.doc.blocks) for (const r of b.rules) if (!rules.has(r)) items.push(IT("error", "RULE_UNKNOWN", l.file, b.id, b.line, `${b.id} applies unknown rule ${r}`));
  }
  if (living.glossary) { targets.push({ kind: "living", id: "GLOSSARY", files: [living.glossary.file] }); items.push(...living.glossary.doc.items); }
  return { items, targets };
}

/**
 * validateChange({change, living, others, config}) -> {items, summary[], baseMissing{ID: hash}, target}.
 * Pure given parsed inputs; `others` = the other active changes.
 */
export function validateChange({ change: ch, living, others = [], config = {} }) {
  const items = []; const summary = []; const baseMissing = {};
  const push = (...a) => items.push(IT(...a));
  const proposalFile = `${ch.dir}/proposal.md`;
  if (!isChangeId(ch.id)) push("error", "ID_BAD_FORMAT", ch.dir, ch.id, null, `change id "${ch.id}" must match <type>-<slug> (≤ 48 chars)`);
  if (!ch.proposal) push("error", "PROPOSAL_SECTION_MISSING", proposalFile, ch.id, null, "proposal.md is missing");
  else {
    items.push(...ch.proposal.items);
    if (ch.proposal.change && ch.proposal.change !== ch.id) push("error", "SPEC_PARSE", proposalFile, ch.proposal.change, null, `proposal change "${ch.proposal.change}" ≠ folder "${ch.id}"`);
  }
  if (ch.glossaryDelta) items.push(...ch.glossaryDelta.items);
  const approved = ch.proposal?.status === "approved";
  const view = effectiveView(living, ch);
  const keyOwner = new Map([...living.specs].map(([cap, l]) => [l.doc.key, cap]));
  const termsAdded = { added: [], modified: [], removed: [] };
  for (const t of ch.glossaryDelta?.terms || []) termsAdded[t.op.toLowerCase()]?.push(t.term);
  let blockCount = 0;
  for (const d of ch.deltas) {
    items.push(...d.items);
    const cap = d.capability || d.folder;
    if (d.capability && d.capability !== d.folder) push("error", "SPEC_PARSE", d.file, d.capability, null, `delta capability "${d.capability}" ≠ folder specs/${d.folder}/`);
    if (!CAP_RE.test(d.folder)) push("error", "SPEC_PARSE", d.file, d.folder, null, `capability folder "${d.folder}" is not a valid capability name`);
    if (d.change && d.change !== ch.id) push("error", "SPEC_PARSE", d.file, d.change, null, `delta change "${d.change}" ≠ ${ch.id}`);
    const cur = living.specs.get(cap) || null;
    // two active changes both create the same not-yet-living capability: whichever archives second would carry a
    // ## Purpose for an existing capability (it replaces the living Purpose) — warn so one of them becomes "modified"
    if (!cur) for (const o of others) if (o.deltas.some((od) => (od.capability || od.folder) === cap))
      push("warn", "CAP_DUP_NEW", d.file, cap, null, `new capability ${cap} is also created by ${o.id}; archive one first, then turn the other's delta into a modification (drop its ## Purpose, capability change "modified")`);
    if (!cur && d.key) {
      if (keyOwner.has(d.key) && keyOwner.get(d.key) !== cap) push("error", "CAP_KEY_DUP", d.file, d.key, null, `key ${d.key} already belongs to living capability ${keyOwner.get(d.key)}`);
      for (const o of others) for (const od of o.deltas) if (od.key === d.key && od.capability !== cap && !living.specs.has(od.capability))
        push("error", "CAP_KEY_DUP", d.file, d.key, null, `key ${d.key} is also taken by new capability ${od.capability} in ${o.id}`);
    }
    blockCount += d.blocks.length;
    const r = planCapability({ living: cur?.doc || null, delta: d, change: ch.id, date: "0000-00-00", base: ch.base, retire: (ch.proposal?.capabilities || []).some((c) => c.capability === cap && c.change === "retired") });
    for (const c of r.conflicts) {
      const blk = d.blocks.find((b) => b.id === c.ref);
      push(c.code === "BASE_CHANGED" ? "warn" : "error", c.code, d.file, c.ref, blk?.line ?? null, c.message);
    }
    for (const w of r.warnings) push("warn", w.code, d.file, w.ref, null, w.message);
    // base hashes of MODIFIED/REMOVED targets, recorded the first time they appear
    for (const b of d.blocks) if (b.op !== "ADDED") {
      const lb = cur?.doc.blocks.find((x) => x.id === b.id);
      if (lb && !ch.base[b.id] && !(b.op === "MODIFIED" && lb.livingText === b.livingText)) baseMissing[b.id] = blockHash(lb.livingText);
    }
    // rules referenced by requirements must exist in the effective view
    for (const b of d.blocks) if (b.op !== "REMOVED") for (const ref of b.rules || []) if (!view.ids.has(ref)) push("error", "RULE_UNKNOWN", d.file, b.id, b.line, `${b.id} applies unknown rule ${ref}`);
    const ids = (op) => sortIds(d.blocks.filter((b) => b.op === op).map((b) => b.id));
    summary.push({ change: ch.id, capability: cap, key: d.key || cur?.doc.key || null, new: !cur, added: ids("ADDED"), modified: ids("MODIFIED"), removed: ids("REMOVED"), terms: termsAdded });
  }
  if (!ch.deltas.length && (termsAdded.added.length + termsAdded.modified.length + termsAdded.removed.length))
    summary.push({ change: ch.id, capability: null, key: null, new: false, added: [], modified: [], removed: [], terms: termsAdded });
  const hasDelta = blockCount > 0 || (ch.glossaryDelta?.terms?.length || 0) > 0;
  if (!hasDelta) {
    const okNone = ch.proposal?.noBehaviourChange && NO_BEHAVIOUR_TYPES.has(changeType(ch.id));
    if (!okNone) push("error", "DELTA_EMPTY", proposalFile, ch.id, null, ch.proposal?.noBehaviourChange
      ? `"none (no behaviour change)" is allowed only for ${[...NO_BEHAVIOUR_TYPES].join("/")} changes`
      : `change has no spec delta (add specs/<capability>/spec.md, or "none (no behaviour change)" in ## Capabilities)`);
  }
  if (ch.deltas.length > 5 || blockCount > 12) push("warn", "CHANGE_TOO_BIG", proposalFile, ch.id, null, `${ch.deltas.length} capabilities / ${blockCount} delta blocks: consider splitting the change`);
  // [NEEDS CLARIFICATION] in business files
  const bfiles = [proposalFile, ...ch.deltas.map((d) => d.file), ...(ch.glossaryDelta ? [ch.glossaryDelta.file] : [])];
  // stop rule of /hitl:plan (skills/plan/references/elicitation.md §4): no SHALL/MUST requirement with an open
  // clarification, every coverage category clear or n/a with a reason — unless the user forced it ("💡 Forced:" in
  // ## Open questions), which also keeps NEEDS_CLARIFICATION a warning in an approved change
  const forced = (ch.proposal?.forced || []).length > 0;
  for (const f of bfiles) for (const c of findClarifications(ch.texts.get(f) || ""))
    push(approved && !forced ? "error" : "warn", "NEEDS_CLARIFICATION", f, null, c.line, `${c.text}${approved ? (forced ? " in an approved change (forced)" : " in an approved change") : ""}`);
  for (const d of ch.deltas) for (const b of d.blocks)
    if (b.kind === "requirement" && b.op !== "REMOVED" && b.priority === "must" && RX_CLAR.test(b.text || ""))
      push(approved && !forced ? "error" : "warn", "REQ_UNCLEAR", d.file, b.id, b.line, `${b.id} is a SHALL/MUST requirement with an open [NEEDS CLARIFICATION]`);
  for (const c of ch.proposal?.coverage || []) {
    const gap = c.status === "partial" || c.status === "missing" || c.status === null || (c.status === "n/a" && !c.note.trim());
    if (gap) push(forced ? "info" : approved ? "error" : "warn", "COVERAGE_GAP", proposalFile, c.category, c.line,
      `coverage "${c.category}" is ${c.status === "n/a" ? "n/a without a reason" : c.status || "not marked (✅ ⚠️ ❌ —)"}${forced ? " (forced)" : ""}`);
  }
  // design
  if (ch.design) {
    items.push(...ch.design.items);
    for (const dec of ch.design.decisions) for (const s of dec.serves) if (!view.ids.has(s) || parseId(s)?.kind === "S")
      push("error", "DESIGN_SERVES_UNKNOWN", ch.design.file, dec.id, dec.line, `${dec.id} serves ${s}, which is not a requirement or rule in the change's spec view`);
    const listed = new Set(ch.design.contracts.map((c) => c.file));
    for (const c of ch.design.contracts) if (!ch.contracts.includes(c.file)) push("error", "CONTRACT_MISSING", ch.design.file, c.file, c.line, `${c.file} is listed in ## Contracts but does not exist`);
    for (const f of ch.contracts) if (!listed.has(f)) push("warn", "CONTRACT_UNLISTED", `${ch.dir}/${f}`, f, null, `${f} is not listed in design.md ## Contracts`);
    for (const x of lintStateMachines(ch.texts.get(ch.design.file) || "")) push(x.level, x.code, ch.design.file, x.ref, x.line, x.message);
  }
  // standards lints (shared/formats/*; always warnings): contracts, DMN tables, lifecycles, use cases, requirement quality
  for (const [f, text] of ch.contractTexts || []) for (const x of lintContract(f, text)) push(x.level, x.code, `${ch.dir}/${f}`, f, x.line, x.message);
  const qlint = config?.spec?.qualityLint ?? "warn";
  const vagueTerms = vagueTermsFrom(config);
  for (const d of ch.deltas) for (const b of d.blocks) {
    if (b.op === "REMOVED") continue;
    const found = b.kind === "rule" ? lintRule(b) : b.kind === "flow" ? lintFlow(b) : qlint === "off" ? [] : lintRequirement(b, { vagueTerms });
    for (const x of found) push(x.level, x.code, d.file, x.ref, x.line, x.message);
  }
  // business-language lint
  const lint = config?.spec?.businessLint ?? "warn";
  if (lint !== "off") {
    const terms = [...(living.glossary?.doc.terms || []).map((t) => t.term), ...(ch.glossaryDelta?.terms || []).map((t) => t.term)];
    for (const f of bfiles) for (const x of bizLint(ch.texts.get(f) || "", { terms }))
      push(lint === "error" ? "error" : "warn", "BIZ_CODE_TOKEN", f, x.token, x.line, `code-like token ${x.token} (${x.rule}) in a business file`);
  }
  // cross-change overlaps (full list: hitl-index spec conflicts)
  const mine = (ops) => ch.deltas.flatMap((d) => d.blocks.filter((b) => ops.includes(b.op)).map((b) => [b.id, d.file, b.line]));
  for (const o of others) {
    const theirs = (ops) => new Set(o.deltas.flatMap((d) => d.blocks.filter((b) => ops.includes(b.op)).map((b) => b.id)));
    const tm = theirs(["MODIFIED", "REMOVED"]); const ta = theirs(["ADDED"]);
    for (const [id, f, line] of mine(["MODIFIED", "REMOVED"])) if (tm.has(id)) push("warn", "CROSS_CHANGE_CONFLICT", f, id, line, `${id} is also modified/removed by ${o.id}`);
    for (const [id, f, line] of mine(["ADDED"])) if (ta.has(id)) push("warn", "ID_COLLISION", f, id, line, `${id} is also ADDED by ${o.id}`);
  }
  return { items, summary, baseMissing, target: { kind: "change", id: ch.id, files: [...ch.files] } };
}

const LEVEL_ORDER = { error: 0, warn: 1, info: 2 };
const sortItems = (items) => items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || String(a.file).localeCompare(String(b.file)) || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code));
export const countItems = (items) => ({ error: items.filter((i) => i.level === "error").length, warn: items.filter((i) => i.level === "warn").length, info: items.filter((i) => i.level === "info").length });

/** Merge new entries into <change>/.base.json; existing entries are never overwritten. Returns ids written. */
export async function recordBase(root, ch, missing) {
  const ids = Object.keys(missing || {}).filter((id) => !ch.base[id]);
  if (!ids.length || ch.archived) return [];
  const file = join(root, ch.dir, ".base.json");
  const cur = (await readJson(file, null))?.blocks || {};
  for (const id of ids) if (!cur[id]) cur[id] = missing[id];
  await writeTextAtomic(file, stableJson({ schema: BASE_SCHEMA, blocks: cur }));
  Object.assign(ch.base, cur);
  return ids.sort();
}

/**
 * validate(root, config, {change, living: onlyLiving, record}) -> hitl.spec-validate/1 (+ `strict` is applied by the caller).
 * Default target: every active change + the living specs.
 */
export async function validate(root, config, { change = null, livingOnly = false, record = true } = {}) {
  const living = await readLiving(root);
  const active = await readActiveChanges(root);
  const items = []; const targets = []; const summary = [];
  if (change) {
    const ch = active.find((c) => c.id === change);
    if (!ch) throw Object.assign(new Error(`no active change ${change} in ${CHANGES_REL}/`), { code: 1 });
  }
  if (!change) { const lv = validateLiving(living); items.push(...lv.items); targets.push(...lv.targets); }
  if (!livingOnly) for (const ch of active) {
    if (change && ch.id !== change) continue;
    const r = validateChange({ change: ch, living, others: active.filter((o) => o !== ch), config });
    if (record) await recordBase(root, ch, r.baseMissing);
    items.push(...r.items); targets.push(r.target); summary.push(...r.summary);
  }
  sortItems(items);
  const counts = countItems(items);
  return { schema: "hitl.spec-validate/1", ok: counts.error === 0, targets, counts, items, summary };
}

// ---------------------------------------------------------------- conflicts (§6.3)
export async function findConflicts(root) {
  const living = await readLiving(root);
  const active = await readActiveChanges(root);
  const conflicts = [];
  const group = (ops) => {
    const m = new Map();
    for (const c of active) for (const d of c.deltas) for (const b of d.blocks) if (ops.includes(b.op)) {
      const k = b.id; if (!m.has(k)) m.set(k, { capability: d.capability, changes: new Set() });
      m.get(k).changes.add(c.id);
    }
    return m;
  };
  for (const [ref, g] of group(["MODIFIED", "REMOVED"])) if (g.changes.size > 1) conflicts.push({ code: "CROSS_CHANGE_CONFLICT", ref, capability: g.capability, changes: [...g.changes].sort() });
  for (const [ref, g] of group(["ADDED"])) if (g.changes.size > 1) conflicts.push({ code: "ID_COLLISION", ref, capability: g.capability, changes: [...g.changes].sort() });
  for (const c of active) for (const d of c.deltas) {
    const cur = living.specs.get(d.capability);
    if (!cur) continue;
    for (const b of d.blocks) if (b.op !== "ADDED" && c.base[b.id]) {
      const lb = cur.doc.blocks.find((x) => x.id === b.id);
      if (lb && blockHash(lb.livingText) !== c.base[b.id] && lb.livingText !== b.livingText) conflicts.push({ code: "BASE_CHANGED", ref: b.id, capability: d.capability, changes: [c.id] });
    }
  }
  const keys = new Map();
  for (const [cap, l] of living.specs) if (l.doc.key) keys.set(l.doc.key, { caps: new Set([cap]), changes: new Set() });
  for (const c of active) for (const d of c.deltas) if (d.key && !living.specs.has(d.capability)) {
    if (!keys.has(d.key)) keys.set(d.key, { caps: new Set(), changes: new Set() });
    keys.get(d.key).caps.add(d.capability); keys.get(d.key).changes.add(c.id);
  }
  for (const [key, g] of keys) if (g.caps.size > 1) conflicts.push({ code: "CAP_KEY_DUP", ref: key, capability: [...g.caps].sort().join(","), changes: [...g.changes].sort() });
  conflicts.sort((a, b) => a.code.localeCompare(b.code) || a.ref.localeCompare(b.ref));
  // warnings (never change the exit code): the same not-yet-living capability declared new by ≥ 2 changes
  const warnings = []; const newCaps = new Map();
  for (const c of active) for (const d of c.deltas) {
    const cap = d.capability || d.folder;
    if (living.specs.has(cap)) continue;
    if (!newCaps.has(cap)) newCaps.set(cap, new Set());
    newCaps.get(cap).add(c.id);
  }
  for (const [cap, ids] of newCaps) if (ids.size > 1) warnings.push({ code: "CAP_DUP_NEW", ref: cap, capability: cap, changes: [...ids].sort() });
  return { schema: "hitl.spec-conflicts/1", conflicts, warnings };
}

// ---------------------------------------------------------------- atomic writes + move (§7.5)
export const DEFAULT_IO = {
  write: writeTextAtomic,
  remove: async (abs) => { await fs.rm(abs, { force: true }); await fs.rmdir(dirname(abs)).catch(() => {}); },
  rename: (a, b) => fs.rename(a, b),
};

/** commitWrites(root, writes[{file, text|null}], io) -> {restore()}. On a write error, restores every file and rethrows. */
export async function commitWrites(root, writes, io = DEFAULT_IO) {
  const originals = [];
  const restore = async () => {
    for (const o of originals.reverse()) {
      try { if (o.text === null) await fs.rm(o.abs, { force: true }); else await writeTextAtomic(o.abs, o.text); } catch { /* best effort */ }
    }
  };
  try {
    for (const w of writes) {
      const abs = join(root, w.file);
      originals.push({ abs, text: await readText(abs, null) });
      if (w.text === null) await io.remove(abs); else await io.write(abs, w.text);
    }
  } catch (e) { await restore(); throw e; }
  return { restore };
}

/** Move a directory; EXDEV (cross-device) falls back to copy + remove. */
export async function moveDir(from, to, io = DEFAULT_IO) {
  await fs.mkdir(dirname(to), { recursive: true });
  try { await io.rename(from, to); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await fs.rm(from, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- merge / archive runner (§6.5)
/**
 * runMerge(root, config, id, {archive, dryRun, force, renumber, acceptBase, date, io}) -> hitl.spec-merge/1.
 * Nothing is written when a precondition fails or a conflict exists (ok:false).
 */
export async function runMerge(root, config, id, { archive = false, dryRun = false, force = false, renumber = false, acceptBase = [], date, io = DEFAULT_IO } = {}) {
  const entry = (await listChanges(root, { archived: false })).find((c) => c.id === id);
  if (!entry) {
    const arch = await findChange(root, id);
    throw Object.assign(new Error(arch ? `${id} is already archived (${arch.dir})` : `no active change ${id} in ${CHANGES_REL}/`), { code: 1 });
  }
  const living = await readLiving(root);
  const active = await readActiveChanges(root);
  const ch = active.find((c) => c.id === id);
  const others = active.filter((c) => c !== ch);
  const v = validateChange({ change: ch, living, others, config });
  const vErrors = v.items.filter((i) => i.level === "error" && !MERGE_CODES.has(i.code));
  const reserved = new Map();
  for (const d of ch.deltas) {
    const u = { R: new Set(), BR: new Set(), UC: new Set() };
    for (const o of others) for (const od of o.deltas) if (od.capability === d.capability) { const x = usedIds(od); for (const k of ["R", "BR", "UC"]) for (const n of x[k]) u[k].add(n); }
    reserved.set(d.capability, u);
  }
  const m = mergeChange({ changeId: id, deltas: ch.deltas, glossaryDelta: ch.glossaryDelta, proposal: ch.proposal, living: living.specs, glossary: living.glossary,
    base: ch.base, acceptBase, renumber, reserved, date });
  let tasksPre = null; let tasksOk = true;
  if (archive) {
    const tc = await taskCounts(root, config, ch.tasksDoc);
    tasksPre = { total: tc.total, done: tc.done, notDone: tc.notDone };
    tasksOk = !tc.notDone.length || force || config?.spec?.archiveRequiresDone === false;
  }
  const archiveTo = `${ARCHIVE_REL}/${archiveDirName(date, id)}`;
  const conflicts = [...m.conflicts];
  if (archive && (await isDir(join(root, archiveTo)))) conflicts.push({ code: "ARCHIVE_EXISTS", ref: id, capability: null, message: `${archiveTo} already exists` });
  const ok = !vErrors.length && tasksOk && !conflicts.length;
  const out = {
    schema: "hitl.spec-merge/1", change: id, dryRun: !!dryRun, ok,
    capabilities: m.capabilities, glossary: m.glossary, conflicts,
    preconditions: { validate: vErrors.length ? "fail" : "ok", tasks: tasksPre },
    archive: archive ? { from: ch.dir, to: archiveTo, moved: false } : null,
  };
  if (vErrors.length) out.errors = vErrors;
  if (m.warnings.length) out.warnings = m.warnings;
  if (!ok || dryRun) return out;
  // renumber: rewrite ids inside the change folder only (deltas, design serves, tasks AC refs, proposal)
  const writes = [...m.writes];
  if (Object.keys(m.renumbered).length) {
    for (const [rel, text] of ch.texts) {
      const nt = rewriteIds(text, m.renumbered);
      if (nt !== text) writes.push({ file: rel, text: nt });
    }
  }
  if (acceptBase.length && JSON.stringify(m.base) !== JSON.stringify(ch.base)) writes.push({ file: `${ch.dir}/.base.json`, text: stableJson({ schema: BASE_SCHEMA, blocks: m.base }) });
  const tx = await commitWrites(root, writes, io);
  if (archive) {
    try {
      for (const s of SCRATCH) await fs.rm(join(root, ch.dir, s), { force: true });
      await moveDir(join(root, ch.dir), join(root, archiveTo), io);
    } catch (e) { await tx.restore(); throw e; }
    out.archive.moved = true;
  }
  out.written = writes.map((w) => w.file);
  return out;
}
