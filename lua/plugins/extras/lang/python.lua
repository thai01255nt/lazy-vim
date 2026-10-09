-- File config gan nhat (tim nguoc len thu muc cha) co chua pattern khong
local function has_section(bufnr, file, pattern)
  local root = vim.fs.root(bufnr, { file })
  if not root then
    return false
  end
  local f = io.open(root .. "/" .. file)
  if not f then
    return false
  end
  local content = f:read("*a")
  f:close()
  return content:find(pattern) ~= nil
end

-- Detect linter theo config cua project: "ruff" | "flake8" | nil
local function detect_py_linter(bufnr)
  if vim.fs.root(bufnr, { "ruff.toml", ".ruff.toml" }) then
    return "ruff"
  end
  if vim.fs.root(bufnr, { ".flake8" }) then
    return "flake8"
  end
  if has_section(bufnr, "pyproject.toml", "%[tool%.ruff") then
    return "ruff"
  end
  if has_section(bufnr, "setup.cfg", "%[flake8%]") or has_section(bufnr, "tox.ini", "%[flake8%]") then
    return "flake8"
  end
  return nil
end

-- Config ruff cua project co bat rule isort ("I", "I001", "ALL") trong select/extend-select khong
local function ruff_selects_isort(bufnr)
  for _, file in ipairs({ "ruff.toml", ".ruff.toml", "pyproject.toml" }) do
    local root = vim.fs.root(bufnr, { file })
    local f = root and io.open(root .. "/" .. file)
    if f then
      local content = f:read("*a")
      f:close()
      if file ~= "pyproject.toml" or content:find("%[tool%.ruff") then
        for list in content:gmatch("select%s*=%s*(%b[])") do
          for rule in list:gmatch("[\"']([%w]+)[\"']") do
            if rule == "ALL" or rule:match("^I%d*$") then
              return true
            end
          end
        end
      end
    end
  end
  return false
end

-- Detect formatter theo config cua project, mac dinh black
local function detect_py_formatters(bufnr)
  local fmts = {}
  if
    vim.fs.root(bufnr, { ".isort.cfg" })
    or has_section(bufnr, "pyproject.toml", "%[tool%.isort%]")
    or has_section(bufnr, "setup.cfg", "%[isort%]")
  then
    fmts[#fmts + 1] = "isort"
  elseif detect_py_linter(bufnr) == "ruff" and ruff_selects_isort(bufnr) then
    fmts[#fmts + 1] = "ruff_organize_imports"
  end
  if has_section(bufnr, "pyproject.toml", "%[tool%.black%]") then
    fmts[#fmts + 1] = "black"
  elseif detect_py_linter(bufnr) == "ruff" then
    fmts[#fmts + 1] = "ruff_format"
  elseif
    vim.fs.root(bufnr, { ".style.yapf" })
    or has_section(bufnr, "pyproject.toml", "%[tool%.yapf%]")
    or has_section(bufnr, "setup.cfg", "%[yapf%]")
  then
    fmts[#fmts + 1] = "yapf"
  elseif has_section(bufnr, "pyproject.toml", "%[tool%.autopep8%]") then
    fmts[#fmts + 1] = "autopep8"
  else
    fmts[#fmts + 1] = "black"
  end
  return fmts
end

-- Uu tien binary trong venv cua project (.venv/venv hoac $VIRTUAL_ENV), khong co thi lay tu PATH/mason
local function venv_cmd(cmd)
  local paths = { ".venv/bin/" .. cmd, "venv/bin/" .. cmd }
  if vim.env.VIRTUAL_ENV then
    table.insert(paths, 1, vim.env.VIRTUAL_ENV .. "/bin/" .. cmd)
  end
  return require("conform.util").find_executable(paths, cmd)
end

return {
  {
    "mason-org/mason.nvim",
    opts = function(_, opts)
      -- vim.list_extend(opts.ensure_installed, { "pyright", "black", "ruff-lsp", "ruff" })
      vim.list_extend(opts.ensure_installed, {
        "pyright",
        "black",
        "debugpy",
        "ruff",
      })
    end,
  },
  {
    "neovim/nvim-lspconfig",
    opts = function(_, opts)
      opts.servers = opts.servers or {}
      -- Ruff LSP chi attach khi project co config ruff
      opts.servers.ruff = {
        root_dir = function(bufnr, on_dir)
          if detect_py_linter(bufnr) == "ruff" then
            on_dir(vim.fs.root(bufnr, { "ruff.toml", ".ruff.toml", "pyproject.toml", ".git" }))
          end
        end,
      }
      opts.servers.pyright = {
        on_attach = require("plugins/extras/lang/on_attach").on_attach,
        capabilities = {
          workspace = { didChangeWatchedFiles = { dynamicRegistration = true } },
        },
        settings = {
          python = {
            analysis = {
              autoImportCompletions = true,
              autoSearchPaths = true,
              diagnosticMode = "workspace",
              useLibraryCodeForTypes = true,
              useLibrarySourceForTypes = true,
              typeCheckingMode = "standard",
            },
          },
        },
      }
    end,
  },
  {
    "stevearc/conform.nvim",
    opts = function(_, opts)
      opts.formatters_by_ft = opts.formatters_by_ft or {}
      opts.formatters_by_ft.python = detect_py_formatters
      opts.formatters = opts.formatters or {}
      for name, cmd in pairs({ black = "black", isort = "isort", ruff_format = "ruff", ruff_organize_imports = "ruff", yapf = "yapf", autopep8 = "autopep8" }) do
        opts.formatters[name] = vim.tbl_extend("force", opts.formatters[name] or {}, { command = venv_cmd(cmd) })
      end
    end,
  },
  {
    "mfussenegger/nvim-lint",
    -- Dung opts (khong dung config) vi golang.lua da khai bao config cho nvim-lint, config cua spec sau se ghi de.
    opts = function()
      -- Project dung ruff -> ruff LSP lo diagnostics, nvim-lint khong chay.
      -- Project dung flake8 (hoac khong co config) -> flake8.
      local function py_linters()
        if detect_py_linter(0) == "ruff" then
          return {}
        end
        return { "flake8" }
      end
      vim.api.nvim_create_autocmd({ "InsertLeave", "BufWritePost" }, {
        pattern = { "*.py" },
        callback = function()
          require("lint").linters_by_ft.python = py_linters()
          require("lint").try_lint()
        end,
      })
    end,
  },
  {
    "mfussenegger/nvim-dap-python",
    ft = "python",
    dependencies = {
      "mfussenegger/nvim-dap",
      "rcarriga/nvim-dap-ui",
    },
    config = function(_, opts)
      -- local path = "~/.local/share/nvim/mason/packages/debugpy/venv/bin/python"
      require("dap-python").setup("python")
    end,
    -- keys = {
    --   {
    --     "<leader>dPt",
    --     function()
    --       require("dap-python").test_method()
    --     end,
    --     desc = "[d]ebug [P]ython run [T]est",
    --   },
    --   {
    --     "<leader>dPs",
    --     function()
    --       require("dap-python").debug_selection()
    --     end,
    --     desc = "[d]ebug [P]ython run [S]election",
    --     mode = { "v" },
    --   },
    --   {
    --     "<leader>dPc",
    --     function()
    --       require("dap-python").continue()
    --     end,
    --     desc = "[d]ebug [P]ython [c]ontinue",
    --   },
    -- },
  },
  {
    "linux-cultist/venv-selector.nvim",
    branch = "regexp",
    dependencies = {
      "mfussenegger/nvim-dap",
      "mfussenegger/nvim-dap-python",
      "mason-org/mason.nvim",
    },
    cmd = "VenvSelect",
    opts = {
      dap_enabled = true,
    },
    keys = { { "<leader>pv", "<cmd>:VenvSelect<cr>", desc = "Select VirtualEnv" } },
  },
  {
    "Vigemus/iron.nvim",
    event = "VeryLazy",
    config = function()
      local iron = require("iron.core")

      iron.setup({
        config = {
          scratch_repl = true,
          repl_definition = {
            sh = {
              -- Can be a table or a function that
              -- returns a table (see below)
              -- command = { "fish" },
            },
            python = {
              command = { "ipython", "--no-autoindent" },
              format = require("iron.fts.common").bracketed_paste_python,
            },
          },
          repl_open_cmd = require("iron.view").split.rightbelow("%25"),
          highlight = {
            italic = true,
          },
          ignore_blank_lines = true, -- ignore blank lines when sending visual select lines
        },
        keymaps = {
          send_motion = "<space>rc",
          visual_send = "<space>rc",
          -- send_file = "<space>rf",
          send_line = "<space>rl",
          send_paragraph = "<space>rp",
          send_until_cursor = "<space>ru",
          -- send_mark = "<space>rsm",
          -- mark_motion = "<space>rmc",
          -- mark_visual = "<space>rmc",
          -- remove_mark = "<space>rmd",
          -- cr = "<space>rr",
          interrupt = "<space>ri",
          exit = "<space>rq",
          -- clear = "<space>rc",
        },
      })
      vim.keymap.set("n", "<space>rt", "<cmd>IronRepl<cr>", { desc = "[r]epl [t]oggle" })
      vim.keymap.set("n", "<space>rr", "<cmd>IronRestart<cr>", { desc = "[r]epl [r]estart" })
      vim.keymap.set("n", "<space>rf", "<cmd>IronFocus<cr>", { desc = "[r]epl [f]ocus" })
      vim.keymap.set("n", "<space>rh", "<cmd>IronHide<cr>", { desc = "[r]epl [h]ide" })
      vim.keymap.set("t", "<C-[>", "<C-\\><C-n>", { desc = "[r]epl exit terminal mode" })
    end,
  },
}
