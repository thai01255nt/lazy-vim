// `hitl-index overlap <change-id> [--with B,C] [--json]` (0.12; --with, code and --review 0.13.1) — deterministic overlap
// candidates between one active change and the other active changes (all of them, or only the `--with` targets): shared
// ids, rules, decisions, contracts, symbols, files, glossary terms or capabilities, plus a small pack of the other
// change's text for the judge, and a code-level section (`code`: symbols and files both changes' tasks name, drift on
// this change's locked symbols in the other's files). Read-only. No candidates → nothing to judge.
// `linked` = the two changes are already tied by notes (`source:`); `parent` = the other change holds notes from this one
// (it waits for this change, e.g. this change was created `--before` it); `waitsFor` = the reverse.
// `--review` (used by /hitl:overlap): read the spec-reviewer's overlap verdict (.hitl/.inbox/overlap-review.json), drop
// every finding without a Given/When/Then witness quoting each change it names, print the ⛔ gate lines, remove the file.
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { parseArgv } from "../lib/project.mjs";
import { readText } from "../lib/fsutil.mjs";
import { findChange, listChanges, readChange } from "../lib/changes.mjs";
import { REVIEW_FILE, REVIEW_SCHEMA, checkOverlapReview, codeLine, codeOverlap, evidenceContext, evidenceLine, hasCode, normText, overlapEvidence,
  overlapPack, readScout } from "../lib/overlap.mjs";
import { readNotes } from "../lib/notes.mjs";

const USAGE = "usage: hitl-index overlap <change-id> [--with <id>[,<id>…]] [--review [--keep]] [--json]";
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
const fail = (msg) => Object.assign(new Error(msg), { code: 1 });

/** The `--with` targets (comma lists, repeatable), each an active change other than `id`; [] = every other active change. */
async function resolveTargets(root, id, raw) {
  const ids = [...new Set(raw.flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter(Boolean))];
  for (const t of ids) {
    if (t === id) throw fail(`--with names ${id} itself; give the other changes to compare it with`);
    const e = await findChange(root, t);
    if (!e) throw fail(`change ${t} not found`);
    if (e.archived) throw fail(`${t} is archived; overlap is about active changes (its spec is living now)`);
  }
  return ids;
}

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["json", "review", "keep"], multi: ["with"] });
  const json = ctx.json || a.json;
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  if (a._.length !== 1) throw usage();
  if (a.keep && !a.review) throw usage("--keep goes with --review");
  const id = a._[0];
  const ea = await findChange(ctx.root, id);
  if (!ea || ea.archived) throw fail(ea ? `${id} is archived; overlap is about active changes` : `change ${id} not found`);
  const withIds = await resolveTargets(ctx.root, id, a.with);
  const others = (await listChanges(ctx.root, { archived: false })).filter((e) => e.id !== id && (!withIds.length || withIds.includes(e.id)));
  const targets = others.map((e) => e.id);
  const chA = await readChange(ctx.root, ea);
  if (a.review) return review(ctx.root, id, chA, others, { json, keep: a.keep });

  const ectx = await evidenceContext(ctx.root);
  const scoutA = await readScout(ctx.root, ea.dir);
  const notesA = await readNotes(ctx.root, ea.dir).catch(() => []);
  const candidates = [];
  for (const e of others) {
    const chB = await readChange(ctx.root, e);
    const scoutB = await readScout(ctx.root, e.dir);
    const ev = overlapEvidence(chA, chB, { ...ectx, scoutA, scoutB });
    const code = codeOverlap(chA, chB, { ...ectx, scoutA, scoutB });
    const notesB = await readNotes(ctx.root, e.dir).catch(() => []);
    const parent = notesB.some((n) => n.source === id), waitsFor = notesA.some((n) => n.source === e.id);
    if (!ev.evidence.length && !hasCode(code) && !parent) continue;
    candidates.push({ other: e.id, title: chB.proposal?.title ?? null, shared: ev.shared || code.symbols.length > 0 || code.files.length > 0,
      linked: parent || waitsFor, parent, waitsFor, evidence: ev.evidence, refs: ev.refsB, code, pack: overlapPack(chA, chB, ev.evidence) });
  }
  candidates.sort((x, y) => Number(y.parent) - Number(x.parent) || Number(y.shared) - Number(x.shared) || x.other.localeCompare(y.other));
  const out = { schema: "hitl.overlap/1", change: id, targets, with: withIds.length > 0, candidates };
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!candidates.length) {
    console.log(withIds.length ? `✅ ${id}: no overlap with ${targets.join(", ")}` : `✅ ${id}: no overlap candidates with other active changes`);
    return 0;
  }
  for (const c of candidates) {
    if (c.parent) console.log(`🔗 parent ${c.other} — shared: ${c.evidence.length ? evidenceLine(c.evidence) : "none found yet"}`);
    else console.log(`🔎 ${id} may overlap ${c.other}${c.linked ? " (linked by notes)" : ""}: ${evidenceLine(c.evidence)}`);
    if (hasCode(c.code)) console.log(`   🧩 code: ${codeLine(c.code, id, c.other)}`);
  }
  return 0;
}

/** `--review`: check the judge's verdict against the cluster's own text, print the gate lines, remove the file. */
async function review(root, id, chA, others, { json, keep }) {
  const file = join(root, REVIEW_FILE);
  const raw = await readText(file, null);
  const bad = (msg) => {
    if (json) console.log(JSON.stringify({ schema: "hitl.overlap-gate/1", change: id, errors: [msg] }, null, 2));
    else console.error(`❌ ${msg}`);
    return 1;
  };
  if (raw === null) return bad(`no verdict at ${REVIEW_FILE} (the spec-reviewer's overlap mode writes it)`);
  let r;
  try { r = JSON.parse(raw); } catch { return bad(`${REVIEW_FILE} is not JSON`); }
  if (!r || typeof r !== "object" || (r.schema && r.schema !== REVIEW_SCHEMA)) return bad(`${REVIEW_FILE}: expected schema ${REVIEW_SCHEMA}`);
  if (r.change && r.change !== id) return bad(`${REVIEW_FILE} is about ${r.change}, not ${id}`);
  const texts = new Map([[id, normText([...chA.texts.values()].join("\n"))]]);
  for (const e of others) texts.set(e.id, normText([...(await readChange(root, e)).texts.values()].join("\n")));
  const cluster = [id, ...others.map((e) => e.id)];
  const { findings, dropped } = checkOverlapReview(r, { change: id, cluster, texts });
  if (!keep) await rm(file, { force: true });
  const out = { schema: "hitl.overlap-gate/1", change: id, targets: cluster.slice(1), findings, dropped };
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!findings.length) console.log(`✅ ${id}: no overlap with a witness among ${out.targets.join(", ") || "no other change"}`);
  for (const f of findings) console.log(f.line);
  for (const d of dropped) console.log(`💡 dropped ${d.id}: ${d.reason}`);
  return 0;
}
