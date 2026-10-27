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

## 2. Một feature, 4 bước

```
/hitl:plan thêm chức năng đặt lại mật khẩu qua email     # LÀM GÌ, VÌ SAO (cho BA/PO đọc được)
/hitl:design feat-password-reset                         # LÀM THẾ NÀO (cho dev); change nhỏ thì tự bỏ qua
/hitl:tasks feat-password-reset                          # chia task T-1, T-2… (low/high risk)
/hitl:flow                                               # không nhớ bước tiếp? gõ cái này
```
- Claude hỏi từng vòng, mỗi câu có sẵn đáp án gợi ý 💡. Gõ `y` để nhận hết, hoặc `Q2: <ý bạn>`.
- Plan tự dùng grilling, không cần gọi riêng `/hitl:grilling`.
- Kết quả nằm trong `.hitl/changes/feat-password-reset/` (proposal, spec, design, tasks).

### Plan hỏi rộng và hỏi sâu
- **Độ phủ**: mỗi vòng có dòng `Độ phủ: Scope ✅ · Data ⚠️ · Edge ❌ · NFR — …`; Claude hỏi tiếp chỗ ❌/⚠️.
- **🔥** đánh dấu chỗ quan trọng mà còn mơ hồ: Claude hỏi sâu chỗ đó trước.
- **`deep <ID>`** (vd. `deep ACC-R3`): bạn tự chọn đào sâu (ví dụ cụ thể, 5 whys, edge case, pre-mortem, bảng quyết định…).
- **Điều kiện dừng**: plan chỉ xong khi mọi nhóm ✅ hoặc — và không còn `[NEEDS CLARIFICATION]` ở yêu cầu bắt buộc;
  muốn chốt sớm thì chọn "force" (được ghi lại).
- **Viết theo chuẩn** (`shared/formats/`): mỗi yêu cầu một `SHALL`, không từ mơ hồ ("nhanh", "dễ dùng", "v.v."); NFR có
  `Fit:` đo được. `spec validate` chỉ cảnh báo, Claude tự sửa câu chữ hoặc hỏi bạn con số.

## 3. Làm từng task

### Task rủi ro thấp (low): một lệnh
```
/hitl:implement T-1      # Claude tự viết skeleton + test + code
/hitl:review T-1         # review tự động; PASS thì tự done
```

### Task rủi ro cao (high): bạn duyệt từng bước (mặc định)
```
/hitl:skeleton T-2           # khung hàm (chữ ký + mô tả), chưa có code → bạn xem/sửa trong nvim
/hitl:approve T-2            # khoá khung
/hitl:test T-2               # Claude viết test (phải fail trước khi có code)
/hitl:approve T-2 tests      # khoá test
/hitl:implement T-2          # Claude code hàm `@impl agent`; hàm `@impl manual` là của bạn
/hitl:review T-2             # finding quan trọng sẽ hỏi bạn
/hitl:approve T-2 done       # bạn chốt
```
Chỉ **bạn** gõ được `/hitl:approve`.

### Để Claude build hết rồi review một lần (nâng cao)
```
/hitl:implement T-2 --lane fast                          # một task, không gate, review ở cuối
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

## 6. Trả lời ở các cổng (⛔)

- `y` / `ok` = chọn gợi ý · `2` = chọn phương án 2 · hoặc gõ ý của bạn.
- Finding trong review: `accept F-1`, `reject F-2 <lý do>`, `defer F-3`, `amend F-4`; sửa: `/hitl:review T-2 fix F-1`.

## 7. Tuỳ chọn

| Muốn | Gõ |
|---|---|
| Đẩy task lên Linear | `/hitl:tickets init` (một lần), sau đó `/hitl:tickets push` |
| Audit bảo mật cả change | `/hitl:review --security-audit feat-xxx` |
| "Grill" một ý tưởng bất kỳ | `/hitl:grilling` |

Commit: `/hitl:setup` đã tạo sẵn `.hitl/.gitignore`, cứ `git add .hitl`.
