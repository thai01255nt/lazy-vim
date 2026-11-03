// PostToolUse(Edit|Write|MultiEdit) hook (design §D.4): record touched symbols, reindex the file,
// and report warn/block drift as additionalContext. Always exits 0.
import { run, role, toolPath, projectRootOrExit, relPath, silent, context, api, updateSession, driftKey, formatDriftItem } from "./common.mjs";
import { HITL_RE } from "../lib/paths.mjs";

async function main(input) {
  const tool = input.tool_name;
  if (!["Edit", "Write", "MultiEdit"].includes(tool)) silent();
  const abs = toolPath(input);
  if (!abs) silent();
  const root = projectRootOrExit(input);
  const rel = relPath(root, abs);
  if (!rel) silent();
  const a = await api();
  const config = await a.loadConfig(root);
  const isTasksMd = new RegExp(`^${HITL_RE}(?:tasks/[^/]+|changes/[^/]+/tasks)\\.md$`).test(rel);
  if (!a.langOf(rel, config) && !isTasksMd) silent();

  const R = role(input);
  const sid = input.session_id;
  let drift;
  if (isTasksMd) {
    drift = await a.computeDrift(root, { files: [rel] });
  } else {
    // record pre-edit state from the (not yet updated) index
    const prev = await a.readIndex(root);
    const prevIds = (prev && prev.files && prev.files[rel] && prev.files[rel].symbols) || [];
    const res = await a.updateIndex(root, [rel], {});
    await updateSession(root, sid, (s) => {
      s.touched = s.touched || {};
      for (const id of prevIds) {
        const S = prev.symbols && prev.symbols[id];
        if (!S) continue;
        if (!s.touched[id]) s.touched[id] = { beforeBodyHash: S.bodyHash ?? null, beforeStub: !!S.stub, role: R };
        else s.touched[id].role = R;
      }
      for (const id of (res && res.added) || []) {
        if (!s.touched[id]) s.touched[id] = { beforeBodyHash: null, beforeStub: false, role: R };
      }
      return s;
    });
    drift = (res && res.drift) || await a.computeDrift(root, { files: [rel] });
  }
  const items = ((drift && drift.items) || []).filter((it) => it && (it.level === "warn" || it.level === "block"));
  if (!items.length) silent();
  // Mark as reported so the prompt-submit safety net does not repeat them.
  try {
    const index = await a.readIndex(root);
    await updateSession(root, sid, (s) => {
      s.reportedDrift = s.reportedDrift || {};
      for (const it of items) s.reportedDrift[driftKey(it, index)] = new Date().toISOString();
      return s;
    });
  } catch { /* best effort */ }
  context("PostToolUse", items.map(formatDriftItem).join("\n"));
}

run(main, { watchdogMs: 28000 });
