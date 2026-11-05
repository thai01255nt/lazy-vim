// `hitl-index next-id <change-id> | --quick [<slug>]` — prints the next task id <KEY>-T<max+1> of a change (its proposal
// key), over the tasks files and the lock; or, with --quick, the first id of a new quick file under a fresh key of its
// own (0.13.2: `Q` + slug letters + hash letters, e.g. QFLKM-T1; the header gets `← Change: none | key: QFLKM`).
import { parseArgv } from "../lib/project.mjs";
import { nextTaskId } from "../lib/tasksmd.mjs";
import { parseTaskId } from "../lib/specids.mjs";

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["quick"] });
  if (a.quick ? a._.length > 1 : a._.length !== 1) throw Object.assign(new Error("usage: hitl-index next-id <change-id> | --quick [<slug>]"), { usage: true });
  const id = await nextTaskId(ctx.root, a.quick ? "quick" : a._[0], { slug: a.quick ? a._[0] ?? null : null });
  console.log(ctx.json ? JSON.stringify({ next: id, key: parseTaskId(id).key }) : id);
  return 0;
}
