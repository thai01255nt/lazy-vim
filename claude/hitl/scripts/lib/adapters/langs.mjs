// Language table for the generic / ctags adapters: extensions, comment + string syntax, block style and
// best-effort declaration regexes (applied to *masked* source: comments blanked, string bodies blanked).
// Rule kinds: class|type (emitted containers), ns (transparent, not in names), impl (transparent, contributes
// its type name: Rust impl, Swift extension), fn (function-like), suite/test (test DSL calls with a title string).

const ID = "[A-Za-z_$][\\w$]*";
const R = (s, f = "") => new RegExp(s, f);

// ---------------------------------------------------------------- string kinds
const DQ = { open: '"', close: '"', esc: true };
const SQ = { open: "'", close: "'", esc: true };
const CHAR = { open: "'", char: true };
const BT = { open: "`", close: "`", esc: true, ml: true };
const TRIPLE = (q, o = {}) => ({ open: q.repeat(3), close: q.repeat(3), ml: true, esc: true, greedy: true, ...o });

// ---------------------------------------------------------------- shared decl fragments
const ANN = "(?:@[\\w.]+(?:\\([^)]*\\))?\\s+)*";
const JTYPE = "[\\w$.]+(?:\\s*<[^;{}()=]*>)?(?:\\s*\\[\\s*\\])*\\??";
const JMODS = "(?:(?:public|protected|private|abstract|static|final|synchronized|native|default|strictfp|transient)\\s+)*";
const KMODS = "(?:(?:public|private|protected|internal|abstract|open|final|sealed|data|enum|annotation|inner|value|inline|expect|actual|override|suspend|operator|infix|tailrec|external|const|lateinit|fun)\\s+)*";
const CSMODS = "(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial|readonly|file|required)\\s+)*";
const SWMODS = "(?:(?:public|private|fileprivate|internal|open|final|static|class|override|mutating|nonmutating|convenience|required|lazy|dynamic|nonisolated|indirect|distributed)\\s+)*";
const TESTDSL = (words) => R(`^\\s*(?:RSpec\\.)?(${words})\\s*\\(?\\s*(?=["']|[A-Z])`);

/** Ruby/Elixir/Lua: which identifiers open / close an `end` block. */
const RUBY_END = { open: ["class", "module", "def", "begin", "case", "do"], stmtOpen: ["if", "unless", "while", "until", "for"], close: ["end"] };
const ELIXIR_END = { open: ["do", "fn"], stmtOpen: [], close: ["end"] };
const LUA_END = { open: ["function", "if", "do", "repeat"], stmtOpen: [], close: ["end", "until"] };

const C_FAMILY_STRINGS = [DQ, CHAR];

export const LANGS = {
  java: {
    exts: ["java"], line: ["//"], block: [["/*", "*/"]], strings: [TRIPLE('"'), DQ, CHAR], style: "brace", ann: "at",
    decls: [
      { re: R(`^\\s*${ANN}${JMODS}(?:non-sealed\\s+|sealed\\s+)?(class|interface|enum|record|@interface)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*${ANN}${JMODS}(?:<[^>]+>\\s+)?(?:(${JTYPE})\\s+)?(${ID})\\s*\\(`), kind: "fn", typed: true },
    ],
    params: "typeName", fields: "typeName", imports: /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;/gm,
  },
  kotlin: {
    exts: ["kt", "kts"], line: ["//"], block: [["/*", "*/"]], nest: true,
    strings: [TRIPLE('"', { esc: false, interp: "${" }), { ...DQ, interp: "${" }, CHAR], style: "brace", ann: "at", exprEq: true,
    decls: [
      { re: R(`^\\s*${ANN}(?:\\w+\\s+)*companion\\s+object\\b(?:\\s+(${ID}))?`), kind: "ns" },
      { re: R(`^\\s*${ANN}${KMODS}(class|interface|object)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*${ANN}${KMODS}fun\\s+(?:<[^>]*>\\s*)?(?:([\\w.<>?,* ]+?)\\.)?(${ID}|\`[^\`]+\`)\\s*\\(`), kind: "fn", recvGroup: 1, nameGroup: 2 },
      { re: R(`^\\s*${KMODS}typealias\\s+(${ID})`), kind: "type" },
    ],
    params: "nameColonType", fields: "valColonType", imports: /^\s*import\s+([\w.*]+)/gm,
  },
  scala: {
    exts: ["scala", "sc"], line: ["//"], block: [["/*", "*/"]], nest: true,
    strings: [TRIPLE('"', { esc: false, interp: "${" }), { ...DQ, interp: "${" }, CHAR], style: "brace", ann: "at", exprEq: true,
    decls: [
      { re: R(`^\\s*${ANN}(?:(?:private|protected|final|sealed|abstract|implicit|lazy|override|case|open)(?:\\[\\w+\\])?\\s+)*(class|trait|object|enum)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*${ANN}(?:(?:private|protected|final|override|implicit|inline|transparent)(?:\\[\\w+\\])?\\s+)*def\\s+(${ID}|[^\\s\\w(\\[:]+)\\s*(?=[\\[(:=]|$)`, "m"), kind: "fn" },
      { re: TESTDSL("test|it|ignore|describe"), kind: "dsl" },
    ],
    params: "nameColonType", fields: "valColonType", imports: /^\s*import\s+([\w.]+)/gm,
  },
  groovy: {
    exts: ["groovy", "gradle"], line: ["//"], block: [["/*", "*/"]], strings: [TRIPLE('"', { interp: "${" }), TRIPLE("'"), { ...DQ, interp: "${" }, SQ], style: "brace", ann: "at",
    decls: [
      { re: R(`^\\s*${ANN}${JMODS}(class|interface|enum|trait)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*${ANN}${JMODS}(?:<[^>]+>\\s+)?(?:(def|${JTYPE})\\s+)(${ID})\\s*\\(`), kind: "fn", typed: true },
    ],
    params: "typeName", fields: "typeName", imports: /^\s*import\s+(?:static\s+)?([\w.*]+)/gm,
  },
  go: {
    exts: ["go"], line: ["//"], block: [["/*", "*/"]], strings: [DQ, CHAR, { open: "`", close: "`", ml: true }], style: "brace", ann: null,
    decls: [
      { re: R(`^func\\s+(?:\\(\\s*(?:(${ID})\\s+)?\\*?\\s*(${ID})(?:\\[[^\\]]*\\])?\\s*\\)\\s*)?(${ID})\\s*[\\[(]`), kind: "fn", goRecv: true },
      { re: R(`^type\\s+(${ID})(?:\\[[^\\]]*\\])?\\s+(struct|interface)\\b`), kind: "gotype" },
      { re: R(`^type\\s+(${ID})(?:\\[[^\\]]*\\])?\\s+(?!struct\\b|interface\\b)\\S`), kind: "type", nameGroup: 1 },
    ],
    params: "go", fields: "goStruct", imports: /^\s*(?:import\s+)?(?:\w+\s+)?"([\w./-]+)"\s*$/gm,
  },
  rust: {
    exts: ["rs"], line: ["//"], block: [["/*", "*/"]], nest: true, strings: [{ raw: "rust" }, { ...DQ, ml: true }, CHAR], style: "brace", ann: "hash",
    decls: [
      { re: R(`^\\s*(?:pub(?:\\s*\\([^)]*\\))?\\s+)?(?:default\\s+)?(?:const\\s+)?(?:async\\s+)?(?:unsafe\\s+)?(?:extern\\s+(?:"[^"]*"\\s+)?)?fn\\s+(${ID})`), kind: "fn" },
      { re: R(`^\\s*(?:pub(?:\\s*\\([^)]*\\))?\\s+)?(?:unsafe\\s+)?(struct|union|enum|trait)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*(?:pub(?:\\s*\\([^)]*\\))?\\s+)?type\\s+(${ID})`), kind: "type" },
      { re: R(`^\\s*(?:unsafe\\s+)?impl\\b(?:\\s*<[^{]*?>)?\\s+(?:!?[\\w:]+(?:<[^{]*?>)?\\s+for\\s+)?&?\\s*(?:dyn\\s+)?((?:\\w+::)*\\w+)`), kind: "impl" },
      { re: R(`^\\s*(?:pub(?:\\s*\\([^)]*\\))?\\s+)?mod\\s+(${ID})\\s*\\{`), kind: "ns" },
    ],
    params: "nameColonType", fields: "rustStruct", imports: /^\s*(?:pub\s+)?use\s+([\w:]+)/gm,
  },
  c: {
    exts: ["c", "h"], line: ["//"], block: [["/*", "*/"]], strings: C_FAMILY_STRINGS, style: "brace", ann: null,
    decls: [
      { re: R(`^(?:typedef\\s+)?(struct|union|enum)\\s+(${ID})\\s*(?:\\{|$)`), kind: "classword" },
      { re: R(`^(?!\\s)(?:(?:static|inline|extern|const|volatile|unsigned|signed|struct|enum|union|long|short|register|__inline|_Noreturn)\\s+)*${ID}(?:\\s*\\*+\\s*|\\s+)(?:\\*+\\s*)?(${ID})\\s*\\(`), kind: "fn", needType: true },
    ],
    params: null, fields: null, imports: /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm,
  },
  cpp: {
    exts: ["cpp", "cc", "cxx", "c++", "hpp", "hh", "hxx", "ipp", "tpp"], line: ["//"], block: [["/*", "*/"]], strings: [{ raw: "cpp" }, ...C_FAMILY_STRINGS], style: "brace", ann: "cpp",
    decls: [
      { re: R(`^\\s*namespace\\s*([\\w:]+)?\\s*\\{`), kind: "ns" },
      { re: R(`^\\s*(?:template\\s*<[^>]*>\\s*)?(?:typedef\\s+)?(class|struct|union|enum(?:\\s+class)?)\\s+(?:\\[\\[[^\\]]*\\]\\]\\s*)?(?:alignas\\([^)]*\\)\\s*)?(?:[A-Z_]+_EXPORT\\s+)?(${ID})(?!\\s*[;*&])`), kind: "classword" },
      { re: R(`^\\s*(TEST|TEST_F|TEST_P|TYPED_TEST)\\s*\\(\\s*(\\w+)\\s*,\\s*(\\w+)\\s*\\)`), kind: "gtest" },
      { re: R(`^\\s*(?:template\\s*<[^>]*>\\s*)?(?:(?:static|inline|virtual|explicit|constexpr|consteval|friend|extern|const|unsigned|signed|long|short|typename|struct|enum|volatile|\\[\\[\\w+\\]\\])\\s+)*(?:((?:[\\w:]+(?:\\s*<[^;{}()=]*>)?)(?:\\s*[*&]+\\s*|\\s+))+?)?((?:\\w+::)*~?${ID}|operator\\s*[^\\s(]+)\\s*\\(`), kind: "fn", typed: true, cpp: true },
    ],
    params: "typeName", fields: "typeName", imports: /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm,
  },
  csharp: {
    exts: ["cs"], line: ["//"], block: [["/*", "*/"]],
    strings: [{ open: '"""', close: '"""', ml: true, greedy: true }, { open: '$@"', close: '"', dbl: true, ml: true, interp: "{" }, { open: '@$"', close: '"', dbl: true, ml: true, interp: "{" },
      { open: '@"', close: '"', dbl: true, ml: true }, { open: '$"', close: '"', esc: true, interp: "{" }, DQ, CHAR], style: "brace", ann: "bracket", exprArrow: true,
    decls: [
      { re: R(`^\\s*namespace\\s+([\\w.]+)`), kind: "ns" },
      { re: R(`^\\s*(?:\\[[^\\]]*\\]\\s*)*${CSMODS}(class|interface|struct|enum|record(?:\\s+struct|\\s+class)?)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*(?:\\[[^\\]]*\\]\\s*)*${CSMODS}(?:(${JTYPE}|\\([^)]*\\)\\??)\\s+)?(${ID})\\s*(?:<[^>()]*>)?\\s*\\(`), kind: "fn", typed: true },
    ],
    params: "typeName", fields: "typeName", imports: /^\s*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/gm,
  },
  swift: {
    exts: ["swift"], line: ["//"], block: [["/*", "*/"]], nest: true,
    strings: [{ raw: "swift" }, TRIPLE('"', { interp: "\\(" }), { ...DQ, interp: "\\(" }], style: "brace", ann: "at",
    decls: [
      { re: R(`^\\s*${ANN}${SWMODS}extension\\s+([\\w.]+)`), kind: "impl" },
      { re: R(`^\\s*${ANN}${SWMODS}(?:final\\s+)?(class|struct|enum|protocol|actor)\\s+(?!func\\b|var\\b|let\\b)(${ID})`), kind: "classword" },
      { re: R(`^\\s*${ANN}${SWMODS}func\\s+(${ID}|[^\\s\\w(<]+)\\s*[<(]`), kind: "fn" },
      { re: R(`^\\s*${ANN}${SWMODS}(init|deinit)[?!]?\\s*[<({]`), kind: "fn" },
    ],
    params: "swift", fields: "valColonType", imports: /^\s*import\s+(?:\w+\s+)?([\w.]+)/gm,
  },
  php: {
    exts: ["php", "phtml"], line: ["//", "#"], block: [["/*", "*/"]], strings: [{ raw: "phpheredoc" }, { ...DQ, ml: true }, { open: "'", close: "'", esc: true, ml: true }],
    style: "brace", ann: "phpattr", hashGuard: "php",
    decls: [
      { re: R(`^\\s*namespace\\s+([\\w\\\\]+)\\s*\\{`), kind: "ns" },
      { re: R(`^\\s*(?:(?:abstract|final|readonly)\\s+)*(class|interface|trait|enum)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*(?:#\\[[^\\]]*\\]\\s*)*(?:(?:public|private|protected|static|abstract|final)\\s+)*function\\s+&?(${ID})\\s*\\(`), kind: "fn" },
    ],
    params: "php", fields: null, imports: /^\s*use\s+([\w\\]+)/gm,
  },
  ruby: {
    exts: ["rb", "rake", "gemspec"], files: ["Rakefile", "Gemfile"], line: ["#"], block: [["=begin", "=end", true]],
    strings: [{ raw: "rubyheredoc" }, { raw: "percent" }, { ...DQ, ml: true, interp: "#{" }, { open: "'", close: "'", esc: true, ml: true }, { ...BT, interp: "#{" }],
    style: "end", endKw: RUBY_END, ann: null,
    decls: [
      { re: /^\s*class\s*<<\s*self\b/, kind: "ns" },
      { re: R(`^\\s*(class|module)\\s+((?:${ID}::)*${ID})`), kind: "classword" },
      { re: R(`^\\s*(?:(?:private|protected|public|module_function)\\s+)?def\\s+(?:(self|${ID})\\.)?(${ID}[?!=]?|\\[\\]=?|[-+*/<=>!%&|^~]+)`), kind: "fn", recvGroup: 1, nameGroup: 2 },
      { re: TESTDSL("describe|context|feature|it|specify|scenario|example|xit|xdescribe|xcontext|xspecify|pending|skip|test"), kind: "dsl" },
    ],
    params: null, fields: null, imports: /^\s*require(?:_relative)?\s*\(?\s*["']([^"']+)["']/gm,
  },
  dart: {
    exts: ["dart"], line: ["//"], block: [["/*", "*/"]], nest: true,
    strings: [TRIPLE("'", { interp: "${" }), TRIPLE('"', { interp: "${" }), { ...DQ, interp: "${" }, { ...SQ, interp: "${" }], style: "brace", ann: "at", exprArrow: true,
    decls: [
      { re: R(`^\\s*${ANN}(?:(?:abstract|base|final|interface|sealed|mixin)\\s+)*(class|mixin|enum|extension(?:\\s+type)?)\\s+(${ID})`), kind: "classword" },
      { re: R(`^\\s*${ANN}(?:(?:static|external|abstract|factory|const|late|final|override)\\s+)*(?:(${JTYPE})\\s+)?(?:(?:get|set|operator)\\s+)?(${ID}(?:\\.${ID})?)\\s*(?:<[^>()]*>)?\\s*\\(`), kind: "fn", typed: true, untypedTop: true },
      { re: TESTDSL("test|group|testWidgets"), kind: "dsl" },
    ],
    params: "typeName", fields: "typeName", imports: /^\s*import\s+["']([^"']+)["']/gm,
  },
  lua: {
    exts: ["lua"], line: ["--"], block: [["--[[", "]]"]], strings: [{ raw: "lualong" }, DQ, SQ], style: "end", endKw: LUA_END, ann: null,
    decls: [
      { re: R(`^\\s*(local\\s+)?function\\s+((?:${ID}[.:])*${ID})\\s*\\(`), kind: "fn", nameGroup: 2, localGroup: 1 },
      { re: R(`^\\s*(local\\s+)?((?:${ID}\\.)*${ID})\\s*=\\s*function\\s*\\(`), kind: "fn", nameGroup: 2, localGroup: 1 },
      { re: TESTDSL("describe|it|pending|test"), kind: "dsl" },
    ],
    params: null, fields: null, imports: /require\s*\(?\s*["']([^"']+)["']/gm,
  },
  shell: {
    exts: ["sh", "bash", "zsh", "ksh", "bats"], line: ["#"], block: [], hashGuard: "shell",
    strings: [{ raw: "shellheredoc" }, { open: "$'", close: "'", esc: true }, { open: "'", close: "'", ml: true }, { ...DQ, ml: true, interp: "$(" }, { ...BT }],
    style: "brace", ann: null,
    decls: [
      { re: /^\s*function\s+([\w:.@-]+)\s*(?:\(\s*\))?\s*(?=\{|\(|$)/, kind: "fn" },
      { re: /^\s*([\w:.@-]+)\s*\(\s*\)\s*(?=\{|\(|$)/, kind: "fn" },
      { re: /^\s*@test\s+(?=["'])/, kind: "dsl", word: "test" },
    ],
    params: null, fields: null, imports: /^\s*(?:source|\.)\s+["']?([^\s"';]+)/gm,
  },
  sql: {
    exts: ["sql", "psql", "pgsql", "plsql"], line: ["--"], block: [["/*", "*/"]], ci: true,
    strings: [{ raw: "dollar" }, { open: "'", close: "'", dbl: true, ml: true }, { open: '"', close: '"', dbl: true }, { open: "`", close: "`" }],
    style: "sql", ann: null,
    decls: [
      { re: /^\s*create\s+(?:or\s+replace\s+)?(?:(?:temp|temporary|unlogged|global|local|materialized|recursive|definer\s*=\s*\S+)\s+)*(function|procedure|view|table|trigger|type|index|sequence)\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/i, kind: "sqlword" },
    ],
    params: null, fields: null, imports: null,
  },
  elixir: {
    exts: ["ex", "exs"], line: ["#"], block: [],
    strings: [TRIPLE('"', { interp: "#{" }), TRIPLE("'"), { raw: "sigil" }, { ...DQ, ml: true, interp: "#{" }, { open: "'", close: "'", esc: true }],
    style: "end", endKw: ELIXIR_END, ann: "elixir", docAttr: /^\s*@(?:doc|typedoc)\s+(?:~[sS])?(?="|')/,
    decls: [
      { re: /^\s*(defmodule|defprotocol)\s+([\w.]+)/, kind: "classword" },
      { re: /^\s*(def|defp|defmacro|defmacrop|defguard|defguardp|defdelegate|defn|defnp)\s+([a-z_]\w*[?!]?)/, kind: "fn", nameGroup: 2, privGroup: 1 },
      { re: TESTDSL("describe|test"), kind: "dsl" },
    ],
    params: null, fields: null, imports: /^\s*(?:alias|import|use|require)\s+([\w.]+)/gm,
  },
  nim: {
    exts: ["nim", "nims"], line: ["#"], block: [["#[", "]#"]], nest: true, strings: [TRIPLE('"', { esc: false }), DQ, CHAR], style: "indent", colon: "=", ann: null,
    decls: [
      { re: R(`^\\s*(?:proc|func|method|iterator|converter|template|macro)\\s+(${ID}|\`[^\`]+\`)\\*?`), kind: "fn" },
    ],
    params: "nameColonType", fields: null, imports: /^\s*(?:import|include|from)\s+([\w/.]+)/gm,
  },
  // fallback for Python when python3 is unavailable (py-ast is the real adapter)
  py: {
    exts: [], line: ["#"], block: [], strings: [TRIPLE('"'), TRIPLE("'"), DQ, SQ], style: "indent", colon: ":", ann: "at", docInBody: true,
    decls: [
      { re: R(`^\\s*class\\s+(${ID})`), kind: "class" },
      { re: R(`^\\s*(?:async\\s+)?def\\s+(${ID})\\s*\\(`), kind: "fn" },
    ],
    params: "nameColonType", fields: null, imports: /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm,
  },
};

/** extension (".kt") -> lang id. Python/TS are mapped by config.EXT_LANG. */
export const GENERIC_EXT = {};
for (const [lang, spec] of Object.entries(LANGS)) for (const e of spec.exts) GENERIC_EXT["." + e] = lang;
export const GENERIC_FILES = {};
for (const [lang, spec] of Object.entries(LANGS)) for (const f of spec.files || []) GENERIC_FILES[f] = lang;

/** Universal Ctags language names (`--list-languages`) for each lang id. */
export const CTAGS_LANG = {
  java: "Java", kotlin: "Kotlin", scala: "Scala", groovy: "Groovy", go: "Go", rust: "Rust", c: "C", cpp: "C++", csharp: "C#", swift: "Swift",
  php: "PHP", ruby: "Ruby", dart: "Dart", lua: "Lua", shell: "Sh", sql: "SQL", elixir: "Elixir", nim: "Nim", py: "Python",
};

/** Keywords never treated as callee / declaration names. */
export const KEYWORDS = new Set(["if", "else", "elif", "elsif", "for", "foreach", "while", "do", "switch", "case", "when", "match", "catch", "try", "finally",
  "return", "throw", "throws", "new", "delete", "typeof", "sizeof", "instanceof", "is", "as", "in", "not", "and", "or", "unless", "until", "yield", "await",
  "function", "func", "fn", "fun", "def", "lambda", "super", "this", "self", "goto", "defer", "go", "select", "using", "lock", "fixed", "checked", "unchecked",
  "assert", "require", "import", "package", "with", "then", "loop", "break", "continue", "elseif", "local", "end", "begin", "rescue", "ensure", "raise",
  "print", "puts", "echo", "println", "printf", "synchronized", "where", "guard", "repeat", "nameof", "default", "static_assert", "decltype", "alignof",
  "list", "array", "isset", "unset", "empty", "exit", "die", "eval", "include", "include_once", "require_once", "foreach"]);
