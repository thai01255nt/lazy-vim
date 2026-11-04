return {
  {
    -- VSCode-style diff explorer: changed files on the left, side-by-side diff with
    -- line- and char-level highlights (uses DiffAdd/DiffDelete from config/autocmds.lua).
    "esmuellert/codediff.nvim",
    dependencies = { "MunifTanjim/nui.nvim" },
    cmd = "CodeDiff",
    keys = {
      { "<leader>gv", "<cmd>CodeDiff<cr>", desc = "Code Diff Explorer" },
    },
    opts = {
      explorer = {
        auto_open_on_cursor = true, -- j/k/Up/Down in the explorer also open the file's diff
      },
    },
  },
}
