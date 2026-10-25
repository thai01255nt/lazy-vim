// `hitl-index next-id` — prints T-<max+1> across tasks files and the lock.
import { nextTaskId } from "../lib/tasksmd.mjs";

export async function run(argv, ctx) {
  const id = await nextTaskId(ctx.root);
  console.log(ctx.json ? JSON.stringify({ next: id }) : id);
  return 0;
}
