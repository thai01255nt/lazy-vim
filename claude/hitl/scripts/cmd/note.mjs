// `hitl-index note add|list|show|apply` — the notes inbox of a change (0.9, `.hitl/changes/<id>/notes.md`).
//   note add   --change <id> --kind spec|design|order --refs a,b --text "…" [--title "…"] [--from "…"] [--source <other-change>]
//              --source (0.12): the note comes from another active change B (B created with --before <id>, or B's
//              plan/design changes <id>'s behaviour). It blocks every task approval, implement and the archive of <id>
//              until B is archived; --kind order needs no refs (it only says "<id> waits for B").
//   note list  [--change <id>] [--status open|pending|all] [--task <T>]
//   note show  --change <id> N-k
//   note apply --change <id> [N-k] --impact "<ref>=<class>,…" [--from "…"] [--dry-run]
// Releasing a block (ack, dismiss, defer, reopen) is not here: it is a human /hitl:approve form (hitl-index approve).
import { parseArgv } from "../lib/project.mjs";
import { TASK_ID_RE } from "../lib/specids.mjs";
import { findChange, readChange, readLiving, effectiveView, resolveSpecRef, findInView } from "../lib/changes.mjs";
import { ADD_KINDS, BLOCKING, applyCommand, incomingState, changedSinceNoted, isNoteId, nextNoteId, noteCounts, noteHitsTask, readNotes, refHashes, refKind,
  titleOf, todayIso, updateNotes, validateRefs, reopensLine } from "../lib/notes.mjs";
import { noteCtxFor } from "../lib/lock.mjs";
import { gather } from "./status.mjs";

const USAGE = `usage: hitl-index note add --change <id> --kind spec|design|order --refs a,b --text "…" [--title "…"] [--from "…"] [--source <other-change>]
       hitl-index note list [--change <id>] [--status open|pending|all] [--task <T>]
       hitl-index note show --change <id> <N-k>
       hitl-index note apply --change <id> [<N-k>] --impact "<ref>=<class>,…" [--from "…"] [--dry-run]`;
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
const fail = (msg) => Object.assign(new Error(msg), { code: 1 });
const splitList = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

/** Everything the note commands need about one change: entry, parsed change, effective view, its tasks, index, lock. */
export async function loadChangeCtx(root, config, id, { needActive = true } = {}) {
  const entry = await findChange(root, id);
  if (!entry) throw fail(`change ${id} not found`);
  if (needActive && entry.archived) throw fail(`${id} is archived (${entry.dir}); archived changes are frozen: start a follow-up change`);
  const ch = await readChange(root, entry);
  const living = await readLiving(root);
  const view = effectiveView(living, ch);
  const g = await gather(root, config, { drift: false });
  const tasks = g.tasks.filter((t) => t.change === entry.id && !t.archived);
  const { resolveRef } = await import("../lib/graph.mjs");
  const resolve = (ref) => resolveRef(g.index, ref);
  return { entry, ch, view, g, tasks, resolve,
    refCtx: { view, resolveSpecRef: (v, r) => resolveSpecRef(v, r, ch), findInView, design: ch.design, tasks, index: g.index, resolve } };
}

/** Tasks of the change each note touches: {N-k: [T…]} (a note from another change that still blocks: every task). */
export function noteBlocks(notes, tasks, g) {
  const out = {};
  for (const n of notes) {
    if (n.source) { out[n.id] = incomingState(n) ? tasks.map((t) => t.id) : []; continue; }
    out[n.id] = BLOCKING.has(n.status) ? tasks.filter((t) => {
      return n.refs.length > 0 && noteHitsTask(n, noteCtxFor(g.index, g.lock, t, g.api)).length > 0;
    }).map((t) => t.id) : [];
  }
  return out;
}

export async function run(argv, ctx) {
  const sub = argv[0];
  if (!["add", "list", "show", "apply"].includes(sub)) throw usage(sub ? `unknown note command: ${sub}` : null);
  const a = parseArgv(argv.slice(1), { flags: ["json", "dry-run"], values: ["change", "kind", "refs", "text", "title", "from", "status", "task", "impact", "source"] });
  const json = ctx.json || a.json;
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  if (sub === "add") return add(a, ctx, json);
  if (sub === "list") return list(a, ctx, json);
  if (sub === "show") return show(a, ctx, json);
  return apply(a, ctx, json);
}

async function add(a, ctx, json) {
  if (!a.change) throw usage("--change is required");
  if (!ADD_KINDS.includes(a.kind)) throw usage(`--kind must be one of ${ADD_KINDS.join("|")}${a.kind === "recheck" ? " (recheck notes are written by note apply)" : ""}`);
  const text = String(a.text || "").trim();
  if (!text) throw usage("--text is required");
  const refs = [...new Set(splitList(a.refs))];
  const c = await loadChangeCtx(ctx.root, ctx.config, a.change);
  const v = validateRefs(refs, c.refCtx);
  let source = null;
  if (a.source !== undefined) {
    source = String(a.source).trim();
    const se = source ? await findChange(ctx.root, source) : null;
    if (!source || source === c.entry.id) v.errors.push(`--source must name another change (got ${source || "nothing"})`);
    else if (!se) v.errors.push(`--source ${source}: no such change`);
    else if (se.archived) v.errors.push(`--source ${source} is archived: its spec is living now; amend ${c.entry.id} itself (/hitl:plan ${c.entry.id} amend)`);
  }
  if (v.errors.length) {
    if (json) console.log(JSON.stringify({ ok: false, change: c.entry.id, errors: v.errors }, null, 2));
    else { console.log(`🛑 note not added to ${c.entry.id}:`); for (const e of v.errors) console.log(`  - ${e}`); }
    return 1;
  }
  const base = refHashes(refs, c.refCtx);
  const note = await updateNotes(ctx.root, c.entry.dir, c.entry.id, (notes) => {
    const n = { id: nextNoteId(notes), title: a.title ? String(a.title) : titleOf(text), kind: a.kind, source, refs, refTitles: v.titles, status: "open", deferredTo: null,
      from: a.from ? String(a.from) : "user", at: todayIso(), acks: [], reason: null, resolved: null, text,
      meta: { ...(Object.keys(base).length ? { base } : {}), ...(Object.keys(v.symbols).length ? { symbols: v.symbols } : {}) } };
    notes.push(n);
    return n;
  });
  const blocks = noteBlocks([note], c.tasks, c.g)[note.id];
  if (json) console.log(JSON.stringify({ ok: true, change: c.entry.id, note: pub(note), blocks, file: `${c.entry.dir}/notes.md` }, null, 2));
  else {
    console.log(`📌 ${note.id} added to ${c.entry.id}${source ? ` from ${source}` : ""}: ${note.title}`);
    if (refs.length || !source) console.log(refs.length ? `  refs: ${refs.map((r) => (v.titles[r] ? `${r} (${v.titles[r]})` : r)).join(", ")}` : "  refs: none (warns at approvals, blocks archive)");
    if (source) console.log(`⏳ ${c.entry.id} now waits for ${source}: every task approval, implement and the archive of ${c.entry.id} wait until ${source} is archived (plan, design and tasks stay open)`);
    else if (blocks.length) console.log(`  blocks approvals of: ${blocks.join(", ")}`);
    if (!(source && a.kind === "order")) console.log(`🎯 apply it later: ${applyCommand(c.entry.id, note)}`);
  }
  return 0;
}

const pub = (n) => ({ id: n.id, title: n.title, kind: n.kind, ...(n.source ? { source: n.source, sourceState: n.sourceState ?? null, wait: incomingState(n) } : {}), refs: n.refs, refTitles: n.refTitles, status: n.status, deferredTo: n.deferredTo, from: n.from, at: n.at,
  acks: n.acks, reason: n.reason, resolved: n.resolved, text: n.text, ...(n.meta?.impact ? { impact: n.meta.impact } : {}), ...(n.meta?.reopen ? { reopen: n.meta.reopen } : {}) });

async function list(a, ctx, json) {
  const { listChanges } = await import("../lib/changes.mjs");
  const want = a.status || "open";
  if (!["open", "pending", "all"].includes(want)) throw usage("--status must be open|pending|all");
  let entries = await listChanges(ctx.root, { archived: false });
  if (a.change) {
    entries = entries.filter((e) => e.id === a.change);
    if (!entries.length) throw fail(`no active change ${a.change}`);
  }
  if (a.task && !TASK_ID_RE.test(a.task)) throw usage(`--task takes a task id (<KEY>-T<n>)${/^T-\d+$/.test(a.task) ? ": pre-0.13 id, run /hitl:migrate" : ""}`);
  const g = await gather(ctx.root, ctx.config, { drift: false });
  const out = [];
  for (const e of entries) {
    const notes = await readNotes(ctx.root, e.dir);
    if (!notes.length) continue;
    const tasks = g.tasks.filter((t) => t.change === e.id && !t.archived);
    const blocks = noteBlocks(notes, tasks, g);
    let pick = notes.filter((n) => want === "all" || (want === "pending" ? n.status === "reopen pending" : BLOCKING.has(n.status)));
    if (a.task) pick = pick.filter((n) => blocks[n.id].includes(a.task));
    out.push({ change: e.id, counts: noteCounts(notes), notes: pick.map((n) => ({ ...pub(n), blocks: blocks[n.id], apply: BLOCKING.has(n.status) ? applyCommand(e.id, n) : null })) });
  }
  if (json) { console.log(JSON.stringify({ schema: "hitl.notes/1", changes: out }, null, 2)); return 0; }
  if (!out.some((c) => c.notes.length)) { console.log(`no ${want === "all" ? "" : want + " "}notes`); return 0; }
  for (const c of out) {
    if (!c.notes.length) continue;
    console.log(`📌 ${c.change} — ${c.counts.open} open, ${c.counts.reopenPending} reopen pending (${c.counts.total} total)`);
    for (const n of c.notes) console.log(`  ${n.id} [${n.kind}, ${n.status}] ${n.title}${n.refs.length ? ` · refs ${n.refs.join(", ")}` : ""}${n.blocks.length ? ` · blocks ${n.blocks.join(", ")}` : ""}`);
  }
  return 0;
}

async function show(a, ctx, json) {
  const id = a._[0];
  if (!a.change || !isNoteId(id)) throw usage("show needs --change <id> and a note id N-k");
  const entry = await findChange(ctx.root, a.change);
  if (!entry) throw fail(`change ${a.change} not found`);
  const notes = await readNotes(ctx.root, entry.dir);
  const n = notes.find((x) => x.id === id);
  if (!n) throw fail(`${id} not found in ${entry.dir}/notes.md`);
  if (json) { console.log(JSON.stringify({ change: entry.id, note: pub(n) }, null, 2)); return 0; }
  console.log(`📌 ${entry.id} ${n.id} — ${n.title}`);
  console.log(`  kind: ${n.kind}${n.source ? ` · source: ${n.source} (${n.sourceState})` : ""} · status: ${n.status}${n.deferredTo ? ` → ${n.deferredTo.change}` : ""} · from: ${n.from}${n.at ? ` (${n.at})` : ""}`);
  console.log(`  refs: ${n.refs.length ? n.refs.map((r) => (n.refTitles[r] ? `${r} (${n.refTitles[r]})` : r)).join(", ") : "none"}`);
  for (const k of n.acks) console.log(`  acked: ${k.task}${k.at ? ` (${k.at})` : ""}`);
  if (n.kind === "recheck") console.log(`  reopens: ${reopensLine(n.meta?.reopen)}`);
  if (n.text) console.log(`\n${n.text}`);
  return 0;
}

async function apply(a, ctx, json) {
  if (!a.change) throw usage("--change is required");
  const id = a._[0] || null;
  if (id && !isNoteId(id)) throw usage(`not a note id: ${id}`);
  const { parseImpact, classErrors, computeImpact, impactLine } = await import("../lib/impact.mjs");
  const pi = parseImpact(a.impact);
  if (pi.errors.length) throw usage(pi.errors.join("; "));
  const c = await loadChangeCtx(ctx.root, ctx.config, a.change);
  const notes = await readNotes(ctx.root, c.entry.dir);
  const note = id ? notes.find((n) => n.id === id) : null;
  const errors = [...classErrors(pi.entries)];
  if (id && !note) errors.push(`${id} not found in ${c.entry.dir}/notes.md`);
  else if (note && note.status !== "open") errors.push(`${id} is ${note.status}; only an open note is applied`);
  else if (note?.kind === "recheck") errors.push(`${id} is a recheck note: the human confirms it with /hitl:approve ${c.entry.id} reopen ${id}`);
  if (!pi.entries.length && !(note && !note.refs.length)) errors.push("--impact is required: one <ref>=<class> per changed id (wording|behaviour|contract|scenario|requirement)");
  // refs must resolve now; a removed scenario/requirement (behaviour: removed) and the note's own refs are accepted as they are
  const fresh = pi.entries.map((e) => e.ref).filter((r) => !note?.refs.includes(r));
  const v = validateRefs(fresh, c.refCtx);
  for (const e of v.errors) if (!/removed spec id/.test(e)) errors.push(e);
  if (note) {
    const g = changedSinceNoted(note, c.refCtx);
    if (g.checked && !g.changed.length) errors.push(`${id}: none of its refs (${note.refs.filter((r) => note.meta?.base?.[r]).join(", ")}) changed since it was noted; amend first, or the human dismisses it (/hitl:approve ${c.entry.id} dismiss ${id} <reason>)`);
  }
  if (errors.length) {
    if (json) console.log(JSON.stringify({ ok: false, change: c.entry.id, errors }, null, 2));
    else { console.log(`🛑 note apply refused (${c.entry.id}):`); for (const e of errors) console.log(`  - ${e}`); }
    return 1;
  }
  const statusOf = (T) => c.g.statuses.tasks?.[T]?.status ?? null;
  const imp = computeImpact({ entries: pi.entries, tasks: c.tasks, index: c.g.index, lock: c.g.lock, resolve: c.resolve, statusOf, symbolOf: { ...(note?.meta?.symbols || {}), ...v.symbols } });
  const out = { ok: true, change: c.entry.id, note: id, dryRun: !!a["dry-run"], impact: pi.entries, tasks: imp.tasks, counts: imp.counts, suggestFollowUp: imp.suggestFollowUp,
    tasksUpdate: imp.tasksUpdate, line: impactLine(imp), recheck: null };
  if (!a["dry-run"]) {
    const at = todayIso();
    const titles = { ...(note?.refTitles || {}), ...v.titles };
    out.recheck = await updateNotes(ctx.root, c.entry.dir, c.entry.id, (ns) => {
      const n = id ? ns.find((x) => x.id === id) : null;
      if (n) { n.status = "applied"; n.resolved = `applied ${at}: ${pi.entries.map((e) => `${e.ref} ${e.class}`).join(", ") || "no refs"}`; }
      if (!imp.recheck) return null;
      const r = { id: nextNoteId(ns), title: n ? `Recheck after ${n.id}` : `Recheck: ${a.from || "amend"}`, kind: "recheck", refs: pi.entries.map((e) => e.ref),
        refTitles: Object.fromEntries(pi.entries.map((e) => [e.ref, titles[e.ref]]).filter(([, t]) => t)), status: "reopen pending", deferredTo: null,
        from: a.from ? String(a.from) : n ? `amend of ${n.id}` : "amend", at, acks: [], reason: null, resolved: null,
        text: imp.counts.tests || imp.counts.skeletons || imp.tasks.some((x) => x.newAc.length)
          ? `${impactLine(imp).replace(/^r/, "R")}. The human confirms with /hitl:approve ${c.entry.id} reopen.`
          : `Wording only on locked work: nothing to unlock. The human confirms with /hitl:approve ${c.entry.id} reopen.`,
        meta: { impact: pi.entries, reopen: imp.tasks.filter((x) => x.locked).map((x) => ({ task: x.task, stage: x.reopen, acs: x.acs, symbols: x.symbols, ...(x.newAc.length ? { newAc: x.newAc } : {}) })) } };
      ns.push(r);
      return r.id;
    });
  }
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  console.log(`🔁 Impact (${c.entry.id}${id ? ` ${id}` : ""}): ${out.line}`);
  if (imp.suggestFollowUp) console.log("💡 This touches more than 3 tasks or a contract: a follow-up change may be cleaner.");
  if (out.dryRun) { console.log("(dry run: nothing written)"); return 0; }
  if (id) console.log(`✅ ${id} applied`);
  if (out.recheck) console.log(`📌 ${out.recheck} recheck written (reopen pending) → 🎯 the human types /hitl:approve ${c.entry.id} reopen ${out.recheck}`);
  else console.log("✅ nothing locked is touched: no recheck needed");
  if (imp.tasksUpdate) console.log(`🎯 next: /hitl:tasks ${c.entry.id} update (new scenario or requirement)`);
  return 0;
}
