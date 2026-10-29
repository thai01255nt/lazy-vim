# hitl — Human-in-the-loop SDD cho Claude Code

Plugin Claude Code cho quy trình spec-driven: **plan (spec) → design → tasks → skeleton → approve → test → implement →
review → archive**.

> **Giá trị của hitl là con người ở trong vòng lặp khi implement.** Cổng spec và design rẻ và luôn bật: thống nhất
> *làm gì* (plan) và *làm thế nào* (design) trước khi có code. Sau đó bạn chọn nhìn bao nhiêu lần:
> - **Mặc định, từng bước**: mỗi task high risk dừng ở skeleton → test → implement → review. Bạn duyệt contract
>   trước khi có code.
> - **Fast lane** (`/hitl:implement T-n --lane fast`): một task chạy skeleton → test → code không gate, bạn review kết quả.
> - **Build rồi review** (`/hitl:implement --feature <change-id> --lane fast`, có thể sau `/hitl:design --auto`): cả
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
> grill-style rounds via the vendored `hitl:grilling`, coverage + `deep <ID>` + stop rule), new `/hitl:design` (D-n,
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
- `@dec D-n` giờ trỏ tới `design.md` của change (qua `@task` → task → change). `--feature <change-id>` thay cho tên file.

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
 /hitl:setup ─► /hitl:overview ─► /hitl:plan ⛔ (WHAT/WHY) ─► /hitl:design ⛔ (HOW, bỏ qua được) ─► /hitl:tasks ⛔
                                                                                        │
                     risk: low (fast lane ⚡) ◄──────────────────────────────────────────┤────────► risk: high
                     /hitl:implement                                                    │  /hitl:skeleton ⛔  (bạn sửa skeleton trong editor)
                     (auto skeleton + tests)                                            │  /hitl:approve T    (khoá skeleton)
                              │                                                         │  /hitl:test T ⛔    (test RED, test-author cô lập)
                              │                                                         │  /hitl:approve T tests
                              ▼                                                         ▼  /hitl:implement T  (agent fn → subagent; manual fn → bạn ⛔)
                        /hitl:review T ◄─────────────────────────────────────────────────────┘
                              │  L0 gates → L1 lenses → report (.hitl/reviews/T.review.md)
                              ▼
                   /hitl:approve T done  (high)  ·  auto done (low, verdict PASS)
                              ▼
                   /hitl:archive <change-id> ⛔  (delta → living spec .hitl/specs/, change → .hitl/archive/)

 Build rồi review   ─► /hitl:implement --feature <change-id> [--lane fast]  (một report gộp ở cuối)
 Sửa code ngoài Claude ─► /hitl:sync  (drift + trace report, re-approve / revert / defer / accept + amend spec)
 Không biết làm gì tiếp ─► /hitl:flow
 Kênh phụ (tuỳ chọn)   ─► /hitl:tickets push  (mirror task sang Linear / Jira / GitHub; không bao giờ là gate)
```

**Plan = WHAT/WHY (cho BA/PO đọc).** `/hitl:plan` phỏng vấn kiểu grill (tự nạp skill `hitl:grilling`, bạn không cần gọi)
và chỉ ghi file business: `proposal.md` (Why, What changes, Capabilities, Success criteria, Coverage, Artifacts…) và
**spec delta** theo capability (`## ADDED|MODIFIED|REMOVED Requirements`, mỗi requirement một câu EARS với
`SHALL/SHOULD/MAY` + scenario `GIVEN/WHEN/THEN`). Không tên code, không component, không thiết kế hàm (CLI cảnh báo
`BIZ_CODE_TOKEN`). Ý tưởng kỹ thuật bạn nói ra được "gửi" sang `design.md ## Parked from planning`.
- **Độ phủ (rộng):** 9 nhóm — Scope, Actors, Data & lifecycle, Business rules, Edge cases, Integrations, NFR,
  Terminology, Success criteria — mỗi vòng in một dòng `Độ phủ: Scope ✅ · Data ⚠️ · Edge ❌ · NFR — …`; vòng sau ưu
  tiên ❌/⚠️; chỗ chưa rõ ghi `[NEEDS CLARIFICATION: …]`.
- **Đào sâu:** điểm có impact × độ không chắc cao được đánh 🔥 và hỏi sâu trước; bạn gõ `deep <ID|chủ đề>` để chọn kỹ
  thuật (example mapping, 5 whys, edge cases, pre-mortem, bảng quyết định, góc nhìn stakeholder) — kết quả ghi thẳng vào spec.
- **Điều kiện dừng:** chỉ đóng plan khi mọi nhóm ✅ hoặc — (có lý do) và không requirement `SHALL` nào còn
  `[NEEDS CLARIFICATION]` (`hitl-index spec validate` báo `COVERAGE_GAP`, `REQ_UNCLEAR`); muốn đóng sớm thì "force",
  được ghi `💡 Forced:` trong proposal.
- **Artifact chọn theo ngữ cảnh** (`shared/artifacts.md`): glossary, business rule + bảng quyết định, use-case flow,
  NFR, data-model, contracts… Chắc chắn → tự làm và in `💡 Assumed: …`; không chắc → hỏi ở gate (`[A]`).

**Design = HOW (cho dev).** `/hitl:design <change-id>` đọc spec + ARCHITECTURE/PATTERNS/CODEBASE-MAP (+ CONSTITUTION nếu
có), hỏi các vòng `[D]` và ghi `design.md` (`D-n` + alternatives + `serves`, component mức module, error handling, test
strategy, risks, rollout), tuỳ chọn `data-model.md`, `contracts/`. Không bao giờ chữ ký hàm (đó là việc của tasks /
skeleton). `--auto`: tự quyết theo khuyến nghị, một gate duyệt. Design được bỏ qua khi change nhỏ (không dependency
mới, không đổi dữ liệu lưu, không đổi interface public, ≤ 2 task, không risk cao).

**Archive.** Khi mọi task xong, `/hitl:archive <id>` xem trước merge (conflict, id trùng, `BASE_CHANGED`) rồi CLI gộp
delta vào `.hitl/specs/<capability>/spec.md` (+ `GLOSSARY.md`, `## Change History`, `## Retired IDs`) và chuyển change
sang `.hitl/archive/<ngày>-<id>/`. Living spec chỉ CLI ghi (hook chặn sửa tay).

**Định dạng chuẩn (0.6.1).** Mỗi artifact theo một chuẩn, có template + ví dụ + nguồn trong
[`shared/formats/`](shared/formats/README.md): requirement theo ISO/IEC/IEEE 29148 + INCOSE (một `SHALL`, có chủ thể,
không từ mơ hồ — EN + VI, cấu hình `spec.vagueTerms` / `spec.vagueTermsExtra`, tắt bằng `spec.qualityLint: "off"`), NFR =
`Quality:` (ISO 25010:2023) + `Fit:` đo được, bảng quyết định DMN (`Hit policy:`, cột `(in)`/`(out)`), vòng đời
`stateDiagram-v2` + bảng `from | event | guard | action | to`, use case Cockburn (lite), quyết định `D-n` theo MADR 4,
contract OpenAPI 3.1 / AsyncAPI 3 / JSON Schema 2020-12 / CLI (`shared/templates/contracts/`), sơ đồ C4. `spec validate`
chỉ **cảnh báo** (`REQ_VAGUE`, `DT_OVERLAP`, `SM_UNREACHABLE`, `UC_EXT_REF`, `CONTRACT_VERSION`, `CAP_DUP_NEW`, …).

Status (do tooling tính, không bao giờ sửa tay): `skeleton → red → wip → green → verified → done`.

## 3. Lệnh

| Lệnh | Việc làm | Gate? | Ai gọi |
|---|---|---|---|
| `/hitl:setup [--reconfigure]` | Khởi tạo `.hitl`, dò lệnh test/lint/typecheck, index, tuỳ chọn cài git pre-commit | ⛔ xác nhận lệnh | chỉ bạn |
| `/hitl:flow [T-id\|help]` | Đang ở đâu, task nào tiếp theo, lệnh gợi ý `🎯 next` | — | bạn / Claude |
| `/hitl:overview [mô tả\|refresh]` | Viết docs BUSINESS-CONTEXT / ARCHITECTURE / PATTERNS-CONVENTIONS (3 mapper song song) + CODEBASE-MAP sinh từ index | ⛔ nếu đã có docs | bạn / Claude |
| `/hitl:plan [mô tả\|change-id [amend]]` | WHAT/WHY: phỏng vấn grill (tự nạp `hitl:grilling`), độ phủ + 🔥 + `deep <ID>` → `changes/<id>/proposal.md` + spec delta (`ACC-R3`, scenario `ACC-R3.S1`) + glossary; lần đầu đề nghị migrate planning v0.5. `<id> amend`: sửa spec đã duyệt | ⛔ mỗi vòng | bạn / Claude |
| `/hitl:design <change-id> [--auto]` | HOW: `design.md` (`D-n`, component mức module, test strategy, risks) + `data-model.md`, `contracts/` khi cần | ⛔ mỗi vòng | bạn / Claude |
| `/hitl:tasks [change-id\|quick …]` | Chia task dọc (vertical slice), prio P0–P3, risk + lý do, AC Given/When/Then gắn scenario `(ACC-R3.S1)`, Why trích `D-n`, symbol đích, test plan → `changes/<id>/tasks.md`; kiểm tra bằng `hitl-index trace` | ⛔ quiz | bạn / Claude |
| `/hitl:archive <change-id>` | Xem trước rồi merge delta vào living spec `.hitl/specs/`, chuyển change sang `.hitl/archive/` | ⛔ diff / conflict | bạn / Claude |
| `/hitl:grilling` | Skill grill-me nguyên bản (mattpocock): hỏi dồn từng vòng; plan/design tự dùng, gọi riêng khi muốn "grill" một ý tưởng | ⛔ mỗi vòng | bạn / Claude |
| `/hitl:skeleton <T> [--quick]` | Viết skeleton: chữ ký, docstring intent + tag, các bước `TODO(impl)`, sentinel throw; test stub cho mỗi AC | ⛔ review trong editor | bạn / Claude |
| `/hitl:approve <T> [skeleton\|tests\|done] [symbols…]` | Khoá skeleton / test RED / kết quả cuối vào `skeleton.lock.json` | chính lệnh là sự duyệt | **chỉ bạn** |
| `/hitl:test <T> [fill\|run\|mutate]` | test-author (chỉ thấy contract pack) viết test thật, kiểm tra RED đúng lý do; mutation tuỳ chọn | ⛔ (high) | bạn / Claude |
| `/hitl:implement <T> [symbol] [--all] [--lane fast]` | Làm từng hàm theo `@prio`: agent fn → subagent implementer; manual fn → giao cho bạn kèm context. `--lane fast`: bạn ép fast lane cho task high risk (xem 5a) | ⛔ manual / mỗi hàm (high) | chỉ bạn |
| `/hitl:implement --feature <change-id> [--lane fast]` | Build rồi review: chạy mọi task của một change theo thứ tự (blocked-by, rồi prio), mỗi task theo lane của nó; dừng **một lần** ở cuối với review gộp `reviews/feature-<name>.md` (xem 5b) | ⛔ cuối / dừng sớm | chỉ bạn |
| `/hitl:review <T> [fix F-n\|amend F-n\|recheck]` | Review nhiều lớp (L0 có gate `trace`) + fix loop; `amend F-n` = accept + sửa spec | ⛔ nếu cần người quyết | bạn / Claude |
| `/hitl:review --security-audit [<change-id>\|repo] [--out <dir>]` | Audit bảo mật đầy đủ 6 phase (Cloudflare `security-audit`) cho một feature hoặc cả repo; link `REPORT.md` vào `reviews/feature-<name>.md` (xem 6a) | — | bạn / Claude |
| `/hitl:security-audit …` | Skill upstream nguyên bản: hỏi đáp/review bảo mật (guidance mode) hoặc audit đầy đủ khi bạn yêu cầu rõ | — | bạn / Claude |
| `/hitl:sync [--files …] [T]` | Đồng bộ sửa tay: reindex, drift + trace report, re-approve / revert / defer / accept + amend spec, cập nhật CODEBASE-MAP | ⛔ | **chỉ bạn** |
| `/hitl:tickets init\|push\|pull\|status` | (Tuỳ chọn) mirror task sang Linear, Jira hoặc GitHub Issues: một issue mỗi task, push một chiều, pull chỉ đọc (báo drift), in branch + `Fixes ENG-n` / `Fixes #n` | ⛔ lần push đầu / op cần duyệt | bạn / Claude (skill khác gọi khi bật `autoPush`) |

CLI (gọi trực tiếp được): `hitl-index spec validate|list|show|next-id|conflicts|merge|archive`, `hitl-index change [<id>]`
(trạng thái/phase của change), `hitl-index migrate --specs` (v0.5 → 0.6),
`hitl-index status [T-id] --by-prio` (bảng hàm của task có cột `prio`, sắp theo `@prio`; không có T-id → mọi task),
`hitl-index strip <T-id|change-id> [--dry-run]` (task đã `done`: xoá `@task @impl @status @prio @dec @risk` khỏi docstring
code, giữ mô tả + `@calls`/`@concurrency`, không đụng test; index lại để kiểm tra, có thay đổi hash/status thì tự khôi phục),
`hitl-index trace [T-id|change-id] [--capability <cap>] [--check] [--md] [--json]` (ma trận truy vết),
`hitl-index tickets status|plan|record|diff|verify|server` (do `/hitl:tickets` dùng),
`hitl-index feature <change-id> [--lane fast] [--report [--security-audit <dir>]] [--json]` (kế hoạch chạy feature / report gộp; `--security-audit` ghi link REPORT.md của audit).

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

### 4a. Accept + amend spec (đồng bộ ngược code → spec)

Khi một contract đã khoá đổi (drift item có `spec: D-1 · ACC-R1.S2`), một finding review cho thấy thiết kế sai, hoặc
implementer báo `specConflict`, skill đề xuất cập nhật **spec/design** thay vì để code và spec lệch nhau âm thầm:
- `/hitl:sync` → lựa chọn `4. accept + amend spec`; `/hitl:review` → trả lời `amend F-n`; `/hitl:implement` → thẻ
  `📐 Spec change proposal`; `/hitl:plan <id> amend` / `/hitl:design <id> amend` → sửa chủ động.
- Skill in **📐 Spec delta** (scenario/requirement sửa trong delta của change, D cũ → `superseded by D-k`, D mới, text
  AC, dòng Changelog, `@dec`) và hỏi `Apply? (Y/n/edit)` trong cùng gate. Quy tắc: `shared/amend-spec.md`.
- Change còn active → sửa delta của nó (requirement living chưa đụng tới → thêm vào `## MODIFIED` nguyên block).
  Change đã archive → tạo mini change `fix-<slug>` (chỉ proposal + delta), rồi `/hitl:archive fix-<slug>`.
- Decision không bao giờ sửa tại chỗ (chỉ supersede); thêm requirement/capability → proposal về `draft`, chạy lại `/hitl:tasks`.
- Amend không duyệt gì cả: sau đó bạn vẫn gõ `/hitl:approve <T> skeleton <symbols>` như cũ.

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
  ⛔ gate liệt kê server (kèm workspace/team mỗi server thấy); chỉ một → tự lưu. Từ đó mọi lần chạy **chỉ** dùng server
  đó; server đã ghim không có → `❌` kèm lệnh `claude mcp add …`/`/mcp`, op được xếp hàng (không chặn gate). Config cũ
  chưa có `linear.server` → dùng server có team đã map, kèm 💡 gợi ý ghim.
- **Kiểm tra danh tính trước mỗi push/pull**: skill lấy urlKey workspace + team (theo id) qua MCP, CLI
  (`hitl-index tickets verify`) so với `linear.map.json` (`workspace.urlKey`, `team.id`/`key`) và `linear.server`/
  `linear.project`. Lệch → từ chối cả lượt (không gửi gì, không xếp hàng), in expected/observed và cách sửa: ghim lại
  server (`hitl-index init --set linear.server=<tên>`) hoặc `/hitl:tickets init --relink` nếu repo thật sự chuyển
  workspace/team (xoá map task cũ, push sau tạo issue mới). Map cũ chưa có workspace → cho qua một lần và ghi lại (💡).
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
  marker `<!-- hitl:task=T-1 repo=<owner/name> file=… -->` trong description.
- **Nhiều repo**: config và map theo từng repo, đều commit; mỗi repo chạy `/hitl:tickets init` một lần (đồng đội dùng
  cùng tên server, hoặc tự `--set linear.server`). Hai repo dùng chung team/project vẫn an toàn dù cùng có `T-1`: push
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
  (không cần tạo); không có tool link → `📌` ghi chú tay. Không có tên branch: CLI dựng `<project>-<n>-<slug>`.
- **GitHub**: danh tính = owner + repo; change → **milestone** (tạo bằng `gh api`), hoặc parent issue + sub-issues;
  trạng thái chỉ có open/closed (pha hitl thấy qua label `hitl:*`); blocked-by = issue dependency (`gh api`); issue là
  `#n`, PR line `Fixes #n` / `Part of #n`. `gh` chỉ được dùng khi `gh auth status` cùng tài khoản/host với MCP.

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

### 5b. Build rồi review: `/hitl:implement --feature <change-id> [--lane fast]`

- `hitl-index feature <change-id> --json` sắp task theo blocked-by (topo), rồi prio, rồi id; lane mỗi task: low → ⚡ fast,
  high → gate bình thường (dừng ở skeleton/test/approve của bạn), high + `--lane fast` → ⚠️ override (token gắn với
  **change**: phủ các task của nó, cảnh báo một lần cho cả lượt chạy). Tên tasks/planning file v0.5 vẫn dùng được.
- Dừng sớm khi: test không xanh sau số lần thử của implementer, drift mức `block`, hàm manual cần bạn, task chờ bạn
  duyệt (lane thường). Tiếp tục bằng **đúng lệnh cũ**: task đã implement (green/review/verified/done) được bỏ qua.
- Cuối cùng: `/hitl:review <T> --in-feature` cho từng task (không gate riêng), rồi `hitl-index feature <id> --report`
  ghi `.hitl/reviews/feature-<id>.md` (một màn hình: verdict, risk, override, trace ⛔/⚠️, finding cần quyết
  theo task) và hỏi **một** gate cho cả change. Xong hết → `/hitl:archive <id>`.

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

**Truy vết (trace, `hitl.trace/2`):** requirement (`ACC-R3`, spec) → scenario (`ACC-R3.S1`) → AC `(ACC-R3.S1)` (tasks md)
→ test `@ac` → symbol `@covers`, cộng `D-n` qua `**Why**`, `@dec` và cột `serves` của `design.md`.
`hitl-index trace [T|change-id] [--capability <cap>] [--check] [--md]` tính tất định (không LLM, không reindex, không
chạy test); `--capability` in RTM của cả capability (task active + archive). **Chỉ chặn khi tham chiếu gãy**
(`CHANGE_MISSING`, `REQ_UNKNOWN`, `SCN_UNKNOWN`, `RULE_UNKNOWN`, `REQ_INACTIVE`, `SPEC_STALE` với task chưa done,
`DEC_UNKNOWN`, `AC_UNKNOWN`, `COVERS_UNRESOLVED`); khoảng trống (`SCN_NO_AC`, `REQ_NO_AC`, `AC_NOT_PROVEN`, …) là
warn/info. Hiện ở gate `/hitl:tasks`, `/hitl:flow`, review L0 + mục `## Trace` trong report, `/hitl:sync`, `/hitl:archive`.
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
| `changes/<id>/.scout.json`, `.spec-review.json` | ignore | file nháp của subagent `spec-scout` / `spec-reviewer` |
| `planning/*.md` (v0.5) | commit đến khi migrate | chỉ đọc |
| `index/skeleton.lock.json` | commit | bản ghi phê duyệt (chỉ `hitl-index approve` ghi) |
| `<provider>.map.json` (linear/jira/github) | commit | đồng đội cần T-n ↔ issue (chỉ `hitl-index tickets` ghi) |
| `reviews/<T>.review.md` | commit | bằng chứng review |
| `reviews/feature-<name>.md` | commit | report gộp của `/hitl:implement --feature` (do `hitl-index feature --report` sinh) |
| `reviews/feature-<name>.security.json` | commit | link tới `REPORT.md` của audit bảo mật đầy đủ (do `hitl-index feature --report --security-audit <dir>` ghi) |
| `reviews/<T>/decisions.json` | commit | quyết định accept/reject/defer của người; giữ số F-n ổn định |
| `index/*` còn lại (index.json, index.md, .cache.json, state.json, .lock, .session/, contracts/, trace.md, `<provider>`.*.json) | ignore | sinh lại được / theo máy |
| `reviews/<T>/*` còn lại (l0.json, findings*.json, review-context.md) | ignore | `/hitl:review` sinh lại |
| `.inbox/` | ignore | file trung chuyển kết quả MCP |

`hitl-index init` ghi `.hitl/.gitignore` chuẩn (hoặc nối thêm các dòng còn thiếu, không xoá dòng cũ):
```
index/*
!index/skeleton.lock.json
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
 * @task T-12 @impl agent @status skeleton @prio 1
 * @dec D-1
 * @calls UserRepo.findByEmail, UserRepo.save
 * @concurrency none
 */
```
`@dec D-n` (tuỳ chọn, 0–3 symbol mỗi task): symbol này hiện thực decision D-n trong `design.md` của change. **Không** được hash vào
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
tests/e2e.sh                            # e2e trên tests/fixtures/{ts-app,py-app,spec-app} (Node ≥ 22.18, python3, git)
tests/e2e.sh --update-golden            # ghi lại tests/golden/*.symbols.json (rồi commit)
tests/e2e.sh --keep --continue          # giữ thư mục tạm, chạy hết các bước dù có bước fail
```

Sửa prompt (SKILL.md, shared/*.md, description): so A/B bản cũ và bản mới bằng `evals/` (gọi `claude -p` thật, tốn
phí; xem `evals/README.md`): Suite A (skill nào được gọi), Suite B (hành vi, chấm tự động), Suite C (LLM chấm cặp).

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

Skill **mattpocock/skills `grilling`** (MIT, © 2026 Matt Pocock) và **cloudflare/security-audit-skill** (MIT, © 2025-2026
Cloudflare, Inc.) được vendor nguyên bản (`skills/grilling/`, `skills/security-audit/`). Định dạng spec/delta và merge
chuyển thể từ **Fission-AI/OpenSpec** (MIT); template proposal/design, taxonomy clarify, checklist và constitution từ
**github/spec-kit** (MIT); một số file tham chiếu từ **mattpocock/skills** và **obra/superpowers** (MIT). Ý tưởng từ Kiro,
EARS, BMAD-METHOD (advanced elicitation; "BMad" là thương hiệu của chủ sở hữu), Example Mapping, BABOK/DMN/ISO 25010,
chuẩn tham chiếu (không chép nội dung): MADR 4 (MIT/CC0), ISO/IEC/IEEE 29148, INCOSE GtWR, Cockburn use cases, C4 (CC BY 4.0),
OpenAPI/AsyncAPI/JSON Schema,
cc-sdd, GSD, plugin code-review của Anthropic, insilode, alvis draft-code, Meta ACH, TDD Guard, spec-kit-linear-sync,
ADR (Nygard). Chi tiết và license đầy đủ: [NOTICE.md](NOTICE.md).
License: MIT © 2026 Thai.
