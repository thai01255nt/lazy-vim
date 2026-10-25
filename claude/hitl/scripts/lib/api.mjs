// Public P1 API used by P2 (lifecycle) and P3 (hooks). See design §G P1.
import { parseDoc, formatStatusEdit } from "./tags.mjs";

export { paths, findRoot, listFiles, parseArgv, toRel } from "./project.mjs";
export { loadConfig, langOf, isTestFile } from "./config.mjs";
export { parseSources, updateIndex, readIndex } from "./indexer.mjs";
export { readJson, writeJsonAtomic, withIndexLock } from "./fsutil.mjs";
export { resolveRef } from "./graph.mjs";
export { computeDrift } from "./drift.mjs";
export { buildContext } from "./context.mjs";
export { readTasks } from "./tasksmd.mjs";
export { parsePlanningMd, readPlanning } from "./planningmd.mjs";
export { buildTrace, loadTraceInputs, specLinksFor } from "./trace.mjs";
export const tags = { parseDoc, formatStatusEdit };
