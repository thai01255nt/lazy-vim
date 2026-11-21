# Hướng dẫn sử dụng hitl (bản ngắn)

Đọc trang này là dùng được. `README.md` là tài liệu tra cứu chi tiết, chỉ mở khi cần.

**Tinh thần:** thống nhất *làm gì* (plan) và *làm thế nào* (design) trước khi có code — hai bước này rẻ và luôn có.
Giá trị chính của hitl là **bạn ở trong vòng lặp lúc implement**: mặc định duyệt từng bước (skeleton → test → code →
review); muốn nhanh thì để Claude build cả change rồi review một lần ở cuối. Spec luôn là thứ để đối chiếu.

## 0. Cài một lần

Trong Claude Code:
```
/plugin marketplace add ~/.config/nvim/claude
/plugin install hitl@thai-hitl
```
Mở lại Claude Code. Gõ `/hitl:` thấy danh sách lệnh là xong.

## 1. Mỗi project chạy một lần

```
/hitl:setup        # tạo .hitl/, dò lệnh test/lint, index code (project cũ 0.5: đề nghị migrate)
/hitl:overview     # (nên làm) Claude đọc codebase, viết docs tổng quan
```

## 1a. Việc mới: bắt đầu bằng `/hitl:go`

Không cần tự chọn lệnh đầu tiên. Mô tả việc cần làm, Claude chọn đường và chạy luôn:
```
/hitl:go thêm chức năng xuất danh sách user ra CSV cho admin     # → /hitl:plan (feature thật)
/hitl:go tổng tiền lệch 1 xu khi có mã giảm giá                  # → /hitl:tdd (lỗi tái hiện được)
/hitl:go đổi câu báo lỗi "duplicate email" thành "email đã được dùng"   # → /hitl:tasks quick
/hitl:go link reset giờ hết hạn sau 15 phút                      # → note cho change đang làm (mục 5a)
```
- Một subagent chỉ đọc (không sửa gì) xem các change đang mở, spec, glossary, docs và code, rồi in một dòng
  `_Route:_ <lệnh> — <lý do>` và chạy lệnh đó ngay. Không hỏi "Go?".
- Một luật, thử theo thứ tự, đường đầu tiên khớp đủ điều kiện thắng: đổi yêu cầu/thiết kế của change đang mở → note
  · việc mới trong phạm vi change đó → `/hitl:plan <id> amend` hoặc `/hitl:tasks <id> update` · có cách tái hiện (đầu
  vào làm sai, hoặc kết quả mong đợi nêu được; 1–2 hàm) → `/hitl:tdd` · việc rất nhỏ, không có gì để tái hiện, nên có
  lock và trace → `/hitl:tasks quick` · còn lại → `/hitl:plan`. Không chắc một điều kiện thì coi như không khớp, rơi
  xuống đường nặng hơn (tdd → quick → plan).
- Mô tả quá mơ hồ → Claude hỏi tối đa 3 câu ngắn (mục tiêu và phạm vi), một vòng, rồi tự quyết.
- Tự chọn đường: thêm `--plan`, `--quick` hoặc `--tdd` (bỏ qua phân tích).
- Gõ thẳng `/hitl:plan …`, `/hitl:tdd …`, `/hitl:tasks quick …` vẫn chạy như cũ.

## 1b. Nâng cấp từ 0.12

Project đã dùng hitl ≤ 0.12 (mã kiểu `T-12`, `D-1`, `ACC-R3`) → chạy **một lần**:
```
/hitl:migrate      # chạy thử → bảng key cho mọi change (nhận/sửa cả bảng) → bản đồ đổi tên → Apply? (Y/n)
```
- Mọi mã được đánh số lại theo key của change đã tạo ra nó: `T-12` → `PWR-T1`, `ACC-R3` → `PWR-R1`, `D-1` → `PWR-D1`;
  mã không rõ nguồn (có trước hitl) nhận key legacy như `LACC-R1`; mỗi file task quick nhận key riêng (`QFLT-T1`).
- Từ 0.13.2, task quick cũ dạng `QT-T7` (0.13.0–0.13.1) báo `IDS_LEGACY`: chạy `/hitl:migrate` lần nữa để đổi sang key riêng của file.
- Nên commit hết trước khi chạy (nó từ chối khi `.hitl/` hoặc code có tag còn thay đổi chưa commit). Xong thì commit
  một lần. Mã cũ trong chat/commit: `hitl-index context T-12` vẫn tra được (qua `.hitl/index/id-map.json`).
- Chưa migrate thì các lệnh khác báo `IDS_LEGACY` và chỉ sang `/hitl:migrate`.

## 2. Một feature, 4 bước

```
/hitl:plan thêm chức năng đặt lại mật khẩu qua email     # LÀM GÌ, VÌ SAO (hoặc /hitl:go … tự chọn plan)
/hitl:design feat-password-reset                         # LÀM THẾ NÀO (cho dev); change nhỏ thì tự bỏ qua
/hitl:tasks feat-password-reset                          # chia task PWR-T1, PWR-T2… (low/high risk)
/hitl:flow                                               # không nhớ bước tiếp? gõ cái này
```
- Plan và design **hỏi trong một file brief**, không hỏi trong chat (0.14): `.hitl/changes/<id>/plan-brief.md` (và
  `design-brief.md`). Mở file trong editor, viết câu trả lời ở dòng `>` dưới mỗi câu (dài bao nhiêu cũng được), lưu,
  rồi chạy lại `/hitl:plan feat-password-reset` (hoặc gõ "tiếp"/"xong" trong cùng hội thoại). Claude ghi lại, đánh
  `→ recorded: …` dưới mỗi câu và thêm vòng sau vào cuối file.
- Mô tả càng chi tiết càng ít câu hỏi: `## Description` của brief là nguyên văn mô tả của bạn, viết thêm vào đó trước
  lần chạy đầu cũng được. Vòng 1 là ~10 câu cốt lõi (mỗi câu có ví dụ `_e.g. …_`); từ vòng 2 mỗi câu có gợi ý `_Rec:_`.
- Sau lần chạy đầu, điều câu hỏi bỏ sót hoặc muốn sửa câu trả lời cũ (`sửa Q5: …`) thì viết vào khối **Notes** ở cuối
  vòng đang mở (không viết thêm vào Description nữa).
- Cách trả lời: `y`/`được`/`đồng ý` = nhận gợi ý; `y` ở dòng "Accept all recommendations of this round" = nhận gợi ý
  của mọi câu bạn để trống trong vòng, trừ câu có chữ `(needs its own Y)` (đổi tên change, ghi note sang change khác,
  thêm spec từ design: phải gõ `Y` ngay dưới câu đó); `n` kèm điều bạn muốn = câu trả lời, `n` kèm "để sau" = hoãn,
  `n` trơn = Claude hỏi lại muốn thế nào (_Disc:_);
  `?`/`không biết` = Claude gợi ý và hỏi lại; viết một câu hỏi = Claude trả lời ngay dưới đó (_Disc:_) rồi hỏi lại;
  `deep <ID>` = đào sâu; `xong`/`done` = thôi hỏi. Duyệt spec cũng trong file: câu cuối `Approve the spec? (Y/n)`.
- Plan tự dùng grilling, không cần gọi riêng `/hitl:grilling`.
- Câu `Q0` của brief là **id và key** của change (key 2–5 chữ in hoa, vd. `PWR` cho feat-password-reset), heading có
  chữ `(needs its own Y)`: gõ `y` ngay dưới câu để giữ (để trống thì câu được hỏi lại ở vòng sau, dòng Accept all không
  trả lời nó; tới lúc đóng vẫn trống thì giữ nguyên), hoặc viết id/key mới. Đổi id/key được tới khi change có task
  đầu tiên, cả trong câu trả lời hay Notes sau này. Mọi mã của change bắt đầu bằng key này: `PWR-R1` (yêu cầu), `PWR-R1.S1`
  (scenario), `PWR-D1` (quyết định thiết kế), `PWR-T1` (task), `PWR-T1.AC2` (tiêu chí nghiệm thu).
- Kết quả nằm trong `.hitl/changes/feat-password-reset/` (proposal, spec, design, tasks).

### Duyệt task trong file brief (0.21)
- `/hitl:tasks feat-password-reset` viết `tasks.md` (còn `draft`) rồi mở `tasks-brief.md` cùng thư mục. Chat chỉ trỏ
  tới file.
- File là một **danh sách ngắn** (0.21.1), không phải bộ câu hỏi:
  - `## Tasks (N) — in build order`: CLI sinh từ `tasks.md`, theo thứ tự làm. Mỗi task hai dòng: id, tiêu đề, `— after
    T1` (phải chờ task nào); rồi prio · risk (in đậm khi high, kèm lý do) → lane (`fast lane` hay `skeleton review`) ·
    ai viết (`agent`, `you`, hay ``you write `hàm` ``) · số AC và test. Đừng sửa danh sách này; sửa `tasks.md`.
  - `## Needs your eye`: chỉ có khi Claude thật sự cần bạn nhìn (task quá to, owner chưa rõ, một phát hiện cần bạn
    chọn) hoặc một override test: `` - Override: PWR-T2.AC1 `none!: …`? (needs its own Y) `` với dòng `>` riêng.
  - `## Notes`: đổi risk, thứ tự, prio, thêm/bỏ/gộp task.
  - `## Approve? (needs its own Y)`.
- Thường chỉ cần: đọc, `Y` dưới `Approve?`, lưu, chạy lại `/hitl:tasks feat-password-reset`. Không có gì đổi → Claude
  duyệt (`✅ Tasks approved.` + lệnh tiếp theo). Có đổi (Notes, chỗ bạn sửa `tasks.md`) → file được viết lại thành vòng
  mới, mở đầu bằng `_Changed since Round n:_`. Gõ `Y` trong chat không tính.
- Chưa duyệt thì `/hitl:skeleton`, `/hitl:implement`, `/hitl:test` từ chối task đó (`TASKS_NOT_APPROVED`). Chỉ lệnh
  `hitl-index tasks approve` (Claude gọi sau `Y` của bạn) đổi `tasks.md` sang `approved`.
- **Sửa muộn rẻ** (sau khi duyệt): prio, thứ tự, `blocked-by` của task chưa làm đổi lúc nào cũng được, bạn hay Claude
  đều được, không cần vòng mới, không bị giữ. Risk: bạn sửa thẳng được; Claude chỉ được nâng, không được hạ hay bỏ lý
  do (hook chặn, `TASKS_RISK_LOWERED`). Thêm/bỏ task, đổi AC, hàm hay test plan vẫn đi qua `/hitl:tasks <id> update …`
  (vòng mới; chỉ task mới/sửa phải chờ `Y`, task khác vẫn làm tiếp).
- Task nhanh: `/hitl:tasks quick <mô tả>` → `.hitl/tasks/quick-<slug>.md` + `quick-<slug>-brief.md` cạnh nó, cùng mẫu,
  danh sách một task. Chạy tiếp bằng `/hitl:tasks <KEY>` (vd. `QDEM`).

### Plan hỏi rộng và hỏi sâu
- **Độ phủ**: từ vòng 2, tiêu đề vòng có dòng `Coverage: Scope ✅ · Data ⚠️ · Edge ❌ · NFR — …`; Claude hỏi tiếp chỗ ❌/⚠️.
- **`_Hot_`** đánh dấu chỗ quan trọng mà còn mơ hồ: Claude hỏi sâu chỗ đó trước.
- **`deep <ID>`** (vd. `deep PWR-R3`): bạn tự chọn đào sâu (ví dụ cụ thể, 5 whys, edge case, pre-mortem, bảng quyết định…).
- **Điều kiện dừng**: plan chỉ xong khi mọi nhóm ✅ hoặc — và không còn `[NEEDS CLARIFICATION]` ở yêu cầu bắt buộc;
  muốn chốt sớm thì trả lời `force` ở câu `Close with gaps?` (được ghi lại).
- **Viết theo chuẩn** (`shared/formats/`): mỗi yêu cầu một `SHALL`, không từ mơ hồ ("nhanh", "dễ dùng", "v.v."); NFR có
  `Fit:` đo được. `spec validate` chỉ cảnh báo, Claude tự sửa câu chữ hoặc hỏi bạn con số.

### Ngôn ngữ chung và khi không hiểu câu trả lời
- Mỗi project có một glossary (`.hitl/specs/GLOSSARY.md`): tên thuật ngữ tiếng Anh, định nghĩa có thể tiếng Việt.
  Claude trả lời tiếng Việt nhưng giữ nguyên thuật ngữ, vd. "*Reset link* hết hạn sau 30 phút".
- Bạn dùng từ khác glossary (vd. "user record" thay cho *Account*) → Claude hỏi một câu `[T]` để chốt một từ.
- 0.8.x: `spec validate` và review (gate `terms`) cũng tự cảnh báo khi spec hay docstring dùng từ trong `_Avoid_`
  (`"user record" → use Account`); chỉ cảnh báo, không chặn. Sau khi test xanh, review liệt kê **gợi ý cấu trúc**
  (lặp code, tên lệch glossary, lồng sâu…); `/hitl:review PWR-T2 fix F-3` refactor mà test vẫn xanh, không sửa test.
- Mã như `PWR-R4`, `F-1` luôn đi kèm tiêu đề ngắn để bạn khỏi phải tra.
- Không hiểu câu trả lời? Ở bất kỳ cổng nào gõ `?`, `wait`, `hả`, `giải thích` hoặc `không hiểu`: Claude giải thích lại
  (thêm ngữ cảnh, câu ngắn) rồi hỏi lại đúng câu đó. Câu này không tính là trả lời.

## 3. Làm từng task

### Task rủi ro thấp (low): một lệnh
```
/hitl:implement PWR-T1      # Claude tự viết skeleton + test + code
/hitl:review PWR-T1         # review tự động; PASS thì tự done
```

### Task rủi ro cao (high): bạn duyệt từng bước (mặc định)
```
/hitl:skeleton PWR-T2           # khung hàm (chữ ký + mô tả), chưa có code → bạn xem/sửa trong nvim
/hitl:approve PWR-T2            # khoá khung
/hitl:test PWR-T2               # Claude viết test (phải fail trước khi có code)
/hitl:approve PWR-T2 tests      # khoá test
/hitl:implement PWR-T2          # Claude code hàm `@impl agent`; hàm `@impl manual` là của bạn
/hitl:review PWR-T2             # finding quan trọng sẽ hỏi bạn
/hitl:approve PWR-T2 done       # bạn chốt
```
Chỉ **bạn** gõ được `/hitl:approve`.

### Test: bao nhiêu và vì sao (0.16)
- Luồng change là **test chấp nhận viết trước** (cả loạt test của task viết từ mô tả hàm, khoá, rồi mới code), không
  phải TDD của Kent Beck; TDD thật (một test → đỏ → code → xanh → dọn code) là `/hitl:tdd`.
- Trong tasks brief (dòng thứ hai của mỗi task: số AC và test) bạn duyệt test plan: mỗi AC là `new: <lỗi nó bắt>`, `shared: AC1`, `covered: <test có
  sẵn>`, `none: <lý do>` hoặc `manual: <cách kiểm tay>` (hai loại này không dùng cho task risk security/concurrency/data: task đó phải có test tự động cho mỗi AC).
- Ngoại lệ do **bạn** quyết (0.20): `none!: <lý do>` hoặc `manual!: <cách kiểm tay> — <lý do>` cho phép bỏ test tự
  động trên task security/concurrency/data. Lý do là bắt buộc; `tasks --check` chỉ cảnh báo
  (`TEST_PLAN_NONE_RISK_OVERRIDE`), `status` ghi `⚠️ test override`, báo cáo review liệt kê AC đó. Claude không tự
  ghi `!`: nó chỉ hỏi trong tasks brief bằng một dòng `Override:` riêng `(needs its own Y)`; chỉ `Y` ngay dưới dòng đó
  mới tính. Câu trả lời đó là bằng chứng: dòng `!` không có câu trả lời `Y` thì `status` và báo cáo review ghi
  `(no brief record)` (info `TEST_OVERRIDE_UNRECORDED`).
- Mỗi test phải nêu lỗi nó bắt (`@catches`); test thêm ngoài plan cũng vậy. Mỗi task ≤ số dòng `new` + 2 test (vượt
  chỉ cảnh báo). Tên test là hành vi, không chứa id (id nằm trong `@ac`).
- Muốn tỉa test: `hitl-index tests audit <change>` liệt kê ứng viên; bạn chọn, rồi `/hitl:approve <T> tests`.

### Để Claude build hết rồi review một lần (nâng cao)
```
/hitl:implement PWR-T2 --lane fast                          # một task, không gate, review ở cuối
/hitl:implement --feature feat-password-reset --lane fast   # cả change, một report gộp ở cuối
```

## 4. Xong change

```
/hitl:archive feat-password-reset
```
Claude cho xem trước, bạn `y` → spec được gộp vào `.hitl/specs/` (tài liệu sống của hệ thống), change chuyển vào `.hitl/archive/`.

## 5. Khi bạn tự sửa code trong nvim

```
/hitl:sync
```
Claude so code với khung đã duyệt: duyệt lại / hoàn tác / để sau / sửa spec cho khớp.

## 5a. Khi yêu cầu đổi giữa chừng

Cứ nói trong chat, ví dụ "link reset giờ hết hạn sau 15 phút". Claude hỏi:
```
_Note_ for feat-password-reset, refs PWR-R5.S2 (Unknown email reveals nothing)? (Y/n)
```
`y` → ghi note; task bị đụng tới sẽ không duyệt được cho tới khi note được xử lý. Áp dụng khi bạn sẵn sàng:
```
/hitl:plan feat-password-reset amend N-1      (chỉ đổi câu chữ → một gate trong chat: delta + _Impact:_ + Apply?)
                                              (đổi hành vi/thiết kế → mở amend brief .hitl/changes/<id>/amend-PWR-A1-brief.md)
```
Với amend brief (0.17): mở file trong editor. Đầu file là sự thật: task nào xong, task nào đang làm, cái gì bị chạm. Trả
lời các câu hỏi trên dòng `>` (đổi gì; hành vi cũ chỉ ở branch này / đã merge / đã release; việc ngoài phạm vi `[X]`;
task làm dở `[K]`), rồi chạy lại `/hitl:plan feat-password-reset amend`. Cuối cùng phần `## Close` cho xem **amend task
set**, ví dụ:
```
PWR-T5 switch   Link hết hạn sau 15 phút     modify ResetService.request (done in PWR-T1) · rewrite: PWR-T1.AC2
PWR-T6 contract Bỏ job quét link cũ          remove ResetJob.sweep · blocked-by PWR-T5
```
Gõ `Y` dưới `Approve the amendment?` → Claude ghi delta, design, tasks.md. Task đã xong không bao giờ bị mở lại: task
mới nhận code và test cũ của nó, AC cũ được ghi `superseded:`. Trong lúc brief còn mở, task bị chạm đứng chờ (`_Held:_`).

Từ 0.18, phần `## Affected` của brief còn có nhóm `### Reached through calls`: các hàm **gọi tới** symbol bị đổi (lấy từ
call graph của code index, 1 bước; `--depth 2` để đi xa hơn), test của chúng và entity trong `data-model.md`. Mỗi caller
phải có task xử lý, hoặc một dòng lý do dưới `## Unchanged` (vd. `- postReset — signature-compatible`); nếu không,
`amend check` báo `AMEND_UNCOVERED`. Call graph không thấy lời gọi động, reflection hay service khác: những thứ đó hãy
nói trong brief.

Nếu hành vi cũ **đã merge hoặc đã release**, brief hỏi thêm: ai đang dùng dạng cũ, thời hạn deprecation, có cần feature
flag. Task set khi đó theo thứ tự expand → migrate → switch → contract (mẫu trong `shared/formats/parallel-change.md`):
task thêm thứ tạm ghi `**Temp**: dual-write-expiry (data) — …`, task contract ghi `**Removes**: dual-write-expiry`, và
`deploy: <n>` trong dòng meta để việc xoá dữ liệu nằm ở lần deploy sau. Thiếu task gỡ thứ tạm → `AMEND_TEMP_NO_REMOVAL`;
xoá dữ liệu cùng lần deploy → `AMEND_CONTRACT_SAME_DEPLOY`.

Docstring chỉ nói contract hiện tại. Viết "No longer sends…", "previously…", "trước đây…", "không còn gửi…" sẽ có cảnh
báo `INTENT_HISTORY` (drift, review, `hitl-index intents`, `amend check`; không bao giờ chặn). Lịch sử để ở delta
(`Changed:`/`Reason:`), Changelog của design, amend brief hoặc commit message. Khi tương thích ngược chính là contract,
thêm dòng `hitl: history-ok` vào docstring.
```
/hitl:approve feat-password-reset reopen      (chỉ bạn gõ: mở test của task đang làm, chuyển test cũ sang task mới)
/hitl:test PWR-T5                                (test viết lại phải đỏ) → /hitl:approve PWR-T5 tests → implement → review → done
```
Task chưa làm mà không cần nữa: `hitl-index tasks drop <T> --reason "…"` (Claude chạy sau khi bạn `Y` ở gate).
Không muốn áp dụng: `/hitl:approve <change> dismiss N-1 <lý do>`, `/hitl:approve <change> defer N-1 <change khác>`,
hoặc cho riêng một task đi tiếp: `/hitl:approve PWR-T12 tests --ack N-1`.

## 5b. Hai change cùng lúc (change tiên quyết)

Đang làm A thì thấy một việc quá lớn cho A (cần spec riêng, hơn 1 task, capability khác)? Tạo change riêng **trước** A:
```
/hitl:go thêm phí giao dịch --before feat-receipt     (hoặc /hitl:plan … --before feat-receipt; nhiều: --before a,b)
```
- A (`feat-receipt`) nhận note `source: feat-fee` → **toàn bộ A chờ**: không duyệt task, không implement, không
  archive A tới khi feat-fee archive. Plan, design, tasks, amend của A vẫn được.
- Lúc plan feat-fee, phần nào đổi requirement/decision của A thì Claude hỏi `_To feat-receipt:_ … → note? (Y/n/edit)`
  thay vì sửa file của A.
- feat-fee archive → A tự hết chờ; note spec/design từ feat-fee thì A phải nhận vào trước:
```
/hitl:archive feat-fee                        (in ra _Unblocked:_ / _Take in:_ feat-receipt must take in N-2 …)
/hitl:plan feat-receipt amend N-2             (delta + _Impact:_)
/hitl:approve feat-receipt reopen N-3         (chỉ bạn, như mục 5a)
```
- Thôi chờ (thứ tự là quyết định của bạn) hoặc feat-fee bị bỏ: `/hitl:approve feat-receipt dismiss N-1 <lý do>`.
- Chồng lấn với change chưa liên kết (dù có `--before` hay không): plan tự chạy `hitl-index overlap <id>` và hỏi bạn
  trong phần `## Close` của brief (`⚠️ Overlap with … (1/2/3)`). Change cha (đang chờ change này) hiện thành dòng
  `_Parent:_ … — shared: …` ở vòng 1 của brief.
- Kiểm tra chồng lấn bất cứ lúc nào (vd. sau khi merge nhánh có change khác):
```
/hitl:overlap feat-fee feat-waive feat-report      (hoặc --with feat-waive,feat-report; không nêu = mọi change đang mở)
```
  Không có bằng chứng → `✅` rồi dừng. Có → một subagent chấm cả cụm, mỗi finding một dòng
  `⚠️ … → 1. adjust <một bên> · 2. both sides · 3. not an overlap`; trả lời kiểu `1 2, 2 3`. "both sides" ghi note
  `source:` vào change bị ảnh hưởng (change đó chờ tới khi change kia archive); "adjust" chỉ in `_Next:_ /hitl:plan <id> amend`.

## 5c. Nhảy tới id (0.19)

Đọc file markdown thô mà gặp `PWR-R1.S2`, `PWR-T3.AC2`, `PWR-D1`: đặt con trỏ lên id rồi

```
<leader>hd          nhảy tới chỗ định nghĩa (như gd của LSP)
<leader>hr          mọi chỗ của id trong picker có preview (như gr)
<leader>hq          mọi chỗ của id vào quickfix
:HitlDef PWR-R1     gõ id; :HitlWhere PWR-R1 = mọi chỗ (:HitlWhere! = quickfix)
```

- Thứ tự: `def` (nơi định nghĩa) → `test` (test có `@ac` chứa id) → `symbol` (code của task) → `brief` (dòng trong
  file brief, vd. `→ recorded:`) → `ref` (chỗ nhắc khác). Chỗ trong archive có dấu `*`.
- Ngoài nvim (terminal, editor khác): `hitl-index where <id>` in dạng `file:line:col: role: text`, `--json` cho editor.

## 6. Trả lời ở các cổng (gate)

- `y` / `ok` = chọn gợi ý · `2` = chọn phương án 2 · hoặc gõ ý của bạn.
- `?` / `wait` / `hả` = giải thích lại rồi hỏi lại (không phải câu trả lời).
- Trong file brief của plan/design/tasks thì khác: `?` / `không biết` = Claude gợi ý và hỏi lại ở vòng sau; muốn được giải
  thích thì viết câu hỏi của bạn ở dòng `>` (Claude trả lời bằng `_Disc:_` ngay dưới đó).
- Nhãn chữ nghiêng đầu dòng (`_Rec:_` gợi ý, `_Next:_` lệnh tiếp, `_Stop:_` bị chặn, …): quên nghĩa thì gõ
  `/hitl:flow help` (mục Labels).
- Finding trong review: `accept F-1`, `reject F-2 <lý do>`, `defer F-3`, `amend F-4`; sửa: `/hitl:review PWR-T2 fix F-1`.

## 7. Tuỳ chọn

| Muốn | Gõ |
|---|---|
| Đẩy task lên Linear / Jira / GitHub | `/hitl:tickets init [linear\|jira\|github]` (một lần), sau đó `/hitl:tickets push` |
| Audit bảo mật cả change | `/hitl:review --security-audit feat-xxx` |
| "Grill" một ý tưởng bất kỳ | `/hitl:grilling` |
| Sửa nhỏ / làm nhanh theo TDD, không mở change | `/hitl:tdd <việc cần làm>` (chốt seam + danh sách test, rồi red→green→refactor từng test) |
| Không chắc nên dùng lệnh nào cho việc mới | `/hitl:go <mô tả>` (Claude chọn và chạy; `--plan`/`--quick`/`--tdd` để tự chọn) |

Commit: `/hitl:setup` đã tạo sẵn `.hitl/.gitignore`, cứ `git add .hitl`.
