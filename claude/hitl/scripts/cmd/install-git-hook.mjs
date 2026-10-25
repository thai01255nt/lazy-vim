// P2 — `hitl-index install-git-hook [--husky] [--uninstall]` (opt-in pre-commit drift check)
import { parseArgs } from "node:util";
import { promises as fsp } from "node:fs";
import { join, relative, isAbsolute, dirname } from "node:path";
import { runShell } from "../lib/runner.mjs";

const OPTS = { husky: { type: "boolean" }, uninstall: { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };
export const BEGIN = "# >>> hitl >>>"; export const END = "# <<< hitl <<<";

export function hookBlock(relRoot) {
  const cmd = `node "\${HITL_HOME:-$HOME/.config/nvim/claude/hitl}/scripts/hitl-index.mjs" precommit`;
  const line = relRoot && relRoot !== "." ? `(cd "${relRoot}" && ${cmd}) || exit 1` : `${cmd} || exit 1`;
  return [BEGIN, line, END].join("\n");
}

/** Pure: insert/replace/remove the marked block. Inserts before a trailing `exit 0` so it stays reachable. */
export function editHook(text, block, uninstall = false) {
  const re = new RegExp(`\\n?${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`);
  let t = text ?? "";
  t = t.replace(re, "\n");
  if (uninstall) return t.replace(/\n{3,}/g, "\n\n");
  if (!t.trim()) t = "#!/bin/sh\n";
  if (!t.endsWith("\n")) t += "\n";
  const lines = t.split("\n");
  let k = lines.length - 1; while (k > 0 && !lines[k - 1].trim()) k--;
  const lastIdx = k - 1;
  if (lastIdx > 0 && /^\s*exit\s+0\s*$/.test(lines[lastIdx])) { lines.splice(lastIdx, 0, block); return lines.join("\n"); }
  return t + block + "\n";
}

export async function run(argv, ctx) {
  const { values: v } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const root = ctx.root || process.cwd();
  const top = await runShell("git rev-parse --show-toplevel", { cwd: root, timeoutMs: 5000 });
  if (top.code !== 0) { console.error("not a git repository"); return 1; }
  const gitTop = top.stdout.trim();
  let file;
  if (v.husky) file = join(gitTop, ".husky", "pre-commit");
  else {
    const hp = await runShell("git rev-parse --git-path hooks", { cwd: gitTop, timeoutMs: 5000 });
    const dir = hp.stdout.trim() || ".git/hooks";
    file = join(isAbsolute(dir) ? dir : join(gitTop, dir), "pre-commit");
  }
  let text = null; try { text = await fsp.readFile(file, "utf8"); } catch { /* new */ }
  if (v.uninstall) {
    if (text === null || !text.includes(BEGIN)) { console.log("hitl pre-commit block not installed"); return 0; }
    await fsp.writeFile(file, editHook(text, "", true));
    console.log(`✅ removed hitl block from ${relative(gitTop, file)}`);
    return 0;
  }
  const out = editHook(text, hookBlock(relative(gitTop, root) || "."));
  await fsp.mkdir(dirname(file), { recursive: true });
  await fsp.writeFile(file, out);
  await fsp.chmod(file, 0o755);
  if (ctx.json || v.json) console.log(JSON.stringify({ installed: true, file: relative(gitTop, file) }));
  else console.log(`✅ hitl pre-commit drift check installed in ${relative(gitTop, file)} (set HITL_HOME to override the plugin path; --uninstall to remove)`);
  return 0;
}
