-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
local keymap = vim.keymap
local opts = { noremap = true, silent = true }

-- Increment/decrement number
keymap.set("n", "+", "<C-a>")
keymap.set("n", "-", "<C-x>")

-- Delete a word backward
--keymap.set("n", "dw", "vb_d")

-- Select all
keymap.set("n", "<C-a>", "gg<S-v>G")

-- Jumplist
--keymap.set("n", "<C-m>", "<C-i>", opts)
-- New edit in current folder
keymap.set("n", "<leader>bn", ":edit %:h/", { desc = "[b]uffer [n]ew in current folder" })
-- New tab
keymap.set("n", "<leader>te", ":tabedit %:h/", { desc = "new [t]ab [e]dit in current folder" })
keymap.set("n", "<tab>", ":tabnext<Return>", opts)
keymap.set("n", "<s-tab>", ":tabprev<Return>", opts)
-- split window
keymap.set("n", "ss", ":split<Return>", opts)
keymap.set("n", "sv", ":vsplit<Return>", opts)
-- Move Window
keymap.set("n", "sh", "<C-w>h")
keymap.set("n", "sk", "<C-w>k")
keymap.set("n", "sj", "<C-w>j")
keymap.set("n", "sl", "<C-w>l")
-- swap window
keymap.set("n", "sw", "<C-w>r")
-- rotate window from horizontal to vertical
keymap.set("n", "srh", "<C-w>H")
-- rotate window from vertical to horizontal
keymap.set("n", "srj", "<C-w>J")

-- Resize window
keymap.set("n", "<C-w><C-left>", "10<C-W><")
keymap.set("n", "<C-w><C-right>", "10<C-W>>")
keymap.set("n", "<C-w><C-up>", "2<C-W>+")
keymap.set("n", "<C-w><C-down>", "2<C-W>-")

-- Delete marks: dm{char} deletes one mark, dM deletes all lowercase marks of the buffer
keymap.set("n", "dm", function()
  local ok, char = pcall(vim.fn.getcharstr)
  if ok and char:match("^[%a%d]$") then
    vim.cmd("delmarks " .. char)
    vim.notify("Deleted mark " .. char)
  end
end, { desc = "Delete mark" })
keymap.set("n", "dM", "<cmd>delmarks!<cr>", { desc = "Delete all buffer marks" })

-- Format json
-- vim.api.nvim_create_autocmd("BufWritePost", {
--   pattern = { "*.json" },
--   callback = function()
--     vim.cmd("%!jq < %")
--   end,
-- })
-- Format yaml, json
vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = { "*.yaml", "*.yml", "*.json", "*.ts", "*.js" },
  callback = function()
    local v = vim.fn.winsaveview()
    vim.cmd("%!prettier --stdin-filepath % --write")
    vim.fn.winrestview(v)
  end,
})
vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = { "*.sql" },
  callback = function()
    local v = vim.fn.winsaveview()
    local currentPath = vim.fn.expand("%:p")
    if currentPath:match(".*postgres.*") then
      vim.cmd("%!sql-formatter % --language postgresql")
    elseif currentPath:match(".*sqlserver.*") then
      vim.cmd("%!sql-formatter % --language tsql")
    else
      vim.cmd("%!sql-formatter %")
    end
    vim.fn.winrestview(v)
  end,
})
-- Diagnostics
-- keymap.set("n", "<C-j>", function()
--   vim.diagnostics.goto_next()
-- end, opts)
local esc = vim.api.nvim_replace_termcodes("<Esc>", true, true, true)
vim.api.nvim_create_autocmd("FileType", {
  pattern = { "javascript", "typescript" },
  callback = function()
    vim.fn.setreg("l", "yoconsole.log('[LOG_DEV] " .. esc .. "pa:', " .. esc .. "pl")
  end,
})
vim.api.nvim_create_autocmd("FileType", {
  pattern = { "python" },
  callback = function()
    vim.fn.setreg("l", "yoLOGGER.info(f'[LOG_DEV] " .. esc .. "pa: {str(" .. esc .. "pa)}'" .. esc .. "l")
    vim.fn.setreg("p", "yoprint(f'[LOG_DEV] " .. esc .. "pa: {str(" .. esc .. "pa)}'" .. esc .. "l")
  end,
})

-- Line history: one entry per commit that touched the cursor line; the preview shows
-- only that commit's hunk for this line, rendered without +/- markers: added lines on
-- DiffAdd, removed lines on DiffDelete, code highlighted with the file's filetype.
local line_history_ns = vim.api.nvim_create_namespace("git_line_history")
keymap.set("n", "<leader>gb", function()
  local file = vim.api.nvim_buf_get_name(0)
  local ft = vim.bo.filetype
  local line = vim.fn.line(".")
  local out = vim.fn.systemlist({
    "git", "-C", vim.fn.fnamemodify(file, ":h"), "log", "--no-color", "--date=short",
    "--format=@@@C@@@%h%x09%an%x09%ad%x09%s", "-L", line .. ",+1:" .. file,
  })
  if vim.v.shell_error ~= 0 then
    vim.notify(table.concat(out, "\n"), vim.log.levels.WARN, { title = "Git Line History" })
    return
  end
  local kinds = { ["+"] = "DiffAdd", ["-"] = "DiffDelete" }
  local items, item = {}, nil
  for _, l in ipairs(out) do
    local commit, author, date, msg = l:match("^@@@C@@@(%S+)\t(.-)\t(.-)\t(.*)$")
    if commit then
      item = { commit = commit, author = author, date = date, msg = msg, text = commit .. " " .. author .. " " .. msg, rows = {} }
      items[#items + 1] = item
    elseif item and l ~= "" and not l:match("^diff %-%-git ") and not l:match("^%-%-%- ") and not l:match("^%+%+%+ ") then
      local new_start = l:match("^@@ %-%d+,?%d* %+(%d+)")
      if new_start then
        item.rows[#item.rows + 1] = { text = "── line " .. new_start .. " ──", hl = "Comment" }
      else
        item.rows[#item.rows + 1] = { text = l:sub(2), line_hl = kinds[l:sub(1, 1)] }
      end
    end
  end
  Snacks.picker({
    title = "Line History",
    items = items,
    format = "git_log",
    confirm = "git_checkout",
    preview = function(ctx)
      local it = ctx.item
      local lines = { it.commit .. "  " .. it.author .. "  " .. it.date, it.msg, "" }
      for _, r in ipairs(it.rows) do
        lines[#lines + 1] = r.text
      end
      ctx.preview:reset()
      ctx.preview:set_lines(lines)
      ctx.preview:highlight({ ft = ft })
      ctx.preview:set_title(it.commit)
      local buf = ctx.buf
      vim.api.nvim_buf_clear_namespace(buf, line_history_ns, 0, -1)
      local function mark(row, col, end_col, hl)
        vim.api.nvim_buf_set_extmark(buf, line_history_ns, row, col, { end_col = end_col, hl_group = hl, priority = 200 })
      end
      mark(0, 0, #it.commit, "Constant")
      mark(0, #it.commit + 2, #it.commit + 2 + #it.author, "Identifier")
      mark(0, #lines[1] - #it.date, #lines[1], "Comment")
      mark(1, 0, #it.msg, "Title")
      for i, r in ipairs(it.rows) do
        local row = i + 2
        if r.line_hl then
          vim.api.nvim_buf_set_extmark(buf, line_history_ns, row, 0, { line_hl_group = r.line_hl })
        elseif r.hl then
          mark(row, 0, #r.text, r.hl)
        end
      end
    end,
  })
end, { desc = "Git Line History" })
