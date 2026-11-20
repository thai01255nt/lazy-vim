// Id jump (0.19, `hitl-index where <id>`): every location of one hitl id in the project — where it is defined, the tests
// whose `@ac`/`@task` tag holds it, the code symbols of a task, the brief lines that name it and every other mention.
// Searches the `.md` files under `.hitl/` (not the generated `index/` dir) and the project files the indexer lists
// (listFiles: git ls-files minus excludes); each file is read once and decoded only when it holds the id. Defined-here
// detection reuses the spec, tasks and design parsers. Editor-neutral output: the CLI prints quickfix lines or JSON;
// editors (Neovim, VS Code) consume it.
import { promises as fs, readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "./project.mjs";
import { HITL_DIR, HITL_PREFIX } from "./paths.mjs";
import { isTestFile } from "./config.mjs";
import { AC_ID_RE, BR_ID_RE, DEC_ID_RE, LEGACY_AC_RE, LEGACY_DEC_RE, LEGACY_HINT, LEGACY_TASK_RE, REQ_ID_RE, SCN_ID_RE, TASK_ID_RE, UC_ID_RE } from "./specids.mjs";
import { AMEND_ID_RE, parseTasksMd } from "./tasksmd.mjs";
import { parseDelta, parseDesign, parseLivingSpec } from "./specmd.mjs";
import { AMEND_FILE_RE } from "./brief.mjs";

export const WHERE_SCHEMA = "hitl.where/1";
/** Location roles, in output order. */
export const ROLES = ["def", "test", "symbol", "brief", "ref"];
/** Id kinds and their grammar (specids.mjs, tasksmd.mjs). Scenario before requirement, AC before task: first match wins. */
const KINDS = [
  ["scenario", SCN_ID_RE], ["requirement", REQ_ID_RE], ["rule", BR_ID_RE], ["flow", UC_ID_RE],
  ["ac", AC_ID_RE], ["task", TASK_ID_RE], ["decision", DEC_ID_RE], ["amendment", AMEND_ID_RE],
];
export const ID_GRAMMAR = "<KEY>-R<n>, <KEY>-R<n>.S<k>, <KEY>-BR<n>, <KEY>-UC<n>, <KEY>-T<n>, <KEY>-T<n>.AC<k>, <KEY>-D<n>, <KEY>-A<n>";
const TEXT_MAX = 160;
const BRIEF_FILE = /(?:^|\/)(?:plan-brief|design-brief|amend-[A-Z]{2,5}-A\d+-brief)\.md$/;
const SPEC_FILE = /(?:^|\/)spec\.md$/;
const ARCHIVED = `${HITL_PREFIX}archive/`;
/** Tags whose value names an id in a test or a symbol's docstring (tags.mjs). */
const ID_TAGS = new Set(["ac", "task", "dec"]);

/** Canonical form of a typed id: trimmed, upper case. */
export const canonicalId = (s) => String(s ?? "").trim().toUpperCase();

/** Kind of a canonical id: requirement | scenario | rule | flow | task | ac | decision | amendment; null otherwise. */
export function idKind(id) {
  for (const [kind, re] of KINDS) if (re.test(id)) return kind;
  return null;
}

/** Why `id` is not a hitl id (for the usage error). */
export function invalidIdMessage(raw) {
  const id = canonicalId(raw);
  if (LEGACY_TASK_RE.test(id) || LEGACY_AC_RE.test(id) || LEGACY_DEC_RE.test(id)) return `"${raw}" is a ${LEGACY_HINT}`;
  return `"${raw}" is not a hitl id (${ID_GRAMMAR})`;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Global matcher of `id` on id boundaries: `PWR-R1` matches neither `PWR-R10`, `PWR-R1.S2` nor `XPWR-R1`. */
export const idMatcher = (id) => new RegExp(`(?<![A-Za-z0-9_])${esc(id)}(?![A-Za-z0-9_]|\\.[A-Za-z0-9])`, "g");

const clip = (s) => (s.length > TEXT_MAX ? s.slice(0, TEXT_MAX - 1) + "…" : s);
/** 1-based columns of a string index: bytes (UTF-8, as grep and Vim count) and UTF-16 code units (as VS Code/LSP count). */
const cols = (line, i) => ({ col: Buffer.byteLength(line.slice(0, i), "utf8") + 1, colUtf16: i + 1 });

/** findInText(text, id) -> [{line, col, colUtf16, text, at}] — the first match of each line (`at`: string index). */
export function findInText(text, id) {
  const out = [];
  if (!String(text ?? "").includes(id)) return out;
  const rx = idMatcher(id);
  String(text).split(/\r?\n/).forEach((l, i) => {
    if (!l.includes(id)) return;
    rx.lastIndex = 0;
    const m = rx.exec(l);
    if (m) out.push({ line: i + 1, ...cols(l, m.index), text: clip(l.trim()), at: m.index });
  });
  return out;
}

/** The reserved tag (tags.mjs) whose value holds the match at string index `at`, e.g. "ac" in `@ac PWR-T1.AC2`; null. */
function tagBefore(line, at) {
  const m = /@([A-Za-z][\w-]*)[^@]*$/.exec(line.slice(0, at));
  return m && ID_TAGS.has(m[1]) ? m[1] : null;
}

/**
 * defLines(file, text, id, kind) -> Set of 1-based lines where `file` defines `id`, read with the existing parsers:
 * spec / spec delta block and scenario headings, tasks.md task headings and AC lines, design.md D rows and `### <D>`
 * MADR headings, and the title of the amend brief `amend-<id>-brief.md`. Also returns the parsed task (`task`).
 */
export function defLines(file, text, id, kind) {
  const lines = new Set();
  let task = null;
  const base = file.split("/").pop();
  if (!file.startsWith(HITL_PREFIX)) return { lines, task };
  if (["requirement", "scenario", "rule", "flow"].includes(kind) && SPEC_FILE.test(file)) {
    const living = file.startsWith(`${HITL_PREFIX}specs/`);
    const doc = living ? parseLivingSpec(text, file) : parseDelta(text, file);
    for (const b of doc.blocks) {
      if (b.id === id) lines.add(b.line);
      for (const s of b.scenarios || []) if (s.id === id) lines.add(s.line);
    }
  } else if ((kind === "task" || kind === "ac") && base.endsWith(".md") && (base === "tasks.md" || file.startsWith(`${HITL_PREFIX}tasks/`))) {
    for (const t of parseTasksMd(text, file).tasks) {
      if (kind === "task" && t.id === id) { lines.add(t.line); task ||= t; }
      if (kind === "ac") for (const a of t.acs) if (a.id === id) lines.add(a.line);
    }
  } else if (kind === "decision" && base === "design.md") {
    const doc = parseDesign(text, file);
    for (const d of doc.decisions) if (d.id === id) lines.add(d.line);
    for (const d of doc.decisionDetails || []) if (d.id === id) lines.add(d.line);
  } else if (kind === "amendment" && AMEND_FILE_RE.exec(base)?.[1] === id) {
    const i = String(text).split(/\r?\n/).findIndex((l) => /^# /.test(l) && l.includes(id));
    if (i >= 0) lines.add(i + 1);
  }
  return { lines, task };
}

/** `.md` files under `.hitl/` (root-relative), without the generated `index/` dir and dot dirs. */
async function hitlFiles(root) {
  const out = [];
  const walk = async (dir) => {
    for (const e of await fs.readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!e.name.startsWith(".") && rel !== `${HITL_DIR}/index`) await walk(rel); }
      else if (e.isFile() && e.name.endsWith(".md")) out.push(rel);
    }
  };
  await walk(HITL_DIR);
  return out.sort();
}

const placeRank = (f) => (f.startsWith(`${HITL_PREFIX}specs/`) ? 0 : f.startsWith(`${HITL_PREFIX}changes/`) ? 1 : f.startsWith(`${HITL_PREFIX}tasks/`) ? 2
  : f.startsWith(ARCHIVED) ? 4 : f.startsWith(HITL_PREFIX) ? 3 : 5);
/** Output order: role (ROLES), active before archived, living specs → changes → quick tasks → other .hitl → code, file, line. */
export function compareLocations(a, b) {
  return ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || Number(a.archived) - Number(b.archived) || placeRank(a.file) - placeRank(b.file)
    || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line || a.col - b.col;
}

/**
 * classify(sources, id, kind, {config, index, testFiles}) -> {locations, tasks}. Pure over already read files:
 * sources [{file, text}]. Roles: `def` (defLines), `test` (an `@ac`/`@task` tag line in a test file), `brief` (a line of
 * a plan/design/amend brief), `ref` (anything else). Task ids add `symbol` locations from the index (taskSymbolIds);
 * a tag line inside such a symbol's docstring is dropped (the symbol location already points there).
 */
export function classify(sources, id, kind, { config, testFiles = new Set() } = {}) {
  const locations = [];
  const tasks = [];
  for (const { file, text } of sources) {
    const hits = findInText(text, id);
    if (!hits.length) continue;
    const { lines: defs, task } = defLines(file, text, id, kind);
    if (task) tasks.push(task);
    const archived = file.startsWith(ARCHIVED);
    const inHitl = file.startsWith(HITL_PREFIX);
    const isTest = !inHitl && (testFiles.has(file) || isTestFile(file, config));
    const rawLines = isTest || !inHitl ? String(text).split(/\r?\n/) : null;
    for (const h of hits) {
      let role = "ref";
      if (defs.has(h.line)) role = "def";
      else if (inHitl && BRIEF_FILE.test(file)) role = "brief";
      else if (isTest && tagBefore(rawLines[h.line - 1], h.at)) role = "test";
      const loc = { file, line: h.line, col: h.col, colUtf16: h.colUtf16, role, text: h.text, archived };
      if (!inHitl && !isTest && tagBefore(rawLines[h.line - 1], h.at)) loc.tag = true;
      locations.push(loc);
    }
  }
  return { locations, tasks };
}

/** Line of a symbol's declaration in `text` (the index span, else the first line naming it when the index is stale). */
function symbolLine(text, s) {
  const lines = String(text).split(/\r?\n/);
  const name = String(s.name).split(/\.| > /).at(-1).replace(/~\d+$/, "");
  const rx = new RegExp(`(?<![\\w$])${esc(name)}(?![\\w$])`);
  const at = (n) => { const l = lines[n - 1]; const m = l !== undefined ? rx.exec(l) : null; return m ? { line: n, ...cols(l, m.index), text: clip(l.trim()) } : null; };
  const start = s.span?.start ?? 1;
  const hit = at(start);
  if (hit) return hit;
  const i = lines.findIndex((l) => rx.test(l));
  if (i >= 0) return at(i + 1);
  return { line: start, col: 1, colUtf16: 1, text: clip((lines[start - 1] || "").trim()) };
}

/**
 * where(root, config, rawId) -> {schema, id, kind, locations:[{file, line, col, colUtf16, role, text, archived}], searched}.
 * Throws {usage:true} on a string that is not a hitl id. Never reindexes; reads index.json only for a task id.
 */
export async function where(root, config, rawId) {
  const id = canonicalId(rawId);
  const kind = idKind(id);
  if (!kind) throw Object.assign(new Error(invalidIdMessage(rawId)), { usage: true });
  const hitl = await hitlFiles(root);
  const code = (await listFiles(root, config)).filter((f) => !f.startsWith(HITL_PREFIX));
  const files = [...hitl, ...code];
  // sync reads with a byte prefilter: many small files read far faster this way than through the async pool, and only
  // the files that hold the id are decoded
  const texts = new Map();
  for (const f of files) {
    let b = null;
    try { b = readFileSync(join(root, f)); } catch { continue; }
    if (b.indexOf(id) >= 0) texts.set(f, b.toString("utf8"));
  }
  let index = null;
  const testFiles = new Set();
  if (kind === "task") {
    const { readIndex } = await import("./indexer.mjs");
    index = await readIndex(root);
    for (const s of Object.values(index?.symbols || {})) if (s.kind === "test") testFiles.add(s.file);
  }
  const sources = [...texts].map(([file, text]) => ({ file, text }));
  const { locations, tasks } = classify(sources, id, kind, { config, testFiles });
  if (kind === "task" && index) {
    const { taskSymbolIds } = await import("./lock.mjs");
    const task = tasks.find((t) => !t.archived) || tasks[0] || null;
    const spans = [];
    for (const sid of taskSymbolIds(index, id, task)) {
      const s = index.symbols[sid];
      if (!s) continue;
      if (!texts.has(s.file)) { const t = await fs.readFile(join(root, s.file), "utf8").catch(() => null); if (t === null) continue; texts.set(s.file, t); }
      locations.push({ file: s.file, role: "symbol", ...symbolLine(texts.get(s.file), s), archived: false, symbol: sid });
      spans.push({ file: s.file, from: s.docSpan?.start ?? s.span?.start ?? 0, to: s.span?.end ?? 0 });
    }
    // the `@task <id>` tag inside a listed symbol's docstring: the symbol location already points there
    for (let i = locations.length - 1; i >= 0; i--) {
      const l = locations[i];
      if (l.tag && spans.some((x) => x.file === l.file && l.line >= x.from && l.line <= x.to)) locations.splice(i, 1);
    }
  }
  const seen = new Set();
  const out = [];
  for (const l of locations.sort(compareLocations)) {
    const k = `${l.file}:${l.line}`;
    if (seen.has(k)) continue;
    seen.add(k);
    delete l.tag;
    out.push(l);
  }
  return { schema: WHERE_SCHEMA, id, kind, locations: out, searched: files.length };
}

/** One quickfix / grep line: `file:line:col: role: text` (`role (archived)` for an archive hit). */
export const formatLocation = (l) => `${l.file}:${l.line}:${l.col}: ${l.role}${l.archived ? " (archived)" : ""}: ${l.text}`;
