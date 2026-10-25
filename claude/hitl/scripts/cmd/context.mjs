// `hitl-index context <T-id|ref> [--contract] [--out file] [--budget N] [--json]` (§E.7).
import { isAbsolute, join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { buildContext } from "../lib/context.mjs";
import { writeTextAtomic } from "../lib/fsutil.mjs";
import { HITL_DIR } from "../lib/paths.mjs";

/** Relative --out paths resolve against the project root; "reviews/…" and "index/…" against .hitl/. */
export function outPath(root, out) {
  if (isAbsolute(out)) return out;
  if (/^(reviews|index)\//.test(out)) return join(root, HITL_DIR, out);
  return join(root, out);
}

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["contract"], values: ["out", "budget"] });
  if (!a._[0]) throw Object.assign(new Error("context <T-id|ref> required"), { usage: true });
  const res = await buildContext(ctx.root, a._[0], { contract: !!a.contract, budget: a.budget ? Number(a.budget) : 12000 });
  let written = null;
  if (a.out) { written = outPath(ctx.root, a.out); await writeTextAtomic(written, res.markdown); }
  if (ctx.json) console.log(JSON.stringify({ ...res, out: written }, null, 2));
  else if (written) console.log(`wrote ${written} (${res.markdown.length} chars, ${res.symbols.length} target symbols)`);
  else process.stdout.write(res.markdown);
  return 0;
}
