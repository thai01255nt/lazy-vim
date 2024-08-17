return {
  {
    "williamboman/mason.nvim",
    opts = function(_, opts)
      -- vim.list_extend(opts.ensure_installed, { "pyright", "black", "ruff-lsp", "ruff" })
      vim.list_extend(opts.ensure_installed, {
        "pyright",
        "black",
        "debugpy",
      })
    end,
  },
  {
    "neovim/nvim-lspconfig",
    ft = "python",
    -- config = function()
    --   local lspconfig = require("lspconfig")
    --   -- local cmp_nvim_lsp = require("cmp_nvim_lsp")
    --   -- local opts = { noremap = true, slient = true }
    --   local on_attach = require("plugins/extras/lang/on_attach").on_attach
    --
    --   -- local capabilities = cmp_nvim_lsp.default_capabilities()
    --   local capabilities = vim.lsp.protocol.make_client_capabilities()
    --   capabilities.workspace.didChangeWatchedFiles.dynamicRegistration = true
    --   lspconfig["pyright"].setup({
    --     capabilities = capabilities,
    --     on_attach = on_attach,
    --     settings = {
    --       python = {
    --         analysis = {
    --           autoImportCompletions = true,
    --           autoSearchPaths = true,
    --           diagnosticMode = "workspace",
    --           useLibraryCodeForTypes = true,
    --           useLibrarySourceForTypes = true,
    --           typeCheckingMode = "standard",
    --         },
    --       },
    --     },
    --   })
    -- end,
    opts = function(_, opts)
      vim.list_extend(opts.servers, {
        pyright = {
          enable = true,
          -- capabilities=capabilities,
          -- on_attach = on_attach_python,
          -- settings = {
          --   python = {
          --     analysis = {
          --       autoImportCompletions = true,
          --       autoSearchPaths = true,
          --       diagnosticMode = "workspace",
          --       useLibraryCodeForTypes = true,
          --       useLibrarySourceForTypes = true,
          --       typeCheckingMode = "standard",
          --     },
          --   },
          -- }
        },
      })
    end,
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
      -- local path = "~/.local/share/nvim/mason/packages/debugpy/venv/bin/python"
      require("dap-python").setup("python")
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
  {
    "Vigemus/iron.nvim",
    event = "VeryLazy",
    config = function()
      local iron = require("iron.core")

      iron.setup({
        config = {
          scratch_repl = true,
          repl_definition = {
            sh = {
              -- Can be a table or a function that
              -- returns a table (see below)
              -- command = { "fish" },
            },
            python = {
              command = { "ipython", "--no-autoindent" },
              format = require("iron.fts.common").bracketed_paste_python,
            },
          },
          repl_open_cmd = require("iron.view").split.vertical.botright(80),
          highlight = {
            italic = true,
          },
          ignore_blank_lines = true, -- ignore blank lines when sending visual select lines
        },
        keymaps = {
          send_motion = "<space>rc",
          visual_send = "<space>rc",
          -- send_file = "<space>rf",
          send_line = "<space>rl",
          send_paragraph = "<space>rp",
          send_until_cursor = "<space>ru",
          -- send_mark = "<space>rsm",
          -- mark_motion = "<space>rmc",
          -- mark_visual = "<space>rmc",
          -- remove_mark = "<space>rmd",
          -- cr = "<space>rr",
          interrupt = "<space>ri",
          exit = "<space>rq",
          -- clear = "<space>rc",
        },
      })
      vim.keymap.set("n", "<space>rt", "<cmd>IronRepl<cr>", { desc = "[r]epl [t]oggle" })
      vim.keymap.set("n", "<space>rr", "<cmd>IronRestart<cr>", { desc = "[r]epl [r]estart" })
      vim.keymap.set("n", "<space>rf", "<cmd>IronFocus<cr>", { desc = "[r]epl [f]ocus" })
      vim.keymap.set("n", "<space>rh", "<cmd>IronHide<cr>", { desc = "[r]epl [h]ide" })
    end,
  },
}
