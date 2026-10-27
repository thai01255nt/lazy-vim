// Spec layer names and IDs (design v3 §2.2). The regexes here are normative; every spec module imports them.
// Pure, dependency-free.

export const CHANGE_TYPES = ["feat", "fix", "refactor", "perf", "docs", "test", "chore"];
/** Change types that may declare "none (no behaviour change)" instead of spec deltas. */
export const NO_BEHAVIOUR_TYPES = new Set(["docs", "chore", "refactor", "test", "perf"]);
export const CHANGE_ID_RE = /^(feat|fix|refactor|perf|docs|test|chore)-[a-z0-9]+(-[a-z0-9]+)*$/;
export const CHANGE_ID_MAX = 48;
export const ARCHIVE_DIR_RE = /^(\d{4}-\d{2}-\d{2})-((?:feat|fix|refactor|perf|docs|test|chore)-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const CAP_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const KEY_RE = /^[A-Z][A-Z0-9]{1,5}$/;
const K = "[A-Z][A-Z0-9]{1,5}";
export const REQ_ID_RE = new RegExp(`^(${K})-R(\\d+)$`);
export const SCN_ID_RE = new RegExp(`^(${K})-R(\\d+)\\.S(\\d+)$`);
export const BR_ID_RE = new RegExp(`^(${K})-BR(\\d+)$`);
export const UC_ID_RE = new RegExp(`^(${K})-UC(\\d+)$`);
/** Source of one spec reference (requirement, scenario, rule or flow id) — for embedding in larger regexes. */
export const SPECREF_SRC = `${K}-(?:R\\d+(?:\\.S\\d+)?|BR\\d+|UC\\d+)`;
export const SPECREF_RE = new RegExp(`^${SPECREF_SRC}$`);
/** Global matcher for spec ids inside prose. */
export const SPECREF_G = () => new RegExp(`\\b${SPECREF_SRC}\\b`, "g");

export const QUALITIES = ["functional-suitability", "performance-efficiency", "compatibility", "interaction-capability", "reliability", "security", "maintainability", "flexibility", "safety"];

/** Block kinds: header word in `### <Word>: <ID> <title>`, the `## <Section>` they live in, and the ID kind letter. */
export const KINDS = {
  requirement: { word: "Requirement", section: "Requirements", idKind: "R" },
  rule: { word: "Rule", section: "Rules", idKind: "BR" },
  flow: { word: "Flow", section: "Flows", idKind: "UC" },
};
export const KIND_BY_WORD = { Requirement: "requirement", Rule: "rule", Flow: "flow" };
export const KIND_BY_SECTION = { Requirements: "requirement", Rules: "rule", Flows: "flow" };
export const KIND_BY_ID = { R: "requirement", BR: "rule", UC: "flow" };
export const KIND_ORDER = ["requirement", "rule", "flow"];
export const OPS = ["ADDED", "MODIFIED", "REMOVED"];

export const isChangeId = (s) => typeof s === "string" && s.length <= CHANGE_ID_MAX && CHANGE_ID_RE.test(s);
export const changeType = (id) => String(id || "").split("-")[0];

/** parseId("ACC-R3.S2") -> {id, key, kind:"R"|"BR"|"UC"|"S", n, k, req}; null when not a spec id. */
export function parseId(id) {
  let m;
  const s = String(id ?? "");
  if ((m = s.match(SCN_ID_RE))) return { id: s, key: m[1], kind: "S", n: Number(m[2]), k: Number(m[3]), req: `${m[1]}-R${m[2]}` };
  if ((m = s.match(REQ_ID_RE))) return { id: s, key: m[1], kind: "R", n: Number(m[2]), k: null, req: s };
  if ((m = s.match(BR_ID_RE))) return { id: s, key: m[1], kind: "BR", n: Number(m[2]), k: null, req: null };
  if ((m = s.match(UC_ID_RE))) return { id: s, key: m[1], kind: "UC", n: Number(m[2]), k: null, req: null };
  return null;
}

const KORD = { R: 0, S: 0, BR: 1, UC: 2 };
/** Sort order: key, kind (R < BR < UC), n, then scenario k (a requirement sorts before its scenarios). */
export function compareIds(a, b) {
  const x = parseId(a), y = parseId(b);
  if (!x || !y) return String(a).localeCompare(String(b));
  return x.key.localeCompare(y.key) || KORD[x.kind] - KORD[y.kind] || x.n - y.n || (x.k ?? 0) - (y.k ?? 0);
}
export const sortIds = (ids) => [...new Set(ids)].sort(compareIds);

/** Next `count` numbers after the max of `used` (numbers). Never fills gaps: removed ids are never reused. */
export function allocate(used, count = 1) {
  let max = 0;
  for (const n of used) if (Number.isFinite(n) && n > max) max = n;
  return Array.from({ length: count }, (_, i) => max + 1 + i);
}

export const formatId = (key, kind, n) => `${key}-${kind}${n}`;
export const archiveDirName = (date, changeId) => `${date}-${changeId}`;

/** Local calendar date YYYY-MM-DD. */
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Rewrite whole spec ids in `text` through `map` ({old: new}) in one pass (safe for chains R7→R8, R8→R9).
 *  `ACC-R7` also rewrites the prefix of `ACC-R7.S1`; `ACC-R70` is untouched. */
export function rewriteIds(text, map) {
  const keys = Object.keys(map || {});
  if (!keys.length) return text;
  const alt = keys.sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return String(text).replace(new RegExp(`(?<![A-Za-z0-9-])(${alt})(?![0-9])`, "g"), (m) => map[m] ?? m);
}
