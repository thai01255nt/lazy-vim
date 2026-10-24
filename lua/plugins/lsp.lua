-- Outgoing calls listed per call site (jumps to the call, not the callee's definition).
---@type snacks.picker.finder
local function outgoing_call_sites(opts, ctx)
  local Lsp = require("snacks.picker.source.lsp")
  if not opts.sites then
    return Lsp.outgoing_calls(opts, ctx)
  end
  local buf, win = ctx.filter.current_buf, ctx.filter.current_win

  ---@async
  return function(cb)
    local prepared = {} ---@type {client: vim.lsp.Client, item: lsp.CallHierarchyItem}[]
    Lsp.request(buf, "textDocument/prepareCallHierarchy", function(client)
      return vim.lsp.util.make_position_params(win, client.offset_encoding)
    end, function(client, result)
      for _, item in ipairs(result or {}) do
        prepared[#prepared + 1] = { client = client, item = item }
      end
    end)

    local items = {} ---@type snacks.picker.finder.Item[]
    for _, p in ipairs(prepared) do
      Lsp.request(p.client, "callHierarchy/outgoingCalls", function()
        return { item = p.item }
      end, function(client, calls)
        for _, call in ipairs(calls or {}) do
          local sites = {} ---@type lsp.CallHierarchyItem[]
          for _, range in ipairs(call.fromRanges or {}) do
            local site = vim.deepcopy(call.to)
            site.uri, site.range, site.selectionRange = p.item.uri, range, range
            sites[#sites + 1] = site
          end
          for _, item in ipairs(Lsp.results_to_items(client, sites)) do
            item.callee_file = vim.uri_to_fname(call.to.uri) -- filter on the callee, not the call site
            items[#items + 1] = item
          end
        end
      end)
    end

    table.sort(items, function(a, b)
      return a.pos[1] < b.pos[1] or (a.pos[1] == b.pos[1] and a.pos[2] < b.pos[2])
    end)
    vim.tbl_map(cb, items)
  end
end

-- Call hierarchy picker: one entry per caller/callee, and only files inside the
-- workspace that are neither hidden nor gitignored.
-- <a-a> shows everything, <a-h> allows hidden, <a-i> allows gitignored,
-- <a-c> toggles listing every call site (default for outgoing calls, which also skip classes).
local function call_hierarchy_opts()
  local root = LazyVim.root()
  local ignored_cache = {} ---@type table<string, boolean>

  local function is_ignored(file)
    if ignored_cache[file] == nil then
      local cmd = { "git", "-C", root, "check-ignore", "-q", file }
      local async = require("snacks.picker.util.async").running()
      if async then
        -- transforms can run in a fast event (lsp callback) where :wait() is not allowed
        local code ---@type integer?
        vim.system(cmd, {}, function(res)
          code = res.code
          vim.schedule(function()
            async:resume()
          end)
        end)
        while code == nil do
          async:suspend()
        end
        ignored_cache[file] = code == 0
      elseif not vim.in_fast_event() then
        ignored_cache[file] = vim.system(cmd):wait().code == 0
      else
        return false
      end
    end
    return ignored_cache[file]
  end

  return {
    toggles = { all = "a", sites = "c" },
    win = {
      input = {
        keys = {
          ["<a-a>"] = { "toggle_all", mode = { "n", "i" } },
          ["<a-c>"] = { "toggle_sites", mode = { "n", "i" } },
        },
      },
    },
    transform = function(item, ctx)
      -- per caller/callee: key on its range; per call site: key on the call position
      local r = item.range and item.range.start or {}
      local at = ctx.picker.opts.sites and item.pos or { r.line, r.character }
      local key = table.concat({ item.file or "", item.name or "", at[1] or "", at[2] or "" }, ":")
      ctx.meta.seen = ctx.meta.seen or {}
      if ctx.meta.seen[key] then
        return false
      end
      ctx.meta.seen[key] = true

      local opts = ctx.picker.opts
      if opts.outgoing and item.kind == "Class" then
        return false -- constructor calls
      end
      local file = item.callee_file or item.file
      if opts.all or not file then
        return true
      end
      file = vim.fs.normalize(file)
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
  if not incoming then
    opts.finder = outgoing_call_sites
    opts.outgoing = true
    opts.sites = true
  end
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
