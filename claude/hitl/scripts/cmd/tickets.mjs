// `hitl-index tickets status|plan|record|diff` — Linear mirror, local side only (design v2 §A.5.5). No network.
// Exit: 0 ok (also when Linear is disabled/unconfigured: fail-open) · 1 invalid record/diff input or planId mismatch · 2 usage · 3 not initialized
//       · 4 Linear identity mismatch (wrong MCP server / workspace / team / project): nothing applied, nothing queued.
import { promises as fsp, readFileSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { exists, readJson, writeJsonAtomic } from "../lib/fsutil.mjs";
import { withLock, nowIso } from "../lib/lock.mjs";
import { HITL_PREFIX } from "../lib/paths.mjs";
import {
  linearPaths, readMap, readQueue, writeMap, buildPlan, applyRecord, buildDiff, buildStatus, loadLocal,
  loadPlanningInfo, loadChangeInfo, changeKeyOf, loadReviews, currentBranch, removeInboxFile, REMOTE_SCHEMA, QUEUE_SCHEMA,
  verifyIdentity, identityMessage, pickServer, repoKey,
} from "../lib/linear.mjs";

const USAGE = `usage: hitl-index tickets status [--json]
       hitl-index tickets plan [T-id… | <change-id> | <tasks-file>] [--json]
       hitl-index tickets record --in <file|-> [--json]
       hitl-index tickets diff --in <file|-> [--relink] [--json]
       hitl-index tickets verify --in <file|-> [--json]
       hitl-index tickets server [<mcp-server>|<mcp tool name>…] [--init] [--json]`;
const usage = (msg) => Object.assign(new Error(msg ? `${msg}\n${USAGE}` : USAGE), { usage: true });

async function readInput(root, p) {
  if (!p) throw usage("--in <file|-> is required");
  let raw, file = null;
  if (p === "-") raw = readFileSync(0, "utf8");
  else { file = resolve(root, p); raw = await fsp.readFile(file, "utf8").catch(() => null); if (raw === null) throw Object.assign(new Error(`input ${p} not found`), { code: 1 }); }
  try { return { data: JSON.parse(raw), file }; } catch { throw Object.assign(new Error(`input ${p} is not valid JSON`), { code: 1 }); }
}

async function resolveScope(root, docs, args) {
  if (!args.length) return { kind: "all" };
  if (args.every((a) => /^T-\d+$/.test(a))) return { kind: "tasks", ids: args };
  if (args.length > 1) throw usage("give T-ids, one change id or one tasks file");
  const a = args[0];
  const viaChange = docs.filter((d) => d.change === a);
  if (viaChange.length) return { kind: "file", file: (viaChange.find((d) => !d.archived) || viaChange.at(-1)).file };
  const name = basename(a).endsWith(".md") ? basename(a) : basename(a) + ".md";
  const rel = `${HITL_PREFIX}tasks/${name}`;
  if (!docs.some((d) => d.file === rel) && !(await exists(join(root, rel)))) throw Object.assign(new Error(`tasks file ${a} not found`), { code: 1 });
  return { kind: "file", file: rel };
}

async function planInputs(root, config, scopeArgs) {
  const local = await loadLocal(root, config);
  const changes = {};
  for (const d of local.docs) {
    const key = d.change || changeKeyOf(d.planning);
    if (!key || key in changes) continue;
    changes[key] = d.change ? await loadChangeInfo(root, d.change) : await loadPlanningInfo(root, d.planning);
  }
  const scope = await resolveScope(root, local.docs, scopeArgs);
  return { config, map: await readMap(root), repo: repoKey(root), docs: local.docs, statuses: local.statuses, reviews: await loadReviews(root, local.state), changes, scope };
}

function printPlan(p) {
  if (!p.enabled) return console.log("ℹ️ Linear sync is off (/hitl:tickets init)");
  if (!p.configured) return console.log("💡 Linear not configured — run /hitl:tickets init");
  if (!p.ops.length) console.log("✅ Linear in sync (no ops)");
  else {
    console.log("| # | op | task | issue | gate | reason |\n|---|---|---|---|---|---|");
    p.ops.forEach((o, i) => console.log(`| ${i + 1} | ${o.op} | ${o.task || o.change || ""} | ${o.issue || "—"} | ${o.needsGate ? "⛔" : ""} | ${o.reason} |`));
  }
  for (const s of p.skipped) console.log(`skipped ${s.task}: ${s.reason}`);
  for (const w of p.warnings) console.log(`⚠️ ${w}`);
}

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["json", "relink", "init"], values: ["in"] });
  const json = ctx.json || !!a.json;
  const sub = a._.shift();
  if (!sub || !["status", "plan", "record", "diff", "verify", "server"].includes(sub)) throw usage(sub ? `unknown subcommand ${sub}` : "");
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  const root = ctx.root, config = ctx.config || {};
  const P = linearPaths(root);
  const mismatch = (e) => { // identity mismatch: report expected vs observed, exit 4, nothing written
    const r = e.verify || {};
    if (json) console.log(JSON.stringify({ schema: "hitl.tickets-verify/1", ok: false, status: "mismatch", ...r, message: e.message }, null, 2));
    else console.log(`❌ ${e.message}`);
    return 4;
  };

  if (sub === "server") {
    const r = pickServer(config, a._, a.init ? "init" : "run");
    if (json) console.log(JSON.stringify(r, null, 2));
    else console.log(`${r.action === "use" || r.action === "save" ? "✅" : r.action === "missing" || r.action === "none" ? "❌" : "💡"} ${r.message}`);
    return 0;
  }

  if (sub === "verify") {
    if (a._.length) throw usage("verify takes no positional arguments");
    const { data, file } = await readInput(root, a.in);
    const res = await withLock(root, async () => {
      const v = verifyIdentity({ config, map: await readMap(root), observed: data });
      if (v.map) await writeMap(root, { ...v.map, updatedAt: nowIso() });
      return v.result;
    });
    await removeInboxFile(root, file);
    if (json) console.log(JSON.stringify(res, null, 2));
    else if (!res.ok) console.log(`❌ ${identityMessage(res)}`);
    else {
      console.log(`✅ Linear identity: ${res.status} · workspace ${res.observed.workspace || res.expected.workspace || "?"} · team ${res.observed.team?.key || res.expected.team?.key}${res.observed.server ? ` · server ${res.observed.server}` : ""}`);
      for (const l of res.learned) console.log(`💡 recorded ${l} in linear.map.json`);
      for (const w of res.warnings) console.log(`⚠️ ${w}`);
    }
    return res.ok ? 0 : 4;
  }

  if (sub === "status") {
    if (a._.length) throw usage("status takes no positional arguments");
    const local = await loadLocal(root, config);
    const map = await readMap(root);
    const anyMapped = Object.values(map.tasks).some((e) => e && e.id && !e.removed);
    const st = buildStatus({ config, map, docs: local.docs, statuses: local.statuses, queue: await readQueue(root), branch: anyMapped ? currentBranch(root) : null });
    for (const t of st.tasks) delete t.onBranch;
    if (json) { console.log(JSON.stringify(st, null, 2)); return 0; }
    console.log(`Linear: ${st.enabled ? "on" : "off"} · ${st.configured ? `${st.workspace ? `${st.workspace}/` : ""}team ${st.team}` : "not configured"}${st.server ? ` · server ${st.server}` : ""}${st.project ? ` · project ${st.project.name || st.project.id || st.project.unresolved}` : ""} · mapped ${st.mapped} · unmapped ${st.unmapped} · out of sync ${st.outOfSync} · queued ${st.queued}`);
    console.log("| task | title | status | issue | synced | link |\n|---|---|---|---|---|---|");
    for (const t of st.tasks) console.log(`| ${t.task} | ${t.title} | ${t.status} | ${t.issue || "—"} | ${t.synced ? "✅" : t.reason || "—"} | ${t.url || ""} |`);
    for (const t of st.tasks) if (t.prLine) console.log(`${t.task}: branch ${t.branch} · PR: ${t.prLine}`);
    return 0;
  }

  if (sub === "plan") {
    const I = await planInputs(root, config, a._);
    const p = buildPlan(I);
    if (p.enabled && p.configured) await writeJsonAtomic(P.plan, p);
    if (json) console.log(JSON.stringify(p, null, 2)); else printPlan(p);
    return 0;
  }

  if (sub === "record") {
    if (a._.length) throw usage("record takes no positional arguments");
    const { data, file } = await readInput(root, a.in);
    let out;
    try {
      out = await withLock(root, async () => {
        const r = applyRecord({ map: await readMap(root), plan: await readJson(P.plan, null), queue: await readQueue(root), input: data, now: nowIso(), repo: repoKey(root), config });
        if (r.out.applied > 0 || data.kind === "init" || (r.out.learned || []).length) await writeMap(root, r.map);
        if (r.queue.items.length || (await exists(P.queue))) await writeJsonAtomic(P.queue, { schema: QUEUE_SCHEMA, items: r.queue.items });
        return r.out;
      });
    } catch (e) { if (e.code === 4) return mismatch(e); throw e; }
    await removeInboxFile(root, file);
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`${out.kind === "init" ? "✅ Linear map initialized" : `✅ recorded: ${out.applied} applied, ${out.failed} failed`} · queued ${out.queued}${out.replan ? " · replan: run tickets plan again" : ""}`);
      if (out.reset) console.log(`⚠️ relinked to another workspace/team: ${out.reset} task mapping(s) cleared (next push creates new issues)`);
      for (const l of out.learned || []) console.log(`💡 recorded ${l} in linear.map.json`);
    }
    return 0;
  }

  // diff
  if (a._.length) throw usage("diff takes no positional arguments");
  const { data, file } = await readInput(root, a.in);
  const local = await loadLocal(root, config, { reindex: false });
  let out;
  try {
    out = await withLock(root, async () => {
      const r = buildDiff({ config, map: await readMap(root), remote: data, statuses: local.statuses, localTasks: local.tasks, relink: !!a.relink, repo: repoKey(root) });
      await writeJsonAtomic(P.remote, { schema: REMOTE_SCHEMA, at: nowIso(), complete: data.complete === true, tasks: r.out.remote });
      if ((a.relink && r.out.relink.length) || r.out.learned.length) await writeMap(root, r.map);
      return r.out;
    });
  } catch (e) { if (e.code === 4) return mismatch(e); throw e; }
  await removeInboxFile(root, file);
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!out.items.length) console.log("✅ no Linear drift");
  for (const i of out.items) console.log(`${i.level === "warn" ? "⚠️" : "ℹ️"} ${i.code} ${i.task} ${i.issue}${i.field ? ` ${i.field}` : ""} — ${i.message}`);
  for (const [T, r] of Object.entries(out.remote)) console.log(`${T}: ${r.state || "?"} · assignee ${r.assignee || "—"} · cycle ${r.cycle || "—"}`);
  if (a.relink) console.log(`relinked ${out.relink.length} task(s)`);
  if (out.foreign) console.log(`ℹ️ ${out.foreign} issue(s) of other repos sharing this team ignored`);
  return 0;
}
