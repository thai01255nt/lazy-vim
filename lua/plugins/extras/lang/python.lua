return {
  {
    "williamboman/mason.nvim",
    opts = function(_, opts)
      -- vim.list_extend(opts.ensure_installed, { "pyright", "black", "ruff-lsp", "ruff" })
      vim.list_extend(opts.ensure_installed, {
        "black",
      })
    end,
  },
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      local lspconfig = require("lspconfig")
      local cmp_nvim_lsp = require("cmp_nvim_lsp")
      local opts = { noremap = true, slient = true }
      local on_attach = function(_, _) end

      local capabilities = cmp_nvim_lsp.default_capabilities()
      lspconfig["pyright"].setup({
        capabilities = capabilities,
        on_attach = on_attach,
      })
    end,
    opts = {
      ensure_installed = {
        "pyright",
      },
      servers = {
        pyright = {
          enable = true,
        },
      },
      setup = {
        pyright = function()
          require("lspconfig").pyright.setup({
            settings = {
              pyright = { autoImportCompletion = true },
              python = {
                analysis = {
                  autoSearchPaths = true,
                  diagnosticMode = "openFilesOnly",
                  useLibraryCodeForTypes = true,
                  typeCheckingMode = "on",
                },
              },
            },
          })
        end,
      },
    },
  },
  {
    "psf/black",
    ft = "python",
    config = function()
      vim.api.nvim_create_autocmd({ "BufWritePost" }, {
        pattern = "*.py",
        callback = function()
          local file_name = vim.api.nvim_buf_get_name(0)
          vim.cmd("!python -m black " .. file_name)
        end,
      })
    end,
  },
  {
    "mfussenegger/nvim-lint",
    event = { "BufWritePost", "InsertLeave" },
    config = function()
      require("lint").linters_by_ft = {
        python = {
          "flake8",
        },
      }
      vim.api.nvim_create_autocmd({ "InsertLeave", "BufWritePost" }, {
        pattern = { "*.py" },
        callback = function()
          require("lint").try_lint()
        end,
      })
    end,
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
