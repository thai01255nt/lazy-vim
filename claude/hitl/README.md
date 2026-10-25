# hitl — Human-in-the-loop, skeleton-first workflow cho Claude Code

Plugin Claude Code cho quy trình: **plan → tasks → skeleton → approve → test → implement → review → done**.
Code là nguồn sự thật duy nhất: intent nằm trong docstring của skeleton (tag `@task @impl @status …`),
một AST index tất định (`hitl-index`) theo dõi chữ ký/intent và báo **drift** so với skeleton đã duyệt.
Người duyệt ở các cổng (⛔ GATE); agent chỉ làm phần được giao (`@impl agent`), phần `@impl manual` là của bạn.

> English summary: a pure Claude Code plugin. Skills drive the phases, hooks enforce isolation and
> verification, and a zero-dependency Node CLI (`hitl-index`) indexes code in any language (TS/Python parsers, Universal Ctags, a generic fallback), locks approved
> skeletons and tests, computes status, and reports drift. Requires Node ≥ 20 (fixtures/e2e: ≥ 22.18); Python 3.9+ for `.py`. State lives in `.hitl/` (v0.4+).
> v0.2 adds light spec-driven development: requirements `R-n` (EARS-lite) and decisions `D-n` in the planning file,
> `(R-n)` on task ACs, an optional `@dec D-n` code tag, a deterministic `hitl-index trace` matrix
> (R → AC → test → symbol; blocks only on broken references), an "accept + amend spec" path in sync/review/implement/plan,
> and an optional one-way Linear mirror (`/hitl:tickets`, one issue per task, fail-open, never a gate).

## 1. Cài đặt

```sh
# Thêm marketplace local (thư mục chứa .claude-plugin/marketplace.json)
claude plugin marketplace add ~/.config/nvim/claude
# Cài plugin (marketplace tên "thai-hitl")
claude plugin install hitl@thai-hitl
```
Trong session cũng dùng được: `/plugin marketplace add ~/.config/nvim/claude`, `/plugin install hitl@thai-hitl`.
Sửa file của marketplace local → có hiệu lực ở session mới hoặc sau `/reload-plugins`.

**Dev (không cài, chỉ một session):**
```sh
claude --plugin-dir ~/.config/nvim/claude/hitl
# sửa skill/hook xong: /reload-plugins
claude plugin validate ~/.config/nvim/claude/hitl   # kiểm tra plugin
claude plugin validate ~/.config/nvim/claude        # kiểm tra marketplace
```

Khi plugin bật, `bin/hitl-index` nằm trên PATH của Bash tool. Ngoài Claude (terminal, git hook) gọi:
`node ~/.config/nvim/claude/hitl/scripts/hitl-index.mjs <cmd>`.

Bắt đầu trong một project: `/hitl:setup` (tạo `.hitl/`, dò lệnh test/lint/typecheck, index lần đầu).

### Nâng cấp từ 0.3

Từ 0.4, thư mục trạng thái của project là `.hitl/` thay cho `.claude/custom/` (Claude Code coi mọi thứ dưới `.claude/` là
nhạy cảm và hỏi quyền mỗi lần ghi, kể cả với allow rule hay hook "allow"). Bố cục bên trong giữ nguyên. Project cũ sẽ thấy
một dòng `⚠️ HITL: legacy dir .claude/custom/ — run hitl-index migrate` (SessionStart, CLI); hook không bảo vệ thư mục cũ.
- `hitl-index migrate --dry-run` xem trước; `hitl-index migrate` chuyển các mục của hitl (`docs/ planning/ tasks/ index/
  reviews/ .inbox/ adapters/`, `hitl.config.json`, `linear.map.json`), gộp `.gitignore`, sửa đường dẫn `.claude/custom/…`
  trong các file .md/.json đã chuyển (gồm `customAdapters`, `trace.mdOut`). File lạ được giữ nguyên chỗ cũ và in ra.
- Từ chối (không chuyển gì) nếu `.hitl/` đã có mục trùng. Không tự chạy git: trong repo nó in lệnh
  `git add -A -- .claude/custom .hitl` (git ghi nhận rename như `git mv`); `--dry-run` in các dòng `git mv` tương đương.
- `/hitl:setup` tự đề nghị migrate khi thấy thư mục cũ; `hitl-index init` từ chối tạo `.hitl/` rỗng cạnh thư mục cũ (trừ `--fresh`).
- Lần push Linear kế tiếp có thể cập nhật lại mô tả issue (marker `file=` đổi đường dẫn).

## 2. Luồng làm việc

```
 /hitl:setup ─► /hitl:overview ─► /hitl:plan ⛔ ─► /hitl:tasks ⛔
                                                       │
                     risk: low (fast lane ⚡) ◄────────┤────────► risk: high
                     /hitl:implement                   │          /hitl:skeleton ⛔  (bạn sửa skeleton trong editor)
                     (auto skeleton + tests)           │          /hitl:approve T    (khoá skeleton)
                              │                        │          /hitl:test T ⛔    (test RED, test-author cô lập)
                              │                        │          /hitl:approve T tests
                              ▼                        ▼          /hitl:implement T  (agent fn → subagent; manual fn → bạn ⛔)
                        /hitl:review T ◄──────────────────────────────┘
                              │  L0 gates → L1 lenses → report (.hitl/reviews/T.review.md)
                              ▼
                   /hitl:approve T done  (high)  ·  auto done (low, verdict PASS)

 Sửa code ngoài Claude ─► /hitl:sync  (drift + trace report, re-approve / revert / defer / accept + amend spec)
 Không biết làm gì tiếp ─► /hitl:flow
 Kênh phụ (tuỳ chọn)   ─► /hitl:tickets push  (mirror task sang Linear; không bao giờ là gate)
```

Planning file có hai nửa: **Part A — WHAT/WHY** (`## Goal`, `## Requirements` với `R-n`, `## Out of scope`; chỉ hành vi,
không tên file/class/thư viện) và **Part B — HOW** (cây component, `## Decisions` với `D-n` + cột `serves`, test seams,
risks, `## Changelog`). `/hitl:plan` luôn hỏi vòng **Behaviour** trước (→ `R-n`), sau đó mới tới thiết kế (→ `D-n`).

Status (do tooling tính, không bao giờ sửa tay): `skeleton → red → wip → green → verified → done`.

## 3. Lệnh

| Lệnh | Việc làm | Gate? | Ai gọi |
|---|---|---|---|
| `/hitl:setup [--reconfigure]` | Khởi tạo `.hitl`, dò lệnh test/lint/typecheck, index, tuỳ chọn cài git pre-commit | ⛔ xác nhận lệnh | chỉ bạn |
| `/hitl:flow [T-id\|help]` | Đang ở đâu, task nào tiếp theo, lệnh gợi ý `🎯 next` | — | bạn / Claude |
| `/hitl:overview [mô tả\|refresh]` | Viết docs BUSINESS-CONTEXT / ARCHITECTURE / PATTERNS-CONVENTIONS (3 mapper song song) + CODEBASE-MAP sinh từ index | ⛔ nếu đã có docs | bạn / Claude |
| `/hitl:plan [mô tả\|file [amend]]` | Hỏi kiểu "grill": vòng Behaviour trước (→ `R-n`), rồi cây quyết định (→ `D-n`), mỗi vòng một loạt câu hỏi có đáp án khuyến nghị → `planning/[type]-[feature].md`. `<file> amend`: sửa nhỏ plan đã duyệt (supersede D, amend R, Changelog), vẫn `approved` | ⛔ mỗi vòng | bạn / Claude |
| `/hitl:tasks [planning\|quick …]` | Chia task dọc (vertical slice), prio P0–P3, risk + lý do, AC Given/When/Then gắn `(R-n)`, Why trích `D-n`, symbol đích, test plan → `tasks/…md`; kiểm tra bằng `hitl-index trace` | ⛔ quiz | bạn / Claude |
| `/hitl:skeleton <T> [--quick]` | Viết skeleton: chữ ký, docstring intent + tag, các bước `TODO(impl)`, sentinel throw; test stub cho mỗi AC | ⛔ review trong editor | bạn / Claude |
| `/hitl:approve <T> [skeleton\|tests\|done] [symbols…]` | Khoá skeleton / test RED / kết quả cuối vào `skeleton.lock.json` | chính lệnh là sự duyệt | **chỉ bạn** |
| `/hitl:test <T> [fill\|run\|mutate]` | test-author (chỉ thấy contract pack) viết test thật, kiểm tra RED đúng lý do; mutation tuỳ chọn | ⛔ (high) | bạn / Claude |
| `/hitl:implement <T> [symbol] [--all] [--lane fast]` | Làm từng hàm theo `@prio`: agent fn → subagent implementer; manual fn → giao cho bạn kèm context. `--lane fast`: bạn ép fast lane cho task high risk (xem 5a) | ⛔ manual / mỗi hàm (high) | chỉ bạn |
| `/hitl:implement --feature <planning\|tasks file> [--lane fast]` | Chạy mọi task của một tasks file theo thứ tự (blocked-by, rồi prio), mỗi task theo lane của nó; dừng **một lần** ở cuối với review gộp `reviews/feature-<name>.md` (xem 5b) | ⛔ cuối / dừng sớm | chỉ bạn |
| `/hitl:review <T> [fix F-n\|amend F-n\|recheck]` | Review nhiều lớp (L0 có gate `trace`) + fix loop; `amend F-n` = accept + sửa spec | ⛔ nếu cần người quyết | bạn / Claude |
| `/hitl:review --security-audit [<feature file>\|repo] [--out <dir>]` | Audit bảo mật đầy đủ 6 phase (Cloudflare `security-audit`) cho một feature hoặc cả repo; link `REPORT.md` vào `reviews/feature-<name>.md` (xem 6a) | — | bạn / Claude |
| `/hitl:security-audit …` | Skill upstream nguyên bản: hỏi đáp/review bảo mật (guidance mode) hoặc audit đầy đủ khi bạn yêu cầu rõ | — | bạn / Claude |
| `/hitl:sync [--files …] [T]` | Đồng bộ sửa tay: reindex, drift + trace report, re-approve / revert / defer / accept + amend spec, cập nhật CODEBASE-MAP | ⛔ | **chỉ bạn** |
| `/hitl:tickets init\|push\|pull\|status` | (Tuỳ chọn) mirror task sang Linear: một issue mỗi task, push một chiều, pull chỉ đọc (báo drift), in branch + `Fixes ENG-n` | ⛔ lần push đầu / op cần duyệt | bạn / Claude (skill khác gọi khi bật `autoPush`) |

CLI mới (gọi trực tiếp được): `hitl-index trace [T-id|planning] [--check] [--md] [--json]` (ma trận truy vết),
`hitl-index tickets status|plan|record|diff` (do `/hitl:tickets` dùng),
`hitl-index feature <planning|tasks file> [--lane fast] [--report [--security-audit <dir>]] [--json]` (kế hoạch chạy feature / report gộp; `--security-audit` ghi link REPORT.md của audit).

"Chỉ bạn" = skill có `disable-model-invocation: true`; Claude không tự gọi được.

**Cổng (⛔ GATE):** skill in tóm tắt + lựa chọn đánh số rồi **dừng lượt**. Trả lời `y` / `ok` / `được` = chọn khuyến nghị.
Ngoài cổng, skill không hỏi mà tự quyết với giả định ghi rõ (`💡 Assumed: …`).

**Duyệt là việc của người:** `hitl-index approve … --by human` chỉ chạy được ngay sau khi bạn gõ `/hitl:approve`
(hook UserPromptSubmit phát "approve token" dùng một lần, ≤10 phút). `--by auto` chỉ cho task risk low (CLI chặn).
`--by human-override` chỉ chạy được sau khi bạn gõ `/hitl:implement <T> --lane fast` (token riêng, xem 5a).

## 4. Đồng bộ khi code thay đổi (sync model)

| Nguồn thay đổi | Cách được bắt |
|---|---|
| Claude sửa qua Edit/Write | **PostToolUse** reindex file đó ngay, báo drift (vd. `⚠️ SIG_CHANGED UserService.createUser … affected callers: register`) |
| Bạn sửa tay ngoài Claude (nvim, …) | **Chính: bạn chạy `/hitl:sync`.** Lưới an toàn im lặng: SessionStart / UserPromptSubmit reindex rẻ các file đổi (mtime+size) và chèn **tối đa MỘT dòng** `⚠️ HITL: N symbols drifted … — suggest /hitl:sync` |
| Claude sửa qua Bash (`sed -i`, heredoc) | Bắt sau: Stop hook reindex, lưới an toàn ở prompt kế tiếp, pre-commit |
| Commit | **Tuỳ chọn** git pre-commit (`/hitl:setup` hỏi; hoặc `hitl-index install-git-hook [--husky]`): `index --all` + `drift --fail-on block` + kiểm tra `@status` giả |

Hook không bao giờ sửa source. `@status` trong source chỉ được viết lại bởi `hitl-index status --sync-tags` ở các điểm gate.
Pre-commit gọi `node "${HITL_HOME:-$HOME/.config/nvim/claude/hitl}/scripts/hitl-index.mjs" precommit` (bản source trong repo nvim, không phải bản cache của plugin).

Mã drift chính: `SIG_CHANGED`, `INTENT_CHANGED` (warn, kèm callers bị ảnh hưởng), `DELETED_REFERENCED` (block), `ORPHAN`,
`TEST_CHANGED/DELETED/SKIPPED`, `STATUS_FORGED`, `PARSE_ERROR`.

### 4a. Accept + amend spec (đồng bộ ngược code → plan)

Khi một contract đã khoá đổi (drift item có `spec: D-1 · R-1`), một finding review cho thấy thiết kế sai, hoặc
implementer báo `specConflict`, skill đề xuất cập nhật **plan** thay vì để code và plan lệch nhau âm thầm:
- `/hitl:sync` → lựa chọn `4. accept + amend spec`; `/hitl:review` → trả lời `amend F-n`; `/hitl:implement` → thẻ
  `📐 Spec change proposal`; `/hitl:plan <file> amend` → sửa chủ động.
- Skill in **📐 Spec delta** (D cũ → `superseded by D-k`, D mới, R sửa, text AC, dòng Changelog, `@dec`) và hỏi
  `Apply? (Y/n/edit)` trong cùng gate. Quy tắc: `shared/amend-spec.md`.
- Decision không bao giờ sửa tại chỗ (chỉ supersede); requirement sửa được nhưng mỗi lần có một dòng `## Changelog`;
  planning vẫn `approved` (trừ khi thêm component hoặc R `must` mới → `draft`, chạy lại `/hitl:tasks`).
- Amend không duyệt gì cả: sau đó bạn vẫn gõ `/hitl:approve <T> skeleton <symbols>` như cũ.

### 4b. Linear (tuỳ chọn)

Mặc định tắt; tắt thì không có gì thay đổi. Cài đặt:
```sh
claude mcp add --transport http linear-server https://mcp.linear.app/mcp   # hoặc plugin "linear" của Anthropic
# trong session: /mcp để đăng nhập, rồi
/hitl:tickets init        # chọn team, planning → project, nhóm label (risk + impl)
```
- **Một issue Linear cho mỗi task** (không bao giờ theo AC/symbol); planning file → project (hoặc parent issue / không gì).
  Gói Free giới hạn **250 issue** → giữ mỗi task một issue; `maxCreatePerPush` (50) bắt duyệt khi tạo nhiều.
- **Push một chiều** (repo là nguồn sự thật cho title, Why, AC, prio, label risk/impl, state, comment review) và
  **pull chỉ đọc** (báo `LINEAR_DRIFT`, `LINEAR_DONE_EARLY`…; không bao giờ sửa tasks/planning md). Linear giữ assignee,
  cycle, estimate, comment của người, label khác.
- Map trạng thái:

  | hitl status | Linear state type |
  |---|---|
  | `todo` | unstarted (hoặc backlog nếu `pushTodoAs: backlog`) |
  | `skeleton`, `approved`, `red`, `wip` | started |
  | `green`, `review`, `verified` | review (state started tên /review/; không có → started) |
  | `done` | completed |

  Không bao giờ tự lùi issue đã completed (cần bạn duyệt). Prio P0–P3 → Urgent/High/Medium/Low.
- **Fail-open:** MCP thiếu, lỗi auth/mạng/rate limit → không gì bị chặn; op được xếp hàng (`index/linear.queue.json`),
  SessionStart in một dòng `⚠️ HITL: n Linear update(s) queued — /hitl:tickets push`. Linear không bao giờ chặn gate.
- Branch + PR: `/hitl:implement`/`/hitl:skeleton` in `🎯 branch: git switch -c eng-1-…`; review PASS in `PR: Fixes ENG-1`
  (hoặc `Part of ENG-1`). Khuyến nghị trong Linear → Team → Workflow → GitHub: tắt *On PR merge → Done*, hoặc chấp nhận
  merge sau `/hitl:approve T done` sẽ đánh Done.
- `autoPush.onTasksApproved|onApprove|onReview` (mặc định false): `/hitl:tasks`, `/hitl:approve`, `/hitl:review` tự gọi
  `/hitl:tickets push … --auto` (chỉ op không cần duyệt).
- **Không dùng Linear coding-agent delegation** (giao issue cho agent trong Linear): agent đó bỏ qua mọi gate của hitl
  (lock skeleton, test-author cô lập, approve token). hitl không bao giờ set `delegate`/`assignee`.
- `linear.map.json` (T-n ↔ ENG-n) do CLI ghi, commit lên repo; mất/conflict → `/hitl:tickets pull --relink` dựng lại từ
  marker `<!-- hitl:task=T-1 … -->` trong description.

## 5. Risk routing

- **Task risk** (lúc `/hitl:tasks`): `high` nếu đụng core module, concurrency/async shared state, security (auth/crypto/money/SQL/shell/path/deserialize),
  public API, khái niệm domain mới, migration dữ liệu. Ngược lại `low` → fast lane ⚡ (skeleton/test tự duyệt `--by auto`).
- **Symbol risk** (lúc review, 0–1): concurrency +0.30, security +0.25, drift +0.30 (cờ cứng), mutation yếu +0.15, fan-in > 5 +0.10,
  impl agent +0.05, finding ≥ important +0.20, thân > 60 dòng +0.05, task high +0.20.
  Route: cờ cứng hoặc > 0.6 → **HUMAN**, 0.3–0.6 → **SKIM**, < 0.3 → **AUTO**. Trọng số là heuristic, chỉnh trong `hitl.config.json` (`risk.weights`).
  Task có human-override trong lock → mọi hàm là cờ cứng **HUMAN** (L2).

### 5a. Ép fast lane: `/hitl:implement <T> --lane fast` (chỉ bạn)

Fast lane (tự skeleton → test → implement, không gate) mặc định bị từ chối cho task high risk. Bạn có thể ép cho
**một task**: `/hitl:implement T-12 --lane fast`.
- Chỉ người làm được, giống approve: hook UserPromptSubmit đọc nguyên văn prompt và phát **override token** gắn với
  `T-12` (sống tối đa 3 giờ trong lượt chạy; trả lời `done`/`y` ở gate giữ token, gõ lệnh `/…` khác thì token hết).
  PreToolUse chỉ cho `hitl-index approve T-12 --stage skeleton|tests --by human-override` qua khi có token, ở main
  thread, lệnh đơn (không nối `;`/`&&`/pipe). Subagent và task khác bị chặn; `done` không bao giờ qua override.
- Đầu lượt in một khối ⚠️ HUMAN OVERRIDE kèm lý do risk; sau đó hàm agent không còn gate, hàm manual vẫn giao cho bạn.
- `skeleton.lock.json` ghi `approvedBy/lockedBy: "human-override"` và `tasks[T].override: true` (không tự xoá);
  `hitl-index status --json` có `override: true` theo task.
- Review: router ép mọi hàm của task đó sang **HUMAN** (L2), report có dòng `⚠️ human-override …`; `done` vẫn là
  `/hitl:approve T-12 done` của bạn.

### 5b. Chạy cả feature: `/hitl:implement --feature <planning|tasks file> [--lane fast]`

- `hitl-index feature <file> --json` sắp task theo blocked-by (topo), rồi prio, rồi id; lane mỗi task: low → ⚡ fast,
  high → gate bình thường (dừng ở skeleton/test/approve của bạn), high + `--lane fast` → ⚠️ override (token gắn với
  **feature file**: phủ các task của file đó, cảnh báo một lần cho cả lượt chạy).
- Dừng sớm khi: test không xanh sau số lần thử của implementer, drift mức `block`, hàm manual cần bạn, task chờ bạn
  duyệt (lane thường). Tiếp tục bằng **đúng lệnh cũ**: task đã implement (green/review/verified/done) được bỏ qua.
- Cuối cùng: `/hitl:review <T> --in-feature` cho từng task (không gate riêng), rồi `hitl-index feature <file> --report`
  ghi `.hitl/reviews/feature-<name>.md` (một màn hình: verdict, risk, override, trace ⛔/⚠️, finding cần quyết
  theo task) và hỏi **một** gate cho cả feature.

## 6. Các lớp test và review

1. **AC** trong tasks md (2–6 Given/When/Then mỗi task, id `T-n.ACk`) + test plan mỗi AC.
2. **Test stub** ở skeleton (`@covers @ac @kind @origin`), `it.todo` / `@unittest.skip`.
3. **test-author** cô lập: chỉ đọc contract pack (chữ ký, intent, TODO flow, AC), không thấy thân hàm (hook chặn Read src). Test phải **RED đúng lý do**; test pass trên stub = vô nghĩa → trả lại.
4. **Lock test** (`/hitl:approve T tests`): sau đó implementer không sửa được test; sửa test chỉ qua `/hitl:test` + duyệt lại.
5. **Stop hook**: hàm agent vừa implement mà chưa có lần chạy test xanh "fresh" → chặn kết thúc (tối đa 2 lần).
6. **Review L0** (tất định): lint, typecheck, tests, drift vs lock, **trace**, mutation (Stryker / mutmut, tắt mặc định).
7. **Review L1**: reviewer subagent context mới, mỗi lens một agent song song — `contract`, `tests` (luôn có), `concurrency`, `security` (khi có tín hiệu) →
   **finding-verifier** (haiku) chấm lại 0–100, giữ ≥ 80 → report một màn hình `reviews/T-n.review.md` (verdict PASS / WITH FIXES / FAIL).
8. **Fix loop**: finding được accept trên hàm agent → test-author viết test fail trước, implementer làm xanh; hàm manual → TODO cho bạn. Tối đa 2 vòng rồi chuyển người.

**Truy vết (trace):** `R-n` (planning) → AC `(R-n)` (tasks md) → test `@ac` → symbol `@covers`, cộng `D-n` qua
`**Why**`, `@dec` và cột `serves`. `hitl-index trace [T|planning] [--check] [--md]` tính tất định (không LLM, không
reindex, không chạy test). **Chỉ chặn khi tham chiếu gãy** (`REQ_UNKNOWN`, `REQ_INACTIVE`, `DEC_UNKNOWN`, `AC_UNKNOWN`,
`COVERS_UNRESOLVED`, `PLANNING_MISSING` khi có ref); khoảng trống (`REQ_NO_AC`, `AC_NOT_PROVEN`, `SYMBOL_NO_TEST`, …) là
warn/info. Hiện ở gate `/hitl:tasks`, `/hitl:flow` (`🔗 trace: R 2/2 covered · AC 2/2 proven`), review L0 + mục
`## Trace` trong report, `/hitl:sync`. Pre-commit chặn theo trace chỉ khi `trace.precommit: true`. File planning cũ (không
có `## Requirements`) vẫn chạy: bỏ qua kiểm tra R.

### 6a. Bảo mật: Cloudflare `security-audit`

Skill [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT) được vendor **nguyên
bản** vào `skills/security-audit/` (commit + cách re-sync: `UPSTREAM.md`; unit test kiểm tra checksum và chạy test
validator của upstream). Phần nối với hitl nằm riêng ở `skills/review/references/security.md`.

- **Lens security (mỗi task, guidance mode):** chạy khi `hitl-index risk` chọn `security`, hoặc task đi qua trust boundary
  (auth, parse input không tin cậy, crypto, secret, file/IPC/network, LLM/tool, deserialize, dữ liệu multi-tenant).
  Reviewer dùng tài liệu attack-class của upstream theo loại code (`WEB-PROTOCOL-AND-AUTH`, `CLIENT-SIDE`, `AI-AND-LLM`,
  `MEMORY-SAFETY-AND-BINARY`, …) làm checklist. Chỉ báo lỗi khi trust boundary thật sự bị vượt; thiếu lớp phòng thủ phụ
  là ghi chú hardening (`setAside`); severity = khả năng × tác động.
- **Ánh xạ verdict:** `confirmed` → finding thường (finding-verifier chấm lại) · `needs_validation` → finding có dòng
  `blocker:` (sự kiện còn thiếu, ngoài source), luôn chuyển cho bạn (L2) · `rejected` → bỏ, ghi vào `setAside`.
- **Audit đầy đủ:** `/hitl:review --security-audit <feature file>` (scoped theo file của các task) hoặc `repo`. Output mặc
  định theo upstream ở ngoài project: `~/security-audit-skill/<repo>/run-<N>/` (`REPORT.md`, `findings.json`, …). Trong
  ngữ cảnh feature, `REPORT.md` được link trong `reviews/feature-<name>.md`. Cuối `/hitl:implement --feature`, nếu có task
  chạy lens security, report chỉ **gợi ý** lệnh này (không tự chạy). Audit không sửa source, không đổi verdict review.
- ⚠️ **Sandbox:** upstream chỉ cho chạy code của target (build, test, fixture, fuzzer) trong sandbox do OS cưỡng chế
  (không network, env allowlist, target read-only, giới hạn tài nguyên). hitl không có sandbox như vậy: reviewer không
  chạy code ngoài `hitl-index test` (test sẵn có của project); lead nào cần chạy mới kết luận được thì giữ
  `needs_validation` kèm kế hoạch kiểm chứng an toàn.

## 7. File trong project

| đường dẫn trong `.hitl/` | git | vì sao |
|---|---|---|
| `hitl.config.json`, `docs/*.md`, `planning/*.md`, `tasks/*.md` | commit | người viết / người duyệt |
| `index/skeleton.lock.json` | commit | bản ghi phê duyệt (chỉ `hitl-index approve` ghi) |
| `linear.map.json` | commit | đồng đội cần T-n ↔ ENG-n (chỉ `hitl-index tickets` ghi) |
| `reviews/<T>.review.md` | commit | bằng chứng review |
| `reviews/feature-<name>.md` | commit | report gộp của `/hitl:implement --feature` (do `hitl-index feature --report` sinh) |
| `reviews/feature-<name>.security.json` | commit | link tới `REPORT.md` của audit bảo mật đầy đủ (do `hitl-index feature --report --security-audit <dir>` ghi) |
| `reviews/<T>/decisions.json` | commit | quyết định accept/reject/defer của người; giữ số F-n ổn định |
| `index/*` còn lại (index.json, index.md, .cache.json, state.json, .lock, .session/, contracts/, trace.md, linear.*.json) | ignore | sinh lại được / theo máy |
| `reviews/<T>/*` còn lại (l0.json, findings*.json, review-context.md) | ignore | `/hitl:review` sinh lại |
| `.inbox/` | ignore | file trung chuyển kết quả MCP |

`hitl-index init` ghi `.hitl/.gitignore` chuẩn (hoặc nối thêm các dòng còn thiếu, không xoá dòng cũ):
```
index/*
!index/skeleton.lock.json
reviews/*/*
!reviews/*/decisions.json
.inbox/
```
File đã lỡ commit không tự bị untrack: `/hitl:setup` in gợi ý `git rm -r --cached <paths>` (không tự chạy).
File sinh ra (index, lock, CODEBASE-MAP AUTO, review md, `linear.map.json`) **không sửa tay**; hook PreToolUse chặn agent sửa chúng.
Symbol id = `<relpath>#<QualName>` (vd. `src/services/userService.ts#UserService.createUser`), không có số dòng.

Tag trong docstring (chi tiết: `shared/tag-grammar.md`):
```ts
/**
 * Registers a user; rejects duplicate emails (case-insensitive).
 * @task T-12 @impl agent @status skeleton @prio 1
 * @dec D-1
 * @calls UserRepo.findByEmail, UserRepo.save
 * @concurrency none
 */
```
`@dec D-n` (tuỳ chọn, 0–3 symbol mỗi task): symbol này hiện thực decision D-n của planning. **Không** được hash vào
contract → thêm/bớt không cần duyệt lại. Lưu ý nâng cấp: dòng docstring cũ bắt đầu bằng `@dec …` trước đây là prose, giờ
là tag → một lần `INTENT_CHANGED` trên symbol đã khoá (hiếm).

## 7a. Ngôn ngữ & adapter

`hitl-index` index được mọi ngôn ngữ. Mỗi ngôn ngữ dùng một adapter, chọn theo thứ tự:
`customAdapters` → adapter chuyên dụng (TS/Python) → `ctags` (nếu có Universal Ctags) → `generic`.

| Adapter | Ngôn ngữ | Độ chính xác |
|---|---|---|
| `ts-compiler@<ver>` | TS/JS (khi project có `typescript`) | chính xác (AST) |
| `ts-lite@1` | TS/JS (fallback, không cần dependency) | gần đúng |
| `py-ast@1` | Python (`python3 -I`, stdlib `ast`) | chính xác |
| `ctags@1+<ver>` | mọi ngôn ngữ Universal Ctags hỗ trợ (cần bản build có `+json`) | tìm symbol bằng ctags; body/hash/call dùng logic generic |
| `generic@1` | Java, Kotlin, Scala, Groovy, Go, Rust, C, C++, C#, Swift, PHP, Ruby, Dart, Lua, Shell, SQL, Elixir, Nim (+ Python khi thiếu `python3`) | gần đúng, không cần dependency |

`generic` dùng bảng ngôn ngữ (`scripts/lib/adapters/langs.mjs`): đuôi file, cú pháp comment (`//`, `/* */`, `/** */`,
`#`, `--`, `--[[ ]]`, `=begin`…), string (kể cả raw/heredoc/interpolation), kiểu block (ngoặc nhọn, từ khoá `end`,
thụt lề, câu lệnh SQL) và regex khai báo cho từng ngôn ngữ. Nó index:
- symbol **có tag** (doc comment chứa tag hitl theo `shared/tag-grammar.md`: `/** */`, `///`, `//`, `#`, `--`, `@doc """…"""`);
  tag đặt trên một khai báo lạ vẫn được index (fallback, kèm cảnh báo);
- khai báo class/struct/interface/trait/module và function/method không có tag (best-effort);
- id dạng `Class.method` khi phát hiện được lồng nhau (receiver Go, `impl` Rust, `extension` Swift, `Foo::bar` C++);
- signature, intent, tag, body span, `sigHash`/`bodyHash`/`intentHash` (comment và khoảng trắng không làm đổi hash);
- stub: chuỗi `"TODO(impl): …"` trong body, ở mọi ngôn ngữ (`throw`, `panic`, `todo!`, `TODO()`, `raise`…);
- test: JUnit `@Test`, Go `TestX(t *testing.T)`, Rust `#[test]`, RSpec/ExUnit/Dart/Lua/bats DSL, gtest `TEST()`.

Mỗi file generic có một cảnh báo `GENERIC_APPROX`; mỗi ngôn ngữ có một `ADAPTER_LANG`
(vd. `kotlin → generic@1 (approx; install universal-ctags for better symbol discovery)`).

### Giới hạn độ chính xác (generic/ctags)
- Không phải parser thật: macro, code sinh tự động, cú pháp hiếm (C kiểu K&R, Scala 3 không ngoặc, getter Dart,
  `%`-literal Ruby lạ, regex literal chứa dấu ngoặc) có thể làm lệch body span.
- Call graph chỉ quét `name(` và giữ những tên trùng symbol đã index; gọi không ngoặc (Ruby/Elixir) bị bỏ qua.
- Overload (Java/Kotlin/Elixir nhiều clause) → `DUP_ID`, id thứ hai có hậu tố `~2`.
- Khai báo không có body (interface/abstract) được giữ; prototype/forward declaration C/C++ bị bỏ trừ khi có tag.
- Function lồng trong function không được index.

### Cấu hình
```jsonc
{
  "languages": ["*", "!sql"],            // "*" = mọi ngôn ngữ built-in; "!x" loại trừ; danh sách cũ ["ts","py"] vẫn giữ nguyên
  "adapters": { "kotlin": "ctags", "go": "generic", "sql": "none" }
}
```
Project cũ có `"languages": ["ts","py"]` không tự index ngôn ngữ mới; bật bằng
`hitl-index init --set 'languages=["*"]'`. `/hitl:setup` liệt kê ngôn ngữ phát hiện được và adapter của từng ngôn ngữ.

### Viết adapter riêng
```js
// .hitl/adapters/cobol.mjs
export default {
  id: "cobol@1",                 // đổi id ⇒ index lại toàn bộ
  langs: ["cbl", "cob"],         // đuôi file (không có dấu chấm)
  approx: true,                  // tuỳ chọn: lọc call theo tên symbol đã biết
  available: async (root, config) => true,
  parse: async (files, ctx) => files.map((f) => ({
    path: f.path, imports: [], warnings: [], parseError: null,
    symbols: [{ name: "PAYROLL.compute", kind: "function", parentName: null, exported: true, async: false,
      sigText: "…", doc: "…", bodyText: "…", commentLines: [], stub: false, locals: {}, calleesRaw: [],
      span: { start: 1, end: 9 }, docSpan: null, bodySpan: { start: 2, end: 9 }, test: null }],
  })),
};
```
Khai báo trong `hitl.config.json`: `"customAdapters": { "cobol": ".hitl/adapters/cobol.mjs" }`. Adapter riêng
luôn được ưu tiên trước adapter built-in; nếu `available()` trả `false` hoặc import lỗi thì quay về built-in.

## 8. Kiểm thử plugin

```sh
cd ~/.config/nvim/claude/hitl
node --test tests/unit/*.test.mjs      # unit tests (P1–P3)
tests/e2e.sh                            # e2e trên tests/fixtures/{ts-app,py-app} (Node ≥ 22.18, python3, git)
tests/e2e.sh --update-golden            # ghi lại tests/golden/*.symbols.json (rồi commit)
tests/e2e.sh --keep --continue          # giữ thư mục tạm, chạy hết các bước dù có bước fail
```

## 9. Gợi ý dùng kèm (tuỳ chọn)

- **obra/superpowers** plugin (TDD, systematic-debugging, verification).
- **Semgrep** (MCP/plugin) cho lớp security L0.
- **Stryker** (TS/JS) / **mutmut** (Python): bật `commands.mutation.*` trong config để có mutation gate.
- Built-in **`/code-review`** và **`/security-review`** làm ý kiến thứ hai (audit đầy đủ: `/hitl:review --security-audit`, xem 6a).

## 10. Giới hạn đã biết

1. Cô lập test-author dựa vào trường `agent_type` trong stdin của hook (khớp theo hậu tố `test-author`). Nếu trường này vắng, cô lập chỉ còn ở mức contract pack + prompt.
2. Phát hiện approve token giả định `UserPromptSubmit.prompt` chứa nguyên văn `/hitl:approve …`.
3. Sửa qua Bash (`sed -i`, heredoc) bỏ qua mô phỏng edit ở PreToolUse; chỉ bắt sau (Stop, prompt kế tiếp, pre-commit).
4. `--sync-tags` viết lại `@status` có thể đụng buffer đang mở trong editor; chỉ chạy ở điểm gate — reload buffer khi cần.
5. `ts-lite` (fallback khi project không có `typescript`) là xấp xỉ: regex literal, decorator, overload, JSX có thể sai → cảnh báo `LITE_APPROX`.
6. Tên testcase JUnit khác nhau giữa runner (node:test / vitest / jest / pytest); khớp theo heuristic, test không khớp được liệt kê ở `unmatched`.
7. Plugin cài đặt chạy từ bản cache của Claude, còn git hook chạy bản source (`$HITL_HOME`) → có thể lệch phiên bản; mọi JSON có schema version.
8. PreToolUse chạy cả trên Read/Grep/Glob/Bash; có fast path cho main thread (mục tiêu < 60 ms).
9. Mutation testing là best-effort và tắt mặc định (`mutationRequired: false`).
10. Ngưỡng risk (0.3/0.6), confidence 80, mutation 0.8 là heuristic, chưa đo; chỉnh trong config.
11. Tên tool/tham số của Linear MCP chưa được kiểm chứng trên mọi bản cài: `/hitl:tickets` dò tên tool lúc chạy (đọc schema trước lần gọi đầu); lần chạy thật đầu tiên nên theo dõi. Quyền MCP được hỏi một lần cho mỗi tool.
12. Linear MCP không xoá được relation → khi bỏ `blocked-by`, skill chỉ in nhắc xoá tay.
13. Override token (`--lane fast`) dùng lại được trong lượt chạy (≤3 giờ, chỉ task/feature đã gắn); feature token chụp danh sách task lúc bạn gõ lệnh — task thêm sau cần gõ lại lệnh. Cờ `override` trong lock là vĩnh viễn (an toàn hơn là tự xoá).

## Credits

Một số file tham chiếu được chuyển thể từ **mattpocock/skills** và **obra/superpowers** (MIT). Skill
**cloudflare/security-audit-skill** (MIT, © 2025-2026 Cloudflare, Inc.) được vendor nguyên bản ở `skills/security-audit/`. Ý tưởng từ spec-kit, cc-sdd, GSD,
plugin code-review của Anthropic, insilode, alvis draft-code, Meta ACH, TDD Guard, spec-kit-linear-sync, OpenSpec, Kiro/EARS, ADR (Nygard). Chi tiết và license đầy đủ: [NOTICE.md](NOTICE.md).
License: MIT © 2026 Thai.
