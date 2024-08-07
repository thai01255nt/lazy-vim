return {
  {
    "folke/tokyonight.nvim",
    lazy = true,
    priority = 1000,
    config = function()
      -- vim.api.nvim_set_hl(0, "CursorColumn", { bg = "white" })
      require("tokyonight").setup({
        transparent = true,
        styles = {
          slidebars = "transparent",
          floast = "transparent",
        },
        on_colors = function(_, _)
          vim.api.nvim_set_hl(0, "CursorLine", { underline = true })
          vim.api.nvim_set_hl(0, "ColorColumn", { bg = "#414868" })
        end,
      })
    end,
  },
  {
    "craftzdog/solarized-osaka.nvim",
    lazy = false,
    priority = 1000,
    config = function()
      -- vim.api.nvim_set_hl(0, "CursorColumn", { bg = "white" })
      require("tokyonight").setup({
        transparent = true,
        styles = {
          slidebars = "transparent",
          floast = "transparent",
        },
        on_colors = function(_, _)
          vim.api.nvim_set_hl(0, "CursorLine", { underline = true })
          vim.api.nvim_set_hl(0, "ColorColumn", { bg = "#414868" })
        end,
      })
    end,
  },
}
