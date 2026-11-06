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
/hitl:go link reset giờ hết hạn sau 15 phút                      # → 📌 note cho change đang làm (mục 5a)
```
- Một subagent chỉ đọc (không sửa gì) xem các change đang mở, spec, glossary, docs và code, rồi in một dòng
  `🧭 <lệnh> — <lý do>` và chạy lệnh đó ngay. Không hỏi "Go?".
- Thứ tự ưu tiên: đổi yêu cầu/thiết kế của change đang mở → 📌 note · việc mới trong phạm vi change đó →
  `/hitl:plan <id> amend` hoặc `/hitl:tasks <id> update` · lỗi tái hiện được / logic nhỏ không cần ghi lại → `/hitl:tdd`
  · việc rất nhỏ nhưng nên có lock và trace → `/hitl:tasks quick` · còn lại → `/hitl:plan`. Phân vân thì chọn đường
  nặng hơn (plan > quick > tdd).
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
- Claude hỏi từng vòng, mỗi câu có sẵn đáp án gợi ý 💡. Gõ `y` để nhận hết, hoặc `Q2: <ý bạn>`.
- Plan tự dùng grilling, không cần gọi riêng `/hitl:grilling`.
- Ở gate đầu tiên plan gợi ý **key** cho change (2–5 chữ in hoa, vd. `PWR` cho feat-password-reset); gõ `y` để nhận
  hoặc `K <KEY>` để đổi. Mọi mã của change bắt đầu bằng key này: `PWR-R1` (yêu cầu), `PWR-R1.S1` (scenario),
  `PWR-D1` (quyết định thiết kế), `PWR-T1` (task), `PWR-T1.AC2` (tiêu chí nghiệm thu).
- Kết quả nằm trong `.hitl/changes/feat-password-reset/` (proposal, spec, design, tasks).

### Plan hỏi rộng và hỏi sâu
- **Độ phủ**: mỗi vòng có dòng `Độ phủ: Scope ✅ · Data ⚠️ · Edge ❌ · NFR — …`; Claude hỏi tiếp chỗ ❌/⚠️.
- **🔥** đánh dấu chỗ quan trọng mà còn mơ hồ: Claude hỏi sâu chỗ đó trước.
- **`deep <ID>`** (vd. `deep PWR-R3`): bạn tự chọn đào sâu (ví dụ cụ thể, 5 whys, edge case, pre-mortem, bảng quyết định…).
- **Điều kiện dừng**: plan chỉ xong khi mọi nhóm ✅ hoặc — và không còn `[NEEDS CLARIFICATION]` ở yêu cầu bắt buộc;
  muốn chốt sớm thì chọn "force" (được ghi lại).
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
📌 Note for feat-password-reset, refs PWR-R5.S2 (Unknown email reveals nothing)? (Y/n)
```
`y` → ghi note; task bị đụng tới sẽ không duyệt được cho tới khi note được xử lý. Áp dụng khi bạn sẵn sàng:
```
/hitl:plan feat-password-reset amend N-1      (xem delta + 🔁 Impact: mở lại test/skeleton nào)
/hitl:approve feat-password-reset reopen      (chỉ bạn gõ; wording thì chỉ xác nhận "không ảnh hưởng")
/hitl:test PWR-T12                               (test viết lại phải đỏ) → /hitl:approve PWR-T12 tests → implement → review → done
```
Không muốn áp dụng: `/hitl:approve <change> dismiss N-1 <lý do>`, `/hitl:approve <change> defer N-1 <change khác>`,
hoặc cho riêng một task đi tiếp: `/hitl:approve PWR-T12 tests --ack N-1`.

## 5b. Hai change cùng lúc (change tiên quyết)

Đang làm A thì thấy một việc quá lớn cho A (cần spec riêng, hơn 1 task, capability khác)? Tạo change riêng **trước** A:
```
/hitl:go thêm phí giao dịch --before feat-receipt     (hoặc /hitl:plan … --before feat-receipt; nhiều: --before a,b)
```
- A (`feat-receipt`) nhận note `source: feat-fee` → **toàn bộ A chờ**: không duyệt task, không implement, không
  archive A tới khi feat-fee archive. Plan, design, tasks, amend của A vẫn được.
- Lúc plan feat-fee, phần nào đổi requirement/decision của A thì Claude hỏi `📥 For feat-receipt: … → note? (Y/n/edit)`
  thay vì sửa file của A.
- feat-fee archive → A tự hết chờ; note spec/design từ feat-fee thì A phải nhận vào trước:
```
/hitl:archive feat-fee                        (in ra 🔓 / 📥 feat-receipt must take in N-2 …)
/hitl:plan feat-receipt amend N-2             (delta + 🔁 Impact)
/hitl:approve feat-receipt reopen N-3         (chỉ bạn, như mục 5a)
```
- Thôi chờ (thứ tự là quyết định của bạn) hoặc feat-fee bị bỏ: `/hitl:approve feat-receipt dismiss N-1 <lý do>`.
- Chồng lấn với change chưa liên kết (dù có `--before` hay không): plan tự chạy `hitl-index overlap <id>` và hỏi bạn ở
  cổng (`⚠️ Overlap with … (1/2/3)`). Change cha (đang chờ change này) hiện thành dòng `🔗 parent … — shared: …` ở vòng 1.
- Kiểm tra chồng lấn bất cứ lúc nào (vd. sau khi merge nhánh có change khác):
```
/hitl:overlap feat-fee feat-waive feat-report      (hoặc --with feat-waive,feat-report; không nêu = mọi change đang mở)
```
  Không có bằng chứng → `✅` rồi dừng. Có → một subagent chấm cả cụm, mỗi finding một dòng
  `⚠️ … → 1. adjust <một bên> · 2. both sides · 3. not an overlap`; trả lời kiểu `1 2, 2 3`. "both sides" ghi note
  `source:` vào change bị ảnh hưởng (change đó chờ tới khi change kia archive); "adjust" chỉ in `🎯 /hitl:plan <id> amend`.

## 6. Trả lời ở các cổng (⛔)

- `y` / `ok` = chọn gợi ý · `2` = chọn phương án 2 · hoặc gõ ý của bạn.
- `?` / `wait` / `hả` = giải thích lại rồi hỏi lại (không phải câu trả lời).
- Finding trong review: `accept F-1`, `reject F-2 <lý do>`, `defer F-3`, `amend F-4`; sửa: `/hitl:review PWR-T2 fix F-1`.

## 7. Tuỳ chọn

| Muốn | Gõ |
|---|---|
| Đẩy task lên Linear / Jira / GitHub | `/hitl:tickets init [linear\|jira\|github]` (một lần), sau đó `/hitl:tickets push` |
| Audit bảo mật cả change | `/hitl:review --security-audit feat-xxx` |
| "Grill" một ý tưởng bất kỳ | `/hitl:grilling` |
| Sửa nhỏ / làm nhanh theo TDD, không mở change | `/hitl:tdd <việc cần làm>` (chốt seam, rồi red→green từng test) |
| Không chắc nên dùng lệnh nào cho việc mới | `/hitl:go <mô tả>` (Claude chọn và chạy; `--plan`/`--quick`/`--tdd` để tự chọn) |

Commit: `/hitl:setup` đã tạo sẵn `.hitl/.gitignore`, cứ `git add .hitl`.
