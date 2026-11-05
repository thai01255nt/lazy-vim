// `hitl-index overlap <change-id> [--json]` (0.12) — deterministic overlap candidates between one active change and
// every other active change: shared ids, rules, decisions, contracts, symbols, files, glossary terms or capabilities,
// plus a small pack of the other change's text for the plan/design judge. Read-only. No candidates → nothing to judge.
// `linked` = the two changes are already tied by notes (`source:`; e.g. created with `--before`).
import { parseArgv } from "../lib/project.mjs";
import { findChange, listChanges, readChange } from "../lib/changes.mjs";
import { evidenceContext, evidenceLine, overlapEvidence, overlapPack, readScout } from "../lib/overlap.mjs";
import { readNotes } from "../lib/notes.mjs";

const USAGE = "usage: hitl-index overlap <change-id> [--json]";
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
const fail = (msg) => Object.assign(new Error(msg), { code: 1 });

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["json"] });
  const json = ctx.json || a.json;
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  if (a._.length !== 1) throw usage();
  const id = a._[0];
  const ea = await findChange(ctx.root, id);
  if (!ea || ea.archived) throw fail(ea ? `${id} is archived; overlap is about active changes` : `change ${id} not found`);
  const ectx = await evidenceContext(ctx.root);
  const chA = await readChange(ctx.root, ea);
  const scoutA = await readScout(ctx.root, ea.dir);
  const notesA = await readNotes(ctx.root, ea.dir).catch(() => []);
  const candidates = [];
  for (const e of await listChanges(ctx.root, { archived: false })) {
    if (e.id === id) continue;
    const chB = await readChange(ctx.root, e);
    const ev = overlapEvidence(chA, chB, { ...ectx, scoutA, scoutB: await readScout(ctx.root, e.dir) });
    if (!ev.evidence.length) continue;
    const notesB = await readNotes(ctx.root, e.dir).catch(() => []);
    const linked = notesB.some((n) => n.source === id) || notesA.some((n) => n.source === e.id);
    candidates.push({ other: e.id, shared: ev.shared, linked, evidence: ev.evidence, refs: ev.refsB, pack: overlapPack(chA, chB, ev.evidence) });
  }
  candidates.sort((x, y) => Number(y.shared) - Number(x.shared) || x.other.localeCompare(y.other));
  const out = { schema: "hitl.overlap/1", change: id, candidates };
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!candidates.length) { console.log(`✅ ${id}: no overlap candidates with other active changes`); return 0; }
  for (const c of candidates) console.log(`🔎 ${id} may overlap ${c.other}${c.linked ? " (linked by notes)" : ""}: ${evidenceLine(c.evidence)}`);
  return 0;
}
