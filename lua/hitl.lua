-- hitl id jump: the hitl id under the cursor (PWR-R1, PWR-R1.S2, PWR-T1.AC2, PWR-D1, …) → where it is defined and used,
-- from `hitl-index where <id> --json` (claude/hitl/scripts/cmd/where.mjs). Keymaps and :HitlWhere: lua/plugins/hitl.lua.
local M = {}

M.ROLE_ORDER = { "def", "test", "symbol", "brief", "ref" }

-- ---------------------------------------------------------------- id grammar (scripts/lib/specids.mjs, tasksmd.mjs)
-- Spec ids (R, BR, UC) take a key of a capital + 1–5 capitals/digits (legacy keys like LACC); task, AC, decision and
-- amendment ids a key of 2–5 capitals. Suffix: `.S<k>` after a requirement, `.AC<k>` after a task.
local function valid_key(key, kind)
  if kind == "R" or kind == "BR" or kind == "UC" then
    return #key >= 2 and #key <= 6 and key:match("^%u[%u%d]+$") ~= nil
  end
  return #key >= 2 and #key <= 5 and key:match("^%u+$") ~= nil
end
local KINDS = { R = true, BR = true, UC = true, T = true, D = true, A = true }
local SUFFIX = { R = "S", T = "AC" }

--- Every hitl id in `line`: { {id, s, e} } with 1-based byte columns, on the same id boundaries as the CLI
--- (`PWR-R1` is not read out of `PWR-R10`, `XPWR-R1`'s key is XPWR, `PWR-R1.AC2` is no id).
function M.ids_in(line)
  local out, init = {}, 1
  while true do
    local s, e, key, kind = line:find("(%u[%u%d]*)%-(%u+)%d+", init)
    if not s then
      break
    end
    init = e + 1
    local prev = s > 1 and line:sub(s - 1, s - 1) or ""
    if KINDS[kind] and valid_key(key, kind) and not prev:match("[%w_]") then
      local ok = true
      local sfx_s, sfx_e, sfx = line:find("^%.(%u+)%d+", e + 1)
      if sfx_s then
        if SUFFIX[kind] == sfx then
          e = sfx_e
          init = e + 1
        else
          ok = false -- `PWR-R1.AC2`, `PWR-T1.S2`: not an id
        end
      end
      local after = line:sub(e + 1, e + 2)
      if after:match("^[%w_]") or after:match("^%.%w") then
        ok = false
      end
      if ok then
        out[#out + 1] = { id = line:sub(s, e), s = s, e = e }
      end
    end
  end
  return out
end

--- The id at byte column `col` (1-based) of `line`; else the first id after it on the line; nil when none.
function M.id_at(line, col)
  local after
  for _, c in ipairs(M.ids_in(line)) do
    if col >= c.s and col <= c.e then
      return c.id
    end
    if not after and c.s > col then
      after = c.id
    end
  end
  return after
end

function M.id_under_cursor()
  local col = vim.api.nvim_win_get_cursor(0)[2] + 1
  return M.id_at(vim.api.nvim_get_current_line(), col)
end

-- ---------------------------------------------------------------- CLI location
local function semver_less(a, b)
  local pa, pb = vim.split(a, "[.-]"), vim.split(b, "[.-]")
  for i = 1, math.max(#pa, #pb) do
    local x, y = tonumber(pa[i]) or -1, tonumber(pb[i]) or -1
    if x ~= y then
      return x < y
    end
  end
  return false
end

--- True when the hitl-index at `bin` knows `where` (bin/../scripts/cmd/where.mjs; an older install does not).
local function has_where(bin)
  local real = vim.uv.fs_realpath(bin)
  return real ~= nil and vim.uv.fs_stat(vim.fs.dirname(vim.fs.dirname(real)) .. "/scripts/cmd/where.mjs") ~= nil
end

--- The hitl-index command (a list): vim.g.hitl_index, else hitl-index on $PATH, else the newest installed plugin
--- version (~/.claude/plugins/cache/*/hitl/<version>/bin/hitl-index, semantic order), else the source checkout.
function M.cli()
  local g = vim.g.hitl_index
  if g and g ~= "" then
    return type(g) == "table" and g or { g }
  end
  local onpath = vim.fn.exepath("hitl-index")
  if onpath ~= "" and has_where(onpath) then
    return { onpath }
  end
  local home = vim.uv.os_homedir()
  local found = {}
  for _, bin in ipairs(vim.fn.glob(home .. "/.claude/plugins/cache/*/hitl/*/bin/hitl-index", false, true)) do
    local version = vim.fs.basename(vim.fs.dirname(vim.fs.dirname(bin)))
    if has_where(bin) then
      found[#found + 1] = { bin = bin, version = version }
    end
  end
  table.sort(found, function(a, b)
    return semver_less(b.version, a.version)
  end)
  if found[1] then
    return { found[1].bin }
  end
  local checkout = vim.fn.stdpath("config") .. "/claude/hitl/bin/hitl-index"
  if vim.uv.fs_stat(checkout) then
    return { checkout }
  end
  return onpath ~= "" and { onpath } or nil
end

--- Project root: the nearest dir above the buffer's file (else the cwd) holding `.hitl/`.
function M.root(buf)
  local name = vim.api.nvim_buf_get_name(buf or 0)
  local start = (name ~= "" and vim.uv.fs_stat(name)) and name or vim.uv.cwd()
  return vim.fs.root(start, ".hitl")
end

-- ---------------------------------------------------------------- query
--- Runs `hitl-index where <id> --json` in `root` asynchronously; cb(result | nil, err_message | nil).
function M.query(id, root, cb)
  local cmd = M.cli()
  if not cmd then
    return cb(nil, "hitl-index not found (set vim.g.hitl_index)")
  end
  cmd = vim.list_extend(vim.deepcopy(cmd), { "where", id, "--json" })
  vim.system(cmd, { cwd = root, text = true }, function(r)
    vim.schedule(function()
      if r.code ~= 0 and r.code ~= 1 then
        local msg = vim.trim(r.stderr or "")
        return cb(nil, msg ~= "" and msg or ("hitl-index exited " .. r.code))
      end
      local ok, data = pcall(vim.json.decode, r.stdout or "")
      if not ok or type(data) ~= "table" then
        return cb(nil, "hitl-index where: unreadable output")
      end
      data.locations = data.locations or {}
      cb(data, nil)
    end)
  end)
end

-- ---------------------------------------------------------------- results
local function abs(root, loc)
  return root .. "/" .. loc.file
end

function M.label(loc)
  return string.format("%-6s · %s:%d · %s", loc.role .. (loc.archived and "*" or ""), loc.file, loc.line, loc.text)
end

function M.jump(root, loc)
  vim.cmd("normal! m'")
  local file = abs(root, loc)
  if vim.fn.fnamemodify(vim.api.nvim_buf_get_name(0), ":p") ~= vim.fn.fnamemodify(file, ":p") then
    vim.cmd.edit(vim.fn.fnameescape(file))
  end
  pcall(vim.api.nvim_win_set_cursor, 0, { loc.line, math.max((loc.col or 1) - 1, 0) })
  vim.cmd("normal! zz")
end

function M.to_quickfix(root, data, open)
  local items = {}
  for _, l in ipairs(data.locations) do
    items[#items + 1] = {
      filename = abs(root, l),
      lnum = l.line,
      col = l.col,
      text = l.role .. (l.archived and " (archived)" or "") .. ": " .. l.text,
    }
  end
  vim.fn.setqflist({}, " ", { title = "hitl where " .. data.id, items = items })
  if open ~= false then
    vim.cmd("botright copen")
  end
end

local function pick_telescope(root, data)
  local ok = pcall(require, "telescope")
  if not ok then
    return false
  end
  local pickers, finders = require("telescope.pickers"), require("telescope.finders")
  local conf, actions, state =
    require("telescope.config").values, require("telescope.actions"), require("telescope.actions.state")
  pickers
    .new({}, {
      prompt_title = "hitl where " .. data.id,
      finder = finders.new_table({
        results = data.locations,
        entry_maker = function(l)
          return {
            value = l,
            display = M.label(l),
            ordinal = M.label(l),
            filename = abs(root, l),
            lnum = l.line,
            col = l.col,
            text = l.text,
          }
        end,
      }),
      sorter = conf.generic_sorter({}),
      previewer = conf.grep_previewer({}),
      attach_mappings = function(bufnr)
        actions.select_default:replace(function()
          local e = state.get_selected_entry()
          actions.close(bufnr)
          if e then
            M.jump(root, e.value)
          end
        end)
        return true -- <C-q> (send to quickfix) keeps working
      end,
    })
    :find()
  return true
end

local function pick_snacks(root, data)
  if not (_G.Snacks and Snacks.picker) then
    return false
  end
  local items = {}
  for i, l in ipairs(data.locations) do
    items[i] = { idx = i, text = M.label(l), file = abs(root, l), pos = { l.line, math.max(l.col - 1, 0) }, hitl = l } -- not `loc`: snacks reads that as an LSP location
  end
  Snacks.picker({
    title = "hitl where " .. data.id,
    items = items,
    format = "text",
    preview = "file",
    confirm = function(picker, item)
      picker:close()
      if item then
        M.jump(root, item.hitl)
      end
    end,
  })
  return true
end

--- A picker over the locations: LazyVim's picker (vim.g.lazyvim_picker: telescope or snacks), else vim.ui.select.
function M.pick(root, data)
  local want = vim.g.lazyvim_picker
  local order = want == "telescope" and { pick_telescope, pick_snacks } or { pick_snacks, pick_telescope }
  for _, f in ipairs(order) do
    if f(root, data) then
      return
    end
  end
  vim.ui.select(data.locations, { prompt = "hitl where " .. data.id, format_item = M.label }, function(l)
    if l then
      M.jump(root, l)
    end
  end)
end

--- The `def` locations of `data`, active ones only when any exists (an archived def is the old version).
local function defs_of(data)
  local active, archived = {}, {}
  for _, l in ipairs(data.locations) do
    if l.role == "def" then
      table.insert(l.archived and archived or active, l)
    end
  end
  return #active > 0 and active or archived
end

--- Jump to `id` (default: the id under the cursor). 0 locations: a warning; 1: jump; several: a picker.
--- opts.qf: send every location to the quickfix list instead. opts.def: only where it is defined (several defs, e.g.
--- a spec delta and the living spec: a picker over them; no def: a warning, then the picker over every location).
function M.where(id, opts)
  opts = opts or {}
  id = (id and id ~= "") and id or M.id_under_cursor()
  if not id then
    return vim.notify("No hitl id under the cursor", vim.log.levels.WARN, { title = "hitl" })
  end
  local root = M.root(0)
  if not root then
    return vim.notify("Not in a hitl project (no .hitl/ above this file)", vim.log.levels.WARN, { title = "hitl" })
  end
  M.query(id, root, function(data, err)
    if err then
      return vim.notify(err, vim.log.levels.ERROR, { title = "hitl" })
    end
    local n = #data.locations
    if n == 0 then
      vim.notify((data.id or id) .. " not found", vim.log.levels.WARN, { title = "hitl" })
    elseif opts.qf then
      M.to_quickfix(root, data)
    elseif opts.def then
      local defs = defs_of(data)
      if #defs == 1 then
        M.jump(root, defs[1])
      elseif #defs > 1 then
        M.pick(root, { id = data.id, locations = defs })
      else
        vim.notify(
          (data.id or id) .. ": no definition found, showing every location",
          vim.log.levels.WARN,
          { title = "hitl" }
        )
        M.pick(root, data)
      end
    elseif n == 1 then
      M.jump(root, data.locations[1])
    else
      M.pick(root, data)
    end
  end)
end

function M.setup()
  vim.api.nvim_create_user_command("HitlWhere", function(c)
    M.where(c.args, { qf = c.bang })
  end, { nargs = "?", bang = true, desc = "hitl: where an id is defined and used (! = quickfix)" })
  vim.api.nvim_create_user_command("HitlDef", function(c)
    M.where(c.args, { def = true })
  end, { nargs = "?", desc = "hitl: jump to where an id is defined" })
end

return M
