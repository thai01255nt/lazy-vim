return {
  -- Codeium.vim
  -- {
  --   "Exafunction/codeium.vim",
  --   lazy = true,
  --   init = function()
  --     vim.g.codeium_filetypes = {
  --       TelescopePrompt = false,
  --       ["neo-tree-popup"] = false,
  --       ["dap-repl"] = false,
  --     }
  --   end,
  --   config = function()
  --     -- Change '<C-g>' here to any keycode you like.
  --     vim.keymap.set("i", "<C-g>", function()
  --       return vim.fn["codeium#Accept"]()
  --     end, { expr = true, silent = true })
  --     vim.keymap.set("i", "<c-;>", function()
  --       return vim.fn["codeium#CycleCompletions"](1)
  --     end, { expr = true, silent = true })
  --     vim.keymap.set("i", "<c-,>", function()
  --       return vim.fn["codeium#CycleCompletions"](-1)
  --     end, { expr = true, silent = true })
  --     vim.keymap.set("i", "<c-z>", function()
  --       return vim.fn["codeium#Clear"]()
  --     end, { expr = true, silent = true })
  --   end,
  -- },

  {
    "hrsh7th/nvim-cmp",
    event = "InsertEnter",
    dependencies = {
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-vsnip",
      "hrsh7th/vim-vsnip",
    },
    opts = function(_, opts)
      local cmp = require("cmp")
      cmp.setup.cmdline({ "/", "?" }, {
        mapping = cmp.mapping.preset.cmdline(),
        sources = {
          { name = "buffer" },
        },
      })
      local path = vim.fn.getcwd() .. "/.vscode/snippets"
      vim.g.vsnip_snippet_dir = path
      opts.sources = cmp.config.sources({
        { name = "nvim_lsp" },
        { name = "path" },
        { name = "vsnip" },
      }, {
        { name = "buffer" },
      })
      -- opts.mapping["<CR>"] = cmp.config.disable
      return opts
    end,
  },

  -- {
  --   "olimorris/codecompanion.nvim",
  --   dependencies = {
  --     "nvim-lua/plenary.nvim",
  --     "nvim-treesitter/nvim-treesitter",
  --     "hrsh7th/nvim-cmp", -- Optional: For using slash commands and variables in the chat buffer
  --     "nvim-telescope/telescope.nvim", -- Optional: For using slash commands
  --     { "stevearc/dressing.nvim", opts = {} }, -- Optional: Improves `vim.ui.select`
  --   },
  --   config = function()
  --     require("codecompanion").setup({
  --       opts = {
  --         log_level = true,
  --       },
  --       strategies = {
  --         chat = {
  --           adapter = "anthropic",
  --         },
  --         inline = {
  --           adapter = "anthropic",
  --         },
  --         agent = {
  --           adapter = "anthropic",
  --         },
  --       },
  --       adapters = {
  --         anthropic = function()
  --           return require("codecompanion.adapters").extend("anthropic", {
  --             env = {
  --               api_key = "cmd:echo $ANTHROPIC_API_KEY",
  --             },
  --             schema = {
  --               model = {
  --                 default = "claude-3-5-sonnet-20240620",
  --               },
  --             },
  --           })
  --         end,
  --       },
  --     })
  --     vim.api.nvim_set_keymap("n", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
  --     vim.api.nvim_set_keymap("v", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
  --     vim.api.nvim_set_keymap("n", "<leader>ac", "<cmd>CodeCompanionChat Toggle<cr>", { noremap = true, silent = true })
  --     vim.api.nvim_set_keymap("v", "<leader>ac", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })
  --     -- vim.api.nvim_set_keymap("v", "ga", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })
  --
  --     -- Expand 'cc' into 'CodeCompanion' in the command line
  --     -- vim.cmd([[cab cc CodeCompanion]])
  --   end,
  -- },
  -- {
  --   "yetone/avante.nvim",
  --   event = "VeryLazy",
  --   lazy = false,
  --   version = false, -- set this if you want to always pull the latest change
  --   opts = {
  --     -- add any opts here
  --     provider = "claude",
  --     auto_suggestion_provider = "claude",
  --     hints = { enable = true },
  --     behavior = {
  --       auto_suggestions = true, -- Experimental stage
  --       -- auto_set_highlight_group = true,
  --       -- auto_set_keymaps = true,
  --       -- auto_apply_diff_after_generation = false,
  --       -- support_paste_from_clipboard = false,
  --     },
  --     claude = {
  --       endpoint = "https://api.anthropic.com",
  --       model = "claude-3-haiku-20240307",
  --       temperature = 0,
  --       max_tokens = 4096,
  --     },
  --   },
  --   -- if you want to build from source then do `make BUILD_FROM_SOURCE=true`
  --   build = "make",
  --   -- build = "powershell -ExecutionPolicy Bypass -File Build.ps1 -BuildFromSource false" -- for windows
  --   dependencies = {
  --     "nvim-treesitter/nvim-treesitter",
  --     "stevearc/dressing.nvim",
  --     "nvim-lua/plenary.nvim",
  --     "MunifTanjim/nui.nvim",
  --     --- The below dependencies are optional,
  --     "nvim-tree/nvim-web-devicons", -- or echasnovski/mini.icons
  --     -- "zbirenbaum/copilot.lua", -- for providers='copilot'
  --     {
  --       -- support for image pasting
  --       "HakonHarnes/img-clip.nvim",
  --       event = "VeryLazy",
  --       opts = {
  --         -- recommended settings
  --         default = {
  --           embed_image_as_base64 = false,
  --           prompt_for_file_name = false,
  --           drag_and_drop = {
  --             insert_mode = true,
  --           },
  --           -- required for Windows users
  --           use_absolute_path = true,
  --         },
  --       },
  --     },
  --     config = function()
  --       require("avante").setup({
  --         provider = "claude",
  --         auto_suggestions_provider = "claude",
  --         hints = { enable = true },
  --         behaviour = {
  --           auto_suggestions = true,
  --         },
  --       })
  --     end,
  --     {
  --       -- Make sure to set this up properly if you have lazy=true
  --       "MeanderingProgrammer/render-markdown.nvim",
  --       opts = {
  --         file_types = { "markdown", "Avante" },
  --       },
  --       ft = { "markdown", "Avante" },
  --     },
  --   },
  -- },
  {
    "supermaven-inc/supermaven-nvim",
    config = function()
      require("supermaven-nvim").setup({
        keymaps = {
          accept_suggestion = "<Tab>",
          clear_suggestion = "<C-e>",
          accept_word = "<C-j>",
        },
      })
    end,
  },
}
