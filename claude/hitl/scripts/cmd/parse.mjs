// `hitl-index parse <file> [--adapter id] --json` — debug: adapter output + hashes, no index write.
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgv, toRel } from "../lib/project.mjs";
import { parseSources } from "../lib/indexer.mjs";
import { adapterById } from "../lib/adapters/registry.mjs";

export async function run(argv, ctx) {
  const a = parseArgv(argv, { values: ["adapter"] });
  if (!a._[0]) throw Object.assign(new Error("parse <file> required"), { usage: true });
  const rel = toRel(ctx.root, resolve(process.cwd(), a._[0]));
  const content = await fs.readFile(join(ctx.root, rel), "utf8");
  let override;
  if (a.adapter) {
    override = await adapterById(a.adapter, ctx.root);
    if (!override) throw Object.assign(new Error(`adapter ${a.adapter} not available`), { code: 1 });
  }
  const [res] = await parseSources(ctx.root, [{ path: rel, content }], ctx.config, { adapterOverride: override });
  if (!res) throw Object.assign(new Error(`${rel} is not an indexed language file`), { code: 1 });
  const out = { path: rel, adapter: res.adapter, fileHash: res.fileHash, parseError: res.parseError, raw: res.raw, symbols: res.symbols, warnings: res.warnings };
  if (ctx.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${rel} via ${res.adapter}${res.parseError ? ` — ${res.parseError}` : ""}`);
    for (const s of res.symbols) console.log(`${s.kind.padEnd(8)} ${s.name}  sig=${s.sigHash} body=${s.bodyHash} intent=${s.intentHash}${s.stub ? " stub" : ""}`);
  }
  return 0;
}
