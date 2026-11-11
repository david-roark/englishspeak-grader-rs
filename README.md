# 🎓 EnglishSpeak Grader

[![CI](https://github.com/david-roark/englishspeak-grader-rs/actions/workflows/ci.yml/badge.svg)](https://github.com/david-roark/englishspeak-grader-rs/actions/workflows/ci.yml)
[![Build & Release](https://github.com/david-roark/englishspeak-grader-rs/actions/workflows/release.yml/badge.svg)](https://github.com/david-roark/englishspeak-grader-rs/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Ứng dụng desktop đa nền tảng (**Windows / macOS / Linux**) hỗ trợ giáo viên tiếng Anh chấm bài nói qua video bằng **Google Gemini AI** — xây dựng trên nền **Rust + Tauri v2 + React**, lưu trữ cục bộ hoàn toàn bằng **SQLite**.

---

## ✨ Tính năng chính

- **Chấm bài nói qua video (tối đa 2 GB):** Hỗ trợ thuyết trình cá nhân, hỏi–đáp, đối thoại, thảo luận nhóm; trả về điểm từng tiêu chí, xếp loại tổng thể, điểm mạnh/điểm yếu, gợi ý cải thiện và hướng luyện tập.
- **5 Rubric chuẩn + Rubric tùy chỉnh chuyên sâu:** Tích hợp sẵn **IELTS Speaking, CEFR, Cambridge (KET/PET), TOEFL Speaking, Lớp học chung (thang 10)**; cho phép tạo mới hoặc **nhân bản (Clone)** với:
  - Hai chế độ tính điểm: **Cộng tổng** hoặc **Trung bình trọng số quy thang điểm** (có bước làm tròn như `0.5`, `0.25`, `0.1`).
  - **Trọng số** cho từng tiêu chí và **mô tả các mức đạt** (*Tốt / Đạt / Cần cố gắng*).
  - **Xem trước prompt theo rubric** ngay khi soạn thảo.
- **Cấu hình Prompt đa hồ sơ & hiệu chỉnh AI:** Quản lý nhiều **Prompt Profile** (chuyển nhanh theo lớp/bài thi), chỉnh **Temperature**, **Độ khắt khe (Strictness)**, quy tắc chấm và **xem trước toàn bộ `System Instruction` + `User Prompt`** sẽ gửi cho Gemini.
- **Nhận diện & gán lại tên học sinh:** Tự lấy tên từ phần giới thiệu trong video; nếu không rõ, đặt nhãn tạm (`Học sinh 1/2...`) để giáo viên sửa trực tiếp trên giao diện.
- **Xem trước media & tua theo dẫn chứng:** Phát video/audio cục bộ qua HTTP Byte-Range server nội bộ bảo mật theo phiên (có fallback mở trình phát hệ thống nếu gặp codec đặc thù); bấm vào timestamp trong kết quả để tua video đến đúng đoạn học sinh nói.
- **Xưởng Media tích hợp (`FFmpeg`):** Nén video (4 mức), tách MP3 tối ưu giọng nói (3 mức), cắt đoạn media (`trim`), tắt tiếng video (`mute`), hiển thị tiến trình thực và chọn nơi lưu linh hoạt.
- **Lịch sử & Xuất báo cáo:** Chuyển đổi giữa chế độ xem **Danh sách** và **Bảng tổng hợp**, tìm kiếm nhanh, xuất **Excel (`.xlsx`)** có định dạng sẵn và sao chép báo cáo **Markdown**.
- **Tùy biến giao diện:** Hỗ trợ chuyển bảng màu giao diện và điều chỉnh **kích thước chữ** cho dễ đọc khi giảng dạy/chấm bài lâu.

---

## 🔑 Lấy Gemini API Key miễn phí

1. Truy cập [Google AI Studio](https://aistudio.google.com) và đăng nhập tài khoản Google.
2. Bấm **Get API key** → **Create API key** và sao chép key.
3. Mở app → dán vào ô **Gemini API Key** trên thanh cấu hình nhanh hoặc lưu cố định vào SQLite trong tab **Cài đặt & Prompt**.

> **Mẹo tiết kiệm quota Free Tier:** Dùng model mặc định **Gemini Flash Lite** (nhiều lượt miễn phí nhất mỗi ngày) và giữ **Cấp độ quan sát hình ảnh = Thấp** cho video dài để tránh vượt giới hạn token/phút (TPM). Bấm **Tải model** trên thanh tiêu đề để lấy danh sách model theo tài khoản của bạn.

---

## 🚀 Cài đặt & Sử dụng

### 1. Tải bản phát hành

Tải bộ cài tương ứng với hệ điều hành tại trang [**Releases**](https://github.com/david-roark/englishspeak-grader-rs/releases):

| Hệ điều hành | Định dạng bộ cài | Ghi chú lần đầu mở app |
| :--- | :--- | :--- |
| **Windows** | `.msi` hoặc `.exe` | Nếu SmartScreen cảnh báo, chọn **More info → Run anyway** |
| **macOS** | `.dmg` (Apple Silicon / Intel) | Nếu báo nhà phát triển chưa xác định: chuột phải vào app → **Open → Open** |
| **Linux** | `.AppImage` hoặc `.deb` | Với `.AppImage`: cấp quyền chạy (`chmod +x *.AppImage`) trước khi mở |

> **Về FFmpeg:** Các bản cài đặt phát hành trên [**Releases**](https://github.com/david-roark/englishspeak-grader-rs/releases) đã **nhúng sẵn `ffmpeg`**, có thể dùng ngay các tính năng nén video, tách MP3, cắt đoạn và tắt tiếng mà không cần cài thêm. (Nếu tự build không kèm sidecar hoặc muốn dùng bản riêng, bạn có thể trỏ đường dẫn `ffmpeg` trong tab **Cài đặt & Prompt**.)

### 2. Quy trình chấm bài nhanh

1. Mở tab **Chấm bài** → chọn hoặc kéo-thả file video (`.mp4`, `.mov`, `.webm`, `.avi`, `.mkv`...).
2. *(Tùy chọn)* Nén nhanh video ngay trong màn hình chấm hoặc xử lý trước ở tab **Xưởng Media**.
3. Chọn **Rubric**, **Loại bài nói**, **Ngôn ngữ nhận xét** và **Prompt Profile** (hoặc bấm xem trước prompt nếu cần kiểm tra).
4. Bấm **Chấm điểm bằng AI** → xem bảng điểm, bấm vào timestamp để đối chiếu video, sửa tên học sinh nếu cần và bấm **Xuất lại Excel** / **Lưu thành...**.
5. Theo dõi và tìm kiếm các bài đã chấm trong tab **Lịch sử** (dạng danh sách hoặc bảng).

---

## 💾 Lưu trữ & Bảo mật

- **Chế độ dữ liệu:**
  - **Mặc định (App cài đặt):** Lưu `grader.db` và file xuất tại thư mục dữ liệu chuẩn của hệ điều hành (`%LOCALAPPDATA%\englishspeak\grader` trên Windows, `~/Library/Application Support/com.englishspeak.grader` trên macOS, `~/.local/share/com.englishspeak.grader` trên Linux).
  - **Chế độ Portable:** Tạo thư mục `data/` đặt cạnh file chạy; app sẽ tự động đọc/ghi toàn bộ dữ liệu (`data/grader.db` gồm API key, cài đặt, rubric, prompt profile, lịch sử) và xuất file tại thư mục đó.
- **Quyền riêng tư:** App chạy hoàn toàn cục bộ trên máy. API key và video chỉ gửi trực tiếp tới **Google Gemini** để chấm điểm; video trên Gemini File API tự động hết hạn sau 48 giờ (app giữ cache 47 giờ trong phiên để chấm lại nhanh mà không cần upload lại).

---

## 🛠️ Phát triển & Kiểm tra chất lượng

- Kiểm tra nhanh toàn bộ format, lint (`clippy` & `eslint`), typecheck, unit/integration tests và build:
  ```bash
  ./scripts/check.sh
  ```
- Thiết lập môi trường dev, kiến trúc workspace và quy trình PR: xem [CONTRIBUTING.md](CONTRIBUTING.md).
- Quy trình nâng phiên bản và phát hành bộ cài đa nền tảng qua GitHub Actions: xem [RELEASING.md](RELEASING.md).
- Giấy phép sử dụng: [LICENSE](LICENSE).
