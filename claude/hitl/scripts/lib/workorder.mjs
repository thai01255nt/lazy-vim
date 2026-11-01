// Work order of one task's symbols: callees before callers over resolved `@calls` edges (topological, Kahn), cycles kept
// together (Tarjan SCC), ties by `@prio`, then `### Symbols` row, then name. Pure; see skills/implement step 2.
import { resolveRef } from "./graph.mjs";

/**
 * Order the symbols of one task for implementation.
 * Edges: S → C when a `@calls` ref of S resolves uniquely (resolveRef from S's file) to C, or to a member of C, with C
 * another symbol of `ids`. Unresolved/ambiguous refs and calls outside `ids` are ignored. A cycle (SCC) is one unit
 * placed where its smallest member would go; members inside it follow the tie-break.
 * @param {string[]} ids symbol ids of the task
 * @param {{symbols:{[id]:{name?:string, file?:string, parent?:string, tags?:{prio?:number, calls?:string[]}}}, files?:object}} index
 * @param {{rows?:string[]}} [opts] `rows`: symbol ids in `### Symbols` row order (tie-break after @prio)
 * @returns {string[]} the same ids, callees first
 */
export function workOrder(ids, index, { rows = [] } = {}) {
  const set = new Set(ids);
  const S = (id) => index?.symbols?.[id] || {};
  const rowPos = new Map(); rows.forEach((id, i) => { if (!rowPos.has(id)) rowPos.set(id, i); });
  const key = (id) => [S(id).tags?.prio ?? Infinity, rowPos.get(id) ?? Infinity, S(id).name || id, id];
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 2; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return x[2].localeCompare(y[2]) || (x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : 0); };
  const nodes = [...set].sort(cmp);

  // caller → callees (inside the task only)
  const out = new Map(nodes.map((id) => [id, new Set()]));
  const inTask = (id) => { for (let p = id, d = 0; p && d < 8; p = S(p).parent, d++) if (set.has(p)) return p; return null; };
  for (const id of nodes) for (const ref of S(id).tags?.calls || []) {
    let r = null; try { r = resolveRef(index, ref, S(id).file); } catch { r = null; }
    const c = r?.id ? inTask(r.id) : null;
    if (c && c !== id) out.get(id).add(c);
  }

  // Tarjan SCC (iterative over sorted nodes/edges → deterministic)
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], comp = new Map(); let n = 0, nc = 0;
  for (const root of nodes) {
    if (idx.has(root)) continue;
    const work = [[root, [...out.get(root)].sort(cmp), 0]];
    idx.set(root, n); low.set(root, n); n++; stack.push(root); onStack.add(root);
    while (work.length) {
      const top = work[work.length - 1]; const [v, succ] = top;
      if (top[2] < succ.length) {
        const w = succ[top[2]++];
        if (!idx.has(w)) { idx.set(w, n); low.set(w, n); n++; stack.push(w); onStack.add(w); work.push([w, [...out.get(w)].sort(cmp), 0]); }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        continue;
      }
      work.pop();
      if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
      if (low.get(v) === idx.get(v)) { let w; do { w = stack.pop(); onStack.delete(w); comp.set(w, nc); } while (w !== v); nc++; }
    }
  }
  const members = Array.from({ length: nc }, () => []);
  for (const id of nodes) members[comp.get(id)].push(id); // nodes are sorted → members sorted, members[c][0] = unit key
  // unit c depends on unit d (d must come first) when some member of c calls a member of d
  const deps = members.map(() => new Set()), users = members.map(() => new Set());
  for (const id of nodes) for (const c of out.get(id)) { const a = comp.get(id), b = comp.get(c); if (a !== b) { deps[a].add(b); users[b].add(a); } }

  // Kahn: always take the ready unit with the smallest key
  const pending = deps.map((d) => d.size);
  const ready = members.map((_, c) => c).filter((c) => !pending[c]);
  const order = [];
  while (ready.length) {
    ready.sort((a, b) => cmp(members[a][0], members[b][0]));
    const c = ready.shift();
    order.push(...members[c]);
    for (const u of users[c]) if (--pending[u] === 0) ready.push(u);
  }
  return order;
}
