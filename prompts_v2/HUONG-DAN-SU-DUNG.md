# Hướng Dẫn Sử Dụng - Prompt System Tối Ưu

## 🚀 Bắt Đầu Cực Đơn Giản

### Setup Cơ Bản (Khuyến Nghị)
Chỉ cần **1 file duy nhất**:
```bash
cp ./prompts_v2/core-rules.md ~/.claude/CLAUDE.md
```
**Kết quả**: Hệ thống hoàn chỉnh trong 1 file, 1,330 tokens

### Setup Đầy Đủ (Tùy Chọn)
Nếu muốn tất cả tính năng advanced:
```bash
# Core system
cp ./prompts_v2/core-rules.md ~/.claude/CLAUDE.md

# Advanced guides
mkdir -p ~/.claude/commands/mode-details
cp ./prompts_v2/mode-details/* ~/.claude/commands/mode-details/
```
**Kết quả**: Tính năng đầy đủ, 11,580 tokens

## 🎯 Cách Sử Dụng

### Với Setup Cơ Bản (1 file)
1. **Hỏi bình thường** - LLM tự detect request type và mode
2. **Cho basic requests**: Hoạt động ngay với core intelligence  
3. **Cho advanced requests**: LLM sẽ báo và yêu cầu load guide
4. **Bạn quyết định**: Load guide hoặc tiếp tục basic

### Với Setup Đầy Đủ (9 files)
1. **Tất cả hoạt động ngay** - không cần load thêm
2. **LLM tự load guides** khi cần thiết
3. **Độ phức tạp progressive** dựa trên yêu cầu
4. **Không cần can thiệp thủ công**

## 📋 Khi Nào LLM Báo Thiếu Guide?

### Message Điển Hình:
```
🔍 Detected: implement mode (basic level only)
⚠️ Missing: Advanced implementation intelligence  
📊 Without detailed guide: No smart method detection, quality frameworks
⚡ REQUIRED ACTION: Please load mode-details/implement-guide.md first.
🚫 CANNOT PROCEED without guide prompt.
```

### Lựa Chọn Của Bạn:
- **Load guide**: Copy file được yêu cầu, ask lại
- **Tiếp tục basic**: Nói "proceed basic" (tính năng hạn chế)
- **Simplify request**: Đơn giản hóa để phù hợp basic capabilities

## 🎭 Các Mode Chính

| Mode | Dùng Khi Nào | Basic Đủ? | Guide Cần Load |
|------|--------------|-----------|----------------|
| **Knowledge** | Hỏi khái niệm, giải thích | ✅ Hoàn toàn đủ | Không cần |
| **Coding-Ask** | Phân tích code có sẵn | ✅ Hoàn toàn đủ | Không cần |
| **Project Overview** | Tạo docs dự án | ⚠️ Hạn chế | `project-overview-guide.md` |
| **Planning** | Brainstorm architecture | ⚠️ Hạn chế | `planning-guide.md` |
| **Tasks** | Breakdown implementation | ⚠️ Hạn chế | `tasks-guide.md` |
| **Implement** | Code logic phức tạp | ❌ Không đủ | `implement-guide.md` |
| **Standalone** | Quick method fixes | ⚠️ Hạn chế | `standalone-implement-guide.md` |

## 💡 Chiến Lược Sử Dụng

### Người Mới / Học Tập
- **Chỉ dùng setup cơ bản** (1 file)
- **Đọc message từ LLM** để biết khi nào cần advanced
- **Thử basic trước** - nhiều khi đủ rồi

### Developer Cá Nhân
- **Setup cơ bản** + load guides theo nhu cầu
- **Bookmark guides** hay dùng cho access nhanh
- **Progressive loading** - thêm dần khi cần

### Team / Công Ty
- **Setup đầy đủ** cho consistency
- **Standardize guides** - team cùng dùng set guides giống nhau
- **Document workflows** - note guides nào cho từng loại project

## 📁 Cấu Trúc Sau Optimization

### Setup Cơ Bản
```
~/.claude/
└── CLAUDE.md (997 words ≈ 1,330 tokens)
```

### Setup Đầy Đủ  
```
~/.claude/
├── CLAUDE.md (997 words ≈ 1,330 tokens)
└── commands/mode-details/
    ├── shared-patterns.md (203 words ≈ 270 tokens)
    ├── planning-guide.md (691 words ≈ 920 tokens)
    ├── tasks-guide.md (390 words ≈ 520 tokens)
    ├── implement-guide.md (952 words ≈ 1,270 tokens)
    ├── standalone-implement-guide.md (968 words ≈ 1,290 tokens)
    ├── project-overview-guide.md (534 words ≈ 710 tokens)
    ├── skeleton-guide.md (703 words ≈ 940 tokens)
    └── benefit-messages.md (376 words ≈ 500 tokens)
```

## ⚡ Performance & Lợi Ích

### Token Usage
- **Setup cơ bản**: 1,330 tokens
- **Setup đầy đủ**: 11,580 tokens  
- **Typical usage**: 1,330-3,000 tokens (core + 1-2 guides)

### So Sánh Với Trước
- **Token reduction**: 10.8% giảm tổng tokens
- **Setup simplification**: 1 file thay vì 3 files required
- **Template redundancy**: Loại bỏ hoàn toàn
- **Function preservation**: Giữ 100% tính năng

### Cải Tiến Đặc Biệt
- **Planning mode**: Hierarchical brainstorming thật sự (Level 1 → Level 2)
- **Real-time updates**: Files update sau mỗi discussion
- **Universal Stop Protocol**: Consistent user interaction
- **Pattern centralization**: Tái sử dụng patterns hiệu quả

## 🆘 Troubleshooting

### LLM Không Hiểu Request
- **Check**: Đã setup core-rules.md chưa?
- **Try**: Dùng keywords rõ ràng (implement, planning, analyze...)
- **Debug**: Hỏi "what request type is this?"

### LLM Yêu Cầu Load Guide Nhưng Tôi Không Muốn
- **Say**: "proceed basic" hoặc "continue without guide"
- **Result**: Limited functionality nhưng vẫn work
- **Alternative**: Simplify request để fit basic level

### Quá Nhiều Guides Cần Load
- **Strategy**: Chỉ load guides cho modes hay dùng
- **Tip**: Load 1 guide, test, rồi load thêm nếu cần
- **Remember**: Basic level đủ cho 80% use cases

## 📈 Best Practices

### Efficient Usage
1. **Start minimal**: Setup cơ bản trước
2. **Load on-demand**: Chỉ load khi LLM yêu cầu
3. **Keep sessions**: Reuse loaded guides cho multiple requests  
4. **Document patterns**: Note guides nào cần cho từng project type

### Optimization Tips
1. **Understand levels**: Biết khi nào cần basic vs advanced
2. **Read stop messages**: LLM explain rõ missing capabilities
3. **Progressive enhancement**: Start basic → thêm intelligence dần
4. **Context efficiency**: Đừng load guides không cần thiết

## 🎉 Tóm Tắt

**Optimized System = Đơn Giản + Mạnh Mẽ**
- **Đơn giản**: 1 file core đủ cho đa số việc
- **Mạnh mẽ**: Advanced guides khi cần full intelligence
- **Hiệu quả**: 10.8% token reduction, setup đơn giản hóa
- **Linh hoạt**: Bạn control complexity level

**Bottom line**: Setup 1 file core, hỏi bình thường, LLM sẽ guide khi cần advanced!