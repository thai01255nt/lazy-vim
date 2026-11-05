// `hitl-index reconcile <change> --from <other> [--dry-run] [--pick RC-1,RC-3|none] [--json]` (0.10)
// What <other> changed that <change> must take in, as findings → notes in <change> only (never in <other>). The real run
// adds the picked new findings as notes, records the run in <change>'s notes.md, and, when <other> is archived, closes
// <change>'s open order notes from it. Idempotent: a finding already noted is never added again.
import { parseArgv } from "../lib/project.mjs";
import { findChange, readChange, readLiving } from "../lib/changes.mjs";
import { nextNoteId, readNotesDoc, todayIso, updateNotes, applyCommand } from "../lib/notes.mjs";
import { linksOf, loadLinkGraph } from "../lib/coupling.mjs";
import { computeFindings, readPrev } from "../lib/reconcile.mjs";
import { loadChangeCtx } from "./note.mjs";

const USAGE = "usage: hitl-index reconcile <change-id> --from <other-change-id> [--dry-run] [--pick RC-1,RC-3|none] [--json]";
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
const fail = (msg) => Object.assign(new Error(msg), { code: 1 });
const short = (s, n = 60) => { const t = String(s || "").replace(/[()]/g, "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["json", "dry-run"], values: ["from", "pick"] });
  const json = ctx.json || a.json;
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  const A = a._[0], B = a.from;
  if (a._.length !== 1 || !B) throw usage();
  if (A === B) throw usage("reconcile needs two different changes");
  const c = await loadChangeCtx(ctx.root, ctx.config, A);
  const eb = await findChange(ctx.root, B);
  if (!eb) throw fail(`change ${B} not found`);
  const chB = await readChange(ctx.root, eb);
  const living = await readLiving(ctx.root);
  const prev = eb.archived ? await readPrev(ctx.root, eb.dir) : null;
  const findings = computeFindings({ a: c.ch, b: chB, living, prev, index: c.g.index, lock: c.g.lock, resolve: c.resolve, refCtx: c.refCtx });
  const doc = await readNotesDoc(ctx.root, c.entry.dir);
  const rec = doc.meta?.reconciled?.[B] || null;
  for (const f of findings) {
    const n = doc.notes.find((x) => x.meta?.reconcile?.key === f.key);
    f.existing = n ? n.id : null;
    f.skippedBefore = !n && !!rec?.skipped?.includes(f.key);
  }
  const fresh = findings.filter((f) => !f.existing);
  let pick = fresh;
  if (a.pick !== undefined) {
    const want = String(a.pick).trim();
    if (want === "none") pick = [];
    else {
      const ids = want.split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = ids.filter((id) => !findings.some((f) => f.id === id));
      if (!ids.length || unknown.length) throw usage(`--pick: unknown finding ${unknown.join(", ") || "(empty)"} (findings: ${findings.map((f) => f.id).join(", ") || "none"})`);
      pick = fresh.filter((f) => ids.includes(f.id));
    }
  }
  const graph = await loadLinkGraph(ctx.root);
  const link = linksOf(graph, A).find((l) => l.change === B) || null;
  const orders = doc.notes.filter((n) => n.kind === "order" && n.status === "open" && n.meta?.coupling?.from === B).map((n) => n.id);
  const out = { schema: "hitl.reconcile/1", change: A, from: B, fromArchived: eb.archived, linked: !!link, link, dryRun: !!a["dry-run"],
    findings: findings.map(({ meta, symbols, ...f }) => ({ ...f, ...(meta?.reopen ? { reopen: meta.reopen } : {}) })),
    counts: { findings: findings.length, new: fresh.length, existing: findings.length - fresh.length },
    orderNotes: orders, closesOrder: eb.archived ? orders : [], added: [], skipped: [], recorded: false };
  if (!out.dryRun) {
    const at = todayIso();
    const res = await updateNotes(ctx.root, c.entry.dir, A, (ns, d) => {
      const added = [];
      for (const f of pick) {
        if (ns.some((x) => x.meta?.reconcile?.key === f.key)) continue;
        const id = nextNoteId(ns);
        const body = f.diff?.length ? `${f.text}\n\n\`\`\`diff\n${f.diff.join("\n")}\n\`\`\`` : f.text;
        ns.push({ id, title: short(f.title), kind: f.kind, refs: f.refs, refTitles: f.refTitles || {}, status: f.kind === "recheck" ? "reopen pending" : "open", deferredTo: null,
          from: `reconcile from ${B}`, at, acks: [], reason: null, resolved: null, text: body,
          meta: { reconcile: { from: B, key: f.key, class: f.class }, ...(Object.keys(f.symbols || {}).length ? { symbols: f.symbols } : {}), ...(f.meta || {}) } });
        added.push(id);
      }
      const skipped = fresh.filter((f) => !pick.includes(f)).map((f) => f.key);
      const noted = findings.filter((f) => f.existing).map((f) => f.existing);
      d.meta = { ...d.meta, reconciled: { ...(d.meta?.reconciled || {}), [B]: { at, archived: eb.archived, notes: [...noted, ...added], skipped } } };
      const closed = [];
      if (eb.archived) for (const n of ns.filter((x) => x.kind === "order" && x.status === "open" && x.meta?.coupling?.from === B)) {
        n.status = "applied";
        n.resolved = `${B} archived; reconciled ${at}: ${added.length ? `${added.join(", ")} added` : "no new notes"}${skipped.length ? `, ${skipped.length} skipped` : ""}`;
        closed.push(n.id);
      }
      return { added, skipped, closed };
    });
    Object.assign(out, res, { recorded: true });
    const fin = await readNotesDoc(ctx.root, c.entry.dir);
    const first = fin.notes.find((n) => res.added.includes(n.id) && n.status === "reopen pending") || fin.notes.find((n) => res.added.includes(n.id));
    out.next = first ? applyCommand(A, first) : null;
  }
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  console.log(`🔄 Reconcile ${A} from ${B}${eb.archived ? " (archived)" : " (active)"}${link ? "" : " · ⚠️ not linked"} — ${findings.length} finding(s), ${fresh.length} new`);
  for (const f of findings) {
    console.log(`  ${f.id} ${f.type} ${f.ref} — ${f.title}${f.refs.length ? ` → refs ${f.refs.map((r) => (f.refTitles?.[r] ? `${r} (${short(f.refTitles[r], 30)})` : r)).join(", ")}` : " → no refs in this change (warns only)"} · ${f.class}`
      + `${f.existing ? ` · already noted: ${f.existing}` : f.skippedBefore ? " · skipped before" : ""}`);
    for (const l of f.diff || []) console.log(`      ${l}`);
  }
  if (out.dryRun) {
    if (out.closesOrder.length) console.log(`  order note ${out.closesOrder.join(", ")} closes as applied (${B} is archived)`);
    console.log(`(dry run: nothing written)${fresh.length ? ` → Add ${fresh.length} note(s) to ${A}? (Y/n/pick)` : ""}`);
    return 0;
  }
  console.log(`✅ reconciled ${A} from ${B}: ${out.added.length ? `${out.added.join(", ")} added` : "no new notes"}${out.skipped.length ? ` · ${out.skipped.length} skipped` : ""}`);
  for (const id of out.closed) console.log(`✅ ${id} (order note) applied: ${B} is archived`);
  if (out.next) console.log(`🎯 next: ${out.next}`);
  return 0;
}
