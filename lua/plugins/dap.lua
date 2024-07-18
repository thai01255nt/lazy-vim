return {
  -- Modify nvim-dap
  {
    "mfussenegger/nvim-dap",
    dependencies = { "rcarriga/nvim-dap-ui" },
    keys = {
      { "<leader>d", "", desc = "+debug", mode = { "n", "v" } },
      {
        "<leader>dB",
        function()
          require("dap").set_breakpoint(vim.fn.input("Breakpoint condition: "))
        end,
        desc = "[d]ebug [B]reakpoint Condition",
      },
      {
        "<leader>db",
        function()
          require("dap").toggle_breakpoint()
        end,
        desc = "Toggle [d]ebug [b]reakpoint",
      },
      {
        "<leader>dc",
        function()
          require("dap").continue()
        end,
        desc = "[d]ebug [c]ontinue",
      },
      {
        "<leader>da",
        function()
          require("dap").continue({ before = get_args })
        end,
        desc = "Run [d]ebug with [a]rgs",
      },
      {
        "<leader>dC",
        function()
          require("dap").run_to_cursor()
        end,
        desc = "Run [d]ebug to [C]ursor",
      },
      {
        "<leader>dg",
        function()
          require("dap").goto_()
        end,
        desc = "[d]ebug [g]o to Line (No Execute)",
      },
      {
        "<leader>di",
        function()
          require("dap").step_into()
        end,
        desc = "[d]ebug Step [i]nto",
      },
      {
        "<leader>dj",
        function()
          require("dap").down()
        end,
        desc = "[d]ebug [d]own",
      },
      {
        "<leader>dk",
        function()
          require("dap").up()
        end,
        desc = "[d]ebug [u]p",
      },
      {
        "<leader>dl",
        function()
          require("dap").run_last()
        end,
        desc = "[d]ebug Run [l]ast",
      },
      {
        "<leader>do",
        function()
          require("dap").step_out()
        end,
        desc = "[d]ebug Step [o]ut",
      },
      {
        "<leader>dO",
        function()
          require("dap").step_over()
        end,
        desc = "[d]ebug Step [O]ver",
      },
      {
        "<leader>dp",
        function()
          require("dap").pause()
        end,
        desc = "[d]ebug [p]ause",
      },
      {
        "<leader>dr",
        function()
          require("dap").repl.toggle()
        end,
        desc = "[d]ebug toggle [r]epl",
      },
      {
        "<leader>ds",
        function()
          require("dap").session()
        end,
        desc = "[d]ebug [s]ession",
      },
      {
        "<leader>dt",
        function()
          require("dap").terminate()
        end,
        desc = "[d]ebug [t]erminate",
      },
      {
        "<leader>dw",
        function()
          require("dap.ui.widgets").hover()
        end,
        desc = "[d]ebug [w]idget",
      },
    },
  },
  {
    "rcarriga/nvim-dap-ui",
    dependencies = { "nvim-neotest/nvim-nio" },
    keys = {
      {
        "<leader>du",
        function()
          require("dapui").toggle({})
        end,
        desc = "[d]ap [u]i",
      },
      {
        "<leader>de",
        function()
          require("dapui").eval()
        end,
        desc = "[d]ap [e]val",
        mode = { "n", "v" },
      },
    },
    config = function()
      local dap = require("dap")
      local dapui = require("dapui")
      dapui.setup()
      dap.listeners.after.event_initialized["dapui_config"] = function()
        dapui.open()
      end
      dap.listeners.before.event_terminated["dapui_config"] = function()
        dapui.close()
      end
      dap.listeners.before.event_exited["dapui_config"] = function()
        dapui.close()
      end
    end,
  },

  -- {
  --   "mfussenegger/nvim-dap",
  --   -- stylua: ignore
  --   keys = {
  --     { "<leader>dj", function() require("dap").down() end, desc = "Down in current stacktrace" },
  --     { "<leader>dk", function() require("dap").up() end, desc = "Up in current stacktrace" },
  --     { "<F5>", function() require("dap").continue() end, desc = "Continue" },
  --     { "<S-F5>", function() require("dap").restart() end, desc = "Continue" },
  --     { "<F10>", function() require("dap").step_over() end, desc = "Step Over" },
  --     { "<F11>", function() require("dap").step_into() end, desc = "Step Into" },
  --     { "<F12>", function() require("dap").step_out() end, desc = "Step Out" },
  --   },
  -- },

  -- {
  --   "jbyuki/one-small-step-for-vimkind",
  --   keys = {
  --   -- stylua: ignore
  --     { "<leader>dL", function() require("osv").launch { port = 8086 } end, desc = "Launch Lua adapter" },
  --   },
  -- },
}
