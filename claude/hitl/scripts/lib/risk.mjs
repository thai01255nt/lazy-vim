// P2 — per-symbol risk scoring + lens selection (§E.9.1). Pure.
// Weights and thresholds are starting heuristics (not measured), tunable via config.risk.weights.
import { coversOf, isTest, isOverride } from "./lock.mjs";

export const DEFAULT_WEIGHTS = {
  concurrency: 0.30, security: 0.25, drift: 0.30, mutation: 0.15, fanIn: 0.10,
  implAgent: 0.05, finding: 0.20, bodyLines: 0.05, taskHigh: 0.20,
};
const CONC_FEAT = ["async", "lock", "thread", "timer"];
const SEC_FEAT = ["sql", "shell", "crypto", "eval", "deserialize", "fs-path"];

/** Tiny glob matcher (** * ? {a,b}) — own copy so risk stays pure/self-contained. */
export function globToRegExp(glob) {
  let re = ""; let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { i += 2; if (glob[i] === "/") { i++; re += "(?:.*/)?"; } else re += ".*"; continue; }
      re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") { const j = glob.indexOf("}", i); if (j > i) { re += "(?:" + glob.slice(i + 1, j).split(",").map(esc).join("|") + ")"; i = j + 1; continue; } re += "\\{"; }
    else re += esc(c);
    i++;
  }
  return new RegExp("^" + re + "$");
}
const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
export const matchesAny = (rel, globs = []) => globs.some((g) => globToRegExp(g).test(rel));

export const routeOf = (score, hard) => (hard || score > 0.6 ? "HUMAN" : score >= 0.3 ? "SKIM" : "AUTO");
export const label = (score) => (score > 0.6 ? "HIGH" : score >= 0.3 ? "MED" : "LOW");

/**
 * @param o {taskId, symbolIds, index, lock, state, config, drift, findings, taskRisk, changedSinceReview?, override?}
 *   override (default: isOverride(lock, taskId)) = the user forced the fast lane: every symbol routes HUMAN (L2).
 * @returns {{task, score, override, symbols:{[id]:{score,reasons,route}}, lenses:[…]}}
 */
export function computeRisk(o) {
  const { taskId, index, state = {}, config = {}, drift, findings } = o;
  const w = { ...DEFAULT_WEIGHTS, ...(config.risk?.weights || {}) };
  const thr = config.mutationThreshold ?? 0.8;
  const confThr = config.review?.confidenceThreshold ?? 80;
  const fanIn = config.risk?.fanInThreshold ?? 5;
  const bodyMax = config.risk?.bodyLinesThreshold ?? 60;
  let ids = o.symbolIds || [];
  if (o.changedSinceReview) {
    const rv = state.reviews?.[taskId];
    ids = ids.filter((id) => !rv || rv.bodyHashes?.[id] !== index.symbols[id]?.bodyHash);
  }
  const override = o.override ?? isOverride(o.lock, taskId);
  const lenses = new Set(["contract", "tests"]);
  // Task-level risk reasons from the tasks md (e.g. "high (security)") select lenses too; an override runs all four.
  const tr = (o.taskRiskReasons || []).map((r) => String(r).toLowerCase());
  if (override || tr.some((r) => r.startsWith("security"))) lenses.add("security");
  if (override || tr.some((r) => r.startsWith("concurrency"))) lenses.add("concurrency");
  const items = drift?.items || [];
  const symbols = {};
  for (const id of ids) {
    const S = index.symbols[id]; if (!S) continue;
    let score = 0; const reasons = []; let hard = false;
    const feats = S.features || [];
    const add = (k, why) => { score += w[k] || 0; reasons.push(why); };
    const conc = S.tags?.concurrency && S.tags.concurrency !== "none";
    if (conc || feats.some((f) => CONC_FEAT.includes(f))) { add("concurrency", "concurrency"); lenses.add("concurrency"); }
    const secPath = matchesAny(S.file, config.risk?.securityPaths || []);
    const secFeat = feats.filter((f) => SEC_FEAT.includes(f));
    if (secPath || secFeat.length) { add("security", "security" + (secFeat.length ? ` (${secFeat.join(",")})` : "")); lenses.add("security"); }
    const coveringTests = new Set(Object.entries(index.symbols).filter(([, t]) => isTest(t) && coversOf(index, t).includes(id)).map(([tid]) => tid));
    const own = items.filter((i) => (i.level === "warn" || i.level === "block") && (i.symbol === id || i.symbol === S.name));
    const tdrift = items.filter((i) => (i.level === "warn" || i.level === "block") && coveringTests.has(i.symbol));
    if (own.length || tdrift.length) {
      hard = true;
      add("drift", [own.length ? "drift " + [...new Set(own.map((i) => i.code))].join("/") : null, tdrift.length ? "test drift" : null].filter(Boolean).join(", "));
    }
    const mut = state.mutation?.[id];
    if (mut && mut.bodyHash === S.bodyHash && (mut.score < thr || mut.survivors > 0)) add("mutation", `mutation ${Math.round(mut.score * 100)}% / ${mut.survivors} survivors`);
    if ((S.callers || []).length > fanIn) add("fanIn", `fan-in ${S.callers.length}`);
    if ((S.tags?.impl || o.lock?.symbols?.[id]?.impl) === "agent") add("implAgent", "impl agent");
    const kept = (findings?.findings || []).filter((f) => f.symbol === id || f.symbol === S.name)
      .filter((f) => (f.keep ?? ((f.verifiedConfidence ?? f.confidence ?? 0) >= confThr)) && ["critical", "important"].includes(f.severity));
    if (kept.length) add("finding", `${kept.length} finding(s) ≥ important`);
    if ((S.bodyLines || 0) > bodyMax) add("bodyLines", `${S.bodyLines} body lines`);
    if (o.taskRisk === "high") add("taskHigh", "task risk high");
    if (S.tags?.risk === "high") { hard = true; reasons.push("@risk high"); }
    if (override) { hard = true; reasons.push("human-override (fast lane forced)"); }
    score = Math.min(1, Math.round(score * 100) / 100);
    symbols[id] = { score, reasons, route: routeOf(score, hard) };
  }
  const score = Object.values(symbols).reduce((m, s) => Math.max(m, s.score), 0);
  return { task: taskId, score, override, symbols, lenses: ["contract", "tests", "concurrency", "security"].filter((l) => lenses.has(l)) };
}
