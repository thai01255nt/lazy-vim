// `hitl-index map-md` — writes the docs/CODEBASE-MAP.md AUTO block and index/index.md.
import { readIndex, updateIndex } from "../lib/indexer.mjs";
import { writeMapMd } from "../lib/mapmd.mjs";

export async function run(argv, ctx) {
  let index = await readIndex(ctx.root);
  if (!index) { await updateIndex(ctx.root, null, { full: true }); index = await readIndex(ctx.root); }
  const out = await writeMapMd(ctx.root, index);
  if (ctx.json) console.log(JSON.stringify(out));
  else if (!ctx.quiet) console.log(`wrote ${out.codebaseMap}\nwrote ${out.indexMd}`);
  return 0;
}
