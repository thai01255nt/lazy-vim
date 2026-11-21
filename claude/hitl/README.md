# hitl — Human-in-the-loop SDD cho Claude Code

Plugin Claude Code cho quy trình spec-driven: **plan (spec) → design → tasks → skeleton → approve → test → implement →
review → archive**.

> **Giá trị của hitl là con người ở trong vòng lặp khi implement.** Cổng spec và design rẻ và luôn bật: thống nhất
> *làm gì* (plan) và *làm thế nào* (design) trước khi có code. Sau đó bạn chọn nhìn bao nhiêu lần:
> - **Mặc định, từng bước**: mỗi task high risk dừng ở skeleton → test → implement → review. Bạn duyệt contract
>   trước khi có code.
> - **Fast lane** (`/hitl:implement <KEY>-T<n> --lane fast`): một task chạy skeleton → test → code không gate, bạn review kết quả.
> - **Build rồi review** (`/hitl:implement --feature <change-id> --lane fast`, có thể sau một design mà bạn gõ `Y` ở
>   dòng "Accept all" của mỗi vòng): cả
>   change được build không gate, rồi một report gộp liệt kê mọi thứ để review và chỉnh (`/hitl:review`, `fix F-n`,
>   `amend F-n`). Lock, trace và drift vẫn ghi lại hết, nên không có gì "lọt" mà không ai xem.
> Cổng spec (`/hitl:plan`) không bao giờ bị bỏ: đó là thứ mà review cuối dùng để đối chiếu.

Spec là nguồn sự thật cho **hành vi** (`.hitl/specs/`, đọc được bởi BA/PO); code là nguồn sự thật cho **cách làm**:
intent nằm trong docstring của skeleton (tag `@task @impl @status …`), một AST index tất định (`hitl-index`) theo dõi
chữ ký/intent và báo **drift** so với skeleton đã duyệt. Agent chỉ làm phần được giao (`@impl agent`), phần
`@impl manual` là của bạn.

> English summary: a pure Claude Code plugin. Skills drive the phases, hooks enforce isolation and verification, and a
> zero-dependency Node CLI (`hitl-index`) indexes code in any language, locks approved skeletons and tests, computes
> status, reports drift, and (0.6) validates/merges OpenSpec-style spec deltas into living specs. Requires Node ≥ 20
> (fixtures/e2e: ≥ 22.18); Python 3.9+ for `.py`. State lives in `.hitl/`.
> 0.6: `/hitl:plan` is spec-only (proposal + per-capability deltas with GIVEN/WHEN/THEN scenarios, ids like `ACC-R3.S1`,
> grill-style rounds via the vendored `hitl:grilling`, coverage + `deep <ID>` + stop rule), new `/hitl:design` (<KEY>-D<n>,
> module-level components, data model, contracts) and `/hitl:archive` (merge into `.hitl/specs/`, move to
> `.hitl/archive/`), trace `hitl.trace/2` (requirement → scenario → AC → test → symbol).
> 0.6.1: each artifact follows a standard (`shared/formats/`): ISO 29148/INCOSE requirement quality + ISO 25010 NFRs
> with a fit criterion, DMN decision tables, `stateDiagram-v2` lifecycles, Cockburn use cases, MADR decisions, OpenAPI
> 3.1 / AsyncAPI 3 / JSON Schema 2020-12 / CLI contracts, C4 diagrams; `spec validate` warns (never errors) on deviations.

> **Mới dùng? Đọc [HUONG-DAN.md](HUONG-DAN.md)** (một trang, từng lệnh theo thứ tự). Phần dưới là tài liệu tra cứu.

## 1. Cài đặt

```sh
# Thêm marketplace local (thư mục chứa .claude-plugin/marketplace.json)
claude plugin marketplace add ~/.config/nvim/claude
# Cài plugin (marketplace tên "thai-hitl")
claude plugin install hitl@thai-hitl
```
Trong session cũng dùng được: `/plugin marketplace add ~/.config/nvim/claude`, `/plugin install hitl@thai-hitl`.
Sửa file của marketplace local → có hiệu lực ở session mới hoặc sau `/reload-plugins`.

### Chỉ bật hitl cho một số project

Khi plugin đang bật, mô tả skill và agent của nó luôn nằm trong context (khoảng 1,5k token), kể cả ở project không
dùng hitl. Muốn chỉ bật ở project cần dùng thì tắt ở scope user và bật ở scope project.

```sh
# 1. Tắt cho mọi project (ghi "hitl@thai-hitl": false vào ~/.claude/settings.json)
claude plugin disable hitl@thai-hitl --scope user
# 2. Trong project cần dùng: bật ở scope project (ghi vào <project>/.claude/settings.json, commit cho cả team)
cd ~/code/my-app
claude plugin enable hitl@thai-hitl --scope project
#    hoặc chỉ cho riêng bạn (ghi vào .claude/settings.local.json, không commit):
#    claude plugin enable hitl@thai-hitl --scope local
claude plugin list          # kiểm tra: hitl@thai-hitl đang bật ở project này
```

Cũng có thể sửa tay. `~/.claude/settings.json` (user):
```json
{ "enabledPlugins": { "hitl@thai-hitl": false } }
```
`<project>/.claude/settings.json` (project, commit) hoặc `.claude/settings.local.json` (local, không commit):
```json
{ "enabledPlugins": { "hitl@thai-hitl": true } }
```
- Key có dạng `<plugin>@<marketplace>`, giá trị `true`/`false`. Thứ tự ưu tiên là local > project > user (managed và
  `--settings` đứng trên cả ba). Vì vậy giá trị ở project ghi đè giá trị ở user cho đúng key đó.
- Marketplace `thai-hitl` vẫn khai báo ở scope user (lệnh `claude plugin marketplace add …` ở trên ghi vào
  `extraKnownMarketplaces`). Máy khác hoặc người khác trong team cũng phải add marketplace này. Nếu không, project bật
  một plugin mà Claude Code không tìm thấy.
- Thay đổi có hiệu lực ở session mới (hoặc sau `/reload-plugins`). Hook của hitl (SessionStart, PreToolUse, …) cũng chỉ
  chạy ở project đã bật.
- Muốn thử một lần mà không đổi setting: `claude --plugin-dir ~/.config/nvim/claude/hitl` (xem mục Dev bên dưới).

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

### Nâng cấp từ 0.21.0

0.21.1 làm **tasks brief gọn lại thành một danh sách**. Bỏ các câu Q1–Q4 `[Q]`, câu `[C]` theo mã cảnh báo, dòng
accept-all, phần ghi sẵn n/a của quick và bảng `## Current set` (cột wave). Thay vào đó, `## Tasks (N) — in build order`
do `hitl-index tasks gate <id> --write` sinh từ `tasks.md`: mỗi task hai dòng (id, tiêu đề, `— after T1`; prio · risk →
lane · ai viết · số AC và test). Tiếp theo là `## Needs your eye`, chỉ có khi Claude thật sự cần bạn nhìn; override test
thành dòng `- Override: <AC> …? (needs its own Y)`. Cuối cùng là `## Notes` và `## Approve? (needs its own Y)`.
Mỗi vòng viết lại cả file. Claude tự sửa các cảnh báo trace trong lúc viết task.

**Sửa muộn rẻ:** trên bộ task đã duyệt, đổi prio, thứ tự hay `blocked-by` của task chưa làm không cần vòng mới và
không bị giữ (bạn hay Claude đều được). Bạn cũng sửa thẳng được risk. Claude chỉ được nâng risk: hook chặn khi nó
hạ risk hay bỏ lý do (`TASKS_RISK_LOWERED`). Thêm/bỏ task, đổi AC, hàm hay test plan vẫn qua `tasks update`.

**Brief 0.21.0 đang mở:** vẫn dùng được. `Y` dưới `Approve the task set?` vẫn duyệt, câu `_Override:_` đã trả lời vẫn
là bằng chứng. Vòng sau Claude viết theo mẫu mới.

### Nâng cấp từ 0.20.0

0.21.0 chuyển **gate của `/hitl:tasks` từ chat sang file brief**, như plan và design. `/hitl:tasks` viết `tasks.md`
(`> status: draft`) rồi mở `changes/<id>/tasks-brief.md` (quick file: `.hitl/tasks/quick-<slug>-brief.md` nằm cạnh nó,
chạy tiếp bằng `/hitl:tasks <QKEY>`). Mỗi vòng: mục `## Current set` do CLI sinh từ `tasks.md` (bảng task có thêm cột
**wave** = độ sâu phụ thuộc, bảng test plan), bốn câu `[Q]` (slice, blocking edge, owner, test plan) kèm phần Claude tự
kiểm và `_Rec:_`, một câu `[C]` cho mỗi mã cảnh báo (fix hay accept), một câu `_Override:_` cho mỗi AC, Notes, và câu cuối
`Approve the task set? (needs its own Y)`. Chữ `Y` gõ trong chat không còn là câu trả lời; `Y` ở dòng accept-all không
duyệt bộ task. Bạn có thể sửa thẳng `tasks.md`: lần chạy sau đọc chỗ sửa như câu trả lời (`_Changed since Round n:_`,
tính từ snapshot `.tasks-round.json` của vòng). `Y` duyệt chỉ có hiệu lực khi bộ task vẫn đúng như vòng đó đã cho xem;
khác thì câu duyệt thành `→ superseded` và có vòng mới. Chỉ `hitl-index tasks approve <id|QKEY>` đặt
`> status: approved` (hook chặn Claude tự sửa dòng đó).

**Có cần migrate không:** không có lệnh migrate, nhưng có một thay đổi chặn: `TASKS_NOT_APPROVED`.
- `tasks.md` (hoặc quick file) đã `approved`: không ảnh hưởng gì.
- `tasks.md` còn `draft`: từ 0.21 `/hitl:skeleton`, `/hitl:implement` (cả fast lane và `--feature`) và `/hitl:test`
  từ chối task của nó; CLI từ chối `approve <T> --stage skeleton|tests` và `context <T>`. Để duyệt: chạy
  `/hitl:tasks <change-id>` (quick: `/hitl:tasks <QKEY>`); Claude viết vòng 1 của brief cho bộ task hiện có (không viết
  lại task), bạn trả lời `Y` dưới câu `Approve the task set?`, chạy lại lệnh đó, CLI duyệt.
- Update (`/hitl:tasks <id> update …`): `tasks.md` giữ `approved`; chỉ task mới hoặc vừa sửa bị giữ đến khi `Y` của vòng
  update. Đang có amend brief mở thì update ghi vào Notes của amend brief (một change không có hai brief cùng ghi `tasks.md`).
- `!` trong test plan (`none!:`/`manual!:`) không có câu `_Override:_` trả lời `Y` trong brief → info
  `TEST_OVERRIDE_UNRECORDED`; `status` và báo cáo review ghi `(no brief record)`. Các dòng `!` của 0.20 vẫn hợp lệ.
- `next-id --quick` từ chối slug kết thúc bằng `-brief` (`QUICK_SLUG_RESERVED`). Quick brief bỏ dở không bị xoá, `status`
  liệt kê nó là draft.

### Nâng cấp từ 0.19.0

0.20.0 thêm **ngoại lệ test do người quyết**: trên task risk security/concurrency/data, `/hitl:tasks` vẫn từ chối
`none:`/`manual:` (`TEST_PLAN_NONE_RISK`), nhưng bạn có thể ghi `none!: <lý do>` hoặc `manual!: <cách kiểm> — <lý do>`.
Thiếu lý do là lỗi; có lý do thì chỉ cảnh báo `TEST_PLAN_NONE_RISK_OVERRIDE`, `status` ghi `⚠️ test override`, báo cáo
review liệt kê AC đó, `/hitl:approve <T> done` liệt kê `manual!`. Claude không tự ghi `!`, chỉ hỏi bằng câu
`(needs its own Y)`. `/hitl:design` báo xung đột này sớm: câu hỏi chiến lược test khi risk có security/concurrency/data
là `(needs its own Y)`. Sửa bốn báo động giả: spec-scout đọc được git chỉ-đọc (`git show <branch>:<path>`, `log`,
`diff`, …); lint ngôn ngữ nghiệp vụ bỏ qua tên riêng có trong glossary (vd. `WorldQuant`); bảng tra cứu trong rule
không bị coi là decision table; hook không chặn lệnh Bash chỉ nhắc đường dẫn archive trong chuỗi, comment hay commit
message. Không cần migrate.

### Nâng cấp từ 0.18.0

0.19.0 thêm **nhảy tới id**: `hitl-index where <id>` liệt kê mọi chỗ một id xuất hiện (nơi định nghĩa, test có `@ac`
chứa nó, symbol của task, dòng brief, mọi chỗ nhắc khác), để editor nhảy từ id dưới con trỏ (xem mục 3a). Không cần
migrate: lệnh chỉ đọc, không đổi file nào. Thay đổi nhỏ cho ai dùng `tasks --json` hay đọc kết quả parser: mỗi task và
mỗi AC giờ có thêm `line` (dòng 1-based của heading `## <id>` / dòng `- [ ] <id>`).

### Nâng cấp từ 0.17.0

0.18.0 là bước 2 của amend: amendment giờ thấy cả **code gọi tới** thứ bị đổi, docstring có lint chống **chữ kể lịch sử**,
và hành vi cũ **đã merge/release** có hướng dẫn cùng check cho việc chuyển đổi nhiều bước. Không cần migrate: `tasks.md`
cũ (không có `**Temp**:`, `**Removes**:`, `deploy:`) vẫn đọc như trước; amendment trong branch không đổi gì.

**1. Dependency pass trong impact.** Trước 0.18, `amend start` chỉ đi theo link truy vết (spec → AC → test `@ac`,
`@dec`). Giờ nó đi thêm call graph của code index: với mỗi symbol amendment đổi hoặc xoá (`@dec` của decision bị đổi,
symbol ref, symbol mà test của AC class `contract` cover, dòng `modify`/`remove` của task trong amend set), nó liệt kê
**caller** trực tiếp (`--depth n` để đi xa hơn, mặc định 1 bước, tối đa 200 caller), test cover các caller đó, và
entity của `data-model.md` mà tên/chữ ký/intent của symbol nhắc tới. Mỗi mục ghi đường đi (`calls saveReset`). Kết quả
nằm trong amend brief, nhóm `### Reached through calls` của `## Affected`, trong khối Impact (`note apply --dry-run`)
và `amend start|check --json` (`affected.calls` / `calls`). `AMEND_UNCOVERED` giờ đòi **mỗi caller** có task xử lý
(dòng Symbols của một task trong set) hoặc một dòng lý do dưới `## Unchanged`. Giới hạn: chỉ thấy lời gọi tĩnh mà
indexer resolve được (cộng tag `@calls`); không thấy lời gọi động (callback, object inject, dispatch bằng chuỗi),
reflection, service khác, file của ngôn ngữ indexer không parse — những thứ đó hỏi trong brief.
```
### Reached through calls (1 hop)

- Changed: saveReset — @dec TTL-D1
- Caller: postReset — calls saveReset; 1 test(s)
- Caller: resendAll — calls saveReset; no test covers it

## Unchanged

- postReset — signature-compatible: it reads only the email
```

**2. Lint `INTENT_HISTORY`.** Docstring và step comment (`n.`, `TODO(impl)`) của symbol có `@task` hoặc đã khoá không
được kể lịch sử. Lint tất định, theo **cụm từ** (không theo một từ đơn) cả tiếng Anh lẫn tiếng Việt: `previously`,
`used to` (sau chủ ngữ là code), `no longer sends|returns|…`, `now returns|now also|from now on`, `changed from … to`,
`was renamed`, `old/legacy behaviour`, `as of v2.3`, `not … anymore`, `after this change`; `trước đây`, `trước kia`,
`giờ đây`, `từ nay`, `bây giờ trả về|gửi|…`, `không còn gửi|trả về|…`, `đổi từ … sang`, `đã đổi tên`,
`hành vi cũ|cách xử lý cũ|…`, `như cũ`, `kể từ phiên bản 2.3`. Từ nghiệp vụ không bị bắt: `now()`, "old password",
"a session no longer active", "the key used to sign", "mật khẩu cũ", "thời điểm bây giờ", "token không còn hiệu lực";
chữ trong backtick được bỏ qua. Chỉ là **cảnh báo**, không bao giờ chặn: `hitl-index intents` (cột `history`), drift
(`warn` khi intent còn là bản nháp, `info` khi đã khoá và không đổi; config `"intent": { "history": "warn" | "info" |
"off" }`), gate `history` của review L0, `hitl-index amend check` (`warnings`). Cách sửa: chỉ giữ contract hiện tại, đưa
lịch sử vào delta `Changed:`/`Reason:`, D superseded + Changelog, amend brief hoặc commit message. Khi tương thích
ngược **chính là** contract, ghi `hitl: history-ok` (một dòng riêng trong docstring = cả docstring; trong một dòng =
dòng đó).
```
Stores a reset request. No longer stores the lifetime in hours.   → ⚠️ INTENT_HISTORY intent: "No longer stores"
Stores a reset request with its expiry time.                        → không cảnh báo
```

**3. Hành vi cũ đã merge/release: expand → migrate → switch → contract.** Khi câu transition của amend brief là
`merged` hoặc `released`, brief hỏi thêm ba câu `[D]` (mỗi câu có `_Rec:_`): ai phụ thuộc dạng cũ (consumer, dữ liệu
đã lưu, service khác), thời hạn deprecation, có cần feature flag. Task set viết theo mẫu của
`shared/formats/parallel-change.md` (đổi schema/dữ liệu, đổi API, hành vi sau feature flag, đổi format event), với
marker mới trong `tasks.md`:
- `**Temp**: <tên> (data|api|event|flag|shim) — <mô tả>` dưới dòng meta của task thêm thứ tạm (dual write, flag,
  shim, API version cũ); mỗi `expand` phải có ít nhất một;
- `**Removes**: <tên>, …` trên task `contract` gỡ chúng (dòng `remove` của cùng symbol cũng tính);
- `| deploy: <n>` sau `kind:` — nhóm deploy (không ghi = 1).

Check mới (chỉ cho set merged/released; set in-branch không bị ảnh hưởng): `AMEND_TEMP_NO_REMOVAL` (thứ tạm không có
contract nào gỡ, `expand` không khai thứ tạm), `AMEND_CONTRACT_SAME_DEPLOY` (contract xoá thứ tạm loại `data`/`api`/
`event` cùng hoặc sớm hơn deploy đã thêm nó; `released` mà contract không ghi `deploy:`), `AMEND_ORDER` mở rộng
(contract của hành vi đã merge/release không được `blocked-by: none`; `deploy:` không được sớm hơn task nó chờ). Chạy
trong `tasks --check` và `amend check`.
```
## TTL-T2 Store the expiry timestamp beside the hours
- prio: P1 | risk: high (data) | impl: agent | blocked-by: none | amend: TTL-A1 | kind: expand | deploy: 1 | status: todo
**Temp**: dual-write-expiry (data) — saveReset writes expiresAt and ttlHours both

## TTL-T5 Drop the hour field
- prio: P2 | risk: high (data) | impl: agent | blocked-by: TTL-T4 | amend: TTL-A1 | kind: contract | deploy: 3 | status: todo
**Removes**: dual-write-expiry
```

### Nâng cấp từ 0.16.0

0.17.0 đổi cách xử lý **yêu cầu thay đổi giữa chừng** (spec hoặc design đã duyệt, vài task đã xong, vài task đang làm).
Không cần migrate: `tasks.md` cũ (không có `amend:`, `kind:`, `remove`, `dropped`, `superseded:`) vẫn đọc như trước.

**Bạn làm gì khi yêu cầu đổi giữa lúc implement:**
1. Nói thay đổi trong chat như trước → Claude hỏi `_Note_ for <change>, refs …? (Y/n)` → `Y` ghi note `N-k`.
2. Chạy `/hitl:plan <id> amend N-k` (thay đổi về thiết kế: `/hitl:design <id> amend N-k`). Không có lệnh mới.
   CLI (`hitl-index amend start`) chọn đường đi một cách tất định:
   - mọi id chỉ đổi **câu chữ** (class `wording`) → vẫn một gate trong chat như cũ (preview delta, khối Impact, rồi
     `Apply?`);
   - chỉ đụng task, AC, symbol, test → `/hitl:tasks <id> update`;
   - còn lại (hành vi, contract, scenario, requirement mới) → một **amend brief** riêng:
     `.hitl/changes/<id>/amend-PWR-A1-brief.md` (id `PWR-A1` từ `hitl-index spec next-id <id> --kind A`).
3. Mở file đó trong editor. Đầu file là sự thật do CLI ghi: **task nào đang ở đâu** (todo / đang làm / đã xong, đã khoá
   gì) và **amendment chạm tới gì** (AC, decision, symbol, test đã khoá — kể cả test của change đã archive). Vòng 1 hỏi:
   đổi gì (bằng lời nghiệp vụ); hành vi cũ **chỉ ở branch này, đã merge hay đã release**; mỗi việc ngoài phạm vi `[X]`
   (nhận vào change này · change riêng · bỏ); mỗi task làm dở `[K]` (giữ và sửa · revert). Trả lời trên dòng `>`, chạy
   lại `/hitl:plan <id> amend`.
4. Phần `## Close` cho xem preview delta, khối Impact và **amend task set** (thứ tự prep → switch → contract, hoặc
   prep → expand → migrate → switch → contract khi hành vi cũ đã merge/release). Gõ `Y` dưới câu hỏi
   `Approve the amendment?` → Claude sửa delta/design, ghi task set vào `tasks.md`, đánh dấu note đã áp dụng. Khi có
   việc đã khoá cần mở, bạn vẫn tự gõ `/hitl:approve <id> reopen N-k` (chỉ bạn mở khoá).

**Luật theo trạng thái task** (một file: `shared/task-changes.md`, dùng chung cho amend và `/hitl:tasks update`):
- task `todo` → sửa tại chỗ, hoặc bỏ: `hitl-index tasks drop <T> --reason "…"` (ghi `status: dropped` + dòng
  `**Dropped**:`; id không bao giờ dùng lại);
- task đang làm (skeleton/test đã khoá, chưa xong) → mở lại tại chỗ, bước TODO được làm mới;
- task `done` → **không bao giờ mở lại**: một task mới (id mới) nhận các symbol của nó (`modify`/`remove`) và các test
  cũ khẳng định hành vi cũ (dòng test plan `rewrite: <test hoặc AC cũ>`); AC cũ được ghi
  `- superseded: PWR-T1.AC2 → PWR-T5.AC1 (PWR-A1)`. Review và bản ghi done của task cũ giữ nguyên.
- việc dọn dẹp (xoá code chết, revert, migrate) luôn là task mới.

Ví dụ ngắn: link đặt lại mật khẩu đổi từ 1 giờ xuống 15 phút; PWR-T1 (gửi link) đã xong, PWR-T2 (đặt mật khẩu mới) đang
đỏ, PWR-T3 (khoá tài khoản) chưa làm.
```
_Amend set:_ PWR-A1 — 3 tasks · transition: branch · order: switch → contract
1. PWR-T5 switch   Link hết hạn sau 15 phút        modify ResetService.request (done in PWR-T1) · rewrite: PWR-T1.AC2
2. PWR-T2 switch   Đặt mật khẩu mới (mở lại)        AC1 sửa chữ · bước TODO làm mới · blocked-by PWR-T5
3. PWR-T6 contract Bỏ job quét link hết hạn          remove ResetJob.sweep · blocked-by PWR-T5
superseded: PWR-T1.AC2 → PWR-T5.AC1 · PWR-T3 giữ nguyên (## Unchanged)
```
Sau `Y`: `/hitl:approve feat-password-reset reopen N-3` chuyển test cũ của PWR-T1 sang PWR-T5 và mở lại test của PWR-T2;
rồi làm PWR-T5 như mọi task.

Những gì khác đổi:
- **Trong lúc amend brief còn mở, task bị chạm sẽ đứng chờ** (`_Held:_` trong status): `/hitl:implement` dừng, hook
  chặn implementer; task không bị chạm vẫn chạy tiếp.
- **Không còn `overwrite`**: `/hitl:tasks <id>` trên `tasks.md` đã có luôn là update. Chia lại toàn bộ khi mọi task còn
  `todo` = update bỏ task cũ (`tasks drop`, chạy sau `Y` ở quiz gate) và thêm task mới.
- Meta task mới: `| amend: PWR-A1 | kind: switch` (đứng trước `| status:`); Symbols có `remove` (task chỉ xong khi symbol
  đã mất khỏi code: `REMOVE_STILL_PRESENT`). Check mới: `AMEND_ORDER`, `AMEND_UNCOVERED` (mọi thứ amendment chạm tới
  phải có task xử lý, hoặc ghi lý do dưới `## Unchanged` trong amend brief) — chạy trong `tasks --check` và
  `hitl-index amend check <id>`.
- **Một luật trạng thái** (`shared/amend-spec.md` §6): amendment không bao giờ đưa proposal/design về `draft`; chữ `Y`
  trong amend brief chính là lần duyệt lại. "Reopen the spec/design" chỉ được khi change chưa có task nào. Gate chat:
  Impact trước, rồi mới hỏi `Apply?`. Mini change `fix-<slug>` (amend một change đã archive) có change key riêng.
- **Docstring chỉ nói ý định hiện tại**: không viết "trước đây", "bây giờ", "không còn", "previously", "now"… Lịch sử
  nằm ở delta (`Changed:`/`Reason:`), Changelog của design, amend brief, `superseded:` trong tasks.md và git.

### Nâng cấp từ 0.15.0

0.16.0 đổi **chính sách test**. Không cần migrate: `tasks.md` cũ (bảng test plan 5 cột, không có cột `test`) vẫn đọc
như trước, mỗi dòng là một test mới; test đã khoá giữ nguyên, không ai viết lại.

**Đây là "test chấp nhận viết trước", không phải TDD của Kent Beck.** Luồng đầy đủ (plan → … → `/hitl:test` →
implement) chốt hình dạng code trước (tên hàm, việc mỗi hàm phải làm), rồi một subagent riêng viết **cả loạt** test
chấp nhận của task từ mô tả đó (nó không đọc được code), khoá lại, rồi mới viết code cho xanh. Điểm mạnh: người viết test
không thấy code nên không chép lỗi của code vào test. Còn TDD thật (viết một test nhỏ, thấy nó đỏ, viết vừa đủ code cho
xanh, dọn code, lặp lại; danh sách test lớn dần khi phát hiện trường hợp mới) là `/hitl:tdd`: dùng cho bug có cách tái
hiện hoặc logic nhỏ.

**Vì sao mỗi test phải nêu lỗi nó bắt.** Test là code: tốn công đọc, sửa và giữ. Trước đây luật chỉ có sàn ("ít nhất một
test mỗi AC", test-author thêm test tuỳ ý, review chỉ thêm), nên số test tăng chỉ vì quy trình đòi. Nay mỗi test phải trả
lời được "nếu code sai kiểu nào thì test này đỏ?". Không trả lời được thì không viết.

Những gì đổi với bạn:
- **Cột `test` trong test plan** (`/hitl:tasks`): mỗi AC một quyết định —
  `new: <lỗi nó bắt>` (test mới) · `shared: AC1` (dùng chung test của AC1, một test mang cả hai `@ac`) ·
  `covered: <test có sẵn>` (tên test, `file#tên` hoặc id AC khác) · `none: <lý do>` (không test tự động: kiểu đã do
  compiler kiểm, nối dây thuần, cấu hình; **cấm** với task có risk `security`, `concurrency` hoặc `data`) ·
  `manual: <cách kiểm tay>` (liệt kê lúc `/hitl:approve <T> done`; cũng **cấm** với task risk `security`,
  `concurrency` hoặc `data`: task đó phải có test tự động cho mỗi AC). Ví dụ:
  `| AC2 | shared: AC1 | — | — | — | — |`.
- **Gate `/hitl:tasks` có câu 5: "Test plan ok?"** kèm bảng `task · AC · test · seam`. Đây là chỗ bạn quyết test nào
  được viết và bao nhiêu, kể cả task low risk chạy fast lane.
- **Tên test không chứa id** (`test_rejects_duplicate_email_ignoring_case`, không phải `test_T12_AC1_…`): một test có
  thể chứng minh nhiều AC, kể cả AC của change sau, nên id chỉ nằm trong tag `@ac` (được ghi nhiều id, cách bằng dấu cách
  hoặc dấu phẩy). Test cũ có id trong tên vẫn hợp lệ. Hai test trùng tên trong một file (Python chỉ giữ hàm định nghĩa
  sau) → khoá test bị chặn, kèm gợi ý đổi tên.
- **Tag `@catches <lỗi>`** trên test; test thêm ngoài test plan (test-author, mutation, fix loop) bắt buộc có nó.
  **Ngân sách mềm**: mỗi task ≤ số dòng `new` + 2 test đang chạy; vượt → ⚠️ lúc khoá, không chặn. Report review và feature
  report có mục số test theo task và tổng của change.
- **`@kind regression`**: test giữ hành vi đã có được phép xanh ngay lần khoá đầu (liệt kê riêng: "Guards existing
  behaviour"). Bảng RED nói rõ test **đỏ vì assertion** (`assertion-failed`) hay **chỉ chạm sentinel `TODO(impl)`**
  (`reached-stub`).
- **Review**: lens tests gợi ý gộp/xoá test thừa (test lặp chỉ khác dữ liệu, tracer trùng seam giữa các task, test không
  nêu lỗi) — chỉ là gợi ý; xoá test đã khoá luôn qua `/hitl:approve <T> tests` của bạn.
- **Mutation testing bắt buộc cho task high risk** khi đã cấu hình lệnh mutation (`mutationRequired: "high"`, mặc định
  mới; `true` = mọi task, `false` = tắt). Project đã ghi `"mutationRequired": false` trong `hitl.config.json` giữ nguyên.
  Với Stryker bật `disableBail` để `mutate` ghi test nào giết mutant nào.
- **`hitl-index tests audit [<change>|<task>] [--json]`** (chỉ đọc): liệt kê test nên xem lại để tỉa (không nêu lỗi,
  không có `@ac`, trùng AC cùng seam, tracer chồng nhau, không giết mutant nào, trùng tên, id trong tên) và ngân sách từng
  task. Bạn chọn; xoá qua đường approve như trên.
- **`/hitl:go`**: một luật duy nhất — thử lần lượt note → amend/update → tdd → quick → plan, đường đầu tiên khớp đủ điều
  kiện thắng; không chắc một điều kiện thì coi như không khớp (rơi xuống đường nặng hơn). Bug một hàm có cách tái hiện
  → `/hitl:tdd` (CLI tự chuyển `quick` có `bug-repro` sang `tdd`). `/hitl:tdd` giờ thêm trường hợp mới vào danh sách test
  trong lúc làm và cho dọn code (refactor) sau mỗi vòng xanh.

### Nâng cấp từ 0.14.1

0.15.0: **emoji được thay bằng nhãn chữ nghiêng** cho dễ đọc, ví dụ `_Rec:_` (gợi ý, trước là 💡 Recommended),
`_Next:_` (lệnh tiếp theo), `_Stop:_` (bị chặn), `_Disc:_` (Claude trả lời câu hỏi bạn viết trong brief), `_Hot_`
(điểm nóng), `_Note_` (note `N-k`), `_To P:_` / `_From P:_` (note gửi sang / đến từ change P), `_Waits:_` (change đang
chờ). Chỉ còn ✅ ❌ ⚠️ và mũi tên `→`. Quên nghĩa một nhãn: `/hitl:flow help` (mục Labels) liệt kê tất cả, mỗi nhãn một
dòng. File brief cũ (có 💡 Recommended, 💬, 🔥, 📥 For) vẫn đọc được, không cần migrate; file mới chỉ dùng nhãn.
Cũng trong 0.15.0: trường `brief` của `.hitl/.inbox/route.json` (`/hitl:go`) đổi tên thành `summary` (tên cũ vẫn đọc
được); từ "brief" giờ chỉ dùng cho file brief.

### Nâng cấp từ 0.14.0

0.14.1: **mọi file markdown hitl ghi đều ổn định dưới prettier** (kiểu markdownlint; nvim chạy prettier khi lưu): dòng
trống quanh heading, danh sách, bảng, blockquote; dấu `→ recorded` / `_Disc:_` trong brief luôn cách dòng `>` một dòng trống
(trước đây prettier biến chúng thành `> → recorded: …`, làm parser tưởng là câu trả lời; parser giờ hiểu cả dạng đó).
CLI tự ghi đúng kiểu này (living spec, glossary, notes, migrate, report; bảng được căn cột như prettier). Hash của block
(`.base.json`, note) giờ không đổi khi prettier format lại file; hash cũ vẫn được chấp nhận, không cần migrate.

Cũng trong 0.14.1, cách brief được xử lý:
- **Dòng Accept all không trả lời mọi câu nữa.** `Y` ở dòng `Accept all recommendations of this round: >` nhận gợi ý
  của mọi câu bạn **để trống** trong vòng, trừ ba loại câu tác động ra ngoài brief: `Q0` (đổi id/key của change),
  `_To <P>:_` (ghi note sang change khác) và `_Needs spec:_` (thêm spec delta + Impact từ design). Heading của chúng có
  chữ `(needs its own Y)`: phải gõ `Y` ngay dưới câu đó; để trống thì câu được chuyển sang vòng sau dù dòng Accept all
  là `Y`. Câu bạn viết trả lời luôn thắng Accept all. `hitl-index brief --json` có thêm trường `ownY` cho các câu này.
- **Trả lời `n` / `no` / `không` / `ko` được đọc theo nghĩa cả câu**, không theo bảng từ khoá: `n` kèm sửa đổi hay lựa
  chọn khác = đó là câu trả lời; `n` kèm "để sau" / "chưa cần" = hoãn (plan: `## Deferred` của proposal; design:
  `## Open questions` của design.md); `n` trơn = Claude hỏi lại `_Disc:_` muốn thế nào (kèm lựa chọn), câu giữ nguyên số ở
  vòng sau; `n` trơn dưới câu `(needs its own Y)` = không ghi gì, đánh dấu `→ recorded: declined`.
- **Đổi id, key và phạm vi của change được suốt lúc brainstorm**, cho tới khi change có task đầu tiên (trước đây chỉ ở
  vòng 1 của plan): trả lời `Q0`, hoặc bất kỳ câu trả lời / Notes nào sau đó. `hitl-index brief rename <id> [--to
  <id-mới>] [--key <KEY>]` giờ đổi tên thư mục, dòng meta, **mọi id mang key cũ** trong file của chính change đó
  (proposal, spec delta, glossary delta, design.md, data-model, contracts, brief, notes.md) và `source:` của note mà
  change khác giữ từ nó; có task rồi thì từ chối (`BRIEF_RENAME_LATE`, exit 1). Key bị trùng → JSON có `suggestion` (key
  trống kế tiếp); Claude ghi `_Disc:_` và hỏi lại ở vòng sau, phần còn lại của vòng vẫn được xử lý. Đổi phạm vi (một câu trả
  lời hay Notes mở rộng, thu hẹp hoặc đổi hướng change) → Claude dựng lại toàn bộ câu hỏi còn mở: câu không còn liên
  quan được đánh `→ dropped (scope changed)`, câu còn liên quan được viết lại cho phạm vi mới, yêu cầu/quyết định không
  còn đúng được sửa hoặc bỏ, và Why / What changes / Out of scope / Coverage của proposal được cập nhật.
- **`/hitl:plan <id>` trên spec đã duyệt** (không có `amend`) giờ hỏi trong chat: `Spec is approved. 1. small edit:
  /hitl:plan <id> amend · 2. reopen the spec: proposal back to draft, a new round in the plan brief` rồi dừng (trước
  đây chỉ in một dòng gợi ý). `/hitl:design <id>` trên design đã duyệt hỏi giống vậy.

### Nâng cấp từ 0.13.2

0.14.0: **phỏng vấn của `/hitl:plan` và `/hitl:design` chuyển từ chat sang một file brief** bạn sửa trong editor:
`.hitl/changes/<id>/plan-brief.md` và `design-brief.md` (template: `shared/templates/{plan,design}-brief.md`). File
nằm trong thư mục change và đi theo change khi archive. Không cần migrate.
- `/hitl:plan <mô tả>` (hoặc `/hitl:go` chọn plan) tạo change **không hỏi trong chat**: id và key gợi ý được dùng luôn,
  scout chạy xong thì ghi brief: `## Description` = mô tả của bạn nguyên văn, `## Round 1` = `Q0` (giữ id và key? đổi
  được: `hitl-index brief rename`; từ 0.14.1 tới khi change có task đầu tiên), ~10 câu cốt lõi theo 9 nhóm độ phủ
  (mỗi câu một gợi ý `_e.g. …_`, **không**
  có `_Rec:_`) và tối đa 5 câu riêng cho change. Chat chỉ in `Brief ready: … — answer in the file, then run /hitl:plan <id>`.
- Bạn viết câu trả lời ở dòng `>` dưới mỗi câu (bao nhiêu dòng cũng được; có thể viết thêm vào Description trước lần
  chạy đầu), rồi chạy lại `/hitl:plan <id>` (hoặc gõ "tiếp"/"xong" trong cùng hội thoại). Claude ghi spec, thêm
  `→ recorded: <id>` dưới mỗi câu, đánh `✅` vòng đã xong và nối vòng sau; từ vòng 2 mỗi câu có `_Rec:_` và một
  dòng `Accept all recommendations of this round: >`.
- Cuối mỗi vòng (và trong `## Close`, trước câu duyệt) có khối `### Notes — anything the questions missed, or a change
  to an earlier answer`: viết ở đó điều câu hỏi bỏ sót hoặc sửa một câu trả lời cũ (`Q5: …` / `sửa Q5: …`). Claude
  ghi lại rồi đánh dấu `→ recorded: <id> (new|changed)` (sửa yêu cầu/quyết định tại chỗ khi chưa duyệt), hoặc biến nó
  thành câu hỏi ở vòng sau; Notes đã đánh dấu không bị xử lý lại. `## Description` chỉ là mô tả ban đầu (sửa được tới
  lần chạy đầu); sau đó thông tin mới vào Notes của vòng đang mở. Chữ sau id trên dòng lệnh (`/hitl:plan <id> <chữ>`)
  cũng được ghi vào Notes đó.
- Cách trả lời (tiếng Anh hoặc tiếng Việt): `Y`/`yes`/`ok`/`được`/`đồng ý`/`ừ` = nhận gợi ý (ở dòng Accept all: nhận
  mọi gợi ý của vòng) · `?`/`don't know`/`không biết`/`chưa biết` = để mở, Claude gợi ý ở vòng sau · để trống = hỏi lại
  · `deep <ID|chủ đề>` = đào sâu · `done`/`xong` = thôi hỏi. Viết một câu hỏi thay cho câu trả lời → Claude trả lời ngay
  dưới đó (`_Disc:_`, kèm lựa chọn, ví dụ và gợi ý mới) và hỏi lại câu đó ở vòng sau (cùng số).
- Đóng cũng trong file: `## Close` với tóm tắt + `### Approve the spec? (Y/n)`; trả lời `Y` rồi chạy lại để duyệt.
  Design giống vậy, mọi câu có `_Rec:_` dựa trên fact của Explore; câu `_Needs spec:_` mang luôn bản xem trước delta.
- **`/hitl:design --auto` bị bỏ**: gõ `Y` ở dòng Accept all của mỗi vòng để nhận hết khuyến nghị.
- Vẫn ở chat: cổng `Continue with existing change? (1/2/new)` khi mô tả khớp change đang có, khối migrate v0.5 và
  amend (`<id> amend [N-k]`).
- CLI: `hitl-index brief <change-id> [--kind plan|design] [--json]` (vòng, câu hỏi, câu trả lời, `answered`,
  `recorded`, `carried`); `change --json` / `status --json` có `brief: {kind, round, open, unanswered, …}`; bước tiếp
  theo của change đang chờ trả lời là `answer .hitl/changes/<id>/plan-brief.md, then /hitl:plan <id>`, `/hitl:flow` in
  dòng `_Brief:_ <id> — plan brief round <n>: <k> unanswered → …`. Change bắt đầu trước 0.14: lần chạy `/hitl:plan <id>`
  kế tiếp tạo brief từ trạng thái hiện tại.

### Nâng cấp từ 0.13.1

0.13.2: **mỗi file task quick có key riêng** — hai nhánh git cùng tạo task quick không còn đụng id (trước đây cùng
`QT-T<max+1>`). Header `← Change: none | key: QFLT`, task `QFLT-T1`; key = `Q` + chữ đầu của 3 từ đầu trong slug
(`fix-label-typo` → `QFLT`), thêm chữ thứ 5 chỉ khi đã bị dùng, không trùng key nào đã có (change active/archive, quick, legacy). CLI
`hitl-index next-id --quick <slug> [--json]` sinh key, không có gate. `QT` chỉ còn là key legacy: project đã có key mà
còn `QT-T<n>` → `IDS_LEGACY` → chạy **`/hitl:migrate`** một lần (đổi `QT-T7` → `QFLT-T1` trong file quick, tag code,
lock, map ticket, thư mục review, `id-map.json`; `--keys quick:<slug>=KEY` để tự chọn). `tasks --check` báo
`TASK_KEY_MISMATCH` (task không dùng key của file) và `QUICK_KEY_TAKEN` (key trùng file quick khác hoặc change).
File v0.5 nối `← Planning:` vẫn dùng `QT`.

### Nâng cấp từ 0.13.0

0.13.1 thêm **`/hitl:overlap <change-id> [<change khác> …]`** (hoặc `--with B,C`; không nêu thì so với mọi change đang
mở): kiểm tra chồng lấn giữa một change và nhiều change khác bất cứ lúc nào (vd. sau khi merge một nhánh có change
khác). Không cần migrate.
- CLI `hitl-index overlap <id> [--with B,C] [--json]`: lọc theo change đích; thêm phần `code` (symbol/file mà task của
  hai change cùng đụng: `### Symbols`, symbol đã khoá, đường dẫn của scout; drift trên symbol đã khoá của change này nằm
  trong file change kia đụng); `parent: true` cho change đang chờ change này (có note `source:` từ nó).
- Không có bằng chứng → `✅ <A>: no overlap with …`, không gọi LLM. Có → **một** `hitl:spec-reviewer` (overlap mode)
  chấm cả cụm; mỗi finding phải trích một witness Given/When/Then từ **từng** change nó nêu (`hitl-index overlap A
  --review` bỏ finding không có witness). Cổng: một dòng mỗi finding `⚠️ … → 1. adjust <một bên> · 2. both sides (
  note vào change bị ảnh hưởng, change đó chờ) · 3. not an overlap`; trả lời kiểu `1 2, 2 3`.
- Plan vòng 1 in `_Parent:_ <P> — shared: …` cho mỗi change cha (change đang chờ change đang plan), để bước kiểm chủ sở
  hữu đi theo danh sách cụ thể; design kiểm lại contract/file mới với change cha.

### Nâng cấp từ 0.12

0.13 đổi **mọi id sang khoá của change** (change key). Chạy **`/hitl:migrate` một lần** sau khi cập nhật plugin.
- Mỗi change có một key 2–5 chữ in hoa, duy nhất mãi mãi (tính cả change đã archive), ghi trong meta proposal:
  `> change: feat-password-reset | key: PWR | status: …`. `/hitl:plan` gợi ý key từ tiêu đề ở gate đầu tiên
  (0.14: câu `Q0` của brief; `hitl-index spec key <change-id>`: chữ loại — feat F · fix X · refactor R · perf P · docs D · test T · chore C — + 3 chữ từ các từ sau loại: từ 3 từ trở lên lấy chữ đầu của 3 từ đầu, vd `feat-billing-exec-settle` → `FBES`; 2 từ lấy chữ đầu từ 1, phụ âm kế tiếp của nó, chữ đầu từ 2, vd `feat-password-reset` → `FPSR`; 1 từ lấy chữ đầu và 2 phụ âm kế tiếp; chữ thứ 5 chỉ khi trùng — chi tiết: `shared/spec-format.md` "Key suggestion"), bạn nhận hoặc sửa. Trùng → `CHANGE_KEY_TAKEN`.
- Mọi id bắt đầu bằng key của change **tạo ra** nó, số đếm max+1 trong change: task `PWR-T1`, AC `PWR-T1.AC2`,
  requirement `PWR-R1`, scenario `PWR-R1.S1`, rule `PWR-BR1`, flow `PWR-UC1`, decision `PWR-D1`. Task quick: mỗi file
  một key riêng (`QFLT-T1`, từ 0.13.2; 0.13.0–0.13.1 dùng chung `QT`). Capability chỉ còn là thư mục
  (`specs/<cap>/spec.md`), không nằm trong id; meta spec bỏ `| key:`. MODIFIED/REMOVED giữ id gốc; requirement sống giữ id của change đã tạo nó. Note `N-k`, finding `F-n`, thuật ngữ
  glossary không đổi.
- `/hitl:migrate`: chạy thử (`hitl-index migrate --ids --dry-run --json`) → một bảng key cho mọi change (cả archive) +
  key legacy cho id sống không rõ nguồn (`L` + key capability cũ, vd. `LACC-R1`), bạn nhận/sửa cả bảng một lần → bản
  đồ đổi tên đầy đủ + danh sách file → cổng `Apply? (Y/n)` → chạy thật. Nó ghi lại change, archive, living spec, task
  quick, notes, tag trong code (`@task`, `@ac`, `@dec`, `TODO(impl …)`), lock (`hitl.lock/2`, hash của sửa chỉ-tag được
  re-baseline nên không hiện drift), state, map ticket, thư mục review; bản đồ cũ → mới ở `.hitl/index/id-map.json`
  (commit; `hitl-index context <id-cũ>` tra được id cũ). Từ chối khi `.hitl/` hoặc file code có tag còn thay đổi chưa
  commit (trừ khi bạn chọn `--force`). Chạy lại lần hai: không làm gì.
- Chưa migrate: id cũ (`T-n`, `D-n`, `hitl.lock/1`) báo `IDS_LEGACY` → `/hitl:migrate`, không crash; không đọc song
  song hai định dạng.
- CLI mới/đổi: `hitl-index next-id <change-id>` (quick: `--quick <slug>`), `hitl-index spec next-id <change-id> [--kind
  R|BR|UC|D]`, `hitl-index spec key`, `hitl-index migrate --ids`.

### Nâng cấp từ 0.11

0.12 **bỏ toàn bộ liên kết / reconcile của 0.10** và thay bằng một luật đơn giản (mục 4d):
- Việc quá lớn cho change A → tạo change riêng **trước** A: `/hitl:go <việc> --before A` (nhiều change:
  `--before A,C` hoặc lặp cờ). `/hitl:plan <mô tả> --before A` cũng được. Khi tạo, CLI ghi vào A một note
  `kind: order`, `source: <change mới>`; proposal của change mới có `| before: A` (chỉ để đọc, không chặn gì).
- **Note có `source: B` chặn toàn bộ A cho tới khi B archive**: mọi duyệt task của A (skeleton, tests, done; `--ack` và
  `--force` không qua được), implement (hook chặn subagent implementer sửa code) và archive A. Plan, design, tasks và
  amend của A vẫn chạy. B archive → tự hết chờ (tính từ thư mục, không cần đồng bộ). Note spec/design từ B chưa áp dụng
  thì vẫn chặn toàn bộ A tới khi bạn amend (`/hitl:plan A amend N-k`) hoặc dismiss. B bị xoá/bỏ → A vẫn bị chặn tới khi
  bạn dismiss note của B.
- Lúc plan/design B: phần thuộc A (requirement, decision, AC của A) không vào delta của B mà thành note trong A
  (`hitl-index note add --change A --source B …`, sau khi bạn trả lời Y).
- Lệnh mới `hitl-index overlap <id> [--json]`: liệt kê change khác đang mở có chung id, rule, contract, file, thuật
  ngữ glossary hoặc capability, kèm đoạn spec của change kia. Plan đưa vào vòng 1; spec-reviewer chấm ở cuối plan (phải
  có "witness" Given/When/Then); design kiểm lại contract/file mới.
- Đã gỡ: header `after:`/`relates:` (còn trong proposal cũ thì bị bỏ qua), `hitl-index coupling`, `hitl-index
  reconcile`, `RC-n`, `RECONCILE_PENDING`, `.prev.json`, `/hitl:plan <id> reconcile <other>`, `/hitl:approve <id> skip`,
  dòng link/reconcile. Bản ghi reconcile cũ trong `notes.md` bị bỏ ở lần ghi kế tiếp. Không cần migrate.
- `change --json` có `before`, `wait` (`for[]`, `amend[]`, `reasons[]`), `blocks[]`; `status --json` có
  `changes[].wait`, `tasks[T].wait`; `status --brief` có dòng `_Waits:_ … waits for …` / `_Take in:_ … must take in …`;
  `spec archive` in `_Unblocked:_ … no longer waits` / `_Take in:_ …` cho change đã chờ.

### Nâng cấp từ 0.10

0.11 thêm **`/hitl:go <mô tả> [--plan|--quick|--tdd]`**: một cửa vào cho việc mới. Không cần migrate.
- Không cờ: subagent chỉ đọc `hitl:work-router` xem change đang mở (`change --json`, `status --brief`), spec, glossary,
  docs và code index, ghi phán quyết gọn vào `.hitl/.inbox/route.json` (`hitl.route/1`: `route`, `change`, `reason`,
  `brief` — từ 0.15.0 là `summary`, `signals[]`, `questions[]`). Lệnh mới `hitl-index route [--final] --json` kiểm tra phán quyết với các change
  đang mở và trả về **một** hành động: `invoke` (Skill + args), `note` (cổng note) hoặc `ask` (≤ 3 câu, một vòng).
  Claude in `_Route:_ <lệnh> — <lý do>` rồi chạy skill đó ngay trong lượt, không có cổng "Go?".
- Tie → đường nặng hơn. CLI nâng `quick` lên `plan` khi có tag risk (`security`, `concurrency`, `public-api`,
  `domain`, `data`, `core`) hoặc `business-rule`, và `tdd` lên `plan` khi có `security`, `concurrency`, `data`.
- `/hitl:flow` chỉ còn status, định tuyến task id và help; mô tả việc mới → `_Next:_ /hitl:go …`. Mô tả trần
  (không có "plan", "TDD", "tasks quick") được route sang `/hitl:go`; lời gọi rõ ràng vẫn vào thẳng skill.
- `/hitl:tasks <id> update [<việc>]` vào thẳng chế độ update (không hỏi update/overwrite).
- Hook PreToolUse chặn thêm lệnh Bash ghi vào file hitl được bảo vệ (`sed -i`, `>`/`>>`, `tee`, `cp`/`mv`/`rm`, …);
  chỉ là lưới an toàn, không phải bảo đảm (xem `shared/conventions.md`).
- Gợi ý "bắt đầu việc mới" (project trống, mọi task xong, `change` chưa có change, `/hitl:setup`, `/hitl:overview`,
  `/hitl:archive`, dòng SessionStart) giờ là `_Next:_ /hitl:go <describe the work>`; `/hitl:plan <id>` vẫn dùng để
  tiếp tục một change cụ thể.

### Nâng cấp từ 0.9

0.10 thêm **liên kết hai change và reconcile** (đã gỡ ở 0.12, xem trên). Không cần migrate: proposal không có
`after:`/`relates:` thì không có gì đổi.
- Header mới trong dòng meta của proposal: `| after: <change> (strong)` · `| relates: <change> (low)`.
- Lệnh mới `hitl-index coupling <id> [<other>]` (bằng chứng + mức gợi ý) và `hitl-index reconcile <id> --from <other>`
  (`--dry-run`, `--pick`). `spec validate` có thêm mã `COUPLING_*`, `RECONCILE_PENDING` và tự giữ note `order`.
- `spec archive` ghi thêm `.prev.json` trong thư mục archive; bị chặn bởi `RECONCILE_PENDING` (kể cả `--force`).
- `change --json` / `status --json` có `links`, `reconcilePending`; `status --brief` có dòng `reconcile pending: …`.

### Nâng cấp từ 0.8

0.9 thêm **hộp ghi chú (notes) và reopen** cho yêu cầu đổi giữa chừng (mục 4c). Không cần migrate: project chưa có
`notes.md` thì không có gì bị chặn; lock vẫn là `hitl.lock/1` (chỉ thêm trường mới).
- Lệnh mới `hitl-index note add|list|show|apply`; `approve` có thêm `--ack N-k` và các stage của change `reopen`,
  `dismiss`, `defer` (chỉ bạn gõ, qua `/hitl:approve`).
- Trạng thái task mới `reopened`; `status --brief` có dòng `_Note_ …`; `change --json` có `notes`.
- Note đang mở chặn `/hitl:archive` (kể cả `--force`).

### Nâng cấp từ 0.7

0.8 thêm **ngôn ngữ chung** (mục 2) và quy tắc trả lời dễ đọc (`shared/conventions.md` § Plain replies). Không cần
migrate: file cũ đọc như trước.
- `hitl-index context` có thêm mục `## Terms` và trường JSON `terms` (thuật ngữ glossary mà task dùng).
- Vòng plan có thêm câu hỏi `[T]` (thuật ngữ, tối đa 2/vòng); spec-scout có thêm trường `vocabulary` (thêm vào, schema
  không đổi).
- Ở mọi gate, gõ `?`, `wait`, `hả`, `giải thích` hoặc `không hiểu` để Claude giải thích lại rồi hỏi lại đúng câu đó.
- `skills/grilling/` đồng bộ lên upstream 4ae2317 (một cụm từ: "with a fresh context window").
- Mẫu test chuẩn (`shared/test-patterns.md`, mục 6) và lệnh mới `/hitl:tdd` (test-first ngoài change). Implementer làm
  xanh từng test một; `/hitl:test` thêm bước xem nhanh mẫu test trước khi khoá (dùng chung 2 lần trả lại).

### Nâng cấp từ 0.6

0.7 tách kênh ticket theo provider (Linear, Jira, GitHub Issues — mục 4b).
- Không cần làm gì với Linear: `tickets.provider` mặc định `linear`, `linear.*` và `linear.map.json` giữ nguyên.
- Định dạng issue mới: bỏ dòng `risk · impl · prio · change` và checkbox AC; marker chuyển xuống cuối. Lần push kế tiếp
  cập nhật mô tả mọi issue đã map một lần (content hash đổi).
- Dùng Jira/GitHub: `/hitl:tickets init jira` hoặc `/hitl:tickets init github`.

### Nâng cấp từ 0.5

0.6 thay file `.hitl/planning/<x>.md` (Part A/B, cây component Level 1/2) bằng **change** theo kiểu SDD:
`.hitl/changes/<id>/{proposal.md, specs/<capability>/spec.md, design.md, tasks.md}` và living spec `.hitl/specs/`.
- `/hitl:plan` (hoặc `/hitl:setup`) chạy `hitl-index migrate --specs --dry-run --json`, cho bạn đặt tên capability/key
  (vd. `accounts` / `ACC`) ở một gate, rồi migrate với `--map`; sau đó một vòng đổi tên tiêu đề requirement/scenario.
  Từng bước bằng tay: `hitl-index migrate --specs --dry-run`, rồi `hitl-index migrate --specs --map '{"feat-x":{"capability":"accounts","key":"ACC"}}'`
  (`--archive-done`: change đã xong hết task được archive luôn để tạo living spec).
- `R-n` → `<KEY>-R<n>`, AC `(R-n)` → `(<KEY>-R<n>.S<k>)`, Decisions/test seams/risks → `design.md`, cây component cũ
  → `design.md` mục `### Legacy design tree (v0.5)`, tasks file → `changes/<id>/tasks.md` (`← Change: <id>`).
- 0.6 và 0.7 vẫn đọc được dạng cũ (`← Planning:`, `(R-n)`), nhưng `/hitl:plan` không tạo file planning mới; SessionStart
  in `⚠️ HITL: v0.5 planning files — run hitl-index migrate --specs`.
- Linear: `linear.planningAs` → `linear.changeAs` (tên cũ vẫn đọc); map `planning` → `changes` tự chuyển ở lần ghi kế
  tiếp; lần push đầu sau nâng cấp cập nhật mô tả mọi issue một lần (dòng `change: <id>`).
- `@dec <KEY>-D<n>` giờ trỏ tới `design.md` của change (qua `@task` → task → change). `--feature <change-id>` thay cho tên file.

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
 /hitl:setup ─► /hitl:overview ─► /hitl:plan (WHAT/WHY) ─► /hitl:design (HOW, bỏ qua được) ─► /hitl:tasks [brief]
                                                                                        │
                     risk: low (fast lane) ◄────────────────────────────────────────────┤────────► risk: high
                     /hitl:implement                                                    │  /hitl:skeleton [gate] (bạn sửa skeleton trong editor)
                     (auto skeleton + tests)                                            │  /hitl:approve T    (khoá skeleton)
                              │                                                         │  /hitl:test T [gate] (test RED, test-author cô lập)
                              │                                                         │  /hitl:approve T tests
                              ▼                                                         ▼  /hitl:implement T  (agent fn → subagent; manual fn → bạn [gate])
                        /hitl:review T ◄─────────────────────────────────────────────────────┘
                              │  L0 gates → L1 lenses → report (.hitl/reviews/T.review.md)
                              ▼
                   /hitl:approve T done  (high)  ·  auto done (low, verdict PASS)
                              ▼
                   /hitl:archive <change-id> [gate]  (delta → living spec .hitl/specs/, change → .hitl/archive/)
                              ▼  (tuỳ chọn)
                   /hitl:tidy <change-id> [gate] → /hitl:approve <change-id> intent → hitl-index strip <change-id>

 Build rồi review   ─► /hitl:implement --feature <change-id> [--lane fast]  (một report gộp ở cuối)
 Sửa code ngoài Claude ─► /hitl:sync  (drift + trace report, re-approve / revert / defer / accept + amend spec)
 Việc mới (chưa biết lệnh nào) ─► /hitl:go <mô tả>  (note / amend / tasks update · /hitl:tdd · /hitl:tasks quick · /hitl:plan)
 Không biết làm gì tiếp ─► /hitl:flow
 Kênh phụ (tuỳ chọn)   ─► /hitl:tickets push  (mirror task sang Linear / Jira / GitHub; không bao giờ là gate)
```

**Plan = WHAT/WHY (cho BA/PO đọc).** `/hitl:plan` phỏng vấn kiểu grill (tự nạp skill `hitl:grilling`, bạn không cần gọi)
trong **file brief** `.hitl/changes/<id>/plan-brief.md` (0.14): bạn trả lời ở dòng `>` trong editor rồi chạy lại
`/hitl:plan <id>`; mỗi lần chạy ghi lại câu trả lời và nối vòng sau, chat chỉ in 1–3 dòng. Plan chỉ ghi file business: `proposal.md` (Why, What changes, Capabilities, Success criteria, Coverage, Artifacts…) và
**spec delta** theo capability (`## ADDED|MODIFIED|REMOVED Requirements`, mỗi requirement một câu EARS với
`SHALL/SHOULD/MAY` + scenario `GIVEN/WHEN/THEN`). Không tên code, không component, không thiết kế hàm (CLI cảnh báo
`BIZ_CODE_TOKEN`). Ý tưởng kỹ thuật bạn nói ra được "gửi" sang `design.md ## Parked from planning`.
- **Độ phủ (rộng):** 9 nhóm — Scope, Actors, Data & lifecycle, Business rules, Edge cases, Integrations, NFR,
  Terminology, Success criteria — vòng 1 hỏi mỗi nhóm một câu cốt lõi; từ vòng 2 tiêu đề vòng có dòng
  `Coverage: Scope ✅ · Data ⚠️ · Edge ❌ · NFR — …`; vòng sau ưu
  tiên ❌/⚠️; chỗ chưa rõ ghi `[NEEDS CLARIFICATION: …]`.
- **Đào sâu:** điểm có impact × độ không chắc cao được đánh `_Hot_` và hỏi sâu trước; bạn gõ `deep <ID|chủ đề>` để chọn kỹ
  thuật (example mapping, 5 whys, edge cases, pre-mortem, bảng quyết định, góc nhìn stakeholder) — kết quả ghi thẳng vào spec.
- **Điều kiện dừng:** chỉ đóng plan khi mọi nhóm ✅ hoặc — (có lý do) và không requirement `SHALL` nào còn
  `[NEEDS CLARIFICATION]` (`hitl-index spec validate` báo `COVERAGE_GAP`, `REQ_UNCLEAR`); muốn đóng sớm thì "force",
  được ghi `_Forced:_` trong proposal.
- **Artifact chọn theo ngữ cảnh** (`shared/artifacts.md`): glossary, business rule + bảng quyết định, use-case flow,
  NFR, data-model, contracts… Chắc chắn → tự làm và ghi dòng `_Assumed:_ …`; không chắc → hỏi trong brief (`[A]`).

**Design = HOW (cho dev).** `/hitl:design <change-id>` đọc spec + ARCHITECTURE/PATTERNS/CODEBASE-MAP (+ CONSTITUTION nếu
có), hỏi các vòng `[D]` trong file brief `design-brief.md` (mọi câu có `_Rec:_`; gõ `Y` ở dòng "Accept all" để nhận cả vòng, trừ câu `(needs its own Y)`)
và ghi `design.md` (`<KEY>-D<n>` + alternatives + `serves`, component mức module, error handling, test
strategy, risks, rollout), tuỳ chọn `data-model.md`, `contracts/`. Không bao giờ chữ ký hàm (đó là việc của tasks /
skeleton). Design được bỏ qua khi change nhỏ (không dependency
mới, không đổi dữ liệu lưu, không đổi interface public, ≤ 2 task, không risk cao).

**Tasks = chia việc, duyệt trong file brief (0.21).** `/hitl:tasks <change-id>` viết `tasks.md` (draft) rồi
`tasks-brief.md`, một danh sách ngắn (0.21.1): `## Tasks (N) — in build order` do `hitl-index tasks gate <id> --write`
sinh từ `tasks.md` (mỗi task hai dòng: id, tiêu đề, `— after T1`; prio · risk → lane · ai viết · số AC và test; không
sửa tay), `## Needs your eye` chỉ khi Claude có điều thật sự cần bạn nhìn hoặc một override test (`Override: <AC> …?
(needs its own Y)`), `## Notes`, và `## Approve? (needs its own Y)`. Đọc, đổi gì thì ghi Notes (hoặc sửa thẳng
`tasks.md`), `Y` dưới `Approve?`, chạy lại `/hitl:tasks <id>`. Không đổi gì thêm → Claude gọi `hitl-index tasks approve
<id>` và in `_Next:_`; có đổi → file thành vòng mới mở đầu bằng `_Changed since Round n:_`. Task của bộ chưa duyệt không
được skeleton, test hay implement (`TASKS_NOT_APPROVED`). Sau khi duyệt, prio, thứ tự, `blocked-by` (và risk do bạn sửa;
Claude chỉ được nâng) đổi lúc nào cũng được, không cần vòng mới. Quick (`/hitl:tasks quick <mô tả>`) dùng cùng mẫu, danh
sách một task.

**Ngôn ngữ chung (0.8).** Một glossary duy nhất: `.hitl/specs/GLOSSARY.md` (living, chỉ CLI ghi) + `glossary.md` của
change (delta). Tên thuật ngữ giữ tiếng Anh (khớp tên code và test), định nghĩa có thể viết tiếng Việt; câu trả lời tiếng
Việt dùng nguyên thuật ngữ tiếng Anh. Khi bạn dùng một từ mâu thuẫn với glossary, từ nằm trong `_Avoid_`, hoặc một danh từ
mơ hồ, plan hỏi một câu `[T]` (tối đa 2/vòng) và ghi thuật ngữ ngay khi chốt (`shared/interview.md` §10). Design đặt tên
component, entity, event và test seam theo thuật ngữ (*Reset link* → `ResetLink`); thiếu thuật ngữ → `_Needs term:_`.
Design cũng đọc các quyết định `<KEY>-D<n>` đã archive để báo khi quyết định mới mâu thuẫn. `hitl-index context <T>` thêm mục
`## Terms` (≤ 8 thuật ngữ mà tiêu đề, AC hay scenario của task nhắc tới), nên skeleton, test-author và reviewer dùng cùng
từ. Mọi câu trả lời theo § Plain replies: ngữ cảnh trước, id luôn kèm tiêu đề (`ACC-R4 (Lock after failed sign-ins)`),
câu ngắn; ở gate gõ `?`/`wait`/`hả` để được giải thích lại.

**Archive.** Khi mọi task xong, `/hitl:archive <id>` xem trước merge (conflict, id trùng, `BASE_CHANGED`) rồi CLI gộp
delta vào `.hitl/specs/<capability>/spec.md` (+ `GLOSSARY.md`, `## Change History`, `## Retired IDs`) và chuyển change
sang `.hitl/archive/<ngày>-<id>/`. Living spec chỉ CLI ghi (hook chặn sửa tay).

**Định dạng chuẩn (0.6.1).** Mỗi artifact theo một chuẩn, có template + ví dụ + nguồn trong
[`shared/formats/`](shared/formats/README.md): requirement theo ISO/IEC/IEEE 29148 + INCOSE (một `SHALL`, có chủ thể,
không từ mơ hồ — EN + VI, cấu hình `spec.vagueTerms` / `spec.vagueTermsExtra`, tắt bằng `spec.qualityLint: "off"`), NFR =
`Quality:` (ISO 25010:2023) + `Fit:` đo được, bảng quyết định DMN (`Hit policy:`, cột `(in)`/`(out)`), vòng đời
`stateDiagram-v2` + bảng `from | event | guard | action | to`, use case Cockburn (lite), quyết định `<KEY>-D<n>` theo MADR 4,
contract OpenAPI 3.1 / AsyncAPI 3 / JSON Schema 2020-12 / CLI (`shared/templates/contracts/`), sơ đồ C4. `spec validate`
chỉ **cảnh báo** (`REQ_VAGUE`, `DT_OVERLAP`, `SM_UNREACHABLE`, `UC_EXT_REF`, `CONTRACT_VERSION`, `CAP_DUP_NEW`, …).

Status (do tooling tính, không bao giờ sửa tay): `skeleton → red → wip → green → verified → done`.
Một hàm thuộc nhiều task (task sau sửa hàm task trước làm: `@task PWR-T2, PWR-T3`) có status **theo từng task**: với PWR-T3 hàm là
`skeleton` khi còn sentinel hoặc bước `TODO(impl)` của PWR-T3 (`TODO(impl PWR-T3): …` để gắn bước cho riêng một task); PWR-T2 đã
`done` vẫn `done`. `@status` trong source là mức thấp nhất; `hitl-index status <T>` cho status theo T. Lock giữ lịch sử
task đã duyệt hàm (`tasks`), file lock cũ vẫn dùng được, không cần migrate.

## 3. Lệnh

| Lệnh | Việc làm | Gate? | Ai gọi |
|---|---|---|---|
| `/hitl:setup [--reconfigure]` | Khởi tạo `.hitl`, dò lệnh test/lint/typecheck, index, tuỳ chọn cài git pre-commit | xác nhận lệnh | chỉ bạn |
| `/hitl:go <mô tả> [--plan\|--quick\|--tdd]` | Cửa vào cho việc mới: subagent chỉ đọc `work-router` chọn đường (note / `amend` / `tasks <id> update` của change đang mở → `/hitl:tdd` (có cách tái hiện) → `/hitl:tasks quick` (không có gì để tái hiện) → `/hitl:plan`; thử theo thứ tự, không chắc điều kiện thì rơi xuống đường nặng hơn), in `_Route:_ <lệnh> — <lý do>` rồi chạy luôn. Cờ = tự chọn, bỏ qua phân tích | chỉ khi mơ hồ (≤ 3 câu) | bạn / Claude |
| `/hitl:overlap <change-id> [<change khác> …]` · `--with B,C` | Kiểm tra chồng lấn của một change với các change đang mở khác (không nêu = tất cả): bằng chứng chắc chắn trước (id, rule, contract, thuật ngữ, symbol, file, drift), không có → ✅ dừng; có → một subagent `spec-reviewer` chấm cả cụm, mỗi finding phải có witness Given/When/Then trích từ từng change; chỉ ghi note khi bạn chọn "both sides". Dùng cả sau khi merge nhánh | một dòng mỗi finding | bạn / Claude |
| `/hitl:flow [task-id\|help]` | Đang ở đâu, task nào tiếp theo, lệnh gợi ý `_Next:_`; mô tả việc mới → `/hitl:go` | — | bạn / Claude |
| `/hitl:overview [mô tả\|refresh]` | Viết docs BUSINESS-CONTEXT / ARCHITECTURE / PATTERNS-CONVENTIONS (3 mapper song song) + CODEBASE-MAP sinh từ index | nếu đã có docs | bạn / Claude |
| `/hitl:plan [mô tả\|change-id [amend [N-k]]]` | WHAT/WHY: phỏng vấn grill (tự nạp `hitl:grilling`) trong file brief `changes/<id>/plan-brief.md`, độ phủ + `_Hot_` + `deep <ID>` → `changes/<id>/proposal.md` + spec delta (`PWR-R1`, scenario `PWR-R1.S1`; key của change ở câu `Q0` của brief) + glossary; lần đầu đề nghị migrate planning v0.5. `<id> amend`: sửa spec đã duyệt — chỉ đổi câu chữ: cổng chat; còn lại: amend brief `amend-<KEY>-A<n>-brief.md` kết thúc bằng amend task set (mục 4c) | file brief, mỗi vòng (amend: cổng chat khi chỉ đổi câu chữ) | bạn / Claude |
| `/hitl:design <change-id> [amend [N-k]]` | HOW: `design.md` (`<KEY>-D<n>`, component mức module, test strategy, risks) + `data-model.md`, `contracts/` khi cần; phỏng vấn trong `design-brief.md` (`Y` ở dòng Accept all = nhận cả vòng, trừ câu `(needs its own Y)`); `amend` như plan | file brief, mỗi vòng (amend: cổng chat khi chỉ đổi câu chữ) | bạn / Claude |
| `/hitl:tasks [change-id [update …]\|QKEY\|quick …]` | Chia task dọc (vertical slice), prio P0–P3, risk + lý do, AC Given/When/Then gắn scenario `(PWR-R1.S1)`, Why trích `<KEY>-D<n>`, symbol đích, test plan → `changes/<id>/tasks.md`; kiểm tra bằng `hitl-index trace`. `tasks.md` đã có → luôn update theo trạng thái task (`shared/task-changes.md`; không còn overwrite). Duyệt trong file brief `tasks-brief.md`, một danh sách task theo thứ tự làm (0.21.1; quick: `quick-<slug>-brief.md`, chạy tiếp bằng `/hitl:tasks <QKEY>`); sau duyệt, prio/thứ tự/`blocked-by` đổi không cần vòng mới | brief file, mỗi vòng (duyệt: `Y` riêng; chỉ `hitl-index tasks approve` đặt `approved`) | bạn / Claude |
| `/hitl:archive <change-id>` | Xem trước rồi merge delta vào living spec `.hitl/specs/`, chuyển change sang `.hitl/archive/` | diff / conflict | bạn / Claude |
| `/hitl:tidy <change-id>` | Change đã done: `hitl-index intents` → một subagent viết lại **chỉ** docstring intent + step comment (bỏ id khỏi prose, nêu tên callee/enum thay vì kể lại, bỏ step pseudo-code / step chết trong class); kiểm tra bằng drift + `approve --dry-run` (chỉ `INTENT_CHANGED` được đổi, không thì revert). Chạy trước `hitl-index strip` | diff intent → `/hitl:approve <id> intent` | bạn / Claude |
| `/hitl:grilling` | Skill grill-me nguyên bản (mattpocock): hỏi dồn từng vòng; plan/design tự dùng, gọi riêng khi muốn "grill" một ý tưởng | mỗi vòng | bạn / Claude |
| `/hitl:tdd <việc cần làm>` | TDD thật của hitl (chuyển thể từ mattpocock `tdd`) cho việc nhỏ có cách tái hiện, **ngoài** change: chốt seam + danh sách test một vòng, rồi red→green→refactor từng test một; danh sách lớn dần khi gặp trường hợp mới. Việc thuộc một change/task → chuyển sang `/hitl:flow` | seam + danh sách test | bạn / Claude |
| `/hitl:skeleton <T> [--quick]` | Viết skeleton: chữ ký, docstring intent + tag, các bước `TODO(impl)`, sentinel throw; test stub cho mỗi AC | review trong editor | bạn / Claude |
| `/hitl:approve <T> [skeleton\|tests\|done] [symbols…]` | Khoá skeleton / test RED / kết quả cuối vào `skeleton.lock.json` | chính lệnh là sự duyệt | **chỉ bạn** |
| `/hitl:approve <change-id> intent [symbols…]` | Duyệt lại intent của change đã done (sau `/hitl:tidy`): chỉ ghi `intent`/`intentHash` (+ `intentApprovedAt/By`, `intentLog`); từ chối nếu task chưa done hoặc chữ ký / `TODO(impl)` / body (so với lúc done) đổi; không cần tag `@task` | chính lệnh là sự duyệt | **chỉ bạn** |
| `/hitl:approve <change-id> reopen [N-k]` | Xác nhận ảnh hưởng của một lần amend (note `recheck`): mở lại **chỉ** test đã khoá của AC bị đổi (stage `reopened`), skeleton của symbol bị đổi contract; 0.17: chuyển test cũ của task đã xong (hoặc của change đã archive) sang task mới nhận nó (dòng `rewrite:`). Wording thì chỉ đóng note ("nothing to unlock") | chính lệnh là sự duyệt | **chỉ bạn** |
| `/hitl:plan <mô tả> --before <change-id>[,…]` · `/hitl:go <mô tả> --before <change-id>` | Change tiên quyết: change kia chờ tới khi change mới archive (note `source:` trong change kia) | file brief, mỗi vòng | bạn / Claude |
| `/hitl:approve <change-id> dismiss N-k <lý do>` · `defer N-k <change khác>` · `/hitl:approve <T> <stage> --ack N-k` | Đóng note (bỏ qua có lý do / chuyển sang change khác) · cho task T đi tiếp dù note còn mở | chính lệnh là sự duyệt | **chỉ bạn** |
| `/hitl:approve <change-id> accept [symbols…]` | Chấp nhận drift sau này trên change **đã archive** (từ `/hitl:sync`): ghi intent / `TODO(impl)` / body (`acceptedBodyHash`, `acceptedAt/By/Change`) và hash của test đã khoá; không đụng `task`/`tasks`/`lock.tasks`/done record. Từ chối nếu change chưa archive, có task mở sở hữu/tag symbol, chữ ký đổi (phải claim vào task) hoặc test phủ chưa chạy fresh + pass | chính lệnh là sự duyệt | **chỉ bạn** |
| `/hitl:test <T> [fill\|run\|mutate]` | test-author (chỉ thấy contract pack) viết test thật, kiểm tra RED đúng lý do; mutation tuỳ chọn | high risk | bạn / Claude |
| `/hitl:implement <T> [symbol] [--all] [--lane fast]` | Làm từng hàm theo work order (hàm được gọi trước, theo `@calls`; `@prio` chỉ phân xử hoà): agent fn → subagent implementer; manual fn → giao cho bạn kèm context. `--lane fast`: bạn ép fast lane cho task high risk (xem 5a) | manual / mỗi hàm (high) | chỉ bạn |
| `/hitl:implement --feature <change-id> [--lane fast]` | Build rồi review: chạy mọi task của một change theo thứ tự (blocked-by, rồi prio), mỗi task theo lane của nó; dừng **một lần** ở cuối với review gộp `reviews/feature-<name>.md` (xem 5b) | cuối / dừng sớm | chỉ bạn |
| `/hitl:review <T> [fix F-n\|amend F-n\|recheck]` | Review nhiều lớp (L0 có gate `trace`) + fix loop; `amend F-n` = accept + sửa spec | nếu cần người quyết | bạn / Claude |
| `/hitl:review --security-audit [<change-id>\|repo] [--out <dir>]` | Audit bảo mật đầy đủ 6 phase (Cloudflare `security-audit`) cho một feature hoặc cả repo; link `REPORT.md` vào `reviews/feature-<name>.md` (xem 6a) | — | bạn / Claude |
| `/hitl:security-audit …` | Skill upstream nguyên bản: hỏi đáp/review bảo mật (guidance mode) hoặc audit đầy đủ khi bạn yêu cầu rõ | — | bạn / Claude |
| `/hitl:sync [--files …] [T]` | Đồng bộ sửa tay: reindex, drift + trace report, re-approve / revert / defer / accept + amend spec, cập nhật CODEBASE-MAP | có | **chỉ bạn** |
| `/hitl:tickets init\|push\|pull\|status` | (Tuỳ chọn) mirror task sang Linear, Jira hoặc GitHub Issues: một issue mỗi task, push một chiều, pull chỉ đọc (báo drift), in branch + `Fixes ENG-n` / `Fixes #n` | lần push đầu / op cần duyệt | bạn / Claude (skill khác gọi khi bật `autoPush`) |
| `/hitl:migrate [--force]` | Nâng cấp project 0.12 sang id theo key của change (`PWR-T1`, `PWR-R1`, `PWR-D1`): chạy thử, một bảng key, bản đồ đổi tên, rồi áp dụng; ghi `.hitl/index/id-map.json` | bảng key + `Apply? (Y/n)` | bạn / Claude |

CLI (gọi trực tiếp được): `hitl-index spec validate|list|show|next-id|key|conflicts|merge|archive`, `hitl-index change [<id>]`
(trạng thái/phase của change; `wait`/`blocks` khi một change chờ change khác; `brief` khi có file brief),
`hitl-index brief <id> [--kind plan|design|amend] [--amend <KEY>-A<n>]` (đọc file brief: vòng, câu hỏi, câu trả lời — chỉ đọc; `brief rename <id>
--to <id mới> --key <KEY>` đổi tên change và key tới khi change có task đầu tiên),
`hitl-index amend start <id> [--from N-k] [--refs …] [--impact …] [--depth n] [--write]` (0.17: route brief|chat, id `<KEY>-A<n>`,
task nào ở đâu, amendment chạm gì; 0.18: caller qua call graph, `--depth` bước; `--write` tạo amend brief), `hitl-index amend check <id> [--amend <KEY>-A<n>] [--depth n]`
(`AMEND_ORDER`, `AMEND_UNCOVERED`, 0.18: `AMEND_TEMP_NO_REMOVAL`, `AMEND_CONTRACT_SAME_DEPLOY`, cảnh báo `INTENT_HISTORY`), `hitl-index tasks drop <T> --reason "…" [--amend <KEY>-A<n>]` (chỉ task todo), `hitl-index overlap <id> [--with B,C]`
(ứng viên chồng lấn với change khác đang mở: id, rule, decision, contract, symbol, file, thuật ngữ, capability, phần
`code` — chỉ đọc; `--review` đọc phán quyết của `/hitl:overlap`),
`hitl-index note add … --source <change khác>` (note từ change khác: chặn toàn bộ change tới khi change kia archive), `hitl-index migrate --specs` (v0.5 → 0.6),
`hitl-index status [task-id] --work-order` (alias `--by-prio`; bảng hàm của task theo thứ tự implement: hàm được gọi
(`@calls` trong cùng task) trước hàm gọi, chu trình đi cùng nhau, hoà thì theo `@prio` rồi dòng `### Symbols`; `--json` có `tasks[T].workOrder`; không có task id → mọi task),
`hitl-index strip <task-id|change-id>[,…] [--dry-run]` (vd. `PWR-T1,PWR-T2`; task đã `done`: xoá `@task @impl @status @prio @dec @risk` khỏi docstring
code, giữ mô tả + `@calls`/`@concurrency`, không đụng test; index lại để kiểm tra, có thay đổi hash/status thì tự khôi phục),
`hitl-index intents <change-id|task-id> [--json]` (báo cáo vệ sinh intent, chỉ đọc, xem mục 4),
`hitl-index approve --change <change-id> --stage intent|accept [--symbols a,b] --by human [--dry-run]` (do `/hitl:approve <id> intent|accept` gọi),
`hitl-index trace [task-id|change-id] [--capability <cap>] [--check] [--md] [--json]` (ma trận truy vết),
`hitl-index tickets status|plan|record|diff|verify|server` (do `/hitl:tickets` dùng),
`hitl-index feature <change-id> [--lane fast] [--report [--security-audit <dir>]] [--json]` (kế hoạch chạy feature / report gộp; `--security-audit` ghi link REPORT.md của audit),
`hitl-index where <id> [--json]` (0.19: mọi chỗ của một id, cho editor nhảy tới; xem 3a).

"Chỉ bạn" = skill có `disable-model-invocation: true`; Claude không tự gọi được.

**Cổng (GATE):** skill in tóm tắt + lựa chọn đánh số rồi **dừng lượt**. Trả lời `y` / `ok` / `được` = chọn khuyến nghị.
Ngoài cổng, skill không hỏi mà tự quyết với giả định ghi rõ (`_Assumed:_ …`).

**Duyệt là việc của người:** `hitl-index approve … --by human` chỉ chạy được ngay sau khi bạn gõ `/hitl:approve`
(hook UserPromptSubmit phát "approve token" dùng một lần, ≤10 phút). `--by auto` chỉ cho task risk low (CLI chặn).
`--by human-override` chỉ chạy được sau khi bạn gõ `/hitl:implement <T> --lane fast` (token riêng, xem 5a).
Token gắn với thứ bạn gõ: `/hitl:approve PWR-T3` chỉ duyệt PWR-T3; `/hitl:approve <change-id> intent` chỉ cho đúng một lệnh
`approve --change <change-id> --stage intent --by human`; `/hitl:approve <change-id> accept` chỉ cho đúng một lệnh
`approve --change <change-id> --stage accept --by human`. Token task không duyệt được `--change` và ngược lại; token
intent không chạy được accept và ngược lại; `/hitl:approve` không kèm id không duyệt được `--change`; stage intent và
accept không nhận `--by auto` / `human-override`. Tương tự (0.9) cho `reopen`, `dismiss`, `defer`: token gắn với change,
stage, note id (và change đích của defer) bạn gõ; `--ack` chỉ đi với `--by human` và chỉ các note id bạn gõ.

**Change đã archive = lịch sử đóng băng:** task của nó luôn `done`, kể cả khi code sau này đổi body/intent của symbol.
Archive ghi lại `lock.tasks[T].file` sang file tasks trong archive (+ `archivedAt`, `change`; không phải sự duyệt). Drift
trên symbol/test chỉ thuộc task đã archive (`ARCHIVED_BODY_CHANGED`, `SIG_CHANGED`, `INTENT_CHANGED`, `TODO_FLOW_CHANGED`,
`TEST_CHANGED`, …) có `task: null`, `change` và `fix`: **claim** (thêm dòng `modify` + `@task <T>` vào một task mở, rồi
`/hitl:approve <T> skeleton <sym>`) hoặc **accept** (`/hitl:approve <change-id> accept`; không áp dụng cho đổi chữ ký).

### 3a. Nhảy tới id: `hitl-index where` (0.19)

Đọc markdown thô mà gặp `PWR-R1.S2`, `PWR-T3.AC2` hay `PWR-D1`: `hitl-index where <id>` cho biết id đó được định nghĩa
ở đâu và được dùng ở đâu. Không cần link markdown trong file (anchor hay gãy, rối mắt, team dùng nhiều editor khác nhau).

```sh
hitl-index where PWR-T1.AC2          # chữ thường cũng được: pwr-t1.ac2
.hitl/changes/feat-password-reset/tasks.md:11:7: def: - [x] PWR-T1.AC2 (PWR-R1.S2) Given an unknown email …
tests/reset.test.ts:2:50: test: /** @covers ResetService.sendLink @ac PWR-T1.AC1,PWR-T1.AC2 … */
```

- Id nhận được: `<KEY>-R<n>`, `<KEY>-R<n>.S<k>`, `<KEY>-BR<n>`, `<KEY>-UC<n>`, `<KEY>-T<n>` (cả key của quick file như
  `QFLT-T1`), `<KEY>-T<n>.AC<k>`, `<KEY>-D<n>`, `<KEY>-A<n>`. Khớp đúng biên id: `PWR-R1` không khớp `PWR-R10`,
  `PWR-R1.S2` hay `XPWR-R1`. Note `N-k` và finding `F-n` chỉ duy nhất trong một change nên không nhận.
- Mỗi dòng một chỗ, dạng quickfix/grep `file:line:col: role: text` (`:cexpr system('hitl-index where PWR-R1')`, errorformat
  `%f:%l:%c:%m`). `role` theo thứ tự: `def` (heading của spec/spec delta, heading task và dòng AC trong `tasks.md`, dòng
  D và `### <KEY>-D<n>` trong `design.md`, tiêu đề amend brief), `test` (dòng `@ac`/`@task` của test chứa id), `symbol`
  (symbol code của task: dòng `### Symbols` và tag `@task`, qua code index), `brief` (dòng trong plan/design/amend brief,
  vd. `→ recorded:`), `ref` (mọi chỗ nhắc khác). Change đang mở đứng trước archive; chỗ trong `.hitl/archive/` ghi
  `(archived)`.
- `--json`: `{ schema, id, kind, locations: [{ file, line, col, colUtf16, role, text, archived, symbol? }] }`; `col` đếm
  byte UTF-8 (như grep, Vim), `colUtf16` đếm theo UTF-16 (như VS Code, LSP). Exit 0 có kết quả, 1 không thấy id, 2 không
  phải id.
- Tìm trong file `.md` dưới `.hitl/` (trừ `index/`) và file code/test mà index biết (git ls-files, bỏ `exclude` của
  config); không đi vào `node_modules`, thư mục build. Không reindex: symbol lấy theo `index.json` hiện có.
- Neovim (config này), như `gd`/`gr` của LSP: `<leader>hd` nhảy tới chỗ định nghĩa của id dưới con trỏ, `<leader>hr`
  mở picker có preview với mọi chỗ, `<leader>hq` đổ mọi chỗ vào quickfix; `:HitlDef [id]`, `:HitlWhere [id]`
  (`:HitlWhere!` = quickfix). Code ở `~/.config/nvim/lua/hitl.lua`
  và `lua/plugins/hitl.lua`.

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

Vệ sinh intent (một contract hiện hành cho mỗi symbol; chỉ symbol không phải test có `@task` hoặc đã khoá; không bao giờ block):
- `INTENT_TASK_REF`: prose intent, `TODO(impl)` và step `n.` nhắc id (`<KEY>-T<n>`, `<KEY>-T<n>.AC<k>`, `<KEY>-D<n>`, spec id như `KEY-R3.S1`,
  change id đang có/đã archive). Text trong backtick được bỏ qua. Id sống trong tag (`@task`, `@dec`, `@ac` của test).
- Mức: `warn` khi intent còn là bản nháp (chưa khoá hoặc `intentHash` khác bản khoá), `info` khi đã khoá. `strip` không
  xoá id trong prose (prose nằm trong `intentHash`): sửa tay rồi duyệt lại.
- `INTENT_HISTORY` (0.18): docstring hoặc step comment kể lịch sử ("previously", "no longer sends", "trước đây",
  "không còn gửi"…; xem "Nâng cấp từ 0.17.0"). Cùng mức như trên; opt-out `hitl: history-ok`.
- Cấu hình `hitl.config.json`: `"intent": { "idRefs": "warn", "idAllow": [], "restateOverlap": 0.3, "history": "warn" }`
  (`"off"` tắt lint, `"info"` luôn info; `idAllow` = regex string cho phép id khớp; `history` cho `INTENT_HISTORY`).
- `hitl-index intents <change-id|task-id> [--json]` (chỉ đọc, không reindex): mỗi symbol không phải test của change/task,
  xếp theo số tín hiệu, không cắt bớt:
  - **ids**: như `INTENT_TASK_REF`;
  - **RESTATES**: một câu của intent trùng từ (Jaccard trên từ nội dung, bỏ stopword và id) ≥ `restateOverlap` với một
    câu của collaborator (callee `@calls`, symbol được nêu tên, hoặc enum định nghĩa `TÊN:` mà câu này dùng; với enum chỉ
    cần ≥ một nửa ngưỡng và ≥ 3 từ chung ngoài tên) — in cả hai câu;
  - **growth**: số task đã sửa symbol, số dòng intent lần duyệt đầu → hiện tại (từ `intentLog` trong lock; entry cũ chỉ có
    số task). Chỉ là dữ liệu, không có giới hạn cố định;
  - **history** (0.18): cụm từ kể lịch sử trong intent, `TODO(impl)` và step `n.` (`INTENT_HISTORY`);
  - **steps**: step comment `n.` trong thân hàm trông như pseudo-code (gán, so sánh, cú pháp gọi hàm, > 10 từ; chỉ xét nhãn, phần lý do trong ngoặc được bỏ qua), và mọi
    comment `n.` trong thân class/enum (chết sau khi implement).
- Lock `hitl.lock/1` có thêm (additive) `intentLog: [{task, stage, lines, at}]` cho mỗi lần duyệt skeleton/intent làm đổi
  intent (entry cũ được seed bằng intent đã khoá khi duyệt lại).

### 4a. Accept + amend spec (đồng bộ ngược code → spec)

Khi một contract đã khoá đổi (drift item có `spec: PWR-D1 · ACC-R1.S2`), một finding review cho thấy thiết kế sai, hoặc
implementer báo `specConflict`, skill đề xuất cập nhật **spec/design** thay vì để code và spec lệch nhau âm thầm:
- `/hitl:sync` → lựa chọn `4. accept + amend spec`; `/hitl:review` → trả lời `amend F-n`; `/hitl:implement` → thẻ
  `_Delta:_ Spec change proposal`; `/hitl:plan <id> amend` / `/hitl:design <id> amend` → sửa chủ động.
- Skill in **`_Delta:_` Spec delta** (scenario/requirement sửa trong delta của change, D cũ → `superseded by <KEY>-D<k>`, D mới, text
  AC, dòng Changelog, `@dec`) và hỏi `Apply? (Y/n/edit)` trong cùng gate. Quy tắc: `shared/amend-spec.md`.
- Change còn active → sửa delta của nó (requirement living chưa đụng tới → thêm vào `## MODIFIED` nguyên block).
  Change đã archive → tạo mini change `fix-<slug>` (chỉ proposal + delta), rồi `/hitl:archive fix-<slug>`.
- Decision không bao giờ sửa tại chỗ (chỉ supersede). 0.17: amendment không bao giờ đưa proposal/design về `draft`;
  ngoài đổi câu chữ, mọi amend đi qua amend brief (mục 4c) và `Y` trong đó là lần duyệt lại. Change đã archive → mini
  change `fix-<slug>` có change key riêng.
- Amend không duyệt gì cả: sau đó bạn vẫn gõ `/hitl:approve <T> skeleton <symbols>` như cũ.
- 0.9: preview có thêm khối **`_Impact:_`** (mục 4c); Apply ghi `note apply`. 0.17: khối Impact đứng trước câu
  `Apply?`; review/sync/implement gặp thay đổi không chỉ là câu chữ thì viết amend brief rồi dừng.

### 4c. Yêu cầu đổi giữa chừng: notes và reopen (0.9)

Thường gặp: proposal/spec/design/tasks đã duyệt, vài task đã done, vài task đã khoá test, rồi yêu cầu đổi.
- **Ghi lại, chưa sửa.** Bạn nói thay đổi trong chat (ở bất kỳ skill nào) → Claude hỏi
  `_Note_ for <change>, refs <ids (tiêu đề)>? (Y/n)` và ghi vào `.hitl/changes/<id>/notes.md` (chỉ CLI ghi file này).
  Câu hỏi thì chỉ bàn, không ghi. Bạn nói rõ "sửa luôn" → đi thẳng vào amend.
- **Chặn.** Note đang mở chặn `/hitl:approve` skeleton / tests / done của task mà refs chạm tới (scenario/requirement
  của AC, <KEY>-D<n> trong **Why**, dòng `### Symbols`, `@dec` của symbol đã khoá). Note không refs chỉ cảnh báo. Routing bỏ
  qua task bị chặn nếu còn task khác làm được. Note mở cũng chặn archive.
- **Áp dụng.** `/hitl:plan <id> amend N-k` (hoặc `/hitl:design <id> amend N-k`). Class theo từng id: `wording`
  (không mở gì) · `behaviour` (test đã khoá của AC đó) · `contract` (skeleton của symbol qua `@dec`/covers + test của
  nó) · `scenario` (AC mới + test) · `requirement` (task mới). 0.17: `hitl-index amend start` chọn đường —
  chỉ `wording` → cổng chat (preview delta, khối `_Impact:_`, `Apply?`); chỉ task/AC/symbol → `/hitl:tasks <id> update`;
  còn lại → **amend brief** `amend-<KEY>-A<n>-brief.md`: sự thật (task nào ở đâu, amendment chạm gì), các vòng hỏi
  (`[R]` đổi gì, chỉ ở branch / đã merge / đã release, `[X]` việc ngoài phạm vi, `[K]` task làm dở), rồi `## Close` với
  delta, Impact và **amend task set** (`amend: <KEY>-A<n>`, `kind: prep|expand|migrate|switch|contract|revert`, thứ tự
  bằng `blocked-by`). `Y` dưới câu duyệt mới ghi delta, design, tasks.md và note `recheck` (`reopen pending`) khi có
  việc đã khoá. Luật theo trạng thái task: `shared/task-changes.md` (todo sửa tại chỗ hoặc `tasks drop`; đang làm mở
  lại tại chỗ; **done không bao giờ mở lại** — task mới nhận symbol và test cũ (`rewrite:`), AC cũ ghi `superseded:`).
  Trong lúc amend brief mở, task bị chạm đứng chờ (`_Held:_`); task khác chạy tiếp.
- **Mở lại — chỉ bạn.** `/hitl:approve <id> reopen` → (0.17) test cũ mà task mới nhận (`rewrite:`) chuyển sang task
  mới, stage `reopened`; test bị đổi của task đang làm về stage `reopened` (test-author viết lại; test viết
  lại phải đỏ trên code hiện tại mới khoá lại được bằng `/hitl:approve <T> tests`), symbol bị đổi contract được đánh
  dấu để `/hitl:skeleton <T>` sửa rồi `/hitl:approve <T> skeleton`. `doneAt`/`doneBodyHashes` chuyển vào
  `lock.tasks[T].reopened[]`; review cũ hết hiệu lực (report md vẫn còn). Task hiện `reopened` → `/hitl:test` hoặc
  `/hitl:skeleton`, rồi implement → review → done như thường. Change đã archive không bao giờ reopen (dùng claim/accept).
- **Lối thoát, cũng chỉ bạn:** `--ack N-k` (cho task đó đi tiếp; note vẫn mở), `dismiss N-k <lý do>`,
  `defer N-k <change khác>` (copy note sang change đó).

### 4d. Hai change chạy cùng lúc: change tiên quyết (0.12)

Một luật duy nhất: **note trong change A có `source: B` chặn toàn bộ A cho tới khi B archive.** Ai làm trước, có chạy
song song hay không là quyết định của bạn; Claude không tự xếp thứ tự. Chi tiết: `shared/other-changes.md`.
- **Việc ngoài phạm vi A** (lúc plan, design, implement, review A): nhỏ (vẫn là WHAT của A) → amend A hoặc note;
  lớn (cần spec riêng, hành vi mới, hơn 1 task, capability khác) → Claude gợi ý
  `_Tip:_ Out of scope for A: <X> — … → /hitl:go <X> --before A`. Nhiều change cha: `--before A,C`.
- **Tạo B với `--before A`**: CLI ghi vào A note `kind: order`, `source: B` (`_Waits:_ A waits for B`). Từ lúc đó: không duyệt
  task nào của A (skeleton, tests, done — `--ack`, `--force` không qua được), không implement (hook chặn implementer),
  không archive A. Plan, design, tasks, amend của A vẫn chạy.
- **Lúc plan/design B — kiểm chủ sở hữu**: hành vi của B hoặc sửa requirement đang sống → delta của B. Sửa thứ A đang
  sở hữu (requirement ADDED/MODIFIED của A, decision, AC của A) → không vào delta B; Claude soạn bằng id của A và hỏi
  `_To A:_ … → note in A? (Y/n/edit)`; Y → note `kind: spec|design`, `source: B` trong A. B không bao giờ sửa file của A.
- **B archive** → A tự hết chờ (`_Unblocked:_`). Note spec/design từ B chưa áp dụng thì A phải amend trước (`_Take in:_ A must take in N-k
  from B first → /hitl:plan A amend N-k`): delta + `_Impact:_` → `/hitl:approve A reopen` (chỉ bạn) như mục 4c. Có thể
  amend sớm khi B chưa archive; A vẫn chờ tới khi B archive.
- **B bị bỏ/xoá** → A vẫn bị chặn: amend ngược phần đã nhận, rồi `/hitl:approve A dismiss N-k <lý do>` (chỉ bạn; dismiss
  được bất cứ lúc nào để chấm dứt việc chờ).
- **Change cha** (change đang chờ B, có note `source: B`): plan vòng 1 in `_Parent:_ <P> — shared: <bằng chứng>` cho
  từng change cha; bước kiểm chủ sở hữu đi theo đúng danh sách đó. Design kiểm lại contract/file mới với change cha.
- **Chồng lấn với change B chưa liên kết** (không có note giữa hai bên, dù B có tạo với `--before` hay không):
  `hitl-index overlap B` liệt kê ứng viên theo khoá chung (id, rule, decision, contract, symbol, file, thuật ngữ,
  capability). Plan đưa vào vòng 1, spec-reviewer chấm cả cụm ở cuối plan và phải trích một "witness" Given/When/Then;
  design kiểm lại contract/file mới. Bạn chọn: 1. chỉ sửa B · 2. cả hai (delta B + note `source: B` trong A, A chờ) ·
  3. không chồng lấn. Sau design, va chạm ở code đi theo luồng task và drift bình thường; muốn kiểm lại bất cứ lúc nào
  (vd. sau khi merge nhánh): `/hitl:overlap B [A C …]`.

### 4b. Ticket tracker: Linear, Jira, GitHub Issues (tuỳ chọn)

Mặc định tắt; tắt thì không có gì thay đổi. Mỗi repo mirror sang **một** provider (`tickets.provider`: `linear` mặc định
| `jira` | `github`); config theo provider (`linear.*`, `jira.*`, `github.*`, cùng khung khoá), map riêng
(`.hitl/<provider>.map.json`), queue riêng (`index/<provider>.queue.json`), mã drift có tiền tố (`LINEAR_*`, `JIRA_*`,
`GITHUB_*`). CLI (`scripts/lib/tickets.mjs` + `providers.mjs`) dựng plan trung lập; skill đọc tài liệu theo provider ở
`skills/tickets/references/common/connect.md` (chọn server, kiểm tra identity, lỗi) + `skills/tickets/references/providers/<provider>/` (connect · init · push-ops · pull · mcp).

| | Linear | Jira | GitHub Issues |
|---|---|---|---|
| MCP | `https://mcp.linear.app/mcp` | `https://mcp.atlassian.com/v1/mcp` | `https://api.githubcopilot.com/mcp/` (+ `gh api` cho milestone, dependency) |
| `team` | team key | project key | `owner/repo` |
| một change → (`changeAs`) | `project` · `parent-issue` · `none` | `epic` · `parent-issue` · `none` | `milestone` · `parent-issue` (sub-issues) · `none` |
| container có sẵn (`project`) | project | epic | milestone |
| prio P0–P3 | Urgent…Low | Highest…Low (`jira.priorityNames`) | issue field `Priority` hoặc label `priority:*` |
| trạng thái | state type | status qua transition | open / closed (completed · not planned) |
| blocked-by | relation | link "Blocks" | issue dependency |

Định dạng issue (mọi provider, theo Linear Method): `**Why**` + `Risk reasons` (task high) + AC dạng bullet thường (không
checkbox — mirror một chiều sẽ ghi đè ô người tick) + marker + footer; prio/risk/impl/change nằm ở field gốc, label và
container, không lặp lại trong mô tả. Chi tiết: `skills/tickets/references/ticket-format.md`, label: `…/labels.md`.
Đổi provider: `/hitl:tickets init jira` (đặt `tickets.provider`, rồi init như dưới).

#### Linear

Cài đặt:
```sh
claude mcp add --transport http linear-server https://mcp.linear.app/mcp   # hoặc plugin "linear" của Anthropic
# nhiều workspace? mỗi workspace một server (mỗi server một OAuth), tên khác nhau:
#   claude mcp add --transport http linear-work https://mcp.linear.app/mcp
#   claude mcp add --transport http linear-personal https://mcp.linear.app/mcp
# trong session: /mcp để đăng nhập (từng server), rồi
/hitl:tickets init        # chọn server, team, project, nhóm label (risk + impl)
```
- **Ghim server MCP** (`linear.server`, tên `<server>` trong `mcp__<server>__<tool>`): `init` thấy nhiều server Linear →
  Cổng (gate) liệt kê server (kèm workspace/team mỗi server thấy); chỉ một → tự lưu. Từ đó mọi lần chạy **chỉ** dùng server
  đó; server đã ghim không có → `❌` kèm lệnh `claude mcp add …`/`/mcp`, op được xếp hàng (không chặn gate). Config cũ
  chưa có `linear.server` → dùng server có team đã map, kèm `_Tip:_` gợi ý ghim.
- **Kiểm tra danh tính trước mỗi push/pull**: skill lấy urlKey workspace + team (theo id) qua MCP, CLI
  (`hitl-index tickets verify`) so với `linear.map.json` (`workspace.urlKey`, `team.id`/`key`) và `linear.server`/
  `linear.project`. Lệch → từ chối cả lượt (không gửi gì, không xếp hàng), in expected/observed và cách sửa: ghim lại
  server (`hitl-index init --set linear.server=<tên>`) hoặc `/hitl:tickets init --relink` nếu repo thật sự chuyển
  workspace/team (xoá map task cũ, push sau tạo issue mới). Map cũ chưa có workspace → cho qua một lần và ghi lại (`_Info:_`).
- **Một issue Linear cho mỗi task** (không bao giờ theo AC/symbol); mỗi change → một project (`linear.changeAs`:
  `project` | `parent-issue` | `none`; nội dung = Why + What changes + danh sách requirement của proposal, đọc được bởi
  PO/BA). `/hitl:archive` không đụng tới Linear (không đóng project).
- **Project có sẵn** (`linear.project = {"id","name"}`, chọn ở gate `init` từ `list_projects`): mọi issue vào project đó,
  change không thành project nữa (`parent-issue` vẫn dùng được, parent nằm trong project). hitl không bao giờ đổi
  tên/mô tả project có sẵn, chỉ gắn issue vào.
  Gói Free giới hạn **250 issue** → giữ mỗi task một issue; `maxCreatePerPush` (50) bắt duyệt khi tạo nhiều.
- **Push một chiều** (repo là nguồn sự thật cho title, Why, AC, prio, label risk/impl, state, comment review) và
  **pull chỉ đọc** (báo `LINEAR_DRIFT`, `LINEAR_DONE_EARLY`…; không bao giờ sửa tasks/spec md). Linear giữ assignee,
  cycle, estimate, comment của người, label khác.
- Map trạng thái:

  | hitl status | Linear state type |
  |---|---|
  | `todo` | unstarted (hoặc backlog nếu `pushTodoAs: backlog`) |
  | `skeleton`, `approved`, `red`, `wip`, `reopened` | started (issue đã completed → op `reopen` cần bạn xác nhận) |
  | `green`, `review`, `verified` | review (state started tên /review/; không có → started) |
  | `done` | completed |

  Không bao giờ tự lùi issue đã completed (cần bạn duyệt). Prio P0–P3 → Urgent/High/Medium/Low.
- **Fail-open:** MCP thiếu, lỗi auth/mạng/rate limit → không gì bị chặn; op được xếp hàng (`index/linear.queue.json`),
  SessionStart in một dòng `⚠️ HITL: n Linear update(s) queued — /hitl:tickets push`. Linear không bao giờ chặn gate.
- Branch + PR: `/hitl:implement`/`/hitl:skeleton` in `_Branch:_ git switch -c eng-1-…`; review PASS in `PR: Fixes ENG-1`
  (hoặc `Part of ENG-1`). Khuyến nghị trong Linear → Team → Workflow → GitHub: tắt *On PR merge → Done*, hoặc chấp nhận
  merge sau `/hitl:approve T done` sẽ đánh Done.
- `autoPush.onTasksApproved|onApprove|onReview` (mặc định false): `/hitl:tasks`, `/hitl:approve`, `/hitl:review` tự gọi
  `/hitl:tickets push … --auto` (chỉ op không cần duyệt).
- **Không dùng Linear coding-agent delegation** (giao issue cho agent trong Linear): agent đó bỏ qua mọi gate của hitl
  (lock skeleton, test-author cô lập, approve token). hitl không bao giờ set `delegate`/`assignee`.
- `linear.map.json` (<KEY>-T<n> ↔ ENG-n) do CLI ghi, commit lên repo; mất/conflict → `/hitl:tickets pull --relink` dựng lại từ
  marker `<!-- hitl:task=PWR-T1 repo=<owner/name> file=… -->` trong description.
- **Nhiều repo**: config và map theo từng repo, đều commit; mỗi repo chạy `/hitl:tickets init` một lần (đồng đội dùng
  cùng tên server, hoặc tự `--set linear.server`). Hai repo dùng chung team/project vẫn an toàn dù cùng có `PWR-T1`: push
  chỉ khớp theo id trong map, marker có `repo=` (git `origin` owner/name, không có thì tên thư mục) nên pull/relink bỏ
  qua issue của repo khác; marker cũ (không `repo=`) chỉ relink khi `file=` trùng, hai issue cùng nhận một task →
  `LINEAR_AMBIGUOUS`, không relink. Map tạo trước 0.5.0 giữ marker cũ cho đến khi `init` lại (lúc đó mô tả issue được
  cập nhật một lần).
- Không tạo được label (403, gói Free / không phải admin) → `init` in bảng label (tên, màu, mô tả) để bạn tạo tay, hoặc
  tắt nhóm label.

#### Jira và GitHub Issues

Cùng mô hình (ghim server, kiểm tra danh tính, push một chiều, pull chỉ đọc, fail-open, `autoPush`). Khác biệt:
- **Jira**: danh tính = site (`<tên>.atlassian.net`) + project; change → **epic** (issue type `jira.epicType`), task →
  `jira.issueType`; trạng thái chuyển bằng transition tới status id đã map theo status category; label là text tự do
  (không cần tạo); không có tool link → dòng `_Yours:_` (làm tay). Không có tên branch: CLI dựng `<project>-<n>-<slug>`.
- **GitHub**: danh tính = owner + repo; change → **milestone** (tạo bằng `gh api`), hoặc parent issue + sub-issues;
  trạng thái chỉ có open/closed (pha hitl thấy qua label `hitl:*`); blocked-by = issue dependency (`gh api`); issue là
  `#n`, PR line `Fixes #n` / `Part of #n`. `gh` chỉ được dùng khi `gh auth status` cùng tài khoản/host với MCP.

## 5. Risk routing

- **Task risk** (lúc `/hitl:tasks`): `high` nếu đụng core module, concurrency/async shared state, security (auth/crypto/money/SQL/shell/path/deserialize),
  public API, khái niệm domain mới, migration dữ liệu. Ngược lại `low` → fast lane (`_Fast_`, skeleton/test tự duyệt `--by auto`).
- **Symbol risk** (lúc review, 0–1): concurrency +0.30, security +0.25, drift +0.30 (cờ cứng), mutation yếu +0.15, fan-in > 5 +0.10,
  impl agent +0.05, finding ≥ important +0.20, thân > 60 dòng +0.05, task high +0.20.
  Route: cờ cứng hoặc > 0.6 → **HUMAN**, 0.3–0.6 → **SKIM**, < 0.3 → **AUTO**. Trọng số là heuristic, chỉnh trong `hitl.config.json` (`risk.weights`).
  Task có human-override trong lock → mọi hàm là cờ cứng **HUMAN** (L2).

### 5a. Ép fast lane: `/hitl:implement <T> --lane fast` (chỉ bạn)

Fast lane (tự skeleton → test → implement, không gate) mặc định bị từ chối cho task high risk. Bạn có thể ép cho
**một task**: `/hitl:implement PWR-T12 --lane fast`.
- Chỉ người làm được, giống approve: hook UserPromptSubmit đọc nguyên văn prompt và phát **override token** gắn với
  `PWR-T12` (sống tối đa 3 giờ trong lượt chạy; trả lời `done`/`y` ở gate giữ token, gõ lệnh `/…` khác thì token hết).
  PreToolUse chỉ cho `hitl-index approve PWR-T12 --stage skeleton|tests --by human-override` qua khi có token, ở main
  thread, lệnh đơn (không nối `;`/`&&`/pipe). Subagent và task khác bị chặn; `done` không bao giờ qua override.
- Đầu lượt in một khối ⚠️ HUMAN OVERRIDE kèm lý do risk; sau đó hàm agent không còn gate, hàm manual vẫn giao cho bạn.
- `skeleton.lock.json` ghi `approvedBy/lockedBy: "human-override"` và `tasks[T].override: true` (không tự xoá);
  `hitl-index status --json` có `override: true` theo task.
- Review: router ép mọi hàm của task đó sang **HUMAN** (L2), report có dòng `⚠️ human-override …`; `done` vẫn là
  `/hitl:approve PWR-T12 done` của bạn.

### 5b. Build rồi review: `/hitl:implement --feature <change-id> [--lane fast]`

- `hitl-index feature <change-id> --json` sắp task theo blocked-by (topo), rồi prio, rồi id; lane mỗi task: low → `_Fast_`,
  high → gate bình thường (dừng ở skeleton/test/approve của bạn), high + `--lane fast` → ⚠️ override (token gắn với
  **change**: phủ các task của nó, cảnh báo một lần cho cả lượt chạy). Tên tasks/planning file v0.5 vẫn dùng được.
- Dừng sớm khi: test không xanh sau số lần thử của implementer, drift mức `block`, hàm manual cần bạn, task chờ bạn
  duyệt (lane thường). Tiếp tục bằng **đúng lệnh cũ**: task đã implement (green/review/verified/done) được bỏ qua.
- Cuối cùng: `/hitl:review <T> --in-feature` cho từng task (không gate riêng), rồi `hitl-index feature <id> --report`
  ghi `.hitl/reviews/feature-<id>.md` (một màn hình: verdict, risk, override, trace `_Block_`/⚠️, finding cần quyết
  theo task) và hỏi **một** gate cho cả change. Xong hết → `/hitl:archive <id>`.

## 6. Các lớp test và review

1. **AC** trong tasks md (2–6 Given/When/Then mỗi task, id `<KEY>-T<n>.AC<k>`) + test plan: mỗi AC một quyết định
   (`new: <lỗi>` · `shared:` · `covered:` · `none:` · `manual:`, 0.16), bạn duyệt ở gate tasks (câu 5).
2. **Test stub** ở skeleton, chỉ cho dòng `new` (`@covers @ac @kind @origin @catches`), `it.todo` / `@unittest.skip`;
   tên test là hành vi, không chứa id.
3. **test-author** cô lập: chỉ đọc contract pack (chữ ký, intent, TODO flow, AC), không thấy thân hàm (hook chặn Read src). Test phải **RED đúng lý do**; test pass trên stub = vô nghĩa → trả lại (trừ `@kind regression`). Test thêm ngoài plan phải có `@catches`; ngân sách `new` + 2 mỗi task (cảnh báo).
4. **Lock test** (`/hitl:approve T tests`): sau đó implementer không sửa được test; sửa test chỉ qua `/hitl:test` + duyệt lại.
5. **Stop hook**: hàm agent vừa implement mà chưa có lần chạy test xanh "fresh" → chặn kết thúc (tối đa 2 lần).
6. **Review L0** (tất định): lint, typecheck, tests, drift vs lock, **trace**, mutation (Stryker / mutmut; bắt buộc cho task high risk khi đã cấu hình).
7. **Review L1**: reviewer subagent context mới, mỗi lens một agent song song — `contract`, `tests` (luôn có), `concurrency`, `security` (khi có tín hiệu) →
   **finding-verifier** (haiku) chấm lại 0–100, giữ ≥ 80 → report một màn hình `reviews/<KEY>-T<n>.review.md` (verdict PASS / WITH FIXES / FAIL).
8. **Fix loop**: finding được accept trên hàm agent → test-author viết test fail trước, implementer làm xanh; hàm manual → TODO cho bạn. Tối đa 2 vòng rồi chuyển người.

**Mẫu test (0.8, `shared/test-patterns.md`)**: một nguồn quy tắc cho test-author, implementer, lens tests, skeleton,
design và tasks (trên `skills/tdd/tests.md` + `mocking.md` vendor nguyên bản từ mattpocock): tên test dùng thuật ngữ
`## Terms`, không mock module của project, không kiểm qua kênh phụ (đọc mảng/bảng thay vì hỏi qua interface), double theo
loại dependency, AC1 là tracer qua seam cao nhất. Vòng kép: test AC của task được khoá RED trước (vòng ngoài), implementer
làm xanh **từng test một** theo thứ tự file (vòng trong; chỉ lần chạy không tiến triển mới tính vào giới hạn 3). Refactor
không nằm trong implement: làm qua `/hitl:review` + fix loop, dưới test xanh đã khoá.

**0.8.x: kiểm tra ngôn ngữ chung và bước refactor.** `hitl-index spec validate` cảnh báo `TERM_AVOIDED` khi proposal hoặc
spec delta dùng một từ nằm trong `_Avoid_` của glossary hiệu lực (living + delta của change), vd. `"user record" → use
Account (glossary)`; khớp không phân biệt hoa thường, nguyên từ, cả cụm nhiều từ; bỏ qua code span, file glossary và dòng
`_Avoid_`; tắt cùng `spec.businessLint: "off"`, không bao giờ chặn. Review L0 có gate `terms`: docstring intent của các
symbol trong task dùng từ `_Avoid_` → `warn` kèm thuật ngữ nên dùng (cùng một hàm so khớp, `scripts/lib/glossary.mjs`).
Sau khi task xanh, lens contract xét thêm **cấu trúc** (lặp code, tên lệch glossary, hàm chỉ chuyển tiếp, lồng sâu; lens
tests: test gọi helper private thay vì seam): finding `structure` chỉ là gợi ý, nằm ở mục `## Structure (suggestions)`
của report, không bao giờ làm verdict thành WITH FIXES. `fix F-n` chạy một lượt refactor (test giữ xanh, không sửa test);
việc vượt ngoài task → `defer F-n` và một change `refactor-<slug>`.

**Truy vết (trace, `hitl.trace/2`):** requirement (`PWR-R1`, spec) → scenario (`PWR-R1.S1`) → AC `(PWR-R1.S1)` (tasks md)
→ test `@ac` → symbol `@covers`, cộng `<KEY>-D<n>` qua `**Why**`, `@dec` và cột `serves` của `design.md`.
`hitl-index trace [T|change-id] [--capability <cap>] [--check] [--md]` tính tất định (không LLM, không reindex, không
chạy test); `--capability` in RTM của cả capability (task active + archive). **Chỉ chặn khi tham chiếu gãy**
(`CHANGE_MISSING`, `REQ_UNKNOWN`, `SCN_UNKNOWN`, `RULE_UNKNOWN`, `REQ_INACTIVE`, `SPEC_STALE` với task chưa done,
`DEC_UNKNOWN`, `AC_UNKNOWN`, `COVERS_UNRESOLVED`); khoảng trống (`SCN_NO_AC`, `REQ_NO_AC`, `AC_NOT_PROVEN`, …) là
warn/info. Hiện ở `/hitl:flow`, review L0 + mục `## Trace` trong report, `/hitl:sync`, `/hitl:archive`; `/hitl:tasks` tự
sửa trước khi viết brief (chỉ điều cần bạn chọn mới vào "Needs your eye").
Pre-commit chặn theo trace chỉ khi `trace.precommit: true`. Planning v0.5 vẫn được trace như trước (mã `R-n`, `PLANNING_*`).

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
| `hitl.config.json`, `docs/*.md`, `changes/**`, `tasks/*.md` | commit | người viết / người duyệt |
| `specs/**`, `archive/**` | commit | living spec + change đã xong (chỉ `hitl-index spec merge\|archive` ghi) |
| `changes/<id>/plan-brief.md`, `design-brief.md` | commit | file brief (0.14): câu hỏi của plan/design và câu trả lời của bạn; đi theo change khi archive |
| `changes/<id>/tasks-brief.md`, `.tasks-round.json`; `tasks/quick-<slug>-brief.md`, `tasks/.quick-<slug>-round.json` | commit | tasks brief (0.21): vòng duyệt bộ task và câu trả lời của bạn; snapshot của vòng (so `_Changed since…_`, kiểm duyệt, bộ đã duyệt cho update) |
| `changes/<id>/amend-<KEY>-A<n>-brief.md` | commit | amend brief (0.17): một file mỗi amendment — sự thật lúc bắt đầu, các vòng hỏi, `## Unchanged`, `## Close` với amend task set; đi theo change khi archive |
| `changes/<id>/.scout.json`, `.spec-review.json` | ignore | file nháp của subagent `spec-scout` / `spec-reviewer` |
| `planning/*.md` (v0.5) | commit đến khi migrate | chỉ đọc |
| `index/skeleton.lock.json` | commit | bản ghi phê duyệt (chỉ `hitl-index approve` ghi) |
| `index/id-map.json` | commit | bản đồ id cũ → mới của `/hitl:migrate` (0.13; giữ một bản phát hành, `hitl-index context <id-cũ>`) |
| `<provider>.map.json` (linear/jira/github) | commit | đồng đội cần <KEY>-T<n> ↔ issue (chỉ `hitl-index tickets` ghi) |
| `reviews/<T>.review.md` | commit | bằng chứng review |
| `reviews/feature-<name>.md` | commit | report gộp của `/hitl:implement --feature` (do `hitl-index feature --report` sinh) |
| `reviews/feature-<name>.security.json` | commit | link tới `REPORT.md` của audit bảo mật đầy đủ (do `hitl-index feature --report --security-audit <dir>` ghi) |
| `reviews/<T>/decisions.json` | commit | quyết định accept/reject/defer của người; giữ số F-n ổn định |
| `index/*` còn lại (index.json, index.md, .cache.json, state.json, .lock, .session/, contracts/, trace.md, `<provider>`.*.json) | ignore | sinh lại được / theo máy |
| `reviews/<T>/*` còn lại (l0.json, findings*.json, review-context.md) | ignore | `/hitl:review` sinh lại |
| `.inbox/` | ignore | file trung chuyển kết quả MCP; `route.json` = phán quyết của `work-router` (`hitl-index route` đọc rồi xoá) |

`hitl-index init` ghi `.hitl/.gitignore` chuẩn (hoặc nối thêm các dòng còn thiếu, không xoá dòng cũ):
```
index/*
!index/skeleton.lock.json
!index/id-map.json
reviews/*/*
!reviews/*/decisions.json
.inbox/
.scout.json
.spec-review.json
```
File đã lỡ commit không tự bị untrack: `/hitl:setup` in gợi ý `git rm -r --cached <paths>` (không tự chạy).
File sinh ra (index, lock, CODEBASE-MAP AUTO, review md, `<provider>.map.json`) **không sửa tay**; hook PreToolUse chặn agent sửa chúng.
Symbol id = `<relpath>#<QualName>` (vd. `src/services/userService.ts#UserService.createUser`), không có số dòng.

Tag trong docstring (chi tiết: `shared/tag-grammar.md`):
```ts
/**
 * Registers a user; rejects duplicate emails (case-insensitive).
 * @task PWR-T12 @impl agent @status skeleton @prio 1
 * @dec PWR-D1
 * @calls UserRepo.findByEmail, UserRepo.save
 * @concurrency none
 */
```
`@dec <KEY>-D<n>` (tuỳ chọn, 0–3 symbol mỗi task): symbol này hiện thực decision <KEY>-D<n> trong `design.md` của change. **Không** được hash vào
contract → thêm/bớt không cần duyệt lại. Lưu ý nâng cấp: dòng docstring cũ bắt đầu bằng `@dec …` trước đây là prose, giờ
là tag → một lần `INTENT_CHANGED` trên symbol đã khoá (hiếm).

## 7a. Ngôn ngữ & adapter

`hitl-index` index được mọi ngôn ngữ. Mỗi ngôn ngữ dùng một adapter, chọn theo thứ tự:
`customAdapters` → adapter chuyên dụng (TS/Python) → `ctags` (nếu có Universal Ctags) → `generic`.

| Adapter | Ngôn ngữ | Độ chính xác |
|---|---|---|
| `ts-compiler@<ver>` | TS/JS (khi project có `typescript`) | chính xác (AST) |
| `ts-lite@1` | TS/JS (fallback, không cần dependency) | gần đúng |
| `py-ast@2` | Python (`python3 -I`, stdlib `ast`) | chính xác |
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
  id: "cobol@1",                 // đổi id → index lại toàn bộ
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
tests/e2e.sh                            # e2e trên tests/fixtures/{ts-app,py-app,spec-app} (Node ≥ 22.18, python3, git)
tests/e2e.sh --update-golden            # ghi lại tests/golden/*.symbols.json (rồi commit)
tests/e2e.sh --keep --continue          # giữ thư mục tạm, chạy hết các bước dù có bước fail
```

Sửa prompt (SKILL.md, shared/*.md, description): so A/B bản cũ và bản mới bằng `evals/` (gọi `claude -p` thật, tốn
phí; xem `evals/README.md`): Suite A (skill nào được gọi), Suite B (hành vi, chấm tự động), Suite C (LLM chấm cặp).

## 9. Gợi ý dùng kèm (tuỳ chọn)

- **obra/superpowers** plugin (systematic-debugging, verification; TDD ngoài change đã có `/hitl:tdd`).
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
9. Mutation testing là best-effort: chỉ bắt buộc cho task high risk khi đã cấu hình lệnh mutation (`mutationRequired: "high"`); dữ liệu "test nào giết mutant nào" chỉ có với Stryker (`killedBy`), đầy đủ khi tắt bail.
10. Ngưỡng risk (0.3/0.6), confidence 80, mutation 0.8 là heuristic, chưa đo; chỉnh trong config.
11. Tên tool/tham số của Linear MCP chưa được kiểm chứng trên mọi bản cài: `/hitl:tickets` dò tên tool lúc chạy (đọc schema trước lần gọi đầu); lần chạy thật đầu tiên nên theo dõi. Quyền MCP được hỏi một lần cho mỗi tool.
12. Linear MCP không xoá được relation → khi bỏ `blocked-by`, skill chỉ in nhắc xoá tay.
13. Override token (`--lane fast`) dùng lại được trong lượt chạy (≤3 giờ, chỉ task/feature đã gắn); feature token chụp danh sách task lúc bạn gõ lệnh — task thêm sau cần gõ lại lệnh. Cờ `override` trong lock là vĩnh viễn (an toàn hơn là tự xoá).

## Credits

Skill **mattpocock/skills `grilling`** (MIT, © 2026 Matt Pocock) và **cloudflare/security-audit-skill** (MIT, © 2025-2026
Cloudflare, Inc.) được vendor nguyên bản (`skills/grilling/`, `skills/security-audit/`), cùng hai file tham chiếu của
mattpocock `tdd` (`skills/tdd/tests.md`, `mocking.md`; `/hitl:tdd` là bản chuyển thể của hitl). Định dạng spec/delta và merge
chuyển thể từ **Fission-AI/OpenSpec** (MIT); template proposal/design, taxonomy clarify, checklist và constitution từ
**github/spec-kit** (MIT); một số file tham chiếu từ **mattpocock/skills** (gồm cơ chế glossary của `domain-modeling` trong
`shared/interview.md`) và **obra/superpowers** (MIT). Ý tưởng từ Kiro,
EARS, BMAD-METHOD (advanced elicitation; "BMad" là thương hiệu của chủ sở hữu), Example Mapping, BABOK/DMN/ISO 25010,
chuẩn tham chiếu (không chép nội dung): MADR 4 (MIT/CC0), ISO/IEC/IEEE 29148, INCOSE GtWR, Cockburn use cases, C4 (CC BY 4.0),
OpenAPI/AsyncAPI/JSON Schema,
cc-sdd, GSD, plugin code-review của Anthropic, insilode, alvis draft-code, Meta ACH, TDD Guard, spec-kit-linear-sync,
ADR (Nygard). Chi tiết và license đầy đủ: [NOTICE.md](NOTICE.md).
License: MIT © 2026 Thai.
