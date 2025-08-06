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
}
