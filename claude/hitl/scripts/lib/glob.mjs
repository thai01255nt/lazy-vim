// Tiny glob matcher: **, *, ?, {a,b}. Patterns are anchored at the project root, paths use "/".
const cache = new Map();

export function globToRegExp(glob) {
  if (cache.has(glob)) return cache.get(glob);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) { re += "\\{"; continue; }
      re += "(?:" + glob.slice(i + 1, end).split(",").map((p) => globToRegExp(p).source.slice(1, -1)).join("|") + ")";
      i = end;
    } else re += /[.+^$()|[\]\\]/.test(c) ? "\\" + c : c;
  }
  const rx = new RegExp("^" + re + "$");
  cache.set(glob, rx);
  return rx;
}

export const matchGlob = (rel, patterns = []) => patterns.some((p) => globToRegExp(p).test(rel));
