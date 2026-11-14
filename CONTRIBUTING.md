# 🤝 Hướng dẫn Phát triển & Đóng góp

Tài liệu này dành cho lập trình viên hoặc người dùng muốn tự build từ mã nguồn, kiểm thử hoặc gửi đóng góp cho **EnglishSpeak Grader** (phiên bản Rust + Tauri v2).

> **Lưu ý về bản quyền & giấy phép:** Dự án được phát hành theo [Personal & Non-Commercial Use License (All Rights Reserved)](LICENSE). Bạn chỉ được phép tải, tự build và chỉnh sửa phục vụ **mục đích cá nhân, phi thương mại**. Không được phép phân phối lại bản fork/bản dựng hoặc sử dụng cho mục đích thương mại nếu chưa có văn bản cho phép từ chủ sở hữu bản quyền.

---

## 🧱 Kiến trúc & Cấu trúc mã nguồn

```text
englishspeak-grader-rs/
├── Cargo.toml                  # Cargo workspace root (chứa crates/grader-core)
├── crates/
│   └── grader-core/            # Thư viện lõi thuần Rust (độc lập UI)
│       ├── src/
│       │   ├── schemas.rs      # DTO kết quả & JSON Schema cho Gemini
│       │   ├── rubrics.rs      # 5 rubric chuẩn & định dạng Markdown
│       │   ├── prompts.rs      # PromptProfile & builder an toàn
│       │   ├── database.rs     # SQLite chuẩn hóa (rusqlite bundled, WAL)
│       │   ├── export.rs       # Xuất Excel (.xlsx) bằng rust_xlsxwriter
│       │   ├── gemini.rs       # Gemini REST API v1beta & streaming upload
│       │   ├── media.rs        # FFmpeg resolver, nén video & tách MP3
│       │   └── paths.rs        # Đường dẫn Portable / OS DataDir
│       └── tests/              # Bộ integration tests (wiremock, calamine, ffmpeg)
├── src-tauri/                  # Lớp desktop shell Tauri v2 (IPC commands, events)
├── ui/                         # Frontend Vite + React + TypeScript + Tailwind CSS
├── assets/                     # Icon gốc (.png, .ico)
└── .github/workflows/          # CI kiểm thử & build đa nền tảng
```

---

## 🛠️ Thiết lập môi trường phát triển

### Yêu cầu chung

- **Rust** toolchain ổn định (khuyến nghị cài qua [rustup](https://rustup.rs/)).
- **Node.js** (>= 20) và `npm`.
- **FFmpeg** trong `PATH` (tùy chọn, dùng cho test thật và tính năng media khi chạy dev).
- **Tauri CLI v2**:
  ```bash
  cargo install tauri-cli --version "^2"
  ```

### Yêu cầu bổ sung theo hệ điều hành

- **Linux (Ubuntu / Debian):**
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf
  ```
- **Windows:** Cài **Visual Studio Build Tools** (C++ workload) và **WebView2** (có sẵn trên
  Windows 10/11).
- **macOS:** Cài **Xcode Command Line Tools** (`xcode-select --install`).

### Cài đặt & Chạy thử ở chế độ Development

1. Cài dependencies cho Frontend:
   ```bash
   cd ui && npm install && cd ..
   ```
2. Khởi chạy desktop app (API key có thể dán trực tiếp trên giao diện hoặc lưu trong **Cài đặt & Prompt** vào SQLite):
   ```bash
   cargo tauri dev
   ```

---

## 🧪 Kiểm thử & Kiểm tra chất lượng code

Chạy nhanh toàn bộ kiểm tra bằng 1 lệnh duy nhất:

```bash
./scripts/check.sh
```

Hoặc chạy từng bước trước khi tạo Pull Request:

1. **Kiểm tra format Rust (`rustfmt`):**
   ```bash
   cargo fmt --manifest-path Cargo.toml --all -- --check
   cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
   ```
2. **Lint Rust bằng Clippy (không chấp nhận warning):**
   ```bash
   cargo clippy -p grader-core --all-targets -- -D warnings
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   ```
3. **Unit & Integration tests (`grader-core` + `src-tauri`):**
   ```bash
   cargo test --workspace
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
4. **Type-check, ESLint, Vitest & Build Frontend:**
   ```bash
   npm --prefix ui run check
   # hoặc chạy lẻ: typecheck | lint | test | build
   ```
5. **Kiểm tra build Tauri không đóng gói installer:**
   ```bash
   cargo tauri build --debug --no-bundle
   ```

---

## 🎨 Quy chuẩn Code & Commit

- **Rust:** Format bằng `cargo fmt`; tuân thủ cảnh báo của `cargo clippy`; giữ toàn bộ logic nghiệp
  vụ trong `crates/grader-core` và không đưa chi tiết UI vào core.
- **TypeScript / React:** Bật `strict`, không để biến/import thừa (`noUnusedLocals`,
  `noUnusedParameters`), toàn bộ lời gọi IPC đi qua `ui/src/lib/api.ts`.
- **Commit Message:** Khuyến khích theo chuẩn **Conventional Commits** (`feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`).

---

## 📬 Quy trình gửi Pull Request

1. Fork repository (chỉ để phát triển đóng góp cá nhân, không phân phối lại thương mại) và tạo branch mới (`feature/<ten>` hoặc `bugfix/<ten>`).
2. Thực hiện thay đổi kèm test case mới (nếu thêm tính năng hoặc sửa bug).
3. Đảm bảo `./scripts/check.sh` (hoặc `cargo test --workspace`, `cargo clippy`, `npm --prefix ui run check`) đều pass.
4. Tạo Pull Request mô tả rõ phạm vi thay đổi và kết quả kiểm tra. Khi gửi Pull Request, bạn xác nhận phần mã đóng góp do bạn tự viết hoặc có quyền đóng góp và đồng ý tích hợp vào dự án theo điều khoản của [LICENSE](LICENSE).
