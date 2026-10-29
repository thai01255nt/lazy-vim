return {
  {
    "iamcco/markdown-preview.nvim",
    pin = true,
    cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
    build = "cd app && yarn install",
    init = function()
      vim.g.mkdp_filetypes = { "markdown" }
      vim.api.nvim_set_keymap("n", "<leader>mp", "<cmd>MarkdownPreview<cr>", { noremap = true, silent = true })
    end,
    ft = { "markdown" },
  },
  {
    "folke/which-key.nvim",
    optional = true,
    opts = {
      spec = {
        { "<leader>m", group = "markdown", mode = { "n" } },
      },
    },
  },
  {
    "OXY2DEV/markview.nvim",
    ft = { "markdown" },
    opts = {
      -- open markdown raw; <leader>mt renders in-buffer, <leader>mv opens the split preview
      preview = { enable = false },
    },
    config = function(_, opts)
      require("markview").setup(opts)
      -- Keep the splitview preview read-only; markview writes it with nvim_buf_set_lines,
      -- so unlock it only while markview syncs or clears it.
      local actions = require("markview.actions")
      local state = require("markview.state")
      local function set_modifiable(value)
        local buf = state.get_splitview_buffer(false)
        if buf and vim.api.nvim_buf_is_valid(buf) then
          vim.bo[buf].modifiable = value
        end
      end
      for _, name in ipairs({ "splitview_render", "splitClose" }) do
        local fn = actions[name]
        actions[name] = function(...)
          set_modifiable(true)
          local ok, err = pcall(fn, ...)
          set_modifiable(false)
          if not ok then
            error(err, 0)
          end
        end
      end
      -- The <leader>mt toggle is per buffer and survives while the buffer stays loaded;
      -- reset it once the buffer leaves every window so reopening shows it raw again.
      local group = vim.api.nvim_create_augroup("markview_reset_raw", { clear = true })
      -- a window that showed a rendered buffer keeps conceallevel=3, which still hides markup
      vim.api.nvim_create_autocmd("BufWinEnter", {
        group = group,
        pattern = "*.md",
        callback = function(args)
          local buf_state = state.get_buffer_state(args.buf, false)
          if not (buf_state and buf_state.enable) then
            vim.wo.conceallevel = 0
            vim.wo.concealcursor = ""
          end
        end,
      })
      vim.api.nvim_create_autocmd("BufWinLeave", {
        group = group,
        callback = function(args)
          local buf_state = state.get_buffer_state(args.buf, false)
          if not (buf_state and buf_state.enable) then
            return
          end
          vim.schedule(function()
            if vim.api.nvim_buf_is_valid(args.buf) and #vim.fn.win_findbuf(args.buf) == 0 then
              actions.disable(args.buf)
            end
          end)
        end,
      })
    end,
    keys = {
      { "<leader>mt", "<cmd>Markview toggle<cr>", ft = "markdown", desc = "Toggle markview" },
      { "<leader>mv", "<cmd>Markview splitToggle<cr>", ft = "markdown", desc = "Markdown split preview" },
    },
  },
}
