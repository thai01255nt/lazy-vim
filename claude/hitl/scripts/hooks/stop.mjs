// Stop / SubagentStop hook (design §D.7): mechanical verification-before-completion.
// Blocks finishing (max 2 times per streak) when agent-implemented symbols touched this session
// have no fresh passing tests (computed status wip|red).
import { run, role, projectRootOrExit, silent, emit, api, optionalLib, readSession, updateSession, shortName } from "./common.mjs";

const MAX_BLOCKS = 2;

async function main(input) {
  const ev = input.hook_event_name === "SubagentStop" ? "SubagentStop" : "Stop";
  const root = projectRootOrExit(input, { useToolPath: false });
  const a = await api();
  const config = await a.loadConfig(root);
  if (config && config.stopGate === false) silent();
  const R = role(input);
  if (ev === "SubagentStop" && R !== "implementer" && R !== "main") silent();
  const sid = input.session_id;

  // Main Stop: catch Bash-made edits first (cheap changed-only reindex).
  if (ev === "Stop") { try { await a.updateIndex(root, null, { changedOnly: true, budgetMs: 4000 }); } catch {} }

  const session = readSession(root, sid);
  const touched = session.touched || {};
  if (!Object.keys(touched).length) silent();

  const index = await a.readIndex(root);
  if (!index || !index.symbols) silent();
  const lock = await a.readJson(a.paths(root).lock, {});
  const warnings = [];

  const allowedRoles = ev === "SubagentStop" ? new Set([R]) : new Set(["main", "implementer"]);
  const candidates = [];
  for (const [id, t] of Object.entries(touched)) {
    const S = index.symbols[id];
    if (!S || !t) continue;
    if (ev === "Stop" && S.tags && S.tags.impl === "manual" && lock.symbols && lock.symbols[id] &&
        t.beforeBodyHash && t.beforeBodyHash !== S.bodyHash && t.role !== "human") {
      warnings.push(`@impl manual ${shortName(id)} was changed in a file edited by ${t.role}`);
    }
    if (!allowedRoles.has(t.role)) continue;
    if (!(t.beforeStub === true || t.beforeBodyHash !== S.bodyHash)) continue;
    if (S.stub !== false) continue;
    if (!S.tags || S.tags.impl !== "agent") continue;
    if (!["function", "method", "const"].includes(S.kind)) continue;
    candidates.push(S);
  }

  let offenders = [];
  if (candidates.length) {
    const statusLib = await optionalLib("status.mjs");
    if (statusLib && typeof statusLib.computeStatuses === "function") {
      const state = await a.readJson(a.paths(root).state, {});
      let tasks = [];
      try { tasks = await a.readTasks(root); } catch {}
      const st = await statusLib.computeStatuses(index, lock, state, config, tasks);
      const per = (st && (st.symbols || st)) || {};
      offenders = candidates.filter((S) => per[S.id] && ["wip", "red"].includes(per[S.id].status));
    }
  }

  if (offenders.length) {
    const refs = offenders.map((S) => S.name || shortName(S.id)).join(", ");
    const tasks = [...new Set(offenders.flatMap((S) => (S.tags && S.tags.task) || []))];
    const T = tasks.length ? tasks.join(", ") : "<T>";
    let blocks = 0;
    await updateSession(root, sid, (s) => { s.stopBlocks = (s.stopBlocks || 0) + 1; blocks = s.stopBlocks; return s; });
    if (blocks <= MAX_BLOCKS) {
      emit(JSON.stringify({ decision: "block", reason: `Fresh passing tests required before finishing: ${refs}. Run hitl-index test --task ${T} and fix, or report the failure to the user.` }));
    }
    warnings.unshift(`${refs} implemented without fresh passing tests`);
  } else if (session.stopBlocks) {
    await updateSession(root, sid, (s) => { s.stopBlocks = 0; return s; });
  }

  if (warnings.length) emit(JSON.stringify({ systemMessage: `⚠️ HITL: ${warnings.join("; ")}.` }));
  silent();
}

run(main, { watchdogMs: 55000 });
