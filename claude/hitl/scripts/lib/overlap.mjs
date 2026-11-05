// Overlap candidates between one change and the other active changes (0.12; the evidence of 0.10 coupling, without
// links or levels). Deterministic only: it lists the shared keys (ids, rules, decisions, contracts, symbols, files,
// glossary terms, capabilities) and a small pack of the other change's text for the plan/design judge. It never judges
// and never writes. No candidates → nothing for the LLM to judge (research: an LLM alone misses most conflicts; a
// shared-entity pre-filter and a whole-cluster judge with a quoted witness work much better).
import { join } from "node:path";
import { readText } from "./fsutil.mjs";
import { lockedTasks, symbolDrift, taskSymbolIds } from "./lock.mjs";
import { fileOfId } from "./graph.mjs";
import { specRefsTouch } from "./notes.mjs";

const CHANGED_OPS = ["MODIFIED", "REMOVED"];
/** Evidence types that name the same behaviour or code (the rest only say "same area"). */
export const SHARED_TYPES = new Set(["same-id", "ac-ref", "serves-ref", "rule-ref", "symbol", "contract", "file", "term"]);
const PACK_MAX = 6;

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

const PATH_RE = /(?:^|[\s`(,])((?:[\w.-]+\/)*[\w.-]+\.(?:[a-z]{1,5}))(?=[\s`),:]|$)/gi;
/** Source files a change names: its task symbol files, design `## Components` paths and (plan time) its scout's sources. */
export function changeFiles(ch, scout = null) {
  const out = new Set();
  for (const t of ch?.tasksDoc?.tasks || []) for (const s of t.symbols || []) if (s.file) out.add(s.file);
  for (const sec of ["Components", "Data model"]) for (const m of String(ch?.design?.sections?.[sec] || "").matchAll(PATH_RE)) if (m[1].includes("/")) out.add(m[1]);
  for (const x of [...(scout?.behaviourFacts || []), ...(scout?.vocabulary || [])]) if (typeof x?.source === "string") for (const f of x.source.split(/[,\s]+/)) if (f.includes("/")) out.add(f.replace(/[#:].*$/, ""));
  return out;
}

/** Glossary terms a change adds or modifies, by casefold key -> term. */
const deltaTerms = (ch) => new Map((ch?.glossaryDelta?.terms || []).filter((t) => t.op !== "REMOVED").map((t) => [String(t.term).toLowerCase(), t.term]));
/** Text of a change's business files (deltas + proposal), lower case. */
const bizText = (ch) => [...(ch?.deltas || []).flatMap((d) => d.blocks.map((b) => `${b.title || ""} ${b.text || ""}`)), ch?.proposal?.sections?.["What changes"] || ""].join("\n").toLowerCase();

/**
 * overlapEvidence(a, b, {index, lock, resolve, scoutA, scoutB}) -> {shared:boolean, evidence:[{type, ref, detail}], refsB:[ref]}.
 * a = the change being planned/designed, b = another active change. `refsB` = b's own ids the evidence touches (the
 * refs a note in b would carry). Types: same-id, ac-ref, serves-ref, rule-ref, symbol, contract, file, term (shared)
 * and capability (same area only).
 */
export function overlapEvidence(a, b, { index = null, lock = null, resolve = null, scoutA = null, scoutB = null } = {}) {
  const ev = [], refsB = new Set();
  const push = (type, ref, detail, refs = []) => { if (!ev.some((e) => e.type === type && e.ref === ref)) ev.push({ type, ref, detail }); for (const r of refs) refsB.add(r); };
  const modA = changedIds(a), modB = changedIds(b);
  const acsB = acsOf(b);
  const acsTouching = (acs, id) => acs.filter((x) => x.reqs.some((r) => specRefsTouch(id, r)));
  for (const [id, x] of modA) if (modB.has(id)) push("same-id", id, `${x.op} by ${a.id}, ${modB.get(id).op} by ${b.id}`, [id, ...acsTouching(acsB, id).map((y) => y.ac)]);
  const crossRefs = (from, to, mod, refsOf) => {
    for (const [id, x] of mod) {
      const acs = acsTouching(acsOf(to), id).map((y) => y.ac);
      if (acs.length) push("ac-ref", id, `${x.op} by ${from.id}; ${to.id} ${acs.join(", ")} name it`, refsOf(id, acs));
      const decs = liveDecisions(to).filter((d) => d.serves.includes(id)).map((d) => d.id);
      if (decs.length) push("serves-ref", id, `${x.op} by ${from.id}; ${to.id} ${decs.join(", ")} serve it`, refsOf(id, decs));
      const users = (to.deltas || []).flatMap((d) => d.blocks.filter((bl) => bl.op !== "REMOVED" && (bl.rules || []).includes(id)).map((bl) => bl.id));
      if (users.length) push("rule-ref", id, `${x.op} by ${from.id}; ${to.id} ${users.join(", ")} apply it`, refsOf(id, users));
    }
  };
  crossRefs(a, b, modA, (id, own) => own); // b's ACs / decisions / blocks use what a changes → refs in b's words
  crossRefs(b, a, modB, (id) => [id]); // a uses what b changes → b's changed id
  if (index || lock) {
    const sa = changeSymbols(a, index, lock), sb = changeSymbols(b, index, lock);
    for (const [id, ta] of sa) if (sb.has(id)) {
      const ref = symbolRef(index || { symbols: {} }, id, resolve);
      push("symbol", ref, `${a.id} ${ta.join(", ")} and ${b.id} ${sb.get(id).join(", ")}`, [ref]);
    }
  }
  for (const f of (a.contracts || []).filter((x) => (b.contracts || []).includes(x))) push("contract", f, `both changes have ${f}`, decisionsNaming(b, f).map((d) => d.id));
  const fb = changeFiles(b, scoutB);
  for (const f of changeFiles(a, scoutA)) if (fb.has(f)) push("file", f, `both changes touch ${f}`);
  const ta = deltaTerms(a), tb = deltaTerms(b), textA = bizText(a), textB = bizText(b);
  for (const [k, term] of ta) if (tb.has(k)) push("term", term, `both glossary deltas define "${term}"`);
  for (const [k, term] of tb) if (!ta.has(k) && k.length >= 4 && textA.includes(k)) push("term", term, `${b.id} defines "${term}"; ${a.id} uses it`);
  for (const [k, term] of ta) if (!tb.has(k) && k.length >= 4 && textB.includes(k)) push("term", term, `${a.id} defines "${term}"; ${b.id} uses it`);
  const capsB = new Set((b.deltas || []).map((d) => d.capability || d.folder));
  for (const d of a.deltas || []) { const c = d.capability || d.folder; if (capsB.has(c)) push("capability", c, `both change ${c}`); }
  const titles = new Map([...(b.deltas || []), ...(a.deltas || [])].flatMap((d) => d.blocks.filter((bl) => bl.title).map((bl) => [bl.id, bl.title])));
  for (const e of ev) if (titles.has(e.ref)) e.title = titles.get(e.ref);
  return { shared: ev.some((e) => SHARED_TYPES.has(e.type)), evidence: ev, refsB: [...refsB] };
}

/**
 * Source files of a change's tasks with where each comes from: Map file -> [label] (a task id for its `### Symbols`
 * rows, its tagged or locked symbols; `scout` for a plan-time scout source). Design paths are not code evidence.
 */
export function changeCodeFiles(ch, index, lock, scout = null) {
  const out = new Map();
  const add = (f, label) => { if (!f) return; if (!out.has(f)) out.set(f, []); if (!out.get(f).includes(label)) out.get(f).push(label); };
  for (const t of ch?.tasksDoc?.tasks || []) for (const s of t.symbols || []) add(s.file, t.id);
  for (const [id, ts] of changeSymbols(ch, index, lock)) for (const T of ts) add(index?.symbols?.[id]?.file || (id.includes("#") ? fileOfId(id) : null), T);
  for (const x of [...(scout?.behaviourFacts || []), ...(scout?.vocabulary || [])]) if (typeof x?.source === "string")
    for (const f of x.source.split(/[,\s]+/)) if (f.includes("/")) add(f.replace(/[#:].*$/, ""), "scout");
  return out;
}

/**
 * codeOverlap(a, b, {index, lock, resolve, scoutA, scoutB}) -> {symbols, files, drift} (0.13.1, code-level evidence):
 * - symbols: [{ref, id, a:[T…], b:[T…]}] — symbols both changes' tasks name, tag or locked;
 * - files:   [{file, a:[T…|scout], b:[…]}] — source files both changes' tasks (or scouts) touch;
 * - drift:   [{ref, id, file, tasks:[a's T…], changed:[sig|intent|todo|body|deleted], b:[…]}] — a's locked symbols in a
 *            file b touches whose code no longer matches a's lock (b's work may already have changed them).
 */
export function codeOverlap(a, b, { index = null, lock = null, resolve = null, scoutA = null, scoutB = null } = {}) {
  const idx = index || { symbols: {} };
  const sa = changeSymbols(a, index, lock), sb = changeSymbols(b, index, lock);
  const symbols = [...sa].filter(([id]) => sb.has(id)).map(([id, ta]) => ({ ref: symbolRef(idx, id, resolve), id, a: ta, b: sb.get(id) }));
  const fa = changeCodeFiles(a, index, lock, scoutA), fb = changeCodeFiles(b, index, lock, scoutB);
  const files = [...fa].filter(([f]) => fb.has(f)).map(([file, la]) => ({ file, a: la, b: fb.get(file) })).sort((x, y) => x.file.localeCompare(y.file));
  const tasksA = new Set((a?.tasksDoc?.tasks || []).map((t) => t.id));
  const drift = [];
  for (const [id, l] of Object.entries(lock?.symbols || {})) {
    const own = lockedTasks(l).filter((T) => tasksA.has(T));
    if (!own.length) continue;
    const s = idx.symbols?.[id];
    const file = s?.file || (id.includes("#") ? fileOfId(id) : null);
    if (!file || !fb.has(file)) continue;
    const d = symbolDrift(lock, id, s);
    const changed = s ? ["sig", "intent", "todo", "body"].filter((k) => d[k]) : ["deleted"];
    if (changed.length) drift.push({ ref: symbolRef(idx, id, resolve), id, file, tasks: own, changed, b: fb.get(file) });
  }
  return { symbols, files, drift };
}

/** Any code-level evidence? */
export const hasCode = (c) => !!(c && (c.symbols.length || c.files.length || c.drift.length));

/** One-line code summary: `symbols settle (A1 · B1) · files src/settle.ts · drift settle body`. */
export function codeLine(c, a = "a", b = "b") {
  const parts = [];
  if (c.symbols.length) parts.push(`symbols ${c.symbols.map((s) => `${s.ref} (${a} ${s.a.join(",")} · ${b} ${s.b.join(",")})`).join(", ")}`);
  if (c.files.length) parts.push(`files ${c.files.map((f) => `${f.file} (${a} ${f.a.join(",")} · ${b} ${f.b.join(",")})`).join(", ")}`);
  if (c.drift.length) parts.push(`drift ${c.drift.map((d) => `${d.ref} ${d.changed.join("/")} (${a} ${d.tasks.join(",")})`).join(", ")}`);
  return parts.join(" · ") || "none";
}

/**
 * Text of `b` for the judge (max PACK_MAX blocks): the blocks the evidence names first, then b's ADDED blocks in a shared
 * capability (two new requirements on the same trigger have no shared id), plus b's decisions naming a shared contract.
 */
export function overlapPack(a, b, evidence) {
  const named = new Set(evidence.filter((e) => ["same-id", "ac-ref", "serves-ref", "rule-ref"].includes(e.type)).map((e) => e.ref));
  const caps = new Set(evidence.filter((e) => e.type === "capability").map((e) => e.ref));
  const all = (b.deltas || []).flatMap((d) => d.blocks.map((bl) => ({ d, bl })));
  const touches = (bl) => named.has(bl.id) || [...named].some((id) => specRefsTouch(id, bl.id)) || (bl.rules || []).some((r) => named.has(r));
  const pick = [...all.filter((x) => touches(x.bl)), ...all.filter((x) => !touches(x.bl) && x.bl.op === "ADDED" && caps.has(x.d.capability || x.d.folder))].slice(0, PACK_MAX);
  const contracts = new Set(evidence.filter((e) => e.type === "contract").map((e) => e.ref));
  return {
    blocks: pick.map(({ d, bl }) => ({ id: bl.id, op: bl.op, capability: d.capability || d.folder, title: bl.title || null, text: bl.text || "" })),
    decisions: liveDecisions(b).filter((d) => [...contracts].some((f) => decisionsNaming({ design: { decisions: [d] } }, f).length)).map((d) => ({ id: d.id, decision: d.decision, serves: d.serves })),
    truncated: all.filter((x) => touches(x.bl)).length > PACK_MAX,
  };
}

/** Index, lock and a symbol resolver for evidence (empty when the project has none yet). */
export async function evidenceContext(root) {
  const [{ readIndex }, { readLock }, { resolveRef }] = await Promise.all([import("./indexer.mjs"), import("./lock.mjs"), import("./graph.mjs")]);
  const index = (await readIndex(root).catch(() => null)) || { symbols: {}, files: {} };
  const lock = await readLock(root).catch(() => ({ symbols: {}, tasks: {}, tests: {} }));
  return { index, lock, resolve: (r) => resolveRef(index, r) };
}

/** The scout output of a change (`.scout.json`, plan time), or null. */
export async function readScout(root, dir) {
  const t = await readText(join(root, dir, ".scout.json"), null);
  if (t === null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** One-line evidence summary: `ACC-R1 same-id · UserService.createUser symbol`. */
export const evidenceLine = (ev) => ev.map((e) => `${e.ref}${e.title ? ` (${e.title})` : ""} ${e.type}`).join(" · ") || "none";

// ---- /hitl:overlap deep judge (0.13.1): the spec-reviewer's overlap mode writes REVIEW_FILE; `hitl-index overlap A
// --review` checks it here (a finding needs a Given/When/Then witness quoting every change it names, found in that
// change's own files) and turns each kept finding into one ⛔ gate line. Pure; the command does the IO.
export const REVIEW_FILE = ".hitl/.inbox/overlap-review.json";
export const REVIEW_SCHEMA = "hitl.overlap-review/1";
export const REVIEW_MAX = 5;
export const REVIEW_MIN_CONFIDENCE = 80;

/** Text normalised for quote matching: lower case, no markdown quoting or list markers, one space. */
export const normText = (s) => String(s ?? "").toLowerCase().replace(/^[ \t]*(?:[-*•]|\d+\.)[ \t]+/gm, "").replace(/[`*_"“”‘’]/g, "").replace(/\s+/g, " ").trim();

/** A quote is found when each of its parts (split on `…` / `...`) of ≥ 4 chars is in the text; ≥ 8 chars in all. */
export function quoteFound(quote, normalizedText) {
  const q = normText(quote);
  if (q.length < 8 || !normalizedText) return false;
  const parts = q.split(/…|\.\.\./).map((x) => x.trim()).filter((x) => x.length >= 4);
  return parts.length > 0 && parts.every((x) => normalizedText.includes(x));
}

const str = (x) => (typeof x === "string" ? x.trim() : "");
const shellText = (s) => String(s).replace(/["`$\\]/g, "'").replace(/\s+/g, " ").trim();

/**
 * checkOverlapReview(review, {change, cluster, texts}) -> {findings, dropped}.
 * `cluster` = the change and the targets checked; `texts` = Map id -> normText of the change's files. A finding is kept
 * only when it names ≥ 2 changes of the cluster including `change`, has Given, When and Then, quotes every change it
 * names (found in that change's text) and has confidence ≥ 80. Max 5, highest confidence first. Each kept finding gets
 * its direction (`source` goes first; `affected` get the 📥 notes and wait), `adjust` (the side to amend), `kind`, the
 * gate `line`, the `amend` command and the exact `note add` commands of "both sides".
 */
export function checkOverlapReview(review, { change, cluster, texts }) {
  const kept = [], dropped = [];
  const list = Array.isArray(review?.findings) ? review.findings : [];
  list.forEach((f, i) => {
    const id = str(f?.id) || `O-${i + 1}`;
    const drop = (reason) => dropped.push({ id, reason });
    const changes = [...new Set((Array.isArray(f?.changes) ? f.changes : []).map((c) => String(c).trim()).filter(Boolean))];
    if (changes.length < 2) return drop("names fewer than two changes");
    const outside = changes.filter((c) => !cluster.includes(c));
    if (outside.length) return drop(`names ${outside.join(", ")}, which this check did not include`);
    if (!changes.includes(change)) return drop(`not about ${change} (check it with /hitl:overlap ${changes.join(" ")})`);
    const given = str(f.given), when = str(f.when), then = str(f.then);
    if (!given || !when || !then) return drop("no Given/When/Then witness");
    const quotes = f.quotes && typeof f.quotes === "object" ? f.quotes : {};
    const missing = changes.filter((c) => !quoteFound(quotes[c], texts.get(c)));
    if (missing.length) return drop(`witness quote not found in ${missing.join(", ")}`);
    const confidence = Number(f.confidence ?? 0);
    if (!(confidence >= REVIEW_MIN_CONFIDENCE)) return drop(`confidence ${confidence || 0} < ${REVIEW_MIN_CONFIDENCE}`);
    let source = changes.includes(f.source) ? f.source : null;
    let affected = (Array.isArray(f.affected) ? f.affected : []).filter((c) => changes.includes(c) && c !== source);
    if (!source) source = changes.find((c) => !affected.includes(c)) || change;
    affected = affected.filter((c) => c !== source);
    if (!affected.length) affected = changes.filter((c) => c !== source);
    const adjust = changes.includes(f.adjust) ? f.adjust : affected[0];
    const kind = f.kind === "design" ? "design" : "spec";
    const refs = {};
    for (const c of changes) refs[c] = (Array.isArray(f.refs?.[c]) ? f.refs[c] : []).map((r) => String(r).trim()).filter((r) => /^[\w.-]+$/.test(r));
    kept.push({ id, changes, type: str(f.type) || "conflict", given, when, then, quotes: Object.fromEntries(changes.map((c) => [c, str(quotes[c])])),
      refs, confidence, source, affected, adjust, kind, summary: str(f.summary) || null });
  });
  kept.sort((x, y) => y.confidence - x.confidence);
  for (const f of kept.splice(REVIEW_MAX)) dropped.push({ id: f.id, reason: `over the limit of ${REVIEW_MAX} findings` });
  const findings = kept.map((f, i) => ({ n: i + 1, ...f, ...overlapGate(f, i + 1, change) }));
  return { findings, dropped };
}

/** The gate line, the amend command and the "both sides" note commands of one kept finding. */
export function overlapGate(f, n, change) {
  const quoted = f.changes.map((c) => `${c}: "${f.quotes[c]}"`).join(" · ");
  const wait = f.affected.length > 1 ? "wait" : "waits";
  const line = `⚠️ ${n}. ${f.changes.join(" + ")} — Given ${f.given} When ${f.when} Then ${f.then} (${quoted}) → 1. adjust ${f.adjust} · ` +
    `2. both sides (📥 note in ${f.affected.join(", ")} from ${f.source}; ${f.affected.join(", ")} then ${wait} until ${f.source} is archived) · 3. not an overlap`;
  const amend = `/hitl:${f.kind === "design" ? "design" : "plan"} ${f.adjust} amend`;
  const notes = f.affected.map((c) => {
    const text = shellText(`Overlap with ${f.source} (found by /hitl:overlap ${change}): given ${f.given}, when ${f.when}, then ${f.then}. ` +
      `${f.source} says "${f.quotes[f.source]}"; ${c} says "${f.quotes[c]}". ${c} must take in ${f.source}'s behaviour.`);
    const refs = f.refs[c] || [];
    return { change: c, source: f.source, kind: f.kind, refs, text,
      command: `hitl-index note add --change ${c} --source ${f.source} --kind ${f.kind}${refs.length ? ` --refs ${refs.join(",")}` : ""} --text "${text}" --from "/hitl:overlap ${change}"` };
  });
  return { line, amend, notes };
}
