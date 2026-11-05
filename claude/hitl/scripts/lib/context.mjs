// Context slice markdown for a task or symbol (§E.7). Never prints line numbers.
import { promises as fs, existsSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { paths } from "./project.mjs";
import { readJson } from "./fsutil.mjs";
import { resolveRef } from "./graph.mjs";
import { currentTask } from "./lock.mjs";
import { readTasks } from "./tasksmd.mjs";
import { readPlanning, statusText } from "./planningmd.mjs";
import { effectiveTerms, phraseRx } from "./glossary.mjs";

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
    const t = currentTask(S[r.id], lock, r.id); // a symbol shared by tasks: the open one
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
    const todos = body.filter((l) => /TODO\(impl[\s)]/.test(l) && /^\s*(\/\/|#|\*)/.test(l));
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

  // spec for AC lines and decisions: the change's effective view + design.md, or (v0.5) the planning file's R-/D- rows
  let changeCtx = null, glossary = null;
  if (task && (task.change || task.changeDir)) {
    const ch = await import("./changes.mjs");
    const specCtx = await ch.loadSpecContext(root).catch(() => null);
    changeCtx = ch.changeForTask(specCtx, task);
    if (changeCtx) changeCtx.find = (r) => ch.findInView(changeCtx.view, r);
    // archived: its delta is already in the living glossary
    glossary = { living: specCtx?.living.glossary?.doc || null, delta: changeCtx && !changeCtx.entry.archived ? changeCtx.change.glossaryDelta : null };
  } else if (task) glossary = { living: (await (await import("./changes.mjs")).readLiving(root).catch(() => null))?.glossary?.doc || null, delta: null };
  const planning = !changeCtx && task?.planning && task.planning !== "none" ? await readPlanning(root, task.planning).catch(() => null) : null;
  const decisionsDoc = changeCtx ? changeCtx.change.design : planning;
  const reqOf = (r) => planning?.requirements.find((x) => x.id === r);
  const decOf = (d) => decisionsDoc?.decisions.find((x) => x.id === d);
  const specText = (r) => {
    const hit = changeCtx.find(r);
    if (!hit) return `${r} unknown`;
    if (hit.scenario) return `${r} ${hit.scenario.title}: ${hit.scenario.steps.map((x) => `${x.kw} ${x.text}`).join(" ")}`;
    return `${r} ${hit.block.title}: ${hit.block.statement || ""}`.trim();
  };
  const acLine = (a) => !(a.reqs || []).length ? `- ${a.id} ${a.text}`
    : changeCtx ? `- ${a.id} (${a.reqs.map(specText).join("; ")}) ${a.text}`
    : `- ${a.id} (${a.reqs.map((r) => `${r}: ${reqOf(r)?.text ?? "unknown"}`).join("; ")}) ${a.text}`;

  let terms = [];
  const sections = []; // {text, drop: "siblings"|"testBodies"|null}
  const head = [];
  if (task) {
    const tst = st?.tasks?.[task.id]?.status || task.status;
    head.push(`# Context ${task.id} — ${task.title}  (risk: ${task.risk} | prio: ${task.prio} | status: ${tst})`);
    head.push(`task file: ${task.file}${task.change ? ` · change: ${task.change}` : task.planning ? ` · planning: ${task.planning}` : ""}`);
    head.push("", "## Acceptance criteria", ...(task.acs.length ? task.acs.map(acLine) : ["- (none)"]));
    const said = [task.title, ...task.acs.map((a) => a.text), ...(changeCtx ? task.acs.flatMap((a) => (a.reqs || []).map(specText)) : [])].join("\n");
    terms = termsFor(effectiveTerms(glossary?.living, glossary?.delta), said);
    if (terms.length) head.push("", "## Terms", ...terms.map((t) => `- **${t.term}**: ${t.text}${t.avoid.length ? ` (avoid: ${t.avoid.join(", ")})` : ""}`));
    if (!contract && decisionsDoc) {
      const ids = [...new Set([...(task.decisions || []), ...Object.values(S).filter((s) => (s.tags?.task || []).includes(task.id)).flatMap((s) => s.tags?.dec || [])])];
      if (ids.length) head.push("", "## Decisions", ...ids.map((d) => { const x = decOf(d); return x ? `- ${d} (${statusText(x)}): ${x.decision}` : `- ${d} (unknown)`; }));
    }
    // 0.9: a reopen the human confirmed — the reopened tests assert the old behaviour and must be rewritten to the AC text above
    const reo = st?.tasks?.[task.id]?.reopen;
    if (reo?.pending?.length) {
      const tname = (id) => S[id]?.test?.titlePath?.join(" > ") || id.slice(id.indexOf("#") + 1);
      head.push("", `## Reopened (${reo.note})`, `These parts were reopened after a requirement or design change; the listed tests assert the OLD behaviour.`,
        ...(reo.symbols.length ? [`- skeleton symbols to update first: ${reo.symbols.map((id) => S[id]?.name || id).join(", ")}`] : []),
        ...reo.acs.map((ac) => `- ${ac}: rewrite to the current AC text${(task.acs.find((a) => a.id === ac)?.text) ? ` ("${task.acs.find((a) => a.id === ac).text}")` : ""}; tests: ${reo.tests.filter((id) => (lock.tests?.[id]?.ac || []).includes(ac)).map(tname).join("; ") || "none yet (write one)"}`),
        ...reo.tests.filter((id) => !(lock.tests?.[id]?.ac || []).some((a) => reo.acs.includes(a))).map((id) => `- covers a reopened symbol: ${tname(id)}`),
        "A rewritten test must FAIL against the current code (it shows the new behaviour). Leave every other locked test unchanged.");
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

  // contract mode: full intents of declared callees and of symbols the targets' intents name, so an intent may name
  // its callee/enum instead of re-explaining it
  if (contract) {
    const collab = collaboratorsOf(index, ids, files);
    if (collab.length) {
      const out = ["\n## Collaborator contracts"];
      for (const id of collab) {
        const c = S[id];
        out.push(`### ${c.name} — ${c.kind} — ${c.file}`, ...(c.signature ? [`signature: ${c.signature}`] : []), c.intent);
      }
      sections.push({ text: out.join("\n"), drop: "collab" });
    }
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
    "- Do not change signatures, docstrings or @tags of locked symbols. Do not edit tests. Follow TODO(impl) steps in order; turn them into \"// n. step\" comments. Leave steps scoped to another task (TODO(impl T-n)).",
    "- Reword pseudo-code steps into ≤8-word intent labels without ids; delete numbered step comments inside classes/enums.",
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
  if (md.length > budget) { dropped.add("collab"); md = render(5, dropped); }
  if (md.length > budget) { dropped.add("testBodies"); md = render(5, dropped); }
  if (md.length > budget) md = md.slice(0, budget - 20) + "\n… (truncated)";
  const allFiles = new Set([...files, ...testFilesAll, ...(task ? [task.file] : [])]);
  const targetsOut = ids.map((id) => ({ id, callers: S[id].callers, callees: S[id].callees }));
  return { markdown: md + "\n", symbols: ids, files: [...allFiles].sort(), targets: targetsOut, terms,
    callers: [...new Set(targetsOut.flatMap((t) => t.callers))].sort(), callees: [...new Set(targetsOut.flatMap((t) => t.callees))].sort() };
}

const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export { effectiveTerms }; // moved to glossary.mjs (shared with spec validate and l0)

/** Terms whose name or an `_Avoid_` word appears in `said` (case-folded, whole words, Unicode letters), in glossary
 *  order, at most `max`. -> [{term, text, avoid}] */
export function termsFor(terms, said, max = 8) {
  if (!said) return [];
  const hit = (w) => w && phraseRx(w).test(said);
  return terms.filter((t) => hit(t.term) || t.avoid.some(hit)).slice(0, max).map(({ term, text, avoid }) => ({ term, text, avoid }));
}
/** A name matched in prose must be a distinctive identifier (camelCase/PascalCase/snake_case, >= 4 chars), so prose
 *  words like "save" or "main" do not pull in a symbol of that name. Dotted full names always count. */
const distinctive = (n) => n.length >= 4 && /^[A-Za-z_$][\w$]*$/.test(n) && /[a-z0-9][A-Z]|_|^[A-Z][a-z0-9]/.test(n);

/** Non-test, non-target symbols with intent prose that the targets declare in @calls, or name in their intent prose
 *  (word-boundary match on the full name or a distinctive last segment), limited to the targets' files and their imports. */
export function collaboratorsOf(index, ids, files) {
  const S = index.symbols;
  const scope = new Set(files);
  for (const f of files) for (const i of index.files[f]?.imports || []) if (i.resolved) scope.add(i.resolved);
  const out = new Set();
  for (const id of ids) for (const r of S[id].tags?.calls || []) { const c = resolveRef(index, r, S[id].file)?.id; if (c) out.add(c); }
  const prose = ids.map((id) => S[id].intent || "").join("\n");
  if (prose) {
    for (const s of Object.values(S)) {
      if (s.test || out.has(s.id) || !scope.has(s.file)) continue;
      const names = [s.name.includes(".") && s.name, s.name.split(".").at(-1)].filter((n) => n && (n.includes(".") || distinctive(n)));
      if (names.some((n) => new RegExp(`(?<![\\w$.])${reEsc(n)}(?![\\w$])`).test(prose))) out.add(s.id);
    }
  }
  return [...out].filter((id) => S[id] && !ids.includes(id) && !S[id].test && S[id].intent).sort();
}

function relImport(fromFile, srcFile) {
  if (srcFile.endsWith(".py")) return srcFile.replace(/\.py$/, "").replace(/\/__init__$/, "").replace(/\//g, ".");
  let r = posix.relative(posix.dirname(fromFile), srcFile);
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}
