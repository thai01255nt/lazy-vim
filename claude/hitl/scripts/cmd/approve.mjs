// P2 — `hitl-index approve <T> [--stage skeleton|tests|done] [--symbols a,b] [--by human|auto|human-override] [--dry-run] [--force] [--json]` (§E.5)
// The human-only rule for `--by human` is enforced by the PreToolUse approve token (P3); the CLI enforces `--by auto` = low risk only.
// `--by human-override` (the user forced the fast lane with `/hitl:implement <T> --lane fast`) is gated by the hook's override
// token the same way; the CLI allows it for any risk, never for stage done, and marks the task as overridden in the lock.
// `hitl-index approve --change <id> [--stage intent|accept] [--symbols a,b] --by human [--dry-run] [--json]`: the change-form
// stages, both human-only (the hook's approve token must be bound to that change and stage). intent: re-lock the intents of
// a done change's symbols. accept: accept the later drift (intent, TODO steps, body, locked tests) of an archived change.
// 0.9: `--stage reopen [--note N-k]` unlocks what a recheck note lists; `--stage dismiss --note N-k --reason "…"` and
// `--stage defer --note N-k --to <change>` close a note. All human-only; `<T> --ack N-k` releases a note for one task.
import { parseArgs } from "node:util";
import { planApproval, writeLock, APPROVERS, CHANGE_STAGES, NOTE_STAGES, lockedTasks } from "../lib/lock.mjs";
import { synctags } from "../lib/synctags.mjs";
import { computeStatuses } from "../lib/status.mjs";
import { computeNext } from "../lib/nextstep.mjs";
import { gather } from "./status.mjs";
import { loadTraceInputs, specLinksFor } from "../lib/trace.mjs";
import { BLOCKING, readNotes, updateNotes, todayIso, nextNoteId, refHashes, validateRefs } from "../lib/notes.mjs";
import { findChange } from "../lib/changes.mjs";

const USAGE = "usage: hitl-index approve <T-id> [--stage skeleton|tests|done] [--symbols a,b] [--ack N-k] [--by human|auto|human-override] [--dry-run] [--force]  |  hitl-index approve --change <change-id> --stage intent|accept|reopen [--symbols a,b] [--note N-k] --by human [--dry-run]  |  hitl-index approve --change <change-id> --stage dismiss --note N-k --reason \"…\" --by human  |  hitl-index approve --change <change-id> --stage defer --note N-k --to <change-id> --by human";
const OPTS = { ack: { type: "string" }, note: { type: "string" }, reason: { type: "string" }, to: { type: "string" }, change: { type: "string" }, stage: { type: "string" }, symbols: { type: "string" }, by: { type: "string" }, "dry-run": { type: "boolean" }, force: { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  const T = positionals[0];
  // tolerate positional stage/symbols (`approve T-1 tests a,b`) in addition to the flags
  if (v.change !== undefined) return runChange(v, positionals, ctx, json);
  if (CHANGE_STAGES.includes(v.stage) || NOTE_STAGES.includes(v.stage)) { console.error(`--stage ${v.stage} takes --change <change-id> instead of a task id: hitl-index approve --change <id> --stage ${v.stage} --by human`); return 2; }
  if (!v.stage && ["skeleton", "tests", "done"].includes(positionals[1])) v.stage = positionals[1];
  if (!v.symbols && positionals.length > 2) v.symbols = positionals.slice(2).join(",");
  if (!T || !/^T-\d+$/.test(T)) { console.error(USAGE); return 2; }
  const by = v.by || "human";
  if (!APPROVERS.includes(by)) { console.error(`--by must be one of ${APPROVERS.join("|")}`); return 2; }
  const ack = v.ack ? String(v.ack).split(",").map((x) => x.trim()).filter(Boolean) : [];
  if (ack.some((x) => !/^N-\d+$/.test(x))) { console.error(`--ack takes note ids (N-k[,N-m]), got ${v.ack}`); return 2; }
  if (ack.length && by !== "human") { console.error(`--ack is human-only: --by human (not --by ${by})`); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const g = await gather(ctx.root, ctx.config, { drift: false });
  const task = g.tasks.find((t) => t.id === T);
  const noteDir = task?.change && !task.archived ? (await findChange(ctx.root, task.change))?.dir ?? null : null;
  const notes = noteDir ? await readNotes(ctx.root, noteDir) : [];
  const plan = planApproval({ taskId: T, stage: v.stage, symbols: v.symbols ? v.symbols.split(",").map((s) => s.trim()).filter(Boolean) : null,
    by, force: !!v.force, index: g.index, lock: g.lock, state: g.state, config: ctx.config, task, tasks: g.tasks, statuses: g.statuses, api: g.api, notes, ack });
  const counts = (l) => ({ symbols: Object.values(l.symbols).filter((s) => lockedTasks(s).includes(T)).length, tests: Object.values(l.tests).filter((t) => t.task === T).length,
    testsLocked: Object.values(l.tests).filter((t) => t.task === T && t.stage === "locked").length });
  const nextCmd = plan.stage === "skeleton" ? `/hitl:test ${T}` : plan.stage === "tests" ? `/hitl:implement ${T}` : null;
  const out = { ok: plan.ok, task: T, stage: plan.stage, by, ...(by === "human-override" ? { override: true } : {}), dryRun: !!v["dry-run"], reasons: plan.reasons,
    warnings: plan.warnings || [], ...(plan.blockedBy?.length ? { blockedBy: plan.blockedBy } : {}), ...(plan.noteAcks?.length ? { acked: plan.noteAcks } : {}), changes: plan.changes };
  const warn = () => { if (!json) for (const w of out.warnings) console.log(`⚠️ ${w}`); };

  if (!plan.ok) {
    const suggest = plan.blockedBy?.length ? plan.blockedBy[0].apply
      : plan.stage === "skeleton" ? `fix the skeleton/tags then rerun; check with: hitl-index drift --task ${T}`
      : plan.stage === "tests" ? `hitl-index test --task ${T}` : `/hitl:review ${T}`;
    if (json) console.log(JSON.stringify({ ...out, suggest }, null, 2));
    else { console.log(`🛑 approve ${T} --stage ${plan.stage} refused:`); for (const r of plan.reasons) console.log(`  - ${r}`); console.log(`💡 ${suggest}`); }
    return 1;
  }
  if (v["dry-run"]) {
    if (json) console.log(JSON.stringify({ ...out, locked: counts(plan.lock) }, null, 2));
    else {
      const c = plan.changes; const nm = (id) => g.index.symbols[id]?.name || id;
      console.log(`approve ${T} --stage ${plan.stage} (dry run, by ${by}):`);
      console.log(`  symbols: new ${c.symbols.new.length}, changed ${c.symbols.changed.length}, unchanged ${c.symbols.unchanged.length}, removed ${c.symbols.removed.length}, renamed ${c.symbols.renamed.length}`);
      for (const id of c.symbols.new) console.log(`    + ${nm(id)}`);
      for (const x of c.symbols.changed) console.log(`    ~ ${nm(x.id)} (${x.what.join(",")})`);
      for (const id of c.symbols.removed) console.log(`    - ${id} (removed from lock)`);
      for (const x of c.symbols.renamed) console.log(`    ✏️ ${x.from} → ${x.to} (renamed in lock)`);
      console.log(`  tests: new ${c.tests.new.length}, changed ${c.tests.changed.length}, unchanged ${c.tests.unchanged.length}, removed ${c.tests.removed.length}`);
      for (const id of c.tests.removed) console.log(`    - ${id} (removed from lock)`);
      for (const [ac, ts] of Object.entries(c.acCoverage)) console.log(`    ${ac}: ${ts.length} test(s)`);
      warn();
    }
    return 0;
  }
  await writeLock(ctx.root, plan.lock);
  if (plan.noteAcks?.length && noteDir) {
    const at = todayIso();
    await updateNotes(ctx.root, noteDir, task.change, (ns) => {
      for (const n of ns) if (plan.noteAcks.includes(n.id) && !n.acks.some((a) => a.task === T)) n.acks.push({ task: T, at });
    });
  }
  let sync = null; try { sync = await synctags(ctx.root, { task: T, config: ctx.config }); } catch (e) { sync = { error: e.message }; }
  let next = nextCmd;
  if (!next) {
    const st = computeStatuses(g.index, plan.lock, g.state, ctx.config, g.tasks);
    const { notesInfo } = await import("./status.mjs");
    const ni = await notesInfo(ctx.root, { ...g, lock: plan.lock }).catch(() => ({}));
    next = computeNext({ tasks: g.tasks, statuses: st, lock: plan.lock, notes: ni }).command;
  }
  let specLinks = null;
  if (plan.stage === "skeleton" && plan.changes.symbols.changed.length) {
    try {
      const inputs = await loadTraceInputs(ctx.root, ctx.config, { index: g.index, lock: plan.lock, state: g.state, tasks: g.tasks, statuses: g.statuses });
      specLinks = [];
      for (const { id } of plan.changes.symbols.changed) {
        const sp = specLinksFor(inputs, id);
        if (sp && (sp.decisions.length || sp.requirements.length)) specLinks.push({ symbol: id, decisions: sp.decisions, requirements: sp.requirements });
      }
    } catch { specLinks = null; }
  }
  const hasLinks = specLinks?.length > 0;
  if (json) console.log(JSON.stringify({ ...out, ...(hasLinks ? { specLinks } : {}), locked: counts(plan.lock), next, syncTags: sync && !sync.error ? { files: sync.files, tasksFiles: sync.tasksFiles } : sync }, null, 2));
  else {
    const k = counts(plan.lock);
    console.log(`✅ ${T} ${plan.stage} approved by ${by}: ${k.symbols} symbol(s), ${k.tests} test(s) (${k.testsLocked} locked)`);
    if (plan.noteAcks?.length) console.log(`📌 acked for ${T}: ${plan.noteAcks.join(", ")} (the note stays open; it still blocks other tasks and archive)`);
    warn();
    const removed = [...plan.changes.symbols.removed, ...plan.changes.tests.removed];
    if (removed.length) console.log(`🗑️ removed from lock: ${removed.join(", ")}`);
    if (plan.changes.symbols.renamed.length) console.log(`✏️ renamed in lock: ${plan.changes.symbols.renamed.map((x) => `${x.from} → ${x.to}`).join(", ")}`);
    if (by === "human-override") console.log(`⚠️ ${T} is marked human-override: its review routes every function to the human (L2)`);
    if (hasLinks) {
      const ids = [...new Set(specLinks.flatMap((l) => [...l.decisions.map((d) => d.id), ...l.requirements.map((r) => r.id)]))];
      console.log(`📐 linked ${ids.join(", ")} — if the decision changed, amend the plan (/hitl:sync offers it)`);
    }
    console.log(`🎯 next: ${next}`);
  }
  return 0;
}

/**
 * `approve --change <id> --stage intent|accept|reopen|dismiss|defer`: intent re-locks the intents of a done change's
 * symbols; accept records the later drift of an archived change's symbols/tests as accepted; reopen unlocks what the
 * change's recheck notes list (0.9); dismiss/defer close a note (notes.md only). Nothing else in the lock moves.
 */
async function runChange(v, positionals, ctx, json) {
  const C = typeof v.change === "string" ? v.change.trim() : "";
  const usage = "usage: hitl-index approve --change <change-id> [--stage intent|accept|reopen] [--symbols a,b] [--note N-k] --by human [--dry-run] [--json]  |  --stage dismiss --note N-k --reason \"…\"  |  --stage defer --note N-k --to <change-id>";
  if (!C || !/^[A-Za-z0-9][\w.-]*$/.test(C) || /^T-\d+$/.test(C)) { console.error(usage); return 2; }
  if (positionals.length) { console.error(`--change takes no positional task/stage (got ${positionals.join(" ")}); ${usage}`); return 2; }
  const stage = v.stage || "intent";
  if (!CHANGE_STAGES.includes(stage) && !NOTE_STAGES.includes(stage)) { console.error(`--change approves only --stage intent, accept, reopen, dismiss or defer (got ${v.stage})`); return 2; }
  if (v.force) { console.error(`--force does not apply to --stage ${stage}`); return 2; }
  if (v.ack) { console.error("--ack belongs to a task approval: hitl-index approve <T> --stage <s> --ack N-k --by human"); return 2; }
  const by = v.by || "human";
  const what0 = { accept: "accept", intent: "intent re-approval", reopen: "reopen", dismiss: "dismissing a note", defer: "deferring a note" }[stage];
  if (by !== "human") { console.error(`${what0} is human-only: --by human (not --by ${by})`); return 2; }
  if (v.note !== undefined && !/^N-\d+$/.test(String(v.note))) { console.error(`--note takes a note id N-k (got ${v.note})`); return 2; }
  if (NOTE_STAGES.includes(stage) && !v.note) { console.error(`--stage ${stage} needs --note N-k`); return 2; }
  if (stage === "dismiss" && !String(v.reason || "").trim()) { console.error("--stage dismiss needs --reason \"…\" (why the note does not apply)"); return 2; }
  if (stage === "defer" && !v.to) { console.error("--stage defer needs --to <change-id>"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  if (NOTE_STAGES.includes(stage)) return noteDecision(stage, C, v, ctx, json);
  const g = await gather(ctx.root, ctx.config, { drift: false });
  const entry = stage === "reopen" ? await findChange(ctx.root, C) : null;
  if (stage === "reopen" && !entry) { console.error(`change ${C} not found`); return 1; }
  const notes = entry && !entry.archived ? await readNotes(ctx.root, entry.dir) : [];
  const plan = planApproval({ changeId: C, stage, symbols: v.symbols ? v.symbols.split(",").map((s) => s.trim()).filter(Boolean) : null,
    by, index: g.index, lock: g.lock, state: g.state, config: ctx.config, tasks: g.tasks, statuses: g.statuses, api: g.api,
    notes, noteId: v.note || null, archived: !!entry?.archived });
  const nm = (id) => g.index.symbols[id]?.name || id.slice(id.indexOf("#") + 1);
  const out = { ok: plan.ok, change: C, stage, by, dryRun: !!v["dry-run"], reasons: plan.reasons, warnings: plan.warnings || [], changes: plan.changes };
  const warn = () => { if (!json) for (const w of out.warnings) console.log(`⚠️ ${w}`); };
  if (!plan.ok) {
    const suggest = stage === "accept" ? `hitl-index drift --json (items with change ${C}); claim instead: add a modify row + @task <T> to an open task, then /hitl:approve <T> skeleton <sym>`
      : stage === "reopen" ? `hitl-index note list --change ${C} --status all`
      : `hitl-index drift --json (INTENT_CHANGED only); hitl-index intents ${C}`;
    if (json) console.log(JSON.stringify({ ...out, suggest }, null, 2));
    else { console.log(`🛑 approve --change ${C} --stage ${stage} refused:`); for (const r of plan.reasons) console.log(`  - ${r}`); console.log(`💡 ${suggest}`); }
    return 1;
  }
  if (stage === "reopen") return reopenOut(plan, out, { C, v, ctx, json, entry, nm, warn });
  const c = plan.changes;
  const changed = c.symbols.changed.map((x) => x.id);
  const lines = () => {
    for (const x of c.symbols.changed) console.log(`    ~ ${nm(x.id)} (${x.what.join(", ")})`);
    for (const x of c.tests.changed) console.log(`    ~ test ${nm(x.id)} (${x.what.join(", ")})`);
    for (const id of c.tests.removed) console.log(`    - test ${nm(id)} (deleted; dropped from the lock)`);
  };
  const what = stage === "accept" ? `${changed.length} symbol(s), ${c.tests.changed.length + c.tests.removed.length} test(s)` : `${changed.length} intent(s)`;
  if (v["dry-run"]) {
    if (json) console.log(JSON.stringify(out, null, 2));
    else { console.log(`approve --change ${C} --stage ${stage} (dry run, by ${by}): ${what}`); lines(); warn(); }
    return 0;
  }
  await writeLock(ctx.root, plan.lock);
  if (json) console.log(JSON.stringify({ ...out, approved: changed, ...(stage === "accept" ? { tests: [...c.tests.changed.map((x) => x.id), ...c.tests.removed] } : {}) }, null, 2));
  else if (stage === "accept") { console.log(`✅ ${C} drift accepted by ${by}: ${what}`); lines(); warn(); }
  else { console.log(`✅ ${C} intent re-approved by ${by}: ${changed.map(nm).join(", ")}`); warn(); }
  return 0;
}

/** Write + report a reopen: the lock, then the recheck notes → applied. An empty set reads as "confirm no impact". */
async function reopenOut(plan, out, { C, v, ctx, json, entry, nm, warn }) {
  const ids = plan.notes.join(", ");
  const body = { ...out, notes: plan.notes, reopened: plan.reopened, nothing: plan.nothing, empty: plan.empty };
  const summary = (r) => `${r.task} ${r.stage}: ${r.tests.length} test(s)${r.acs.length ? ` (${r.acs.join(", ")})` : ""}${r.symbols.length ? `, ${r.symbols.length} skeleton symbol(s) (${r.symbols.map(nm).join(", ")})` : ""}`;
  if (v["dry-run"]) {
    if (json) console.log(JSON.stringify(body, null, 2));
    else {
      console.log(`approve --change ${C} --stage reopen (dry run): ${plan.empty ? "nothing to unlock" : plan.reopened.map(summary).join(" · ")}`);
      warn();
    }
    return 0;
  }
  await writeLock(ctx.root, plan.lock);
  const at = todayIso();
  await updateNotes(ctx.root, entry.dir, C, (ns) => {
    for (const n of ns) if (plan.notes.includes(n.id)) {
      n.status = "applied";
      n.resolved = plan.empty ? `closed ${at}: wording only, nothing to unlock (confirmed by human)` : `reopened ${at} by human: ${plan.reopened.map((r) => `${r.task} ${r.stage}`).join(", ")}`;
    }
  });
  let sync = null;
  try { sync = await synctags(ctx.root, { config: ctx.config }); } catch (e) { sync = { error: e.message }; }
  const next = plan.reopened.length ? (plan.reopened[0].stage === "skeleton" ? `/hitl:skeleton ${plan.reopened[0].task}` : `/hitl:test ${plan.reopened[0].task}`) : null;
  if (json) { console.log(JSON.stringify({ ...body, next, syncTags: sync && !sync.error ? { files: sync.files, tasksFiles: sync.tasksFiles } : sync }, null, 2)); return 0; }
  if (plan.empty) console.log(`✅ ${ids} closed: wording only, nothing to unlock (confirmed by human)`);
  else {
    console.log(`✅ ${ids} reopened (confirmed by human):`);
    for (const r of plan.reopened) console.log(`  🔁 ${summary(r)}`);
    if (plan.nothing.length) console.log(`  ${plan.nothing.join(", ")}: nothing to unlock`);
  }
  warn();
  if (next) console.log(`🎯 next: ${next}`);
  return 0;
}

/** dismiss / defer a note (human-only; notes.md only). defer copies it into the target change as a new open note. */
async function noteDecision(stage, C, v, ctx, json) {
  const entry = await findChange(ctx.root, C);
  const fail = (msg) => { if (json) console.log(JSON.stringify({ ok: false, change: C, stage, reasons: [msg] }, null, 2)); else console.log(`🛑 approve --change ${C} --stage ${stage} refused: ${msg}`); return 1; };
  if (!entry) return fail(`change ${C} not found`);
  if (entry.archived) return fail(`${C} is archived: its notes are frozen`);
  const notes = await readNotes(ctx.root, entry.dir);
  const n = notes.find((x) => x.id === v.note);
  if (!n) return fail(`${v.note} not found in ${entry.dir}/notes.md`);
  if (!BLOCKING.has(n.status)) return fail(`${n.id} is ${n.status}; only an open note (or a recheck waiting for reopen) is ${stage === "dismiss" ? "dismissed" : "deferred"}`);
  const at = todayIso();
  if (stage === "dismiss") {
    if (v["dry-run"]) { console.log(json ? JSON.stringify({ ok: true, change: C, stage, note: n.id, dryRun: true }, null, 2) : `(dry run) would dismiss ${n.id}`); return 0; }
    await updateNotes(ctx.root, entry.dir, C, (ns) => { const x = ns.find((y) => y.id === n.id); x.status = "dismissed"; x.reason = String(v.reason).trim(); x.resolved = `dismissed ${at} by human`; });
    if (json) console.log(JSON.stringify({ ok: true, change: C, stage, note: n.id, reason: String(v.reason).trim() }, null, 2));
    else console.log(`✅ ${n.id} (${n.title}) dismissed by human: ${String(v.reason).trim()}`);
    return 0;
  }
  // defer
  if (n.kind === "recheck") return fail(`${n.id} is a recheck of ${C}'s own amendment: confirm it (/hitl:approve ${C} reopen ${n.id}) or dismiss it`);
  const to = String(v.to).trim();
  if (to === C) return fail("--to must be another change");
  const target = await findChange(ctx.root, to);
  if (!target || target.archived) return fail(`--to ${to}: no active change with that id`);
  const { loadChangeCtx } = await import("./note.mjs");
  const tc = await loadChangeCtx(ctx.root, ctx.config, to);
  const keep = [], dropped = [];
  for (const r of n.refs) (validateRefs([r], tc.refCtx).errors.length ? dropped : keep).push(r);
  const vt = validateRefs(keep, tc.refCtx);
  if (v["dry-run"]) {
    console.log(json ? JSON.stringify({ ok: true, change: C, stage, note: n.id, to, refs: keep, dropped, dryRun: true }, null, 2) : `(dry run) would defer ${n.id} to ${to}${dropped.length ? ` (refs dropped: ${dropped.join(", ")})` : ""}`);
    return 0;
  }
  const newId = await updateNotes(ctx.root, target.dir, to, (ns) => {
    const id = nextNoteId(ns);
    const base = refHashes(keep, tc.refCtx);
    ns.push({ id, title: n.title, kind: n.kind, refs: keep, refTitles: vt.titles, status: "open", deferredTo: null, from: `deferred from ${C} ${n.id}`, at, acks: [], reason: null,
      resolved: null, text: n.text, meta: { ...(Object.keys(base).length ? { base } : {}), ...(Object.keys(vt.symbols).length ? { symbols: vt.symbols } : {}) } });
    return id;
  });
  await updateNotes(ctx.root, entry.dir, C, (ns) => { const x = ns.find((y) => y.id === n.id); x.status = "deferred"; x.deferredTo = { change: to, note: newId }; x.resolved = `deferred ${at} by human`; });
  if (json) console.log(JSON.stringify({ ok: true, change: C, stage, note: n.id, to, newNote: newId, refs: keep, dropped }, null, 2));
  else {
    console.log(`✅ ${n.id} (${n.title}) deferred by human → ${to} ${newId} (open there)`);
    if (dropped.length) console.log(`⚠️ refs not in ${to}, dropped: ${dropped.join(", ")}`);
  }
  return 0;
}
