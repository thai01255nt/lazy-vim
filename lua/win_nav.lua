-- Window navigation that wraps around: <C-l> on the rightmost window jumps to
-- the leftmost one (same for h/j/k). Floating windows keep plain wincmd.
local M = {}

local opposite = { h = "l", l = "h", j = "k", k = "j" }

---@param dir "h"|"j"|"k"|"l"
function M.go(dir)
  local floating = vim.api.nvim_win_get_config(0).relative ~= ""
  if not floating and vim.fn.winnr(dir) == vim.fn.winnr() then
    vim.cmd("999wincmd " .. opposite[dir]) -- no window that way: wrap to the far edge
  else
    vim.cmd.wincmd(dir)
  end
end

--- Snacks terminal key action (expr): a floating terminal gets the raw key
--- (LazyVim behaviour); a split terminal wraps like normal mode.
---@param dir "h"|"j"|"k"|"l"
function M.term(dir)
  ---@param self snacks.terminal
  return function(self)
    if self:is_floating() then
      return "<c-" .. dir .. ">"
    end
    vim.schedule(function()
      M.go(dir)
    end)
    return ""
  end
end

return M
