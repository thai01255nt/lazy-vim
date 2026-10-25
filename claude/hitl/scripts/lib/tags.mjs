// Reserved-tag grammar for intent docstrings (§E.3.5).
export const RESERVED = ["task", "impl", "status", "prio", "calls", "concurrency", "covers", "ac", "kind", "origin", "risk", "dec"];
const LISTS = new Set(["task", "calls", "covers", "ac", "dec"]);
const TASKID = /^T-\d+$/;
const ACID = /^T-\d+\.AC\d+$/;
const DECID = /^D-\d+$/;
const REF = /^(?:[\w./@-]+#)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const ENUMS = {
  impl: ["agent", "manual"],
  status: ["skeleton", "wip", "red", "green", "verified", "done"],
  concurrency: ["none", "shared-state", "async", "locks", "io"],
  kind: ["example", "property", "concurrency", "golden", "metamorphic"],
  origin: ["skeleton", "test-author", "human", "agent-posthoc"],
  risk: ["low", "high"],
};
const ITEM = { task: TASKID, ac: ACID, calls: REF, covers: REF, dec: DECID };

export const emptyTags = () => ({ task: [], impl: null, status: null, prio: null, calls: [], concurrency: null, covers: [], ac: [], kind: null, origin: null, risk: null, dec: [] });

const AT = /(^|\s)@([A-Za-z][\w-]*)/g;

/** Returns [[tag, value]…] when every @word on the line is reserved, else null (the line is prose). */
function tagLine(line) {
  const hits = [...line.matchAll(AT)];
  if (!hits.length || hits.some((m) => !RESERVED.includes(m[2]))) return null;
  return hits.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : line.length;
    return [m[2], line.slice(start, end).trim()];
  });
}

export function parseDoc(doc) {
  const tags = emptyTags();
  const errors = [];
  const extra = {};
  const prose = [];
  const bad = (tag, value, message) => {
    errors.push({ tag, value, message });
    (extra[tag] ||= []).push(value);
  };
  for (const raw of String(doc ?? "").split(/\r?\n/)) {
    const line = raw.replace(/^\s*\*(?!\/)\s?/, "").trim();
    const pairs = tagLine(line);
    if (!pairs) { prose.push(line); continue; }
    for (const [tag, value] of pairs) {
      if (!value) { bad(tag, value, `@${tag} needs a value`); continue; }
      if (LISTS.has(tag)) {
        for (const item of value.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (ITEM[tag].test(item)) { if (!tags[tag].includes(item)) tags[tag].push(item); }
          else bad(tag, item, `invalid @${tag} item "${item}"`);
        }
      } else if (tag === "prio") {
        if (/^\d+$/.test(value)) tags.prio = Number(value); else bad(tag, value, `invalid @prio "${value}"`);
      } else if (ENUMS[tag].includes(value)) tags[tag] = value;
      else bad(tag, value, `invalid @${tag} "${value}" (expected ${ENUMS[tag].join("|")})`);
    }
  }
  // collapse blank-line runs, trim leading/trailing blanks
  const lines = [];
  for (const l of prose) if (l || (lines.length && lines.at(-1))) lines.push(l);
  while (lines.length && !lines.at(-1)) lines.pop();
  if (Object.keys(extra).length) tags.extra = extra;
  return { prose: lines.join("\n"), tags, errors };
}

/** Replace only the @status value inside a doc comment / docstring source text. */
export function formatStatusEdit(docText, newStatus) {
  const rx = /(^|[\s*])@status([ \t]+)([A-Za-z-]+)/;
  if (rx.test(docText)) return docText.replace(rx, (_, pre, ws) => `${pre}@status${ws}${newStatus}`);
  const task = /(^|[\s*])(@task[ \t]+[^\n@]*?)([ \t]*)(?=\s@|\r?\n|$)/;
  return task.test(docText) ? docText.replace(task, (_, pre, t) => `${pre}${t} @status ${newStatus}`) : docText;
}

/** Canonical form of the intent-relevant tags (calls + concurrency) used in intentHash. */
export const canonicalIntentTags = (tags) => `calls:${[...(tags.calls || [])].sort().join(",")};concurrency:${tags.concurrency ?? ""}`;
