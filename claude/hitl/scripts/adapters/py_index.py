"""py-ast@1 adapter for hitl-index (stdlib only; run with python3 -I).

stdin:  {"files": [{"path": rel, "content": str}], "testGlobs"?: [...], "testFiles"?: [rel]}
stdout: {"results": [AdapterFileResult]}  (see design §E.3.1)
"""
import ast
import io
import json
import re
import sys
import tokenize

STUB = re.compile(r"raise\s+NotImplementedError\s*\(\s*[rRbBuUfF]*(\"\"\"|'''|\"|')TODO\(impl\)")
SKIP_DECO = re.compile(r"(^|\.)(skip\w*|xfail|expectedFailure)$")


class Src:
    def __init__(self, text):
        self.text = text
        self.starts = [0]
        for i, ch in enumerate(text):
            if ch == "\n":
                self.starts.append(i + 1)
        self.comments = []  # (line, col, text)
        self.ops = []  # (line, col, string) for ':' tokens
        try:
            for tok in tokenize.generate_tokens(io.StringIO(text).readline):
                if tok.type == tokenize.COMMENT:
                    self.comments.append((tok.start[0], tok.start[1], tok.string))
                elif tok.type == tokenize.OP and tok.string in ":()[]{}":
                    self.ops.append((tok.start[0], tok.start[1], tok.string))
        except (tokenize.TokenError, IndentationError, SyntaxError):
            pass

    def off(self, line, col):
        # ast col offsets are UTF-8 byte offsets; convert to str index
        start = self.starts[line - 1]
        line_text = self.text[start:self.starts[line] if line < len(self.starts) else len(self.text)]
        return start + len(line_text.encode("utf-8")[:col].decode("utf-8", "ignore"))

    def tok_off(self, line, col):  # tokenize cols are str indexes
        return self.starts[line - 1] + col

    def header_colon(self, node):
        """(line, col) of the ':' that ends a def/class header."""
        first = node.body[0]
        lo = (node.lineno, node.col_offset)
        hi = (first.lineno, first.col_offset)
        depth, best = 0, None
        for line, col, s in self.ops:
            if (line, col) < lo:
                continue
            if (line, col) >= hi:
                break
            if s in "([{":
                depth += 1
            elif s in ")]}":
                depth -= 1
            elif s == ":" and depth == 0:
                best = (line, col)
        return best


def unparse(n):
    try:
        return ast.unparse(n)
    except Exception:
        return None


def ann_type(a):
    if a is None:
        return None
    if isinstance(a, ast.Constant) and isinstance(a.value, str):
        return a.value
    if isinstance(a, (ast.Name, ast.Attribute)):
        return unparse(a)
    return None


def is_doc_stmt(stmt):
    return isinstance(stmt, ast.Expr) and isinstance(getattr(stmt, "value", None), ast.Constant) and isinstance(stmt.value.value, str)


def calls_in(nodes):
    out, seen = [], set()
    found = []
    for root in nodes:
        for n in ast.walk(root):
            if isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Name):
                    found.append((f.lineno, f.col_offset, f.id, None))
                elif isinstance(f, ast.Attribute):
                    found.append((f.end_lineno, f.end_col_offset, f.attr, unparse(f.value)))
    for _, _, name, qual in sorted(found, key=lambda x: (x[0], x[1])):
        if (qual, name) not in seen:
            seen.add((qual, name))
            out.append({"name": name, "qualifier": qual})
    return out


def self_locals(cls):
    loc = {}
    for st in cls.body:
        if isinstance(st, ast.AnnAssign) and isinstance(st.target, ast.Name):
            t = ann_type(st.annotation)
            if t:
                loc["self." + st.target.id] = t
    for st in cls.body:
        if isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef)) and st.name == "__init__":
            for n in ast.walk(st):
                if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Attribute) and isinstance(n.target.value, ast.Name) and n.target.value.id == "self":
                    t = ann_type(n.annotation)
                    if t:
                        loc["self." + n.target.attr] = t
                elif isinstance(n, ast.Assign) and isinstance(n.value, ast.Call) and isinstance(n.value.func, (ast.Name, ast.Attribute)):
                    for tg in n.targets:
                        if isinstance(tg, ast.Attribute) and isinstance(tg.value, ast.Name) and tg.value.id == "self":
                            loc["self." + tg.attr] = unparse(n.value.func)
    return loc


def deco_skip(node):
    for d in node.decorator_list:
        target = d.func if isinstance(d, ast.Call) else d
        name = unparse(target) or ""
        if SKIP_DECO.search(name):
            return True
    return False


def parse_file(f, test_file):
    path, text = f["path"], f["content"]
    res = {"path": path, "lang": "py", "imports": [], "symbols": [], "warnings": [], "parseError": None}
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError as e:
        res["parseError"] = "SyntaxError: %s (line %s)" % (e.msg, e.lineno)
        return res
    src = Src(text)

    for st in tree.body:
        if isinstance(st, ast.Import):
            for a in st.names:
                res["imports"].append({"from": a.name, "names": [{"name": "*", "alias": a.asname, "typeOnly": False}]})
        elif isinstance(st, ast.ImportFrom):
            mod = "." * (st.level or 0) + (st.module or "")
            res["imports"].append({"from": mod, "names": [{"name": a.name, "alias": a.asname, "typeOnly": False} for a in st.names]})

    def emit(node, qual, kind, parent, exported, extra_locals=None, test=None):
        start_line = node.decorator_list[0].lineno if node.decorator_list else node.lineno
        start_col = node.decorator_list[0].col_offset - 1 if node.decorator_list else node.col_offset
        s0 = src.off(start_line, max(start_col, 0))
        colon = src.header_colon(node)
        if colon is None:
            return
        c_off = src.tok_off(*colon)
        end = src.off(node.end_lineno, node.end_col_offset)
        body = node.body
        doc_stmt = body[0] if body and is_doc_stmt(body[0]) else None
        body_start = src.off(doc_stmt.end_lineno, doc_stmt.end_col_offset) if doc_stmt else c_off + 1
        body_text = text[body_start:end]
        fn_like = kind in ("function", "method", "test")
        comment_lines = []
        if fn_like:
            for line, col, s in src.comments:
                o = src.tok_off(line, col)
                if body_start <= o < end:
                    comment_lines.append({"line": line, "text": s[1:].strip()})
        locals_ = {}
        if extra_locals:
            locals_.update(extra_locals)
        if kind != "class" and kind != "suite":
            args = node.args
            for a in list(getattr(args, "posonlyargs", [])) + list(args.args) + list(args.kwonlyargs):
                t = ann_type(a.annotation)
                if t:
                    locals_[a.arg] = t
        stmts = [s for s in body if s is not doc_stmt]
        res["symbols"].append({
            "name": qual, "kind": kind, "parentName": parent, "exported": exported,
            "async": isinstance(node, ast.AsyncFunctionDef),
            "sigText": text[s0:c_off].strip(),
            "doc": ast.get_docstring(node, clean=True),
            "bodyText": body_text,
            "commentLines": comment_lines,
            "stub": bool(fn_like and STUB.search(body_text)),
            "locals": locals_ if fn_like else {},
            "calleesRaw": calls_in(stmts) if fn_like else [],
            "span": {"start": start_line, "end": node.end_lineno},
            "docSpan": {"start": doc_stmt.lineno, "end": doc_stmt.end_lineno} if doc_stmt else None,
            "bodySpan": {"start": colon[0], "end": node.end_lineno},
            "test": test,
        })

    def walk_class(cls, prefix, parent, exported, cls_skip=False):
        qual = prefix + cls.name
        is_suite = test_file and cls.name.startswith("Test")
        emit(cls, qual, "suite" if is_suite else "class", parent, exported,
             test={"titlePath": [cls.name], "mode": "skip" if deco_skip(cls) else "active"} if is_suite else None)
        loc = self_locals(cls)
        skip = cls_skip or deco_skip(cls)
        for st in cls.body:
            if isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef)):
                mexp = exported and not st.name.startswith("_")
                if is_suite and st.name.startswith("test"):
                    mode = "skip" if (skip or deco_skip(st)) else "active"
                    emit(st, qual + "." + st.name, "test", qual, False, test={"titlePath": [cls.name, st.name], "mode": mode})
                else:
                    emit(st, qual + "." + st.name, "method", qual, mexp, extra_locals=loc)
            elif isinstance(st, ast.ClassDef):
                walk_class(st, qual + ".", qual, exported and not st.name.startswith("_"), skip)

    for st in tree.body:
        if isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if test_file and st.name.startswith("test"):
                emit(st, st.name, "test", None, False, test={"titlePath": [st.name], "mode": "skip" if deco_skip(st) else "active"})
            else:
                emit(st, st.name, "function", None, not st.name.startswith("_"))
        elif isinstance(st, ast.ClassDef):
            walk_class(st, "", None, not st.name.startswith("_"))
    return res


def main():
    data = json.load(sys.stdin)
    test_files = set(data.get("testFiles") or [])
    out = []
    for f in data.get("files", []):
        try:
            out.append(parse_file(f, f["path"] in test_files))
        except Exception as e:  # never crash the batch
            out.append({"path": f["path"], "lang": "py", "imports": [], "symbols": [], "warnings": [], "parseError": "py-ast: %s" % e})
    json.dump({"results": out}, sys.stdout)


if __name__ == "__main__":
    main()
