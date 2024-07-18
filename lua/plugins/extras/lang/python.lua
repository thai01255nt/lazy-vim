return {
  {
    "williamboman/mason.nvim",
    opts = function(_, opts)
      -- vim.list_extend(opts.ensure_installed, { "pyright", "black", "ruff-lsp", "ruff" })
      vim.list_extend(opts.ensure_installed, {
        "black",
        "debugpy",
      })
    end,
  },
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    filetype = "python",
    config = function()
      local lspconfig = require("lspconfig")
      local cmp_nvim_lsp = require("cmp_nvim_lsp")
      local opts = { noremap = true, slient = true }
      local on_attach = require("plugins/extras/lang/on_attach").on_attach

      -- local capabilities = cmp_nvim_lsp.default_capabilities()
      local capabilities = vim.lsp.protocol.make_client_capabilities()
      capabilities.workspace.didChangeWatchedFiles.dynamicRegistration = true
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
                  useLibrarySourceForTypes = true,
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
          vim.cmd("!python -m black -q " .. file_name)
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
    "mfussenegger/nvim-dap-python",
    ft = "python",
    dependencies = {
      "mfussenegger/nvim-dap",
      "rcarriga/nvim-dap-ui",
    },
    config = function(_, opts)
      local path = "~/.local/share/nvim/mason/packages/debugpy/venv/bin/python"
      require("dap-python").setup(path)
    end,
    -- keys = {
    --   {
    --     "<leader>dPt",
    --     function()
    --       require("dap-python").test_method()
    --     end,
    --     desc = "[d]ebug [P]ython run [T]est",
    --   },
    --   {
    --     "<leader>dPs",
    --     function()
    --       require("dap-python").debug_selection()
    --     end,
    --     desc = "[d]ebug [P]ython run [S]election",
    --     mode = { "v" },
    --   },
    --   {
    --     "<leader>dPc",
    --     function()
    --       require("dap-python").continue()
    --     end,
    --     desc = "[d]ebug [P]ython [c]ontinue",
    --   },
    -- },
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
