local IS_DEV = false
local prompts = {
  -- Code related prompts
  Explain = "Please explain how the following code works.",
  Review = "Please review the following code and provide suggestions for improvement.",
  Tests = "Please explain how the selected code works, then generate unit tests for it.",
  Refactor = "Please refactor the following code to improve its clarity and readability.",
  FixCode = "Please fix the following code to make it work as intended.",
  FixError = "Please explain the error in the following text and provide a solution.",
  BetterNamings = "Please provide better names for the following variables and functions.",
  Documentation = "Please provide documentation for the following code.",
  SwaggerApiDocs = "Please provide documentation for the following API using Swagger.",
  SwaggerJsDocs = "Please write JSDoc for the following API using Swagger.",
  -- Text related prompts
  Summarize = "Please summarize the following text.",
  Spelling = "Please correct any grammar and spelling errors in the following text.",
  Wording = "Please improve the grammar and wording of the following text.",
  Concise = "Please rewrite the following text to make it more concise.",
}

return {
  -- {
  --   "ravitemer/mcphub.nvim",
  --   dependencies = {
  --     "nvim-lua/plenary.nvim", -- Required for Job and HTTP requests
  --   },
  --   -- uncomment the following line to load hub lazily
  --   --cmd = "MCPHub",  -- lazy load
  --   build = "npm install -g mcp-hub@latest", -- Installs required mcp-hub npm module
  --   -- uncomment this if you don't want mcp-hub to be available globally or can't use -g
  --   -- build = "bundled_build.lua",  -- Use this and set use_bundled_binary = true in opts  (see Advanced configuration)
  --   config = function()
  --     require("mcphub").setup()
  --   end,
  -- },
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
  --     model = "claude-3.7-sonnet",
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
    "MeanderingProgrammer/render-markdown.nvim",
    optional = true,
    opts = {
      file_types = { "markdown", "copilot-chat", "codecompanion" },
    },
    ft = { "markdown", "copilot-chat", "codecompanion" },
  },
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-treesitter/nvim-treesitter",
    },
    version = "v15.4.1",
    config = function()
      require("codecompanion").setup({
        opts = {
          log_level = true,
        },
        strategies = {
          chat = {
            adapter = "copilot",
          },
          inline = {
            adapter = "copilot",
          },
          agent = {
            adapter = "copilot",
          },
        },
        adapters = {
          copilot = function()
            return require("codecompanion.adapters").extend("copilot", {
              -- env = {
              --   CODECOMPANION_TOKEN_PATH = "~/.config/github-copilot/hosts.json",
              -- },
              schema = {
                model = {
                  default = "claude-3.7-sonnet",
                },
              },
            })
          end,
        },
      })
      vim.api.nvim_set_keymap("n", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("v", "<leader>aa", "<cmd>CodeCompanionActions<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("n", "<leader>ac", "<cmd>CodeCompanionChat Toggle<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("v", "<leader>ac", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })
      vim.api.nvim_set_keymap("v", "<leader>ai", "<cmd>CodeCompanion<cr>", { noremap = true, silent = true })
      -- vim.api.nvim_set_keymap("v", "ga", "<cmd>CodeCompanionChat Add<cr>", { noremap = true, silent = true })

      -- Expand 'cc' into 'CodeCompanion' in the command line
      -- vim.cmd([[cab cc CodeCompanion]])
    end,
  },
}
