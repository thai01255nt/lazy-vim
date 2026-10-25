// Planning markdown parser (v2 §A.1.1): title, meta, ## Requirements (R-n), ## Decisions (D-n table), ## Changelog.
// Line-based like tasksmd.mjs; other sections are ignored.
import { promises as fs } from "node:fs";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { HITL_PREFIX } from "./paths.mjs";

const RX = {
  title: /^# (.+?) - Planning$/,
  status: /^> status: (draft|approved)\b/,
  tasks: /\| tasks: (\S+)/,
  updated: /\| updated: (\d{4}-\d{2}-\d{2})\b/,
  req: /^- (R-\d+)(?: \[(must|should|could)\])? (.+?)(?: \(status: (active|deferred|dropped|superseded by (R-\d+))\))?$/,
  changelog: /^- (\d{4}-\d{2}-\d{2}) (.+)$/,
  dstatus: /^(accepted|rejected|superseded by (D-\d+))$/,
  rid: /^R-\d+$/,
  did: /^D-\d+$/,
};
const SECTIONS = { "## Requirements": "requirements", "## Decisions": "decisions", "## Changelog": "changelog" };
const COLS = { id: "id", decision: "decision", why: "why", "cost if wrong": "cost", serves: "serves", status: "status" };

export const PLANNING_DIR = `${HITL_PREFIX}planning`;

/** Canonical project-relative path of a planning reference: bare `x` / `x.md` → `.hitl/planning/x.md`. */
export function planningRel(rel) {
  if (!rel) return null;
  let r = String(rel).trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!r.includes("/")) return `${PLANNING_DIR}/${r.endsWith(".md") ? r : r + ".md"}`;
  return r;
}

const cells = (line) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

/** parsePlanningMd(text, file) -> planning doc (see design-v2 §A.1.1). */
export function parsePlanningMd(text, file) {
  const doc = { file, title: null, status: null, tasksPath: null, updated: null, hasRequirements: false,
    requirements: [], decisions: [], changelog: [], parseErrors: [] };
  const err = (section, line, message) => doc.parseErrors.push({ section, line, message });
  let section = null; let header = null; let metaSeen = false;
  const seenR = new Set(); const seenD = new Set();
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if (doc.title === null && (m = line.match(RX.title))) { doc.title = m[1].trim(); continue; }
    if (!metaSeen && (m = line.match(RX.status))) {
      metaSeen = true;
      doc.status = m[1];
      doc.tasksPath = line.match(RX.tasks)?.[1] ?? null;
      doc.updated = line.match(RX.updated)?.[1] ?? null;
      continue;
    }
    if (/^## /.test(line)) {
      section = SECTIONS[line.trim()] || null;
      header = null;
      if (section === "requirements") doc.hasRequirements = true;
      continue;
    }
    if (section === "requirements") {
      if (!line.startsWith("- R-")) continue;
      if (!(m = line.match(RX.req))) { err("requirements", line, "malformed requirement line"); continue; }
      if (seenR.has(m[1])) { err("requirements", line, `duplicate requirement id ${m[1]}`); continue; }
      seenR.add(m[1]);
      const st = m[4] || "active";
      doc.requirements.push({ id: m[1], priority: m[2] || "must", text: m[3].trim(),
        status: st.startsWith("superseded") ? "superseded" : st, supersededBy: m[5] || null });
    } else if (section === "decisions") {
      if (!/^\s*\|/.test(line)) continue;
      const c = cells(line);
      if (c.every((x) => /^:?-+:?$/.test(x))) continue; // separator row
      if (!header) {
        header = {};
        c.forEach((name, i) => { const k = COLS[name.toLowerCase()]; if (k && !(k in header)) header[k] = i; });
        if (!("id" in header)) { err("decisions", line, "decision table has no id column"); header = { invalid: true }; }
        continue;
      }
      if (header.invalid) continue;
      const get = (k) => (k in header ? (c[header[k]] ?? "") : "");
      const id = get("id");
      if (!RX.did.test(id)) { err("decisions", line, `invalid decision id "${id}"`); continue; }
      if (seenD.has(id)) { err("decisions", line, `duplicate decision id ${id}`); continue; }
      seenD.add(id);
      const servesCell = get("serves");
      const serves = [];
      if (!["", "—", "-"].includes(servesCell)) {
        for (const r of servesCell.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (RX.rid.test(r)) { if (!serves.includes(r)) serves.push(r); }
          else err("decisions", line, `${id}: invalid serves item "${r}"`);
        }
      }
      const rawStatus = get("status");
      const sm = rawStatus.match(RX.dstatus);
      if (!sm) err("decisions", line, `${id}: invalid status "${rawStatus}" (accepted|rejected|superseded by D-n)`);
      doc.decisions.push({ id, decision: get("decision"), why: get("why"), cost: get("cost"), serves,
        status: sm ? (sm[2] ? "superseded" : sm[1]) : rawStatus, supersededBy: sm?.[2] || null });
    } else if (section === "changelog") {
      if (!line.startsWith("- ")) continue;
      if (!(m = line.match(RX.changelog))) { err("changelog", line, "malformed changelog line (- YYYY-MM-DD text)"); continue; }
      doc.changelog.push({ date: m[1], text: m[2].trim() });
    }
  }
  if (doc.title === null) doc.title = basename(String(file || ""), ".md");
  return doc;
}

/** readPlanning(root, rel) -> planning doc, or null when the file does not exist. */
export async function readPlanning(root, rel) {
  if (!rel || rel === "none") return null;
  let r = isAbsolute(rel) ? relative(root, rel).split(sep).join("/") : planningRel(rel);
  let text;
  try { text = await fs.readFile(join(root, r), "utf8"); } catch { return null; }
  return parsePlanningMd(text, r);
}

/** Display form of a requirement/decision status ("superseded by R-3"). */
export const statusText = (x) => (x?.status === "superseded" && x.supersededBy ? `superseded by ${x.supersededBy}` : x?.status ?? "unknown");
