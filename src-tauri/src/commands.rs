use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use grader_core::export::{default_export_path, export_to_excel};
use grader_core::{
    build_prompt_parts, compress_video_to, embed_subtitles_video_to, extract_mp3_to,
    extract_speech_mp3_to, fmt_num, format_result_markdown, format_transcript_ass,
    format_transcript_markdown, format_transcript_srt_with_mode, format_transcript_text,
    mp3_presets, mute_video_to, probe_duration_secs, resolve_ffmpeg, trim_media_to, video_presets,
    AssessmentDetail, AssessmentSummary, AssignmentImage, GeminiClient, GradingAssignment,
    MediaResolution, Mp3Preset, NewAssessment, PromptParts, PromptProfile, Rubric,
    TranscribeOptions, TranscriptResult, VideoPreset, DEFAULT_MODEL, FALLBACK_MODELS,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct AppBootstrap {
    pub has_api_key: bool,
    pub masked_api_key: String,
    pub default_model: String,
    pub media_resolution: String,
    pub export_dir: String,
    pub has_custom_export_dir: bool,
    pub db_path: String,
    pub ffmpeg_path: Option<String>,
    pub ffmpeg_custom_path: String,
    pub is_portable: bool,
    pub fallback_models: Vec<String>,
    pub video_presets: Vec<VideoPreset>,
    pub mp3_presets: Vec<Mp3Preset>,
    pub rubrics: Vec<Rubric>,
    pub grading_assignments: Vec<GradingAssignment>,
    pub prompt_profile: PromptProfile,
    pub prompt_profiles: Vec<PromptProfile>,
    pub active_prompt_profile_id: String,
    pub media_base_url: String,
    pub media_token: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthorizedMedia {
    pub base_url: String,
    pub token: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub size_mb: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GradeRequest {
    pub task_id: String,
    pub api_key: Option<String>,
    pub video_path: String,
    pub rubric_id: String,
    pub task_type: String,
    pub feedback_lang: String,
    pub model: String,
    pub student_names_raw: String,
    pub extra_instructions: String,
    pub media_resolution: String,
    pub prompt_profile_id: Option<String>,
    #[serde(default)]
    pub grading_mode: Option<String>,
    #[serde(default)]
    pub assignment_name: Option<String>,
    #[serde(default)]
    pub flexible_max_score: Option<f64>,
    #[serde(default)]
    pub flexible_rounding_step: Option<f64>,
    #[serde(default)]
    pub images: Option<Vec<AssignmentImage>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GradeResponse {
    pub detail: AssessmentDetail,
    pub excel_path: String,
    pub reused_upload_cache: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MediaOutput {
    pub output_path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub size_mb: f64,
    pub orig_size_mb: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenerateScriptRequest {
    pub task_id: String,
    pub api_key: Option<String>,
    pub input_path: String,
    pub model: String,
    pub mp3_preset: String,
    #[serde(default = "default_true")]
    pub enhance_speech: bool,
    #[serde(default = "default_true")]
    pub keep_mp3: bool,
    pub interaction_mode: String,
    pub speaker_hints: String,
    pub verbatim_mode: String,
    pub include_translation: bool,
    pub include_grammar_notes: bool,
    pub extra_instructions: String,
    pub out_dir_override: Option<String>,
    pub out_path_override: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
pub struct GenerateScriptResponse {
    pub transcript: TranscriptResult,
    pub source_name: String,
    pub script_output: MediaOutput,
    pub mp3_output: Option<MediaOutput>,
    pub reused_upload_cache: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbedSubtitlesRequest {
    pub task_id: String,
    pub video_path: String,
    pub transcript: TranscriptResult,
    pub burn_mode: String,
    pub content_mode: String,
    pub out_dir_override: Option<String>,
    pub out_path_override: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub task_id: String,
    pub stage: String,
    pub percent: Option<f32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SettingsUpdate {
    pub api_key: Option<String>,
    pub clear_api_key: Option<bool>,
    pub default_model: Option<String>,
    pub media_resolution: Option<String>,
    pub export_dir: Option<String>,
    pub ffmpeg_custom_path: Option<String>,
}

fn mask_key(key: &str) -> String {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 8 {
        return "••••••••".to_string();
    }
    let prefix: String = chars[..4].iter().collect();
    let suffix: String = chars[chars.len() - 4..].iter().collect();
    format!("{prefix}••••{suffix}")
}

fn emit_progress(app: &AppHandle, task_id: &str, stage: impl Into<String>, percent: Option<f32>) {
    let _ = app.emit(
        "task-progress",
        ProgressPayload {
            task_id: task_id.to_string(),
            stage: stage.into(),
            percent,
        },
    );
}

#[tauri::command]
pub fn get_bootstrap(state: State<'_, AppState>) -> Result<AppBootstrap, String> {
    let key = state.resolve_api_key(None);
    let has_api_key = !key.is_empty();
    let default_model = state
        .db
        .get_setting("default_model")
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let media_resolution = state
        .db
        .get_setting("media_resolution")
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "low".to_string());
    let ffmpeg_custom_path = state
        .effective_ffmpeg_custom_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ffmpeg_path = resolve_ffmpeg(
        state.effective_ffmpeg_custom_path().as_deref(),
        Some(&state.paths.bin_dir),
    )
    .map(|p| p.to_string_lossy().into_owned());

    let rubrics = state.db.list_rubrics().map_err(|e| e.to_string())?;
    let grading_assignments = state
        .db
        .list_grading_assignments()
        .map_err(|e| e.to_string())?;
    let prompt_profile = state.db.load_prompt_profile().map_err(|e| e.to_string())?;
    let prompt_profiles = state.db.list_prompt_profiles().map_err(|e| e.to_string())?;
    let active_prompt_profile_id = prompt_profile.id.clone();

    Ok(AppBootstrap {
        has_api_key,
        masked_api_key: mask_key(&key),
        default_model,
        media_resolution,
        export_dir: state.effective_export_dir().to_string_lossy().into_owned(),
        has_custom_export_dir: state.has_custom_export_dir(),
        db_path: state.paths.db_path.to_string_lossy().into_owned(),
        ffmpeg_path,
        ffmpeg_custom_path,
        is_portable: state.paths.is_portable,
        fallback_models: FALLBACK_MODELS.iter().map(|s| (*s).to_string()).collect(),
        video_presets: video_presets().to_vec(),
        mp3_presets: mp3_presets().to_vec(),
        rubrics,
        grading_assignments,
        prompt_profile,
        prompt_profiles,
        active_prompt_profile_id,
        media_base_url: state.media_server.base_url(),
        media_token: state.media_server.token().to_string(),
    })
}

fn parse_student_names(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

#[tauri::command]
pub fn authorize_media_path(
    state: State<'_, AppState>,
    path: String,
) -> Result<AuthorizedMedia, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Đường dẫn media trống.".into());
    }
    let p = Path::new(trimmed);
    let url = state
        .media_server
        .stream_url_for_path(p)
        .ok_or_else(|| format!("Không tìm thấy file media hợp lệ: {trimmed}"))?;
    Ok(AuthorizedMedia {
        base_url: state.media_server.base_url(),
        token: state.media_server.token().to_string(),
        url,
    })
}

#[tauri::command]
pub fn inspect_file(state: State<'_, AppState>, path: String) -> Result<FileInfo, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Không tìm thấy file: {path}"));
    }
    let meta = std::fs::metadata(p).map_err(|e| format!("Không đọc được file: {e}"))?;
    let size_bytes = meta.len();
    state.media_server.authorize_path(p);
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("video")
        .to_string();
    Ok(FileInfo {
        path,
        name,
        size_bytes,
        size_mb: size_bytes as f64 / (1024.0 * 1024.0),
    })
}

#[tauri::command]
pub async fn fetch_models(
    state: State<'_, AppState>,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    let key = state.resolve_api_key(api_key.as_deref());
    let client = GeminiClient::new(&key).map_err(|e| e.to_string())?;
    Ok(client.list_models().await)
}

#[tauri::command]
pub async fn cancel_task(state: State<'_, AppState>, task_id: String) -> Result<bool, String> {
    Ok(state.cancel_task(&task_id).await)
}

#[tauri::command]
pub async fn grade_video_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    req: GradeRequest,
) -> Result<GradeResponse, String> {
    let video_path = PathBuf::from(&req.video_path);
    if !video_path.is_file() {
        return Err("Chưa chọn file video hợp lệ.".into());
    }
    state.media_server.authorize_path(&video_path);

    let images = req.images.unwrap_or_default();
    let is_flexible = req.grading_mode.as_deref() == Some("flexible");

    let (rubric, extra_for_prompt) = if is_flexible {
        if req.extra_instructions.trim().is_empty() && images.is_empty() {
            return Err(
                "Chế độ chấm linh hoạt cần nhập yêu cầu chấm hoặc đính kèm ít nhất 1 ảnh đề bài."
                    .into(),
            );
        }
        let max_score = req
            .flexible_max_score
            .filter(|v| v.is_finite() && *v > 0.0)
            .unwrap_or(10.0);
        let default_flex_name = format!("Chấm linh hoạt (Thang {})", fmt_num(max_score));
        let display_name = req
            .assignment_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(default_flex_name.as_str());
        (
            Rubric::flexible(
                display_name,
                &req.extra_instructions,
                max_score,
                req.flexible_rounding_step,
            ),
            "",
        )
    } else {
        let loaded = state
            .db
            .get_rubric(&req.rubric_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Không tìm thấy rubric '{}'.", req.rubric_id))?;
        (loaded, req.extra_instructions.as_str())
    };

    let prompt_profile = match req
        .prompt_profile_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(pid) => state
            .db
            .get_prompt_profile(pid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Không tìm thấy Prompt Profile '{pid}'."))?,
        None => state.db.load_prompt_profile().map_err(|e| e.to_string())?,
    };

    let key = state.resolve_api_key(req.api_key.as_deref());
    let client = GeminiClient::new(&key).map_err(|e| e.to_string())?;

    let student_names = parse_student_names(&req.student_names_raw);
    let names_opt = (!student_names.is_empty()).then_some(student_names.as_slice());

    let cancel = state.register_task(&req.task_id).await;
    let started = Instant::now();

    emit_progress(&app, &req.task_id, "Kết nối Gemini...", Some(5.0));

    let upload_res = client
        .get_or_upload(
            &video_path,
            &state.upload_cache,
            Duration::from_secs(2),
            Duration::from_secs(600),
            |p| {
                let scaled = p.percent.map(|pct| 5.0 + pct * 0.5);
                emit_progress(&app, &req.task_id, p.stage, scaled);
            },
            Some(&cancel),
        )
        .await;

    let (uploaded, reused_cache) = match upload_res {
        Ok(v) => v,
        Err(e) => {
            state.finish_task(&req.task_id).await;
            return Err(e.to_string());
        }
    };

    emit_progress(
        &app,
        &req.task_id,
        format!("Đang chấm điểm bằng model {}...", req.model),
        Some(65.0),
    );

    let res_mode = MediaResolution::from_str_lossy(&req.media_resolution);
    let grade_res = client
        .grade_video_with_images(
            &uploaded,
            &rubric,
            &prompt_profile,
            &req.model,
            &req.task_type,
            &req.feedback_lang,
            names_opt,
            extra_for_prompt,
            &images,
            res_mode,
            Some(&cancel),
        )
        .await;

    state.finish_task(&req.task_id).await;

    let result = grade_res.map_err(|e| e.to_string())?;
    let elapsed_ms = started.elapsed().as_millis() as u64;

    emit_progress(
        &app,
        &req.task_id,
        "Lưu kết quả & xuất Excel...",
        Some(92.0),
    );

    let video_name = video_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("video.mp4")
        .to_string();
    let video_size_bytes = std::fs::metadata(&video_path).ok().map(|m| m.len());

    let assessment_id = state
        .db
        .save_assessment(&NewAssessment {
            video_name: &video_name,
            video_path: Some(&req.video_path),
            video_size_bytes,
            rubric_id: &rubric.id,
            rubric_name: &rubric.name,
            task_type: &req.task_type,
            model: &req.model,
            feedback_lang: &req.feedback_lang,
            media_resolution: res_mode.as_key(),
            duration_ms: Some(elapsed_ms),
            result: &result,
        })
        .map_err(|e| e.to_string())?;

    let detail = state
        .db
        .get_assessment(assessment_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Không đọc lại được bản ghi vừa lưu.".to_string())?;

    let export_dir = state.effective_export_dir();
    let out_xlsx = default_export_path(&export_dir, &video_name);
    export_to_excel(&result, &video_name, &rubric.name, &out_xlsx).map_err(|e| e.to_string())?;

    emit_progress(&app, &req.task_id, "Chấm điểm hoàn tất!", Some(100.0));

    Ok(GradeResponse {
        detail,
        excel_path: out_xlsx.to_string_lossy().into_owned(),
        reused_upload_cache: reused_cache,
    })
}

fn resolve_ffmpeg_for_state(state: &AppState) -> Result<PathBuf, String> {
    resolve_ffmpeg(
        state.effective_ffmpeg_custom_path().as_deref(),
        Some(&state.paths.bin_dir),
    )
    .ok_or_else(|| {
        "Không tìm thấy ffmpeg. Hãy cài ffmpeg vào PATH hoặc trỏ đường dẫn ffmpeg trong Cài đặt."
            .to_string()
    })
}

fn resolve_media_output_targets(
    state: &AppState,
    out_dir_override: Option<String>,
    out_path_override: Option<String>,
) -> (PathBuf, Option<PathBuf>) {
    let out_dir = out_dir_override
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| state.effective_export_dir());
    let out_file = out_path_override
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    (out_dir, out_file)
}

fn build_media_output(
    state: &AppState,
    out_path: PathBuf,
    orig_size_mb: f64,
    fallback_name: &str,
) -> MediaOutput {
    state.media_server.authorize_path(&out_path);
    let size_bytes = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
    let file_name = out_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(fallback_name)
        .to_string();
    MediaOutput {
        output_path: out_path.to_string_lossy().into_owned(),
        file_name,
        size_bytes,
        size_mb: size_bytes as f64 / (1024.0 * 1024.0),
        orig_size_mb,
    }
}

#[tauri::command]
pub async fn probe_media_duration(
    state: State<'_, AppState>,
    path: String,
) -> Result<Option<f64>, String> {
    let Ok(ffmpeg) = resolve_ffmpeg_for_state(&state) else {
        return Ok(None);
    };
    Ok(probe_duration_secs(&ffmpeg, Path::new(&path)).await)
}

#[tauri::command]
pub async fn compress_video_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    video_path: String,
    preset: String,
    out_dir_override: Option<String>,
    out_path_override: Option<String>,
) -> Result<MediaOutput, String> {
    let ffmpeg = resolve_ffmpeg_for_state(&state)?;
    let src = PathBuf::from(&video_path);
    let orig_size_mb = std::fs::metadata(&src)
        .map(|m| m.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    let (out_dir, out_file) =
        resolve_media_output_targets(&state, out_dir_override, out_path_override);

    let cancel = state.register_task(&task_id).await;
    let res = compress_video_to(
        &ffmpeg,
        &src,
        &preset,
        &out_dir,
        out_file.as_deref(),
        |p| emit_progress(&app, &task_id, p.stage, p.percent),
        Some(&cancel),
    )
    .await;
    state.finish_task(&task_id).await;

    let out_path = res.map_err(|e| e.to_string())?;
    Ok(build_media_output(
        &state,
        out_path,
        orig_size_mb,
        "compressed.mp4",
    ))
}

#[tauri::command]
pub async fn extract_mp3_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    video_path: String,
    preset: String,
    out_dir_override: Option<String>,
    out_path_override: Option<String>,
) -> Result<MediaOutput, String> {
    let ffmpeg = resolve_ffmpeg_for_state(&state)?;
    let src = PathBuf::from(&video_path);
    let orig_size_mb = std::fs::metadata(&src)
        .map(|m| m.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    let (out_dir, out_file) =
        resolve_media_output_targets(&state, out_dir_override, out_path_override);

    let cancel = state.register_task(&task_id).await;
    let res = extract_mp3_to(
        &ffmpeg,
        &src,
        &preset,
        &out_dir,
        out_file.as_deref(),
        |p| emit_progress(&app, &task_id, p.stage, p.percent),
        Some(&cancel),
    )
    .await;
    state.finish_task(&task_id).await;

    let out_path = res.map_err(|e| e.to_string())?;
    Ok(build_media_output(
        &state,
        out_path,
        orig_size_mb,
        "audio.mp3",
    ))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn trim_media_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    input_path: String,
    start_secs: f64,
    end_secs: Option<f64>,
    fast_copy: bool,
    out_dir_override: Option<String>,
    out_path_override: Option<String>,
) -> Result<MediaOutput, String> {
    let ffmpeg = resolve_ffmpeg_for_state(&state)?;
    let src = PathBuf::from(&input_path);
    let orig_size_mb = std::fs::metadata(&src)
        .map(|m| m.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    let (out_dir, out_file) =
        resolve_media_output_targets(&state, out_dir_override, out_path_override);

    let cancel = state.register_task(&task_id).await;
    let res = trim_media_to(
        &ffmpeg,
        &src,
        start_secs,
        end_secs,
        fast_copy,
        &out_dir,
        out_file.as_deref(),
        |p| emit_progress(&app, &task_id, p.stage, p.percent),
        Some(&cancel),
    )
    .await;
    state.finish_task(&task_id).await;

    let out_path = res.map_err(|e| e.to_string())?;
    Ok(build_media_output(
        &state,
        out_path,
        orig_size_mb,
        "trimmed.mp4",
    ))
}

#[tauri::command]
pub async fn mute_video_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    video_path: String,
    out_dir_override: Option<String>,
    out_path_override: Option<String>,
) -> Result<MediaOutput, String> {
    let ffmpeg = resolve_ffmpeg_for_state(&state)?;
    let src = PathBuf::from(&video_path);
    let orig_size_mb = std::fs::metadata(&src)
        .map(|m| m.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    let (out_dir, out_file) =
        resolve_media_output_targets(&state, out_dir_override, out_path_override);

    let cancel = state.register_task(&task_id).await;
    let res = mute_video_to(
        &ffmpeg,
        &src,
        &out_dir,
        out_file.as_deref(),
        |p| emit_progress(&app, &task_id, p.stage, p.percent),
        Some(&cancel),
    )
    .await;
    state.finish_task(&task_id).await;

    let out_path = res.map_err(|e| e.to_string())?;
    Ok(build_media_output(
        &state,
        out_path,
        orig_size_mb,
        "muted.mp4",
    ))
}

fn render_transcript_by_format(
    transcript: &TranscriptResult,
    source_name: &str,
    format: &str,
) -> (String, &'static str) {
    match format.trim().to_ascii_lowercase().as_str() {
        "srt" => (format_transcript_srt_with_mode(transcript, "all"), "srt"),
        "txt" => (format_transcript_text(transcript, source_name), "txt"),
        _ => (format_transcript_markdown(transcript, source_name), "md"),
    }
}

fn write_transcript_to_path(
    transcript: &TranscriptResult,
    source_name: &str,
    format: &str,
    target_path: &Path,
) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Không tạo được thư mục lưu script: {e}"))?;
    }
    let (content, _) = render_transcript_by_format(transcript, source_name, format);
    std::fs::write(target_path, content).map_err(|e| format!("Không ghi được file script: {e}"))
}

#[tauri::command]
pub async fn generate_script_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    req: GenerateScriptRequest,
) -> Result<GenerateScriptResponse, String> {
    let src = PathBuf::from(&req.input_path);
    if !src.is_file() {
        return Err("Chưa chọn file video hoặc audio hợp lệ.".into());
    }
    state.media_server.authorize_path(&src);

    let key = state.resolve_api_key(req.api_key.as_deref());
    let client = GeminiClient::new(&key).map_err(|e| e.to_string())?;

    let orig_size_mb = std::fs::metadata(&src)
        .map(|m| m.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    let source_name = src
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("media")
        .to_string();
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("script");

    let (out_dir, out_file) =
        resolve_media_output_targets(&state, req.out_dir_override, req.out_path_override);
    let mp3_out_dir = out_file
        .as_deref()
        .and_then(Path::parent)
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| out_dir.clone());

    let is_mp3 = src
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("mp3"));
    let need_extract = !is_mp3 || req.enhance_speech || req.keep_mp3;

    let cancel = state.register_task(&req.task_id).await;
    let mut temp_mp3_to_cleanup: Option<PathBuf> = None;

    let mp3_path_res: Result<Option<PathBuf>, String> = if need_extract {
        match resolve_ffmpeg_for_state(&state) {
            Ok(ffmpeg) => {
                let mp3_target = if req.keep_mp3 {
                    let candidate = mp3_out_dir.join(format!("{stem}_speech.mp3"));
                    if candidate == src {
                        mp3_out_dir.join(format!("{stem}_speech_cleaned.mp3"))
                    } else {
                        candidate
                    }
                } else {
                    let safe_id: String = req
                        .task_id
                        .chars()
                        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
                        .collect();
                    let tmp = std::env::temp_dir().join(format!("englishspeak_{safe_id}.mp3"));
                    temp_mp3_to_cleanup = Some(tmp.clone());
                    tmp
                };

                extract_speech_mp3_to(
                    &ffmpeg,
                    &src,
                    &req.mp3_preset,
                    req.enhance_speech,
                    &mp3_out_dir,
                    Some(&mp3_target),
                    |p| {
                        let mapped = p.percent.map(|v| (v * 0.35).min(35.0));
                        emit_progress(&app, &req.task_id, p.stage, mapped);
                    },
                    Some(&cancel),
                )
                .await
                .map(Some)
                .map_err(|e| e.to_string())
            }
            Err(err) => Err(err),
        }
    } else {
        Ok(None)
    };

    let extracted_mp3 = match mp3_path_res {
        Ok(p) => p,
        Err(err) => {
            state.finish_task(&req.task_id).await;
            if let Some(tmp) = &temp_mp3_to_cleanup {
                let _ = tokio::fs::remove_file(tmp).await;
            }
            return Err(err);
        }
    };

    let audio_for_gemini = extracted_mp3.clone().unwrap_or_else(|| src.clone());
    let using_temp_mp3 = temp_mp3_to_cleanup.is_some();

    let upload_res = if using_temp_mp3 {
        client
            .upload_video(
                &audio_for_gemini,
                Duration::from_secs(2),
                Duration::from_secs(600),
                |p| {
                    let mapped = p.percent.map(|v| 35.0 + v * 0.25);
                    emit_progress(&app, &req.task_id, p.stage, mapped);
                },
                Some(&cancel),
            )
            .await
            .map(|u| (u, false))
    } else {
        client
            .get_or_upload(
                &audio_for_gemini,
                &state.upload_cache,
                Duration::from_secs(2),
                Duration::from_secs(600),
                |p| {
                    let mapped = p.percent.map(|v| 35.0 + v * 0.25);
                    emit_progress(&app, &req.task_id, p.stage, mapped);
                },
                Some(&cancel),
            )
            .await
    };

    let (uploaded, reused_upload_cache) = match upload_res {
        Ok(res) => res,
        Err(err) => {
            state.finish_task(&req.task_id).await;
            if let Some(tmp) = &temp_mp3_to_cleanup {
                let _ = tokio::fs::remove_file(tmp).await;
            }
            return Err(err.to_string());
        }
    };

    emit_progress(
        &app,
        &req.task_id,
        format!("Gemini ({}) đang nghe audio & chép script...", req.model),
        Some(62.0),
    );

    let opts = TranscribeOptions {
        interaction_mode: req.interaction_mode,
        speaker_hints: req.speaker_hints,
        verbatim_mode: req.verbatim_mode,
        include_translation: req.include_translation,
        include_grammar_notes: req.include_grammar_notes,
        extra_instructions: req.extra_instructions,
    };

    let transcript_res = client
        .transcribe_audio(&uploaded, &req.model, &opts, Some(&cancel))
        .await;

    state.finish_task(&req.task_id).await;
    if let Some(tmp) = &temp_mp3_to_cleanup {
        let _ = tokio::fs::remove_file(tmp).await;
    }
    if using_temp_mp3 {
        client.cleanup_file(&uploaded.name).await;
    }

    let transcript = transcript_res.map_err(|e| e.to_string())?;

    emit_progress(&app, &req.task_id, "Đang lưu file Script...", Some(95.0));

    let script_path = out_file.unwrap_or_else(|| out_dir.join(format!("{stem}_script.md")));
    let script_ext = script_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("md");
    write_transcript_to_path(&transcript, &source_name, script_ext, &script_path)?;

    let script_output = build_media_output(&state, script_path, orig_size_mb, "script.md");
    let mp3_output = if req.keep_mp3 {
        extracted_mp3.map(|p| build_media_output(&state, p, orig_size_mb, "speech.mp3"))
    } else {
        None
    };

    emit_progress(&app, &req.task_id, "Tạo Script hoàn tất!", Some(100.0));

    Ok(GenerateScriptResponse {
        transcript,
        source_name,
        script_output,
        mp3_output,
        reused_upload_cache,
    })
}

#[tauri::command]
pub fn export_transcript_file(
    state: State<'_, AppState>,
    transcript: TranscriptResult,
    source_name: String,
    format: String,
    out_path: String,
) -> Result<MediaOutput, String> {
    let target = PathBuf::from(out_path.trim());
    if target.as_os_str().is_empty() {
        return Err("Đường dẫn file xuất không hợp lệ.".into());
    }
    let (_, ext) = render_transcript_by_format(&transcript, &source_name, &format);
    write_transcript_to_path(&transcript, &source_name, &format, &target)?;
    let fallback_name = format!("script.{ext}");
    Ok(build_media_output(&state, target, 0.0, &fallback_name))
}

#[tauri::command]
pub async fn embed_subtitles_video_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    req: EmbedSubtitlesRequest,
) -> Result<MediaOutput, String> {
    let ffmpeg = resolve_ffmpeg_for_state(&state)?;
    let src = PathBuf::from(&req.video_path);
    if !src.is_file() {
        return Err("Chưa chọn file video gốc hợp lệ.".into());
    }
    if req.transcript.segments.is_empty() {
        return Err("Script chưa có dòng thoại nào để ghép vào video.".into());
    }
    state.media_server.authorize_path(&src);

    let orig_size_mb = std::fs::metadata(&src)
        .map(|m| m.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    let (out_dir, out_file) =
        resolve_media_output_targets(&state, req.out_dir_override, req.out_path_override);

    let burn_in = !req.burn_mode.trim().eq_ignore_ascii_case("softsub");
    let safe_id: String = req
        .task_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let (sub_ext, sub_content) = if burn_in {
        (
            "ass",
            format_transcript_ass(&req.transcript, &req.content_mode),
        )
    } else {
        (
            "srt",
            format_transcript_srt_with_mode(&req.transcript, &req.content_mode),
        )
    };
    let temp_sub_path = std::env::temp_dir().join(format!("englishspeak_sub_{safe_id}.{sub_ext}"));
    std::fs::write(&temp_sub_path, sub_content)
        .map_err(|e| format!("Không ghi được file phụ đề tạm: {e}"))?;

    let cancel = state.register_task(&req.task_id).await;
    let res = embed_subtitles_video_to(
        &ffmpeg,
        &src,
        &temp_sub_path,
        burn_in,
        &out_dir,
        out_file.as_deref(),
        |p| emit_progress(&app, &req.task_id, p.stage, p.percent),
        Some(&cancel),
    )
    .await;
    state.finish_task(&req.task_id).await;
    let _ = tokio::fs::remove_file(&temp_sub_path).await;

    let out_path = res.map_err(|e| e.to_string())?;
    let fallback_name = if burn_in {
        "subtitled.mp4"
    } else {
        "softsub.mp4"
    };
    Ok(build_media_output(
        &state,
        out_path,
        orig_size_mb,
        fallback_name,
    ))
}

#[tauri::command]
pub fn list_rubrics(state: State<'_, AppState>) -> Result<Vec<Rubric>, String> {
    state.db.list_rubrics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_custom_rubric(
    state: State<'_, AppState>,
    rubric: Rubric,
) -> Result<Vec<Rubric>, String> {
    state
        .db
        .save_custom_rubric(&rubric)
        .map_err(|e| e.to_string())?;
    state.db.list_rubrics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clone_rubric(
    state: State<'_, AppState>,
    source_id: String,
    new_id: String,
    new_name: String,
) -> Result<Vec<Rubric>, String> {
    state
        .db
        .clone_rubric(&source_id, &new_id, &new_name)
        .map_err(|e| e.to_string())?;
    state.db.list_rubrics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_custom_rubric(state: State<'_, AppState>, id: String) -> Result<Vec<Rubric>, String> {
    state
        .db
        .delete_custom_rubric(&id)
        .map_err(|e| e.to_string())?;
    state.db.list_rubrics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_grading_assignments(
    state: State<'_, AppState>,
) -> Result<Vec<GradingAssignment>, String> {
    state
        .db
        .list_grading_assignments()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_grading_assignment(
    state: State<'_, AppState>,
    assignment: GradingAssignment,
) -> Result<Vec<GradingAssignment>, String> {
    state
        .db
        .save_grading_assignment(&assignment)
        .map_err(|e| e.to_string())?;
    state
        .db
        .list_grading_assignments()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_grading_assignment(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<GradingAssignment>, String> {
    state
        .db
        .delete_grading_assignment(&id)
        .map_err(|e| e.to_string())?;
    state
        .db
        .list_grading_assignments()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_image_file(path: String) -> Result<AssignmentImage, String> {
    AssignmentImage::from_file(Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_assessments(
    state: State<'_, AppState>,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<AssessmentSummary>, String> {
    state
        .db
        .list_assessments(query.as_deref(), limit.unwrap_or(100))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_assessment(state: State<'_, AppState>, id: i64) -> Result<AssessmentDetail, String> {
    let detail = state
        .db
        .get_assessment(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Không tìm thấy bản ghi ID {id}."))?;
    if let Some(vp) = &detail.video_path {
        state.media_server.authorize_path(Path::new(vp));
    }
    Ok(detail)
}

#[tauri::command]
pub fn rename_student(
    state: State<'_, AppState>,
    assessment_id: i64,
    student_assessment_id: i64,
    new_name: String,
) -> Result<AssessmentDetail, String> {
    state
        .db
        .rename_student(student_assessment_id, &new_name)
        .map_err(|e| e.to_string())?;
    state
        .db
        .get_assessment(assessment_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Không tìm thấy bản ghi ID {assessment_id}."))
}

#[tauri::command]
pub fn delete_assessment(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.db.delete_assessment(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_assessment_excel(
    state: State<'_, AppState>,
    assessment_id: i64,
    out_path: Option<String>,
) -> Result<String, String> {
    let detail = state
        .db
        .get_assessment(assessment_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Không tìm thấy bản ghi ID {assessment_id}."))?;
    let result = detail.to_assessment_result();
    let target = match out_path.filter(|s| !s.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => default_export_path(&state.effective_export_dir(), &detail.video_name),
    };
    export_to_excel(&result, &detail.video_name, &detail.rubric_name, &target)
        .map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_assessment_markdown(
    state: State<'_, AppState>,
    assessment_id: i64,
) -> Result<String, String> {
    let detail = state
        .db
        .get_assessment(assessment_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Không tìm thấy bản ghi ID {assessment_id}."))?;
    Ok(format_result_markdown(&detail.to_assessment_result()))
}

#[tauri::command]
pub fn save_prompt_profile(
    state: State<'_, AppState>,
    profile: PromptProfile,
    set_active: Option<bool>,
) -> Result<AppBootstrap, String> {
    state
        .db
        .save_prompt_profile(&profile)
        .map_err(|e| e.to_string())?;
    if set_active.unwrap_or(false) {
        state
            .db
            .set_active_prompt_profile(profile.id.trim())
            .map_err(|e| e.to_string())?;
    }
    get_bootstrap(state)
}

#[tauri::command]
pub fn clone_prompt_profile(
    state: State<'_, AppState>,
    source_id: String,
    new_id: String,
    new_name: String,
    set_active: Option<bool>,
) -> Result<AppBootstrap, String> {
    let created = state
        .db
        .clone_prompt_profile(&source_id, &new_id, &new_name)
        .map_err(|e| e.to_string())?;
    if set_active.unwrap_or(true) {
        state
            .db
            .set_active_prompt_profile(&created.id)
            .map_err(|e| e.to_string())?;
    }
    get_bootstrap(state)
}

#[tauri::command]
pub fn delete_prompt_profile(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppBootstrap, String> {
    state
        .db
        .delete_prompt_profile(&id)
        .map_err(|e| e.to_string())?;
    get_bootstrap(state)
}

#[tauri::command]
pub fn set_active_prompt_profile(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppBootstrap, String> {
    state
        .db
        .set_active_prompt_profile(&id)
        .map_err(|e| e.to_string())?;
    get_bootstrap(state)
}

#[tauri::command]
pub fn reset_prompt_profile(state: State<'_, AppState>) -> Result<AppBootstrap, String> {
    state.db.reset_prompt_profile().map_err(|e| e.to_string())?;
    get_bootstrap(state)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn preview_grading_prompt(
    state: State<'_, AppState>,
    profile: Option<PromptProfile>,
    profile_id: Option<String>,
    rubric: Option<Rubric>,
    rubric_id: Option<String>,
    task_type: String,
    feedback_lang: String,
    student_names_raw: String,
    extra_instructions: String,
) -> Result<PromptParts, String> {
    let resolved_profile = match profile {
        Some(p) => p,
        None => match profile_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            Some(pid) => state
                .db
                .get_prompt_profile(pid)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Không tìm thấy Prompt Profile '{pid}'."))?,
            None => state.db.load_prompt_profile().map_err(|e| e.to_string())?,
        },
    };
    let resolved_rubric = match rubric {
        Some(r) => r,
        None => {
            let rid = rubric_id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Thiếu rubric hoặc rubric_id để xem trước.".to_string())?;
            state
                .db
                .get_rubric(rid)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Không tìm thấy rubric '{rid}'."))?
        }
    };
    let student_names = parse_student_names(&student_names_raw);
    let names_opt = (!student_names.is_empty()).then_some(student_names.as_slice());
    Ok(build_prompt_parts(
        &resolved_profile,
        &resolved_rubric,
        &task_type,
        &feedback_lang,
        names_opt,
        &extra_instructions,
    ))
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: SettingsUpdate,
) -> Result<AppBootstrap, String> {
    if settings.clear_api_key == Some(true) {
        state
            .db
            .delete_setting("gemini_api_key")
            .map_err(|e| e.to_string())?;
    } else if let Some(k) = settings.api_key {
        let trimmed = k.trim();
        if !trimmed.is_empty() {
            state
                .db
                .set_setting("gemini_api_key", trimmed)
                .map_err(|e| e.to_string())?;
        }
    }

    if let Some(m) = settings.default_model {
        state
            .db
            .set_setting("default_model", m.trim())
            .map_err(|e| e.to_string())?;
    }
    if let Some(r) = settings.media_resolution {
        state
            .db
            .set_setting("media_resolution", r.trim())
            .map_err(|e| e.to_string())?;
    }
    if let Some(dir) = settings.export_dir {
        let trimmed = dir.trim();
        if trimmed.is_empty() {
            state
                .db
                .delete_setting("export_dir")
                .map_err(|e| e.to_string())?;
        } else {
            state
                .db
                .set_setting("export_dir", trimmed)
                .map_err(|e| e.to_string())?;
        }
    }
    if let Some(ff) = settings.ffmpeg_custom_path {
        state
            .db
            .set_setting("ffmpeg_path", ff.trim())
            .map_err(|e| e.to_string())?;
    }

    get_bootstrap(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_key_hides_empty_short_and_long_keys() {
        assert_eq!(mask_key(""), "");
        assert_eq!(mask_key("   "), "");
        assert_eq!(mask_key("abcd1234"), "••••••••");
        assert_eq!(mask_key("AIzaSyDummyKey123456"), "AIza••••3456");
    }

    #[test]
    fn parse_student_names_trims_and_ignores_blank_entries() {
        assert_eq!(
            parse_student_names("  An , Bình,,  Chi , "),
            vec!["An".to_string(), "Bình".to_string(), "Chi".to_string()]
        );
        assert!(parse_student_names(" , , ").is_empty());
    }
}
