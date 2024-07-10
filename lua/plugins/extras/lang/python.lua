return {
  {
    "williamboman/mason.nvim",
    opts = function(_, opts)
      -- vim.list_extend(opts.ensure_installed, { "pyright", "black", "ruff-lsp", "ruff" })
      vim.list_extend(opts.ensure_installed, {
        "pyright",
        "black",
        "ruff",
      })
    end,
  },
  {
    "neovim/nvim-lspconfig",
    dependencies = { "mfussenegger/mason.nvim" },
    opts = {
      ensure_installed = {
        "pyright",
      },
      servers = {
        pyright = {},
      },
      ruff_lsp = {},
      setup = {
        pyright = function()
          require("lspconfig").pyright.setup({})
        end,
      },
    },
  },
  {
    "linux-cultist/venv-selector.nvim",
    branch = "regexp",
    dependencies = {
      "mfussenegger/nvim-dap",
      "mfussenegger/nvim-dap-python",
      "williamboman/mason.nvim",
    },
    cmd = "VenvSelect",
    opts = {
      dap_enabled = true,
    },
    keys = { { "<leader>pv", "<cmd>:VenvSelect<cr>", desc = "Select VirtualEnv" } },
  },
}
