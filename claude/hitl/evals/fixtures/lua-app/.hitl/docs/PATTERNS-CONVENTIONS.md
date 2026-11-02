# Patterns and conventions
<!-- AUTO-GENERATED:BEGIN patterns -->
- camelCase names; private helpers are `local function`, public ones are `function M.name` (exported via `return M`).
- Functions with more than two inputs take one options table typed by a `---@class <Name>Options` right above `---@param`.
- Every function carries LuaLS annotations (`---@param`, `---@return`); shared types are `---@class` blocks at the top.
- Errors: `error("<short message>")` for programmer errors; business refusals are return values (`false`, `nil`).
- One busted spec per module in `spec/<module>_spec.lua`; describe names are the symbol refs (`<file>#<name>`).
<!-- AUTO-GENERATED:END patterns -->
