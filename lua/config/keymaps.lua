-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
local keymap = vim.keymap
local opts = { noremap = true, silent = true }

-- Increment/decrement zoom
keymap.set("n", "+", "<C-a>")
keymap.set("n", "-", "<C-x")

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

-- Format json
-- vim.api.nvim_create_autocmd("BufWritePost", {
--   pattern = { "*.json" },
--   callback = function()
--     vim.cmd("%!jq < %")
--   end,
-- })
-- Format yaml, json
vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = { "*.yaml", "*.yml", "*.json" },
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
    vim.cmd("%!prettier-sql %")
    vim.fn.winrestview(v)
  end,
})
-- Diagnostics
-- keymap.set("n", "<C-j>", function()
--   vim.diagnostics.goto_next()
-- end, opts)
