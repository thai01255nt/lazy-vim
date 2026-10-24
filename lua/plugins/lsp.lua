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
            { "gai", function() Snacks.picker.lsp_incoming_calls(call_hierarchy_opts()) end, desc = "C[a]lls Incoming", has = "callHierarchy/incomingCalls" },
            { "gao", function() Snacks.picker.lsp_outgoing_calls(call_hierarchy_opts()) end, desc = "C[a]lls Outgoing", has = "callHierarchy/outgoingCalls" },
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
