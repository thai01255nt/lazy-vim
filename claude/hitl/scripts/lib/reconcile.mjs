// Reconcile (0.10): what another change B did that change A must take in, as findings that become notes in A.
// B never edits A's files; B's impact on A travels only as notes in A (applied later through Phase 1: amend, Impact,
// the human's reopen). Findings:
//   spec    — an id B MODIFIED/REMOVED that A references (ACs, its own MODIFIED/REMOVED, D serves, Rules:), with the
//             text diff (B archived: the living text before B's merge, from B's .prev.json; B active: living now)
//   design  — a contract file both changes have: B's decisions that name it, and the contract text diff
//   recheck — A's locked symbol that B's tasks touch and whose code drifted (signature, intent, done body):
//             a `reopen pending` recheck note, confirmed by the human's /hitl:approve A reopen
// Idempotent by key (meta.reconcile.key): a finding already noted (any status) is never added again.
import { join } from "node:path";
import { readJson } from "./fsutil.mjs";
import { lockedTasks } from "./lock.mjs";
import { refHash, shortHash, specRefsTouch, validateRefs } from "./notes.mjs";
import { changeSymbols, decisionsNaming, symbolRef } from "./coupling.mjs";
import { computeImpact } from "./impact.mjs";

export const PREV_FILE = ".prev.json";
export const PREV_SCHEMA = "hitl.spec-prev/1";
const MAX_DIFF = 14;

/** Minimal line diff (LCS): ["- old", "+ new", …] (unchanged lines dropped), capped at MAX_DIFF lines. */
export function lineDiff(oldText, newText, max = MAX_DIFF) {
  const a = String(oldText ?? "").split("\n"), b = String(newText ?? "").split("\n");
  if (oldText == null) return clip(b.map((l) => `+ ${l}`), max);
  if (newText == null) return clip(a.map((l) => `- ${l}`), max);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; }
    else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  return clip(out, max);
}
const clip = (lines, max) => (lines.length > max ? [...lines.slice(0, max), `… ${lines.length - max} more line(s)`] : lines);

const livingBlock = (living, id) => {
  for (const l of living.specs.values()) { const b = l.doc.blocks.find((x) => x.id === id); if (b) return b; }
  return null;
};

/**
 * computeFindings({a, b, living, view, prev, index, lock, resolve, refCtx}) -> [finding]; pure given parsed inputs.
 * finding = {id: RC-n, type: spec|design|recheck, kind, key, ref, title, refs, refTitles, symbols, class, text, diff, meta}.
 * a = A's parsed change (active), b = B's parsed change (active or archived), prev = B's .prev.json blocks or null.
 */
export function computeFindings({ a, b, living, prev, index, lock, resolve, refCtx }) {
  const out = [];
  const aTasks = a.tasksDoc?.tasks || [];
  const acs = aTasks.flatMap((t) => (t.acs || []).map((x) => ({ ac: x.id, reqs: x.reqs || [] })));
  const aMods = new Map((a.deltas || []).flatMap((d) => d.blocks.filter((x) => x.op !== "ADDED").map((x) => [x.id, x])));
  const aDecs = (a.design?.decisions || []).filter((d) => !["rejected", "superseded", "deprecated"].includes(d.status));
  const valid = (refs) => {
    const v = validateRefs(refs, refCtx);
    const bad = new Set(v.errors.map((e) => e.slice(0, e.indexOf(":"))));
    return { refs: refs.filter((r) => !bad.has(r)), titles: v.titles, symbols: v.symbols };
  };
  // spec
  for (const d of b.deltas || []) for (const x of d.blocks.filter((y) => y.op === "MODIFIED" || y.op === "REMOVED")) {
    const usedBy = acs.filter((y) => y.reqs.some((r) => specRefsTouch(x.id, r))).map((y) => y.ac);
    const serves = aDecs.filter((dd) => dd.serves.includes(x.id)).map((dd) => dd.id);
    const rules = (a.deltas || []).flatMap((ad) => ad.blocks.filter((bl) => bl.op !== "REMOVED" && (bl.rules || []).includes(x.id)).map((bl) => bl.id));
    const mine = aMods.get(x.id) || null;
    if (!usedBy.length && !serves.length && !rules.length && !mine) continue;
    const oldText = b.archived ? (prev?.[x.id] ?? null) : (livingBlock(living, x.id)?.livingText ?? null);
    const newText = x.op === "REMOVED" ? null : x.livingText;
    const v = valid([x.id, ...usedBy, ...serves, ...rules]);
    const where = [usedBy.length ? `ACs ${usedBy.join(", ")}` : null, serves.length ? `decisions ${serves.join(", ")}` : null, rules.length ? `requirements ${rules.join(", ")} (Rules:)` : null,
      mine ? `its own ${mine.op} block` : null].filter(Boolean).join("; ");
    const diff = b.archived && oldText == null && newText != null ? [`(the text before ${b.id} was not recorded; ${b.id}'s version:)`, ...lineDiff(null, newText)] : lineDiff(oldText, newText);
    out.push({ type: "spec", kind: "spec", key: `spec:${x.id}:${shortHash(x.op + "\n" + (newText || ""))}`, ref: x.id,
      title: `${b.id} ${x.op === "REMOVED" ? "removed" : "changed"} ${x.id} ${x.title || ""}`.trim(), refs: v.refs, refTitles: v.titles, symbols: v.symbols, class: "behaviour",
      text: [`${b.id} ${x.op === "REMOVED" ? "removed" : "changed"} ${x.id} (${x.title || "untitled"}).${x.changed ? ` Changed: ${x.changed}` : ""}${x.reason ? ` Reason: ${x.reason}` : ""}`,
        `${a.id} uses it in: ${where}.${mine ? ` Both changes edit it: merge ${b.id}'s version into ${a.id}'s delta.` : ""}`].join("\n"),
      diff,
      // both edit it: note apply needs A's own block to change first (the merge), like any spec note
      ...(mine?.op === "MODIFIED" && v.refs.includes(x.id) ? { meta: { base: { [x.id]: refHash(x.id, refCtx) } } } : {}) });
  }
  // design: shared contract files
  for (const f of (a.contracts || []).filter((c) => (b.contracts || []).includes(c))) {
    const bDecs = decisionsNaming(b, f), mine = decisionsNaming(a, f);
    const at = a.contractTexts?.get(f) ?? null;
    const bt = b.contractTexts?.get(f) ?? null;
    if (!bDecs.length && at === bt) continue;
    const v = valid(mine.map((d) => d.id));
    out.push({ type: "design", kind: "design", key: `design:${f}:${shortHash(bDecs.map((d) => `${d.id}|${d.decision}|${d.status}`).join("\n") + "\n" + (bt || ""))}`, ref: f,
      title: `${b.id} decided on ${f.replace(/^contracts\//, "")}`, refs: v.refs, refTitles: v.titles, symbols: {}, class: "contract",
      text: [`${b.id} also has ${f}.${bDecs.length ? ` Its decisions: ${bDecs.map((d) => `${d.id} (${d.decision})`).join("; ")}.` : ""}`,
        mine.length ? `${a.id}'s decisions on it: ${mine.map((d) => `${d.id} (${d.decision})`).join("; ")}.` : `${a.id} has no decision that names it.`].join("\n"),
      diff: at !== null && bt !== null && at !== bt ? lineDiff(at, bt) : [] });
  }
  // recheck: A's locked symbols that B's tasks touch and that drifted
  const aIds = new Set(aTasks.map((t) => t.id));
  const bSyms = changeSymbols(b, index, lock);
  for (const [id, l] of Object.entries(lock?.symbols || {}).sort(([x], [y]) => x.localeCompare(y))) {
    const owners = lockedTasks(l).filter((T) => aIds.has(T));
    if (!owners.length || !bSyms.has(id) || l.reopen) continue;
    const s = index?.symbols?.[id];
    const sig = !s || (l.sigHash && s.sigHash !== l.sigHash), intent = !!s && !!l.intentHash && s.intentHash !== l.intentHash;
    const body = !!s && owners.some((T) => lock.tasks?.[T]?.doneAt && lock.tasks[T].doneBodyHashes?.[id] && lock.tasks[T].doneBodyHashes[id] !== s.bodyHash);
    if (!sig && !intent && !body) continue;
    const ref = symbolRef(index || { symbols: {} }, id, resolve);
    let entries = [{ ref, class: "contract" }];
    if (!sig && !intent) {
      const covering = [...new Set(Object.values(lock.tests || {}).filter((t) => t.stage === "locked" && (t.covers || []).includes(id)).flatMap((t) => t.ac || []).filter((x) => owners.some((T) => x.startsWith(T + ".AC"))))].sort();
      if (covering.length) entries = covering.map((x) => ({ ref: x, class: "behaviour" }));
    }
    const imp = computeImpact({ entries, tasks: aTasks, index, lock, resolve, symbolOf: { [ref]: id } });
    const reopen = imp.tasks.filter((x) => x.locked).map((x) => ({ task: x.task, stage: x.reopen, acs: x.acs, symbols: x.symbols, ...(x.newAc.length ? { newAc: x.newAc } : {}) }));
    if (!reopen.length) continue;
    const what = [sig ? (s ? "signature" : "symbol gone") : null, intent ? "intent" : null, body ? "body since done" : null].filter(Boolean).join(", ");
    out.push({ type: "recheck", kind: "recheck", key: `drift:${id}:${shortHash([s?.sigHash, s?.intentHash, s?.bodyHash].join("|"))}`, ref,
      title: `${ref} changed by ${b.id}`, refs: entries.map((e) => e.ref), refTitles: {}, symbols: { [ref]: id }, class: entries[0].class,
      text: `${b.id}'s tasks (${bSyms.get(id).join(", ")}) touch ${ref}, which ${owners.join(", ")} locked; its ${what} changed since. ${owners.join(", ")} must recheck it. The human confirms with /hitl:approve ${a.id} reopen.`,
      diff: [], meta: { impact: entries, reopen } });
  }
  return out.map((f, i) => ({ id: `RC-${i + 1}`, ...f }));
}

/** B's `.prev.json` blocks (archived B), or null. */
export async function readPrev(root, dir) {
  return (await readJson(join(root, dir, PREV_FILE), null))?.blocks || null;
}
