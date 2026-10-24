-- Call hierarchy picker: one entry per caller/callee, and only files inside the
-- workspace that are neither hidden nor gitignored.
-- <a-a> shows everything, <a-h> allows hidden, <a-i> allows gitignored.
local function call_hierarchy_opts()
  local root = LazyVim.root()
  local ignored_cache = {} ---@type table<string, boolean>

  local function is_ignored(file)
    if ignored_cache[file] == nil then
      local res = vim.system({ "git", "-C", root, "check-ignore", "-q", file }):wait()
      ignored_cache[file] = res.code == 0
    end
    return ignored_cache[file]
  end

  return {
    toggles = { all = "a" },
    win = { input = { keys = { ["<a-a>"] = { "toggle_all", mode = { "n", "i" } } } } },
    transform = function(item, ctx)
      local r = item.range and item.range.start or {}
      local key = table.concat({ item.file or "", item.name or "", r.line or "", r.character or "" }, ":")
      ctx.meta.seen = ctx.meta.seen or {}
      if ctx.meta.seen[key] then
        return false
      end
      ctx.meta.seen[key] = true

      local opts = ctx.picker.opts
      if opts.all or not item.file then
        return true
      end
      local file = vim.fs.normalize(item.file)
      local rel = vim.fs.relpath(root, file)
      if not rel then
        return false
      end
      if not opts.hidden and ("/" .. rel):find("/%.") then
        return false
      end
      return opts.ignored or not is_ignored(file)
    end,
  }
end

local function_kinds = { [6] = true, [9] = true, [12] = true } -- Method, Constructor, Function

-- When the cursor is not on a callable name, move it to the name of the
-- innermost enclosing function. Returns the original cursor if it moved.
local function goto_enclosing_function()
  local buf = vim.api.nvim_get_current_buf()
  local client = vim.lsp.get_clients({ bufnr = buf, method = "textDocument/prepareCallHierarchy" })[1]
  if not client then
    return
  end
  local params = vim.lsp.util.make_position_params(0, client.offset_encoding)
  local res = client:request_sync("textDocument/prepareCallHierarchy", params, 1000, buf)
  if not res or res.err or (res.result and #res.result > 0) then
    return
  end
  if not client:supports_method("textDocument/documentSymbol", buf) then
    return
  end
  res = client:request_sync("textDocument/documentSymbol", { textDocument = params.textDocument }, 1000, buf)
  if not res or res.err or not res.result then
    return
  end

  local pos = params.position
  local function contains(range)
    local s, e = range.start, range["end"]
    return (pos.line > s.line or (pos.line == s.line and pos.character >= s.character))
      and (pos.line < e.line or (pos.line == e.line and pos.character <= e.character))
  end

  local best ---@type lsp.Position?
  local function walk(symbols)
    for _, sym in ipairs(symbols) do
      local range = sym.range or sym.location.range
      if contains(range) then
        if function_kinds[sym.kind] then
          best = (sym.selectionRange or range).start
        end
        walk(sym.children or {})
      end
    end
  end
  walk(res.result)
  if not best then
    return
  end

  local orig = vim.api.nvim_win_get_cursor(0)
  local line = vim.api.nvim_buf_get_lines(buf, best.line, best.line + 1, false)[1] or ""
  local col = vim.str_byteindex(line, client.offset_encoding, best.character, false)
  vim.api.nvim_win_set_cursor(0, { best.line + 1, col })
  return orig
end

---@param incoming boolean
local function call_hierarchy(incoming)
  local win = vim.api.nvim_get_current_win()
  local orig = goto_enclosing_function()
  local moved = vim.api.nvim_win_get_cursor(win)
  local opts = call_hierarchy_opts()
  opts.on_close = function()
    -- restore the cursor unless the picker jumped somewhere
    if orig and vim.api.nvim_win_is_valid(win) and vim.deep_equal(vim.api.nvim_win_get_cursor(win), moved) then
      vim.api.nvim_win_set_cursor(win, orig)
    end
  end
  Snacks.picker[incoming and "lsp_incoming_calls" or "lsp_outgoing_calls"](opts)
end

return {
  -- tools
  {
    "mason-org/mason.nvim",
    -- dependencies = {
    --   "williamboman/mason-lspconfig.nvim",
    -- },
    opts = function(_, opts)
      vim.list_extend(opts.ensure_installed, {
        -- "stylua",
        -- "selene",
        -- "luacheck",
        -- "shellcheck",
        -- "shfmt",
        -- "tailwindcss-language-server",
        -- "typescript-language-server",
        -- "css-lsp",
        -- "pyright",
      })
    end,
  },
  -- lsp servers
  -- {
  --   "williamboman/mason-lspconfig.nvim",
  --   dependencies = {
  --     "williamboman/mason.nvim",
  --   },
  --   config = function()
  --     -- import mason
  --     -- local mason = require("mason")
  --     -- import mason-lspconfig
  --     local mason_lspconfig = require("mason-lspconfig")
  --     mason_lspconfig.setup({
  --       auto_installation = true,
  --     })
  --   end,
  -- },
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "mason-org/mason.nvim",
      -- "williamboman/mason-lspconfig.nvim",
    },
    opts = {
      servers = {
        ["*"] = {
          -- stylua: ignore
          keys = {
            -- telescope sends the request to every client (errors on ones without support); snacks targets the right client
            { "gai", function() call_hierarchy(true) end, desc = "C[a]lls Incoming", has = "callHierarchy/incomingCalls" },
            { "gao", function() call_hierarchy(false) end, desc = "C[a]lls Outgoing", has = "callHierarchy/outgoingCalls" },
          },
        },
      },
    },
    -- opts = {
    -- capabilities = {
    --   workspace = {
    --     didChangeWatchedFiles = {
    --       dynamicRegistration = true,
    --     },
    --   },
    -- },
    -- },
    -- setup = {},
  },
  {
    "mfussenegger/nvim-lint",
    opts = {},
    setup = {},
  },
  -- {
  --   "rshkarin/mason-nvim-lint",
  --   opts = {},
  --   setup = {},
  -- },
  { import = "plugins.extras.lang.python" },
  { import = "plugins.extras.lang.golang" },
  { import = "plugins.extras.lang.typescript" },
  { import = "plugins.extras.lang.java" },
  { import = "plugins.extras.lang.fsh" },
}
