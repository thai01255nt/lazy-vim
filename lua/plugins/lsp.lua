return {
  -- tools
  {
    "williamboman/mason.nvim",
    dependencies = {
      "williamboman/mason-lspconfig.nvim",
    },
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
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = {
      "williamboman/mason.nvim",
    },
    config = function()
      -- import mason
      -- local mason = require("mason")
      -- import mason-lspconfig
      local mason_lspconfig = require("mason-lspconfig")
      mason_lspconfig.setup({
        auto_installation = true,
      })
    end,
  },
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
    },
    opts = {
      -- capabilities = {
      --   workspace = {
      --     didChangeWatchedFiles = {
      --       dynamicRegistration = true,
      --     },
      --   },
      -- },
    },
    setup = {},
  },
  {
    "mfussenegger/nvim-lint",
    opts = {},
    setup = {},
  },
  {
    "rshkarin/mason-nvim-lint",
    opts = {},
    setup = {},
  },
  { import = "plugins.extras.lang.python" },
}
