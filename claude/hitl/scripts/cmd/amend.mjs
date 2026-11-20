// `hitl-index amend start|check` — amendments of an active change (0.17, shared/amend-spec.md, shared/task-changes.md).
//   amend start <change-id> [--from N-k[,N-m]] [--refs a,b] [--impact "<ref>=<class>,…"] [--text "…"] [--skill plan|design]
//               [--depth n] [--write] [--json]
//     Round 1 facts, read-only by default: the route (brief | chat, with the reason), the amendment id (next free
//     <KEY>-A<n>, or the open amend brief to continue), where each task stands (status, locks, the per-state rule of
//     shared/task-changes.md), what the amendment touches by the traceability links (specs, decisions, ACs, symbols,
//     locked tests — also tests of archived changes), and the open notes. --write creates the amend brief with these
//     facts (header, Description, Where the change stands, Affected); the skill appends Round 1.
//     --depth n (0.18): hops of the dependency pass over the call graph (callers of the changed symbols), default 1.
//   amend check <change-id> [--amend <KEY>-A<n>] [--depth n] [--json]
//     AMEND_ORDER, AMEND_TEMP_NO_REMOVAL, AMEND_CONTRACT_SAME_DEPLOY (merged or released old behaviour) and
//     AMEND_UNCOVERED (traceability items and the callers the dependency pass finds) of an amend task set written into
//     tasks.md (exit 1 when any); INTENT_HISTORY warnings for the set's symbols (never change the exit code).
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { readNotes, todayIso, isNoteId } from "../lib/notes.mjs";
import { parseImpact } from "../lib/impact.mjs";
import { CALL_DEPTH, changeAmendCtx, checkAmendCoverage, checkAmendOrder, checkAmendTemp, nextAmendId, normTransition, renderAmendBriefHead, routeAmend, stateRule, whereTasksStand, TRANSITIONS } from "../lib/amend.mjs";
import { historyItems } from "../lib/history.mjs";
import { taskSymbolIds } from "../lib/lock.mjs";
import { briefFileName, openAmendBrief } from "../lib/brief.mjs";
import { findChange } from "../lib/changes.mjs";
import { writeTextAtomic } from "../lib/fsutil.mjs";

const USAGE = `usage: hitl-index amend start <change-id> [--from N-k[,N-m]] [--refs a,b] [--impact "<ref>=<class>,…"] [--text "…"] [--skill plan|design] [--depth n] [--write] [--json]
       hitl-index amend check <change-id> [--amend <KEY>-A<n>] [--depth n] [--json]`;
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

export async function run(argv, ctx) {
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  const sub = argv[0];
  if (!["start", "check"].includes(sub)) throw usage(sub ? `unknown amend command: ${sub}` : null);
  const a = parseArgv(argv.slice(1), { flags: ["json", "write"], values: ["from", "refs", "impact", "text", "skill", "amend", "depth"] });
  const json = ctx.json || a.json;
  if (a.depth !== undefined && !/^[1-9]\d*$/.test(String(a.depth))) throw usage("--depth takes a whole number ≥ 1");
  a.depth = a.depth !== undefined ? Number(a.depth) : CALL_DEPTH;
  if (a._.length !== 1) throw usage(`amend ${sub} needs one change id`);
  return sub === "start" ? start(a, ctx, json) : check(a, ctx, json);
}

async function start(a, ctx, json) {
  const id = a._[0];
  const entry = await findChange(ctx.root, id);
  if (!entry) { console.error(`change ${id} not found`); return 1; }
  const pi = parseImpact(a.impact);
  if (pi.errors.length) throw usage(pi.errors.join("; "));
  const skill = a.skill ? String(a.skill) : "plan";
  if (!["plan", "design"].includes(skill)) throw usage("--skill takes plan|design");
  if (entry.archived) {
    const r = routeAmend({ archived: true });
    const out = { schema: "hitl.amend-start/1", change: id, archived: true, ...r, next: "/hitl:plan fix-<slug> (a mini change with its own key: hitl-index spec key fix-<slug>)" };
    if (json) console.log(JSON.stringify(out, null, 2)); else console.log(`_Route:_ chat (${r.chat}) — ${r.reason}`);
    return 0;
  }
  const c = await changeAmendCtx(ctx.root, ctx.config, id);
  const notes = await readNotes(ctx.root, c.entry.dir);
  const fromIds = list(a.from);
  for (const n of fromIds) if (!isNoteId(n)) throw usage(`--from takes note ids (N-k), got ${n}`);
  const from = fromIds.map((n) => notes.find((x) => x.id === n) || { id: n, missing: true });
  const missing = from.filter((n) => n.missing).map((n) => n.id);
  if (missing.length) { console.error(`${missing.join(", ")} not found in ${c.entry.dir}/notes.md`); return 1; }
  const open = openAmendBrief(c.briefs);
  const refs = [...new Set([...(open?.refs || []), ...from.flatMap((n) => n.refs || []), ...list(a.refs), ...pi.entries.map((e) => e.ref)])];
  const r = routeAmend({ refs, impact: pi.entries, open });
  const key = c.ch.proposal?.key;
  if (!key) { console.error(`${id} has no change key (proposal meta "| key: <KEY>"): run /hitl:migrate`); return 1; }
  const amend = open ? open.amend : nextAmendId(key, c.briefs, c.tasks);
  const stands = whereTasksStand(c.g.tasks, c.entry.id, { index: c.g.index, lock: c.g.lock, api: c.g.api, refs, statusOf: c.statusOf }).map((x) => ({ ...x, rule: stateRule(x) }));
  const affected = c.affectedOf(refs, { amend, impact: pi.entries, depth: a.depth });
  const openNotes = notes.filter((n) => ["open", "reopen pending"].includes(n.status)).map((n) => ({ id: n.id, title: n.title, kind: n.kind, status: n.status, refs: n.refs, ...(n.source ? { source: n.source } : {}) }));
  const file = open ? open.file : `${c.entry.dir}/${briefFileName("amend", amend)}`;
  const out = { schema: "hitl.amend-start/1", change: c.entry.id, key, amend, file, open: open ? { amend: open.amend, status: open.status, round: open.round, file: open.file } : null,
    proposal: c.ch.proposal?.status || "draft", design: c.ch.design?.status || null, route: r.route, chat: r.chat, reason: r.reason,
    from: fromIds, refs, impact: pi.entries, tasks: stands, affected, notes: openNotes, transitions: TRANSITIONS, written: false };
  if (a.write) {
    if (open) out.reason = `${open.amend} is open: nothing written (continue ${open.file})`;
    else if (r.route !== "brief") { console.error(`route is chat (${r.chat}): ${r.reason}; no amend brief written`); if (json) console.log(JSON.stringify(out, null, 2)); return 1; }
    else {
      const text = a.text ? String(a.text) : from.map((n) => n.text || n.title).filter(Boolean).join("\n\n");
      const md = renderAmendBriefHead({ change: c.entry.id, key, amend, from: fromIds, refs, skill, today: todayIso(), description: text, stands, affected, notes: openNotes });
      await fs.access(join(ctx.root, file)).then(() => { throw Object.assign(new Error(`${file} exists already`), { code: 1 }); }, () => {});
      await writeTextAtomic(join(ctx.root, file), md);
      out.written = true;
    }
  }
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  console.log(`_Route:_ ${r.route}${r.chat ? ` (${r.chat})` : ""} — ${r.reason}`);
  console.log(`_Amend:_ ${amend}${open ? ` (open, round ${open.round})` : ""} · ${file}${out.written ? " (written)" : ""}`);
  for (const t of stands) console.log(`  ${t.id} ${t.title} — ${t.status}${t.touched.length ? ` · touched via ${t.touched.join(", ")}` : ""} · ${t.rule}`);
  const n = (k) => affected[k].length;
  console.log(`  affected: ${n("specs")} spec id(s), ${n("decisions")} decision(s), ${n("acs")} AC(s), ${n("symbols")} symbol(s), ${n("tests")} locked test(s) · open notes: ${openNotes.length}`);
  const k = affected.calls;
  console.log(`  reached through calls (${k.depth} hop(s)): ${k.callers.length} caller(s) of ${k.seeds.length} changed symbol(s), ${k.tests.length} caller test(s), ${k.entities.length} data-model entit${k.entities.length === 1 ? "y" : "ies"}${k.truncated ? ` (stopped at ${k.limit})` : ""}`);
  for (const x of k.callers) console.log(`    ${x.name} — ${x.via}`);
  return 0;
}

async function check(a, ctx, json) {
  const id = a._[0];
  const c = await changeAmendCtx(ctx.root, ctx.config, id);
  const briefs = a.amend ? c.briefs.filter((b) => b.amend === a.amend) : c.briefs;
  if (a.amend && !briefs.length) { console.error(`no ${briefFileName("amend", a.amend)} in ${c.entry.dir}`); return 1; }
  const transitions = Object.fromEntries(c.briefs.map((b) => [b.amend, normTransition(b.transition)]));
  const mine = (e) => !a.amend || e.amend === a.amend;
  const order = checkAmendOrder(c.tasks, transitions).filter(mine);
  const temp = checkAmendTemp(c.tasks, transitions).filter(mine);
  const uncovered = [], calls = {}, warnings = [];
  for (const b of briefs) {
    const affected = c.affectedOf(b.refs, { amend: b.amend, depth: a.depth });
    calls[b.amend] = affected.calls;
    for (const e of checkAmendCoverage({ amend: b.amend, brief: b, affected, tasks: c.tasks, index: c.g.index, lock: c.g.lock, change: c.entry.id })) uncovered.push({ amend: b.amend, ...e });
    // 0.18 INTENT_HISTORY: the symbols of the set's tasks and the symbols the amendment changes (warnings only)
    if (ctx.config?.intent?.history === "off") continue;
    const ids = new Set(affected.calls.seeds.map((x) => x.id));
    for (const t of c.tasks.filter((x) => x.amend === b.amend && x.status !== "dropped")) for (const id of taskSymbolIds(c.g.index, t.id, t)) ids.add(id);
    for (const w of historyItems(c.g.index, [...ids].sort())) warnings.push({ amend: b.amend, ...w, message: `INTENT_HISTORY: ${w.message}` });
  }
  const out = { schema: "hitl.amend-check/1", change: c.entry.id, amends: briefs.map((b) => ({ amend: b.amend, status: b.status, transition: normTransition(b.transition), tasks: c.tasks.filter((t) => t.amend === b.amend).map((t) => t.id) })),
    errors: [...order.map((e) => ({ code: "AMEND_ORDER", ...e })), ...temp, ...uncovered.map((e) => ({ code: "AMEND_UNCOVERED", ...e }))], warnings, calls };
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(out.errors.length ? out.errors.map((e) => `❌ ${e.message}`).join("\n") : `✅ amend check passed (${briefs.map((b) => b.amend).join(", ") || "no amendment"})`);
    for (const w of warnings) console.log(`⚠️ ${w.message}`);
  }
  return out.errors.length ? 1 : 0;
}
