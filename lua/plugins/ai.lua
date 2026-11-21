return {
  -- {
  --   "yetone/avante.nvim",
  --   -- event = "VeryLazy",
  --   -- lazy = true,
  --   version = false,
  --   opts = {
  --     provider = "copilot",
  --     providers = {
  --       copilot = {
  --         model = "gpt-5",
  --       },
  --     },
  --     behavior = {
  --       support_paste_from_clipboard = true,
  --       auto_focus_sidebar = false,
  --     },
  --     windows = {
  --       position = "bottom",
  --       sidebar_header = {
  --         enabled = true,
  --         rounded = false,
  --       },
  --       ask = {
  --         -- floating = true,
  --         start_insert = false,
  --       },
  --     },
  --     mappings = {
  --       diff = {
  --         ours = "go",
  --         theirs = "gt",
  --         all_theirs = "ga",
  --         both = "gb",
  --       },
  --     },
  --   },
  --   -- build = "make",
  --   dependencies = {
  --     "nvim-treesitter/nvim-treesitter",
  --     "stevearc/dressing.nvim",
  --     "nvim-lua/plenary.nvim",
  --     "MunifTanjim/nui.nvim",
  --     "echasnovski/mini.pick",
  --     "nvim-telescope/telescope.nvim",
  --     "hrsh7th/nvim-cmp",
  --     "ibhagwan/fzf-lua",
  --     "nvim-tree/nvim-web-devicons",
  --     "zbirenbaum/copilot.lua",
  --     {
  --       -- support for image pasting
  --       "HakonHarnes/img-clip.nvim",
  --       event = "VeryLazy",
  --       opts = {
  --         default = {
  --           embed_image_as_base64 = false,
  --           prompt_for_file_name = false,
  --           drag_and_drop = {
  --             insert_mode = true,
  --           },
  --           use_absolute_path = true,
  --         },
  --       },
  --       {
  --         -- Make sure to set this up properly if you have lazy=true
  --         "MeanderingProgrammer/render-markdown.nvim",
  --         opts = {
  --           file_types = { "markdown", "Avante" },
  --         },
  --         ft = { "markdown", "Avante" },
  --       },
  --     },
  --   },
  -- },
  {
    "supermaven-inc/supermaven-nvim",
    pin = true,
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
  {
    "folke/which-key.nvim",
    optional = true,
    opts = {
      spec = {
        { "<leader>a", group = "ai", mode = { "n", "v" } },
      },
    },
  },
  {
    "nvim-treesitter/nvim-treesitter",
    opts = { ensure_installed = { "diff", "markdown" } },
  },
  -- {
  --   "CopilotC-Nvim/CopilotChat.nvim",
  --   dependencies = {
  --     { "github/copilot.vim" }, -- or zbirenbaum/copilot.lua
  --     { "nvim-lua/plenary.nvim" },
  --   },
  --   opts = {
  --     model = "gpt-5",
  --     agent = "copilot",
  --     debug = true,
  --     window = {
  --       width = 0.3,
  --       height = 0.3,
  --       border = "single",
  --       position = "bottom",
  --       relative = "editor",
  --     },
  --     mappings = {
  --       -- Use tab for completion
  --       complete = {
  --         detail = "Use @<Tab> or /<Tab> for options.",
  --         insert = "<C-n>",
  --       },
  --       -- Close the chat
  --       close = {
  --         normal = "q",
  --         insert = "<C-c>",
  --       },
  --       -- Reset the chat buffer
  --       reset = {
  --         normal = "<C-r>",
  --         insert = "<C-r>",
  --       },
  --       -- stop = {
  --       --   normal = "<C-x>",
  --       --   insert = "<C-x>",
  --       -- },
  --       -- Submit the prompt to Copilot
  --       submit_prompt = {
  --         normal = "<C-s>",
  --         insert = "<C-s>",
  --       },
  --       -- Accept the diff
  --       accept_diff = {
  --         normal = "<C-y>",
  --         insert = "<C-y>",
  --       },
  --       -- Show help
  --       show_help = {
  --         normal = "g?",
  --       },
  --     },
  --     -- prompts = {
  --     --
  --     -- },
  --   },
  --   config = function(_, opts)
  --     require("copilot.command").disable()
  --     local chat = require("CopilotChat")
  --     chat.setup(opts)
  --
  --     local select = require("CopilotChat.select")
  --     vim.api.nvim_create_user_command("CopilotChatVisual", function(args)
  --       chat.ask(args.args, { selection = select.visual })
  --     end, { nargs = "*", range = true })
  --   end,
  --   keys = {
  --     -- Show prompts actions
  --     {
  --       "<leader>ap",
  --       function()
  --         require("CopilotChat").select_prompt({
  --           context = {
  --             "buffers",
  --           },
  --         })
  --       end,
  --       desc = "CopilotChat - Prompt actions",
  --     },
  --     {
  --       "<C-x>",
  --       function()
  --         require("CopilotChat").stop()
  --       end,
  --     },
  --
  --     {
  --       "<leader>ap",
  --       function()
  --         require("CopilotChat").select_prompt()
  --       end,
  --       mode = "x",
  --       desc = "CopilotChat - Prompt actions",
  --     },
  --     -- Code related commands
  --     { "<leader>ae", "<cmd>CopilotChatExplain<cr>", desc = "CopilotChat - Explain code" },
  --     { "<leader>at", "<cmd>CopilotChatTests<cr>", desc = "CopilotChat - Generate tests" },
  --     { "<leader>ar", "<cmd>CopilotChatReview<cr>", desc = "CopilotChat - Review code" },
  --     { "<leader>aR", "<cmd>CopilotChatRefactor<cr>", desc = "CopilotChat - Refactor code" },
  --     { "<leader>an", "<cmd>CopilotChatBetterNamings<cr>", desc = "CopilotChat - Better Naming" },
  --     -- Chat with Copilot in visual mode
  --     {
  --       "<leader>av",
  --       ":CopilotChatVisual",
  --       mode = "x",
  --       desc = "CopilotChat - Open in vertical split",
  --     },
  --     {
  --       "<leader>ax",
  --       ":CopilotChatInline",
  --       mode = "x",
  --       desc = "CopilotChat - Inline chat",
  --     },
  --     -- Custom input for CopilotChat
  --     {
  --       "<leader>ai",
  --       function()
  --         local input = vim.fn.input("Ask Copilot: ")
  --         if input ~= "" then
  --           vim.cmd("CopilotChat " .. input)
  --         end
  --       end,
  --       desc = "CopilotChat - Ask input",
  --     },
  --     -- Generate commit message based on the git diff
  --     {
  --       "<leader>am",
  --       "<cmd>CopilotChatCommit<cr>",
  --       desc = "CopilotChat - Generate commit message for all changes",
  --     },
  --     {
  --       "<leader>aq",
  --       function()
  --         local input = vim.fn.input("Quick Chat: ")
  --         if input ~= "" then
  --           require("CopilotChat").ask(input, {
  --             selection = require("CopilotChat.select").buffer,
  --           })
  --         end
  --       end,
  --       desc = "CopilotChat - Quick chat",
  --     },
  --     -- Fix the issue with diagnostic
  --     { "<leader>af", "<cmd>CopilotChatFixError<cr>", desc = "CopilotChat - Fix Diagnostic" },
  --     -- Clear buffer and chat history
  --     { "<leader>al", "<cmd>CopilotChatReset<cr>", desc = "CopilotChat - Clear buffer and chat history" },
  --     -- Toggle Copilot Chat Vsplit
  --     { "<leader>av", "<cmd>CopilotChatToggle<cr>", desc = "CopilotChat - Toggle" },
  --     -- Copilot Chat Models
  --     { "<leader>a?", "<cmd>CopilotChatModels<cr>", desc = "CopilotChat - Select Models" },
  --     -- Copilot Chat Agents
  --     { "<leader>aa", "<cmd>CopilotChatAgents<cr>", desc = "CopilotChat - Select Agents" },
  --   },
  -- },
  {
    "folke/which-key.nvim",
    optional = true,
    opts = {
      spec = {
        { "<leader>gm", group = "Copilot Chat" },
      },
    },
  },
  {
    "nvim-mini/mini.diff",
    pin = true,
    keys = {
      {
        "<leader>gd",
        function()
          -- Source stays `none` globally (gitsigns owns the sign column); the
          -- toggle attaches the git source to this buffer only while the overlay is on.
          local diff = require("mini.diff")
          local buf = vim.api.nvim_get_current_buf()
          local data = diff.get_buf_data(buf)
          local on = data and data.overlay
          vim.b[buf].minidiff_config = (not on) and { source = diff.gen_source.git() } or nil
          diff.disable(buf)
          diff.enable(buf)
          if not on then
            diff.toggle_overlay(buf)
          end
        end,
        desc = "Toggle Diff Overlay (git)",
      },
    },
    config = function()
      local diff = require("mini.diff")
      diff.setup({
        -- Disabled by default
        source = diff.gen_source.none(),
      })
    end,
  },
  -- {
  --   "olimorris/codecompanion.nvim",
  --   dependencies = {
  --     "nvim-lua/plenary.nvim",
  --     "nvim-treesitter/nvim-treesitter",
  --     {
  --       -- Make sure to set this up properly if you have lazy=true
  --       "MeanderingProgrammer/render-markdown.nvim",
  --       opts = {
  --         file_types = { "markdown", "codecompanion" },
  --       },
  --       ft = { "markdown", "codecompanion" },
  --     },
  --   },
  --   config = function()
  --     require("codecompanion").setup({
  --       strategies = {
  --         chat = {
  --           adapter = "copilot",
  --           keymaps = {
  --             toggle = {
  --               modes = {
  --                 n = "q",
  --               },
  --               callback = function()
  --                 require("codecompanion").toggle()
  --               end,
  --               description = "Toggle Chat",
  --             },
  --             close = {
  --               modes = {
  --                 n = "<C-q>",
  --               },
  --               callback = "keymaps.close",
  --               description = "Close Chat",
  --             },
  --             stop = {
  --               modes = {
  --                 n = "<C-c>",
  --                 i = "<C-c>",
  --               },
  --             },
  --             goto_file_under_cursor = {
  --               modes = { n = "gd" },
  --               index = 19,
  --               callback = "keymaps.goto_file_under_cursor",
  --               description = "Open the file under cursor in a new tab.",
  --             },
  --             fold_code = {
  --               modes = {
  --                 n = "za",
  --               },
  --               index = 15,
  --               callback = "keymaps.fold_code",
  --               description = "Fold code",
  --             },
  --             previous_chat = {
  --               modes = {
  --                 n = "gb",
  --               },
  --               index = 12,
  --               callback = "keymaps.previous_chat",
  --               description = "Previous Chat",
  --             },
  --             next_chat = {
  --               modes = {
  --                 n = "gf",
  --               },
  --               index = 12,
  --               callback = "keymaps.previous_chat",
  --               description = "Previous Chat",
  --             },
  --           },
  --         },
  --         inline = {
  --           adapter = "copilot",
  --           keymaps = {
  --             reject_change = {
  --               modes = {
  --                 n = "gt",
  --               },
  --               index = 2,
  --               callback = "keymaps.reject_change",
  --               description = "Reject change",
  --             },
  --           },
  --         },
  --         agent = {
  --           adapter = "copilot",
  --         },
  --       },
  --       adapters = {
  --         copilot = function()
  --           return require("codecompanion.adapters").extend("copilot", {
  --             schema = {
  --               model = {
  --                 default = "gpt-5",
  --                 -- default = "gpt-4.1",
  --                 -- default = "claude-sonnet-4",
  --               },
  --             },
  --           })
  --         end,
  --       },
  --       display = {
  --         chat = {
  --           window = {
  --             width = 0.3,
  --           },
  --           show_header_separator = true,
  --         },
  --         diff = {
  --           provider = "mini_diff",
  --         },
  --       },
  --       auto_scoll = false,
  --       prompt_library = {
  --         ["planning-mode"] = {
  --           strategy = "chat",
  --           description = "planning-mode",
  --           opts = {
  --             short_name = "planning-mode",
  --             is_slash_cmd = true,
  --           },
  --           prompts = {
  --             { role = "system", content = planning_mode, opts = { visible = false } },
  --           },
  --         },
  --         ["tasks-mode"] = {
  --           strategy = "chat",
  --           description = "tasks-mode",
  --           opts = {
  --             short_name = "tasks-mode",
  --             is_slash_cmd = true,
  --           },
  --           prompts = {
  --             { role = "system", content = tasks_mode, opts = { visible = false } },
  --           },
  --         },
  --         ["skeleton-mode"] = {
  --           strategy = "chat",
  --           description = "skeleton-mode",
  --           opts = {
  --             short_name = "skeleton-mode",
  --             is_slash_cmd = true,
  --           },
  --           prompts = {
  --             { role = "system", content = skeleton_mode, opts = { visible = false } },
  --           },
  --         },
  --         ["implement-mode"] = {
  --           strategy = "chat",
  --           description = "implement-mode",
  --           opts = {
  --             short_name = "implement-mode",
  --             is_slash_cmd = true,
  --           },
  --           prompts = {
  --             { role = "system", content = implement_mode, opts = { visible = false } },
  --           },
  --         },
  --         ["core-rules"] = {
  --           strategy = "chat",
  --           description = "core-rules",
  --           opts = {
  --             short_name = "core-rules",
  --             ignore_system_prompt = true,
  --           },
  --           prompts = {
  --             {
  --               role = "system",
  --               content = core_rules,
  --               opts = {
  --                 visible = false,
  --               },
  --             },
  --             {
  --               role = "system",
  --               content = core_rules,
  --               opts = {
  --                 visible = false,
  --               },
  --             },
  --             {
  --               role = "user",
  --               content = "\n@{full_stack_dev} \n",
  --             },
  --           },
  --         },
  --         ["project-overview-mode"] = {
  --           strategy = "chat",
  --           description = "project-overview-mode",
  --           opts = {
  --             short_name = "project-overview-mode",
  --             is_slash_cmd = true,
  --           },
  --           prompts = {
  --             {
  --               role = "sytem",
  --               content = project_overview_mode,
  --               opts = { visible = false },
  --             },
  --           },
  --         },
  --       },
  --     })
  --     -- vim.api.nvim_set_keymap("n", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
  --     -- vim.api.nvim_set_keymap("v", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
  --     vim.api.nvim_set_keymap("n", "<leader>ac", "<cmd>CodeCompanionChat Toggle<cr>", { noremap = true, silent = true })
  --     vim.api.nvim_set_keymap("v", "<leader>ac", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })
  --     vim.api.nvim_set_keymap("n", "<leader>an", "<cmd>CodeCompanionChat<cr>", { noremap = true, silent = true })
  --     vim.api.nvim_set_keymap("v", "<leader>ai", "<cmd>CodeCompanion<cr>", { noremap = true, silent = true })
  --     vim.keymap.set("n", "<leader>aw", function()
  --       require("codecompanion").prompt("core-rules")
  --     end, { noremap = true, silent = true })
  --     -- vim.api.nvim_set_keymap("v", "ga", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })
  --
  --     -- Expand 'cc' into 'CodeCompanion' in the command line
  --     -- vim.cmd([[cab cc CodeCompanion]])
  --   end,
  -- },
  {
    "coder/claudecode.nvim",
    pin = true,
    dependencies = { "folke/snacks.nvim" },
    opts = {
      terminal = {
        split_side = "left",
        split_width_percentage = 0.4,
        -- <A-a> last tab page (lua/term_tabs.lua)
        snacks_win_opts = { keys = require("term_tabs").term_keys() },
      },
    },
    init = function()
      -- Claude Code opens at the far left; when agent-manager (<leader>aA) is
      -- shown, move agent-manager back to the far left so the layout is
      -- agent-manager | Claude Code | editor. Agent-manager keeps the width it
      -- opened with (w:am_width), also after a window next to it closes.
      local function agent_manager_win()
        for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
          local tag = vim.w[win].snacks_win
          if tag and tag.position == "agent-manager" then
            return win
          end
        end
      end
      local function restore_am_width(am)
        if vim.w[am].am_width then
          vim.api.nvim_win_set_width(am, vim.w[am].am_width)
        end
      end
      local group = vim.api.nvim_create_augroup("claude_right_of_agent_manager", { clear = true })
      vim.api.nvim_create_autocmd("BufWinEnter", {
        group = group,
        callback = function(ev)
          if not package.loaded["claudecode.terminal"] then
            return
          end
          vim.schedule(function()
            if require("claudecode.terminal").get_active_terminal_bufnr() ~= ev.buf then
              return
            end
            local cc, am = vim.fn.bufwinid(ev.buf), agent_manager_win()
            if cc == -1 or not am then
              return
            end
            local cc_width = vim.api.nvim_win_get_width(cc)
            if vim.api.nvim_win_get_position(am)[2] > vim.api.nvim_win_get_position(cc)[2] then
              vim.api.nvim_win_call(am, function()
                vim.cmd.wincmd("H")
              end)
            end
            restore_am_width(am)
            vim.api.nvim_win_set_width(cc, cc_width)
          end)
        end,
      })
      vim.api.nvim_create_autocmd("WinClosed", {
        group = group,
        callback = function()
          vim.schedule(function()
            local am = agent_manager_win()
            if am then
              restore_am_width(am)
            end
          end)
        end,
      })
    end,
    keys = {
      { "<leader>aC", "<cmd>ClaudeCode<cr><cmd>ClaudeCode<cr>", desc = "Connect Claude" },
      { "<leader>a", nil, desc = "AI/Claude Code" },
      { "<leader>at", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
      { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
      { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume Claude" },
      { "<leader>ac", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude" },
      {
        "<leader>aA",
        function()
          -- agent-manager in a left split (50%): same session as the tmux
          -- window, live (one claude process).
          local keys = require("term_tabs").term_keys()
          -- agent-manager uses <esc> a lot: no double-esc to normal mode
          keys.term_normal = false
          local term = Snacks.terminal.toggle("agent-manager", {
            win = {
              position = "left",
              width = 0.5,
              -- keep its width when Claude Code opens beside it
              wo = { winfixwidth = true },
              stack = false,
              keys = keys,
            },
          })
          -- Snacks stacks a new left split under any window tagged
          -- position = "left" and equalizes their heights. Retag this one so
          -- Claude Code opens as its own column at the far left instead.
          if term and term.win and vim.api.nvim_win_is_valid(term.win) then
            local tag = vim.w[term.win].snacks_win
            if tag then
              tag.position = "agent-manager"
              vim.w[term.win].snacks_win = tag
            end
            vim.w[term.win].am_width = vim.api.nvim_win_get_width(term.win)
          end
          -- a re-shown window lands in normal mode, where typing hits E21
          -- ('modifiable' is off): always go back to terminal mode
          vim.schedule(function()
            if term and term:valid() and vim.api.nvim_get_current_buf() == term.buf then
              vim.cmd.startinsert()
            end
          end)
        end,
        desc = "Agent Manager (left split)",
      },
      {
        "<A-a>",
        function()
          require("term_tabs").last_tab()
        end,
        desc = "Last tab page",
      },
      { "<leader>am", "<cmd>ClaudeCodeSelectModel<cr>", desc = "Select Claude model" },
      { "<leader>ab", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add current buffer" },
      { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send to Claude" },
      {
        "<leader>as",
        "<cmd>ClaudeCodeTreeAdd<cr>",
        desc = "Add file",
        ft = { "NvimTree", "neo-tree", "oil", "minifiles", "netrw", "snacks_picker_list" },
      },
      -- Diff management
      { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
      { "<leader>ad", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Deny diff" },
    },
  },
}
