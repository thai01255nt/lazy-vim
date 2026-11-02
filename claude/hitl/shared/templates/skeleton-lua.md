# Lua skeleton patterns (LuaLS / EmmyLua annotations)

Rules: every target symbol gets intent prose + reserved tags + numbered `-- TODO(impl):` steps + the sentinel error.
The sentinel MUST be `error("TODO(impl): <file>#<name>")` (full ref: Lua files often repeat local names).
The docstring is the run of comment lines directly above the function (no blank line inside): hitl hashes it as the
intent, and lua-language-server (LuaLS) reads its `---@` annotations. Tag lines are plain `--` lines holding only
reserved tags (see `../tag-grammar.md`), never mixed into `---@` lines.
Step wording: each numbered step is a short intent label that says WHAT the block does (2-8 words, e.g.
`1. parse args`, `3. validate billing stream key type`), not pseudo-code that restates the line below it. It stays in
the code as the `n.` comment after implementation, so write it for a reader of the finished code. Add a short "why"
only when it is not obvious (`3. validate stream key type (before any write: no rollback)`). Rules, edge cases and
error behaviour belong in the intent prose (the test-author's contract), not in the steps.

## Annotation order (LuaLS binding — do not break it)
Docstring order: intent prose → hitl tags → `---@alias` / `---@class` + `---@field` → `---@param` / `---@return`
(`---@nodiscard`, `---@async`) → the `function` line.
**Nothing (prose, tags, `--` or `---` lines) may sit between the last `---@field` and the first `---@param`.**
LuaLS would silently drop the function's signature (callers get an unknown return type; `--check` reports nothing).
A class shared by several functions goes in its own block, separated from the docstring by a blank line.

## Function stub (exact shape)
```lua
-- Read phase of lease closing (BILL-R12): lists the leases this settle uses up; writes nothing.
-- A lease that gets a refund or still carries another reservation stays open.
-- Returns the lease ids, each once, in touch order; empty when nothing is used up.
-- @task T-4 @impl agent @status skeleton @prio 2
-- @dec D-13
-- @calls generateListAttachReservationKey
-- @concurrency shared-state
---@class FindUsedUpLeasesOptions
---@field leaseKeyPrefix string
---@field refundAllocates number[] # refund per reservation item (same index)
---@param options FindUsedUpLeasesOptions
---@return string[]
local function findUsedUpLeases(options)
	-- TODO(impl): 1. collect exhausted reserved leases that get no refund
	-- TODO(impl): 2. keep those with no other reservation attached
	error("TODO(impl): src/cache_repos/lua/lease_exec_settle.lua#findUsedUpLeases")
end
```
`@dec D-n` (optional, 0–3 per task): only on symbols that embody a design decision (change `design.md`, cited in the
task's **Why**) whose *cost if wrong* matters. Not hashed; adding it never needs re-approval.
Module function (`function M.name(...)` / `M.name = function(...)`): same docstring; ref `<file>#M.name`; export it
in the module's return table when other scripts call it.

## Modify an existing symbol (keep working code)
The existing docstring has its class right above `---@param` → put the new prose and tags above the `---@class` line:
```lua
-- Gives refund back to one lease and to the wallet lease total.      ← updated intent
-- @task T-2, T-3 @impl agent @status skeleton @prio 1
-- @concurrency shared-state
---@class RefundLeaseOptions                                          ← existing class, unchanged
---@field leaseId string
---@field amount number
---@param options RefundLeaseOptions
---@return string|nil # silent error message
local function refundLease(options)
	-- TODO(impl): 1. revive an exhausted lease at its old FIFO score
	redis.call("HINCRBY", options.leaseAmountPoolKey, options.leaseId, options.amount) -- existing code stays
end
```

## New module (file) holding stubs
```lua
-- Lease helpers shared by the reserve / settle / release scripts.
-- @task T-4 @impl agent @status skeleton
local M = {}

-- …function stubs…

return M
```

## Types needed by signatures (full types, no sentinel)
```lua
---@class WalletUtil.LeaseDeductionPlan
---@field leaseId string
---@field targetDeductNanoCents number # field comments go after `#`
-- TODO(impl): define audit fields
```

## Test stubs (one per test-plan row; no assertions yet)
Busted (pure Lua); title starts with the AC id, describe name = the covered ref:
```lua
describe("src/lib/lease.lua#findUsedUpLeases", function()
	-- @covers src/lib/lease.lua#findUsedUpLeases @ac T-4.AC1 @kind example @origin skeleton
	pending("T-4.AC1 skips a lease that gets a refund")
end)
```
Scripts run inside Redis/Valkey and tested from Python → `skeleton-py.md` § Test stubs, `@covers <file>.lua#<name>`.
`@concurrency` ≠ none on a covered symbol → add one more stub with `@kind concurrency`.

## After implementation (for reference)
`-- TODO(impl): 1. x` becomes `-- 1. x` and the sentinel is removed. Step comments stay so reviewers map the flow.
