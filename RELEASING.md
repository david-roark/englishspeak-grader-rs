# 🏷️ Hướng dẫn Đóng gói & Phát hành (Maintainer)

Tài liệu này mô tả quy trình đóng gói thủ công và phát hành tự động đa nền tảng (**Windows / macOS /
Linux**) dành riêng cho **chủ sở hữu bản quyền / Maintainer được ủy quyền** của **EnglishSpeak Grader**.

> **Lưu ý bản quyền:** Theo [LICENSE](LICENSE), chỉ chủ sở hữu bản quyền (hoặc người được ủy quyền bằng văn bản) mới có quyền phân phối hoặc phát hành bộ cài chính thức. Bên thứ ba không được phép đóng gói lại, bán hoặc phân phối lại sản phẩm khi chưa được phép.

---

## 1. Cập nhật số phiên bản

Khi chuẩn bị phát hành phiên bản mới (theo [Semantic Versioning](https://semver.org/), ví dụ
`0.2.0`), cần đồng bộ version tại các file sau:

1. `Cargo.toml` (`[workspace.package] -> version`)
2. `src-tauri/Cargo.toml` (`[package] -> version`)
3. `src-tauri/tauri.conf.json` (`"version"`)
4. `ui/package.json` (`"version"`)

Commit thay đổi phiên bản:

```bash
git commit -am "chore: nâng phiên bản lên v0.2.0"
```

---

## 2. Đóng gói cục bộ trên máy hiện tại

Build bộ cài cho hệ điều hành đang dùng:

```bash
cargo tauri build
```

Sản phẩm đầu ra nằm trong `src-tauri/target/release/bundle/`.

### Tùy chọn đóng gói kèm `ffmpeg` sidecar

Nếu muốn nhúng sẵn binary `ffmpeg` vào bộ cài (offline hoàn toàn, không cần máy đích cài
`ffmpeg`):

1. Đặt binary `ffmpeg` đúng chuẩn target triple vào `src-tauri/binaries/` (ví dụ:
   - `src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu`
   - `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`
   - `src-tauri/binaries/ffmpeg-aarch64-apple-darwin`
   - `src-tauri/binaries/ffmpeg-x86_64-apple-darwin`)
2. Build kèm file cấu hình sidecar:
   ```bash
   cargo tauri build --config src-tauri/tauri.sidecar.conf.json
   ```

---

## 3. Phát hành tự động qua GitHub Actions

Workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) sẽ tự động:
- Chạy `cargo test -p grader-core` và `npm --prefix ui run build`.
- Build bộ cài trên 4 target: `ubuntu-22.04`, `windows-latest`, `macos-latest` (`aarch64` và
  `x86_64`).
- Tạo bản Draft Release trên GitHub kèm đầy đủ file cài đặt.

### Các bước kích hoạt Release

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin main
git push origin v0.2.0
```

Sau khi GitHub Actions chạy xong, vào mục **Releases** trên GitHub để rà soát Release Notes và
bấm **Publish release**.
