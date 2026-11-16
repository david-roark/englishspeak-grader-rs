use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::error::{GraderError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Mp3Preset {
    pub key: &'static str,
    pub label: &'static str,
    pub bitrate: &'static str,
    pub channels: u8,
    pub sample_rate: u32,
}

pub const DEFAULT_MP3_PRESET: &str = "balanced";

static MP3_PRESET_LIST: LazyLock<Vec<Mp3Preset>> = LazyLock::new(|| {
    vec![
        Mp3Preset {
            key: "compact",
            label: "Nhỏ gọn (giọng nói, mono 64k)",
            bitrate: "64k",
            channels: 1,
            sample_rate: 22050,
        },
        Mp3Preset {
            key: "balanced",
            label: "Cân bằng (mono 128k)",
            bitrate: "128k",
            channels: 1,
            sample_rate: 44100,
        },
        Mp3Preset {
            key: "high",
            label: "Chất lượng cao (stereo 192k)",
            bitrate: "192k",
            channels: 2,
            sample_rate: 44100,
        },
    ]
});

pub fn mp3_presets() -> &'static [Mp3Preset] {
    &MP3_PRESET_LIST
}

pub fn get_mp3_preset(key: &str) -> &'static Mp3Preset {
    MP3_PRESET_LIST
        .iter()
        .find(|p| p.key == key)
        .or_else(|| MP3_PRESET_LIST.iter().find(|p| p.key == DEFAULT_MP3_PRESET))
        .expect("default mp3 preset exists")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VideoPreset {
    pub key: &'static str,
    pub label: &'static str,
    pub preset: &'static str,
    pub audio_bitrate: &'static str,
    pub crf: Option<u8>,
    pub video_bitrate: Option<&'static str>,
    pub scale: Option<&'static str>,
}

pub const DEFAULT_VIDEO_PRESET: &str = "balanced";

static VIDEO_PRESET_LIST: LazyLock<Vec<VideoPreset>> = LazyLock::new(|| {
    vec![
        VideoPreset {
            key: "tiny",
            label: "Siêu tiết kiệm (540p, file cực nhẹ)",
            preset: "slow",
            audio_bitrate: "48k",
            crf: None,
            video_bitrate: Some("900k"),
            scale: Some("-2:540"),
        },
        VideoPreset {
            key: "light",
            label: "Siêu nhẹ (CRF 28, preset fast)",
            preset: "fast",
            audio_bitrate: "96k",
            crf: Some(28),
            video_bitrate: None,
            scale: None,
        },
        VideoPreset {
            key: "balanced",
            label: "Cân bằng (CRF 26, preset medium)",
            preset: "medium",
            audio_bitrate: "96k",
            crf: Some(26),
            video_bitrate: None,
            scale: None,
        },
        VideoPreset {
            key: "high",
            label: "Chất lượng cao (CRF 23, preset slow)",
            preset: "slow",
            audio_bitrate: "128k",
            crf: Some(23),
            video_bitrate: None,
            scale: None,
        },
    ]
});

pub fn video_presets() -> &'static [VideoPreset] {
    &VIDEO_PRESET_LIST
}

pub fn get_video_preset(key: &str) -> &'static VideoPreset {
    VIDEO_PRESET_LIST
        .iter()
        .find(|p| p.key == key)
        .or_else(|| {
            VIDEO_PRESET_LIST
                .iter()
                .find(|p| p.key == DEFAULT_VIDEO_PRESET)
        })
        .expect("default video preset exists")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaProgress {
    pub stage: String,
    pub percent: Option<f32>,
}

/// Tìm binary `ffmpeg` theo thứ tự ưu tiên:
/// 1. Đường dẫn do người dùng chỉ định
/// 2. Sidecar cạnh file thực thi hiện tại
/// 3. Trong thư mục `bin_dir` của app
/// 4. `ffmpeg` trong `PATH` hệ thống
pub fn resolve_ffmpeg(custom_path: Option<&Path>, bin_dir: Option<&Path>) -> Option<PathBuf> {
    let exe_name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };

    if let Some(p) = custom_path.filter(|p| p.is_file()) {
        return Some(p.to_path_buf());
    }

    if let Ok(cur_exe) = std::env::current_exe() {
        if let Some(dir) = cur_exe.parent() {
            let sidecar = dir.join(exe_name);
            if sidecar.is_file() {
                return Some(sidecar);
            }
        }
    }

    if let Some(bdir) = bin_dir {
        let candidate = bdir.join(exe_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    find_in_path(exe_name)
}

fn find_in_path(binary_name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(binary_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn is_mp4_family(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref(),
        Some("mp4" | "mov" | "m4v")
    )
}

fn is_mp3_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref(),
        Some("mp3")
    )
}

fn resolve_target_path(
    default_dir: &Path,
    default_file_name: String,
    out_path_override: Option<&Path>,
) -> PathBuf {
    match out_path_override {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => default_dir.join(default_file_name),
    }
}

fn build_extract_mp3_args_inner(
    video_path: &Path,
    preset_key: &str,
    enhance_speech: bool,
    out_path: &Path,
) -> Vec<String> {
    let cfg = get_mp3_preset(preset_key);
    let mut args = vec![
        "-y".into(),
        "-i".into(),
        video_path.to_string_lossy().into_owned(),
        "-vn".into(),
    ];
    if enhance_speech {
        args.push("-af".into());
        args.push("highpass=f=80,lowpass=f=8000,dynaudnorm".into());
    }
    args.extend([
        "-acodec".into(),
        "libmp3lame".into(),
        "-b:a".into(),
        cfg.bitrate.into(),
        "-ac".into(),
        cfg.channels.to_string(),
        "-ar".into(),
        cfg.sample_rate.to_string(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);
    args
}

/// Dựng tham số CLI `ffmpeg` cho tách MP3 với đường dẫn xuất chỉ định.
pub fn build_extract_mp3_args_to(
    video_path: &Path,
    preset_key: &str,
    out_path: &Path,
) -> Vec<String> {
    build_extract_mp3_args_inner(video_path, preset_key, false, out_path)
}

/// Dựng tham số CLI `ffmpeg` cho tách MP3 tối ưu giọng nói (lọc tạp âm & cân bằng âm lượng).
pub fn build_extract_speech_mp3_args_to(
    video_path: &Path,
    preset_key: &str,
    enhance_speech: bool,
    out_path: &Path,
) -> Vec<String> {
    build_extract_mp3_args_inner(video_path, preset_key, enhance_speech, out_path)
}

/// Dựng tham số CLI `ffmpeg` cho tách MP3 từ video (giúp kiểm thử deterministic không cần chạy subprocess).
pub fn build_extract_mp3_args(
    video_path: &Path,
    preset_key: &str,
    out_dir: &Path,
) -> (Vec<String>, PathBuf) {
    let cfg = get_mp3_preset(preset_key);
    let stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let out_path = out_dir.join(format!("{}_{}.mp3", stem, cfg.key));
    let args = build_extract_mp3_args_to(video_path, preset_key, &out_path);
    (args, out_path)
}

/// Dựng tham số CLI `ffmpeg` cho nén video H.264/AAC với đường dẫn xuất chỉ định.
pub fn build_compress_video_args_to(
    video_path: &Path,
    preset_key: &str,
    out_path: &Path,
) -> Vec<String> {
    let cfg = get_video_preset(preset_key);
    let mut args = vec![
        "-y".into(),
        "-i".into(),
        video_path.to_string_lossy().into_owned(),
    ];

    if let Some(scale) = cfg.scale {
        args.push("-vf".into());
        args.push(format!("scale={scale}"));
    }

    args.push("-c:v".into());
    args.push("libx264".into());
    args.push("-pix_fmt".into());
    args.push("yuv420p".into());
    args.push("-preset".into());
    args.push(cfg.preset.into());

    if let Some(crf) = cfg.crf {
        args.push("-crf".into());
        args.push(crf.to_string());
    }
    if let Some(vbr) = cfg.video_bitrate {
        args.push("-b:v".into());
        args.push(vbr.into());
    }

    args.extend([
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        cfg.audio_bitrate.into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);

    args
}

/// Dựng tham số CLI `ffmpeg` cho nén video H.264/AAC (giúp kiểm thử deterministic).
pub fn build_compress_video_args(
    video_path: &Path,
    preset_key: &str,
    out_dir: &Path,
) -> (Vec<String>, PathBuf) {
    let cfg = get_video_preset(preset_key);
    let stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    let out_path = out_dir.join(format!("{}_compressed_{}.mp4", stem, cfg.key));
    let args = build_compress_video_args_to(video_path, preset_key, &out_path);
    (args, out_path)
}

fn validate_trim_bounds(start_secs: f64, end_secs: Option<f64>) -> Result<()> {
    if !start_secs.is_finite() || start_secs < 0.0 {
        return Err(GraderError::InvalidInput(
            "Thời điểm bắt đầu phải lớn hơn hoặc bằng 0.".into(),
        ));
    }
    if let Some(end) = end_secs {
        if !end.is_finite() || end <= start_secs {
            return Err(GraderError::InvalidInput(
                "Thời điểm kết thúc phải lớn hơn thời điểm bắt đầu.".into(),
            ));
        }
    }
    Ok(())
}

/// Dựng tham số CLI `ffmpeg` cho cắt đoạn video/audio theo mốc giây.
pub fn build_trim_media_args_to(
    input_path: &Path,
    start_secs: f64,
    end_secs: Option<f64>,
    fast_copy: bool,
    out_path: &Path,
) -> Result<Vec<String>> {
    validate_trim_bounds(start_secs, end_secs)?;

    let mut args = vec![
        "-y".into(),
        "-ss".into(),
        format!("{start_secs:.3}"),
        "-i".into(),
        input_path.to_string_lossy().into_owned(),
    ];

    if let Some(end) = end_secs {
        args.push("-t".into());
        args.push(format!("{:.3}", end - start_secs));
    }

    if fast_copy {
        args.extend(["-c".into(), "copy".into()]);
    } else if is_mp3_file(out_path) {
        args.extend([
            "-vn".into(),
            "-acodec".into(),
            "libmp3lame".into(),
            "-b:a".into(),
            "192k".into(),
        ]);
    } else {
        args.extend([
            "-c:v".into(),
            "libx264".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-preset".into(),
            "fast".into(),
            "-crf".into(),
            "23".into(),
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "128k".into(),
        ]);
        if is_mp4_family(out_path) {
            args.extend(["-movflags".into(), "+faststart".into()]);
        }
    }

    args.extend([
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);

    Ok(args)
}

/// Dựng tham số CLI `ffmpeg` cho xóa âm thanh khỏi video (`-an`, copy stream nhanh).
pub fn build_mute_video_args_to(video_path: &Path, out_path: &Path) -> Vec<String> {
    let mut args = vec![
        "-y".into(),
        "-i".into(),
        video_path.to_string_lossy().into_owned(),
        "-c:v".into(),
        "copy".into(),
        "-an".into(),
    ];
    if is_mp4_family(out_path) {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.extend([
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);
    args
}

/// Khoảng thời gian cắt đoạn cho thao tác chỉnh sửa gộp.
#[derive(Debug, Clone, Copy)]
pub struct TrimRange {
    pub start_secs: f64,
    pub end_secs: Option<f64>,
    pub fast_copy: bool,
}

/// Tùy chọn gộp 1–3 thao tác chỉnh sửa (nén, cắt đoạn, xóa âm thanh) trong một lần chạy `ffmpeg`.
#[derive(Debug, Clone)]
pub struct VideoEditOptions {
    pub compress_preset: Option<String>,
    pub trim: Option<TrimRange>,
    pub mute: bool,
}

/// Dựng tham số CLI `ffmpeg` kết hợp cắt đoạn, nén video và/hoặc xóa âm thanh trong một lượt.
pub fn build_edit_video_args_to(
    input_path: &Path,
    options: &VideoEditOptions,
    out_path: &Path,
) -> Result<Vec<String>> {
    if options.compress_preset.is_none() && options.trim.is_none() && !options.mute {
        return Err(GraderError::InvalidInput(
            "Vui lòng chọn ít nhất một thao tác chỉnh sửa.".into(),
        ));
    }
    if let Some(trim) = options.trim {
        validate_trim_bounds(trim.start_secs, trim.end_secs)?;
    }

    let mut args = vec!["-y".into()];
    if let Some(trim) = options.trim {
        args.push("-ss".into());
        args.push(format!("{:.3}", trim.start_secs));
    }
    args.push("-i".into());
    args.push(input_path.to_string_lossy().into_owned());

    if let Some(trim) = options.trim {
        if let Some(end) = trim.end_secs {
            args.push("-t".into());
            args.push(format!("{:.3}", end - trim.start_secs));
        }
    }

    if let Some(preset_key) = options.compress_preset.as_deref() {
        let cfg = get_video_preset(preset_key);
        if let Some(scale) = cfg.scale {
            args.push("-vf".into());
            args.push(format!("scale={scale}"));
        }
        args.extend([
            "-c:v".into(),
            "libx264".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-preset".into(),
            cfg.preset.into(),
        ]);
        if let Some(crf) = cfg.crf {
            args.push("-crf".into());
            args.push(crf.to_string());
        }
        if let Some(vbr) = cfg.video_bitrate {
            args.push("-b:v".into());
            args.push(vbr.into());
        }
        if options.mute {
            args.push("-an".into());
        } else {
            args.extend([
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                cfg.audio_bitrate.into(),
            ]);
        }
        args.extend(["-movflags".into(), "+faststart".into()]);
    } else if let Some(trim) = options.trim {
        if trim.fast_copy {
            if options.mute {
                args.extend(["-c:v".into(), "copy".into(), "-an".into()]);
            } else {
                args.extend(["-c".into(), "copy".into()]);
            }
        } else if is_mp3_file(out_path) {
            args.extend([
                "-vn".into(),
                "-acodec".into(),
                "libmp3lame".into(),
                "-b:a".into(),
                "192k".into(),
            ]);
        } else {
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-preset".into(),
                "fast".into(),
                "-crf".into(),
                "23".into(),
            ]);
            if options.mute {
                args.push("-an".into());
            } else {
                args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "128k".into()]);
            }
        }
        if is_mp4_family(out_path) {
            args.extend(["-movflags".into(), "+faststart".into()]);
        }
    } else {
        // Chỉ xóa âm thanh
        args.extend(["-c:v".into(), "copy".into(), "-an".into()]);
        if is_mp4_family(out_path) {
            args.extend(["-movflags".into(), "+faststart".into()]);
        }
    }

    args.extend([
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);

    Ok(args)
}

/// Escape đường dẫn file phụ đề/thư mục font để truyền an toàn qua 2 lớp parser (`avfilter_graph_parse2` + `av_opt_set_from_string`) của `-vf ass=filename=...` trong `ffmpeg` (đặc biệt là dấu `:` trong đường dẫn Windows như `C:\...`).
pub fn escape_ffmpeg_filter_path(path: &Path) -> String {
    let forward = path.to_string_lossy().replace('\\', "/");
    let mut out = String::with_capacity(forward.len() + 16);
    for ch in forward.chars() {
        match ch {
            ':' => out.push_str(r"\\:"),
            '\'' => out.push_str(r"\\\'"),
            '[' | ']' | ',' | ';' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out
}

/// Dựng tham số CLI `ffmpeg` cho ghép phụ đề/script vào video (`burn_in = true`: hardsub ASS, `false`: softsub `mov_text`).
pub fn build_embed_subtitles_video_args_to(
    video_path: &Path,
    subtitle_path: &Path,
    burn_in: bool,
    out_path: &Path,
) -> Vec<String> {
    build_embed_subtitles_video_args_with_fonts_to(
        video_path,
        subtitle_path,
        burn_in,
        None,
        out_path,
    )
}

/// Tùy chọn tinh chỉnh hình ảnh & âm thanh khi xuất video với `ffmpeg`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VideoAdjustments {
    /// Độ sáng (`-1.0` đến `1.0`, mặc định `0.0`).
    pub brightness: f32,
    /// Độ tương phản (`0.1` đến `3.0`, mặc định `1.0`).
    pub contrast: f32,
    /// Chỉnh vùng tối/ngược sáng (`0.1` đến `3.0`, mặc định `1.0`).
    pub gamma: f32,
    /// Lọc tạp âm & cân bằng âm lượng giọng nói (`highpass/lowpass/dynaudnorm`).
    pub enhance_audio: bool,
}

impl Default for VideoAdjustments {
    fn default() -> Self {
        Self {
            brightness: 0.0,
            contrast: 1.0,
            gamma: 1.0,
            enhance_audio: false,
        }
    }
}

impl VideoAdjustments {
    pub fn has_eq(&self) -> bool {
        self.brightness.abs() > 1e-3
            || (self.contrast - 1.0).abs() > 1e-3
            || (self.gamma - 1.0).abs() > 1e-3
    }

    pub fn build_eq_filter(&self) -> Option<String> {
        if !self.has_eq() {
            return None;
        }
        let b = self.brightness.clamp(-1.0, 1.0);
        let c = self.contrast.clamp(0.1, 3.0);
        let g = self.gamma.clamp(0.1, 3.0);
        Some(format!("eq=brightness={b:.3}:contrast={c:.3}:gamma={g:.3}"))
    }
}

/// Dựng tham số CLI `ffmpeg` cho ghép phụ đề/script vào video kèm thư mục font (`fontsdir`) cho `libass`.
pub fn build_embed_subtitles_video_args_with_fonts_to(
    video_path: &Path,
    subtitle_path: &Path,
    burn_in: bool,
    fonts_dir: Option<&Path>,
    out_path: &Path,
) -> Vec<String> {
    build_embed_subtitles_video_args_with_options_to(
        video_path,
        subtitle_path,
        burn_in,
        fonts_dir,
        VideoAdjustments::default(),
        out_path,
    )
}

fn build_ass_filter(subtitle_path: &Path, fonts_dir: Option<&Path>) -> String {
    let escaped_sub = escape_ffmpeg_filter_path(subtitle_path);
    match fonts_dir {
        Some(dir) if !dir.as_os_str().is_empty() => {
            let escaped_dir = escape_ffmpeg_filter_path(dir);
            format!("ass=filename={escaped_sub}:fontsdir={escaped_dir}")
        }
        _ => format!("ass=filename={escaped_sub}"),
    }
}

/// Dựng tham số CLI `ffmpeg` cho ghép phụ đề/script vào video kèm `fontsdir` và tinh chỉnh sáng/tối, âm thanh.
pub fn build_embed_subtitles_video_args_with_options_to(
    video_path: &Path,
    subtitle_path: &Path,
    burn_in: bool,
    fonts_dir: Option<&Path>,
    adjustments: VideoAdjustments,
    out_path: &Path,
) -> Vec<String> {
    let mut args = vec![
        "-y".into(),
        "-i".into(),
        video_path.to_string_lossy().into_owned(),
    ];

    if burn_in {
        let ass_filter = build_ass_filter(subtitle_path, fonts_dir);
        let filter = match adjustments.build_eq_filter() {
            Some(eq) => format!("{eq},{ass_filter}"),
            None => ass_filter,
        };
        args.extend([
            "-vf".into(),
            filter,
            "-c:v".into(),
            "libx264".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-preset".into(),
            "fast".into(),
            "-crf".into(),
            "23".into(),
        ]);
        if adjustments.enhance_audio {
            args.extend([
                "-af".into(),
                "highpass=f=80,lowpass=f=8000,dynaudnorm".into(),
            ]);
        }
        args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "128k".into()]);
    } else {
        args.extend(["-i".into(), subtitle_path.to_string_lossy().into_owned()]);
        if is_mp4_family(video_path) {
            args.extend(["-c:v".into(), "copy".into(), "-c:a".into(), "copy".into()]);
        } else {
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-preset".into(),
                "fast".into(),
                "-crf".into(),
                "23".into(),
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                "128k".into(),
            ]);
        }
        args.extend(["-c:s".into(), "mov_text".into()]);
    }

    args.extend([
        "-map_metadata".into(),
        "-1".into(),
        "-metadata".into(),
        "title= ".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);
    args
}

async fn probe_ffmpeg_stderr(ffmpeg_exe: &Path, video_path: &Path) -> Option<String> {
    let out = Command::new(ffmpeg_exe)
        .arg("-i")
        .arg(video_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .ok()?;
    Some(String::from_utf8_lossy(&out.stderr).into_owned())
}

/// Đọc thời lượng video (giây) từ stderr của `ffmpeg -i`.
pub async fn probe_duration_secs(ffmpeg_exe: &Path, video_path: &Path) -> Option<f64> {
    let stderr = probe_ffmpeg_stderr(ffmpeg_exe, video_path).await?;
    parse_duration_from_stderr(&stderr)
}

/// Đọc kích thước hiển thị `(width, height)` của video từ stderr của `ffmpeg -i`.
pub async fn probe_video_dimensions(ffmpeg_exe: &Path, video_path: &Path) -> Option<(u32, u32)> {
    let stderr = probe_ffmpeg_stderr(ffmpeg_exe, video_path).await?;
    parse_video_dimensions_from_stderr(&stderr)
}

/// Kiểm tra stderr của `ffmpeg -i` xem file có luồng âm thanh hay không.
pub fn parse_has_audio_from_stderr(stderr: &str) -> bool {
    stderr
        .lines()
        .any(|line| line.contains("Stream #") && line.contains("Audio:"))
}

/// Trích xuất kích thước hiển thị `(width, height)` từ output stderr của `ffmpeg -i`,
/// có tính tới metadata xoay 90°/270° trên luồng video.
pub fn parse_video_dimensions_from_stderr(stderr: &str) -> Option<(u32, u32)> {
    static RE_DIM: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r",\s*(\d{2,5})x(\d{2,5})(?:$|[\s,\[])").unwrap());
    static RE_ROTATE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)(?:rotate\s*:\s*|displaymatrix:\s*rotation\s+of\s+)(-?\d+(?:\.\d+)?)")
            .unwrap()
    });

    let mut lines = stderr.lines();
    let video_line = lines.find(|line| line.contains("Stream #") && line.contains("Video:"))?;
    let caps = RE_DIM.captures(video_line)?;
    let w: u32 = caps.get(1)?.as_str().parse().ok()?;
    let h: u32 = caps.get(2)?.as_str().parse().ok()?;
    if w == 0 || h == 0 {
        return None;
    }

    for line in lines {
        if line.trim_start().starts_with("Stream #") {
            break;
        }
        if let Some(rc) = RE_ROTATE.captures(line) {
            if let Ok(deg) = rc.get(1)?.as_str().parse::<f64>() {
                let norm = ((deg.round() as i32) % 360 + 360) % 360;
                if norm == 90 || norm == 270 {
                    return Some((h, w));
                }
            }
        }
    }

    Some((w, h))
}

pub fn parse_duration_from_stderr(stderr: &str) -> Option<f64> {
    static RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)").unwrap());
    let caps = RE.captures(stderr)?;
    let h: f64 = caps.get(1)?.as_str().parse().ok()?;
    let m: f64 = caps.get(2)?.as_str().parse().ok()?;
    let s: f64 = caps.get(3)?.as_str().parse().ok()?;
    let total = h * 3600.0 + m * 60.0 + s;
    (total > 0.0).then_some(total)
}

/// Tách âm thanh MP3 từ video theo preset (lưu vào `out_dir`).
pub async fn extract_mp3<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    preset_key: &str,
    out_dir: &Path,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    extract_mp3_to(
        ffmpeg_exe,
        video_path,
        preset_key,
        out_dir,
        None,
        on_progress,
        cancel,
    )
    .await
}

fn file_stem_and_ext<'a>(
    path: &'a Path,
    fallback_stem: &'a str,
    fallback_ext: &'a str,
) -> (&'a str, &'a str) {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback_stem);
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback_ext);
    (stem, ext)
}

#[allow(clippy::too_many_arguments)]
async fn execute_ffmpeg_media_job<F>(
    ffmpeg_exe: &Path,
    out_path: PathBuf,
    args: Vec<String>,
    duration_secs: Option<f64>,
    running_stage: &str,
    done_stage: &str,
    err_prefix: &str,
    is_audio: bool,
    mut on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    if let Some(parent) = out_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    on_progress(MediaProgress {
        stage: running_stage.into(),
        percent: Some(0.0),
    });

    run_ffmpeg_with_progress(
        ffmpeg_exe,
        &args,
        &out_path,
        duration_secs,
        running_stage,
        &mut on_progress,
        cancel,
    )
    .await
    .map_err(|e| match e {
        GraderError::Cancelled => GraderError::Cancelled,
        other if is_audio => GraderError::Audio(format!("{err_prefix}: {other}")),
        other => GraderError::Video(format!("{err_prefix}: {other}")),
    })?;

    on_progress(MediaProgress {
        stage: done_stage.into(),
        percent: Some(100.0),
    });

    Ok(out_path)
}

fn ensure_input_exists(input_path: &Path, is_audio: bool) -> Result<()> {
    if input_path.exists() {
        return Ok(());
    }
    let msg = format!("Không tìm thấy file nguồn: {}", input_path.display());
    Err(if is_audio {
        GraderError::Audio(msg)
    } else {
        GraderError::Video(msg)
    })
}

/// Tách âm thanh MP3 từ video theo preset với đường dẫn file đầu ra tùy chọn.
pub async fn extract_mp3_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    preset_key: &str,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    extract_speech_mp3_to(
        ffmpeg_exe,
        video_path,
        preset_key,
        false,
        default_out_dir,
        out_path_override,
        on_progress,
        cancel,
    )
    .await
}

/// Tách âm thanh MP3 từ video (hỗ trợ lọc tạp âm & cân bằng giọng nói) với đường dẫn đầu ra tùy chọn.
#[allow(clippy::too_many_arguments)]
pub async fn extract_speech_mp3_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    preset_key: &str,
    enhance_speech: bool,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    ensure_input_exists(video_path, true)?;
    let cfg = get_mp3_preset(preset_key);
    let (stem, _) = file_stem_and_ext(video_path, "audio", "mp3");
    let default_name = if enhance_speech {
        format!("{stem}_speech.mp3")
    } else {
        format!("{stem}_{}.mp3", cfg.key)
    };
    let out_path = resolve_target_path(default_out_dir, default_name, out_path_override);
    let duration_secs = probe_duration_secs(ffmpeg_exe, video_path).await;
    let args = build_extract_speech_mp3_args_to(video_path, preset_key, enhance_speech, &out_path);
    let running_stage = if enhance_speech {
        "Đang tách & lọc giọng nói MP3..."
    } else {
        "Đang tách âm thanh MP3..."
    };

    execute_ffmpeg_media_job(
        ffmpeg_exe,
        out_path,
        args,
        duration_secs,
        running_stage,
        "Tách MP3 hoàn tất.",
        "Tách âm thanh thất bại",
        true,
        on_progress,
        cancel,
    )
    .await
}

/// Nén video bằng `ffmpeg` theo preset (lưu vào `out_dir`).
pub async fn compress_video<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    preset_key: &str,
    out_dir: &Path,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    compress_video_to(
        ffmpeg_exe,
        video_path,
        preset_key,
        out_dir,
        None,
        on_progress,
        cancel,
    )
    .await
}

/// Nén video bằng `ffmpeg` theo preset với đường dẫn file đầu ra tùy chọn.
pub async fn compress_video_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    preset_key: &str,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    ensure_input_exists(video_path, false)?;
    let cfg = get_video_preset(preset_key);
    let (stem, _) = file_stem_and_ext(video_path, "video", "mp4");
    let out_path = resolve_target_path(
        default_out_dir,
        format!("{stem}_compressed_{}.mp4", cfg.key),
        out_path_override,
    );
    let duration_secs = probe_duration_secs(ffmpeg_exe, video_path).await;
    let args = build_compress_video_args_to(video_path, preset_key, &out_path);

    execute_ffmpeg_media_job(
        ffmpeg_exe,
        out_path,
        args,
        duration_secs,
        "Đang nén video...",
        "Nén video hoàn tất.",
        "Nén video thất bại",
        false,
        on_progress,
        cancel,
    )
    .await
}

/// Cắt đoạn video/audio theo khoảng thời gian `[start_secs, end_secs]`.
#[allow(clippy::too_many_arguments)]
pub async fn trim_media_to<F>(
    ffmpeg_exe: &Path,
    input_path: &Path,
    start_secs: f64,
    end_secs: Option<f64>,
    fast_copy: bool,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    ensure_input_exists(input_path, false)?;
    let (stem, ext) = file_stem_and_ext(input_path, "media", "mp4");
    let out_path = resolve_target_path(
        default_out_dir,
        format!("{stem}_trim.{ext}"),
        out_path_override,
    );
    let args = build_trim_media_args_to(input_path, start_secs, end_secs, fast_copy, &out_path)?;
    let total_dur = probe_duration_secs(ffmpeg_exe, input_path).await;
    let target_dur = match end_secs {
        Some(e) => Some((e - start_secs).max(0.1)),
        None => total_dur.map(|d| (d - start_secs).max(0.1)),
    };

    execute_ffmpeg_media_job(
        ffmpeg_exe,
        out_path,
        args,
        target_dur,
        "Đang cắt đoạn media...",
        "Cắt đoạn hoàn tất.",
        "Cắt đoạn thất bại",
        false,
        on_progress,
        cancel,
    )
    .await
}

/// Xóa âm thanh khỏi video (giữ nguyên video stream, xử lý cực nhanh).
pub async fn mute_video_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    ensure_input_exists(video_path, false)?;
    let (stem, ext) = file_stem_and_ext(video_path, "video", "mp4");
    let out_path = resolve_target_path(
        default_out_dir,
        format!("{stem}_muted.{ext}"),
        out_path_override,
    );
    let duration_secs = probe_duration_secs(ffmpeg_exe, video_path).await;
    let args = build_mute_video_args_to(video_path, &out_path);

    execute_ffmpeg_media_job(
        ffmpeg_exe,
        out_path,
        args,
        duration_secs,
        "Đang tắt tiếng video...",
        "Tắt tiếng video hoàn tất.",
        "Tắt tiếng video thất bại",
        false,
        on_progress,
        cancel,
    )
    .await
}

/// Chỉnh sửa video/audio gộp (cắt đoạn, giảm dung lượng, xóa âm thanh) trong một lượt `ffmpeg`.
pub async fn edit_video_to<F>(
    ffmpeg_exe: &Path,
    input_path: &Path,
    options: &VideoEditOptions,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    ensure_input_exists(input_path, false)?;
    let (stem, ext) = file_stem_and_ext(input_path, "media", "mp4");
    let has_compress = options.compress_preset.is_some();
    let has_trim = options.trim.is_some();
    let active_count =
        usize::from(has_compress) + usize::from(has_trim) + usize::from(options.mute);

    let default_name = match (
        active_count,
        options.compress_preset.as_deref(),
        has_trim,
        options.mute,
    ) {
        (1, Some(preset_key), false, false) => {
            let cfg = get_video_preset(preset_key);
            format!("{stem}_compressed_{}.mp4", cfg.key)
        }
        (1, None, true, false) => format!("{stem}_trim.{ext}"),
        (1, None, false, true) => format!("{stem}_muted.{ext}"),
        _ => {
            let out_ext = if has_compress { "mp4" } else { ext };
            format!("{stem}_edited.{out_ext}")
        }
    };

    let out_path = resolve_target_path(default_out_dir, default_name, out_path_override);
    let args = build_edit_video_args_to(input_path, options, &out_path)?;
    let total_dur = probe_duration_secs(ffmpeg_exe, input_path).await;
    let target_dur = match options.trim {
        Some(t) => match t.end_secs {
            Some(e) => Some((e - t.start_secs).max(0.1)),
            None => total_dur.map(|d| (d - t.start_secs).max(0.1)),
        },
        None => total_dur,
    };

    execute_ffmpeg_media_job(
        ffmpeg_exe,
        out_path,
        args,
        target_dur,
        "Đang chỉnh sửa media...",
        "Chỉnh sửa media hoàn tất.",
        "Chỉnh sửa media thất bại",
        false,
        on_progress,
        cancel,
    )
    .await
}

/// Ghép phụ đề/script vào video (`burn_in = true`: in cứng `.ass` lên hình, `false`: nhúng phụ đề mềm `.srt`).
#[allow(clippy::too_many_arguments)]
pub async fn embed_subtitles_video_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    subtitle_path: &Path,
    burn_in: bool,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    embed_subtitles_video_with_fonts_to(
        ffmpeg_exe,
        video_path,
        subtitle_path,
        burn_in,
        None,
        default_out_dir,
        out_path_override,
        on_progress,
        cancel,
    )
    .await
}

/// Ghép phụ đề/script vào video kèm thư mục `fontsdir` để `libass` dùng font Google đóng gói sẵn.
#[allow(clippy::too_many_arguments)]
pub async fn embed_subtitles_video_with_fonts_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    subtitle_path: &Path,
    burn_in: bool,
    fonts_dir: Option<&Path>,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    embed_subtitles_video_with_options_to(
        ffmpeg_exe,
        video_path,
        subtitle_path,
        burn_in,
        fonts_dir,
        VideoAdjustments::default(),
        default_out_dir,
        out_path_override,
        on_progress,
        cancel,
    )
    .await
}

/// Ghép phụ đề/script vào video kèm `fontsdir` và tinh chỉnh sáng/tối, âm thanh.
#[allow(clippy::too_many_arguments)]
pub async fn embed_subtitles_video_with_options_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    subtitle_path: &Path,
    burn_in: bool,
    fonts_dir: Option<&Path>,
    adjustments: VideoAdjustments,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    ensure_input_exists(video_path, false)?;
    if !subtitle_path.exists() {
        return Err(GraderError::Video(format!(
            "Không tìm thấy file phụ đề tạm: {}",
            subtitle_path.display()
        )));
    }
    let (stem, _) = file_stem_and_ext(video_path, "video", "mp4");
    let default_name = if burn_in {
        format!("{stem}_subtitled.mp4")
    } else {
        format!("{stem}_softsub.mp4")
    };
    let out_path = resolve_target_path(default_out_dir, default_name, out_path_override);
    let duration_secs = probe_duration_secs(ffmpeg_exe, video_path).await;
    let args = build_embed_subtitles_video_args_with_options_to(
        video_path,
        subtitle_path,
        burn_in,
        fonts_dir,
        adjustments,
        &out_path,
    );
    let running_stage = if burn_in {
        "Đang đốt phụ đề script lên video..."
    } else {
        "Đang nhúng phụ đề mềm vào video..."
    };

    execute_ffmpeg_media_job(
        ffmpeg_exe,
        out_path,
        args,
        duration_secs,
        running_stage,
        "Ghép script vào video hoàn tất.",
        "Ghép script vào video thất bại",
        false,
        on_progress,
        cancel,
    )
    .await
}

/// Dựng tham số CLI `ffmpeg` để cắt 1 clip ngắn theo mốc `start_secs..end_secs` (tùy chọn đốt phụ đề & chỉnh sáng/âm thanh).
pub fn build_export_segment_clip_args_to(
    video_path: &Path,
    start_secs: f64,
    end_secs: f64,
    subtitle_path: Option<&Path>,
    fonts_dir: Option<&Path>,
    adjustments: VideoAdjustments,
    out_path: &Path,
) -> Vec<String> {
    let start = start_secs.max(0.0);
    let end = end_secs.max(start + 0.1);

    let mut args = vec![
        "-y".into(),
        "-i".into(),
        video_path.to_string_lossy().into_owned(),
        "-ss".into(),
        format!("{start:.3}"),
        "-to".into(),
        format!("{end:.3}"),
    ];

    let mut vf_parts: Vec<String> = Vec::new();
    if let Some(eq) = adjustments.build_eq_filter() {
        vf_parts.push(eq);
    }
    if let Some(sub_path) = subtitle_path {
        vf_parts.push(build_ass_filter(sub_path, fonts_dir));
    }
    if !vf_parts.is_empty() {
        args.extend(["-vf".into(), vf_parts.join(",")]);
    }

    args.extend([
        "-c:v".into(),
        "libx264".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-preset".into(),
        "fast".into(),
        "-crf".into(),
        "23".into(),
    ]);
    if adjustments.enhance_audio {
        args.extend([
            "-af".into(),
            "highpass=f=80,lowpass=f=8000,dynaudnorm".into(),
        ]);
    }
    args.extend([
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
        "-map_metadata".into(),
        "-1".into(),
        "-metadata".into(),
        "title= ".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);
    args
}

/// Cắt một clip ngắn từ video theo câu thoại (có thể kèm đốt phụ đề, chỉnh sáng/tối và lọc giọng nói).
#[allow(clippy::too_many_arguments)]
pub async fn export_segment_clip_to<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    start_secs: f64,
    end_secs: f64,
    clip_tag: &str,
    subtitle_path: Option<&Path>,
    fonts_dir: Option<&Path>,
    adjustments: VideoAdjustments,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    ensure_input_exists(video_path, false)?;
    if let Some(sub) = subtitle_path {
        if !sub.exists() {
            return Err(GraderError::Video(format!(
                "Không tìm thấy file phụ đề tạm: {}",
                sub.display()
            )));
        }
    }
    if end_secs <= start_secs {
        return Err(GraderError::InvalidInput(
            "Thời điểm kết thúc clip phải lớn hơn thời điểm bắt đầu.".into(),
        ));
    }
    let (stem, _) = file_stem_and_ext(video_path, "video", "mp4");
    let safe_tag = if clip_tag.trim().is_empty() {
        "clip"
    } else {
        clip_tag.trim()
    };
    let default_name = format!("{stem}_{safe_tag}.mp4");
    let out_path = resolve_target_path(default_out_dir, default_name, out_path_override);
    let clip_duration = (end_secs - start_secs).max(0.1);
    let args = build_export_segment_clip_args_to(
        video_path,
        start_secs,
        end_secs,
        subtitle_path,
        fonts_dir,
        adjustments,
        &out_path,
    );

    execute_ffmpeg_media_job(
        ffmpeg_exe,
        out_path,
        args,
        Some(clip_duration),
        "Đang cắt clip câu thoại...",
        "Xuất clip câu thoại hoàn tất.",
        "Xuất clip câu thoại thất bại",
        false,
        on_progress,
        cancel,
    )
    .await
}

/// Thông tin một file video đầu vào khi ghép nhiều video.
#[derive(Debug, Clone, PartialEq)]
pub struct MergeVideoInput {
    pub path: PathBuf,
    pub has_audio: bool,
    pub duration_secs: Option<f64>,
}

/// Dựng tham số CLI `ffmpeg` để ghép nhiều video qua `filter_complex` (chuẩn hóa kích thước, fps và âm thanh).
pub fn build_merge_videos_filter_complex_args_to(
    inputs: &[MergeVideoInput],
    target_width: u32,
    target_height: u32,
    out_path: &Path,
) -> Vec<String> {
    let w = (target_width.max(2)) & !1;
    let h = (target_height.max(2)) & !1;

    let mut args = vec!["-y".into()];
    for item in inputs {
        args.push("-i".into());
        args.push(item.path.to_string_lossy().into_owned());
    }

    let mut filter_parts = Vec::with_capacity(inputs.len() * 2 + 1);
    let mut concat_inputs = String::new();
    for (idx, item) in inputs.iter().enumerate() {
        filter_parts.push(format!(
            "[{idx}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[v{idx}]"
        ));
        if item.has_audio {
            filter_parts.push(format!(
                "[{idx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a{idx}]"
            ));
        } else {
            let dur = item.duration_secs.unwrap_or(1.0).max(0.1);
            filter_parts.push(format!(
                "anullsrc=channel_layout=stereo:sample_rate=44100:d={dur:.3}[a{idx}]"
            ));
        }
        concat_inputs.push_str(&format!("[v{idx}][a{idx}]"));
    }
    filter_parts.push(format!(
        "{concat_inputs}concat=n={}:v=1:a=1[outv][outa]",
        inputs.len()
    ));

    args.extend([
        "-filter_complex".into(),
        filter_parts.join(";"),
        "-map".into(),
        "[outv]".into(),
        "-map".into(),
        "[outa]".into(),
        "-c:v".into(),
        "libx264".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-preset".into(),
        "fast".into(),
        "-crf".into(),
        "23".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
        "-map_metadata".into(),
        "-1".into(),
        "-metadata".into(),
        "title= ".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]);
    args
}

/// Dựng tham số CLI `ffmpeg` cho ghép siêu nhanh (`-f concat -c copy`) từ file danh sách.
pub fn build_merge_videos_fast_concat_args_to(
    concat_list_path: &Path,
    out_path: &Path,
) -> Vec<String> {
    vec![
        "-y".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        concat_list_path.to_string_lossy().into_owned(),
        "-c".into(),
        "copy".into(),
        "-map_metadata".into(),
        "-1".into(),
        "-metadata".into(),
        "title= ".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        out_path.to_string_lossy().into_owned(),
    ]
}

/// Ghép nhiều file video thành 1 file MP4 theo thứ tự đã chọn.
#[allow(clippy::too_many_arguments)]
pub async fn merge_videos_to<F>(
    ffmpeg_exe: &Path,
    video_paths: &[PathBuf],
    fast_copy: bool,
    default_out_dir: &Path,
    out_path_override: Option<&Path>,
    on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    if video_paths.len() < 2 {
        return Err(GraderError::InvalidInput(
            "Cần chọn ít nhất 2 video để ghép.".into(),
        ));
    }
    for path in video_paths {
        ensure_input_exists(path, false)?;
    }

    let first_path = &video_paths[0];
    let (stem, _) = file_stem_and_ext(first_path, "video", "mp4");
    let default_name = format!("{stem}_merged.mp4");
    let out_path = resolve_target_path(default_out_dir, default_name, out_path_override);

    let mut inputs = Vec::with_capacity(video_paths.len());
    let mut target_dims: Option<(u32, u32)> = None;
    let mut total_duration = 0.0_f64;
    let mut has_all_durations = true;

    for (idx, path) in video_paths.iter().enumerate() {
        let stderr = probe_ffmpeg_stderr(ffmpeg_exe, path)
            .await
            .unwrap_or_default();
        if idx == 0 {
            target_dims = parse_video_dimensions_from_stderr(&stderr);
        }
        let dur = parse_duration_from_stderr(&stderr);
        if let Some(d) = dur {
            total_duration += d;
        } else {
            has_all_durations = false;
        }
        inputs.push(MergeVideoInput {
            path: path.clone(),
            has_audio: parse_has_audio_from_stderr(&stderr),
            duration_secs: dur,
        });
    }
    let total_dur_opt = (has_all_durations && total_duration > 0.0).then_some(total_duration);

    if fast_copy {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let list_path = std::env::temp_dir().join(format!("englishspeak_concat_{stamp}.txt"));
        let list_body = video_paths
            .iter()
            .map(|p| {
                let escaped = p.to_string_lossy().replace('\'', "'\\''");
                format!("file '{escaped}'")
            })
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(&list_path, list_body)?;

        let args = build_merge_videos_fast_concat_args_to(&list_path, &out_path);
        let res = execute_ffmpeg_media_job(
            ffmpeg_exe,
            out_path,
            args,
            total_dur_opt,
            "Đang ghép nhanh các video...",
            "Ghép video hoàn tất.",
            "Ghép video thất bại",
            false,
            on_progress,
            cancel,
        )
        .await;
        let _ = tokio::fs::remove_file(&list_path).await;
        res
    } else {
        let (w, h) = target_dims.unwrap_or((1280, 720));
        let args = build_merge_videos_filter_complex_args_to(&inputs, w, h, &out_path);
        execute_ffmpeg_media_job(
            ffmpeg_exe,
            out_path,
            args,
            total_dur_opt,
            "Đang chuẩn hóa và ghép các video...",
            "Ghép video hoàn tất.",
            "Ghép video thất bại",
            false,
            on_progress,
            cancel,
        )
        .await
    }
}

async fn run_ffmpeg_with_progress<F>(
    ffmpeg_exe: &Path,
    args: &[String],
    out_path: &Path,
    duration_secs: Option<f64>,
    stage_label: &str,
    on_progress: &mut F,
    cancel: Option<&CancellationToken>,
) -> Result<()>
where
    F: FnMut(MediaProgress) + Send,
{
    let mut cmd = Command::new(ffmpeg_exe);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| {
        GraderError::Io(std::io::Error::other(format!(
            "Không chạy được ffmpeg: {e}"
        )))
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stderr_handle = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(err) = stderr {
            let mut reader = BufReader::new(err).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                lines.push(line);
                if lines.len() > 20 {
                    lines.remove(0);
                }
            }
        }
        lines
    });

    if let Some(out) = stdout {
        let mut reader = BufReader::new(out).lines();
        loop {
            let next_line = if let Some(tok) = cancel {
                tokio::select! {
                    _ = tok.cancelled() => {
                        let _ = child.kill().await;
                        let _ = tokio::fs::remove_file(out_path).await;
                        return Err(GraderError::Cancelled);
                    }
                    line = reader.next_line() => line,
                }
            } else {
                reader.next_line().await
            };

            match next_line {
                Ok(Some(line)) => {
                    if let Some(us_str) = line.strip_prefix("out_time_us=") {
                        if let (Ok(us), Some(dur)) = (us_str.trim().parse::<i64>(), duration_secs) {
                            if us >= 0 && dur > 0.0 {
                                let pct =
                                    (((us as f64) / 1_000_000.0 / dur) * 100.0).clamp(0.0, 99.5);
                                on_progress(MediaProgress {
                                    stage: stage_label.to_string(),
                                    percent: Some(pct as f32),
                                });
                            }
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }
    }

    let status = child.wait().await?;
    let stderr_tail = stderr_handle.await.unwrap_or_default();

    if !status.success() || !out_path.exists() {
        let tail = stderr_tail
            .into_iter()
            .rev()
            .take(10)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join(" | ");
        return Err(GraderError::InvalidInput(tail));
    }

    Ok(())
}
