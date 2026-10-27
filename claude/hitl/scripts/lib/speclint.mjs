// Standards lints for the spec layer (hitl 0.6.1, shared/formats/*). Every finding is a warning — never an error.
// Pure and dependency-free. Each function returns [{level, code, ref, line, message}] (the caller adds `file`).
//   requirement quality  ISO/IEC/IEEE 29148:2018 + INCOSE GtWR v4 characteristics (cheap heuristics)
//   NFR fit criterion    ISO/IEC 25010:2023 characteristic + Volere-style fit criterion
//   decision tables      OMG DMN 1.6 (hit policy, input/output columns, overlapping rules under U/A)
//   state machines       Mermaid stateDiagram-v2 + transition table (from | event | guard | action | to)
//   use cases            Cockburn fully dressed (lite)
//   contracts            OpenAPI 3.1+/3.2, AsyncAPI 3.x, JSON Schema 2020-12, CLI contract (md) — structural only

const W = (code, ref, line, message) => ({ level: "warn", code, ref: ref ?? null, line: line ?? null, message });

// ---------------------------------------------------------------- requirement quality (29148 / INCOSE)
/** Built-in vague terms (EN + VI). INCOSE GtWR "vague terms / escape clauses / open-ended"; 29148 §5.2.7 "unbounded or
 *  ambiguous terms". Replace with `config.spec.vagueTerms` (array) or extend with `config.spec.vagueTermsExtra`. */
export const DEFAULT_VAGUE_TERMS = Object.freeze([
  // EN
  "fast", "quick", "quickly", "slow", "efficient", "efficiently", "user-friendly", "easy", "easily", "simple", "intuitive",
  "flexible", "robust", "seamless", "seamlessly", "appropriate", "adequate", "sufficient", "reasonable", "as needed",
  "as appropriate", "if possible", "where possible", "if necessary", "etc.", "and so on", "normally", "usually", "typically",
  "optimal", "optimized", "optimised", "minimize", "minimise", "maximize", "maximise", "several", "various", "high performance",
  "scalable", "state-of-the-art", "best", "better", "enough", "approximately", "TBD", "TBC",
  // VI
  "nhanh", "nhanh chóng", "chậm", "dễ dùng", "dễ sử dụng", "dễ dàng", "thân thiện", "tối ưu", "linh hoạt", "hiệu quả",
  "đơn giản", "trực quan", "phù hợp", "hợp lý", "v.v.", "vân vân", "một số", "mượt mà", "thông thường", "nếu có thể",
  "khi cần",
]);

/** The effective vague-term list from config.spec.{vagueTerms, vagueTermsExtra}. */
export function vagueTermsFrom(config) {
  const s = config?.spec || {};
  const base = Array.isArray(s.vagueTerms) ? s.vagueTerms : DEFAULT_VAGUE_TERMS;
  const extra = Array.isArray(s.vagueTermsExtra) ? s.vagueTermsExtra : [];
  return [...new Set([...base, ...extra].map((t) => String(t).trim()).filter(Boolean))];
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Unicode-aware whole-term search (JS \b does not work for Vietnamese letters). Returns the matched terms. */
export function findVagueTerms(text, terms = DEFAULT_VAGUE_TERMS) {
  const out = [];
  const t = String(text ?? "");
  for (const term of terms) {
    const rx = new RegExp(`(?<![\\p{L}\\p{N}_-])${esc(term)}(?![\\p{L}\\p{N}_]|-[\\p{L}])`, "iu");
    if (rx.test(t)) out.push(term);
  }
  return out;
}

const MODAL_G = /\b(SHALL|MUST|SHOULD|MAY)\b/g;
const PASSIVE = /\b(?:SHALL|MUST|SHOULD|MAY)\s+(?:not\s+)?be\s+([a-z]+(?:ed|en|wn))\b/i;
const HAS_NUMBER = /\d/;

/**
 * lintRequirement(block, {vagueTerms}) — 29148/INCOSE heuristics on one requirement block (delta ADDED/MODIFIED):
 * REQ_VAGUE (unbounded term), REQ_COMPOUND (several modal verbs or "and/or": not singular), REQ_PASSIVE_NO_ACTOR
 * ("SHALL be sent" with no "by …"), NFR_NO_FIT (a Quality: requirement with no number and no Fit: criterion).
 */
export function lintRequirement(b, { vagueTerms = DEFAULT_VAGUE_TERMS } = {}) {
  const out = [];
  const st = b.statement || "";
  const vague = findVagueTerms(st, vagueTerms);
  if (vague.length) out.push(W("REQ_VAGUE", b.id, b.line, `${b.id}: vague term(s) ${vague.map((v) => `"${v}"`).join(", ")} — replace with a measurable value or a defined term`));
  const modals = [...st.matchAll(MODAL_G)].length;
  if (modals > 1 || /\band\/or\b|\bvà\/hoặc\b/i.test(st)) out.push(W("REQ_COMPOUND", b.id, b.line, `${b.id}: ${modals > 1 ? `${modals} modal verbs` : '"and/or"'} in one statement — split into singular requirements`));
  const pm = st.match(PASSIVE);
  if (pm && !/\bby\b/i.test(st.slice(pm.index))) out.push(W("REQ_PASSIVE_NO_ACTOR", b.id, b.line, `${b.id}: passive "${pm[0]}" without an actor — name who or what does it ("the system SHALL …")`));
  if (b.quality && !HAS_NUMBER.test(st) && !b.fit) out.push(W("NFR_NO_FIT", b.id, b.line, `${b.id}: Quality: ${b.quality} needs a measurable value or a "Fit: <measurable criterion>" line`));
  return out;
}

// ---------------------------------------------------------------- tables inside a block
const cells = (line) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
const isSep = (c) => c.length > 0 && c.every((x) => /^:?-+:?$/.test(x));

/** Lines of a block/section text, with absolute line numbers and fence state: [{n, text, fenced, fence}]. */
function linesOf(text, firstLine = 1) {
  const out = []; let fence = null; let lang = null;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const n = firstLine + i;
    const fm = raw.match(/^\s*(```|~~~)\s*([\w-]*)/);
    if (fence) { if (raw.trim().startsWith(fence)) { fence = null; out.push({ n, text: raw, fenced: true, fence: lang, edge: true }); lang = null; return; } out.push({ n, text: raw, fenced: true, fence: lang }); return; }
    if (fm) { fence = fm[1]; lang = fm[2] || ""; out.push({ n, text: raw, fenced: true, fence: lang, edge: true }); return; }
    out.push({ n, text: raw, fenced: false, fence: null });
  });
  return out;
}

/** Markdown tables in lines: [{line, header[], rows:[{cells, line}], before: [lines above it, up to the previous table]}]. */
function tablesIn(lines) {
  const out = []; let cur = null; let before = [];
  for (const L of lines) {
    const isRow = !L.fenced && /^\s*\|/.test(L.text);
    if (!isRow) { if (cur) { out.push(cur); cur = null; before = []; } if (!L.fenced) before.push(L); continue; }
    const c = cells(L.text);
    if (!cur) { cur = { line: L.n, header: c, rows: [], before }; continue; }
    if (isSep(c)) continue;
    cur.rows.push({ cells: c, line: L.n });
  }
  if (cur) out.push(cur);
  return out;
}

// ---------------------------------------------------------------- DMN decision tables
/** DMN hit policies (DMN 1.6 §8.2.11). Default when a table has none: U. */
export const HIT_POLICIES = { U: "unique", A: "any", P: "priority", F: "first", R: "rule order", O: "output order", C: "collect", "C+": "collect sum", "C<": "collect min", "C>": "collect max", "C#": "collect count" };
const HP_NAMES = { unique: "U", any: "A", priority: "P", first: "F", "rule order": "R", "output order": "O", collect: "C" };
const HP_LINE = /^\s*(?:[-*]\s*)?\**Hit policy\**:?\**\s*:?\s*(.+?)\s*$/i;

/** Parse a hit policy token ("U", "C+", "first", "U (unique)") → key of HIT_POLICIES, or null. */
export function parseHitPolicy(s) {
  const t = String(s ?? "").trim();
  let m = t.match(/^(C[+<>#]|[UAPFROC])(?![A-Za-z])/);
  if (m) return m[1];
  m = t.toLowerCase().match(/^(unique|any|priority|first|rule order|output order|collect)\b/);
  return m ? HP_NAMES[m[1]] : null;
}

const RULE_NO = /^(#|no\.?|nr\.?|rule|stt)$/i;
const WILDCARD = new Set(["", "-", "—", "–", "any", "*", "bất kỳ", "n/a"]);

/** One condition cell → {kind:"any"} | {kind:"num", lo, loIn, hi, hiIn} | {kind:"set", vals:Set} | {kind:"other", raw}. */
export function parseCondition(cell) {
  const raw = String(cell ?? "").trim();
  const s = raw.replace(/^"|"$/g, "").trim().toLowerCase();
  if (WILDCARD.has(s)) return { kind: "any" };
  const num = "(-?\\d+(?:\\.\\d+)?)";
  const unit = "(?:\\s*[\\p{L}%]+\\.?)?";
  let m = s.match(new RegExp(`^(<=|≤|>=|≥|<|>|=)?\\s*${num}${unit}$`, "u"));
  if (m) {
    const v = Number(m[2]); const op = m[1] || "=";
    if (op === "=") return { kind: "num", lo: v, loIn: true, hi: v, hiIn: true };
    if (op === "<") return { kind: "num", lo: -Infinity, loIn: false, hi: v, hiIn: false };
    if (op === "<=" || op === "≤") return { kind: "num", lo: -Infinity, loIn: false, hi: v, hiIn: true };
    if (op === ">") return { kind: "num", lo: v, loIn: false, hi: Infinity, hiIn: false };
    return { kind: "num", lo: v, loIn: true, hi: Infinity, hiIn: false };
  }
  m = s.match(new RegExp(`^([\\[\\]\\(])?\\s*${num}\\s*(?:\\.\\.|–)\\s*${num}\\s*([\\[\\]\\)])?${unit}$`, "u"));
  if (m) return { kind: "num", lo: Number(m[2]), loIn: m[1] !== "(" && m[1] !== "]", hi: Number(m[3]), hiIn: m[4] !== ")" && m[4] !== "[" };
  if (/^(not\b|≠|!=|<>)/.test(s)) return { kind: "other", raw: s };
  return { kind: "set", vals: new Set(s.split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean)) };
}

/** Could one input satisfy both conditions? Unknown forms only overlap when written identically (no false alarms). */
export function conditionsOverlap(a, b) {
  const x = parseCondition(a), y = parseCondition(b);
  if (x.kind === "any" || y.kind === "any") return true;
  if (x.kind === "num" && y.kind === "num") {
    if (x.hi < y.lo || y.hi < x.lo) return false;
    if (x.hi === y.lo) return x.hiIn && y.loIn;
    if (y.hi === x.lo) return y.hiIn && x.loIn;
    return true;
  }
  if (x.kind === "set" && y.kind === "set") { for (const v of x.vals) if (y.vals.has(v)) return true; return false; }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** parseDecisionTable(table) → {hitPolicy, hitPolicySource, ruleCol, inputs:[idx], outputs:[idx], rows, unmarked:[names]}. */
export function parseDecisionTable(t) {
  const hpLine = [...t.before].reverse().map((L) => L.text.match(HP_LINE)).find(Boolean);
  let hitPolicy = null; let src = null; let ruleCol = -1;
  const h0 = t.header[0] ?? "";
  if (parseHitPolicy(h0) && h0.length <= 14 && !/\((in|out|input|output)\)/i.test(h0)) { hitPolicy = parseHitPolicy(h0); src = "header"; ruleCol = 0; }
  else if (RULE_NO.test(h0)) ruleCol = 0;
  if (hpLine) { const p = parseHitPolicy(hpLine[1]); hitPolicy = p; src = p ? "line" : "invalid:" + hpLine[1]; }
  const inputs = []; const outputs = []; const unmarked = [];
  t.header.forEach((name, i) => {
    if (i === ruleCol) return;
    if (/\((in|input)\)\s*$/i.test(name)) inputs.push(i);
    else if (/\((out|output)\)\s*$/i.test(name)) outputs.push(i);
    else unmarked.push(i);
  });
  if (!inputs.length && !outputs.length && unmarked.length >= 2) { outputs.push(unmarked.pop()); inputs.push(...unmarked.splice(0)); }
  return { hitPolicy, hitPolicySource: src, ruleCol, inputs, outputs, unmarked: unmarked.map((i) => t.header[i]), rows: t.rows, header: t.header };
}

function lintDecisionTable(t, ref) {
  const out = [];
  const d = parseDecisionTable(t);
  if (d.hitPolicySource?.startsWith("invalid:")) out.push(W("DT_HIT_POLICY", ref, t.line, `${ref}: unknown hit policy "${d.hitPolicySource.slice(8)}" (DMN: ${Object.keys(HIT_POLICIES).join(" ")})`));
  else if (!d.hitPolicy) out.push(W("DT_NO_HIT_POLICY", ref, t.line, `${ref}: decision table has no hit policy — add "Hit policy: U" (unique) above it, or F/A/P/C…`));
  if (d.unmarked.length) out.push(W("DT_COLUMNS", ref, t.line, `${ref}: mark every column "(in)" or "(out)": ${d.unmarked.join(", ")}`));
  if (!d.inputs.length || !d.outputs.length) out.push(W("DT_COLUMNS", ref, t.line, `${ref}: a decision table needs ≥ 1 input and ≥ 1 output column`));
  if (!d.rows.length) out.push(W("DT_NO_RULES", ref, t.line, `${ref}: decision table has no rule rows`));
  for (const r of d.rows) if (r.cells.length !== t.header.length) out.push(W("DT_ROW_CELLS", ref, r.line, `${ref}: rule row has ${r.cells.length} cells, header has ${t.header.length}`));
  const hp = d.hitPolicy || "U";
  if ((hp === "U" || hp === "A") && d.inputs.length && d.outputs.length) {
    const label = (r, i) => (d.ruleCol >= 0 && r.cells[d.ruleCol] ? r.cells[d.ruleCol] : String(i + 1));
    for (let i = 0; i < d.rows.length; i++) for (let j = i + 1; j < d.rows.length; j++) {
      const a = d.rows[i], b = d.rows[j];
      if (!d.inputs.every((c) => conditionsOverlap(a.cells[c] ?? "", b.cells[c] ?? ""))) continue;
      const sameOut = d.outputs.every((c) => (a.cells[c] ?? "").trim().toLowerCase() === (b.cells[c] ?? "").trim().toLowerCase());
      if (hp === "U") out.push(W("DT_OVERLAP", ref, b.line, `${ref}: rules ${label(a, i)} and ${label(b, j)} overlap under hit policy U (unique) — make them exclusive or use F/P/A`));
      else if (!sameOut) out.push(W("DT_OVERLAP", ref, b.line, `${ref}: rules ${label(a, i)} and ${label(b, j)} overlap with different outputs under hit policy A (any)`));
    }
  }
  return out;
}

// ---------------------------------------------------------------- state machines
const SM_ID = "(\\[\\*\\]|[\\p{L}\\p{N}_.-]+)";
const SM_EDGE = new RegExp(`^\\s*${SM_ID}\\s*-->\\s*${SM_ID}\\s*(?::\\s*(.*))?$`, "u");
const colIdx = (header, names) => header.findIndex((h) => names.includes(h.trim().toLowerCase().replace(/\*/g, "")));
export const isTransitionHeader = (header) => colIdx(header, ["from", "from state"]) >= 0 && colIdx(header, ["to", "to state"]) >= 0;

/** Mermaid stateDiagram fences in lines → [{line, version, edges:[{from,to,label}]}]. */
function diagramsIn(lines) {
  const out = []; let cur = null;
  for (const L of lines) {
    if (L.fence !== "mermaid") { if (cur) { out.push(cur); cur = null; } continue; }
    if (L.edge) { if (cur) { out.push(cur); cur = null; } continue; }
    const t = L.text.trim();
    if (!cur) { if (/^stateDiagram(-v2)?\b/.test(t)) cur = { line: L.n, version: t.startsWith("stateDiagram-v2") ? 2 : 1, edges: [] }; continue; }
    const m = t.match(SM_EDGE);
    if (m) cur.edges.push({ from: m[1], to: m[2], label: (m[3] || "").trim() });
  }
  if (cur) out.push(cur);
  return out;
}

/** lintStateMachines(text, {ref, firstLine}) — stateDiagram-v2 + transition table checks (SM_*). */
export function lintStateMachines(text, { ref = null, firstLine = 1 } = {}) {
  const out = [];
  const lines = linesOf(text, firstLine);
  const diagrams = diagramsIn(lines);
  for (const d of diagrams) if (d.version !== 2) out.push(W("SM_MERMAID", ref, d.line, `${ref ? ref + ": " : ""}use "stateDiagram-v2"`));
  const tables = tablesIn(lines).filter((t) => isTransitionHeader(t.header) || colIdx(t.header, ["event", "trigger"]) >= 0 && colIdx(t.header, ["to", "to state"]) >= 0);
  for (const t of tables) {
    const f = colIdx(t.header, ["from", "from state"]), e = colIdx(t.header, ["event", "trigger"]), g = colIdx(t.header, ["guard", "condition"]), to = colIdx(t.header, ["to", "to state"]);
    const where = ref ? `${ref}: ` : "";
    if (f < 0 || e < 0 || to < 0) { out.push(W("SM_COLUMNS", ref, t.line, `${where}transition table needs columns from | event | guard | action | to (missing ${[f < 0 && "from", e < 0 && "event", to < 0 && "to"].filter(Boolean).join(", ")})`)); continue; }
    const rows = t.rows.map((r) => ({ from: r.cells[f] ?? "", event: r.cells[e] ?? "", guard: g >= 0 ? (r.cells[g] ?? "") : "", to: r.cells[to] ?? "", line: r.line }));
    const seen = new Map();
    for (const r of rows) {
      const k = [r.from, r.event, WILDCARD.has(r.guard.toLowerCase()) ? "" : r.guard].map((x) => x.toLowerCase()).join("\u0000");
      if (seen.has(k) && seen.get(k).to !== r.to) out.push(W("SM_NONDETERMINISTIC", ref, r.line, `${where}"${r.from}" on "${r.event}"${r.guard && !WILDCARD.has(r.guard.toLowerCase()) ? ` [${r.guard}]` : ""} goes to both "${seen.get(k).to}" and "${r.to}" — add a guard`));
      else if (!seen.has(k)) seen.set(k, r);
    }
    // reachability from the initial state(s): [*] rows, else the first row's from
    const adj = new Map(); const states = new Set();
    for (const r of rows) { for (const s of [r.from, r.to]) if (s && s !== "[*]") states.add(s); if (!adj.has(r.from)) adj.set(r.from, new Set()); adj.get(r.from).add(r.to); }
    const starts = rows.some((r) => r.from === "[*]") ? ["[*]"] : rows.length ? [rows[0].from] : [];
    const seenS = new Set(starts); const q = [...starts];
    while (q.length) for (const n of adj.get(q.shift()) || []) if (!seenS.has(n)) { seenS.add(n); q.push(n); }
    const unreachable = [...states].filter((s) => !seenS.has(s));
    if (unreachable.length) out.push(W("SM_UNREACHABLE", ref, t.line, `${where}state(s) not reachable from the initial state: ${unreachable.join(", ")}`));
    // table vs the nearest diagram
    const dgm = diagrams.find((d) => d.version === 2) || diagrams[0];
    if (dgm) {
      const key = (a, b) => `${a.toLowerCase()} → ${b.toLowerCase()}`;
      const tset = new Set(rows.map((r) => key(r.from, r.to)));
      const dset = new Set(dgm.edges.map((x) => key(x.from, x.to)));
      const onlyT = [...tset].filter((x) => !dset.has(x)); const onlyD = [...dset].filter((x) => !tset.has(x));
      if (onlyT.length || onlyD.length) out.push(W("SM_DIAGRAM_MISMATCH", ref, t.line, `${where}diagram and transition table differ${onlyT.length ? ` — table only: ${onlyT.join(", ")}` : ""}${onlyD.length ? ` — diagram only: ${onlyD.join(", ")}` : ""}`));
    }
  }
  return out;
}

/** lintRule(block) — decision tables (DMN) and lifecycles (state machines) inside a `### Rule:` block. */
export function lintRule(b) {
  const lines = linesOf(b.text, b.line);
  const out = [];
  for (const t of tablesIn(lines)) if (!isTransitionHeader(t.header)) out.push(...lintDecisionTable(t, b.id));
  out.push(...lintStateMachines(b.text, { ref: b.id, firstLine: b.line }));
  return out;
}

// ---------------------------------------------------------------- use cases (Cockburn lite)
/** lintFlow(block) — UC_NO_ACTOR, UC_NO_STEPS, UC_EXT_REF (extension on a missing step), UC_NO_GUARANTEE (fully dressed). */
export function lintFlow(b) {
  const out = [];
  const lines = linesOf(b.text, b.line).filter((L) => !L.fenced).slice(1);
  const all = lines.map((L) => L.text).join("\n");
  const dressed = /\bPrimary actor\s*:/i.test(all);
  if (!/\b(?:Primary actor|Actor)\s*:/i.test(all)) out.push(W("UC_NO_ACTOR", b.id, b.line, `${b.id}: name the primary actor ("Primary actor: …")`));
  const steps = new Set();
  for (const L of lines) for (const m of L.text.matchAll(/(?:^|\s)(\d+)\.\s+(?=\S)/g)) steps.add(Number(m[1]));
  if (!steps.size) out.push(W("UC_NO_STEPS", b.id, b.line, `${b.id}: no numbered main success scenario steps ("1. …")`));
  for (const L of lines) {
    const m = L.text.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(\d+)([a-z])\d*(?:\*\*)?[.:)]/);
    if (m && steps.size && !steps.has(Number(m[1]))) out.push(W("UC_EXT_REF", b.id, L.n, `${b.id}: extension ${m[1]}${m[2]} refers to step ${m[1]}, which is not in the main success scenario`));
  }
  if (dressed && !/\bSuccess guarantee\s*:/i.test(all)) out.push(W("UC_NO_GUARANTEE", b.id, b.line, `${b.id}: fully dressed use case needs "Success guarantee: …"`));
  return out;
}

// ---------------------------------------------------------------- contracts (structural, zero-dependency)
const OAS_OK = /^3\.[12]\.\d+$/;
const AAS_OK = /^3\.\d+\.\d+$/;
const unq = (s) => String(s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\s+#.*$/, "").trim();

/** Top-level YAML keys (column 0, not comments): Map key -> {value, line}. No YAML parser: structure only. */
export function yamlTopLevel(text) {
  const m = new Map();
  String(text ?? "").split(/\r?\n/).forEach((l, i) => {
    const k = l.match(/^([A-Za-z_$][\w$.-]*)\s*:(.*)$/);
    if (k && !m.has(k[1])) m.set(k[1], { value: unq(k[2]), line: i + 1 });
  });
  return m;
}

function checkApiDoc(get, has, file) {
  const out = [];
  if (has("swagger")) out.push(W("CONTRACT_VERSION", file, get("swagger").line, `Swagger/OpenAPI 2.0 — use "openapi: 3.1.1" (or 3.2.x)`));
  if (has("openapi")) {
    const v = String(get("openapi").value);
    if (!OAS_OK.test(v)) out.push(W("CONTRACT_VERSION", file, get("openapi").line, `openapi: ${v} — use 3.1.x (JSON Schema 2020-12 aligned) or 3.2.x`));
    if (!has("info")) out.push(W("CONTRACT_STRUCTURE", file, null, "OpenAPI document needs a top-level info"));
    if (!has("paths") && !has("webhooks") && !has("components")) out.push(W("CONTRACT_STRUCTURE", file, null, "OpenAPI document needs paths, webhooks or components"));
  } else if (has("asyncapi")) {
    const v = String(get("asyncapi").value);
    if (!AAS_OK.test(v)) out.push(W("CONTRACT_VERSION", file, get("asyncapi").line, `asyncapi: ${v} — use 3.x (e.g. 3.0.0)`));
    if (!has("info")) out.push(W("CONTRACT_STRUCTURE", file, null, "AsyncAPI document needs a top-level info"));
  } else if (!has("swagger")) {
    if (has("paths")) out.push(W("CONTRACT_VERSION", file, get("paths").line, `HTTP contract without a top-level "openapi: 3.1.1" line`));
    else if (has("channels") || has("operations")) out.push(W("CONTRACT_VERSION", file, null, `event contract without a top-level "asyncapi: 3.0.0" line`));
  }
  return out;
}

/** lintContract(relName, text) — CONTRACT_PARSE (JSON), CONTRACT_VERSION, CONTRACT_STRUCTURE. */
export function lintContract(name, text) {
  const out = [];
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return [W("CONTRACT_PARSE", name, null, `invalid JSON: ${e.message}`)]; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    const has = (k) => Object.prototype.hasOwnProperty.call(obj, k);
    const get = (k) => ({ value: obj[k], line: null });
    if (has("openapi") || has("asyncapi") || has("swagger")) return checkApiDoc(get, has, name);
    if (has("$schema")) { if (!/2020-12/.test(String(obj.$schema))) out.push(W("CONTRACT_VERSION", name, null, `$schema ${obj.$schema} — use https://json-schema.org/draft/2020-12/schema`)); }
    else if (has("type") || has("properties") || has("$defs") || lower.endsWith(".schema.json")) out.push(W("CONTRACT_VERSION", name, null, `JSON Schema without "$schema": "https://json-schema.org/draft/2020-12/schema"`));
    return out;
  }
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    const top = yamlTopLevel(text);
    return checkApiDoc((k) => top.get(k), (k) => top.has(k), name);
  }
  if (lower.endsWith(".md")) {
    const h1 = String(text ?? "").match(/^# (.+)$/m)?.[1] ?? "";
    if (/^cli\b/i.test(h1) || /(^|[/_-])cli([._-]|$)/.test(lower.replace(/\.md$/, "."))) {
      const hs = [...String(text).matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1].toLowerCase());
      const need = [["synopsis", "usage"], ["exit codes", "exit status"]];
      const missing = need.filter((alts) => !hs.some((h) => alts.some((a) => h.startsWith(a)))).map((a) => a[0]);
      if (missing.length) out.push(W("CONTRACT_STRUCTURE", name, null, `CLI contract needs ## ${missing.map((m) => m[0].toUpperCase() + m.slice(1)).join(" and ## ")}`));
    }
  }
  return out;
}

// ---------------------------------------------------------------- design.md decisions (MADR 4)
/** MADR 4.0 sections of a `### D-n <title>` detail block (labels `**Context and problem**:` …). Required ones are linted. */
export const MADR_REQUIRED = ["context and problem", "considered options", "decision outcome", "consequences"];
