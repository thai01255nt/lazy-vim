return {
  -- Codeium.vim
  {
    "Exafunction/codeium.vim",
    lazy = true,
    init = function()
      vim.g.codeium_filetypes = {
        TelescopePrompt = false,
        ["neo-tree-popup"] = false,
        ["dap-repl"] = false,
      }
    end,
    config = function()
      -- Change '<C-g>' here to any keycode you like.
      vim.keymap.set("i", "<C-g>", function()
        return vim.fn["codeium#Accept"]()
      end, { expr = true, silent = true })
      vim.keymap.set("i", "<c-;>", function()
        return vim.fn["codeium#CycleCompletions"](1)
      end, { expr = true, silent = true })
      vim.keymap.set("i", "<c-,>", function()
        return vim.fn["codeium#CycleCompletions"](-1)
      end, { expr = true, silent = true })
      vim.keymap.set("i", "<c-z>", function()
        return vim.fn["codeium#Clear"]()
      end, { expr = true, silent = true })
    end,
  },
  {
    "hrsh7th/nvim-cmp",
    event = "InsertEnter",
    dependencies = {
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-path",
    },
    opts = function()
      local cmp = require("cmp")
      cmp.setup({
        sources = cmp.config.sources({
          { name = "nvim_lsp" },
          { name = "path" },
        }, {
          { name = "buffer" },
        }),
        mapping = cmp.mapping.preset.insert({
          ["<C-k>"] = cmp.mapping(cmp.mapping.select_prev_item(), { "i", "c" }), -- previous suggestion
          ["<C-j>"] = cmp.mapping(cmp.mapping.select_next_item(), { "i", "c" }), -- next suggestion
        }),
      })
      cmp.setup.cmdline({ "/", "?" }, {
        mapping = cmp.mapping.preset.cmdline(),
        sources = {
          { name = "buffer" },
        },
      })
    end,
  },
}
