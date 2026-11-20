// `hitl-index where <id> [--json]` (0.19): every location of one hitl id — def, test, symbol, brief, ref — for an
// editor's id jump. Text output is one `file:line:col: role: text` line per location (Vim quickfix / grep format,
// errorformat `%f:%l:%c:%m`); --json gives {schema, id, kind, locations:[{file, line, col, colUtf16, role, text,
// archived, symbol?}]}. `col` counts UTF-8 bytes (grep, Vim), `colUtf16` UTF-16 code units (VS Code, LSP); both 1-based.
// Exit 0 found, 1 no location, 2 not a hitl id. Read-only: never reindexes.
import { parseArgv } from "../lib/project.mjs";
import { formatLocation, where } from "../lib/where.mjs";

const USAGE = "usage: hitl-index where <id> [--json]   (id: PWR-R1, PWR-R1.S2, PWR-BR1, PWR-UC1, PWR-T1, PWR-T1.AC2, PWR-D1, PWR-A1)";

export async function run(argv, ctx) {
  const a = parseArgv(argv);
  if (a._.length !== 1) throw Object.assign(new Error(USAGE), { usage: true });
  const r = await where(ctx.root, ctx.config, a._[0]);
  const { searched, ...out } = r;
  if (ctx.json) console.log(JSON.stringify(out, null, 2));
  else if (!ctx.quiet) for (const l of r.locations) console.log(formatLocation(l));
  if (!r.locations.length) {
    console.error(`hitl-index where: ${r.id} not found (searched .hitl/ and the project files: ${searched} files)`);
    return 1;
  }
  return 0;
}
