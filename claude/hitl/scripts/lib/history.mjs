// INTENT_HISTORY (0.18): history wording in intent docstrings and TODO-flow step comments. A docstring states the
// current contract only (shared/tag-grammar.md §2); the history of a change has its own places (spec delta `Changed:` /
// `Reason:`, the superseded decision and design.md `## Changelog`, the amend brief, the commit message). Pure and
// deterministic: phrase patterns in English and Vietnamese, never single words, so domain words stay quiet ("now" as a
// timestamp, "old password", "mật khẩu cũ", "a session no longer active"). A warning everywhere, never a block.
// Opt-out: the text `hitl: history-ok` — on its own line in a docstring it silences the whole docstring; inside a line
// (or a step comment) it silences that line only. Use it when the compatibility is the current contract.

export const HISTORY_OPT_OUT = /hitl:\s*history-ok\b/i;
export const HISTORY_FIX = "state the current contract only; move the history to the spec delta Changed:/Reason:, the superseded decision and design.md ## Changelog, the amend brief, or the commit message (opt out: hitl: history-ok)";

// word boundaries that also hold for Vietnamese letters (\b is ASCII-only)
const B = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";
const rx = (src) => new RegExp(src, "giu");

/** English verbs (3rd person) a docstring uses for what code does: "now returns", "no longer sends". */
const EN_VERBS = "returns|throws|raises|accepts|supports|sends|calls|uses|needs|requires|writes|reads|stores|checks|validates|emits|takes|does|runs|handles|logs|retries|blocks|rejects|refuses|allows|ignores|creates|deletes|expects|includes|computes|publishes|caches|saves|loads|fetches";
const EN_PARTICIPLES = "supported|needed|required|used|called|necessary|sent|stored|written|checked|returned|thrown|raised|handled|done|run|computed|validated|published|cached|allowed";
/** Vietnamese verbs for what code does ("bây giờ trả về", "không còn gửi"). */
const VI_VERBS = "trả về|ném|nhận|hỗ trợ|dùng|sử dụng|gọi|kiểm tra|cần|ghi|đọc|lưu|gửi|chạy|xử lý|cho phép|từ chối|tạo|xoá|xóa|quét|chặn|phát|tính";

/**
 * The patterns: {id, lang, re}. Each one is a phrase (two or more words, or a word plus its context) that describes
 * a change over time, never a domain noun on its own. `id` names the pattern in the report.
 */
export const HISTORY_PATTERNS = [
  // English
  { id: "previously", lang: "en", re: rx(`(?<!${B}(?:the|a|an|any|its|their|each|every|all|our|your|his|her)\\s+)${B}previously${E}`) },
  { id: "used to", lang: "en", re: rx(`${B}(?:it|this|that|which|we|they|code|function|method|endpoint|service|api|job)\\s+used\\s+to${E}|(?:^|[.!?;:]\\s+)used\\s+to${E}`) },
  { id: "no longer", lang: "en", re: rx(`${B}no\\s+longer\\s+(?:${EN_VERBS})${E}|${B}(?:is|are)\\s+no\\s+longer\\s+(?:${EN_PARTICIPLES})${E}`) },
  { id: "now <verb>", lang: "en", re: rx(`${B}now\\s+(?:also\\s+)?(?:${EN_VERBS})${E}|${B}(?:is|are)\\s+now\\s+(?:${EN_PARTICIPLES}|optional|deprecated|ignored|rejected|refused)${E}|${B}now\\s+also${E}|${B}from\\s+now\\s+on${E}`) },
  { id: "changed from … to", lang: "en", re: rx(`(?<!${B}(?:status|state|phase|stage|value|mode)\\s+(?:has\\s+|have\\s+|is\\s+|was\\s+|had\\s+)?)${B}changed\\s+from\\s+[^.;\\n]{1,60}?\\s(?:to|into)${E}|${B}(?:this|the)\\s+(?:function|method|behaviou?r|default|signature|return\\s+type|contract|api|endpoint)\\s+(?:was|has\\s+been|got)\\s+changed${E}`) },
  { id: "renamed", lang: "en", re: rx(`${B}(?:was|were|has\\s+been|have\\s+been)\\s+renamed${E}|${B}renamed\\s+from${E}|${B}formerly${E}`) },
  { id: "old behaviour", lang: "en", re: rx(`${B}(?:old|legacy|previous|former|original)\\s+(?:behaviou?r|implementation|logic|flow|code\\s+path|contract|signature|semantics)${E}|${B}new\\s+behaviou?r${E}|${B}instead\\s+of\\s+(?:the\\s+)?(?:old|previous|former)${E}`) },
  { id: "as of vX", lang: "en", re: rx(`${B}(?:as\\s+of|since|starting\\s+(?:with|from|in))\\s+(?:v\\d+(?:\\.\\d+)*|version\\s+\\d+(?:\\.\\d+)*|release\\s+\\d+(?:\\.\\d+)*|\\d+\\.\\d+\\.\\d+)${E}`) },
  { id: "anymore", lang: "en", re: rx(`(?:${B}(?:not|no|never)${E}|n't)[^.;\\n]{0,40}?${B}anymore${E}`) },
  { id: "this change", lang: "en", re: rx(`${B}(?:before|after|since|with|until)\\s+(?:this|the|that)\\s+(?:change|amendment|fix|refactor|refactoring|rewrite)${E}`) },
  // Vietnamese
  { id: "trước đây", lang: "vi", re: rx(`${B}trước\\s+(?:đây|kia)${E}`) },
  { id: "giờ đây", lang: "vi", re: rx(`${B}giờ\\s+đây${E}|${B}từ\\s+nay${E}|${B}từ\\s+giờ\\s+trở\\s+đi${E}`) },
  { id: "bây giờ <động từ>", lang: "vi", re: rx(`${B}bây\\s+giờ\\s+(?:(?:đã|sẽ|cũng|thì)\\s+)?(?:${VI_VERBS})${E}`) },
  { id: "không còn <động từ>", lang: "vi", re: rx(`${B}không\\s+còn\\s+(?:được\\s+)?(?:${VI_VERBS})${E}`) },
  { id: "đổi từ … sang", lang: "vi", re: rx(`(?<!${B}trạng\\s+thái\\s+)${B}(?:đã\\s+|được\\s+)?(?:thay\\s+)?đổi\\s+từ\\s+[^.;\\n]{1,60}?\\s(?:sang|thành)${E}`) },
  { id: "đã đổi", lang: "vi", re: rx(`${B}đã\\s+(?:được\\s+)?(?:thay\\s+)?đổi\\s+(?:tên|thành|sang)${E}|${B}đã\\s+(?:được\\s+)?thay\\s+(?:bằng|thế)${E}|${B}đổi\\s+tên\\s+từ${E}`) },
  { id: "… cũ", lang: "vi", re: rx(`${B}(?:hành\\s+vi|cách\\s+làm|cách\\s+xử\\s+lý|logic|luồng|mã|code|hàm|cài\\s+đặt|triển\\s+khai|chữ\\s+ký)\\s+cũ${E}|${B}như\\s+cũ${E}|${B}hành\\s+vi\\s+mới${E}`) },
  { id: "kể từ phiên bản", lang: "vi", re: rx(`${B}(?:kể\\s+từ|bắt\\s+đầu\\s+từ|từ)\\s+(?:phiên\\s+bản|bản|version)\\s*v?\\d+(?:\\.\\d+)*${E}|${B}kể\\s+từ\\s+v\\d+(?:\\.\\d+)*${E}`) },
];

/**
 * History phrases in one text: [{phrase, pattern, lang, line}] (line: 1-based within the text). The opt-out marker on
 * a line of its own silences the whole text; inside a line it silences that line. Text in backticks is ignored (code
 * names). Matches run on the text with its lines joined, so a phrase broken across two docstring lines is found.
 */
export function historyHits(text) {
  const raw = String(text ?? "").normalize("NFC");
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/);
  if (lines.some((l) => l.trim() && l.replace(HISTORY_OPT_OUT, "").replace(/[\s()[\]*#/\-–—.,;:]+/g, "") === "")) return [];
  const starts = [];
  let joined = "";
  for (const l of lines) { starts.push(joined.length); joined += l.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length)) + " "; }
  const lineAt = (off) => { let i = 0; while (i + 1 < starts.length && starts[i + 1] <= off) i++; return i; };
  const out = [];
  for (const p of HISTORY_PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of joined.matchAll(p.re)) {
      const ln = lineAt(m.index + (m[0].length - m[0].trimStart().length));
      if (HISTORY_OPT_OUT.test(lines[ln])) continue;
      const phrase = m[0].trim().replace(/^[.!?;:]\s+/, "").replace(/\s+/g, " ");
      if (!out.some((x) => x.line === ln + 1 && x.phrase === phrase)) out.push({ phrase, pattern: p.id, lang: p.lang, line: ln + 1 });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.phrase.localeCompare(b.phrase));
}

/**
 * History findings of one indexed symbol: its intent (docstring prose), its TODO(impl) steps and its numbered step
 * comments. [{where: "intent"|"todo"|"step", text, phrase, pattern, lang}] (text: the line that holds the phrase).
 */
export function symbolHistory(sym) {
  if (!sym) return [];
  const out = [];
  const intent = String(sym.intent || "").split("\n").filter((l) => !l.trim().startsWith("@")).join("\n");
  const ilines = intent.split("\n");
  for (const h of historyHits(intent)) out.push({ where: "intent", text: ilines[h.line - 1].trim(), phrase: h.phrase, pattern: h.pattern, lang: h.lang });
  for (const [where, list] of [["todo", sym.todos || []], ["step", sym.flowSteps || []]])
    for (const t of list) for (const h of historyHits(t)) out.push({ where, text: String(t).trim(), phrase: h.phrase, pattern: h.pattern, lang: h.lang });
  return out;
}

/** One-line message of a symbol's findings, e.g. `ResetService.request intent: "previously" (previously), step: "now returns" …`. */
export function historyMessage(name, hits) {
  const parts = hits.slice(0, 3).map((h) => `${h.where}: "${h.phrase}"`);
  return `${name} ${parts.join(", ")}${hits.length > 3 ? ` (+${hits.length - 3})` : ""}: history wording in a docstring — ${HISTORY_FIX}`;
}

/** INTENT_HISTORY items for a list of symbol ids: [{code, symbol, name, file, hits, message}]. */
export function historyItems(index, ids) {
  const out = [];
  for (const id of ids || []) {
    const s = index?.symbols?.[id];
    if (!s || s.kind === "test" || s.kind === "suite") continue;
    const hits = symbolHistory(s);
    if (hits.length) out.push({ code: "INTENT_HISTORY", symbol: id, name: s.name, file: s.file, hits, message: historyMessage(s.name, hits) });
  }
  return out;
}
