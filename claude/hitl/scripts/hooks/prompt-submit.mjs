// UserPromptSubmit hook (design §D.5): approve token, fast-lane override token + silent safety-net reindex.
// Verified: `prompt` carries the raw typed line for skill invocations (e.g. "/hitl:approve T-1"),
// not the expanded skill body. Plain stdout is added to Claude's context on this event.
import { run, projectRootOrExit, silent, emit, api, optionalLib, readSession, updateSession, newLockedDrift, driftLine } from "./common.mjs";

const APPROVE_PROMPT = /^\s*\/(?:hitl:)?approve\b(.*)$/s;
const IMPLEMENT_PROMPT = /^\s*\/(?:hitl:)?implement\b(.*)$/s;
const LANE_FAST = /(?:^|\s)--lane(?:=|\s+)fast(?=\s|$)/;
const FEATURE_ARG = /(?:^|\s)--feature(?:=|\s+)(\S+)/;

/**
 * Override token for `/hitl:implement <T> --lane fast` (bound to T) or `/hitl:implement --feature <file> --lane fast`
 * (bound to the tasks of that file, resolved now). null when the prompt does not ask for an override or cannot be bound.
 */
async function overrideToken(root, args) {
  if (!LANE_FAST.test(args)) return null;
  const f = FEATURE_ARG.exec(args);
  const base = { at: Date.now(), args: args.trim().slice(0, 200) };
  if (!f) {
    const t = /\bT-\d+\b/.exec(args);
    return t ? { ...base, tasks: [t[0]], feature: null } : null;
  }
  const lib = await optionalLib("feature.mjs");
  const a = await api();
  if (!lib || !a.readTasks) return null;
  const feat = lib.resolveFeature(await a.readTasks(root), f[1]);
  if (feat.error || !feat.tasks.length) return null;
  return { ...base, tasks: feat.tasks.map((t) => t.id).sort(), feature: feat.name };
}

async function main(input) {
  const root = projectRootOrExit(input, { useToolPath: false });
  const sid = input.session_id;
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const m = APPROVE_PROMPT.exec(prompt);
  if (m) {
    await updateSession(root, sid, (s) => { s.approveToken = { at: Date.now(), args: m[1].trim().slice(0, 200) }; return s; });
  }
  // Any typed slash command ends a previous override run; plain replies ("done", "y") at its gates keep it.
  if (/^\s*\//.test(prompt)) {
    const im = IMPLEMENT_PROMPT.exec(prompt);
    let tok = null;
    if (im) { try { tok = await overrideToken(root, im[1]); } catch { tok = null; } }
    if (tok || readSession(root, sid).overrideToken) await updateSession(root, sid, (s) => { s.overrideToken = tok; return s; });
  }

  const a = await api();
  const res = await a.updateIndex(root, null, { changedOnly: true, budgetMs: 4000 });
  if (!res || !res.drift) silent();
  const lock = await a.readJson(a.paths(root).lock, {});
  const index = await a.readIndex(root);
  const fresh = await newLockedDrift(root, sid, res.drift, lock, index);
  if (!fresh.length) silent();
  emit(driftLine(fresh));
}

run(main, { watchdogMs: 8500 });
