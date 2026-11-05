// Impact of an amendment on locked work (0.9, amend preview + `note apply`). Pure.
// Each changed ref gets a class (confirmed by the human at the amend Apply gate):
//   wording     → reopens nothing
//   behaviour   → locked tests whose `ac` maps to the changed scenario/requirement (per AC)
//   contract    → skeleton symbols named through @dec / the symbol ref / covers of the hit ACs' tests, plus their tests
//   scenario    → a new scenario on a requirement a task covers: a new AC + tests reopen on tasks with locked work
//   requirement → a new requirement: nothing reopens; next /hitl:tasks <id> update
import { lockedTasks, taskSymbolIds } from "./lock.mjs";
import { IMPACT_CLASSES, refKind, specRefsTouch } from "./notes.mjs";
import { parseId } from "./specids.mjs";

/** Parse `--impact "ACC-R3.S2=behaviour,D-2=contract"` → {entries:[{ref, class}], errors:[]}. */
export function parseImpact(s) {
  const entries = [], errors = [];
  for (const part of String(s || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^=\s]+)\s*=\s*([a-z]+)$/.exec(part);
    if (!m) { errors.push(`--impact item "${part}" is not <ref>=<class>`); continue; }
    if (!IMPACT_CLASSES.includes(m[2])) { errors.push(`--impact ${m[1]}: class must be one of ${IMPACT_CLASSES.join("|")}`); continue; }
    if (entries.some((e) => e.ref === m[1])) { errors.push(`--impact ${m[1]} given twice`); continue; }
    entries.push({ ref: m[1], class: m[2] });
  }
  return { entries, errors };
}

/** Class/ref fit: behaviour needs a spec, AC or task ref; scenario a scenario or requirement id; requirement a requirement id. */
export function classErrors(entries) {
  const out = [];
  for (const { ref, class: c } of entries) {
    const k = refKind(ref), p = parseId(ref);
    if (c === "behaviour" && !["spec", "ac", "task"].includes(k)) out.push(`${ref}=behaviour: behaviour needs a scenario, requirement, AC or task ref (use contract for a decision or a symbol)`);
    if (c === "scenario" && !(p && (p.kind === "S" || p.kind === "R"))) out.push(`${ref}=scenario: needs the new scenario id (or its requirement id)`);
    if (c === "requirement" && !(p && ["R", "BR", "UC"].includes(p.kind))) out.push(`${ref}=requirement: needs the new requirement id`);
  }
  return out;
}

/** True when task T has locked work: an approved skeleton, locked tests or a done record. */
export function hasLockedWork(lock, T) {
  const lt = lock?.tasks?.[T];
  return !!(lt?.skeletonAt || lt?.testsAt || lt?.doneAt || Object.values(lock?.tests || {}).some((t) => t.task === T && t.stage === "locked"));
}

const ownsTest = (t, T) => t.task === T || (t.ac || []).some((a) => a.startsWith(T + ".AC"));

/**
 * computeImpact({entries, tasks, index, lock, resolve?, statusOf?}) -> {tasks:[{task, status, locked, reopen, acs, tests, symbols, newAc, via}],
 * counts:{tests, skeletons, tasks}, suggestFollowUp, tasksUpdate, recheck}. `tasks` = the change's active tasks.
 * `recheck` = a recheck note is needed: some hit task has locked work (even when nothing reopens).
 */
export function computeImpact({ entries, tasks, index, lock, resolve, statusOf = () => null, symbolOf = {} }) {
  const out = [];
  let tasksUpdate = false;
  for (const t of tasks) {
    const T = t.id;
    const acsAll = t.acs || [];
    const lockedSyms = new Set(Object.entries(lock?.symbols || {}).filter(([, l]) => lockedTasks(l).includes(T)).map(([id]) => id));
    const allSyms = new Set([...taskSymbolIds(index, T, t), ...lockedSyms]);
    const testsOf = (pred) => Object.entries(lock?.tests || {}).filter(([, x]) => x.stage === "locked" && ownsTest(x, T) && pred(x)).map(([id]) => id);
    const acsFor = (ref) => {
      const k = refKind(ref);
      if (k === "task") return ref === T ? acsAll.map((a) => a.id) : [];
      if (k === "ac") return acsAll.some((a) => a.id === ref) ? [ref] : [];
      if (k === "spec") return acsAll.filter((a) => (a.reqs || []).some((r) => specRefsTouch(ref, r))).map((a) => a.id);
      return [];
    };
    const r = { task: T, status: statusOf(T), locked: hasLockedWork(lock, T), reopen: null, acs: new Set(), tests: new Set(), symbols: new Set(), newAc: new Set(), via: [] };
    for (const { ref, class: c } of entries) {
      const k = refKind(ref);
      let hit = false;
      if (c === "requirement") { tasksUpdate = true; continue; }
      if (c === "scenario") {
        const p = parseId(ref);
        const req = p.kind === "S" ? p.req : ref;
        if (acsAll.some((a) => (a.reqs || []).some((x) => specRefsTouch(req, x)))) {
          hit = true;
          r.newAc.add(ref);
          for (const a of acsAll) if ((a.reqs || []).includes(ref)) r.acs.add(a.id); // the new AC, once /hitl:tasks update added it
        }
        tasksUpdate = true;
      } else if (k === "decision") {
        const dec = [...allSyms].filter((id) => (index?.symbols?.[id]?.tags?.dec || []).includes(ref));
        const why = (t.decisions || []).includes(ref);
        hit = dec.length > 0 || why;
        if (hit && c === "contract") for (const id of (dec.length ? dec : [...lockedSyms])) if (lockedSyms.has(id)) r.symbols.add(id);
      } else if (k === "symbol") {
        const id = symbolOf[ref] || resolve?.(ref)?.id;
        hit = !!id && allSyms.has(id);
        if (hit && c === "contract" && lockedSyms.has(id)) r.symbols.add(id);
      } else {
        const acs = acsFor(ref);
        hit = acs.length > 0;
        if (hit && (c === "behaviour" || c === "contract")) for (const a of acs) r.acs.add(a);
        if (hit && c === "contract") for (const id of testsOf((x) => (x.ac || []).some((a) => acs.includes(a)))) for (const s of lock.tests[id].covers || []) if (lockedSyms.has(s)) r.symbols.add(s);
      }
      if (hit) r.via.push(ref);
    }
    if (!r.via.length) continue;
    for (const id of testsOf((x) => (x.ac || []).some((a) => r.acs.has(a)) || (x.covers || []).some((s) => r.symbols.has(s)))) r.tests.add(id);
    if (r.locked) r.reopen = r.symbols.size ? "skeleton" : r.tests.size || r.newAc.size ? "tests" : null;
    if (!r.locked) { r.tests.clear(); r.symbols.clear(); }
    out.push({ ...r, acs: [...r.acs].sort(), tests: [...r.tests].sort(), symbols: [...r.symbols].sort(), newAc: [...r.newAc].sort() });
  }
  const counts = { tests: out.reduce((n, x) => n + (x.reopen ? x.tests.length : 0), 0), skeletons: out.reduce((n, x) => n + (x.reopen === "skeleton" ? x.symbols.length : 0), 0),
    tasks: out.filter((x) => x.reopen).length };
  const suggestFollowUp = out.filter((x) => x.locked).length > 3 || entries.some((e) => e.class === "contract");
  return { tasks: out, counts, suggestFollowUp, tasksUpdate, recheck: out.some((x) => x.locked) };
}

/** One-line Impact summary, e.g. `reopens 2 tests in T-12, 0 skeletons · T-13 not locked yet`. */
export function impactLine(imp) {
  const parts = [];
  for (const x of imp.tasks) {
    if (!x.locked) parts.push(`${x.task} not locked yet: nothing to reopen`);
    else if (!x.reopen) parts.push(`${x.task} nothing to unlock`);
    else parts.push(`${x.task}: ${x.tests.length} test(s)${x.reopen === "skeleton" ? `, ${x.symbols.length} skeleton symbol(s)` : ""}${x.newAc.length ? `, new AC for ${x.newAc.join(", ")}` : ""}`);
  }
  const head = `reopens ${imp.counts.tests} test(s) in ${imp.counts.tasks} task(s), ${imp.counts.skeletons} skeleton symbol(s)`;
  return [head, ...parts].join(" · ") + (imp.tasksUpdate ? " · then /hitl:tasks update" : "");
}
