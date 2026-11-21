-- <A-a>: switch to the last accessed tab page and back (like g<Tab>), also in
-- terminal mode inside the agent-manager and Claude Code panels. Each tab page
-- keeps its last focused window, so switching back refocuses e.g. agent-manager.
local M = {}

function M.last_tab()
  if vim.fn.tabpagenr("#") == 0 then
    return
  end
  vim.cmd.stopinsert()
  vim.cmd.tabnext("#")
  -- mapped keys keep the mode they were pressed in: re-enter terminal mode in
  -- a terminal window, stay in normal mode elsewhere
  vim.schedule(function()
    if vim.bo.buftype == "terminal" then
      vim.cmd.startinsert()
    end
  end)
end

--- Snacks win `keys` entries for a terminal panel (terminal mode only).
---@return table<string, snacks.win.Keys>
function M.term_keys()
  return {
    last_tab = { "<A-a>", M.last_tab, mode = "t", desc = "Last tab page" },
  }
end

return M
