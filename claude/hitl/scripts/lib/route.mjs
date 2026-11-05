// /hitl:go (0.11): turn the work-router's verdict (`.hitl/.inbox/route.json`, schema hitl.route/1) into one action:
// ask (one question round), note (the 📌 gate of an active change) or invoke (a Skill call with args). Pure; the CLI
// (`hitl-index route`) adds the change list and reads/removes the file.

export const ROUTE_FILE = ".hitl/.inbox/route.json";
/** Routes in priority order (the router's rules 1–5). */
export const ROUTES = ["note", "amend", "update", "tdd", "quick", "plan"];
/** Risk reasons of `skills/tasks/references/slicing-and-risk.md` §4 plus `business-rule` (behaviour a BA cares about). */
export const RISK_TAGS = ["security", "concurrency", "public-api", "domain", "data", "core"];
const QUICK_BLOCK = new Set([...RISK_TAGS, "business-rule"]);
const TDD_BLOCK = new Set(["security", "concurrency", "data"]);
const NOTE_KINDS = ["spec", "design", "order"];
export const MAX_QUESTIONS = 3;

const str = (x) => (typeof x === "string" ? x.trim() : "");
/** `"security: hashes the reset token"` → `security`. */
export const signalTag = (s) => str(s).split(":")[0].trim().toLowerCase();

/** The command a route runs, for the 🧭 line: `/hitl:tasks quick`, `/hitl:plan feat-x amend`. */
function commandOf(skill, args, brief) {
  const head = args && brief && args.endsWith(brief) ? args.slice(0, args.length - brief.length).trim() : "";
  return `/${skill}${head ? ` ${head}` : ""}`;
}

/**
 * resolveRoute(verdict, changes, {final}) →
 * {ok, action: "ask"|"note"|"invoke", route, from, change, skill, args, line, gate, noteKind, refs, hints[], questions[], errors[]}
 * `changes` = `changeInfo` objects (active and archived). `final` = the second dispatch: questions are dropped.
 * Rules: a change route needs an active change (else plan); a draft spec is edited by /hitl:plan <id> (no note, no
 * amend); update needs a tasks file (else amend); quick and tdd are raised to plan on risk signals. Ties go heavier.
 */
export function resolveRoute(verdict, changes = [], { final = false } = {}) {
  const errors = [];
  const v = verdict && typeof verdict === "object" && !Array.isArray(verdict) ? verdict : null;
  if (!v) return { ok: false, errors: ["verdict is not a JSON object"] };
  const route0 = str(v.route).toLowerCase();
  const brief = str(v.brief);
  const reason = str(v.reason);
  const signals = Array.isArray(v.signals) ? v.signals.map(str).filter(Boolean) : [];
  // a negated signal ("security: no") is not a signal
  const tags = new Set(signals.filter((s) => !/^[^:]+:\s*(?:no|none|false|không)\b/i.test(s)).map(signalTag));
  const questions = (Array.isArray(v.questions) ? v.questions : []).map((q) => (typeof q === "string" ? q.trim() : str(q?.q ?? q?.text))).filter(Boolean);
  const hints = [];

  if (questions.length && !final) {
    if (questions.length > MAX_QUESTIONS) hints.push(`⚠️ the router asked ${questions.length} questions; only the first ${MAX_QUESTIONS} are kept`);
    return { ok: true, action: "ask", route: ROUTES.includes(route0) ? route0 : null, questions: questions.slice(0, MAX_QUESTIONS), hints, errors };
  }
  if (!ROUTES.includes(route0)) return { ok: false, errors: [`unknown route "${v.route ?? ""}" (want ${ROUTES.join("|")})`] };
  if (!brief) return { ok: false, errors: ["brief is empty"] };

  let route = route0; let from = null; let why = null;
  const raise = (to, because) => { if (!from) from = route; route = to; why = why ? `${why}; ${because}` : because; };
  let change = null;
  if (["note", "amend", "update"].includes(route)) {
    const id = str(v.change);
    const c = changes.find((x) => x.id === id && !x.archived);
    if (!c) raise("plan", id ? `${id} is not an active change` : "no change named");
    else change = c;
  }

  let skill = null; let args = null; let gate = null; let noteKind = null; let refs = [];
  if (change) {
    const draft = change.proposal !== "approved";
    if (draft) {
      // conventions "Changes stated in chat": a draft spec is edited as usual, never noted or amended
      skill = "hitl:plan"; args = `${change.id} ${brief}`;
      hints.push(`💡 ${change.id} spec is still a draft: /hitl:plan edits it directly`);
    } else if (route === "note") {
      noteKind = NOTE_KINDS.includes(str(v.kind)) ? str(v.kind) : "spec";
      refs = (Array.isArray(v.refs) ? v.refs : []).map(str).filter(Boolean);
      const title = change.title ? ` (${change.title})` : "";
      gate = `📌 Note for ${change.id}${title}, refs ${refs.length ? refs.join(", ") : "none"}? (Y/n)`;
      if (!refs.length) hints.push(`⚠️ no refs: find them with hitl-index spec show --change ${change.id} --json before the gate`);
    } else if (route === "update" && !change.tasksFile) {
      raise("amend", `${change.id} has no tasks yet`);
    }
    if (!draft && route === "amend") { skill = "hitl:plan"; args = `${change.id} amend ${brief}`; }
    if (!draft && route === "update") { skill = "hitl:tasks"; args = `${change.id} update ${brief}`; }
  }

  if (route === "quick") {
    const hit = [...tags].filter((t) => QUICK_BLOCK.has(t));
    if (hit.length) raise("plan", `quick tasks exclude ${hit.join(", ")}`);
  }
  if (route === "tdd") {
    const hit = [...tags].filter((t) => TDD_BLOCK.has(t));
    if (hit.length) raise("plan", `${hit.join(", ")} needs a spec and gates`);
  }
  if (route === "tdd") { skill = "hitl:tdd"; args = brief; }
  if (route === "quick") { skill = "hitl:tasks"; args = `quick ${brief}`; }
  if (route === "plan") {
    skill = "hitl:plan"; args = brief;
    if (tags.has("design-skip")) hints.push("💡 design will likely be skipped (no new dependency, stored data or public interface; ≤ 2 tasks)");
    if (tags.has("low-risk")) hints.push("💡 all tasks look low risk: ⚡ fast lane after /hitl:tasks");
  }
  if (from) hints.unshift(`💡 raised from ${from} to ${route}: ${why}`);

  const action = gate && !skill ? "note" : "invoke";
  const head = action === "note" ? `📌 note for ${change.id}` : commandOf(skill, args, brief);
  const line = `🧭 ${head} — ${reason || why || "best fit"}`;
  return { ok: true, action, route, from, change: change ? { id: change.id, title: change.title, phase: change.phase } : null,
    skill: action === "invoke" ? skill : null, args: action === "invoke" ? args : null, gate, noteKind, refs, line, brief, signals, hints, questions: [], errors };
}
