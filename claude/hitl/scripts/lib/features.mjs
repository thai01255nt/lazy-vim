// Body feature detection over normalized bodyText (§E.3.4). Returns a sorted array of feature names.
const RULES = {
  async: /\bawait\b|\basync\b|Promise\.(?:all|race|any|allSettled)\b|\basyncio\b/,
  lock: /Mutex|\bLock\(|acquire\(|\bsynchronized\b|threading\.Lock|asyncio\.Lock/,
  thread: /\bWorker\b|\bthreading\b|ThreadPool|concurrent\.futures/,
  timer: /\bsetTimeout\b|\bsetInterval\b|\bsleep\(/,
  sql: /\b(?:SELECT\b.*\bFROM|INSERT\s?INTO|UPDATE\b.*\bSET|DELETE\s?FROM)\b|\.query\(|\.execute\(/,
  shell: /child_process|(?<![.\w])exec(?:Sync)?\(|\bspawn(?:Sync)?\(|\bexecFile\b|\bsubprocess\b|os\.system/,
  crypto: /\bcrypto\.|createHash|\bhashlib\b|\bbcrypt\b|\bjwt\b|cipher/i,
  "fs-path": /\bfs\.|(?<![.\w])open\(|path\.join\(|os\.path\.|\bPath\(/,
  eval: /(?<![.\w])eval\(|new Function\b|(?<![.\w])exec\((?!.*subprocess)/,
  deserialize: /\bpickle\b|yaml\.load\(|JSON\.parse\(|\bmarshal\.loads\(/,
};

export function features(normalizedBody, lang = null) {
  const out = [];
  for (const [name, rx] of Object.entries(RULES)) if (rx.test(normalizedBody || "")) out.push(name);
  if (lang === "ts" && out.includes("eval") && !/(?<![.\w])eval\(|new Function\b/.test(normalizedBody)) out.splice(out.indexOf("eval"), 1);
  return out.sort();
}
