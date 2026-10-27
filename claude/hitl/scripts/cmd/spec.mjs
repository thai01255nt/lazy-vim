// `hitl-index spec validate|list|show|next-id|conflicts|merge|archive` — the deterministic spec layer (design v3 §6, §7).
// Writes only: `validate` → <change>/.base.json entries; `merge` → .hitl/specs/**; `archive` → merge + move to .hitl/archive/.
import { parseArgv } from "../lib/project.mjs";
import { CAP_RE, parseId, today } from "../lib/specids.mjs";
import { effectiveView, findChange, findConflicts, nextScenarioIds, nextSpecIds, readActiveChanges, readChange, readLiving, runMerge, validate } from "../lib/changes.mjs";

const USAGE = `usage: hitl-index spec <sub> [args] [--json]
  validate [<change-id> | --living | --all] [--strict]
  list
  show [<capability> | <ID>] [--change <change-id>]
  next-id <capability> [--kind R|BR|UC] [--count n] | next-id --scenario <REQ-ID> [--count n]
  conflicts
  merge <change-id> [--dry-run] [--renumber] [--accept-base <ID,…>]
  archive <change-id> [--dry-run] [--force] [--renumber] [--accept-base <ID,…>]`;

const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });
const ICON = { error: "❌", warn: "⚠️", info: "ℹ️" };

export async function run(argv, ctx) {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  switch (sub) {
    case "validate": return cmdValidate(rest, ctx);
    case "list": return cmdList(rest, ctx);
    case "show": return cmdShow(rest, ctx);
    case "next-id": return cmdNextId(rest, ctx);
    case "conflicts": return cmdConflicts(rest, ctx);
    case "merge": return cmdMerge(rest, ctx, false);
    case "archive": return cmdMerge(rest, ctx, true);
    default: throw usage(sub ? `unknown spec subcommand: ${sub}` : "");
  }
}

async function cmdValidate(argv, ctx) {
  const a = parseArgv(argv, { flags: ["living", "all", "strict"] });
  if (a._.length > 1 || (a._[0] && (a.living || a.all))) throw usage("validate takes one target");
  const r = await validate(ctx.root, ctx.config, { change: a._[0] || null, livingOnly: !!a.living });
  if (a.strict) r.ok = r.counts.error === 0 && r.counts.warn === 0;
  if (ctx.json) console.log(JSON.stringify(r, null, 2));
  else if (!ctx.quiet || !r.ok) {
    for (const i of r.items) console.log(`${ICON[i.level]} ${i.code} ${i.file ?? ""}${i.line ? `:${i.line}` : ""}${i.ref ? ` [${i.ref}]` : ""} — ${i.message}`);
    for (const s of r.summary) console.log(`📐 ${s.change} · ${s.capability ?? "(glossary)"}${s.key ? ` (${s.key})` : ""}${s.new ? " new" : ""}: +${s.added.length} ~${s.modified.length} -${s.removed.length}`);
    console.log(`${r.ok ? "✅" : "❌"} spec validate: ${r.counts.error} error(s), ${r.counts.warn} warning(s) · ${r.targets.length} target(s)`);
  }
  return r.ok ? 0 : 1;
}

async function cmdList(argv, ctx) {
  const a = parseArgv(argv, {});
  if (a._.length) throw usage("list takes no arguments");
  const living = await readLiving(ctx.root);
  const active = await readActiveChanges(ctx.root);
  const capabilities = [];
  for (const [cap, l] of living.specs) {
    const d = l.doc;
    capabilities.push({ capability: cap, key: d.key, file: l.file, purpose: d.purpose,
      requirements: d.blocks.filter((b) => b.kind === "requirement").map((b) => ({ id: b.id, title: b.title, priority: b.priority, quality: b.quality, scenarios: b.scenarios.length })),
      rules: d.blocks.filter((b) => b.kind === "rule").map((b) => b.id), flows: d.blocks.filter((b) => b.kind === "flow").map((b) => b.id),
      retired: d.retired.map((r) => r.id), activeChanges: active.filter((c) => c.deltas.some((x) => x.capability === cap)).map((c) => c.id) });
  }
  const pending = [];
  for (const c of active) for (const d of c.deltas) if (!living.specs.has(d.capability)) pending.push({ capability: d.capability, key: d.key, change: c.id });
  const out = { schema: "hitl.spec-list/1", capabilities, pending };
  if (ctx.json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!capabilities.length && !pending.length) { console.log("no living specs yet (.hitl/specs/) and no pending capabilities"); return 0; }
  for (const c of capabilities) {
    console.log(`📘 ${c.capability} (${c.key}) — ${c.requirements.length} req · ${c.rules.length} rules · ${c.flows.length} flows${c.activeChanges.length ? ` · active: ${c.activeChanges.join(", ")}` : ""}`);
    for (const r of c.requirements) console.log(`   ${r.id} ${r.title} [${r.priority ?? "?"}${r.quality ? `, ${r.quality}` : ""}] · ${r.scenarios} scenario(s)`);
  }
  for (const p of pending) console.log(`🆕 ${p.capability} (${p.key ?? "no key"}) — new in ${p.change}`);
  return 0;
}

async function cmdShow(argv, ctx) {
  const a = parseArgv(argv, { values: ["change"] });
  if (a._.length > 1) throw usage("show takes one capability or ID");
  const living = await readLiving(ctx.root);
  let ch = null;
  if (a.change) {
    const e = await findChange(ctx.root, a.change);
    if (!e) { console.error(`change ${a.change} not found`); return 1; }
    ch = await readChange(ctx.root, e);
  }
  const view = effectiveView(living, ch);
  const all = [...view.capabilities.values()].flatMap((c) => c.blocks);
  const want = a._[0];
  let blocks; let scenario = null;
  if (!want) blocks = ch && !ch.archived ? all.filter((b) => ch.deltas.some((d) => d.capability === b.capability)) : all;
  else if (parseId(want)) {
    const p = parseId(want);
    const id = p.kind === "S" ? p.req : want;
    blocks = all.filter((b) => b.id === id);
    if (p.kind === "S") { scenario = want; if (!blocks.some((b) => b.scenarios.some((s) => s.id === want))) blocks = []; }
  } else if (CAP_RE.test(want)) {
    if (!view.capabilities.has(want)) { console.error(`capability ${want} not found${ch ? ` in the view of ${ch.id}` : ""}`); return 1; }
    blocks = view.capabilities.get(want).blocks;
  } else throw usage(`not a capability or spec id: ${want}`);
  if (want && !blocks.length) { console.error(`${want} not found in the ${view.view} view${ch ? ` of ${ch.id}` : ""}`); return 1; }
  const out = { schema: "hitl.spec-show/1", change: view.change, view: view.view, ...(scenario ? { scenario } : {}), blocks };
  if (ctx.json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  for (const b of blocks) console.log(`<!-- ${b.capability} · ${b.origin} -->\n${b.text}\n`);
  return 0;
}

async function cmdNextId(argv, ctx) {
  const a = parseArgv(argv, { values: ["kind", "count", "scenario"] });
  const count = a.count === undefined ? 1 : Number(a.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw usage("--count takes 1..100");
  const living = await readLiving(ctx.root);
  const active = await readActiveChanges(ctx.root);
  let ids;
  if (a.scenario) ids = nextScenarioIds(living, active, a.scenario, count);
  else {
    if (a._.length !== 1) throw usage("next-id needs one capability");
    if (!CAP_RE.test(a._[0])) throw usage(`invalid capability name ${a._[0]}`);
    ids = nextSpecIds(living, active, a._[0], a.kind || "R", count);
  }
  console.log(ctx.json || a.count !== undefined ? JSON.stringify(ids) : ids[0]);
  return 0;
}

async function cmdConflicts(argv, ctx) {
  const a = parseArgv(argv, {});
  if (a._.length) throw usage("conflicts takes no arguments");
  const r = await findConflicts(ctx.root);
  if (ctx.json) console.log(JSON.stringify(r, null, 2));
  else {
    if (!r.conflicts.length) console.log("✅ no spec conflicts between active changes and living specs");
    else for (const c of r.conflicts) console.log(`⚠️ ${c.code} ${c.ref} (${c.capability}) — ${c.changes.join(", ")}`);
    for (const w of r.warnings || []) console.log(`ℹ️ ${w.code} ${w.ref} — new in ${w.changes.join(", ")} (warning)`);
  }
  return r.conflicts.length ? 1 : 0;
}

async function cmdMerge(argv, ctx, archive) {
  const a = parseArgv(argv, { flags: ["dry-run", "renumber", ...(archive ? ["force"] : [])], values: ["accept-base"] });
  if (a._.length !== 1) throw usage(`${archive ? "archive" : "merge"} needs one change id`);
  const acceptBase = a["accept-base"] ? String(a["accept-base"]).split(",").map((s) => s.trim()).filter(Boolean) : [];
  for (const id of acceptBase) if (!parseId(id)) throw usage(`--accept-base: not a spec id: ${id}`);
  const r = await runMerge(ctx.root, ctx.config, a._[0], { archive, dryRun: !!a["dry-run"], force: !!a.force, renumber: !!a.renumber, acceptBase, date: today() });
  if (ctx.json) { console.log(JSON.stringify(r, null, 2)); return r.ok ? 0 : 1; }
  const verb = archive ? "archive" : "merge";
  for (const c of r.capabilities) {
    const ren = Object.entries(c.renumbered).map(([o, n]) => `${o}→${n}`);
    console.log(`📐 ${c.capability}${c.created ? " (new)" : ""}${c.deleted ? " (retired: file deleted)" : ""}: +${c.added.join(" +") || "0"} ~${c.modified.join(" ~") || "0"} -${c.removed.join(" -") || "0"}`
      + `${c.alreadyApplied.length ? ` · already applied: ${c.alreadyApplied.join(", ")}` : ""}${ren.length ? ` · renumbered: ${ren.join(", ")}` : ""}`);
  }
  const g = r.glossary;
  if (g.added.length + g.modified.length + g.removed.length) console.log(`📖 glossary: +${g.added.length} ~${g.modified.length} -${g.removed.length}`);
  for (const c of r.conflicts) console.log(`❌ ${c.code} ${c.ref} — ${c.message}`);
  for (const e of r.errors || []) console.log(`❌ ${e.code} ${e.file ?? ""}${e.line ? `:${e.line}` : ""} — ${e.message}`);
  for (const w of r.warnings || []) console.log(`⚠️ ${w.code} ${w.ref} — ${w.message}`);
  if (r.preconditions.tasks?.notDone.length) console.log(`${r.ok ? "⚠️" : "❌"} tasks not done: ${r.preconditions.tasks.notDone.join(", ")}${r.ok ? " (--force)" : " (finish them, or --force at a human gate)"}`);
  if (!r.ok) console.log(`❌ spec ${verb} ${r.change}: nothing written`);
  else if (r.dryRun) console.log(`🔎 dry run: spec ${verb} ${r.change} would apply cleanly${r.archive ? ` and move to ${r.archive.to}` : ""}`);
  else console.log(`✅ spec ${verb} ${r.change}${r.archive?.moved ? ` → ${r.archive.to}` : ""}`);
  return r.ok ? 0 : 1;
}
