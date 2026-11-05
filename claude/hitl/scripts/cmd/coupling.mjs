// `hitl-index coupling <change> [<other>] [--json]` — change coupling (0.10): declared links (proposal header
// `after:` / `relates:`) and the overlap evidence with a suggested level. Read-only; the human decides the level.
import { parseArgv } from "../lib/project.mjs";
import { findChange, listChanges, readChange } from "../lib/changes.mjs";
import { STRONG_TYPES, couplingEvidence, evidenceContext, evidenceLine, linksOf, loadLinkGraph, reconcilePending } from "../lib/coupling.mjs";

const USAGE = "usage: hitl-index coupling <change-id> [<other-change-id>] [--json]";
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
const fail = (msg) => Object.assign(new Error(msg), { code: 1 });

export const LINK_WORD = { after: "after", before: "before", relates: "relates to" };
/** `feat-a after feat-b (strong)` style phrase for one link of `id`. */
export const linkPhrase = (id, l) => `${id} ${LINK_WORD[l.rel]} ${l.change} (${l.level})`;

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["json"] });
  const json = ctx.json || a.json;
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  if (a._.length < 1 || a._.length > 2) throw usage();
  const [aId, bId] = a._;
  const ea = await findChange(ctx.root, aId);
  if (!ea || ea.archived) throw fail(ea ? `${aId} is archived; coupling is about active changes` : `change ${aId} not found`);
  const graph = await loadLinkGraph(ctx.root);
  const ectx = await evidenceContext(ctx.root);
  const chA = await readChange(ctx.root, ea);
  const links = linksOf(graph, aId);
  const pairOf = (chB) => {
    const ev = couplingEvidence(chA, chB, ectx);
    const declared = links.find((l) => l.change === chB.id) || null;
    return { other: chB.id, archived: chB.archived, level: ev.level, evidence: ev.evidence, refs: ev.refsA, declared,
      understated: ev.level === "strong" && !chB.archived && (!declared || declared.rel === "relates"),
      suggest: ev.level === "none" ? null : ev.level === "strong" ? "after (strong)" : "relates (low)" };
  };
  let pairs;
  if (bId) {
    if (bId === aId) throw usage("two different changes");
    const eb = await findChange(ctx.root, bId);
    if (!eb) throw fail(`change ${bId} not found`);
    pairs = [pairOf(await readChange(ctx.root, eb))];
  } else {
    pairs = [];
    for (const e of await listChanges(ctx.root, { archived: false })) if (e.id !== aId) {
      const p = pairOf(await readChange(ctx.root, e));
      if (p.level !== "none" || p.declared) pairs.push(p);
    }
  }
  const out = { schema: "hitl.coupling/1", change: aId, links, reconcilePending: reconcilePending(graph, aId), pairs };
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  for (const l of links) console.log(`🔗 ${linkPhrase(aId, l)}${l.archived ? ` · archived${l.reconcile ? `, reconcile ${l.reconcile}` : ""}` : ""}${l.unknown ? " · ❌ unknown change" : ""}`);
  for (const p of pairs) {
    const strong = p.evidence.filter((e) => STRONG_TYPES.has(e.type));
    console.log(`${p.understated ? "⚠️" : "ℹ️"} ${aId} ↔ ${p.other}: evidence ${p.level}${p.evidence.length ? ` (${evidenceLine(strong.length ? strong : p.evidence)})` : ""}`
      + ` · link: ${p.declared ? `${LINK_WORD[p.declared.rel]} (${p.declared.level})` : "none"}${p.understated ? ` → suggest ${p.suggest}` : ""}`);
  }
  for (const r of out.reconcilePending) console.log(`🔄 reconcile pending from ${r.from} → ${r.command}`);
  if (!links.length && !pairs.length) console.log(`no links and no overlap for ${aId}`);
  return 0;
}
