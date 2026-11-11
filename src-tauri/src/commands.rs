use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use grader_core::export::{default_export_path, export_to_excel};
use grader_core::{
    build_prompt_parts, compress_video_to, extract_mp3_to, format_result_markdown, mp3_presets,
    mute_video_to, probe_duration_secs, resolve_ffmpeg, trim_media_to, video_presets,
    AssessmentDetail, AssessmentSummary, GeminiClient, MediaResolution, Mp3Preset, NewAssessment,
    PromptParts, PromptProfile, Rubric, VideoPreset, DEFAULT_MODEL, FALLBACK_MODELS,
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
    pub prompt_profile: PromptProfile,
    pub prompt_profiles: Vec<PromptProfile>,
    pub active_prompt_profile_id: String,
    pub media_base_url: String,
    pub media_token: String,
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
    if trimmed.is_empty() || trimmed == "dan_key_cua_ban_vao_day" {
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
    let has_api_key = !key.is_empty() && key != "dan_key_cua_ban_vao_day";
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

    let rubric = state
        .db
        .get_rubric(&req.rubric_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Không tìm thấy rubric '{}'.", req.rubric_id))?;

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
        .grade_video(
            &uploaded,
            &rubric,
            &prompt_profile,
            &req.model,
            &req.task_type,
            &req.feedback_lang,
            names_opt,
            &req.extra_instructions,
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
    fn mask_key_hides_empty_placeholder_short_and_long_keys() {
        assert_eq!(mask_key(""), "");
        assert_eq!(mask_key("   "), "");
        assert_eq!(mask_key("dan_key_cua_ban_vao_day"), "");
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
