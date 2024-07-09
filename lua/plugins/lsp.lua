return {
  -- tools
  {
    "williamboman/mason.nvim",
    opts = function(_, opts)
      vim.list_extend(opts.ensure_installed, {
        "stylua",
        "selene",
        "luacheck",
        "shellcheck",
        "shfmt",
        "tailwindcss-language-server",
        "typescript-language-server",
        "css-lsp",
        "pyright",
      })
    end,
  },
  -- lsp servers
  { "williamboman/mason-lspconfig.nvim" },
  { "neovim/nvim-lspconfig", opts = {}, setup = {} },
  { import = "plugins.extras.lang.python" },
}
