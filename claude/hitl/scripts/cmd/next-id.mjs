// `hitl-index next-id <change-id> | --quick` — prints the next task id <KEY>-T<max+1> of a change (its proposal key) or
// of the quick tasks (key QT), over the tasks files and the lock.
import { parseArgv } from "../lib/project.mjs";
import { nextTaskId } from "../lib/tasksmd.mjs";

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["quick"] });
  if ((a.quick ? 1 : 0) + a._.length !== 1) throw Object.assign(new Error("usage: hitl-index next-id <change-id> | --quick"), { usage: true });
  const id = await nextTaskId(ctx.root, a.quick ? "quick" : a._[0]);
  console.log(ctx.json ? JSON.stringify({ next: id }) : id);
  return 0;
}
