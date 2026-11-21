// Brief files (0.14): the interview of /hitl:plan and /hitl:design happens in a markdown file the user edits,
// `.hitl/changes/<id>/plan-brief.md` and `design-brief.md` (templates: shared/templates/{plan,design}-brief.md;
// format and answer grammar: shared/interview.md §4–§6). This module parses one brief deterministically and tolerantly:
// unknown lines are ignored, a missing header falls back to the file name and the round headings.
import { join } from "node:path";
import { readText } from "./fsutil.mjs";

export const BRIEF_SCHEMA = "hitl.brief/1";
export const BRIEF_KINDS = ["plan", "design", "amend", "tasks"];
/** 0.21: the tasks brief of a quick file `.hitl/tasks/quick-<slug>.md` is `quick-<slug>-brief.md` next to it. */
export const QUICK_BRIEF_RE = /^(quick-.+)-brief\.md$/;
/** 0.17: one amend brief per amendment `<KEY>-A<n>` (shared/amend-spec.md): `amend-<KEY>-A<n>-brief.md`. */
export const AMEND_FILE_RE = /^amend-([A-Z]{2,5}-A\d+)-brief\.md$/;
/** File name of a brief kind: plan-brief.md | design-brief.md | tasks-brief.md | amend-<KEY>-A<n>-brief.md (needs the amendment id). */
export const briefFileName = (kind, amend = null) => (kind === "amend" ? `amend-${amend || "<KEY>-A<n>"}-brief.md` : `${kind}-brief.md`);
/** The skill that processes a brief kind (an amend brief: the skill it was opened from, header `skill:`; plan by default). */
export const briefSkill = (kind, b = null) => (kind === "tasks" ? "/hitl:tasks" : kind === "design" || (kind === "amend" && b?.skill === "design") ? "/hitl:design" : "/hitl:plan");

// ---------------------------------------------------------------- answer grammar (English + Vietnamese)
const ACCEPT = new Set(["y", "yes", "ok", "okay", "accept", "agree", "được", "đồng ý", "ừ", "ừ đúng", "có", "chốt"]);
const UNKNOWN = new Set(["?", "??", "don't know", "dont know", "do not know", "idk", "không biết", "chưa biết", "ko biết"]);
const DONE = new Set(["done", "xong"]);
const DECLINE = new Set(["n", "no", "không", "ko"]);
const norm = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").replace(/^[.!]+|[.!]+$/g, "").trim();

/**
 * Kind of an answer: "empty" | "accept" (take the `_Rec:_` recommendation) | "unknown" (carry with a recommendation) |
 * "done" (stop asking) | "deep" (`deep` or `deep <ID|topic>`) | "decline" (a bare n/no/không/ko: counted only — the
 * skill reads the meaning, interview.md §6) | "text" (an answer, a question or a doubt: the skill reads it;
 * interview.md §6 decides answer vs discussion).
 */
export function answerKind(text) {
  const raw = String(text ?? "").normalize("NFC").trim();
  if (!raw) return "empty";
  if (/^\?+$/.test(raw)) return "unknown";
  const t = norm(raw);
  if (!t) return "empty";
  if (ACCEPT.has(t)) return "accept";
  if (UNKNOWN.has(t)) return "unknown";
  if (DONE.has(t)) return "done";
  if (DECLINE.has(t)) return "decline";
  if (/^deep(?:\s|$)/.test(t)) return "deep";
  return "text";
}

// ---------------------------------------------------------------- parser
const Q_HEAD = /^###\s+Q(\d+)\b\s*(.*)$/;
const ANSWER = /^ {0,3}>\s?(.*)$/;
// 0.15.0: Claude's marks are italic word labels (`_Rec:_`, `_Disc:_`, `_Hot_`, `_To <P>:_`, `_Needs spec:_`); the
// pre-0.15 icon forms (`💡 Recommended:`, `💬`, `🔥`, `📥 For <P>`, `💡 Needs spec`) are still read in existing briefs.
const DISC = /^\s*(?:💬|_Disc:_)/;
const HOT = /🔥|_Hot_/;
const MARKER = /^\s*(?:→|💬|💡|_Disc:_|_Rec:_|_Assumed:_|_Parent:_|_Overlap\?_|_Parked:_|_Forced:_|_e\.g\.|_z\.?b\.|#|accept all\b)/i;
const ACCEPT_ALL = /^\s*(?:\*\*)?accept all\b/i;
const RECOMMEND = /^\s*(?:💡\s*(?:\*\*)?(?:My\s+)?Recommend(?:ed|ation)(?:\*\*)?\s*:?|_Rec:_)\s*(.*)$/i;
/** `### Notes — …`: the free-text block that ends every round and the Close section. */
const NOTES_HEAD = /^###\s+Notes\b/i;

function metaOf(line) {
  const out = {};
  for (const part of line.replace(/^>\s*/, "").split("|")) {
    const m = /^\s*([a-z][\w-]*)\s*:\s*(.*?)\s*$/i.exec(part);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

/** 0.14.1: question kinds whose answer acts outside the brief, so the accept-all line never answers them (heading
 *  text `(needs its own Y)`): `Q0` renames the change id/key, `_To <P>:_` writes a note into another change,
 *  `_Needs spec:_` applies a spec delta + Impact (pre-0.15 forms `📥 For <P>`, `💡 Needs spec` too). Returns the kind,
 *  or null. */
export function ownYKind(n, title) {
  if (Number(n) === 0) return "rename";
  // 0.21 tasks brief: a test-plan override of one AC (`none!:`/`manual!:` row) and the approval of the task set
  // (0.21.1: the override is a bullet `- Override: <AC> …` under `## Needs your eye`, the approval `## Approve?`)
  if (/_Override:_|^\s*Override:/.test(title)) return "override";
  if (/^\s*Approve(?:\?|\s+the task set\b)/i.test(title)) return "approve";
  if (/📥\s*For\b|_To [^_]+:_/i.test(title)) return "note";
  if (/💡\s*Needs spec\b|_Needs spec:_/i.test(title)) return "spec";
  if (/\(needs its own Y\)/i.test(title)) return "other";
  return null;
}
const OWN_Y = /\s*\(needs its own Y\)/i;

const newQuestion = (n, rest, round, line) => {
  let t = rest.trim();
  let tag = null;
  const tm = /^\[([A-Z])\]\s*/.exec(t);
  if (tm) { tag = tm[1]; t = t.slice(tm[0].length); }
  const hot = HOT.test(t);
  t = t.replace(/(?:🔥|_Hot_)\s*/g, "").trim();
  const ownY = ownYKind(n, t);
  t = t.replace(OWN_Y, "").trim();
  return { id: `Q${n}`, n: Number(n), round, tag, hot, ownY, title: t, line, body: [], hint: null, recommended: null,
    answerLines: [], answer: "", kind: "empty", answered: false, acceptedByRound: false, recorded: [], carried: null,
    parked: false, dropped: false, discussed: false, settled: false, pending: false };
};

/** A Notes block: parsed with the question machinery (answer lines, marks, `_Disc:_`), kept apart from the questions. */
const newNotes = (round, line) => ({ ...newQuestion(0, "Notes", round, line), id: "notes", n: null, ownY: null });

/**
 * parseBrief(text, file?) -> {schema, file, kind, change, key, status, round, updated, title, description,
 *   rounds:[{n, done, acceptAllLine, acceptAll, acceptAllAnswer, coverage, hot, line}], questions:[…], close, openQuestions, counts, items}.
 * A question: {id:"Q8", n, round, tag, hot, ownY, title, hint, recommended, answer, kind, answered, acceptedByRound,
 *   recorded[], carried (round number or null), parked, dropped, discussed, settled, pending}.
 *   ownY: "rename" (Q0) | "note" (`_To <P>:_`) | "spec" (`_Needs spec:_`) | "other" (`(needs its own Y)` in the heading) |
 *   null — such a question is never answered by the round's accept-all line (acceptedByRound stays false).
 *   dropped: the mark `→ dropped (scope changed)` (the scope changed and the question no longer applies).
 *   0.21.1 tasks brief: `## Approve?` → id "Approve" (ownY approve); a `## Needs your eye` bullet with a `>` line →
 *   id "E<k>", or "Override <AC>" (ownY override) for `- Override: <AC> …`; their round is the header's `round:`.
 * Notes (every round's `round.notes`, and `close.notes`): {id:"notes", round, text, answered (non-empty), recorded[],
 *   carried, parked, discussed, marked (a → line follows), pending (non-empty and not marked: the next run processes it)}.
 */
export function parseBrief(text, file = null) {
  // HTML comments (template guidance) are not content: blank them, keeping line numbers
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, "")).split("\n");
  const out = { schema: BRIEF_SCHEMA, file, kind: null, change: null, key: null, status: null, round: 0, updated: null, title: null,
    description: "", rounds: [], questions: [], close: null, openQuestions: [], counts: null, items: [] };
  const fromFile = /(?:^|\/)(plan|design|tasks)-brief\.md$/.exec(file || "");
  const quickFile = /(?:^|\/)tasks\//.test(file || "") ? QUICK_BRIEF_RE.exec(String(file || "").split("/").pop() || "") : null;
  const amendFile = AMEND_FILE_RE.exec(String(file || "").split("/").pop() || "");
  const list = (v) => String(v || "").split(/[,\s]+/).map((x) => x.trim()).filter((x) => x && x !== "none" && x !== "—");
  let section = "head"; let round = null; let q = null; let mode = null; // mode: body | answer | discussion | after
  const desc = [];
  let acceptTarget = null; // round whose accept-all answer continues on `>` lines
  let closeQ = null;
  const endQuestion = () => { q = null; mode = null; };
  // 0.21.1 tasks brief layout: no `## Round n` headings; `## Needs your eye` (bullets, a `>` line under the ones that
  // ask), `## Notes`, `## Approve? (needs its own Y)` belong to the round of the header's `round:` (one virtual round)
  const tasksLayout = () => out.kind === "tasks" || fromFile?.[1] === "tasks" || !!quickFile;
  let vround = null;
  const virtualRound = (ln) => {
    if (!vround) {
      vround = { n: out.round || 1, done: false, notes: null, acceptAllLine: false, acceptAll: false, acceptAllAnswer: null, coverage: null, hot: [], line: ln, list: true };
      out.rounds.push(vround);
    }
    return vround;
  };
  let eyeN = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; const ln = i + 1;
    if (/^#\s/.test(line) && out.title === null) {
      out.title = line.replace(/^#\s+/, "").trim();
      const k = /^(plan|design|amend|tasks)\s+brief\b/i.exec(out.title);
      if (k) out.kind = k[1].toLowerCase();
      const c = /[—-]\s*([a-z]+-[a-z0-9-]+)\s*(?:·.*)?$/.exec(out.title);
      if (c) out.change = c[1];
      continue;
    }
    if (section === "head" && /^>\s*\w[\w-]*\s*:/.test(line)) {
      const m = metaOf(line);
      if (m.change) out.change = m.change;
      if (m.key) out.key = m.key;
      if (m.kind) out.kind = m.kind.toLowerCase();
      // 0.17 amend brief meta: the amendment id, its source notes, the ids it changes, the transition answer, the skill
      if (m.amend) out.amend = m.amend;
      if (m.from !== undefined) out.from = list(m.from).filter((x) => /^N-\d+$/.test(x));
      if (m.refs !== undefined) out.refs = list(m.refs);
      if (m.transition !== undefined) out.transition = /^(?:—|-|none|\?)?$/.test(m.transition.trim()) ? null : m.transition.trim().toLowerCase();
      if (m.skill) out.skill = m.skill.trim().toLowerCase();
      // 0.21 tasks brief: a quick file's brief names its slug (`quick: <slug>`), not a change; `set:` = the set hash
      if (m.quick) out.quick = { slug: m.quick.trim(), key: null };
      if (m.set !== undefined) out.set = /^(?:—|-|none)?$/.test(m.set.trim()) ? null : m.set.trim();
      if (m.status) out.status = m.status.toLowerCase();
      if (m.round && /^\d+$/.test(m.round)) out.round = Number(m.round);
      if (m.updated) out.updated = m.updated;
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      endQuestion(); acceptTarget = null; closeQ = null;
      const head = h2[1].trim();
      const rm = /^Round\s+(\d+)\b(.*)$/i.exec(head);
      if (/^Description\b/i.test(head)) { section = "description"; round = null; }
      else if (rm) {
        section = "round";
        const rest = rm[2];
        const cov = /Coverage\s*:\s*([^(]*)/i.exec(rest);
        const hot = /\((?:🔥|_Hot_)\s*([^)]*)\)/.exec(rest);
        round = { n: Number(rm[1]), done: /^\s*✅/.test(rest), notes: null, acceptAllLine: false, acceptAll: false, acceptAllAnswer: null,
          coverage: cov ? cov[1].trim().replace(/\s+$/, "") || null : null, hot: hot ? hot[1].split(/[,·]/).map((s) => s.trim()).filter(Boolean) : [], line: ln };
        if (out.rounds.some((r) => r.n === round.n)) out.items.push({ level: "warn", code: "BRIEF_ROUND_DUP", line: ln, message: `Round ${round.n} appears twice` });
        out.rounds.push(round);
      } else if (/^Close\b/i.test(head)) { section = "close"; round = null; out.close = { line: ln, question: null, answer: "", kind: "empty", items: [], gaps: [], resolved: null, notes: null }; }
      else if (/^Open questions\b/i.test(head)) { section = "open"; round = null; }
      else if (/^Unchanged\b/i.test(head)) { section = "unchanged"; round = null; out.unchanged = out.unchanged || []; }
      else if (tasksLayout() && /^(?:Needs your eye|Notes|Approve)\b/i.test(head)) {
        round = virtualRound(ln);
        if (/^Needs your eye\b/i.test(head)) section = "eye";
        else if (/^Notes\b/i.test(head)) {
          section = "round"; q = newNotes(round.n, ln); mode = "body";
          if (round.notes) out.items.push({ level: "warn", code: "BRIEF_NOTES_DUP", line: ln, message: "two Notes sections" });
          round.notes = q;
        } else { section = "round"; q = { ...newQuestion(1, head, round.n, ln), id: "Approve", n: null }; mode = "body"; out.questions.push(q); }
      }
      else { section = "other"; round = null; }
      continue;
    }
    if (section === "description") { desc.push(line); continue; }
    // `- <id or test title> — <reason>` (a title may sit in backticks)
    if (section === "unchanged") { const m = /^\s*-\s+(?:`([^`]+)`|(.+?))(?:\s+[—–]\s+(.*))?\s*$/.exec(line); if (m) out.unchanged.push({ id: (m[1] ?? m[2]).trim(), reason: (m[3] || "").trim() }); continue; }
    if (section === "open") { const m = /^\s*-\s*(?:\[[ x]\]\s*)?(Q\d+)\b\s*(.*)$/.exec(line); if (m) out.openQuestions.push({ id: m[1], text: m[2].trim() }); continue; }
    if (section === "close") {
      // `### <question>` items (overlap findings `O1…`, then the approve / gap question last), each with `>` lines;
      // `### Notes` is the free-text block, parsed like a round's Notes
      const c = out.close;
      if (NOTES_HEAD.test(line)) { closeQ = null; q = newNotes(null, ln); mode = "body"; c.notes = q; continue; }
      if (q) { if (/^###\s/.test(line)) endQuestion(); else { questionLine(line); continue; } }
      if (/^###\s+/.test(line)) { closeQ = { title: line.replace(/^###\s+/, "").trim(), answerLines: [], resolved: null, line: ln }; c.items.push(closeQ); continue; }
      const a = ANSWER.exec(line);
      if (a && closeQ && /^\s*→/.test(a[1])) { closeQ.resolved = a[1].replace(/^\s*→\s*/, "").trim(); continue; } // formatter-mangled mark
      if (a && closeQ) { closeQ.answerLines.push(a[1]); continue; }
      const r = /^\s*→\s*(.*)$/.exec(line);
      if (r && closeQ) { closeQ.resolved = r[1].trim(); continue; }
      if (closeQ && closeQ.answerLines.length && line.trim() && !MARKER.test(line)) { closeQ.answerLines.push(line.trim()); continue; }
      if (!closeQ && /^\s*-\s+/.test(line)) c.gaps.push(line.replace(/^\s*-\s+/, "").trim());
      continue;
    }
    if (section === "eye") {
      // `- <text>` starts an item; it is a question when a `>` line follows it or it needs its own Y (an override)
      const b = /^[-*]\s+(.*)$/.exec(line);
      if (b) {
        q = { ...newQuestion(1, b[1], round.n, ln), n: null, eye: true }; mode = "body";
        const ac = q.ownY === "override" ? /Override:\s*`?([A-Z]{2,5}-T\d+\.AC\d+)/.exec(q.title)?.[1] : null;
        q.id = ac ? `Override ${ac}` : `E${++eyeN}`;
        out.questions.push(q);
        continue;
      }
      if (q) questionLine(line);
      continue;
    }
    if (section !== "round") continue;
    if (NOTES_HEAD.test(line)) {
      acceptTarget = null; q = newNotes(round.n, ln); mode = "body";
      if (round.notes) out.items.push({ level: "warn", code: "BRIEF_NOTES_DUP", line: ln, message: `Round ${round.n} has two Notes blocks` });
      round.notes = q;
      continue;
    }
    const qh = Q_HEAD.exec(line);
    if (qh) {
      acceptTarget = null;
      q = newQuestion(qh[1], qh[2], round.n, ln); mode = "body";
      if (out.questions.some((x) => x.round === round.n && x.n === q.n)) out.items.push({ level: "warn", code: "BRIEF_Q_DUP", line: ln, message: `Q${q.n} appears twice in Round ${round.n}` });
      out.questions.push(q);
      continue;
    }
    if (/^###\s/.test(line)) { endQuestion(); continue; }
    if (ACCEPT_ALL.test(line)) {
      endQuestion();
      const gt = line.lastIndexOf(">");
      const tail = gt >= 0 ? line.slice(gt + 1).trim() : "";
      round.acceptAllLine = true; round.acceptAllAnswer = tail || null; acceptTarget = round;
      continue;
    }
    if (acceptTarget && !q) {
      const a = ANSWER.exec(line);
      if (a) { const v = a[1].trim(); if (v) acceptTarget.acceptAllAnswer = [acceptTarget.acceptAllAnswer, v].filter(Boolean).join(" "); continue; }
      if (line.trim()) acceptTarget = null;
      continue;
    }
    if (!q) continue;
    questionLine(line);
  }
  /** One line inside a question or a Notes block: answer, mark, `_Disc:_`, `_Rec:_`, lazy continuation, body, hint. */
  function questionLine(line) {
    const a = ANSWER.exec(line);
    if (a) {
      q.asks = true;
      // 0.14.1: a mark or `_Disc:_` line written right under an answer is a lazy continuation for markdown; a formatter
      // (prettier) pulls it into the blockquote (`> → recorded: …`, `> _Disc:_ …`, and every discussion line after it).
      // Claude's, not the answer.
      const inner = a[1];
      if (/^\s*→/.test(inner) || DISC.test(inner)) { questionLine(inner); if (mode === "discussion") mode = "qdiscussion"; return; }
      if (mode === "qdiscussion") {
        const rq = RECOMMEND.exec(inner);
        if (rq) q.recommended = rq[1].trim() || q.recommended || "";
        return;
      }
      q.answerLines.push(inner); mode = "answer"; return;
    }
    if (!line.trim()) { if (mode === "answer" || mode === "qdiscussion") mode = "after"; return; } // a blank line ends the answer
    const arrow = /^\s*→\s*(.*)$/.exec(line);
    if (arrow) {
      const t = arrow[1].trim(); mode = "after";
      const rec = /^recorded\s*:\s*(.*)$/i.exec(t);
      const car = /^carried\s+to\s+round\s+(\d+)/i.exec(t);
      if (rec) q.recorded.push(...rec[1].split(/,\s*/).map((s) => s.trim()).filter(Boolean));
      else if (car) q.carried = Number(car[1]);
      else if (/^parked\b/i.test(t)) q.parked = true;
      else if (/^dropped\b/i.test(t)) q.dropped = true;
      else q.recorded.push(t);
      return;
    }
    if (DISC.test(line)) { q.discussed = true; mode = "discussion"; return; }
    const rm = RECOMMEND.exec(line);
    if (rm) { q.recommended = rm[1].trim() || q.recommended || ""; return; }
    // tolerated, not documented: text right under an answer line (no blank line) continues it, as in markdown
    if (mode === "answer" && !MARKER.test(line)) { q.answerLines.push(line.trim()); return; }
    if (mode === "body") {
      const h = /^\s*_(e\.g\.[^]*?)_\s*$/.exec(line);
      if (h) q.hint = h[1].trim(); else if (line.trim()) q.body.push(line.trim());
    }
  }
  out.description = desc.join("\n").trim();
  if (!out.kind && fromFile) out.kind = fromFile[1];
  if (amendFile) { out.kind = out.kind || "amend"; out.amend = out.amend || amendFile[1]; }
  if (quickFile && !out.quick) out.quick = { slug: quickFile[1].replace(/^quick-/, ""), key: null };
  if (out.quick) { out.kind = out.kind || "tasks"; out.quick.key = out.key; out.change = null; }
  if (out.kind === "tasks") { out.set = out.set ?? null; out.quick = out.quick || null; }
  if (out.kind === "amend") { out.amend = out.amend || null; out.from = out.from || []; out.refs = out.refs || []; out.transition = out.transition ?? null; out.skill = out.skill || "plan"; out.unchanged = out.unchanged || []; }
  if (!out.round && out.rounds.length) out.round = Math.max(...out.rounds.map((r) => r.n));
  if (!out.status) out.status = out.close ? "closing" : "open";
  if (vround) vround.done = out.status === "done";
  // a `## Needs your eye` bullet without a `>` line is information, not a question
  out.questions = out.questions.filter((x) => !x.eye || x.ownY || x.asks);
  if (!out.title) out.items.push({ level: "warn", code: "BRIEF_NO_HEADER", line: 1, message: "no `# Plan brief — <id>` / `# Design brief — <id>` / `# Tasks brief — <id>` / `# Amend brief — <id> · <KEY>-A<n>` title" });
  for (const r of out.rounds) r.acceptAll = answerKind(r.acceptAllAnswer) === "accept";
  const roundOf = new Map(out.rounds.map((r) => [r.n, r]));
  for (const x of out.questions) {
    x.answer = x.answerLines.map((s) => s.replace(/\s+$/, "")).join("\n").trim();
    delete x.answerLines;
    x.body = x.body.join("\n");
    x.kind = answerKind(x.answer);
    const r = roundOf.get(x.round);
    x.acceptedByRound = x.kind === "empty" && !!r?.acceptAll && !!x.recommended && !x.ownY;
    x.answered = x.kind !== "empty" || x.acceptedByRound;
    x.settled = x.recorded.length > 0 || x.carried !== null || x.parked || x.dropped;
    x.pending = !x.settled && !r?.done;
  }
  if (out.close) {
    for (const it of out.close.items) {
      it.answer = it.answerLines.join("\n").trim();
      delete it.answerLines;
      const t = norm(it.answer);
      it.kind = /^force\b/.test(t) ? "force" : /^(round|one more round|thêm vòng)\b/.test(t) ? "round" : answerKind(it.answer);
    }
    const last = out.close.items.at(-1) || null;
    out.close.question = last?.title ?? null; out.close.answer = last?.answer ?? ""; out.close.kind = last?.kind ?? "empty";
    out.close.resolved = last?.resolved ?? null;
  }
  // Notes: free text; a non-empty block without a → mark is processed by the next run (in any round), never twice
  const finishNotes = (x) => {
    if (!x) return null;
    const text = x.answerLines.map((l) => l.replace(/\s+$/, "")).join("\n").trim();
    const marked = x.recorded.length > 0 || x.carried !== null || x.parked || x.dropped;
    return { id: "notes", round: x.round, line: x.line, text, kind: answerKind(text), answered: !!text, recorded: x.recorded,
      carried: x.carried, parked: x.parked, discussed: x.discussed, marked, pending: !!text && !marked };
  };
  for (const r of out.rounds) r.notes = finishNotes(r.notes);
  if (out.close) out.close.notes = finishNotes(out.close.notes);
  const notesPending = [...out.rounds.map((r) => r.notes), out.close?.notes].filter((n) => n?.pending).length;
  const pending = out.questions.filter((x) => x.pending);
  const closeOpen = !!out.close && !out.close.resolved && out.status !== "done";
  const closeItems = closeOpen ? out.close.items.filter((it) => !it.resolved) : [];
  // Notes count as answers (a round with only Notes filled is processed), never as unanswered questions
  out.counts = { questions: out.questions.length, pending: pending.length + closeItems.length + notesPending,
    answered: pending.filter((x) => x.answered).length + closeItems.filter((it) => it.kind !== "empty").length + notesPending,
    unanswered: pending.filter((x) => !x.answered).length + closeItems.filter((it) => it.kind === "empty").length, notes: notesPending };
  return out;
}

/** The short form `hitl-index change|status --json` carries: {kind, file, status, round, open, unanswered, pending, notes}
 *  (`notes` = Notes blocks with unprocessed text; they count in `pending`, not in `unanswered`). */
export function briefSummary(b) {
  if (!b) return null;
  const ap = b.kind === "tasks" ? [...b.questions].reverse().find((q) => q.ownY === "approve") : null;
  return { kind: b.kind, file: b.file, status: b.status, round: b.round, open: b.status !== "done",
    unanswered: b.counts.unanswered, pending: b.counts.pending, notes: b.counts.notes,
    ...(b.kind === "amend" ? { amend: b.amend, skill: b.skill, refs: b.refs, from: b.from, transition: b.transition } : {}),
    ...(b.kind === "tasks" ? { set: b.set, ...(b.quick ? { quick: b.quick } : {}), approve: ap ? { id: ap.id, round: ap.round, answer: ap.kind, settled: ap.settled } : null } : {}) };
}

/** Parsed brief of a change folder (root-relative dir), or null when the file does not exist. */
export async function readBrief(root, changeDir, kind, amend = null) {
  const rel = `${changeDir}/${briefFileName(kind, amend)}`;
  const text = await readText(join(root, rel), null);
  return text === null ? null : parseBrief(text, rel);
}

/** Every amend brief of a change folder (0.17), oldest amendment first. */
export async function readAmendBriefs(root, changeDir) {
  const { promises: fs } = await import("node:fs");
  const names = (await fs.readdir(join(root, changeDir)).catch(() => [])).filter((n) => AMEND_FILE_RE.test(n));
  const num = (n) => Number(/-A(\d+)-brief/.exec(n)?.[1] ?? 0);
  const out = [];
  for (const n of names.sort((a, b) => num(a) - num(b))) {
    const text = await readText(join(root, changeDir, n), null);
    if (text !== null) out.push(parseBrief(text, `${changeDir}/${n}`));
  }
  return out;
}

/** The amend brief still open (header status open or closing), or null. One per change (shared/amend-spec.md). */
export const openAmendBrief = (amends) => (amends || []).find((b) => b.status !== "done") || null;

/** The briefs of a change folder: {plan, design, tasks, amend (the open amend brief, else null), amends (all)}. */
export async function readBriefs(root, changeDir) {
  const amends = await readAmendBriefs(root, changeDir);
  return { plan: await readBrief(root, changeDir, "plan"), design: await readBrief(root, changeDir, "design"), tasks: await readBrief(root, changeDir, "tasks"), amend: openAmendBrief(amends), amends };
}

/** The brief that belongs to the change's phase: an open amend brief first (0.17), then an open tasks brief (0.21: an
 *  update round in any phase); spec → plan; design → design (else plan); tasks → tasks (else design, plan); later →
 *  design, else plan. */
export function pickBrief(phase, { plan, design, tasks = null, amend = null }) {
  if (amend && amend.status !== "done") return amend;
  if (tasks && tasks.status !== "done") return tasks;
  if (phase === "spec") return plan || null;
  if (phase === "design") return design || plan || null;
  if (phase === "tasks") return tasks || design || plan || null;
  return design || plan || null;
}

/**
 * Next step for a change whose phase brief waits for the user's answers, else null (0.21: an open tasks brief →
 * `answer <file>, then /hitl:tasks <id|KEY>`, or the command alone once every question has an answer):
 * `answer .hitl/changes/<id>/<kind>-brief.md, then /hitl:<plan|design> <id>`. An open amend brief (0.17) in any phase:
 * `answer <file>, then /hitl:<skill> <id> amend`, or the command alone once every question has an answer.
 */
export function briefNext(changeId, phase, brief) {
  if (brief?.kind === "amend" && brief.open) {
    const cmd = `${briefSkill("amend", brief)} ${changeId} amend`;
    return brief.unanswered > 0 ? `answer ${brief.file}, then ${cmd}` : cmd;
  }
  // 0.21: an open tasks brief (the first set in phase tasks, or an update round in any phase)
  if (brief?.kind === "tasks" && brief.open) {
    const cmd = `/hitl:tasks ${changeId}`;
    return brief.unanswered > 0 ? `answer ${brief.file}, then ${cmd}` : cmd;
  }
  if (!brief || !brief.open || !(brief.unanswered > 0)) return null;
  const want = phase === "spec" ? "plan" : phase === "design" ? "design" : null;
  if (!want || brief.kind !== want) return null;
  return `answer ${brief.file}, then ${briefSkill(brief.kind)} ${changeId}`;
}
