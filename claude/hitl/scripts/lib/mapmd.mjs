// CODEBASE-MAP.md AUTO block + index/index.md, generated deterministically from the index (§B.3, §E.1 map-md).
import { paths } from "./project.mjs";
import { readText, writeTextAtomic } from "./fsutil.mjs";

const BEGIN = "<!-- AUTO-GENERATED:BEGIN codebase-map -->";
const END = "<!-- AUTO-GENERATED:END codebase-map -->";
const firstLine = (t) => (t || "").split("\n").find((l) => l.trim()) || "";

function tagNote(s) {
  const t = s.tags || {};
  const bits = [t.task?.join(","), t.impl, t.status].filter(Boolean);
  return bits.length ? ` [${bits.join(" · ")}]` : "";
}

export function renderMap(index) {
  const S = index.symbols;
  const byDir = new Map();
  for (const f of Object.keys(index.files).sort()) {
    const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "./";
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }
  const out = [];
  for (const [dir, files] of byDir) {
    out.push(`## ${dir}`);
    for (const f of files) {
      const fe = index.files[f];
      out.push(`### ${f.slice(f.lastIndexOf("/") + 1)}${fe.parseError ? " ⚠️ parse error" : ""}`);
      const syms = fe.symbols.map((id) => S[id]).filter(Boolean).filter((s) => s.kind !== "test");
      for (const s of syms) {
        const depth = s.parent ? "  " : "";
        const intent = firstLine(s.intent);
        out.push(`${depth}- ${s.kind === "suite" ? "suite" : s.kind} \`${s.signature || s.name}\`${s.exported ? " (exported)" : ""}${tagNote(s)}${intent ? ` — ${intent}` : ""}`);
      }
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

export function renderIndexMd(index) {
  const rows = Object.values(index.symbols).filter((s) => s.kind !== "suite").sort((a, b) => (a.id < b.id ? -1 : 1));
  const out = ["# HITL index (generated — do not edit)", "", `adapters: ${Object.entries(index.adapters || {}).map(([k, v]) => `${k}=${v}`).join(", ")} · files: ${Object.keys(index.files).length} · symbols: ${rows.length}`, "",
    "| symbol | kind | task | impl | status | stub | callers | callees |", "|---|---|---|---|---|---|---|---|"];
  for (const s of rows) out.push(`| ${s.id} | ${s.kind} | ${s.tags.task.join(",") || "—"} | ${s.tags.impl || "—"} | ${s.tags.status || "—"} | ${s.stub ? "yes" : ""} | ${s.callers.length} | ${s.callees.length} |`);
  if (index.warnings?.length) out.push("", "## Warnings", ...index.warnings.map((w) => `- ${w.code} ${w.symbol || w.file}: ${w.message}`));
  return out.join("\n") + "\n";
}

/** Writes docs/CODEBASE-MAP.md (only the AUTO block; MANUAL text preserved) and index/index.md. */
export async function writeMapMd(root, index) {
  const P = paths(root);
  const block = `${BEGIN}\n${renderMap(index)}\n${END}`;
  const cur = await readText(P.codebaseMap, null);
  let next;
  if (cur === null) next = `# Codebase Map\n\nGenerated from the AST index by \`hitl-index map-md\`. Text outside the AUTO block is preserved.\n\n${block}\n`;
  else if (cur.includes(BEGIN) && cur.includes(END)) next = cur.slice(0, cur.indexOf(BEGIN)) + block + cur.slice(cur.indexOf(END) + END.length);
  else next = cur.replace(/\s*$/, "\n\n") + block + "\n";
  if (next !== cur) await writeTextAtomic(P.codebaseMap, next);
  await writeTextAtomic(P.indexMd, renderIndexMd(index));
  return { codebaseMap: P.codebaseMap, indexMd: P.indexMd };
}
