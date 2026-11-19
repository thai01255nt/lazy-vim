// `hitl-index brief <change-id> [--kind plan|design] [--json]` — the parsed brief file of a change (0.14): rounds,
// questions with their answers (answered, accepted by the round's accept-all line, recorded, carried), the close answer.
// `hitl-index brief rename <change-id> [--to <new-change-id>] [--key <KEY>] [--json]` — renames a change and/or its key
// while the folder holds only the proposal, the plan brief and the scout scratch file (plan round 1, `Q0`).
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { findChange, readChange, changeInfo, CHANGES_REL } from "../lib/changes.mjs";
import { BRIEF_KINDS, briefFileName, briefSummary, pickBrief, readBriefs } from "../lib/brief.mjs";
import { isChangeId } from "../lib/specids.mjs";
import { readText, writeTextAtomic } from "../lib/fsutil.mjs";

const USAGE = `usage: hitl-index brief <change-id> [--kind plan|design] [--json]
       hitl-index brief rename <change-id> [--to <new-change-id>] [--key <KEY>] [--json]`;
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
/** Files a change folder may hold while it can still be renamed (plan round 1). */
const RENAMABLE = new Set(["proposal.md", "plan-brief.md", ".scout.json"]);

export async function run(argv, ctx) {
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  if (argv[0] === "rename") return rename(argv.slice(1), ctx);
  const a = parseArgv(argv, { flags: ["json"], values: ["kind"] });
  const json = ctx.json || a.json;
  if (a._.length !== 1) throw usage("brief needs one change id");
  if (a.kind !== undefined && !BRIEF_KINDS.includes(a.kind)) throw usage(`--kind must be ${BRIEF_KINDS.join("|")}`);
  const entry = await findChange(ctx.root, a._[0]);
  if (!entry) { console.error(`change ${a._[0]} not found`); return 1; }
  const briefs = await readBriefs(ctx.root, entry.dir);
  let b = a.kind ? briefs[a.kind] : null;
  if (!a.kind) {
    const info = await changeInfo(ctx.root, ctx.config, await readChange(ctx.root, entry));
    b = pickBrief(info.phase, briefs);
  }
  if (!b) {
    const msg = `no ${a.kind ? briefFileName(a.kind) : "brief file"} in ${entry.dir}`;
    if (json) console.log(JSON.stringify({ schema: "hitl.brief/1", change: entry.id, brief: null, message: msg }));
    else console.error(msg);
    return 1;
  }
  if (json) { console.log(JSON.stringify({ ...b, change: b.change || entry.id, summary: briefSummary(b) }, null, 2)); return 0; }
  const s = briefSummary(b);
  console.log(`📝 ${entry.id} — ${b.kind} brief round ${b.round} (${b.status}): ${b.counts.pending} pending, ${s.unanswered} unanswered · ${b.file}`);
  for (const q of b.questions.filter((x) => x.pending))
    console.log(`  ${q.id}${q.tag ? ` [${q.tag}]` : ""}${q.hot ? " 🔥" : ""} ${q.title} — ${q.answered ? (q.acceptedByRound ? "accepted (round)" : q.kind) : "unanswered"}`);
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
  const fail = (code, message) => {
    if (json) console.log(JSON.stringify({ ok: false, change: id, code, message }));
    else console.log(`❌ ${code} ${message}`);
    return 1;
  };
  const entry = await findChange(ctx.root, id);
  if (!entry || entry.archived) return fail("CHANGE_UNKNOWN", `${id} is not an active change`);
  const abs = join(ctx.root, entry.dir);
  const extra = (await fs.readdir(abs, { withFileTypes: true })).filter((e) => !(e.isFile() && RENAMABLE.has(e.name))).map((e) => e.name);
  if (extra.length) return fail("BRIEF_RENAME_LATE", `${id} already holds ${extra.join(", ")}: ids or files depend on the name now; keep it`);
  const to = a.to !== undefined ? String(a.to) : id;
  if (!isChangeId(to)) return fail("ID_BAD_FORMAT", `change id "${to}" must match <type>-<slug> (≤ 48 chars)`);
  if (to !== id && await findChange(ctx.root, to)) return fail("CHANGE_EXISTS", `${to} already exists (active or archived)`);
  const proposalRel = `${entry.dir}/proposal.md`;
  const proposal = await readText(join(ctx.root, proposalRel), null);
  if (proposal === null) return fail("PROPOSAL_SECTION_MISSING", `${proposalRel} is missing`);
  const oldKey = /\|\s*key:\s*([A-Z]+)/.exec(proposal)?.[1] ?? null;
  const key = a.key !== undefined ? String(a.key) : oldKey;
  if (a.key !== undefined) {
    const { readKeyRegistry, checkKey } = await import("../lib/keys.mjs");
    const bad = checkKey(await readKeyRegistry(ctx.root), key, id);
    if (bad) return fail(bad.code, bad.message);
  }
  // rewrite the meta lines first (old folder), then move the folder
  const meta = (text) => text.split("\n").map((l) => (/^>\s*change:/.test(l)
    ? l.replace(/(change:\s*)[\w-]+/, `$1${to}`).replace(/(\|\s*key:\s*)[A-Z]+/, `$1${key}`) : l)).join("\n");
  await writeTextAtomic(join(abs, "proposal.md"), meta(proposal));
  const briefPath = join(abs, "plan-brief.md");
  const brief = await readText(briefPath, null);
  if (brief !== null) await writeTextAtomic(briefPath, meta(brief).replace(/^(#\s+Plan brief\s+—\s+)[\w-]+/m, `$1${to}`));
  const notesUpdated = [];
  if (to !== id) {
    await fs.rename(abs, join(ctx.root, CHANGES_REL, to));
    // notes other changes hold from this one (`source: <id>`, e.g. --before) follow the new name
    const { readActiveNotes, updateNotes } = await import("../lib/notes.mjs");
    for (const c of await readActiveNotes(ctx.root)) {
      if (!c.notes.some((n) => n.source === id)) continue;
      await updateNotes(ctx.root, c.dir, c.change, (notes) => { for (const n of notes) if (n.source === id) n.source = to; });
      notesUpdated.push(c.change);
    }
  }
  const out = { ok: true, from: id, to, key, oldKey, dir: `${CHANGES_REL}/${to}`, notesUpdated };
  if (json) console.log(JSON.stringify(out));
  else console.log(`✅ ${id}${oldKey ? ` / ${oldKey}` : ""} → ${to} / ${key}${notesUpdated.length ? ` (notes updated in ${notesUpdated.join(", ")})` : ""}`);
  return 0;
}
