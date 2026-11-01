// lib/workorder.mjs: callees before callers over resolved @calls, SCC kept together, ties by @prio / ### Symbols row / name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { workOrder } from "../../scripts/lib/workorder.mjs";

/** index from [name, prio, calls[], extra] rows; ids are `src/a.ts#<name>`. */
function idx(rows) {
  const symbols = {};
  for (const [name, prio, calls = [], extra = {}] of rows) {
    const id = `src/a.ts#${name}`;
    symbols[id] = { id, name, file: "src/a.ts", kind: "function", tags: { ...(prio == null ? {} : { prio }), calls }, ...extra };
  }
  return { symbols, files: { "src/a.ts": { imports: [] } } };
}
const ids = (index) => Object.keys(index.symbols);
const names = (out) => out.map((id) => id.split("#")[1]);

test("chain A→B→C is ordered C, B, A even when @prio says A first", () => {
  const index = idx([["A", 1, ["B"]], ["B", 2, ["C"]], ["C", 3]]);
  assert.deepEqual(names(workOrder(ids(index), index)), ["C", "B", "A"]);
});

test("the observed case: appended helper (@prio 9) comes before its callers, independent symbols keep @prio", () => {
  const index = idx([["applySettlement", 4, ["parseSettleArgs", "appendSettlementEvent"]], ["parseSettleArgs", 5],
    ["appendSettlementEvent", 6, ["appendBillingStream"]], ["SettleArgs", 1], ["appendBillingStream", 9]]);
  assert.deepEqual(names(workOrder(ids(index), index)),
    ["SettleArgs", "parseSettleArgs", "appendBillingStream", "appendSettlementEvent", "applySettlement"]);
});

test("ties: @prio, then ### Symbols row, then name; untagged last", () => {
  const index = idx([["z", 2], ["y", null], ["b", 1], ["a", 1], ["x", null]]);
  assert.deepEqual(names(workOrder(ids(index), index)), ["a", "b", "z", "x", "y"]);
  const rows = ["src/a.ts#b", "src/a.ts#a", "src/a.ts#y"];
  assert.deepEqual(names(workOrder(ids(index), index, { rows })), ["b", "a", "z", "y", "x"]);
});

test("cycle: the SCC stays together, ordered by @prio, after its own callees and before its callers; independent @prio 4 first", () => {
  const index = idx([["top", 1, ["p"]], ["p", 3, ["q"]], ["q", 2, ["p", "leaf"]], ["leaf", 5], ["other", 4]]);
  assert.deepEqual(names(workOrder(ids(index), index)), ["other", "leaf", "q", "p", "top"]);
});

test("calls to symbols outside the task and unresolved/ambiguous refs are ignored", () => {
  const index = idx([["A", 1, ["Outside", "Nope", "dup"]], ["B", 2, ["A"]], ["Outside", 1]]);
  index.symbols["src/b.ts#dup"] = { id: "src/b.ts#dup", name: "dup", file: "src/b.ts", kind: "function", tags: {} };
  index.symbols["src/c.ts#dup"] = { id: "src/c.ts#dup", name: "dup", file: "src/c.ts", kind: "function", tags: {} };
  const task = ["src/a.ts#A", "src/a.ts#B"];
  assert.deepEqual(names(workOrder(task, index)), ["A", "B"]);
});

test("a call to a member of a task class orders the class first; self-calls ignored; deterministic", () => {
  const index = idx([["Svc.run", 1, ["Repo.get", "Svc.run"]], ["Repo", 2], ["Repo.get", null, [], { kind: "method", parent: "src/a.ts#Repo" }]]);
  index.symbols["src/a.ts#Repo"].kind = "class";
  const task = ["src/a.ts#Svc.run", "src/a.ts#Repo"];
  assert.deepEqual(names(workOrder(task, index)), ["Repo", "Svc.run"]);
  assert.deepEqual(workOrder([...task].reverse(), index), workOrder(task, index));
});
