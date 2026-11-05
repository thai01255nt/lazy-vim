// `migrate --ids` (0.13): renumber every pre-0.13 id into change-key scoped ids.
//   tasks T-n → KEY-T<m> (per change, old order), ACs follow; spec ids ACC-R3 → KEY-R<m> of the archived (or active)
//   change that ADDED them, else a legacy key per capability (L + old capability key: LACC-R<m>); scenarios follow their
//   requirement; decisions D-n → KEY-D<n> (per design.md); quick tasks → QT-T<m>.
// Touches active changes, archives, living specs (capability keys leave the meta line), quick tasks, notes, reviews,
// code tags (@task, @ac, @dec, TODO(impl …)), the lock (→ hitl.lock/2, re-keyed, hashes of the tag-only edits
// re-baselined), state.json and the tickets maps; writes .hitl/index/id-map.json. Pure planning + one apply step.
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { paths, listFiles } from "./project.mjs";
import { readJson, readText, writeTextAtomic } from "./fsutil.mjs";
import { HITL_PREFIX } from "./paths.mjs";
import { CHANGE_KEY_RE, QUICK_KEY, SPECREF_G, compareIds, compareTaskIds, parseId, parseTaskId, rewriteIds, today } from "./specids.mjs";
import { listChanges, readChange, readLiving } from "./changes.mjs";
import { parseTasksMd } from "./tasksmd.mjs";
import { ID_MAP_SCHEMA, idMapPath, legacyKeyFor, proposalKey, readKeyRegistry, suggestKey } from "./keys.mjs";
import { LOCK_SCHEMA, stableStringify } from "./lock.mjs";

export const SCHEMA = "hitl.migrate-ids/1";
const TICKET_MAPS = ["linear.map.json", "jira.map.json", "github.map.json"];
// a task id to renumber: a pre-0.13 `T-n`, or a 0.13 id whose key is not its change's (a quick task moved into a change)
const ANY_TASK = "(?:[A-Z]{2,5}-T\\d+|T-\\d+)";
const TASK_G = () => new RegExp(`(?<![A-Za-z0-9-])(${ANY_TASK})((?:\\.AC\\d+)?)(?![0-9])`, "g");
const TODO_G = () => new RegExp(`TODO\\(impl\\s+(${ANY_TASK})\\)`, "g");
const numOf = (id) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);
const OLD_DEC_G = () => /(?<![A-Za-z0-9-])D-(\d+)(?![0-9])/g;
const TAG_LINE = /@(?:task|ac|dec)\b|TODO\(impl\s+/;
const KORD = { R: 0, BR: 1, UC: 2 };
const isHash = (v) => typeof v === "string" && /^[0-9a-f]{16}$/.test(v);

/** Parse `--keys "feat-a=PWR,feat-b=FEE,cap:accounts=LACC"` (or a JSON object) → {changes:{id:KEY}, caps:{cap:KEY}, errors[]}. */
export function parseKeysArg(s) {
  const out = { changes: {}, caps: {}, errors: [] };
  if (s === undefined || s === null || s === true) return out;
  let pairs = [];
  if (typeof s === "object") pairs = Object.entries(s); else {
  const t = String(s).trim();
  if (t.startsWith("{")) { try { pairs = Object.entries(JSON.parse(t)); } catch { out.errors.push("--keys is not valid JSON"); return out; } }
  else pairs = t.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf("="); return i < 0 ? [x, ""] : [x.slice(0, i).trim(), x.slice(i + 1).trim()]; });
  }
  for (const [k, v] of pairs) {
    if (!k || !v) { out.errors.push(`--keys item "${k}=${v}" is not <change-id>=KEY or cap:<capability>=KEY`); continue; }
    if (!CHANGE_KEY_RE.test(v)) { out.errors.push(`--keys ${k}=${v}: a key is 2–5 upper-case letters`); continue; }
    if (k.startsWith("cap:")) out.caps[k.slice(4)] = v; else out.changes[k] = v;
  }
  return out;
}

/** Rewrite pre-0.13 task/AC ids through `tmap` ({"T-3": "PWR-T1"}); unknown ones stay. */
export function rewriteTaskIds(text, tmap) {
  return String(text).replace(TASK_G(), (m, T, ac) => (tmap[T] ? tmap[T] + ac : m));
}
/** Rewrite pre-0.13 decision ids through `dmap` ({"D-1": "PWR-D1"}). */
export function rewriteDecIds(text, dmap) {
  return String(text).replace(OLD_DEC_G(), (m) => dmap?.[m] ?? m);
}
/** `> change: <id> | …` gains `| key: KEY` right after the id (no-op when a key is there). */
export function addProposalKey(text, key) {
  return String(text).replace(/^(> change: \S+)((?:(?!\| key:).)*)$/m, (m, head, rest) => (/\| key:/.test(m) ? m : `${head} | key: ${key}${rest}`));
}
/** `> capability: <cap> | key: ACC | …` loses its capability key. */
export function stripCapabilityKey(text) {
  return String(text).replace(/^(> capability: \S+.*?) \| key: [A-Z][A-Z0-9]*(.*)$/m, "$1$2");
}

const git = (root, args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
/** Uncommitted paths (relative) among `rels` (and .hitl/), or null when not in a git work tree. */
export function dirtyFiles(root, rels) {
  const r = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (r.status !== 0 || r.stdout.trim() !== "true") return null;
  const st = git(root, ["status", "--porcelain", "--untracked-files=all", "--", ".hitl", ...rels]);
  if (st.status !== 0) return null;
  return st.stdout.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "")).filter((f) => !/^\.hitl\/index\/(?!skeleton\.lock\.json)/.test(f));
}

async function walkFiles(abs, rel, out, filter) {
  for (const e of await fs.readdir(abs, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory()) { if (e.name !== ".legacy") await walkFiles(join(abs, e.name), `${rel}/${e.name}`, out, filter); }
    else if (e.isFile() && filter(e.name)) out.push(`${rel}/${e.name}`);
  }
  return out;
}

/**
 * planMigrateIds(root, config, {keys}) -> plan (nothing written). plan.status: "current" (nothing to do) | "conflict" | "plan".
 * plan.writes: [{file, text}] / plan.renames: [{from, to}] / plan.json: {lock, state, maps…} are applied by applyMigrateIds.
 */
export async function planMigrateIds(root, config, { keys = {} } = {}) {
  const P = paths(root);
  const given = parseKeysArg(keys);
  const out = { schema: SCHEMA, status: "plan", keys: [], legacyKeys: [], map: { tasks: {}, specs: {}, decisions: {}, local: {} }, counts: {},
    files: { hitl: [], code: [], renamed: [] }, lock: { tasks: 0, rebaselined: 0, schema: null }, unresolved: [], warnings: [], conflicts: [...given.errors.map((m) => ({ code: "KEYS_BAD", ref: null, message: m }))] };
  const conflict = (code, ref, message) => out.conflicts.push({ code, ref, message });

  // ---- read everything
  const entries = await listChanges(root);
  const changes = [];
  for (const e of entries) changes.push({ entry: e, ch: await readChange(root, e) });
  const living = await readLiving(root);
  const quick = [];
  for (const n of (await fs.readdir(P.tasks).catch(() => [])).filter((n) => n.endsWith(".md")).sort()) {
    const rel = `${HITL_PREFIX}tasks/${n}`;
    const text = await readText(join(P.tasks, n), null);
    if (text !== null) quick.push({ file: rel, text, doc: parseTasksMd(text, rel) });
  }
  const lockRaw = await readJson(P.lock, null);
  const stateRaw = await readJson(P.state, null);
  const reg = await readKeyRegistry(root);

  // legacy capability keys (`| key: ACC` in a living or delta meta line) → capability
  const capKeys = new Map();
  for (const [cap, l] of living.specs) if (l.doc.key) capKeys.set(l.doc.key, cap);
  for (const { ch } of changes) for (const d of ch.deltas) if (d.key && !capKeys.has(d.key)) capKeys.set(d.key, d.capability || d.folder);
  const isLegacySpec = (id) => { const p = parseId(id); return !!p && capKeys.has(p.key); };
  const designDecs = (ch) => {
    const t = ch.design ? ch.texts.get(ch.design.file) || "" : "";
    return [...new Set([...t.matchAll(OLD_DEC_G())].map((m) => m[0]))].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  };

  // ---- change keys: proposal key, else --keys, else a suggestion (archived first, by date; then active)
  const order = [...changes.filter((c) => c.entry.archived), ...changes.filter((c) => !c.entry.archived)];
  const seenIds = new Map();
  const taken = new Map([...reg.byKey].map(([k, v]) => [k, v]));
  for (const k of capKeys.keys()) taken.set(k, [{ change: null, source: "capability key" }]);
  const keyOf = new Map(); // change dir -> key
  const pending = [];
  const ownsLegacy = (ch) => (ch.tasksDoc?.legacyIds || []).length > 0 || designDecs(ch).length > 0
    || ch.deltas.some((d) => d.blocks.some((bk) => bk.op === "ADDED" && isLegacySpec(bk.id)));
  for (const c of order) {
    const { ch, entry } = c;
    if (!ch.proposal && !ownsLegacy(ch)) continue; // nothing to key (a folder without a proposal and no pre-0.13 ids)
    const label = seenIds.has(ch.id) ? entry.dir.split("/").at(-1) : ch.id;
    seenIds.set(ch.id, true);
    c.label = label;
    const own = ch.proposal?.key || null;
    const want = given.changes[label] ?? given.changes[entry.dir.split("/").at(-1)] ?? null;
    if (own) {
      if (want && want !== own) conflict("KEYS_BAD", label, `${label} already has key ${own} in its proposal (keys never change)`);
      keyOf.set(entry.dir, own);
      out.keys.push({ change: ch.id, label, dir: entry.dir, archived: entry.archived, title: ch.proposal?.title ?? null, key: own, source: "proposal" });
      continue;
    }
    pending.push({ c, label, want });
  }
  for (const { c, want } of pending) if (want) {
    const others = (taken.get(want) || []).filter((o) => o.change !== c.ch.id);
    if (others.length) conflict("CHANGE_KEY_TAKEN", want, `key ${want} for ${c.label} is taken by ${others[0].change ? `change ${others[0].change}` : others[0].source}`);
    taken.set(want, [{ change: c.ch.id, source: "given" }]);
  }
  for (const { c, label, want } of pending) {
    const key = want || suggestKey(c.ch.id, c.ch.proposal?.title || null, taken);
    if (!want) taken.set(key, [{ change: c.ch.id, source: "suggested" }]);
    keyOf.set(c.entry.dir, key);
    out.keys.push({ change: c.ch.id, label, dir: c.entry.dir, archived: c.entry.archived, title: c.ch.proposal?.title ?? null, key, source: want ? "given" : "suggested", ...(c.ch.proposal ? {} : { noProposal: true }) });
  }
  const unknownGiven = Object.keys(given.changes).filter((k) => !out.keys.some((x) => x.label === k || x.dir.endsWith(`/${k}`)));
  for (const k of unknownGiven) conflict("KEYS_BAD", k, `--keys names ${k}, which is not a change`);
  const dupKeys = new Map();
  for (const x of out.keys) dupKeys.set(x.key, [...(dupKeys.get(x.key) || []), x.label]);
  for (const [k, ls] of dupKeys) if (ls.length > 1) conflict("CHANGE_KEY_TAKEN", k, `key ${k} given to ${ls.join(" and ")}`);

  // ---- spec ids: origin = the change that ADDED them (archived first, by date; then active), else a legacy key
  const universe = new Map(); // base id -> capability
  const noteSpec = (text) => { for (const m of String(text || "").matchAll(SPECREF_G())) if (isLegacySpec(m[0])) { const p = parseId(m[0]); const base = p.kind === "S" ? p.req : p.id; if (!universe.has(base)) universe.set(base, capKeys.get(p.key)); } };
  for (const l of living.specs.values()) noteSpec(l.text);
  for (const { ch } of changes) for (const t of ch.texts.values()) noteSpec(t);
  for (const q of quick) noteSpec(q.text);
  const origin = new Map(); const local = new Map(); // base id -> change dir; change dir -> Set(ids it ADDED but another owns)
  for (const c of order) for (const d of c.ch.deltas) for (const b of d.blocks) if (b.op === "ADDED" && isLegacySpec(b.id)) {
    if (!origin.has(b.id)) origin.set(b.id, c.entry.dir);
    else if (origin.get(b.id) !== c.entry.dir && !c.entry.archived) { if (!local.has(c.entry.dir)) local.set(c.entry.dir, new Set()); local.get(c.entry.dir).add(b.id); }
  }
  // legacy keys for the unclaimed ids, per capability
  const legacyCaps = new Map();
  for (const [id, cap] of universe) if (!origin.has(id)) { if (!legacyCaps.has(cap)) legacyCaps.set(cap, []); legacyCaps.get(cap).push(id); }
  const legacyKeyOfCap = new Map();
  for (const cap of [...legacyCaps.keys()].sort()) {
    const oldKey = [...capKeys].find(([, c]) => c === cap)?.[0] ?? null;
    const want = given.caps[cap];
    if (want && (taken.get(want) || []).some((o) => o.source !== "legacy")) conflict("CHANGE_KEY_TAKEN", want, `legacy key ${want} for capability ${cap} is taken`);
    const key = want || legacyKeyFor(cap, oldKey, taken);
    taken.set(key, [{ change: null, source: "legacy" }]);
    legacyKeyOfCap.set(cap, key);
    out.legacyKeys.push({ capability: cap, oldKey, key, source: want ? "given" : "suggested", ids: legacyCaps.get(cap).length });
  }
  for (const cap of Object.keys(given.caps)) if (!legacyKeyOfCap.has(cap)) conflict("KEYS_BAD", `cap:${cap}`, `--keys cap:${cap}: capability ${cap} has no legacy ids of unknown origin`);
  // numbering per key: kind, then (capability, old number); continue after the key's existing numbers
  const counters = new Map();
  const nextNum = (key, kind) => { const k = `${key}/${kind}`; const n = (counters.get(k) || 0) + 1; counters.set(k, n); return n; };
  for (const { ch } of changes) {
    const key = keyOf.get(ch.dir);
    if (!key) continue;
    for (const t of ch.texts.values()) for (const m of String(t).matchAll(SPECREF_G())) {
      const p = parseId(m[0]);
      if (p && p.key === key && p.kind !== "S") { const k = `${key}/${p.kind}`; counters.set(k, Math.max(counters.get(k) || 0, p.n)); }
    }
  }
  const byOwner = new Map();
  const own = (owner, id, cap, scope) => { if (!byOwner.has(owner)) byOwner.set(owner, []); byOwner.get(owner).push({ id, cap, scope }); };
  for (const [id, cap] of universe) own(origin.has(id) ? `dir:${origin.get(id)}` : `cap:${cap}`, id, cap, null);
  for (const [dir, ids] of local) for (const id of ids) own(`dir:${dir}`, id, universe.get(id), dir);
  for (const [owner, items] of [...byOwner].sort(([a], [b]) => a.localeCompare(b))) {
    const key = owner.startsWith("dir:") ? keyOf.get(owner.slice(4)) : legacyKeyOfCap.get(owner.slice(4));
    items.sort((a, b) => String(a.cap).localeCompare(String(b.cap)) || KORD[parseId(a.id).kind] - KORD[parseId(b.id).kind] || compareIds(a.id, b.id));
    for (const it of items) {
      const p = parseId(it.id);
      const nid = `${key}-${p.kind}${nextNum(key, p.kind)}`;
      if (it.scope) { const ch = changes.find((c) => c.entry.dir === it.scope).ch.id; (out.map.local[ch] ||= {})[it.id] = nid; }
      else out.map.specs[it.id] = nid;
    }
  }

  // ---- tasks: per change in old order, after the change key's existing numbers; quick files → QT
  const taskOwner = new Map(); // old T -> {dir|null, key}
  const tcount = new Map();
  const bumpT = (key, n) => tcount.set(key, Math.max(tcount.get(key) || 0, n));
  for (const { ch } of changes) for (const t of ch.tasksDoc?.tasks || []) { const p = parseTaskId(t.id); if (p) bumpT(p.key, p.n); }
  for (const q of quick) for (const t of q.doc.tasks) { const p = parseTaskId(t.id); if (p) bumpT(p.key, p.n); }
  for (const T of Object.keys(lockRaw?.tasks || {})) { const p = parseTaskId(T); if (p) bumpT(p.key, p.n); }
  const claim = (T, owner) => {
    if (taskOwner.has(T)) { out.warnings.push(`duplicate pre-0.13 task id ${T} (${owner.file}): the first one keeps it`); return; }
    taskOwner.set(T, owner);
  };
  for (const c of order) {
    const key = keyOf.get(c.entry.dir);
    for (const T of c.ch.tasksDoc?.legacyIds || []) claim(T, { key, change: c.ch.id, file: c.ch.tasksFile });
    for (const t of c.ch.tasksDoc?.tasks || []) if (key && parseTaskId(t.id)?.key !== key) claim(t.id, { key, change: c.ch.id, file: c.ch.tasksFile });
  }
  for (const q of quick) {
    const linked = q.doc.change ? changes.find((x) => !x.entry.archived && x.ch.id === q.doc.change) || changes.filter((x) => x.ch.id === q.doc.change).at(-1) : null;
    const key = linked ? keyOf.get(linked.entry.dir) : QUICK_KEY;
    const change = linked ? linked.ch.id : null;
    for (const T of q.doc.legacyIds) claim(T, { key, change, file: q.file });
    for (const t of q.doc.tasks) if (key && parseTaskId(t.id)?.key !== key) claim(t.id, { key, change, file: q.file });
  }
  for (const [T, lt] of Object.entries(lockRaw?.tasks || {})) if (/^T-\d+$/.test(T) && !taskOwner.has(T)) {
    const c = changes.find((x) => x.ch.id === lt?.change) || changes.find((x) => lt?.file && String(lt.file).startsWith(x.entry.dir + "/"));
    claim(T, { key: c ? keyOf.get(c.entry.dir) : QUICK_KEY, change: c?.ch.id ?? null, file: lt?.file ?? null });
  }
  const tasksByKey = new Map();
  for (const [T, o] of taskOwner) { if (!tasksByKey.has(o.key)) tasksByKey.set(o.key, []); tasksByKey.get(o.key).push(T); }
  for (const [key, ts] of [...tasksByKey].sort(([a], [b]) => a.localeCompare(b))) {
    ts.sort((a, b) => numOf(a) - numOf(b) || a.localeCompare(b));
    for (const T of ts) { const n = (tcount.get(key) || 0) + 1; tcount.set(key, n); out.map.tasks[T] = `${key}-T${n}`; }
  }
  const changeOfNewTask = new Map([...taskOwner].map(([T, o]) => [out.map.tasks[T], o.change]));
  for (const { ch } of changes) for (const t of ch.tasksDoc?.tasks || []) if (!changeOfNewTask.has(t.id) && !taskOwner.has(t.id)) changeOfNewTask.set(t.id, ch.id);
  for (const q of quick) for (const t of q.doc.tasks) if (!changeOfNewTask.has(t.id) && !taskOwner.has(t.id)) changeOfNewTask.set(t.id, q.doc.change || null);

  // ---- decisions: D-n → KEY-Dn per design.md
  const decOf = new Map(); // change dir -> {D-n: KEY-Dn}
  for (const { ch, entry } of changes) {
    const ds = designDecs(ch);
    if (!ds.length) continue;
    const key = keyOf.get(entry.dir);
    const m = {};
    for (const d of ds) { m[d] = `${key}-D${d.slice(2)}`; out.map.decisions[`${ch.id}/${d}`] = m[d]; }
    decOf.set(entry.dir, m);
  }
  const decMapOfChange = (id) => { const c = changes.find((x) => !x.entry.archived && x.ch.id === id) || changes.filter((x) => x.ch.id === id).at(-1); return c ? decOf.get(c.entry.dir) || null : null; };

  const tmap = out.map.tasks, smap = out.map.specs;
  const nothing = !Object.keys(tmap).length && !Object.keys(smap).length && !Object.keys(out.map.decisions).length
    && !Object.keys(out.map.local).length && !out.keys.some((k) => k.source !== "proposal") && !capKeys.size && !/^hitl\.lock\/1$/.test(lockRaw?.schema || "") ;

  // ---- .hitl text rewrites
  const writes = [];
  const put = (file, before, after) => { if (after !== before) { writes.push({ file, text: after }); out.files.hitl.push(file); } };
  for (const { ch, entry } of changes) {
    const key = keyOf.get(entry.dir);
    const sm = { ...smap, ...(out.map.local[ch.id] && !entry.archived ? out.map.local[ch.id] : {}) };
    const dm = decOf.get(entry.dir) || {};
    const files = await walkFiles(join(root, entry.dir), entry.dir, [], (n) => /\.(md|json)$/.test(n));
    for (const f of files.sort()) {
      const t = await readText(join(root, f), null);
      if (t === null) continue;
      let nt = rewriteDecIds(rewriteTaskIds(rewriteIds(t, sm), tmap), dm);
      if (f === `${entry.dir}/proposal.md` && key) nt = addProposalKey(nt, key);
      if (/\/specs\/[^/]+\/spec\.md$/.test(f)) nt = stripCapabilityKey(nt);
      put(f, t, nt);
    }
  }
  for (const l of living.specs.values()) put(l.file, l.text, stripCapabilityKey(rewriteIds(l.text, smap)));
  if (living.glossary) put(living.glossary.file, living.glossary.text, rewriteIds(living.glossary.text, smap));
  for (const q of quick) put(q.file, q.text, rewriteIds(rewriteTaskIds(q.text, tmap), smap));
  // reviews: <T>.review.md and <T>/ move to the new id; their text is rewritten
  const renames = [];
  for (const e of await fs.readdir(P.reviews, { withFileTypes: true }).catch(() => [])) {
    const m = new RegExp(`^(${ANY_TASK})(\\.review\\.md)?$`).exec(e.name);
    const nT = m && tmap[m[1]];
    const base = `${HITL_PREFIX}reviews`;
    const files = e.isDirectory() ? await walkFiles(join(P.reviews, e.name), `${base}/${e.name}`, [], (n) => /\.(md|json)$/.test(n)) : /\.(md|json)$/.test(e.name) ? [`${base}/${e.name}`] : [];
    const dm = nT ? decMapOfChange(changeOfNewTask.get(nT)) : null;
    for (const f of files) {
      const t = await readText(join(root, f), null);
      if (t === null) continue;
      const nt = rewriteDecIds(rewriteTaskIds(rewriteIds(t, smap), tmap), dm || {});
      const to = nT ? f.replace(`${base}/${e.name}`, `${base}/${e.isDirectory() ? nT : nT + m[2]}`) : f;
      if (to !== f) { writes.push({ file: to, text: nt, from: f }); out.files.hitl.push(to); }
      else put(f, t, nt);
    }
    if (nT) { const to = `${base}/${e.isDirectory() ? nT : nT + (m[2] || "")}`; renames.push({ from: `${base}/${e.name}`, to }); out.files.renamed.push({ from: `${base}/${e.name}`, to }); }
  }

  // ---- spec/decision hashes stored by the active changes (.base.json, notes' `base`) follow the renamed ids, so a
  // pure id rename never reads as BASE_CHANGED or as a changed note ref
  {
    const { parseLivingSpec, parseDelta, parseDesign, blockHash } = await import("./specmd.mjs");
    const { effectiveView, findInView, BASE_SCHEMA } = await import("./changes.mjs");
    const { refHash, shortHash } = await import("./notes.mjs");
    const { stableJson } = await import("./fsutil.mjs");
    const newText = (file, old) => { const w = writes.filter((x) => x.file === file).at(-1); return w ? w.text : old; };
    const livingNew = { specs: new Map([...living.specs].map(([cap, l]) => [cap, { doc: parseLivingSpec(newText(l.file, l.text), l.file), file: l.file }])), glossary: null };
    const livingBlock = (lv, id) => { for (const l of lv.specs.values()) { const b = l.doc.blocks.find((x) => x.id === id); if (b) return b; } return null; };
    for (const { ch, entry } of changes.filter((c) => !c.entry.archived)) {
      const sm = { ...smap, ...(out.map.local[ch.id] || {}) };
      const dm = decOf.get(entry.dir) || {};
      const rev = new Map([...Object.entries(sm), ...Object.entries(dm), ...Object.entries(tmap)].map(([o, n]) => [n, o]));
      const oldId = (id) => { const p = parseId(id); if (p?.kind === "S") { const r = rev.get(p.req); return r ? `${r}.S${p.k}` : id; } return rev.get(id) || id; };
      const newId = (id) => rewriteIds(id, sm);
      const base = Object.keys(ch.base || {});
      if (base.length) {
        const nb = {};
        for (const id of base) {
          const nid = newId(id), lo = livingBlock(living, id), ln = livingBlock(livingNew, nid);
          nb[nid] = lo && ln && blockHash(lo.livingText) === ch.base[id] ? blockHash(ln.livingText) : ch.base[id];
        }
        const f = `${entry.dir}/.base.json`;
        const text = stableJson({ schema: BASE_SCHEMA, blocks: nb });
        const old = await readText(join(root, f), null);
        const i = writes.findIndex((w) => w.file === f);
        if (i >= 0) writes.splice(i, 1);
        if (text !== old) { writes.push({ file: f, text }); out.files.hitl.push(f); }
      }
      const nf = `${entry.dir}/notes.md`;
      const nOld = ch.texts.get(nf) ?? await readText(join(root, nf), null);
      if (nOld === null) continue;
      const nCur = newText(nf, nOld);
      if (!/<!-- hitl \{.*"base"/.test(nCur)) continue;
      const chNew = { id: ch.id, archived: false, deltas: ch.deltas.map((d) => { const x = parseDelta(newText(d.file, ch.texts.get(d.file) || ""), d.file); x.folder = d.folder; return x; }),
        design: ch.design ? parseDesign(newText(ch.design.file, ch.texts.get(ch.design.file) || ""), ch.design.file) : null };
      const vOld = effectiveView(living, ch), vNew = effectiveView(livingNew, chNew);
      const hNew = (ref) => refHash(ref, { view: vNew, findInView, design: chNew.design });
      const hOld = (ref) => {
        const d = (chNew.design?.decisions || []).find((x) => x.id === ref);
        if (d) return shortHash([d.decision, d.status, d.supersededBy ? oldId(d.supersededBy) : ""].join("|"));
        return refHash(oldId(ref), { view: vOld, findInView, design: null });
      };
      const nt = nCur.replace(/^<!-- hitl (\{.*\}) -->$/gm, (m, j) => {
        let meta; try { meta = JSON.parse(j); } catch { return m; }
        if (!meta.base) return m;
        for (const [ref, h] of Object.entries(meta.base)) { const o = hOld(ref); const n = hNew(ref); if (o && n && o === h) meta.base[ref] = n; }
        return `<!-- hitl ${JSON.stringify(meta)} -->`;
      });
      if (nt !== nCur) { const i = writes.findIndex((w) => w.file === nf); if (i >= 0) writes.splice(i, 1); writes.push({ file: nf, text: nt }); out.files.hitl.push(nf); }
    }
  }

  // ---- code tags (+ hash re-baseline per symbol)
  const { parseSources } = await import("./indexer.mjs");
  const index = await readJson(P.indexJson, null);
  const files = index?.files ? Object.keys(index.files).sort() : await listFiles(root, config);
  const lockSyms = lockRaw?.symbols || {};
  const changeOfOldTask = (T) => taskOwner.get(T)?.change ?? null;
  const symChange = (s) => {
    const ts = [...(s.tags?.task || []), ...((s.tags?.extra?.task) || [])];
    const cs = new Set();
    for (const T of ts) { const c = changeOfOldTask(T) ?? changeOfNewTask.get(T) ?? null; if (c) cs.add(c); }
    const l = lockSyms[s.id];
    for (const T of [l?.task, ...(l?.tasks || [])].filter(Boolean)) { const c = changeOfOldTask(T) ?? changeOfNewTask.get(T) ?? null; if (c) cs.add(c); }
    return cs.size === 1 ? [...cs][0] : cs.size ? null : undefined;
  };
  const hashRepl = {}; // symbol id -> {old: new}
  const codeWrites = [];
  for (const f of files) {
    const text = await readText(join(root, f), null);
    if (text === null || !TAG_LINE.test(text)) continue;
    let parsed = null;
    try { parsed = (await parseSources(root, [{ path: f, content: text }], config))[0] || null; } catch { parsed = null; }
    const syms = parsed?.symbols || [];
    const fileChanges = new Set(syms.map(symChange).filter(Boolean));
    const lines = text.split("\n");
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!TAG_LINE.test(L)) continue;
      const miss = (x, T) => { if (/^T-\d+$/.test(T)) out.unresolved.push({ file: f, line: i + 1, id: x, reason: "task id not found in any tasks doc or the lock" }); return x; };
      let nl = L.replace(TODO_G(), (m, T) => (tmap[T] ? `TODO(impl ${tmap[T]})` : miss(m, T)));
      if (/@(?:task|ac)\b/.test(nl)) nl = nl.replace(/(@(?:task|ac)\s+)([^@\n]*)/g, (m, head, list) => head + list.replace(TASK_G(), (x, T, ac) => (tmap[T] ? tmap[T] + ac : miss(x, T))));
      if (/@dec\b/.test(nl) && OLD_DEC_G().test(nl)) {
        const ln = i + 1;
        const hit = syms.filter((s) => (s.docSpan && s.docSpan.start <= ln && ln <= s.docSpan.end) || (s.span && s.span.start <= ln && ln <= s.span.end))
          .sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0];
        let ch = hit ? symChange(hit) : undefined;
        if (!ch && fileChanges.size === 1) ch = [...fileChanges][0];
        const dm = ch ? decMapOfChange(ch) : null;
        nl = nl.replace(/(@dec\s+)([^@\n]*)/g, (m, head, list) => head + list.replace(OLD_DEC_G(), (x) => {
          if (dm?.[x]) return dm[x];
          // a v0.5 planning decision (task linked with ← Planning:) keeps its D-n
          if (!ch) out.unresolved.push({ file: f, line: ln, id: x, reason: "@dec: no single change owns this symbol (left as is; a v0.5 planning decision keeps D-n)" });
          else if (!dm) out.unresolved.push({ file: f, line: ln, id: x, reason: `@dec: ${ch} has no design decision ${x} (left as is)` });
          else out.unresolved.push({ file: f, line: ln, id: x, reason: `@dec: ${x} is not in the design of ${ch} (left as is)` });
          return x;
        }));
      }
      if (nl !== L) { lines[i] = nl; changed = true; }
    }
    if (!changed) continue;
    const nt = lines.join("\n");
    codeWrites.push({ file: f, text: nt });
    out.files.code.push(f);
    let after = null;
    try { after = (await parseSources(root, [{ path: f, content: nt }], config))[0] || null; } catch { after = null; }
    const A = new Map((after?.symbols || []).map((s) => [s.id, s]));
    for (const s of syms) {
      const a = A.get(s.id);
      if (!a) continue;
      for (const k of ["sigHash", "bodyHash", "intentHash", "todoHash"]) if (s[k] !== a[k]) (hashRepl[s.id] ||= {})[s[k]] = a[k];
    }
  }

  // ---- lock / state / tickets maps: exact ids re-keyed; hashes of the tag-only edits re-baselined per symbol
  const mapExact = (v) => {
    if (typeof v !== "string") return v;
    let m;
    if ((m = new RegExp(`^(${ANY_TASK})((?:\\.AC\\d+)?)$`).exec(v)) && tmap[m[1]]) return tmap[m[1]] + m[2];
    if (smap[v]) return smap[v];
    return v.replace(new RegExp(`(reviews\\/)(${ANY_TASK})(?=[./]|$)`, "g"), (x, pre, T) => (tmap[T] ? pre + tmap[T] : x));
  };
  let rebased = 0;
  const walk = (v, sym, hashes) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, sym, hashes));
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[mapExact(k)] = walk(x, hashes && k.includes("#") && hashRepl[k] ? k : sym, hashes);
      return o;
    }
    if (hashes && sym && isHash(v) && hashRepl[sym]?.[v]) { rebased++; return hashRepl[sym][v]; }
    return mapExact(v);
  };
  const json = {};
  if (lockRaw) {
    const nl = walk(lockRaw, null, true);
    nl.schema = LOCK_SCHEMA;
    out.lock = { tasks: Object.keys(lockRaw.tasks || {}).filter((T) => tmap[T]).length, rebaselined: rebased, schema: `${lockRaw.schema || "?"} → ${LOCK_SCHEMA}` };
    if (stableStringify(nl) !== stableStringify(lockRaw)) json.lock = nl;
  }
  if (stateRaw) { const ns = walk(stateRaw, null, true); if (JSON.stringify(ns) !== JSON.stringify(stateRaw)) json.state = ns; }
  out.lock.rebaselined = rebased;
  json.maps = {};
  for (const n of TICKET_MAPS) {
    const m = await readJson(join(P.custom, n), null);
    if (!m) continue;
    const nm = walk(m, null, false);
    if (JSON.stringify(nm) !== JSON.stringify(m)) { json.maps[n] = nm; out.files.hitl.push(`${HITL_PREFIX}${n}`); }
  }

  out.counts = { keys: out.keys.filter((k) => k.source !== "proposal").length, legacyKeys: out.legacyKeys.length, tasks: Object.keys(tmap).length,
    specs: Object.keys(smap).length + Object.values(out.map.local).reduce((n, m) => n + Object.keys(m).length, 0),
    decisions: Object.keys(out.map.decisions).length, hitlFiles: out.files.hitl.length, codeFiles: out.files.code.length, renamed: renames.length, unresolved: out.unresolved.length };
  out.files.hitl = [...new Set(out.files.hitl)].sort();
  if (nothing && !writes.length && !codeWrites.length && !renames.length && !json.lock && !Object.keys(json.maps).length) { out.status = "current"; return out; }
  if (out.conflicts.length) out.status = "conflict";
  Object.defineProperty(out, "_apply", { value: { writes, codeWrites, renames, json }, enumerable: false });
  return out;
}

/** Apply a plan from planMigrateIds (status "plan"). Writes everything, then the id map. Returns {written, renamed, idMap}. */
export async function applyMigrateIds(root, plan) {
  const P = paths(root);
  const { writes, codeWrites, renames, json } = plan._apply;
  for (const w of writes) await writeTextAtomic(join(root, w.file), w.text);
  for (const w of writes) if (w.from) await fs.rm(join(root, w.from), { force: true });
  for (const r of renames) {
    const from = join(root, r.from);
    const st = await fs.stat(from).catch(() => null);
    if (st?.isDirectory()) { await fs.cp(from, join(root, r.to), { recursive: true, force: false, errorOnExist: false }); await fs.rm(from, { recursive: true, force: true }); }
    else if (st) await fs.rename(from, join(root, r.to));
  }
  for (const w of codeWrites) await writeTextAtomic(join(root, w.file), w.text);
  if (json.lock) await writeTextAtomic(P.lock, stableStringify(json.lock));
  if (json.state) await writeTextAtomic(P.state, stableStringify(json.state));
  for (const [n, m] of Object.entries(json.maps || {})) await writeTextAtomic(join(P.custom, n), JSON.stringify(m, null, 2) + "\n");
  const prev = await readJson(idMapPath(root), null);
  const ids = { ...(prev?.ids || {}), ...plan.map.tasks, ...plan.map.specs, ...plan.map.decisions };
  for (const [ch, m] of Object.entries(plan.map.local)) for (const [o, n] of Object.entries(m)) ids[`${ch}/${o}`] = n;
  const idMap = { schema: ID_MAP_SCHEMA, migratedAt: today(), keys: Object.fromEntries(plan.keys.map((k) => [k.label, k.key])),
    legacyKeys: Object.fromEntries(plan.legacyKeys.map((k) => [k.capability, k.key])), ids };
  await writeTextAtomic(idMapPath(root), JSON.stringify(idMap, null, 2) + "\n");
  // the id map is committed (old references in chat and commits resolve through it for one release)
  const gi = join(P.custom, ".gitignore");
  const g = await readText(gi, null);
  if (g !== null) { const { mergeGitignore } = await import("../cmd/init.mjs"); const m = mergeGitignore(g); if (m.added.length) await writeTextAtomic(gi, m.text); }
  return { written: writes.length + codeWrites.length, renamed: renames.length, idMap: `${HITL_PREFIX}index/id-map.json` };
}

/** Pre-0.13 state of a project, cheap (status/session-start): {legacy:boolean, reasons[]}. */
export async function legacyIdState(root) {
  const reasons = [];
  const P = paths(root);
  const lock = await readJson(P.lock, null);
  const { lockLegacyIds } = await import("./lock.mjs");
  if (lockLegacyIds(lock).length) reasons.push("skeleton.lock.json has T-n task ids");
  const { legacyTaskDocs } = await import("./tasksmd.mjs");
  const docs = await legacyTaskDocs(root);
  if (docs.length) reasons.push(`T-n task ids in ${docs.map((d) => d.file).join(", ")}`);
  for (const cap of (await fs.readdir(P.specs, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const t = await readText(join(P.specs, cap, "spec.md"), null);
    if (t !== null && /^> capability: \S+.*\| key: [A-Z]/m.test(t)) { reasons.push(`living spec ${cap} still has a capability key (ids like ${/^> capability: \S+.*\| key: ([A-Z][A-Z0-9]*)/m.exec(t)[1]}-R1)`); break; }
  }
  return { legacy: reasons.length > 0, reasons };
}
