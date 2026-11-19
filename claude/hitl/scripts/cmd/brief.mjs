// `hitl-index brief <change-id> [--kind plan|design] [--json]` — the parsed brief file of a change (0.14): rounds,
// questions with their answers (answered, accepted by the round's accept-all line, recorded, carried), the close answer.
// `hitl-index brief rename <change-id> [--to <new-change-id>] [--key <KEY>] [--json]` — renames a change and/or its key
// while it has no task yet (0.14.1: during the whole plan and design brainstorm, not only plan round 1): the folder,
// the meta lines, every id with the old key in the change's own files, and the `source:` of notes other changes hold.
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { findChange, readChange, changeInfo, CHANGES_REL } from "../lib/changes.mjs";
import { renameChangeText } from "../lib/migrateids.mjs";
import { BRIEF_KINDS, briefFileName, briefSummary, pickBrief, readBriefs } from "../lib/brief.mjs";
import { isChangeId } from "../lib/specids.mjs";
import { readText, writeTextAtomic } from "../lib/fsutil.mjs";

const USAGE = `usage: hitl-index brief <change-id> [--kind plan|design|amend] [--amend <KEY>-A<n>] [--json]
       hitl-index brief rename <change-id> [--to <new-change-id>] [--key <KEY>] [--json]`;
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
/** Text files of a change folder whose ids and meta lines a rename rewrites. */
const TEXT_FILE = /\.(md|json|ya?ml|txt)$/i;

export async function run(argv, ctx) {
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  if (argv[0] === "rename") return rename(argv.slice(1), ctx);
  const a = parseArgv(argv, { flags: ["json"], values: ["kind", "amend"] });
  const json = ctx.json || a.json;
  if (a._.length !== 1) throw usage("brief needs one change id");
  if (a.amend !== undefined) a.kind = "amend";
  if (a.kind !== undefined && !BRIEF_KINDS.includes(a.kind)) throw usage(`--kind must be ${BRIEF_KINDS.join("|")}`);
  const entry = await findChange(ctx.root, a._[0]);
  if (!entry) { console.error(`change ${a._[0]} not found`); return 1; }
  const briefs = await readBriefs(ctx.root, entry.dir);
  // an amend brief: the one named by --amend, else the open one, else the latest
  let b = a.kind === "amend" ? (a.amend ? briefs.amends.find((x) => x.amend === a.amend) : briefs.amend || briefs.amends.at(-1)) || null : a.kind ? briefs[a.kind] : null;
  if (!a.kind) {
    const info = await changeInfo(ctx.root, ctx.config, await readChange(ctx.root, entry));
    b = pickBrief(info.phase, briefs);
  }
  if (!b) {
    const msg = `no ${a.kind ? briefFileName(a.kind, a.amend) : "brief file"} in ${entry.dir}`;
    if (json) console.log(JSON.stringify({ schema: "hitl.brief/1", change: entry.id, brief: null, message: msg }));
    else console.error(msg);
    return 1;
  }
  if (json) { console.log(JSON.stringify({ ...b, change: b.change || entry.id, summary: briefSummary(b) }, null, 2)); return 0; }
  const s = briefSummary(b);
  console.log(`_Brief:_ ${entry.id} — ${b.kind} brief${b.amend ? ` ${b.amend}` : ""} round ${b.round} (${b.status}): ${b.counts.pending} pending, ${s.unanswered} unanswered · ${b.file}`);
  for (const q of b.questions.filter((x) => x.pending))
    console.log(`  ${q.id}${q.tag ? ` [${q.tag}]` : ""}${q.hot ? " _Hot_" : ""} ${q.title}${q.ownY ? " (needs its own Y)" : ""} — ${q.answered ? (q.acceptedByRound ? "accepted (round)" : q.kind) : "unanswered"}`);
  for (const n of [...b.rounds.map((r) => r.notes), b.close?.notes].filter((x) => x?.pending))
    console.log(`  Notes${n.round ? ` (Round ${n.round})` : " (Close)"} — to process: ${n.text.split("\n")[0].slice(0, 80)}`);
  if (b.close) console.log(`  close: ${b.close.question || "?"} — ${b.close.kind}`);
  return 0;
}

async function rename(argv, ctx) {
  const a = parseArgv(argv, { flags: ["json"], values: ["to", "key"] });
  const json = ctx.json || a.json;
  if (a._.length !== 1) throw usage("rename needs one change id");
  if (a.to === undefined && a.key === undefined) throw usage("rename needs --to <new-change-id> and/or --key <KEY>");
  const id = a._[0];
  const fail = (code, message, extra = {}) => {
    if (json) console.log(JSON.stringify({ ok: false, change: id, code, message, ...extra }));
    else console.log(`❌ ${code} ${message}${extra.suggestion ? ` (free key: ${extra.suggestion})` : ""}`);
    return 1;
  };
  const entry = await findChange(ctx.root, id);
  if (!entry || entry.archived) return fail("CHANGE_UNKNOWN", `${id} is not an active change`);
  const abs = join(ctx.root, entry.dir);
  // the name is fixed once the change has its first task: task ids, code tags, the lock and tickets carry it then
  const ch = await readChange(ctx.root, entry);
  const nTasks = ch.tasksDoc?.tasks?.length ?? 0;
  if (nTasks) return fail("BRIEF_RENAME_LATE", `${id} already has ${nTasks} task(s) in ${ch.tasksFile}: task ids, code tags and the lock depend on the name and key now; keep them`);
  const to = a.to !== undefined ? String(a.to) : id;
  if (!isChangeId(to)) return fail("ID_BAD_FORMAT", `change id "${to}" must match <type>-<slug> (≤ 48 chars)`);
  if (to !== id && await findChange(ctx.root, to)) return fail("CHANGE_EXISTS", `${to} already exists (active or archived)`);
  const proposalRel = `${entry.dir}/proposal.md`;
  const proposal = await readText(join(ctx.root, proposalRel), null);
  if (proposal === null) return fail("PROPOSAL_SECTION_MISSING", `${proposalRel} is missing`);
  const oldKey = /\|\s*key:\s*([A-Z]+)/.exec(proposal)?.[1] ?? null;
  const key = a.key !== undefined ? String(a.key) : oldKey;
  if (a.key !== undefined) {
    const { readKeyRegistry, checkKey, suggestKey } = await import("../lib/keys.mjs");
    const reg = await readKeyRegistry(ctx.root);
    const bad = checkKey(reg, key, id);
    if (bad) {
      const taken = new Map([...reg.byKey].filter(([, owners]) => owners.some((o) => o.change !== id)));
      let suggestion = null;
      try { suggestion = suggestKey(to, null, taken); } catch { /* no free key near the base */ }
      return fail(bad.code, bad.message, { suggestion });
    }
  }
  // rewrite the change's own text files first (old folder), then move the folder
  const filesUpdated = [];
  for (const rel of await textFiles(abs)) {
    const file = join(abs, rel);
    const text = await readText(file, null);
    if (text === null) continue;
    const next = renameChangeText(text, { from: id, to, oldKey, newKey: key, json: /\.json$/i.test(rel) });
    if (next !== text) { await writeTextAtomic(file, next); filesUpdated.push(rel); }
  }
  const notesUpdated = [];
  if (to !== id) {
    await fs.rename(abs, join(ctx.root, CHANGES_REL, to));
    // notes other changes hold from this one (`source: <id>`, e.g. --before; a note deferred to it) follow the new name
    const { readActiveNotes, updateNotes } = await import("../lib/notes.mjs");
    for (const c of await readActiveNotes(ctx.root)) {
      if (c.change === to) continue;
      if (!c.notes.some((n) => n.source === id || n.deferredTo?.change === id)) continue;
      await updateNotes(ctx.root, c.dir, c.change, (notes) => {
        for (const n of notes) {
          if (n.source === id) n.source = to;
          if (n.deferredTo?.change === id) n.deferredTo.change = to;
        }
      });
      notesUpdated.push(c.change);
    }
  }
  const out = { ok: true, from: id, to, key, oldKey, dir: `${CHANGES_REL}/${to}`, filesUpdated: filesUpdated.sort(), notesUpdated };
  if (json) console.log(JSON.stringify(out));
  else console.log(`✅ ${id}${oldKey ? ` / ${oldKey}` : ""} → ${to} / ${key}${filesUpdated.length ? ` (${filesUpdated.length} file(s) rewritten)` : ""}${notesUpdated.length ? ` (notes updated in ${notesUpdated.join(", ")})` : ""}`);
  return 0;
}

/** Text files under a change folder, relative paths (dot files included: .scout.json, .spec-review.json). */
async function textFiles(abs, pre = "") {
  const out = [];
  for (const e of await fs.readdir(join(abs, pre), { withFileTypes: true }).catch(() => [])) {
    const rel = pre ? `${pre}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await textFiles(abs, rel)));
    else if (e.isFile() && TEXT_FILE.test(e.name)) out.push(rel);
  }
  return out;
}
