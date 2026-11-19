// `hitl-index note add|list|show|apply` — the notes inbox of a change (0.9, `.hitl/changes/<id>/notes.md`).
//   note add   --change <id> --kind spec|design|order --refs a,b --text "…" [--title "…"] [--from "…"] [--source <other-change>]
//              --source (0.12): the note comes from another active change B (B created with --before <id>, or B's
//              plan/design changes <id>'s behaviour). It blocks every task approval, implement and the archive of <id>
//              until B is archived; --kind order needs no refs (it only says "<id> waits for B").
//   note list  [--change <id>] [--status open|pending|all] [--task <T>]
//   note show  --change <id> N-k
//   note apply --change <id> [N-k] --impact "<ref>=<class>,…" [--amend <KEY>-A<n>] [--from "…"] [--dry-run]
//              --amend (0.17): the approved amend brief; its `from:` notes are applied, done tasks are kept (never
//              reopened), and the `rewrite:` rows of its tasks become take-overs in the recheck note
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
       hitl-index note apply --change <id> [<N-k>] --impact "<ref>=<class>,…" [--amend <KEY>-A<n>] [--from "…"] [--dry-run]`;
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
  const a = parseArgv(argv.slice(1), { flags: ["json", "dry-run"], values: ["change", "kind", "refs", "text", "title", "from", "status", "task", "impact", "source", "amend"] });
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
    else { console.log(`_Stop:_ note not added to ${c.entry.id}:`); for (const e of v.errors) console.log(`  - ${e}`); }
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
    console.log(`_Note ${note.id}_ added to ${c.entry.id}${source ? ` from ${source}` : ""}: ${note.title}`);
    if (refs.length || !source) console.log(refs.length ? `  refs: ${refs.map((r) => (v.titles[r] ? `${r} (${v.titles[r]})` : r)).join(", ")}` : "  refs: none (warns at approvals, blocks archive)");
    if (source) console.log(`_Waits:_ ${c.entry.id} now waits for ${source}: every task approval, implement and the archive of ${c.entry.id} wait until ${source} is archived (plan, design and tasks stay open)`);
    else if (blocks.length) console.log(`  blocks approvals of: ${blocks.join(", ")}`);
    if (!(source && a.kind === "order")) console.log(`_Next:_ apply it later: ${applyCommand(c.entry.id, note)}`);
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
    console.log(`_Note_ ${c.change} — ${c.counts.open} open, ${c.counts.reopenPending} reopen pending (${c.counts.total} total)`);
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
  console.log(`_Note ${n.id}_ ${entry.id} — ${n.title}`);
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
  const errors = [...classErrors(pi.entries)];
  // 0.17: --amend <KEY>-A<n> applies the approved amend brief: its `from:` notes (and N-k, if given) together
  let brief = null;
  if (a.amend !== undefined) {
    const { readAmendBriefs } = await import("../lib/brief.mjs");
    brief = (await readAmendBriefs(ctx.root, c.entry.dir)).find((b) => b.amend === String(a.amend)) || null;
    if (!brief) errors.push(`no amend-${a.amend}-brief.md in ${c.entry.dir}`);
  }
  const ids = [...new Set([...(id ? [id] : []), ...(brief?.from || [])])];
  const picked = ids.map((x) => notes.find((n) => n.id === x) || { id: x, missing: true });
  const note = picked[0] && !picked[0].missing ? picked[0] : null;
  for (const n of picked) {
    if (n.missing) errors.push(`${n.id} not found in ${c.entry.dir}/notes.md`);
    else if (n.status !== "open") errors.push(`${n.id} is ${n.status}; only an open note is applied`);
    else if (n.kind === "recheck") errors.push(`${n.id} is a recheck note: the human confirms it with /hitl:approve ${c.entry.id} reopen ${n.id}`);
  }
  const live = picked.filter((n) => !n.missing);
  const noteRefs = new Set(live.flatMap((n) => n.refs));
  if (!pi.entries.length && !(note && !note.refs.length && live.length === 1)) errors.push("--impact is required: one <ref>=<class> per changed id (wording|behaviour|contract|scenario|requirement)");
  // refs must resolve now; a removed scenario/requirement (behaviour: removed) and the notes' own refs are accepted as they are
  const fresh = pi.entries.map((e) => e.ref).filter((r) => !noteRefs.has(r));
  const v = validateRefs(fresh, c.refCtx);
  for (const e of v.errors) if (!/removed spec id/.test(e)) errors.push(e);
  // the apply guard (a ref must have changed) holds for the real apply; a --dry-run previews the Impact before the edit
  if (!a["dry-run"]) for (const n of live) {
    const g = changedSinceNoted(n, c.refCtx);
    if (g.checked && !g.changed.length) errors.push(`${n.id}: none of its refs (${n.refs.filter((r) => n.meta?.base?.[r]).join(", ")}) changed since it was noted; amend first, or the human dismisses it (/hitl:approve ${c.entry.id} dismiss ${n.id} <reason>)`);
  }
  if (errors.length) {
    if (json) console.log(JSON.stringify({ ok: false, change: c.entry.id, errors }, null, 2));
    else { console.log(`_Stop:_ note apply refused (${c.entry.id}):`); for (const e of errors) console.log(`  - ${e}`); }
    return 1;
  }
  const statusOf = (T) => c.g.statuses.tasks?.[T]?.status ?? null;
  const symbolOf = Object.assign({}, ...live.map((n) => n.meta?.symbols || {}), v.symbols);
  const imp = computeImpact({ entries: pi.entries, tasks: c.tasks, index: c.g.index, lock: c.g.lock, resolve: c.resolve, statusOf, symbolOf, keepDone: !!brief });
  // 0.17: take-overs — locked tests of other tasks (done here, or archived) that the amend set's `rewrite:` rows name
  const takeovers = [];
  if (brief) {
    const { rewriteTargets } = await import("../lib/testplan.mjs");
    for (const t of c.tasks.filter((x) => x.amend === brief.amend && x.status !== "dropped")) {
      const refs = {};
      for (const x of rewriteTargets(c.g.index, c.g.lock, t)) for (const tid of x.ids) if (c.g.lock.tests?.[tid]?.stage === "locked" && c.g.lock.tests[tid].task !== t.id) refs[tid] = x.ref;
      if (Object.keys(refs).length) takeovers.push({ task: t.id, stage: "takeover", tests: Object.keys(refs).sort(), refs, from: [...new Set(Object.keys(refs).map((tid) => c.g.lock.tests[tid].task))] });
    }
  }
  const line = impactLine(imp) + (takeovers.length ? ` · takes over ${takeovers.reduce((n, x) => n + x.tests.length, 0)} locked test(s): ${takeovers.map((x) => `${x.task} ← ${x.from.join(", ")}`).join("; ")}` : "");
  const out = { ok: true, change: c.entry.id, note: id, notes: live.map((n) => n.id), amend: brief?.amend ?? null, dryRun: !!a["dry-run"], impact: pi.entries, tasks: imp.tasks, counts: imp.counts, suggestFollowUp: imp.suggestFollowUp,
    tasksUpdate: imp.tasksUpdate, takeovers, line, recheck: null };
  if (!a["dry-run"]) {
    const at = todayIso();
    const titles = Object.assign({}, ...live.map((n) => n.refTitles || {}), v.titles);
    out.recheck = await updateNotes(ctx.root, c.entry.dir, c.entry.id, (ns) => {
      const applied = live.map((x) => ns.find((y) => y.id === x.id)).filter(Boolean);
      for (const n of applied) { n.status = "applied"; n.resolved = `applied ${at}${brief ? ` in ${brief.amend}` : ""}: ${pi.entries.map((e) => `${e.ref} ${e.class}`).join(", ") || "no refs"}`; }
      const n = applied[0] || null;
      if (!imp.recheck && !takeovers.length) return null;
      const what = brief ? brief.amend : n ? n.id : null;
      const r = { id: nextNoteId(ns), title: what ? `Recheck after ${what}` : `Recheck: ${a.from || "amend"}`, kind: "recheck", refs: pi.entries.map((e) => e.ref),
        refTitles: Object.fromEntries(pi.entries.map((e) => [e.ref, titles[e.ref]]).filter(([, t]) => t)), status: "reopen pending", deferredTo: null,
        from: a.from ? String(a.from) : what ? `amend of ${what}` : "amend", at, acks: [], reason: null, resolved: null,
        text: imp.counts.tests || imp.counts.skeletons || imp.tasks.some((x) => x.newAc.length) || takeovers.length
          ? `${line.replace(/^r/, "R")}. The human confirms with /hitl:approve ${c.entry.id} reopen.`
          : `Wording only on locked work: nothing to unlock. The human confirms with /hitl:approve ${c.entry.id} reopen.`,
        meta: { impact: pi.entries, ...(brief ? { amend: brief.amend } : {}),
          reopen: [...imp.tasks.filter((x) => x.locked).map((x) => ({ task: x.task, stage: x.reopen, acs: x.acs, symbols: x.symbols, ...(x.newAc.length ? { newAc: x.newAc } : {}) })), ...takeovers] } };
      ns.push(r);
      return r.id;
    });
  }
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  console.log(`_Impact:_ (${c.entry.id}${brief ? ` ${brief.amend}` : id ? ` ${id}` : ""}): ${out.line}`);
  if (imp.suggestFollowUp) console.log("_Tip:_ This touches more than 3 tasks or a contract: a follow-up change may be cleaner.");
  if (out.dryRun) { console.log("(dry run: nothing written)"); return 0; }
  for (const n of live) console.log(`✅ ${n.id} applied`);
  if (out.recheck) console.log(`_Note ${out.recheck}_ recheck written (reopen pending) → _Next:_ the human types /hitl:approve ${c.entry.id} reopen ${out.recheck}`);
  else console.log("✅ nothing locked is touched: no recheck needed");
  if (imp.tasksUpdate) console.log(`_Next:_ /hitl:tasks ${c.entry.id} update (new scenario or requirement)`);
  return 0;
}
