-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
-- Add any additional autocmds here

-- Turn off paste mode when leaving insert
vim.api.nvim_create_autocmd("InsertLeave", {
  pattern = "*",
  command = "set nopaste",
})

local function set_transparency()
  vim.cmd([[
    hi Normal guibg=NONE ctermbg=NONE
    hi NormalFloat guibg=NONE ctermbg=NONE
    hi NormalNC guibg=NONE ctermbg=NONE
    hi SignColumn guibg=NONE ctermbg=NONE
    hi StatusLine guibg=NONE ctermbg=NONE
    hi StatusLineNC guibg=NONE ctermbg=NONE
    hi VertSplit guibg=NONE ctermbg=NONE
    hi TabLine guibg=NONE ctermbg=NONE
    hi TabLineFill guibg=NONE ctermbg=NONE
    hi TabLineSel guibg=NONE ctermbg=NONE
    hi Pmenu guibg=NONE ctermbg=NONE
    hi PmenuSel guibg=NONE ctermbg=NONE
    hi NeoTreeNormal guibg=NONE ctermbg=NONE
    hi NeoTreeNormalNC guibg=NONE ctermbg=NONE
    hi NeoTreeWinSeparator guibg=NONE ctermbg=NONE
    hi NeoTreeEndOfBuffer guibg=NONE ctermbg=NONE
    hi EndOfBuffer guibg=NONE ctermbg=NONE
  ]])
end

-- Apply transparency settings initially
set_transparency()

-- Diff highlights: nord defines DiffAdd/Delete/Change/Text as `inverse` (solid
-- accent background, text recoloured dark). Replace with a faint tint of the accent
-- blended into the background and no fg, so syntax colours stay readable.
local function set_diff_highlights()
  local function hex(n)
    return string.format("#%06x", n)
  end
  local function blend(fg, bg, alpha)
    local out = 0
    for shift = 16, 0, -8 do
      local f, b = bit.band(bit.rshift(fg, shift), 0xff), bit.band(bit.rshift(bg, shift), 0xff)
      out = out + bit.lshift(math.floor(f * alpha + b * (1 - alpha) + 0.5), shift)
    end
    return hex(out)
  end
  local base = vim.api.nvim_get_hl(0, { name = "Normal", link = false }).bg or 0x2e3440
  local function accent(group, fallback)
    local h = vim.api.nvim_get_hl(0, { name = group, link = false })
    return (h.reverse and h.fg) or h.bg or fallback
  end
  local add, del = accent("DiffAdd", 0xa3be8c), accent("DiffDelete", 0xbf616a)
  local change, text = accent("DiffChange", 0xebcb8b), accent("DiffText", 0x81a1c1)
  vim.api.nvim_set_hl(0, "DiffAdd", { bg = blend(add, base, 0.2) })
  vim.api.nvim_set_hl(0, "DiffDelete", { bg = blend(del, base, 0.2) })
  vim.api.nvim_set_hl(0, "DiffChange", { bg = blend(change, base, 0.12) })
  vim.api.nvim_set_hl(0, "DiffText", { bg = blend(text, base, 0.35) })
  -- git/diff filetype +/- lines: coloured text instead of inverse blocks
  vim.api.nvim_set_hl(0, "diffAdded", { fg = hex(add) })
  vim.api.nvim_set_hl(0, "diffRemoved", { fg = hex(del) })
  vim.api.nvim_set_hl(0, "diffChanged", { fg = hex(change) })
end
set_diff_highlights()
vim.api.nvim_create_autocmd("ColorScheme", { callback = set_diff_highlights })
vim.api.nvim_create_autocmd("FileType", {
  pattern = "Avante",
  callback = function()
    vim.api.nvim_set_hl(0, "AvanteSidebarNormal", { link = "Normal" })
    vim.api.nvim_set_hl(0, "AvanteSidebarWinSeparator", { link = "WinSeparator" })
    -- local normal_bg = string.format("#%06x", vim.api.nvim_get_hl(0, { name = "Normal" }).bg)
    vim.api.nvim_set_hl(0, "AvanteSidebarWinHorizontalSeparator", { link = "Normal" })
  end,
})
-- -- Reapply transparency on buffer enter
-- vim.api.nvim_create_autocmd("BufEnter", {
--   pattern = "*",
--   callback = set_transparency,
-- })
vim.api.nvim_create_autocmd("FileType", {
  pattern = { "markdown", "txt" },
  callback = function()
    vim.opt_local.spell = false
  end,
})

vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = "*.go",
  callback = function()
    local v = vim.fn.winsaveview()
    vim.cmd("silent %!./bin/gofumpt")
    vim.cmd("silent %!./bin/goimports")
    -- Reload buffer nếu nội dung bị thay đổi
    vim.fn.winrestview(v)
  end,
})
