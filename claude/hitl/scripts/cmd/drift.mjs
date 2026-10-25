// `hitl-index drift [--files f…] [--task T] [--fail-on block|warn] [--precommit] [--json]` (hitl.drift/1).
import { resolve } from "node:path";
import { parseArgv, toRel } from "../lib/project.mjs";
import { computeDrift } from "../lib/drift.mjs";

const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
/** "D-1 (Duplicate check …) · R-1, R-2" */
export function specLine(spec) {
  const d = (spec.decisions || []).map((x) => `${x.id} (${clip(x.text, 60)})`).join(", ");
  const r = (spec.requirements || []).map((x) => x.id).join(", ");
  return [d, r].filter(Boolean).join(" · ");
}

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["precommit"], values: ["task", "fail-on"], multi: ["files"] });
  const files = a.files.map((f) => toRel(ctx.root, resolve(process.cwd(), f)));
  const d = await computeDrift(ctx.root, { files, task: a.task, precommit: !!a.precommit, spec: true });
  if (ctx.json) console.log(JSON.stringify(d, null, 2));
  else if (!ctx.quiet) {
    if (!d.items.length) console.log("✅ no drift");
    for (const i of d.items) {
      console.log(`${{ block: "⛔", warn: "⚠️", info: "ℹ️" }[i.level]} ${i.code} ${i.symbol || i.file}${i.task ? ` (${i.task})` : ""} — ${i.message}`);
      if (i.spec) console.log(`   spec: ${specLine(i.spec)}`);
    }
    console.log(`summary: ${d.summary.block} block · ${d.summary.warn} warn · ${d.summary.info} info`);
  }
  const fail = a["fail-on"];
  if (fail && !["block", "warn"].includes(fail)) throw Object.assign(new Error("--fail-on block|warn"), { usage: true });
  if (fail === "block" && d.summary.block) return 1;
  if (fail === "warn" && (d.summary.block || d.summary.warn)) return 1;
  return 0;
}
