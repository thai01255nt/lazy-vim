return {
  {
    "iamcco/markdown-preview.nvim",
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
    "MeanderingProgrammer/render-markdown.nvim",
    optional = true,
    opts = {
      max_file_size = 25.0,
      debounce = 250,
      file_types = { "markdown", "copilot-chat", "codecompanion", "Avante" },
    },
    ft = { "markdown", "copilot-chat", "codecompanion", "Avante" },
    config = function()
      require("render-markdown").setup({
        code = {
          border = "thick",
        },
        win_options = {
          conceallevel = {
            default = 0,
            rendered = 0,
          },
        },
      })
      vim.api.nvim_set_keymap(
        "n",
        "<leader>mt",
        "<cmd>RenderMarkdown buf_toggle<cr>",
        { noremap = true, silent = true }
      )
    end,
  },
}
