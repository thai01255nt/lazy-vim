// ts-compiler@<version>: uses the project's own `typescript` (ts.createSourceFile only, no Program) (§E.3.2).
// Slicing rules match ts-lite: shared helpers produce docs, comment lines and stub flags from the same lexer.
import { createRequire } from "node:module";
import { join } from "node:path";
import { isTestFile } from "../config.mjs";
import { lex, lineIndex, docFor, commentLinesIn, isStubTs, finishCalls, TEST_FNS, TEST_MODS, PRIMITIVES } from "./ts-lite.mjs";

const cache = new Map();
export function loadTs(root) {
  const key = process.env.HITL_TYPESCRIPT || root;
  if (cache.has(key)) return cache.get(key);
  let ts = null;
  try {
    const req = createRequire(join(root || process.cwd(), "package.json"));
    ts = req(process.env.HITL_TYPESCRIPT || req.resolve("typescript"));
    if (typeof ts.createSourceFile !== "function") ts = null;
  } catch { ts = null; }
  cache.set(key, ts);
  return ts;
}

function parseOne(ts, file, config) {
  const src = file.content;
  const kind = /\.(tsx|jsx)$/.test(file.path) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(file.path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file.path, src, ts.ScriptTarget.Latest, true, kind);
  const { comments } = lex(src);
  const lineOf = lineIndex(src);
  const isTest = isTestFile(file.path, config);
  const symbols = [], imports = [];
  const S = (n) => n.getStart(sf);
  const hasMod = (n, k) => !!n.modifiers?.some((m) => m.kind === k);
  const K = ts.SyntaxKind;

  const typeRef = (t) => {
    if (!t || !ts.isTypeReferenceNode(t)) return null;
    const name = t.typeName.getText(sf);
    return PRIMITIVES.has(name) ? null : name;
  };
  const paramLocals = (fn) => {
    const locals = {}, props = {};
    for (const p of fn.parameters || []) {
      if (!ts.isIdentifier(p.name)) continue;
      const ty = typeRef(p.type);
      if (!ty) continue;
      locals[p.name.text] = ty;
      if (p.modifiers?.some((m) => [K.PublicKeyword, K.PrivateKeyword, K.ProtectedKeyword, K.ReadonlyKeyword, K.OverrideKeyword].includes(m.kind))) props["this." + p.name.text] = ty;
    }
    return { locals, props };
  };
  const pureChain = (e) => ts.isIdentifier(e) || e.kind === K.ThisKeyword || e.kind === K.SuperKeyword
    || (ts.isPropertyAccessExpression(e) && !ts.isPrivateIdentifier(e.name) && pureChain(e.expression));
  const calls = (node) => {
    const out = [];
    const visit = (n) => {
      if (ts.isCallExpression(n) && !n.typeArguments && !n.questionDotToken) {
        const e = n.expression;
        if (ts.isIdentifier(e)) out.push({ name: e.text, qualifier: null, pos: S(e) });
        else if (ts.isPropertyAccessExpression(e) && !ts.isPrivateIdentifier(e.name))
          out.push({ name: e.name.text, qualifier: pureChain(e.expression) ? e.expression.getText(sf).replace(/\s+/g, "").replace(/\?\./g, ".") : "(expr)", pos: S(e.name) });
      }
      ts.forEachChild(n, visit);
    };
    if (node) visit(node);
    return finishCalls(out);
  };

  const emit = (o) => {
    const { doc, docSpan } = docFor(src, comments, o.docFrom, o.sigStart, lineOf);
    const fnLike = o.kind === "function" || o.kind === "method" || o.kind === "test";
    let bodyS = -1, bodyE = -1, bodySpan = null;
    if (o.block) { bodyS = o.block.getStart(sf) + 1; bodyE = o.block.end - 1; bodySpan = { start: lineOf(bodyS - 1), end: lineOf(bodyE) }; }
    else if (o.members) { bodyS = o.members.pos; bodyE = o.end - 1; bodySpan = { start: lineOf(bodyS - 1), end: lineOf(bodyE) }; }
    else if (o.expr) { bodyS = S(o.expr); bodyE = o.expr.end; bodySpan = { start: lineOf(bodyS), end: lineOf(bodyE - 1) }; }
    const bodyText = bodyS < 0 ? "" : src.slice(bodyS, bodyE);
    symbols.push({
      name: o.name, kind: o.kind, parentName: o.parentName ?? null, exported: !!o.exported, async: !!o.async,
      sigText: src.slice(o.sigStart, o.sigEnd).trim(),
      doc, bodyText,
      commentLines: fnLike && bodyS >= 0 ? commentLinesIn(src, comments, bodyS, bodyE, lineOf) : [],
      stub: fnLike && bodyS >= 0 ? isStubTs(bodyText) : false,
      locals: o.locals || {}, calleesRaw: fnLike ? calls(o.block || o.expr) : [],
      span: { start: lineOf(o.sigStart), end: lineOf(o.end - 1) }, docSpan, bodySpan, test: o.test || null,
    });
  };

  let pending = null;
  const withOverload = (name, node) => {
    if (!node.body) { if (!pending || pending.name !== name) pending = { name, sigStart: S(node), docFrom: node.pos }; return null; }
    const r = pending && pending.name === name ? pending : { sigStart: S(node), docFrom: node.pos };
    pending = null;
    return r;
  };
  const memberName = (m) => (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name) ? m.name.text : ts.isStringLiteral(m.name) || ts.isNumericLiteral(m.name) ? m.name.text : m.name.getText(sf));

  function classDecl(st) {
    const name = st.name ? st.name.text : "default";
    const exported = hasMod(st, K.ExportKeyword);
    emit({ name, kind: "class", exported, sigStart: S(st), sigEnd: st.members.pos - 1, docFrom: st.pos, members: st.members, end: st.end });
    const classLocals = {}, members = [];
    for (const m of st.members) {
      if (ts.isPropertyDeclaration(m)) {
        const ty = typeRef(m.type);
        if (ty) classLocals["this." + memberName(m)] = ty;
        continue;
      }
      const isCtor = ts.isConstructorDeclaration(m);
      if (!(ts.isMethodDeclaration(m) || isCtor || ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m))) { pending = null; continue; }
      const nm = isCtor ? "constructor" : ts.isSetAccessorDeclaration(m) ? `${memberName(m)}$set` : memberName(m);
      const ov = withOverload(`${name}.${nm}`, m);
      if (!ov) continue;
      const { locals, props } = paramLocals(m);
      Object.assign(classLocals, props);
      if (isCtor) {
        const visit = (n) => {
          if (ts.isBinaryExpression(n) && n.operatorToken.kind === K.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === K.ThisKeyword
            && ts.isNewExpression(n.right) && (ts.isIdentifier(n.right.expression) || ts.isPropertyAccessExpression(n.right.expression)) && pureChain(n.right.expression))
            classLocals["this." + n.left.name.text] = n.right.expression.getText(sf).replace(/\s+/g, "");
          ts.forEachChild(n, visit);
        };
        visit(m.body);
      }
      members.push({ name: `${name}.${nm}`, kind: "method", parentName: name,
        exported: exported && !hasMod(m, K.PrivateKeyword) && !(m.name && ts.isPrivateIdentifier(m.name)), async: hasMod(m, K.AsyncKeyword),
        sigStart: ov.sigStart, sigEnd: S(m.body), docFrom: ov.docFrom, block: m.body, end: m.end, locals });
    }
    pending = null;
    for (const m of members) { m.locals = { ...classLocals, ...m.locals }; emit(m); }
  }

  function testCall(st, scope) {
    const call = st.expression;
    if (!ts.isCallExpression(call) || !call.arguments.length) return false;
    let e = call.expression;
    const mods = [];
    if (ts.isCallExpression(e)) { // it.each(table)("title", fn)
      if (!ts.isPropertyAccessExpression(e.expression) || e.expression.name.text !== "each") return false;
      e = e.expression;
    }
    while (ts.isPropertyAccessExpression(e) && TEST_MODS.has(e.name.text)) { mods.unshift(e.name.text); e = e.expression; }
    if (!ts.isIdentifier(e) || !TEST_FNS.has(e.text)) return false;
    const arg0 = call.arguments[0];
    const title = ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0) ? arg0.text : arg0.getText(sf);
    const cb = call.arguments.slice(1).find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    const isSuite = e.text === "describe" || e.text === "suite";
    const mode = mods.includes("todo") || !cb ? "todo" : mods.includes("skip") ? "skip" : "active";
    const titlePath = [...scope.path, title];
    const name = titlePath.join(" > ");
    const block = cb && ts.isBlock(cb.body) ? cb.body : null;
    emit({ name, kind: isSuite ? "suite" : "test", parentName: scope.parent, sigStart: S(call), sigEnd: arg0.end, docFrom: st.pos,
      block, expr: cb && !block ? cb.body : null, end: call.end, test: { titlePath, mode } });
    if (isSuite && block) statements(block.statements, { path: titlePath, parent: name });
    return true;
  }

  function statements(list, scope) {
    for (const st of list) {
      const top = scope.top;
      if (top && ts.isFunctionDeclaration(st)) {
        const name = st.name ? st.name.text : "default";
        const ov = withOverload(name, st);
        if (ov) emit({ name, kind: "function", exported: hasMod(st, K.ExportKeyword), async: hasMod(st, K.AsyncKeyword), sigStart: ov.sigStart,
          sigEnd: S(st.body), docFrom: ov.docFrom, block: st.body, end: st.end, locals: paramLocals(st).locals });
        continue;
      }
      pending = null;
      if (top && ts.isClassDeclaration(st)) classDecl(st);
      else if (top && (ts.isInterfaceDeclaration(st) || ts.isEnumDeclaration(st)))
        emit({ name: st.name.text, kind: "type", exported: hasMod(st, K.ExportKeyword), sigStart: S(st), sigEnd: st.members.pos - 1, docFrom: st.pos, members: st.members, end: st.end });
      else if (top && ts.isTypeAliasDeclaration(st)) {
        const text = src.slice(S(st), st.end);
        emit({ name: st.name.text, kind: "type", exported: hasMod(st, K.ExportKeyword), sigStart: S(st), sigEnd: S(st) + text.replace(/\s*;\s*$/, "").length, docFrom: st.pos, end: st.end });
      } else if (top && ts.isVariableStatement(st)) {
        const d = st.declarationList.declarations[0];
        const init = d?.initializer;
        if (!d || !ts.isIdentifier(d.name) || !init || !(ts.isArrowFunction(init) || ts.isFunctionExpression(init))) continue;
        const arrow = ts.isArrowFunction(init);
        const block = ts.isBlock(init.body) ? init.body : null;
        emit({ name: d.name.text, kind: "function", exported: hasMod(st, K.ExportKeyword), async: hasMod(init, K.AsyncKeyword), sigStart: S(st),
          sigEnd: arrow ? S(init.equalsGreaterThanToken) : S(init.body), docFrom: st.pos, block, expr: block ? null : init.body,
          end: block ? st.end : init.body.end, locals: paramLocals(init).locals });
      } else if (top && ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const names = [];
        const c = st.importClause;
        if (c?.name) names.push({ name: "default", alias: c.name.text, typeOnly: !!c.isTypeOnly });
        if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) names.push({ name: "*", alias: c.namedBindings.name.text, typeOnly: !!c.isTypeOnly });
        else if (c?.namedBindings) for (const el of c.namedBindings.elements)
          names.push({ name: (el.propertyName || el.name).text, alias: el.propertyName ? el.name.text : null, typeOnly: !!(c.isTypeOnly || el.isTypeOnly) });
        imports.push({ from: st.moduleSpecifier.text, names });
      } else if (isTest && ts.isExpressionStatement(st)) testCall(st, scope);
    }
  }
  statements(sf.statements, { top: true, path: [], parent: null });
  return { path: file.path, lang: "ts", imports, symbols, warnings: [], parseError: null };
}

export default {
  id: "ts-compiler",
  langs: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],
  available: async (root) => !!loadTs(root),
  versionId: (root) => { const ts = loadTs(root); return ts ? `ts-compiler@${ts.version}` : null; },
  parse: async (files, ctx) => {
    const ts = loadTs(ctx?.root);
    if (!ts) throw new Error("typescript not resolvable");
    return files.map((f) => {
      try { return parseOne(ts, f, ctx?.config); }
      catch (e) { return { path: f.path, lang: "ts", imports: [], symbols: [], warnings: [], parseError: `ts-compiler: ${e.message}` }; }
    });
  },
};
