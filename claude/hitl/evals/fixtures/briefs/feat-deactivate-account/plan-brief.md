<!-- hitl brief file. Answer on the `>` line under each question (more lines: each starts with `>`), save,
     then run the command in the `next:` line. Y = take the 💡 recommendation · Y on the "Accept all" line (from
     round 2) = take the 💡 of every question of the round you left empty, except questions marked
     "(needs its own Y)": they act outside this brief and take only a Y under themselves · ? or "don't know" =
     Claude recommends and asks again · n + what you want instead = that is your answer · n + "later" = postponed ·
     n alone = Claude asks what it should be instead · a question or a doubt instead of an answer = Claude answers
     it here (💬) and asks again · deep <ID|topic> = dig deeper · done = stop asking. Vietnamese works too:
     được / đồng ý / ừ · không biết / chưa biết · không / để sau · xong.
     Notes (the last block of each round): anything the questions missed, or a change to an earlier answer
     ("Q5: …" / "sửa Q5: …"). Description is read once, at the first run; after that new information goes into the
     Notes of the open round. Lines that start with → or 💬 are Claude's; leave them as they are. -->

# Plan brief — feat-deactivate-account

> change: feat-deactivate-account | key: FDCA | kind: plan | status: open | round: 1 | updated: 2026-11-19
> next: answer the `>` lines, then run /hitl:plan feat-deactivate-account

## Description

Cho phép admin (nhân viên hỗ trợ) vô hiệu hoá tài khoản người dùng; tài khoản bị vô hiệu hoá thì không đăng nhập được nữa.

## Round 1

### Q0 Change id and key: `feat-deactivate-account` / `FDCA` — keep? (needs its own Y)

Mọi mã của change bắt đầu bằng key này (FDCA-R1, FDCA-T1). Đổi id hoặc key được cho tới khi change có task đầu tiên.
💡 Recommended: keep `feat-deactivate-account` / `FDCA`.

> Y

### Q1 [R] Việc này giải quyết vấn đề gì, cho ai?

_e.g. "tài khoản spam vẫn đăng nhập được cho tới khi dev sửa dữ liệu"_

> Tài khoản lừa đảo hoặc spam vẫn đăng nhập được; nhân viên hỗ trợ phải nhờ dev sửa dữ liệu, mất cả ngày.

### Q2 [R] Điều gì bắt đầu việc này, và kết quả là gì?

_e.g. "nhân viên hỗ trợ mở tài khoản, bấm Vô hiệu hoá, nhập lý do; tài khoản bị khoá ngay"_

> Nhân viên hỗ trợ mở tài khoản, bấm "Vô hiệu hoá" và nhập lý do. Từ lúc đó người dùng không đăng nhập được.
> Nhân viên hỗ trợ cũng có thể kích hoạt lại.

### Q3 [R] Ai được làm việc này, và ai không được?

_e.g. "nhân viên hỗ trợ và admin; người dùng thường thì không"_

> Nhân viên hỗ trợ và admin. Không ai được tự vô hiệu hoá tài khoản admin.

### Q4 [R] Dữ liệu nghiệp vụ nào liên quan, và nó thay đổi thế nào theo thời gian?

_e.g. "tài khoản có trạng thái active/deactivated; giữ lý do và người làm"_

> Tài khoản có trạng thái đang hoạt động / bị vô hiệu hoá. Giữ lý do, ai làm và lúc nào. Không xoá dữ liệu.

### Q5 [R] Có quy tắc và giới hạn nào? Cho con số.

_e.g. "lý do bắt buộc, tối thiểu 10 ký tự"_

> không biết

### Q6 [R] Điều gì có thể sai, và khi đó phải xảy ra gì?

_e.g. "tài khoản đã bị vô hiệu hoá rồi → báo, không làm gì"_

> Nếu người đó đang đăng nhập thì sao? Có cần đăng xuất họ ngay không?

### Q7 [R] Hệ thống hay người nào khác cần được báo?

_e.g. "người dùng nhận email báo tài khoản bị khoá"_

>

### Q8 [R] Yêu cầu chất lượng nào quan trọng? Cho con số.

_e.g. "có hiệu lực trong vòng 1 phút"_

> Có hiệu lực ngay, trong vòng 1 phút.

### Q9 [R] Điều gì nằm ngoài phạm vi?

_e.g. "không xoá tài khoản; không tự động khoá"_

> Không xoá tài khoản. Không tự động khoá theo số lần đăng nhập sai.

### Q10 [R] Làm sao biết việc này thành công?

_e.g. "nhân viên hỗ trợ khoá được tài khoản spam trong 5 phút, không cần dev"_

> Nhân viên hỗ trợ khoá được tài khoản spam trong 5 phút mà không cần dev.

### Q11 [T] "Tài khoản" trong mô tả là _Account_ của glossary (định danh của một người, theo email) chứ không phải "user record"?

_e.g. "đúng, là Account"_

> đúng

### Notes — anything the questions missed, or a change to an earlier answer

> sửa Q3: chỉ admin được kích hoạt lại tài khoản; nhân viên hỗ trợ chỉ vô hiệu hoá.
