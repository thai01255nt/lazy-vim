// The project state dir, in one place. Dependency-free so hooks can import it without loading the core.
// Since 0.4 the dir is `.hitl/` (was `.claude/custom/`, which Claude Code treats as sensitive and prompts on every write).
import fs from "node:fs";
import path from "node:path";

export const HITL_DIR = ".hitl";
/** Project-relative prefix of every hitl file, with trailing slash: `.hitl/`. */
export const HITL_PREFIX = `${HITL_DIR}/`;
export const CONFIG_REL = `${HITL_DIR}/hitl.config.json`;
/** `HITL_PREFIX` escaped for use inside a RegExp source. */
export const HITL_RE = HITL_PREFIX.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// Legacy (≤ 0.3) location — only migrate and legacy detection use these.
export const LEGACY_DIR = ".claude/custom";
export const LEGACY_CONFIG_REL = `${LEGACY_DIR}/hitl.config.json`;
export const LEGACY_NOTICE = "⚠️ HITL: legacy dir .claude/custom/ — run hitl-index migrate";

/** Nearest ancestor of `startDir` holding a legacy config while having no `.hitl/` dir; else null. Sync, cheap. */
export function findLegacyRootSync(startDir) {
  if (!startDir || typeof startDir !== "string") return null;
  let dir = path.resolve(startDir);
  try { if (fs.statSync(dir).isFile()) dir = path.dirname(dir); } catch { /* may not exist */ }
  for (;;) {
    try { if (fs.statSync(path.join(dir, CONFIG_REL)).isFile()) return null; } catch { /* keep walking */ }
    try {
      if (fs.statSync(path.join(dir, LEGACY_CONFIG_REL)).isFile()) return fs.existsSync(path.join(dir, HITL_DIR)) ? null : dir;
    } catch { /* keep walking */ }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
