// Change keys (0.13): every change has a short key (2–5 upper-case letters, proposal meta `| key: PWR`) that scopes all
// of its ids (PWR-T1, PWR-T1.AC2, PWR-R1, PWR-R1.S1, PWR-BR1, PWR-UC1, PWR-D1). A key is unique forever: active and
// archived changes, legacy keys found in living spec ids (`LACC-R3`), task ids in any tasks doc, and the reserved quick
// key `QT` all take it.
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { paths } from "./project.mjs";
import { readText, readJson } from "./fsutil.mjs";
import { ARCHIVE_DIR_RE, CHANGE_KEY_RE, QUICK_KEY, keyOf, parseId, parseTaskId } from "./specids.mjs";

const ls = async (dir) => (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
const META_KEY = /^> change: \S+.*?\| key: ([A-Za-z0-9]+)/m;
const VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);

/** Key in a proposal text (`> change: … | key: PWR`), or null. */
export const proposalKey = (text) => META_KEY.exec(String(text || ""))?.[1] ?? null;

/**
 * readKeyRegistry(root) -> {byKey: Map key -> [{change|null, archived, source}], byChange: Map changeId -> key}.
 * Sources: proposals (active + archived), ids in living specs (legacy keys), task ids in every tasks doc, the lock's
 * task keys, and the reserved quick key.
 */
export async function readKeyRegistry(root) {
  const P = paths(root);
  const byKey = new Map(); const byChange = new Map();
  const add = (key, owner) => {
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    const list = byKey.get(key);
    if (!list.some((o) => o.change === owner.change && o.source === owner.source)) list.push(owner);
  };
  add(QUICK_KEY, { change: null, archived: false, source: "quick" });
  for (const d of await ls(P.changes)) {
    const t = await readText(join(P.changes, d, "proposal.md"), null);
    const k = proposalKey(t);
    if (k) { add(k, { change: d, archived: false, source: "proposal" }); byChange.set(d, k); }
  }
  for (const d of await ls(P.archive)) {
    const id = ARCHIVE_DIR_RE.exec(d)?.[2] ?? d;
    const t = await readText(join(P.archive, d, "proposal.md"), null);
    const k = proposalKey(t);
    if (k) { add(k, { change: id, archived: true, source: "proposal" }); if (!byChange.has(id)) byChange.set(id, k); }
  }
  // living spec ids (a legacy key LACC, or the key of an archived change whose proposal went missing)
  for (const cap of await ls(P.specs)) {
    const t = await readText(join(P.specs, cap, "spec.md"), null);
    for (const m of String(t || "").matchAll(/\b([A-Z]{2,5})-(?:R|BR|UC)\d+\b/g)) {
      const k = m[1];
      if (!byKey.has(k)) add(k, { change: null, archived: true, source: `specs/${cap}` });
    }
  }
  const lock = await readJson(P.lock, null);
  for (const T of Object.keys(lock?.tasks || {})) { const p = parseTaskId(T); if (p && !byKey.has(p.key)) add(p.key, { change: lock.tasks[T]?.change ?? null, archived: !!lock.tasks[T]?.archivedAt, source: "lock" }); }
  return { byKey, byChange };
}

/** Owners of `key` other than `changeId` ([] when free for it). */
export function keyOwners(reg, key, changeId = null) {
  return (reg.byKey.get(key) || []).filter((o) => !(changeId && o.change === changeId));
}

/** checkKey(reg, key, changeId) -> null when ok, else {code, message}. */
export function checkKey(reg, key, changeId = null) {
  if (!CHANGE_KEY_RE.test(String(key || ""))) return { code: "CHANGE_KEY_BAD", message: `change key "${key}" must be 2–5 upper-case letters (A–Z)` };
  const others = keyOwners(reg, key, changeId);
  if (others.length) {
    const o = others[0];
    return { code: "CHANGE_KEY_TAKEN", message: `key ${key} is taken by ${o.source === "quick" ? "the quick tasks (reserved)" : o.change ? `${o.archived ? "archived " : ""}change ${o.change}` : `legacy ids in ${o.source}`}` };
  }
  return null;
}

const letters = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
/** Words of a change id (without the type prefix) or a title. */
function wordsOf(changeId, title) {
  const fromTitle = String(title || "").split(/[^A-Za-z]+/).map(letters).filter((w) => w.length > 1 && !/^(THE|AND|FOR|WITH|FROM|INTO|OF|TO|A|AN|ON|IN|BY|OR)$/.test(w));
  if (fromTitle.length) return fromTitle;
  return String(changeId || "").split("-").slice(1).map(letters).filter(Boolean);
}
const consonants = (w) => [...w.slice(1)].filter((c) => !VOWELS.has(c)).join("");

/** Candidate keys, best first: initials (3+ words), first letter + consonants (1 word), mixes (2 words). */
export function keyCandidates(changeId, title) {
  const ws = wordsOf(changeId, title);
  const out = [];
  const push = (k) => { k = letters(k).slice(0, 5); if (k.length >= 2 && !out.includes(k)) out.push(k); };
  if (!ws.length) { push("CH"); return out; }
  if (ws.length >= 3) push(ws.slice(0, 4).map((w) => w[0]).join(""));
  if (ws.length === 2) {
    push(ws[0][0] + (consonants(ws[0])[0] || ws[0][1] || "") + ws[1][0]);
    push(ws[0][0] + ws[1][0] + (consonants(ws[1])[0] || ""));
    push(ws[0][0] + ws[1][0]);
  }
  if (ws.length === 1 || !out.length) {
    const w = ws[0];
    push(w[0] + consonants(w).slice(0, 3));
    push(w.slice(0, 4));
    push(w.slice(0, 3));
  }
  push(ws.map((w) => w[0]).join(""));
  push(ws.join(""));
  return out;
}

/** suggestKey(changeId, title, taken:Set|Map) -> a free key (deterministic). */
export function suggestKey(changeId, title, taken) {
  const has = (k) => (taken instanceof Map ? taken.has(k) : taken?.has?.(k));
  const cands = keyCandidates(changeId, title);
  for (const k of cands) if (CHANGE_KEY_RE.test(k) && !has(k)) return k;
  const base = (cands[0] || "CH").slice(0, 4);
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!has(base + c)) return base + c;
  for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!has(base.slice(0, 3) + a + b)) return base.slice(0, 3) + a + b;
  throw new Error(`no free key near ${base}`);
}

/** Legacy key of a capability's living ids of unknown origin: `L` + its old key letters (≤ 5), e.g. ACC -> LACC. */
export function legacyKeyFor(cap, oldKey, taken) {
  const has = (k) => (taken instanceof Map ? taken.has(k) : taken?.has?.(k));
  const base = ("L" + (letters(oldKey) || letters(cap))).slice(0, 5);
  const b = base.length >= 2 ? base : (base + "X").slice(0, 2);
  if (!has(b)) return b;
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") { const k = (b.slice(0, 4) + c); if (!has(k)) return k; }
  for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") { const k = b.slice(0, 3) + a + c; if (!has(k)) return k; }
  throw new Error(`no free legacy key for ${cap}`);
}

/** Key of an id-bearing string's owner change via the registry: "PWR-T3" -> "feat-x" (null when unknown). */
export function changeOfKey(reg, key) {
  return (reg.byKey.get(key) || []).find((o) => o.change)?.change ?? null;
}

/** Key of any 0.13 id. */
export { keyOf, parseId };

// ---------------------------------------------------------------- id map (written by migrate --ids)
export const ID_MAP_SCHEMA = "hitl.id-map/1";
export const idMapPath = (root) => join(paths(root).index, "id-map.json");
/** The id map of the last `migrate --ids` ({schema, migratedAt, keys, legacyKeys, ids:{old:new}}), or null. */
export async function readIdMap(root) {
  const m = await readJson(idMapPath(root), null);
  return m && m.schema === ID_MAP_SCHEMA && m.ids && typeof m.ids === "object" ? m : null;
}
/** New id of an old (pre-0.13) id through the map; a decision `D-n` needs its change (`feat-x/D-1`). null when unknown. */
export function mapOldId(map, old, change = null) {
  if (!map) return null;
  return map.ids[old] ?? (change ? map.ids[`${change}/${old}`] : null) ?? null;
}
