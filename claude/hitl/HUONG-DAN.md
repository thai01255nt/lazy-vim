# Hướng dẫn sử dụng hitl (bản ngắn)

Đọc trang này là dùng được. `README.md` là tài liệu tra cứu chi tiết, chỉ mở khi cần.

## 0. Cài một lần

Trong Claude Code:
```
/plugin marketplace add ~/.config/nvim/claude
/plugin install hitl@thai-hitl
```
Mở lại Claude Code. Gõ `/hitl:` thấy danh sách lệnh là xong.

## 1. Mỗi project chạy một lần

```
/hitl:setup        # tạo thư mục .hitl/, dò lệnh test/lint, index code
/hitl:overview     # (nên làm) Claude đọc codebase, viết docs tổng quan
```
Claude hỏi xác nhận lệnh test/lint thì trả lời `y` nếu đúng.

## 2. Làm một feature: 3 bước chính

```
/hitl:plan thêm chức năng đặt lại mật khẩu qua email
```
Claude hỏi từng vòng (hành vi trước, thiết kế sau), mỗi câu có sẵn đáp án gợi ý. Gõ `y` để nhận gợi ý, hoặc trả lời
khác. Kết quả: file `.hitl/planning/feat-....md`.

```
/hitl:tasks
```
Claude chia feature thành các task T-1, T-2… kèm độ ưu tiên và mức rủi ro (low/high). Xem lại rồi `y`.

```
/hitl:flow
```
Lệnh này cho biết **bước tiếp theo nên gõ gì**. Không nhớ thì cứ gõ `/hitl:flow`.

## 3. Làm từng task

### Task rủi ro thấp (low): một lệnh
```
/hitl:implement T-1      # Claude tự viết skeleton + test + code
/hitl:review T-1         # review tự động; PASS thì tự done
```

### Task rủi ro cao (high): bạn duyệt từng bước
```
/hitl:skeleton T-2           # Claude viết khung hàm (chữ ký + mô tả), chưa có code
                             # → bạn mở file trong nvim, sửa nếu muốn
/hitl:approve T-2            # khoá khung đã duyệt
/hitl:test T-2               # Claude viết test (phải fail trước khi có code)
/hitl:approve T-2 tests      # khoá test
/hitl:implement T-2          # Claude code các hàm `@impl agent`;
                             # hàm `@impl manual` thì Claude đưa context, bạn tự viết
/hitl:review T-2             # review; finding quan trọng sẽ hỏi bạn
/hitl:approve T-2 done       # bạn chốt hoàn thành
```
Chỉ **bạn** gõ được `/hitl:approve`; Claude không tự duyệt được.

### Muốn để Claude làm hết rồi review sau
```
/hitl:implement T-2 --lane fast            # bỏ các cổng duyệt cho 1 task (vẫn review kỹ ở cuối)
/hitl:implement --feature feat-xxx         # chạy cả feature (tên file tasks/planning), dừng 1 lần ở cuối với report gộp
```

## 4. Khi bạn tự sửa code trong nvim

```
/hitl:sync
```
Claude so code với khung đã duyệt, hỏi bạn: duyệt lại / hoàn tác / để sau / sửa luôn spec cho khớp.

## 5. Trả lời ở các cổng (⛔)

Khi Claude dừng và đưa lựa chọn đánh số:
- `y` / `ok` = chọn phương án gợi ý
- `2` = chọn phương án 2
- hoặc gõ ý kiến của bạn

Với finding trong review (gõ ngay sau report): `accept F-1`, `reject F-2 <lý do>`, `defer F-3`.
Muốn Claude sửa finding: `/hitl:review T-2 fix F-1`.

## 6. Tuỳ chọn

| Muốn | Gõ |
|---|---|
| Đẩy task lên Linear | `/hitl:tickets init` (một lần), sau đó `/hitl:tickets push` |
| Audit bảo mật cả feature | `/hitl:review --security-audit feat-xxx.md` |
| Hỏi về bảo mật | `/hitl:security-audit <câu hỏi>` |

## 7. Commit gì lên git?

Không cần nghĩ: `/hitl:setup` đã tạo sẵn `.hitl/.gitignore`. Cứ `git add .hitl` như bình thường.
