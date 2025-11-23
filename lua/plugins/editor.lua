return {
  {
    { "nvim-lua/plenary.nvim", lazy = true },
    "nvim-mini/mini.hipatterns",
    event = "BufReadPre",
    opts = {
      highlighters = {
        hsl_color = {
          pattern = "hsl%(%d+,? %d+%%?,? %d+%%?%)",
          group = function(_, match)
            local utils = require("solarized-osaka.hsl")
            --- @type string, string, string
            local nh, ns, nl = match:match("hsl%((%d+),? (%d+)%%?,? (%d+)%%?%)")
            --- @type number?, number?, number?
            local h, s, l = tonumber(nh), tonumber(ns), tonumber(nl)
            --- @type string
            local hex_color = utils.hslToHex(h, s, l)
            return MiniHipatterns.compute_hex_color_group(hex_color, "bg")
          end,
        },
      },
    },
  },
  {
    "LudoPinelli/comment-box.nvim",
    config = function()
      local keymap = vim.keymap.set
      local opts = { noremap = true, silent = true }

      keymap(
        { "n", "v" },
        "<Leader>cb",
        "<Cmd>CBccbox1<CR>",
        vim.tbl_deep_extend("force", opts, { desc = "[c]omment [b]ox title" })
      )
      keymap(
        { "n", "v" },
        "<Leader>ct",
        "<Cmd>CBllline6<CR>",
        vim.tbl_deep_extend("force", opts, { desc = "[c]omment [t]itle line" })
      )
      keymap(
        "n",
        "<Leader>cl",
        "<Cmd>CBline<CR>",
        vim.tbl_deep_extend("force", opts, { desc = "[c]omment simple [l]ine" })
      )
      keymap(
        { "n", "v" },
        "<Leader>cm",
        "<Cmd>CBllbox18<CR>",
        vim.tbl_deep_extend("force", opts, { desc = "[c]omment [m]arked" })
      )
      keymap(
        { "n", "v" },
        "<Leader>cd",
        "<Cmd>CBd<CR>",
        vim.tbl_deep_extend("force", opts, { desc = "[c]omment [d]elete a box" })
      )
      keymap("n", "<leader>]b", "/\\S\\zs\\s*╭<CR>zt", { desc = "go to next [b]lock comment" })
      keymap("n", "<leader>[b", "?\\S\\zs\\s*╭<CR>zt", { desc = "go to prev [b]lock comment" })
      require("comment-box").setup({
        -- type of comments:
        --   - "line":  comment-box will always use line style comments
        --   - "block": comment-box will always use block style comments
        --   - "auto":  comment-box will use block line style comments if
        --              multiple lines are selected, line style comments
        --              otherwise
        comment_style = "line",
        doc_width = 120, -- width of the document
        box_width = 100, -- width of the boxes
        line_width = 120, -- width of the lines
        outer_blank_lines_above = false, -- insert a blank line above the box
        outer_blank_lines_below = true, -- insert a blank line below the box
        inner_blank_lines = false, -- insert a blank line above and below the text
        line_blank_line_above = false, -- insert a blank line above the line
        line_blank_line_below = true, -- insert a blank line below the line
      })
    end,
  },
  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      {
        "nvim-telescope/telescope-fzf-native.nvim",
        build = "make",
      },
      "nvim-telescope/telescope-file-browser.nvim",
    },
    keys = {
      {
        "<leader>fP",
        function()
          require("telescope.builtin").find_files({
            cwd = require("lazy.core.config").options.root,
          })
        end,
        desc = "[f]ind [P]lugins",
      },
      {
        "<leader>ff",
        function()
          local builtin = require("telescope.builtin")
          builtin.find_files({
            no_ignore = true,
            hidden = true,
          })
        end,
        desc = "[f]ind all [f]ile in your current working directory",
      },
      {
        "<leader>fg",
        function()
          local builtin = require("telescope.builtin")
          -- builtin.live_grep({
          --   additional_args = { "--hidden" },
          --   { shorten_path = true, word_match = "-w", only_sort_text = true, search = "" },
          -- })
          builtin.grep_string({ shorten_path = true, word_match = "-w", only_sort_text = true, search = "" })
        end,
        desc = "[f]ind [g]rep in current work",
      },
      {
        "\\\\",
        function()
          local builtin = require("telescope.builtin")
          builtin.buffers()
        end,
        desc = "Lists open buffers",
      },
      {
        "<leader>fh",
        function()
          local builtin = require("telescope.builtin")
          builtin.help_tags()
        end,
        desc = "[f]ind [h]hel tags",
      },
      -- {
      --   ";;",
      --   function()
      --     local builtin = require("telescope.builtin")
      --     builtin.resume()
      --   end,
      --   desc = "Resume the previous telescope picker",
      -- },
      {
        "<leader>fd",
        function()
          local builtin = require("telescope.builtin")
          builtin.diagnostics()
        end,
        desc = "[f]ind [d]iagnostics",
      },
      {
        "<leader>fT",
        function()
          local builtin = require("telescope.builtin")
          builtin.treesitter()
        end,
        desc = "[f]ind [T]reesistter",
      },
      {
        "<leader>fB",
        function()
          local telescope = require("telescope")

          local function telescope_buffer_dir()
            return vim.fn.expand("%:p:h")
          end

          telescope.extensions.file_browser.file_browser({
            path = "%:p:h",
            cwd = telescope_buffer_dir(),
            respect_gitignore = false,
            hidden = true,
            grouped = true,
            previewer = true,
            -- preview_cutoff = 9999,
            initial_mode = "normal",
            layout_config = { height = 40 },
          })
        end,
        desc = "[f]ind [B]rowser",
      },
    },
    config = function(_, opts)
      local telescope = require("telescope")
      local actions = require("telescope.actions")
      local fb_actions = require("telescope").extensions.file_browser.actions
      local is_windows = vim.fn.has("win64") == 1 or vim.fn.has("win32") == 1
      local vimfnameescape = vim.fn.fnameescape
      local winfnameescape = function(path)
        local escaped_path = vimfnameescape(path)
        if is_windows then
          local need_extra_esc = path:find("[%[%]`%$~]")
          local esc = need_extra_esc and "\\\\" or "\\"
          escaped_path = escaped_path:gsub("\\[%(%)%^&;]", esc .. "%1")
          if need_extra_esc then
            escaped_path = escaped_path:gsub("\\\\['` ]", "\\%1")
          end
        end
        return escaped_path
      end

      local select_default = function(prompt_bufnr)
        vim.fn.fnameescape = winfnameescape
        local result = actions.select_default(prompt_bufnr, "default")
        vim.fn.fnameescape = vimfnameescape
        return result
      end

      opts.defaults = vim.tbl_deep_extend("force", opts.defaults, {
        wrap_results = true,
        layout_strategy = "horizontal",
        layout_config = { prompt_position = "top" },
        sorting_strategy = "ascending",
        winblend = 0,
        mappings = {
          n = {
            ["S"] = actions.select_horizontal,
            ["V"] = actions.select_vertical,
            ["T"] = actions.select_tab,
            ["R"] = actions.select_default,
            ["<cr>"] = select_default,
          },
          i = {
            ["<cr>"] = select_default,
          },
        },
      })
      opts.pickers = {
        diagnostics = {
          theme = "ivy",
          initial_mode = "normal",
          layout_config = {
            preview_cutoff = 9999,
          },
        },
      }
      opts.extensions = {
        file_browser = {
          -- theme = "dropdown",
          -- disables netrw and use telescope-file-browser in its place
          hijack_netrw = true,
          mappings = {
            -- your custom insert mode mappingsedit
            ["n"] = {
              -- your custom normal mode mappings
              -- ["N"] = fb_actions.create,
              -- ["h"] = fb_actions.goto_parent_dir,
              ["/"] = function()
                vim.cmd("startinsert")
              end,
              ["<C-u>"] = function(prompt_bufnr)
                for i = 1, 10 do
                  actions.move_selection_previous(prompt_bufnr)
                end
              end,
              ["<C-d>"] = function(prompt_bufnr)
                for i = 1, 10 do
                  actions.move_selection_next(prompt_bufnr)
                end
              end,
              ["<PageUp>"] = actions.preview_scrolling_up,
              ["<PageDown>"] = actions.preview_scrolling_down,
              ["<cr>"] = select_default,
            },
            ["i"] = {
              ["<C-w>"] = function()
                vim.cmd([[normal! db]])
              end,
              ["<cr>"] = select_default,
            },
          },
        },
      }
      telescope.setup(opts)
      require("telescope").load_extension("fzf")
      require("telescope").load_extension("file_browser")
    end,
  },
  {
    "kdheepak/lazygit.nvim",
    lazy = true,
    cmd = {
      "LazyGit",
      "LazyGitConfig",
      "LazyGitCurrentFile",
      "LazyGitFilter",
      "LazyGitFilterCurrentFile",
    },
    -- optional for floating window border decoration
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    -- setting the keybinding for LazyGit with 'keys' is recommended in
    -- order to load the plugin when the command is run for the first time
    keys = {
      { "<leader>lg", "<cmd>LazyGit<cr>", desc = "LazyGit" },
    },
  },
}
