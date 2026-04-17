-- Per-buffer settings for FHIR Shorthand, mirrors vscode-fsh's language-configuration.json

vim.bo.commentstring = "// %s"
vim.bo.comments = "s1:/*,mb:*,ex:*/,:// "
vim.bo.expandtab = true
vim.bo.shiftwidth = 2
vim.bo.tabstop = 2
vim.bo.softtabstop = 2

-- matchpairs covers the FSH brackets: {} [] () (same as language-configuration.json)
vim.bo.matchpairs = "(:),{:},[:]"

-- Word detection — entity names can contain '-' '_' '.' ':'
vim.opt_local.iskeyword:append("-")
