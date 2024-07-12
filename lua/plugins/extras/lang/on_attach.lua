return {
  on_attach = function(client, bufnr)
    vim.api.nvim_buf_set_option(bufnr, "omnifunc", "v:lua.vim.lsp.omnifunc")
    local bufopts = {}
    vim.keymap.set("n", "gD", vim.lsp.buf.declaration, vim.tbl_deep_extend("force", {desc: "[g]oto [D]eclarations"}))
    vim.keymap.set("n", "gd", vim.lsp.buf.definition, vim.tbl_deep_extend("force", {desc: "[g]oto [d]efinition"}))
    vim.keymap.set("n", "K", vim.lsp.buf.hover, vim.tbl_deep_extend("force", {desc: "hover"}))
    vim.keymap.set("n", "gi", vim.lsp.buf.implementation, vim.tbl_deep_extend("force", {desc: "[g]oto implementation"}))
    vim.keymap.set("n", "<C-k>", vim.lsp.buf.signature_help, vim.tbl_deep_extend("force", {desc: "signature help"}))
    vim.keymap.set("n", "<space>D", vim.lsp.buf.type_definition, vim.tbl_deep_extend("force", {desc: "type [D]efinition"}))
    vim.keymap.set("n", "<space>rn", vim.lsp.buf.rename, vim.tbl_deep_extend("force", {desc: "[r]en[n]ame variable"}))
    vim.keymap.set("n", "<space>ca", vim.lsp.buf.code_action, vim.tbl_deep_extend("force", {desc: "[c]ode [a]ction"}))
    vim.keymap.set("n", "gr", vim.lsp.buf.references, vim.tbl_deep_extend("force", {desc: "[g]oto [r]eferences"}))
  end,
}
