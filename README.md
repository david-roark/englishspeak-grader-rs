# 🎓 EnglishSpeak Grader

Ứng dụng desktop đa nền tảng (**Windows / macOS / Linux**) hỗ trợ giáo viên tiếng Anh chấm bài nói
qua video bằng **Google Gemini AI** — đóng gói gọn nhẹ trên nền **Rust + Tauri v2**, chạy cục bộ
ngay trên máy của bạn.

---

## ✨ Tính năng chính

- **Chấm bài nói qua video (tối đa 2 GB):** Hỗ trợ thuyết trình, hỏi–đáp, đối thoại, thảo luận nhóm;
  trả về bảng điểm chi tiết, điểm mạnh/điểm yếu, gợi ý cải thiện và hướng luyện tập.
- **5 Rubric chuẩn + Rubric tùy chỉnh:** Tích hợp sẵn **IELTS Speaking, CEFR, Cambridge (KET/PET),
  TOEFL Speaking, Lớp học chung (thang 10)**; hỗ trợ tạo mới hoặc **nhân bản (Clone)** để tùy biến.
- **Nhận diện & gán lại tên học sinh:** Tự lấy tên từ phần giới thiệu trong video; nếu không rõ,
  đặt nhãn tạm (`Học sinh 1/2...`) để giáo viên sửa lại trực tiếp trên giao diện.
- **Dẫn chứng kèm mốc thời gian:** Bấm vào timestamp trong kết quả để tua nhanh video đến đúng
  đoạn học sinh nói.
- **Nén video & tách MP3:** Tích hợp `ffmpeg` giúp nén gọn video trước khi tải lên (4 mức) và tách
  MP3 tối ưu cho giọng nói (3 mức) kèm thanh tiến trình thực.
- **Lưu trữ & Xuất báo cáo:** Lưu toàn bộ lịch sử vào SQLite cục bộ (tìm kiếm theo tên học sinh,
  video, rubric) và xuất file Excel (`.xlsx`) có định dạng sẵn.
- **Nhận xét linh hoạt:** Hỗ trợ **Tiếng Việt** (mặc định), **English**, hoặc **Song ngữ**; tùy
  chỉnh prompt trực tiếp trong app.

---

## 🔑 Lấy Gemini API Key miễn phí

1. Truy cập [Google AI Studio](https://aistudio.google.com) và đăng nhập tài khoản Google.
2. Bấm **Get API key** → **Create API key** và sao chép key.
3. Mở app → dán vào ô **Gemini API Key** (hoặc lưu cố định trong tab **Cài đặt & Prompt**).

> **Mẹo tiết kiệm quota Free Tier:** Dùng model mặc định **Gemini Flash Lite** (nhiều lượt miễn
> phí nhất mỗi ngày) và giữ **Cấp độ quan sát hình ảnh = Thấp** cho video dài để tránh vượt giới
> hạn token/phút (TPM). Bấm **🔄 Tải model** trên thanh tiêu đề để lấy danh sách model theo tài
> khoản của bạn.

---

## 🚀 Cài đặt & Sử dụng

### 1. Tải bản phát hành

Tải bộ cài tương ứng với hệ điều hành tại trang **Releases** của dự án:

| Hệ điều hành | Định dạng bộ cài | Ghi chú lần đầu mở app |
| :--- | :--- | :--- |
| **Windows** | `.msi` hoặc `.exe` | Nếu SmartScreen cảnh báo, chọn **More info → Run anyway** |
| **macOS** | `.dmg` (Apple Silicon / Intel) | Nếu báo nhà phát triển chưa xác định: chuột phải vào app → **Open → Open** |
| **Linux** | `.AppImage` hoặc `.deb` | Với `.AppImage`: cấp quyền chạy (`chmod +x *.AppImage`) trước khi mở |

> **Lưu ý về FFmpeg:** Nếu dùng bản chưa nhúng sẵn `ffmpeg`, hãy cài `ffmpeg` vào hệ thống (`PATH`)
> hoặc chọn đường dẫn tới file `ffmpeg` trong tab **Cài đặt & Prompt** để bật tính năng nén video
> và tách MP3.

### 2. Quy trình chấm bài nhanh

1. Mở tab **Chấm bài** → chọn file video (`.mp4`, `.mov`, `.webm`, `.avi`, `.mkv`...).
2. *(Tùy chọn)* Mở mục **Nén video** để giảm dung lượng trước khi upload.
3. Chọn **Rubric**, **Loại bài nói**, **Ngôn ngữ nhận xét** (nhập tên học sinh hoặc yêu cầu bổ sung
   nếu cần).
4. Bấm **Chấm điểm bằng AI** → xem bảng điểm, gán lại tên học sinh nếu cần và bấm **Xuất lại
   Excel** / **Lưu thành...**.
5. Xem lại hoặc tìm kiếm các lần chấm cũ trong tab **Lịch sử**.

---

## 💾 Lưu trữ & Bảo mật

- **Chế độ dữ liệu:**
  - **Mặc định (App cài đặt):** Lưu `grader.db` và file xuất tại thư mục dữ liệu chuẩn của hệ điều
    hành (`%LOCALAPPDATA%\englishspeak\grader` trên Windows, `~/Library/Application Support/com.englishspeak.grader`
    trên macOS, `~/.local/share/com.englishspeak.grader` trên Linux).
  - **Chế độ Portable:** Nếu đặt sẵn thư mục `data/` cạnh file chạy, app sẽ đọc/ghi dữ liệu
    (SQLite `data/grader.db` chứa cả API key, rubric, lịch sử) ngay tại thư mục đó.
- **Quyền riêng tư:** App chạy hoàn toàn cục bộ. API key và video chỉ gửi trực tiếp tới **Google
  Gemini** để chấm điểm; video trên Gemini File API tự động hết hạn sau 48 giờ (app giữ cache 47 giờ
  trong phiên để chấm lại nhanh mà không cần upload lại).

---

## 🛠️ Phát triển & Đóng góp

- Muốn thiết lập môi trường dev, chạy test hoặc đóng góp mã nguồn: xem [CONTRIBUTING.md](CONTRIBUTING.md).
- Quy trình nâng phiên bản và phát hành bộ cài đa nền tảng: xem [RELEASING.md](RELEASING.md).
- Giấy phép sử dụng: [LICENSE](LICENSE).
