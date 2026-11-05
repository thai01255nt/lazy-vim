// `hitl-index context <task-id|ref|old-id> [--contract] [--out file] [--budget N] [--json]` (§E.7).
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
  if (!a._[0]) throw Object.assign(new Error("context <task-id|ref> required"), { usage: true });
  let target = a._[0];
  // 0.13: an old id (T-3, T-3.AC2, ACC-R3.S1, feat-x/D-1) resolves through .hitl/index/id-map.json (one release)
  const { readIdMap } = await import("../lib/keys.mjs");
  const map = /^(?:T-\d+|[\w-]+\/D-\d+|[A-Z][A-Z0-9]{1,5}-(?:R|BR|UC)\d+)/.test(target) ? await readIdMap(ctx.root) : null;
  if (map) {
    const m = /^(T-\d+|[A-Z][A-Z0-9]{1,5}-R\d+|[A-Z][A-Z0-9]{1,5}-(?:BR|UC)\d+|[\w-]+\/D-\d+)(\.(?:AC|S)\d+)?$/.exec(target);
    const nid = m && map.ids[m[1]] ? map.ids[m[1]] + (m[2] || "") : null;
    if (nid) {
      if (ctx.json && !/^[A-Z]{2,5}-T\d+$/.test(nid)) { console.log(JSON.stringify({ old: target, id: nid, via: "id-map" })); return 0; }
      console.error(`↪ ${target} is now ${nid} (${map.migratedAt ? `migrated ${map.migratedAt}, ` : ""}.hitl/index/id-map.json)`);
      if (!/^[A-Z]{2,5}-T\d+$/.test(nid)) { console.log(`${target} → ${nid}${/-D\d+$/.test(nid) ? "" : ` (hitl-index spec show ${nid.replace(/\.AC\d+$/, "")})`}`); return 0; }
      target = nid;
    }
  } else if (/^T-\d+$/.test(target)) throw Object.assign(new Error(`${target} is a pre-0.13 task id and there is no id map: run /hitl:migrate (ids are now <KEY>-T<n>)`), { code: 1 });
  const res = await buildContext(ctx.root, target, { contract: !!a.contract, budget: a.budget ? Number(a.budget) : 12000 });
  let written = null;
  if (a.out) { written = outPath(ctx.root, a.out); await writeTextAtomic(written, res.markdown); }
  if (ctx.json) console.log(JSON.stringify({ ...res, out: written }, null, 2));
  else if (written) console.log(`wrote ${written} (${res.markdown.length} chars, ${res.symbols.length} target symbols)`);
  else process.stdout.write(res.markdown);
  return 0;
}
