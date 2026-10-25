// Filesystem helpers: tolerant JSON reads, atomic sorted-key writes, the index lock (§E.10).
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { HITL_DIR } from "./paths.mjs";

export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

export const stableJson = (obj) => JSON.stringify(sortKeys(obj), null, 2) + "\n";

export async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function readText(file, fallback = null) {
  try { return await fs.readFile(file, "utf8"); } catch { return fallback; }
}

export async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

export async function writeTextAtomic(file, text) {
  await fs.mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, text);
  await fs.rename(tmp, file);
}

export const writeJsonAtomic = (file, obj) => writeTextAtomic(file, stableJson(obj));

const held = new Map(); // root -> depth (re-entrant within one process)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withIndexLock(root, fn, { waitMs = 3000, staleMs = 15000 } = {}) {
  if (held.get(root)) {
    held.set(root, held.get(root) + 1);
    try { return await fn(); } finally { held.set(root, held.get(root) - 1); }
  }
  const lock = join(root, HITL_DIR, "index/.lock");
  await fs.mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const h = await fs.open(lock, "wx");
      await h.writeFile(String(process.pid));
      await h.close();
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const st = await fs.stat(lock).catch(() => null);
      if (st && Date.now() - st.mtimeMs > staleMs) { await fs.rm(lock, { force: true }); continue; }
      if (Date.now() > deadline) throw new Error(`index locked (${lock}); retry later`);
      await sleep(100);
    }
  }
  held.set(root, 1);
  try { return await fn(); } finally {
    held.delete(root);
    await fs.rm(lock, { force: true });
  }
}
