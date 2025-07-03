local function read_prompt_file(file_path)
  file_path = vim.fn.stdpath("config") .. file_path
  if vim.fn.filereadable(file_path) == 0 then
    vim.notify("prompt.txt file not found at: " .. file_path, vim.log.levels.ERROR)
    return nil
  end
  local file = io.open(file_path, "r")
  if not file then
    vim.notify("Could not open prompt.txt file", vim.log.levels.ERROR)
    return nil
  end
  local content = file:read("*a")
  file:close()
  return content
end
local IS_DEV = false
local core_rules = read_prompt_file("/prompts/core-rules.txt")
local step_project_overview = read_prompt_file("/prompts/step-project-overview.txt")
local step_planning = read_prompt_file("/prompts/step-planning.txt")
local step_tasks = read_prompt_file("/prompts/step-tasks.txt")

local step_1_context = read_prompt_file("/prompts/step-1-context.txt")
local step_2_skeleton = read_prompt_file("/prompts/step-2-skeleton.txt")
local step_3_review = read_prompt_file("/prompts/step-3-review.txt")
local step_4_enhance = read_prompt_file("/prompts/step-4-enhance.txt")

return {
  -- {
  --   "yetone/avante.nvim",
  --   -- event = "VeryLazy",
  --   -- lazy = true,
  --   version = false,
  --   opts = {
  --     provider = "copilot",
  --     system_prompt = CODING_WORKFLOW_PROMPT,
  --     providers = {
  --       copilot = {
  --         model = "gpt-4.1",
  --         -- model = "claude-sonnet-4",
  --         -- model = "claude-3.7-sonnet",
  --         -- model = "grok-3",
  --         -- model = "gemini-2.5-pro",
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
  -- {
  --   "nvim-treesitter/nvim-treesitter",
  --   opts = { ensure_installed = { "diff", "markdown" } },
  -- },
  -- {
  --   -- [NOTE]: brew install lynx if you want browser terminal
  --   dir = IS_DEV and "~/research/CopilotChat.nvim" or nil,
  --   "deathbeam/CopilotChat.nvim",
  --   dependencies = {
  --     { "github/copilot.vim" }, -- or zbirenbaum/copilot.lua
  --     { "nvim-lua/plenary.nvim" },
  --   },
  --   branch = "tools",
  --   opts = {
  --     question_header = "## User ",
  --     answer_header = "## Copilot ",
  --     error_header = "## Error ",
  --     prompts = prompts,
  --     model = "claude-sonnet-4",
  --     agent = "copilot", -- Default agent to use, see ':CopilotChatAgents' for available agents (can be specified manually in prompt via @).
  --     disable_extra_info = "no",
  --     debug = true,
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
  --   },
  --   config = function(_, opts)
  --     require("copilot.command").disable()
  --     local chat = require("CopilotChat")
  --     local hostname = io.popen("hostname"):read("*a"):gsub("%s+", "")
  --     local user = hostname or vim.env.USER or "User"
  --     opts.question_header = "  " .. user .. " "
  --     opts.answer_header = "  Copilot "
  --     -- Override the git prompts message
  --     opts.prompts.Commit = {
  --       prompt = '> #git:staged\n\nWrite commit message with commitizen convention. Write clear, informative commit messages that explain the "what" and "why" behind changes, not just the "how".',
  --     }
  --
  --     chat.setup(opts)
  --
  --     local select = require("CopilotChat.select")
  --     vim.api.nvim_create_user_command("CopilotChatVisual", function(args)
  --       chat.ask(args.args, { selection = select.visual })
  --     end, { nargs = "*", range = true })
  --
  --     -- Inline chat with Copilot
  --     vim.api.nvim_create_user_command("CopilotChatInline", function(args)
  --       chat.ask(args.args, {
  --         selection = select.visual,
  --         window = {
  --           layout = "float",
  --           relative = "cursor",
  --           width = 1,
  --           height = 0.4,
  --           row = 1,
  --         },
  --       })
  --     end, { nargs = "*", range = true })
  --
  --     -- Restore CopilotChatBuffer
  --     vim.api.nvim_create_user_command("CopilotChatBuffer", function(args)
  --       chat.ask(args.args, { selection = select.buffer })
  --     end, { nargs = "*", range = true })
  --
  --     -- Custom buffer for CopilotChat
  --     vim.api.nvim_create_autocmd("BufEnter", {
  --       pattern = "copilot-*",
  --       callback = function()
  --         vim.opt_local.relativenumber = true
  --         vim.opt_local.number = true
  --       end,
  --     })
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
  -- {
  --   "folke/which-key.nvim",
  --   optional = true,
  --   opts = {
  --     spec = {
  --       { "<leader>gm", group = "Copilot Chat" },
  --     },
  --   },
  -- },
  {
    "echasnovski/mini.diff",
    config = function()
      local diff = require("mini.diff")
      diff.setup({
        -- Disabled by default
        source = diff.gen_source.none(),
      })
    end,
  },
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-treesitter/nvim-treesitter",
      {
        -- Make sure to set this up properly if you have lazy=true
        "MeanderingProgrammer/render-markdown.nvim",
        opts = {
          file_types = { "markdown", "codecompanion" },
        },
        ft = { "markdown", "codecompanion" },
      },
    },
    config = function()
      require("codecompanion").setup({
        strategies = {
          chat = {
            adapter = "copilot",
            keymaps = {
              toggle = {
                modes = {
                  n = "q",
                },
                callback = function()
                  require("codecompanion").toggle()
                end,
                description = "Toggle Chat",
              },
              close = {
                modes = {
                  n = "<C-q>",
                },
                callback = "keymaps.close",
                description = "Close Chat",
              },
              stop = {
                modes = {
                  n = "<C-c>",
                  i = "<C-c>",
                },
              },
              goto_file_under_cursor = {
                modes = { n = "gd" },
                index = 19,
                callback = "keymaps.goto_file_under_cursor",
                description = "Open the file under cursor in a new tab.",
              },
              fold_code = {
                modes = {
                  n = "za",
                },
                index = 15,
                callback = "keymaps.fold_code",
                description = "Fold code",
              },
              previous_chat = {
                modes = {
                  n = "gb",
                },
                index = 12,
                callback = "keymaps.previous_chat",
                description = "Previous Chat",
              },
              next_chat = {
                modes = {
                  n = "gf",
                },
                index = 12,
                callback = "keymaps.previous_chat",
                description = "Previous Chat",
              },
            },
          },
          inline = {
            adapter = "copilot",
            keymaps = {
              reject_change = {
                modes = {
                  n = "gt",
                },
                index = 2,
                callback = "keymaps.reject_change",
                description = "Reject change",
              },
            },
          },
          agent = {
            adapter = "copilot",
          },
        },
        adapters = {
          copilot = function()
            return require("codecompanion.adapters").extend("copilot", {
              schema = {
                model = {
                  default = "gpt-4.1",
                },
              },
            })
          end,
        },
        display = {
          chat = {
            window = {
              width = 0.3,
            },
            show_header_separator = true,
          },
          diff = {
            provider = "mini_diff",
          },
        },
        auto_scoll = false,
        prompt_library = {
          ["Planning"] = {
            strategy = "chat",
            description = "Planning",
            opts = {
              short_name = "planning",
              is_slash_cmd = true,
            },
            prompts = {
              { role = "user", content = step_planning, opts = { visible = false } },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base**\n",
              },
            },
          },
          ["Tasks"] = {
            strategy = "chat",
            description = "Tasks",
            opts = {
              short_name = "tasks",
              is_slash_cmd = true,
            },
            references = {
              {
                type = "file",
                path = {
                  vim.fn.stdpath("config") .. "/prompts/TASKS-TEMPLATE.md",
                },
              },
            },
            prompts = {
              { role = "user", content = step_tasks, opts = { visible = false } },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base**\n",
              },
            },
          },
          ["Context"] = {
            strategy = "chat",
            description = "Context",
            opts = {
              short_name = "context",
              is_slash_cmd = true,
            },
            prompts = {
              { role = "user", content = step_1_context, opts = { visible = false } },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base**\n",
              },
            },
          },
          ["Skeleton"] = {
            strategy = "chat",
            description = "Skeleton",
            opts = {
              short_name = "skeleton",
              is_slash_cmd = true,
            },
            prompts = {
              { role = "user", content = step_2_skeleton, opts = { visible = false } },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base**\n",
              },
            },
          },
          ["Review"] = {
            strategy = "chat",
            description = "Review",
            opts = {
              short_name = "review",
              is_slash_cmd = true,
            },
            prompts = {
              { role = "user", content = step_3_review, opts = { visible = false } },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base**\n",
              },
            },
          },
          ["Enhance"] = {
            strategy = "chat",
            description = "Enhance",
            opts = {
              short_name = "enhance",
              is_slash_cmd = true,
            },
            prompts = {
              { role = "user", content = step_4_enhance, opts = { visible = false } },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base**\n",
              },
            },
          },
          ["Coding Workflow"] = {
            strategy = "chat",
            description = "Coding Workflow",
            opts = {
              short_name = "coding-workflow",
              ignore_system_prompt = true,
            },
            prompts = {
              {
                role = "system",
                content = core_rules,
                opts = {
                  visible = false,
                },
              },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base\n**",
              },
            },
          },
          ["project-overview"] = {
            strategy = "chat",
            description = "Project Overview",
            opts = {
              short_name = "project-overview",
              is_slash_cmd = true,
            },
            references = {
              {
                type = "file",
                path = {
                  vim.fn.stdpath("config") .. "/prompts/PROJECT-OVERVIEW-TEMPLATE.md",
                },
              },
            },
            prompts = {
              {
                role = "user",
                content = step_project_overview,
                opts = { visible = false },
              },
              {
                role = "user",
                content = "\n**@{full_stack_dev} work for this code base**\n",
              },
            },
          },
        },
      })
      -- vim.api.nvim_set_keymap("n", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
      -- vim.api.nvim_set_keymap("v", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("n", "<leader>ac", "<cmd>CodeCompanionChat Toggle<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("v", "<leader>ac", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("n", "<leader>an", "<cmd>CodeCompanionChat<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("v", "<leader>ai", "<cmd>CodeCompanion<cr>", { noremap = true, silent = true })
      vim.keymap.set("n", "<leader>aw", function()
        require("codecompanion").prompt("coding-workflow")
      end, { noremap = true, silent = true })
      -- vim.api.nvim_set_keymap("v", "ga", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })

      -- Expand 'cc' into 'CodeCompanion' in the command line
      -- vim.cmd([[cab cc CodeCompanion]])
    end,
  },
}
