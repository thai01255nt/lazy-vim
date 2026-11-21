// `hitl-index next-id <change-id> | --quick [<slug>]` — prints the next task id <KEY>-T<max+1> of a change (its proposal
// key), over the tasks files and the lock; or, with --quick, the first id of a new quick file under a fresh key of its
// own (0.13.2: `Q` + 3 initials of the slug, e.g. QFLT-T1; the header gets `← Change: none | key: QFLT`); 0.21: a slug
// ending in -brief is refused (QUICK_SLUG_RESERVED).
import { parseArgv } from "../lib/project.mjs";
import { nextTaskId } from "../lib/tasksmd.mjs";
import { parseTaskId } from "../lib/specids.mjs";

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["quick"] });
  if (a.quick ? a._.length > 1 : a._.length !== 1) throw Object.assign(new Error("usage: hitl-index next-id <change-id> | --quick [<slug>]"), { usage: true });
  // 0.21: `.hitl/tasks/quick-<slug>-brief.md` is the quick file's tasks brief: a slug ending in -brief would be hidden
  if (a.quick && /-brief$/i.test(String(a._[0] ?? "").replace(/\.md$/, ""))) {
    const msg = `QUICK_SLUG_RESERVED: slug "${a._[0]}" ends in -brief (quick-<slug>-brief.md is a quick file's tasks brief); choose another slug`;
    if (ctx.json) console.log(JSON.stringify({ ok: false, code: "QUICK_SLUG_RESERVED", message: msg })); else console.error(msg);
    return 1;
  }
  const id = await nextTaskId(ctx.root, a.quick ? "quick" : a._[0], { slug: a.quick ? a._[0] ?? null : null });
  console.log(ctx.json ? JSON.stringify({ next: id, key: parseTaskId(id).key }) : id);
  return 0;
}
