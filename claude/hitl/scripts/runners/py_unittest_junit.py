#!/usr/bin/env python3
"""HITL fallback Python test runner (stdlib unittest -> JUnit XML). Run with `python3 -I`.

usage: python3 -I py_unittest_junit.py --root <project root> --junit <out.xml> [files...]

Loads each given test file as a module named after its dotted relative path (tests/test_x.py -> tests.test_x),
runs it with unittest and writes JUnit with classname=<module>.<Class> and name=<method>.
With no files, discovers test_*.py under --root. Exit code 0 when all tests pass, 1 otherwise.
"""
import argparse
import importlib.util
import io
import os
import sys
import time
import traceback
import unittest
from xml.sax.saxutils import quoteattr, escape


def module_name(root, path):
    rel = os.path.relpath(os.path.abspath(path), root)
    if rel.endswith(".py"):
        rel = rel[:-3]
    return rel.replace(os.sep, ".").replace("/", ".")


def load(root, path):
    name = module_name(root, path)
    spec = importlib.util.spec_from_file_location(name, os.path.abspath(path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return name, mod


class Collect(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.cases = []
        self._t0 = {}

    def startTest(self, test):
        super().startTest(test)
        self._t0[test.id()] = time.time()

    def _add(self, test, outcome, message="", detail=""):
        dt = time.time() - self._t0.get(test.id(), time.time())
        cls = type(test)
        classname = "%s.%s" % (cls.__module__, cls.__name__)
        name = getattr(test, "_testMethodName", test.id().split(".")[-1])
        self.cases.append((classname, name, dt, outcome, message, detail))

    def addSuccess(self, test):
        super().addSuccess(test)
        self._add(test, "pass")

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self._add(test, "failure", "%s: %s" % (err[0].__name__, err[1]), "".join(traceback.format_exception(*err)))

    def addError(self, test, err):
        super().addError(test, err)
        if not hasattr(test, "_testMethodName"):  # setUpClass/module errors
            self.cases.append((str(test), "<setup>", 0.0, "error", "%s: %s" % (err[0].__name__, err[1]), "".join(traceback.format_exception(*err))))
            return
        self._add(test, "error", "%s: %s" % (err[0].__name__, err[1]), "".join(traceback.format_exception(*err)))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self._add(test, "skipped", reason)

    def addExpectedFailure(self, test, err):
        super().addExpectedFailure(test, err)
        self._add(test, "skipped", "expected failure")

    def addUnexpectedSuccess(self, test):
        super().addUnexpectedSuccess(test)
        self._add(test, "failure", "unexpected success")

    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        if err is not None:
            kind = "failure" if issubclass(err[0], test.failureException) else "error"
            self._add(test, kind, "%s: %s" % (err[0].__name__, err[1]), "".join(traceback.format_exception(*err)))


def write_junit(path, suites):
    out = io.StringIO()
    out.write('<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n')
    for mod, file_rel, cases in suites:
        fails = sum(1 for c in cases if c[3] == "failure")
        errs = sum(1 for c in cases if c[3] == "error")
        skips = sum(1 for c in cases if c[3] == "skipped")
        out.write('  <testsuite name=%s tests="%d" failures="%d" errors="%d" skipped="%d">\n' % (quoteattr(mod), len(cases), fails, errs, skips))
        for classname, name, dt, outcome, message, detail in cases:
            attrs = "classname=%s name=%s file=%s time=\"%.6f\"" % (quoteattr(classname), quoteattr(name), quoteattr(file_rel), dt)
            if outcome == "pass":
                out.write("    <testcase %s/>\n" % attrs)
            elif outcome == "skipped":
                out.write("    <testcase %s><skipped message=%s/></testcase>\n" % (attrs, quoteattr(message[:500])))
            else:
                out.write("    <testcase %s><%s message=%s>%s</%s></testcase>\n" % (attrs, outcome, quoteattr(message[:500]), escape(detail[-4000:]), outcome))
        out.write("  </testsuite>\n")
    out.write("</testsuites>\n")
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(out.getvalue())


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--junit", required=True)
    ap.add_argument("files", nargs="*")
    a = ap.parse_args(argv)
    root = os.path.abspath(a.root)
    if root not in sys.path:
        sys.path.insert(0, root)
    os.chdir(root)
    files = a.files
    if not files:
        for dp, dn, fn in os.walk(root):
            dn[:] = [d for d in dn if not d.startswith(".") and d not in ("node_modules", "venv", "__pycache__")]
            files += [os.path.join(dp, f) for f in fn if f.startswith("test_") and f.endswith(".py")]
    suites = []
    ok = True
    for f in sorted(files):
        p = f if os.path.isabs(f) else os.path.join(root, f)
        file_rel = os.path.relpath(p, root).replace(os.sep, "/")
        mod_name = module_name(root, p)
        try:
            _, mod = load(root, p)
        except BaseException as e:  # import/syntax error -> one error case
            ok = False
            suites.append((mod_name, file_rel, [(mod_name, "<import>", 0.0, "error", "%s: %s" % (type(e).__name__, e), traceback.format_exc())]))
            continue
        suite = unittest.TestLoader().loadTestsFromModule(mod)
        res = Collect()
        suite.run(res)
        if not res.wasSuccessful():
            ok = False
        suites.append((mod_name, file_rel, res.cases))
    write_junit(a.junit, suites)
    total = sum(len(s[2]) for s in suites)
    bad = sum(1 for s in suites for c in s[2] if c[3] in ("failure", "error"))
    sys.stderr.write("py_unittest_junit: %d test(s), %d failed/errored\n" % (total, bad))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
