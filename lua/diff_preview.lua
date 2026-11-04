-- Render a unified diff into a preview buffer without +/- markers: added lines on
-- DiffAdd, removed lines on DiffDelete, code highlighted with the file's filetype,
-- `@@` headers shown as a dim "── line N ──" separator. Shared by the <leader>gb
-- line-history picker and the <leader>gs git-status picker.
local M = {}

M.ns = vim.api.nvim_create_namespace("diff_preview")

local skip = { "^diff %-%-git ", "^index ", "^%-%-%- ", "^%+%+%+ ", "^new file mode", "^deleted file mode",
  "^old mode", "^new mode", "^similarity index", "^rename from", "^rename to", "^\\ No newline" }
local line_hl = { ["+"] = "DiffAdd", ["-"] = "DiffDelete" }

--- Turn raw unified-diff lines into rows `{ text, line_hl?, hl? }`.
---@param lines string[]
---@return table[]
function M.parse(lines)
  local rows = {}
  for _, l in ipairs(lines) do
    local skipped = l == ""
    for _, p in ipairs(skip) do
      skipped = skipped or l:match(p) ~= nil
    end
    if l:match("^Binary files") then
      rows[#rows + 1] = { text = "(binary file)", hl = "Comment" }
    elseif not skipped then
      local new_start = l:match("^@@ %-%d+,?%d* %+(%d+)")
      if new_start then
        rows[#rows + 1] = { text = "── line " .. new_start .. " ──", hl = "Comment" }
      else
        rows[#rows + 1] = { text = l:sub(2), line_hl = line_hl[l:sub(1, 1)] }
      end
    end
  end
  return rows
end

--- Write `header` (rows with optional `spans = {{start_col, end_col, hl}}`) followed by
--- diff `rows` into `buf`, highlighted for filetype `ft`.
---@param buf integer
---@param rows table[]
---@param ft string?
---@param header table[]?
function M.render(buf, rows, ft, header)
  header = header or {}
  local all = vim.list_extend(vim.list_extend({}, header), rows)
  local lines = vim.tbl_map(function(r)
    return r.text
  end, all)
  vim.bo[buf].modifiable = true
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.api.nvim_buf_clear_namespace(buf, M.ns, 0, -1)
  if ft and ft ~= "" then
    local lang = vim.treesitter.language.get_lang(ft) or ft
    if not pcall(vim.treesitter.start, buf, lang) then
      vim.bo[buf].syntax = ft
    end
  end
  for i, r in ipairs(all) do
    local row = i - 1
    if r.line_hl then
      vim.api.nvim_buf_set_extmark(buf, M.ns, row, 0, { line_hl_group = r.line_hl })
    elseif r.hl then
      vim.api.nvim_buf_set_extmark(buf, M.ns, row, 0, { end_col = #r.text, hl_group = r.hl, priority = 200 })
    end
    for _, s in ipairs(r.spans or {}) do
      vim.api.nvim_buf_set_extmark(buf, M.ns, row, s[1], { end_col = s[2], hl_group = s[3], priority = 200 })
    end
  end
end

return M
