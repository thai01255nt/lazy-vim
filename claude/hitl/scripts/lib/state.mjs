// P2 — index/state.json (hitl.state/1, gitignored): test runs, mutation results, reviews (§E.6).
import { p2paths, readJsonFile, writeJsonSorted, withLock, nowIso } from "./lock.mjs";

export const STATE_SCHEMA = "hitl.state/1";

export function emptyState() { return { schema: STATE_SCHEMA, runs: {}, mutation: {}, reviews: {} }; }
export function normalizeState(s) {
  const st = s && typeof s === "object" ? s : {};
  return { schema: STATE_SCHEMA, runs: st.runs || {}, mutation: st.mutation || {}, reviews: st.reviews || {} };
}

export async function readState(root) { return normalizeState(await readJsonFile(p2paths(root).state, null)); }

async function mutate(root, fn) {
  return withLock(root, async () => {
    const st = normalizeState(await readJsonFile(p2paths(root).state, null));
    const out = fn(st);
    await writeJsonSorted(p2paths(root).state, st);
    return out;
  });
}

const clip = (m) => { const s = String(m ?? "").replace(/\s+/g, " ").trim(); return s.length > 200 ? s.slice(0, 197) + "..." : s; };

/** runs: [{testId, outcome, message, testBodyHash, coveredBodyHashes}] */
export function applyRuns(st, runs, at = nowIso()) {
  for (const r of runs) {
    st.runs[r.testId] = { outcome: r.outcome, message: clip(r.message), at, testBodyHash: r.testBodyHash ?? null, coveredBodyHashes: r.coveredBodyHashes || {} };
  }
  return st;
}
export async function recordRuns(root, runs) { return mutate(root, (st) => { applyRuns(st, runs); return st; }); }

/** m: {score, survivors, bodyHash, details?} */
export async function recordMutation(root, id, m) {
  return mutate(root, (st) => {
    st.mutation[id] = { score: Number(m.score), survivors: Number(m.survivors) || 0, bodyHash: m.bodyHash ?? null, at: nowIso(), ...(m.details !== undefined ? { details: m.details } : {}) };
    return st.mutation[id];
  });
}

/** r: {verdict, bodyHashes, report} */
export async function recordReview(root, taskId, r) {
  return mutate(root, (st) => { st.reviews[taskId] = { verdict: r.verdict, at: nowIso(), bodyHashes: r.bodyHashes || {}, report: r.report || null }; return st.reviews[taskId]; });
}
