-- hitl id jump (lua/hitl.lua), keys like LSP gd/gr: <leader>hd jumps from the hitl id under the cursor (PWR-R1,
-- PWR-T1.AC2, PWR-D1, …) to where it is defined, <leader>hr lists every location (def, test, symbol, brief, ref) in a
-- picker, <leader>hq sends them all to quickfix. :HitlDef [id], :HitlWhere [id] (no id = the one under the cursor;
-- :HitlWhere! = quickfix). Every filetype: ids live in code too.
return {
  {
    "hitl", -- virtual: no plugin to install, only keys and commands for lua/hitl.lua
    virtual = true,
    cmd = { "HitlWhere", "HitlDef" },
    keys = {
      {
        "<leader>hd",
        function()
          require("hitl").where(nil, { def = true })
        end,
        desc = "hitl: go to definition of id",
      },
      {
        "<leader>hr",
        function()
          require("hitl").where()
        end,
        desc = "hitl: every location of id",
      },
      {
        "<leader>hq",
        function()
          require("hitl").where(nil, { qf = true })
        end,
        desc = "hitl: id locations to quickfix",
      },
    },
    config = function()
      require("hitl").setup()
    end,
  },
  {
    "folke/which-key.nvim",
    opts = function(_, opts)
      opts.spec = opts.spec or {}
      table.insert(opts.spec, { "<leader>h", group = "hitl" })
    end,
  },
}
