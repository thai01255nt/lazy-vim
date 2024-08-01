return {
  {
    "nvim-neo-tree/neo-tree.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-tree/nvim-web-devicons", -- not strictly required, but recommended
      "MunifTanjim/nui.nvim",
      -- "3rd/image.nvim", -- Optional image support in preview window: See `# Preview Mode` for more information
    },
    config = function()
      require("neo-tree").setup({
        window = {
          mappings = {
            ["Y"] = function(state)
              -- NeoTree is based on [NuiTree](https://github.com/MunifTanjim/nui.nvim/tree/main/lua/nui/tree)
              -- The node is based on [NuiNode](https://github.com/MunifTanjim/nui.nvim/tree/main/lua/nui/tree#nuitreenode)
              local node = state.tree:get_node()
              local filepath = node:get_id()
              local filename = node.name
              local modify = vim.fn.fnamemodify

              local results = {
                filepath,
                modify(filepath, ":."),
                modify(filepath, ":~"),
                filename,
                modify(filename, ":r"),
                modify(filename, ":e"),
              }

              vim.ui.select({
                "1. Absolute path: " .. results[1],
                "2. Path relative to CWD: " .. results[2],
                "3. Path relative to HOME: " .. results[3],
                "4. Filename: " .. results[4],
                "5. Filename without extension: " .. results[5],
                "6. Extension of the filename: " .. results[6],
              }, { prompt = "Choose to copy to clipboard:" }, function(choice)
                local i = tonumber(choice:sub(1, 1))
                local result = results[i]
                vim.fn.setreg("+", result)
                vim.notify("Copied: " .. result)
              end)
            end,
          },
        },
      })
    end,
    --   dependencies = { "nvim-tree/nvim-web-devicons" },
    --   lazy = false,
    --   config = function()
    --     local on_attach_change = function(bufnr)
    --       local function opts(desc)
    --         return { desc = "nvim-tree: " .. desc, buffer = bufnr, noremap = true, silent = true, nowait = true }
    --       end
    --       local api = require("nvim-tree.api")
    --       api.config.mappings.default_on_attach(bufnr)
    --       vim.keymap.set("n", "<leader>Y", api.fs.copy().relative_path, opts("Copy Relative Path"))
    --       vim.keymap.set("n", "y", api.fs.copy().filename, opts("Copy Name"))
    --       vim.keymap.set("n", "gy", api.fs.copy().absolute_path, opts("Copy Absolute Path"))
    --       vim.keymap.set("n", "ge", api.fs.copy().basename, opts("Copy Basename"))
    --     end
    --     require("nvim-tree").setup({
    --       on_attach = on_attach_change,
    --     })
    -- end,
  },
}
