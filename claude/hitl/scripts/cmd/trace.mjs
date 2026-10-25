// `hitl-index trace [<T-id> | <planning-file>] [--check] [--fail-on block|warn] [--md] [--out <path>] [--json]` (hitl.trace/1).
// Never reindexes, never runs tests; writes only the --md file.
import { resolve, relative, sep } from "node:path";
import { parseArgv, toRel } from "../lib/project.mjs";
import { exists, writeTextAtomic } from "../lib/fsutil.mjs";
import { planningRel, readPlanning } from "../lib/planningmd.mjs";
import { buildTrace, loadTraceInputs, renderTraceMd } from "../lib/trace.mjs";
import { outPath } from "./context.mjs";
import { HITL_PREFIX } from "../lib/paths.mjs";

async function findPlanning(root, x) {
  const cands = [];
  if (!x.includes("/")) cands.push(planningRel(x));
  else { cands.push(toRel(root, resolve(process.cwd(), x)), planningRel(x)); }
  for (const c of cands) if (!c.startsWith("..") && (await exists(resolve(root, c)))) return c;
  return null;
}

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["check", "md"], values: ["fail-on", "out"] });
  const failOn = a["fail-on"] ?? (a.check ? "block" : null);
  if (failOn && !["block", "warn"].includes(failOn)) throw Object.assign(new Error("--fail-on block|warn"), { usage: true });
  const root = ctx.root;
  const inputs = await loadTraceInputs(root, ctx.config);
  const pos = a._[0];
  let scope = { kind: "all" };
  if (pos && /^T-\d+$/.test(pos)) {
    if (!inputs.tasks.some((t) => t.id === pos)) { console.error(`task ${pos} not found`); return 1; }
    scope = { kind: "task", id: pos };
  } else if (pos) {
    const file = await findPlanning(root, pos);
    if (!file) { console.error(`planning file ${pos} not found`); return 1; }
    if (!inputs.plannings.has(file)) inputs.plannings.set(file, await readPlanning(root, file));
    scope = { kind: "planning", file };
  }
  const trace = buildTrace(inputs, scope);
  let md = null;
  if (a.md) {
    const abs = outPath(root, a.out || ctx.config?.trace?.mdOut || `${HITL_PREFIX}index/trace.md`);
    await writeTextAtomic(abs, renderTraceMd(trace));
    md = relative(root, abs).split(sep).join("/");
  }
  if (ctx.json) console.log(JSON.stringify(md ? { ...trace, md } : trace, null, 2));
  else if (!ctx.quiet) {
    if (!a.md) process.stdout.write(renderTraceMd(trace));
    else console.log(`📝 ${md}`);
  }
  if (failOn === "block" && trace.counts.block) return 1;
  if (failOn === "warn" && (trace.counts.block || trace.counts.warn)) return 1;
  return 0;
}
