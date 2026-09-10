return {
  {
    "folke/flash.nvim",
    ---@type Flash.Config
    opts = {
      modes = {
        -- show jump labels for `f`, `F`, `t`, `T`
        char = {
          jump_labels = true,
          -- jump right away when there is only one match
          jump = { autojump = true },
          -- keys you can't use as labels (so they stay usable right after the motion)
          label = { exclude = "hjkliardcwbeg" },
          -- runtime toggle: `vim.g.flash_char_labels = false` hides the labels
          config = function(opts)
            -- autohide flash when in operator-pending mode (flash default)
            opts.autohide = opts.autohide or (vim.fn.mode(true):find("no") and vim.v.operator == "y")
            opts.jump_labels = vim.g.flash_char_labels ~= false
              and vim.v.count == 0
              and vim.fn.reg_executing() == ""
              and vim.fn.reg_recording() == ""
          end,
        },
        -- show jump labels while searching with `/` and `?`
        search = {
          enabled = true,
        },
      },
    },
    keys = {
      {
        "<leader>uj",
        function()
          vim.g.flash_char_labels = vim.g.flash_char_labels == false
          vim.notify(
            "Flash jump labels (f/t): " .. (vim.g.flash_char_labels == false and "OFF" or "ON"),
            vim.log.levels.INFO,
            { title = "flash.nvim" }
          )
        end,
        desc = "Toggle Flash Jump Labels (f/t)",
      },
    },
  },
}
