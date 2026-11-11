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
        .or_else(|| VIDEO_PRESET_LIST.iter().find(|p| p.key == DEFAULT_VIDEO_PRESET))
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
    let exe_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };

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

/// Dựng tham số CLI `ffmpeg` cho tách MP3 (giúp kiểm thử deterministic không cần chạy subprocess).
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

    let args = vec![
        "-y".into(),
        "-i".into(),
        video_path.to_string_lossy().into_owned(),
        "-vn".into(),
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
    ];
    (args, out_path)
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

    (args, out_path)
}

/// Đọc thời lượng video (giây) từ stderr của `ffmpeg -i`.
pub async fn probe_duration_secs(ffmpeg_exe: &Path, video_path: &Path) -> Option<f64> {
    let out = Command::new(ffmpeg_exe)
        .arg("-i")
        .arg(video_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .ok()?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    parse_duration_from_stderr(&stderr)
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

/// Tách âm thanh MP3 từ video theo preset.
pub async fn extract_mp3<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    preset_key: &str,
    out_dir: &Path,
    mut on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    if !video_path.exists() {
        return Err(GraderError::Audio(format!(
            "Không tìm thấy file video: {}",
            video_path.display()
        )));
    }
    tokio::fs::create_dir_all(out_dir).await?;

    let duration_secs = probe_duration_secs(ffmpeg_exe, video_path).await;
    let (args, out_path) = build_extract_mp3_args(video_path, preset_key, out_dir);

    on_progress(MediaProgress {
        stage: "Đang tách âm thanh MP3...".into(),
        percent: Some(0.0),
    });

    run_ffmpeg_with_progress(
        ffmpeg_exe,
        &args,
        &out_path,
        duration_secs,
        "Đang tách âm thanh MP3...",
        &mut on_progress,
        cancel,
    )
    .await
    .map_err(|e| match e {
        GraderError::Cancelled => GraderError::Cancelled,
        other => GraderError::Audio(format!("Tách âm thanh thất bại: {other}")),
    })?;

    on_progress(MediaProgress {
        stage: "Tách MP3 hoàn tất.".into(),
        percent: Some(100.0),
    });

    Ok(out_path)
}

/// Nén video bằng `ffmpeg` theo preset.
pub async fn compress_video<F>(
    ffmpeg_exe: &Path,
    video_path: &Path,
    preset_key: &str,
    out_dir: &Path,
    mut on_progress: F,
    cancel: Option<&CancellationToken>,
) -> Result<PathBuf>
where
    F: FnMut(MediaProgress) + Send,
{
    if !video_path.exists() {
        return Err(GraderError::Video(format!(
            "Không tìm thấy file video: {}",
            video_path.display()
        )));
    }
    tokio::fs::create_dir_all(out_dir).await?;

    let duration_secs = probe_duration_secs(ffmpeg_exe, video_path).await;
    let (args, out_path) = build_compress_video_args(video_path, preset_key, out_dir);

    on_progress(MediaProgress {
        stage: "Đang nén video...".into(),
        percent: Some(0.0),
    });

    run_ffmpeg_with_progress(
        ffmpeg_exe,
        &args,
        &out_path,
        duration_secs,
        "Đang nén video...",
        &mut on_progress,
        cancel,
    )
    .await
    .map_err(|e| match e {
        GraderError::Cancelled => GraderError::Cancelled,
        other => GraderError::Video(format!("Nén video thất bại: {other}")),
    })?;

    on_progress(MediaProgress {
        stage: "Nén video hoàn tất.".into(),
        percent: Some(100.0),
    });

    Ok(out_path)
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

    let mut child = cmd
        .spawn()
        .map_err(|e| GraderError::Io(std::io::Error::other(format!("Không chạy được ffmpeg: {e}"))))?;

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
                                let pct = (((us as f64) / 1_000_000.0 / dur) * 100.0).clamp(0.0, 99.5);
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
            .take(3)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join(" | ");
        return Err(GraderError::InvalidInput(tail));
    }

    Ok(())
}
