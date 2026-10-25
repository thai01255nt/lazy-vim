// Context slice markdown for a task or symbol (§E.7). Never prints line numbers.
import { promises as fs, existsSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { paths } from "./project.mjs";
import { readJson } from "./fsutil.mjs";
import { resolveRef } from "./graph.mjs";
import { readTasks } from "./tasksmd.mjs";
import { readPlanning, statusText } from "./planningmd.mjs";

const firstLine = (t) => (t || "").split("\n").find((l) => l.trim()) || "";
const fence = (lang) => (lang === "py" ? "py" : "ts");

async function statusesFor(index, lock, state, config, tasks) {
  const p = new URL("./status.mjs", import.meta.url);
  if (!existsSync(fileURLToPath(p))) return null;
  try { return (await import(p.href)).computeStatuses(index, lock, state, config, tasks); } catch { return null; }
}

export async function buildContext(root, target, { contract = false, budget = 12000 } = {}) {
  const { readIndex } = await import("./indexer.mjs");
  const index = await readIndex(root);
  if (!index) throw new Error("index missing: run hitl-index index --all");
  const P = paths(root);
  const config = await loadConfig(root);
  const lock = (await readJson(P.lock, null)) || { symbols: {}, tests: {}, tasks: {} };
  const state = (await readJson(P.state, null)) || { runs: {}, mutation: {}, reviews: {} };
  const tasks = await readTasks(root);
  const st = await statusesFor(index, lock, state, config, tasks);
  const S = index.symbols;
  const statusOf = (id) => st?.symbols?.[id]?.status || S[id]?.tags?.status || "unknown";
  const lines = new Map();
  const fileLines = async (f) => {
    if (!lines.has(f)) lines.set(f, (await fs.readFile(join(root, f), "utf8").catch(() => "")).split("\n"));
    return lines.get(f);
  };

  // targets
  let task = null, targets = [];
  if (/^T-\d+$/.test(target)) {
    task = tasks.find((t) => t.id === target);
    if (!task) throw Object.assign(new Error(`unknown task ${target}`), { code: 1 });
    for (const s of task.symbols) {
      const id = S[`${s.file}#${s.ref}`] ? `${s.file}#${s.ref}` : resolveRef(index, s.ref, s.file)?.id;
      targets.push({ row: s, id: id || null });
    }
    for (const [id, s] of Object.entries(S)) // tagged helpers not listed in the task file
      if (s.tags?.task?.includes(target) && !targets.some((t) => t.id === id) && (s.kind === "function" || s.kind === "method")) targets.push({ row: null, id });
  } else {
    const r = resolveRef(index, target);
    if (!r) throw Object.assign(new Error(`unknown ref ${target}`), { code: 1 });
    if (r.ambiguous) throw Object.assign(new Error(`ambiguous ref ${target}: ${r.ambiguous.join(", ")}`), { code: 1 });
    targets = [{ row: null, id: r.id }];
    const t = S[r.id].tags?.task?.[0] || lock.symbols[r.id]?.task;
    task = t ? tasks.find((x) => x.id === t) || null : null;
  }
  const ids = targets.map((t) => t.id).filter(Boolean);
  const files = new Set(ids.map((id) => S[id].file));

  const source = async (s) => {
    const L = await fileLines(s.file);
    const slice = (a, b) => L.slice(a - 1, b);
    if (!contract || !s.bodySpan) return [...(s.docSpan && s.docSpan.end < s.span.start ? slice(s.docSpan.start, s.docSpan.end) : []), ...slice(s.span.start, s.span.end)].join("\n");
    const head = slice(s.span.start, s.bodySpan.start);
    const body = slice(s.bodySpan.start + 1, s.span.end);
    const indent = (body.find((l) => l.trim()) || "  ").match(/^\s*/)[0] || "  ";
    const todos = body.filter((l) => /TODO\(impl\)/.test(l) && /^\s*(\/\/|#|\*)/.test(l));
    if (s.file.endsWith(".py")) {
      const doc = s.docSpan ? slice(s.docSpan.start, s.docSpan.end) : [];
      return [...head, ...doc, ...todos, `${indent}...`].join("\n");
    }
    const doc = s.docSpan && s.docSpan.end < s.span.start ? slice(s.docSpan.start, s.docSpan.end) : [];
    const close = L[s.span.end - 1]?.match(/^\s*/)[0] ?? "";
    return [...doc, ...head, ...todos, `${indent}…`, `${close}}`].join("\n");
  };
  const testsOf = (id) => Object.values(S).filter((t) => t.test && t.kind === "test" && t.test.coversResolved.includes(id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const testState = (t) => `${lock.tests[t.id]?.stage || "unlocked"}, ${state.runs?.[t.id]?.outcome || (t.test.mode === "active" ? "not run" : t.test.mode)}`;
  const label = (id) => `${S[id].name} (${S[id].file})`;

  // spec (planning R-/D- rows) for AC lines and decisions
  const planning = task?.planning && task.planning !== "none" ? await readPlanning(root, task.planning).catch(() => null) : null;
  const reqOf = (r) => planning?.requirements.find((x) => x.id === r);
  const decOf = (d) => planning?.decisions.find((x) => x.id === d);
  const acLine = (a) => (a.reqs || []).length
    ? `- ${a.id} (${a.reqs.map((r) => `${r}: ${reqOf(r)?.text ?? "unknown"}`).join("; ")}) ${a.text}` : `- ${a.id} ${a.text}`;

  const sections = []; // {text, drop: "siblings"|"testBodies"|null}
  const head = [];
  if (task) {
    const tst = st?.tasks?.[task.id]?.status || task.status;
    head.push(`# Context ${task.id} — ${task.title}  (risk: ${task.risk} | prio: ${task.prio} | status: ${tst})`);
    head.push(`task file: ${task.file}${task.planning ? ` · planning: ${task.planning}` : ""}`);
    head.push("", "## Acceptance criteria", ...(task.acs.length ? task.acs.map(acLine) : ["- (none)"]));
    if (!contract && planning) {
      const ids = [...new Set([...(task.decisions || []), ...Object.values(S).filter((s) => (s.tags?.task || []).includes(task.id)).flatMap((s) => s.tags?.dec || [])])];
      if (ids.length) head.push("", "## Decisions", ...ids.map((d) => { const x = decOf(d); return x ? `- ${d} (${statusText(x)}): ${x.decision}` : `- ${d} (unknown)`; }));
    }
    if (task.testPlan.length) head.push("", "## Test plan", "| ac | kind | oracle | seam | author |", "|---|---|---|---|---|", ...task.testPlan.map((r) => `| ${r.ac} | ${r.kind} | ${r.oracle} | ${r.seam} | ${r.author} |`));
  } else head.push(`# Context ${S[ids[0]].name}`);
  sections.push({ text: head.join("\n") });

  const testFilesAll = new Set();
  sections.push({ text: "\n## Targets (implement order)" });
  let n = 0;
  for (const t of targets) {
    n++;
    if (!t.id) { sections.push({ text: `### ${n}. ${t.row.ref} — impl: ${t.row.impl} — status: not in index — file: ${t.row.file} (${t.row.change})\n${t.row.purpose}` }); continue; }
    const s = S[t.id];
    const parent = s.parent && S[s.parent] ? ` (${s.kind} of ${S[s.parent].exported ? "exported " : ""}${S[s.parent].kind} ${S[s.parent].name})` : ` (${s.exported ? "exported " : ""}${s.kind})`;
    const out = [`### ${n}. ${s.name} — impl: ${s.tags.impl || t.row?.impl || "?"} — status: ${statusOf(t.id)} — file: ${s.file}${parent}`];
    if (t.row?.purpose) out.push(`purpose: ${t.row.purpose}`);
    out.push("```" + fence(s.file.endsWith(".py") ? "py" : "ts"), await source(s), "```");
    const l = lock.symbols[t.id];
    if (!contract && (s.tags?.dec || []).length) out.push(`decisions (@dec): ${s.tags.dec.map((d) => `${d} (${decOf(d)?.decision ?? "unknown"})`).join(", ")}`);
    out.push(l ? `locked contract: sig ${l.sigHash === s.sigHash ? "✅" : "⚠️ changed since approval"} intent ${l.intentHash === s.intentHash ? "✅" : "⚠️ changed since approval"}` : "locked contract: not locked yet");
    sections.push({ text: out.join("\n") });
    const callers = s.callers.filter((c) => S[c]);
    sections.push({ callers, text: null });
    const declared = (s.tags.calls || []).map((r) => resolveRef(index, r, s.file)?.id).filter(Boolean);
    const callee = (id) => `${S[id].name}${S[id].signature ? `: ${S[id].signature}` : ""} — ${S[id].file} — "${firstLine(S[id].intent)}" [${S[id].tags.impl || "untagged"}, ${statusOf(id)}]`;
    const decl = declared.length ? declared.map(callee).join("; ") : (s.tags.calls || []).join(", ") || "—";
    const undecl = s.callees.filter((c) => !declared.includes(c));
    const tests = testsOf(t.id);
    for (const x of tests) testFilesAll.add(x.file);
    const tline = tests.length ? [...new Set(tests.map((x) => x.file))].map((f) => `${f} — ${tests.filter((x) => x.file === f).map((x) => `"${x.test.titlePath.at(-1)}" [${testState(x)}]`).join("; ")}`).join("\n  ") : "—";
    sections.push({ text: [`callees declared (@calls): ${decl}`, `callees undeclared: ${undecl.length ? undecl.map(label).join(", ") : "—"}`,
      ...(s.unresolvedCalls.length && !contract ? [`unresolved calls: ${s.unresolvedCalls.join(", ")}`] : []), `tests: ${tline}`].join("\n") });
  }

  // neighbourhood
  for (const f of [...files].sort()) {
    const fe = index.files[f];
    const imps = (fe?.imports || []).map((i) => `${i.names.map((x) => x.alias || x.name).join(", ") || "(side effect)"} (${i.resolved || i.from})`);
    const sibs = (fe?.symbols || []).filter((id) => !ids.includes(id) && S[id] && !S[id].test).map((id) => S[id].signature || S[id].name);
    sections.push({ text: [`\n## File neighbourhood: ${f}`, `imports: ${imps.join("; ") || "—"}`].join("\n") });
    sections.push({ text: `siblings: ${sibs.join("; ") || "—"}`, drop: "siblings" });
  }

  // public types used by target signatures
  const sigs = ids.map((id) => S[id].signature).join("\n");
  const types = Object.values(S).filter((s) => s.kind === "type" || (s.kind === "class" && !ids.includes(s.id)))
    .filter((s) => new RegExp(`\\b${s.name.replace(/[$.]/g, "\\$&")}\\b`).test(sigs)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (types.length) {
    const out = ["\n## Public types used"];
    for (const t of types) {
      if (t.kind === "class") { out.push(`${t.signature} { … }   (${t.file})`); continue; }
      const L = await fileLines(t.file);
      const text = L.slice(t.span.start - 1, t.span.end).join(" ").replace(/\s+/g, " ").trim();
      out.push(`${text.length > 400 ? text.slice(0, 400) + " …" : text}   (${t.file})`);
    }
    sections.push({ text: out.join("\n") });
  }

  // contract mode: tests with bodies + import paths
  if (contract) {
    const out = ["\n## Tests (existing)"];
    const bodies = [];
    for (const f of [...testFilesAll].sort()) {
      const tests = Object.values(S).filter((t) => t.file === f && t.kind === "test" && ids.some((id) => t.test.coversResolved.includes(id)));
      out.push(`### ${f}`);
      for (const t of tests) out.push(`- "${t.test.titlePath.join(" > ")}" — @covers ${t.tags.covers.join(", ") || "(inherited)"} @ac ${t.tags.ac.join(", ") || "—"} @kind ${t.tags.kind || "—"} @origin ${t.tags.origin || "—"} [${testState(t)}]`);
      out.push(`import paths: ${[...files].sort().map((src) => `${src} → ${relImport(f, src)}`).join("; ")}`);
      const L = await fileLines(f);
      bodies.push(`#### ${f}`, "```" + (f.endsWith(".py") ? "py" : "ts"), L.join("\n").trimEnd(), "```");
    }
    if (!testFilesAll.size) out.push(`- none yet; test globs: ${config.testGlobs.join(", ")}`, `import paths (from project root): ${[...files].sort().join("; ")}`);
    sections.push({ text: out.join("\n") });
    if (bodies.length) sections.push({ text: bodies.join("\n"), drop: "testBodies" });
  }

  const testCmd = task ? `hitl-index test --task ${task.id}` : `hitl-index test --symbol ${S[ids[0]].name}`;
  sections.push({ text: ["\n## Rules",
    "- Do not change signatures, docstrings or @tags of locked symbols. Do not edit tests. Follow TODO(impl) steps in order; turn them into \"// n. step\" comments.",
    `- Test command: ${testCmd}`].join("\n") });

  const render = (maxCallers, dropped) => sections.filter((s) => !dropped.has(s.drop)).map((s) => {
    if (!s.callers) return s.text;
    const shown = s.callers.slice(0, maxCallers).map((c) => `${S[c].name} (${S[c].file}) — "${firstLine(S[c].intent)}"`);
    const more = s.callers.length > maxCallers ? ` … +${s.callers.length - maxCallers} more` : "";
    return `callers (${s.callers.length}): ${shown.join("; ") || "—"}${more}`;
  }).join("\n");
  const dropped = new Set();
  let md = render(Infinity, dropped);
  if (md.length > budget) { dropped.add("siblings"); md = render(Infinity, dropped); }
  if (md.length > budget) md = render(5, dropped);
  if (md.length > budget) { dropped.add("testBodies"); md = render(5, dropped); }
  if (md.length > budget) md = md.slice(0, budget - 20) + "\n… (truncated)";
  const allFiles = new Set([...files, ...testFilesAll, ...(task ? [task.file] : [])]);
  const targetsOut = ids.map((id) => ({ id, callers: S[id].callers, callees: S[id].callees }));
  return { markdown: md + "\n", symbols: ids, files: [...allFiles].sort(), targets: targetsOut,
    callers: [...new Set(targetsOut.flatMap((t) => t.callers))].sort(), callees: [...new Set(targetsOut.flatMap((t) => t.callees))].sort() };
}

function relImport(fromFile, srcFile) {
  if (srcFile.endsWith(".py")) return srcFile.replace(/\.py$/, "").replace(/\/__init__$/, "").replace(/\//g, ".");
  let r = posix.relative(posix.dirname(fromFile), srcFile);
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}
