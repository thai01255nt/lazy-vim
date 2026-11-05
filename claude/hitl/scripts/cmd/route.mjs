// `hitl-index route [--in <file>] [--final] [--keep] [--json]` (0.11) — read the work-router's verdict for /hitl:go
// (default `.hitl/.inbox/route.json`), check it against the active changes and print one action: ask, note or invoke.
// The file is removed after reading (unless --keep) so a stale verdict is never reused. Exit 1: no usable verdict.
import { rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { readText } from "../lib/fsutil.mjs";
import { changeInfo, listChanges, readChange } from "../lib/changes.mjs";
import { ROUTE_FILE, resolveRoute } from "../lib/route.mjs";

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["final", "keep", "json"], values: ["in"] });
  if (a._.length) throw Object.assign(new Error("usage: hitl-index route [--in <file>] [--final] [--keep] [--json]"), { usage: true });
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  const json = ctx.json || a.json;
  const rel = a.in || ROUTE_FILE;
  const file = isAbsolute(rel) ? rel : join(ctx.root, rel);
  const text = await readText(file, null);
  let res;
  if (text === null) res = { ok: false, errors: [`no verdict at ${rel} (the router wrote none)`] };
  else {
    let verdict = null;
    try { verdict = JSON.parse(text); } catch (e) { res = { ok: false, errors: [`${rel} is not JSON: ${e.message}`] }; }
    if (!res) {
      const changes = [];
      const { readActiveNotes } = await import("../lib/notes.mjs");
      const activeNotes = await readActiveNotes(ctx.root).catch(() => []);
      for (const e of await listChanges(ctx.root, { archived: false })) changes.push(await changeInfo(ctx.root, ctx.config, await readChange(ctx.root, e), { activeNotes }));
      res = resolveRoute(verdict, changes, { final: !!a.final });
    }
    if (!a.keep) await rm(file, { force: true }).catch(() => {});
  }
  const out = { schema: "hitl.route-action/1", ...res };
  if (json) console.log(JSON.stringify(out, null, 2));
  else if (!res.ok) console.log(`❌ ${res.errors.join("; ")}`);
  else if (res.action === "ask") { res.questions.forEach((q, i) => console.log(`Q${i + 1}. ${q}`)); for (const h of res.hints) console.log(h); }
  else {
    console.log(res.line);
    for (const h of res.hints) console.log(h);
    console.log(res.action === "note" ? res.gate : `→ Skill ${res.skill} ${res.args}`);
  }
  return res.ok ? 0 : 1;
}
