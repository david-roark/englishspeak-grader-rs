use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncRead, ReadBuf};
use tokio::sync::Mutex;
use tokio_util::io::ReaderStream;
use tokio_util::sync::CancellationToken;

use crate::error::{GraderError, Result};
use crate::prompts::{build_prompt_parts, PromptProfile};
use crate::rubrics::Rubric;
use crate::schemas::{assessment_result_gemini_schema, AssessmentResult};

pub const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com";

pub const FALLBACK_MODELS: &[&str] = &[
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
];

pub const DEFAULT_MODEL: &str = FALLBACK_MODELS[0];

/// 47 giờ (biên an toàn dưới hạn 48 giờ của Gemini File API).
pub const UPLOAD_TTL_SECS: u64 = 47 * 3600;

const EXCLUDE_KEYWORDS: &[&str] = &[
    "tts",
    "audio",
    "live",
    "image",
    "nano-banana",
    "robotics",
    "embedding",
    "computer-use",
    "veo",
    "imagen",
    "lyria",
    "aqa",
    "learnlm",
];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum MediaResolution {
    #[default]
    Low,
    Default,
    High,
}

impl MediaResolution {
    pub fn from_str_lossy(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "default" | "medium" => Self::Default,
            "high" => Self::High,
            _ => Self::Low,
        }
    }

    pub fn as_key(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Default => "default",
            Self::High => "high",
        }
    }

    pub fn as_api_str(&self) -> &'static str {
        match self {
            Self::Low => "MEDIA_RESOLUTION_LOW",
            Self::Default => "MEDIA_RESOLUTION_MEDIUM",
            Self::High => "MEDIA_RESOLUTION_HIGH",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UploadedFile {
    pub name: String,
    pub uri: String,
    pub mime_type: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadProgress {
    pub stage: String,
    pub percent: Option<f32>,
    pub bytes_sent: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone)]
pub struct CachedUpload {
    pub canonical_path: PathBuf,
    pub file_size: u64,
    pub modified_secs: u64,
    pub uploaded: UploadedFile,
    pub uploaded_at_secs: u64,
}

/// Thread-safe upload cache for reusing Gemini uploaded files within TTL.
#[derive(Debug, Default, Clone)]
pub struct UploadCache {
    inner: Arc<Mutex<Option<CachedUpload>>>,
}

impl UploadCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get(&self) -> Option<CachedUpload> {
        self.inner.lock().await.clone()
    }

    pub async fn set(&self, entry: Option<CachedUpload>) {
        *self.inner.lock().await = entry;
    }

    pub async fn clear(&self) {
        *self.inner.lock().await = None;
    }
}

pub fn validate_api_key(api_key: &str) -> Result<String> {
    let key = api_key.trim();
    if key.is_empty() || key == "dan_key_cua_ban_vao_day" {
        return Err(GraderError::Gemini(
            "Chưa có GEMINI_API_KEY. Lấy key miễn phí tại https://aistudio.google.com \
             (Get API key), rồi dán vào ô API key hoặc phần Cài đặt."
                .to_string(),
        ));
    }
    Ok(key.to_string())
}

pub fn is_gradable_model(model_id: &str) -> bool {
    let mid = model_id
        .trim()
        .to_lowercase();
    let mid = mid.strip_prefix("models/").unwrap_or(&mid);
    if !mid.starts_with("gemini") {
        return false;
    }
    if EXCLUDE_KEYWORDS.iter().any(|k| mid.contains(k)) {
        return false;
    }
    mid.contains("flash") || mid.contains("pro")
}

pub fn rank_model(model_id: &str) -> (u8, String) {
    let mid = model_id.to_lowercase();
    let tier = if mid.contains("flash-lite") || mid.contains("flash-8b") {
        0
    } else if mid.contains("flash") {
        1
    } else if mid.contains("pro") {
        2
    } else {
        3
    };
    (tier, mid)
}

pub fn filter_and_sort_models(models: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut ids: Vec<String> = models
        .into_iter()
        .map(|m| m.strip_prefix("models/").unwrap_or(&m).to_string())
        .filter(|m| is_gradable_model(m) && seen.insert(m.clone()))
        .collect();
    if ids.is_empty() {
        return FALLBACK_MODELS.iter().map(|s| (*s).to_string()).collect();
    }
    ids.sort_by_key(|m| rank_model(m));
    ids
}

pub fn detect_video_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("webm") => "video/webm",
        Some("avi") => "video/x-msvideo",
        Some("mpeg") | Some("mpg") => "video/mpeg",
        Some("wmv") => "video/x-ms-wmv",
        Some("3gp") | Some("3gpp") => "video/3gpp",
        Some("flv") => "video/x-flv",
        Some("mkv") => "video/x-matroska",
        _ => "video/mp4",
    }
}

#[derive(Clone)]
pub struct GeminiClient {
    http: reqwest::Client,
    api_key: String,
    base_url: String,
}

impl GeminiClient {
    pub fn new(api_key: &str) -> Result<Self> {
        Self::with_base_url(api_key, DEFAULT_BASE_URL)
    }

    pub fn with_base_url(api_key: &str, base_url: impl Into<String>) -> Result<Self> {
        let key = validate_api_key(api_key)?;
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| GraderError::Gemini(format!("Không khởi tạo được HTTP client: {e}")))?;
        Ok(Self {
            http,
            api_key: key,
            base_url: base_url.into().trim_end_matches('/').to_string(),
        })
    }

    /// Lấy danh sách model hỗ trợ chấm video từ tài khoản người dùng; fallback về `FALLBACK_MODELS`.
    pub async fn list_models(&self) -> Vec<String> {
        match self.fetch_models_inner().await {
            Ok(list) if !list.is_empty() => list,
            _ => FALLBACK_MODELS.iter().map(|s| (*s).to_string()).collect(),
        }
    }

    async fn fetch_models_inner(&self) -> Result<Vec<String>> {
        let mut collected = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut url = format!("{}/v1beta/models?key={}", self.base_url, self.api_key);
            if let Some(tok) = &page_token {
                url.push_str(&format!("&pageToken={tok}"));
            }
            let resp = self
                .http
                .get(&url)
                .timeout(Duration::from_secs(20))
                .send()
                .await
                .map_err(|e| GraderError::Gemini(e.to_string()))?;

            if !resp.status().is_success() {
                return Err(GraderError::Gemini(format!("HTTP {}", resp.status())));
            }

            let body: ListModelsResponse = resp
                .json()
                .await
                .map_err(|e| GraderError::Gemini(e.to_string()))?;

            for m in body.models {
                if !m.supported_generation_methods.is_empty()
                    && !m
                        .supported_generation_methods
                        .iter()
                        .any(|a| a == "generateContent")
                {
                    continue;
                }
                let name = m.name.strip_prefix("models/").unwrap_or(&m.name).to_string();
                if is_gradable_model(&name) {
                    collected.push(name);
                }
            }

            match body.next_page_token {
                Some(tok) if !tok.is_empty() => page_token = Some(tok),
                _ => break,
            }
        }

        Ok(filter_and_sort_models(collected))
    }

    /// Lấy thông tin trạng thái của file trên Gemini File API.
    pub async fn get_file(&self, file_name: &str) -> Result<UploadedFile> {
        let normalized = file_name.strip_prefix('/').unwrap_or(file_name);
        let url = format!("{}/v1beta/{}?key={}", self.base_url, normalized, self.api_key);
        let resp = self
            .http
            .get(&url)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| GraderError::Gemini(format!("Lỗi kiểm tra file Gemini: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let txt = resp.text().await.unwrap_or_default();
            return Err(GraderError::Gemini(format!(
                "Lỗi kiểm tra file ({status}): {txt}"
            )));
        }

        let raw: GeminiFileResponse = resp
            .json()
            .await
            .map_err(|e| GraderError::Gemini(format!("Phản hồi file không hợp lệ: {e}")))?;

        Ok(raw.into_uploaded())
    }

    /// Upload video qua Google Resumable Upload API (streaming từ đĩa, không tốn RAM) và chờ tới `ACTIVE`.
    pub async fn upload_video<F>(
        &self,
        video_path: &Path,
        poll_interval: Duration,
        timeout: Duration,
        mut on_progress: F,
        cancel: Option<&CancellationToken>,
    ) -> Result<UploadedFile>
    where
        F: FnMut(UploadProgress) + Send,
    {
        if !video_path.exists() {
            return Err(GraderError::Gemini(format!(
                "Không tìm thấy file video: {}",
                video_path.display()
            )));
        }
        check_cancelled(cancel)?;

        let meta = tokio::fs::metadata(video_path).await?;
        let total_bytes = meta.len();
        let mime_type = detect_video_mime(video_path);
        let display_name = video_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("video.mp4");

        on_progress(UploadProgress {
            stage: "Đang khởi tạo tải video lên Gemini...".into(),
            percent: Some(0.0),
            bytes_sent: 0,
            total_bytes,
        });

        // 1. Start resumable session
        let start_url = format!("{}/upload/v1beta/files?key={}", self.base_url, self.api_key);
        let start_resp = self
            .http
            .post(&start_url)
            .header("X-Goog-Upload-Protocol", "resumable")
            .header("X-Goog-Upload-Command", "start")
            .header("X-Goog-Upload-Header-Content-Length", total_bytes.to_string())
            .header("X-Goog-Upload-Header-Content-Type", mime_type)
            .json(&json!({ "file": { "display_name": display_name } }))
            .send()
            .await
            .map_err(|e| GraderError::Gemini(format!("Lỗi kết nối khi upload video: {e}")))?;

        if !start_resp.status().is_success() {
            let status = start_resp.status();
            let txt = start_resp.text().await.unwrap_or_default();
            return Err(GraderError::Gemini(format!(
                "Không thể bắt đầu upload video ({status}): {txt}"
            )));
        }

        let upload_url = extract_upload_url(start_resp.headers())?;

        // 2. Stream file body with progress reporting
        let file = tokio::fs::File::open(video_path).await?;
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<u64>();
        let reader = ProgressAsyncReader {
            inner: file,
            bytes_read: 0,
            tx,
            cancel: cancel.cloned(),
        };
        let stream = ReaderStream::with_capacity(reader, 256 * 1024);
        let body = reqwest::Body::wrap_stream(stream);

        let upload_fut = self
            .http
            .post(&upload_url)
            .header("Content-Length", total_bytes.to_string())
            .header("X-Goog-Upload-Offset", "0")
            .header("X-Goog-Upload-Command", "upload, finalize")
            .body(body)
            .send();

        tokio::pin!(upload_fut);

        let upload_resp = loop {
            tokio::select! {
                Some(sent) = rx.recv() => {
                    let pct = if total_bytes > 0 {
                        Some(((sent as f64 / total_bytes as f64) * 100.0).min(100.0) as f32)
                    } else {
                        Some(100.0)
                    };
                    on_progress(UploadProgress {
                        stage: "Đang tải video lên Gemini...".into(),
                        percent: pct,
                        bytes_sent: sent,
                        total_bytes,
                    });
                }
                res = &mut upload_fut => {
                    break res.map_err(|e| GraderError::Gemini(format!("Upload video thất bại: {e}")))?;
                }
            }
        };

        check_cancelled(cancel)?;

        if !upload_resp.status().is_success() {
            let status = upload_resp.status();
            let txt = upload_resp.text().await.unwrap_or_default();
            return Err(GraderError::Gemini(format!(
                "Upload video bị từ chối ({status}): {txt}"
            )));
        }

        let wrapper: GeminiFileWrapper = upload_resp
            .json()
            .await
            .map_err(|e| GraderError::Gemini(format!("Phản hồi upload không hợp lệ: {e}")))?;
        let mut uploaded = wrapper.file.into_uploaded();
        if uploaded.name.is_empty() {
            return Err(GraderError::Gemini(
                "Upload video lỗi: không nhận được mã file từ Gemini.".into(),
            ));
        }

        // 3. Poll until ACTIVE
        let deadline = tokio::time::Instant::now() + timeout;
        while uploaded.state != "ACTIVE" && uploaded.state != "FAILED" {
            check_cancelled(cancel)?;
            if tokio::time::Instant::now() > deadline {
                return Err(GraderError::Gemini(
                    "Hết thời gian chờ Gemini xử lý video.".into(),
                ));
            }
            on_progress(UploadProgress {
                stage: "Gemini đang xử lý video...".into(),
                percent: None,
                bytes_sent: total_bytes,
                total_bytes,
            });
            tokio::time::sleep(poll_interval).await;
            check_cancelled(cancel)?;
            uploaded = self.get_file(&uploaded.name).await?;
        }

        if uploaded.state == "FAILED" {
            return Err(GraderError::Gemini(
                "Gemini xử lý video thất bại. Thử lại hoặc đổi định dạng video.".into(),
            ));
        }

        on_progress(UploadProgress {
            stage: "Video sẵn sàng để chấm.".into(),
            percent: Some(100.0),
            bytes_sent: total_bytes,
            total_bytes,
        });

        Ok(uploaded)
    }

    /// Tái dùng video đã upload nếu khớp `(canonical_path, size, mtime)` và còn hạn (< 47h).
    pub async fn get_or_upload<F>(
        &self,
        video_path: &Path,
        cache: &UploadCache,
        poll_interval: Duration,
        timeout: Duration,
        mut on_progress: F,
        cancel: Option<&CancellationToken>,
    ) -> Result<(UploadedFile, bool)>
    where
        F: FnMut(UploadProgress) + Send,
    {
        let canonical = std::fs::canonicalize(video_path).unwrap_or_else(|_| video_path.to_path_buf());
        let meta = tokio::fs::metadata(video_path).await?;
        let file_size = meta.len();
        let modified_secs = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let now_secs = current_unix_secs();

        let existing = cache.get().await;
        if let Some(entry) = &existing {
            let same_file = entry.canonical_path == canonical
                && entry.file_size == file_size
                && entry.modified_secs == modified_secs;
            let not_expired = now_secs.saturating_sub(entry.uploaded_at_secs) < UPLOAD_TTL_SECS;

            if same_file && not_expired {
                if let Ok(fresh) = self.get_file(&entry.uploaded.name).await {
                    if fresh.state == "ACTIVE" {
                        on_progress(UploadProgress {
                            stage: "Dùng lại video đã tải (không upload lại)...".into(),
                            percent: Some(100.0),
                            bytes_sent: file_size,
                            total_bytes: file_size,
                        });
                        cache
                            .set(Some(CachedUpload {
                                canonical_path: canonical,
                                file_size,
                                modified_secs,
                                uploaded: fresh.clone(),
                                uploaded_at_secs: entry.uploaded_at_secs,
                            }))
                            .await;
                        return Ok((fresh, true));
                    }
                }
            }

            if !same_file {
                self.cleanup_file(&entry.uploaded.name).await;
            }
        }

        let uploaded = self
            .upload_video(video_path, poll_interval, timeout, on_progress, cancel)
            .await?;

        cache
            .set(Some(CachedUpload {
                canonical_path: canonical,
                file_size,
                modified_secs,
                uploaded: uploaded.clone(),
                uploaded_at_secs: current_unix_secs(),
            }))
            .await;

        Ok((uploaded, false))
    }

    /// Gửi video + prompt + JSON Schema cho Gemini để chấm điểm có cấu trúc.
    #[allow(clippy::too_many_arguments)]
    pub async fn grade_video(
        &self,
        uploaded: &UploadedFile,
        rubric: &Rubric,
        prompt_profile: &PromptProfile,
        model: &str,
        task_type: &str,
        feedback_language: &str,
        student_names: Option<&[String]>,
        extra_instructions: &str,
        media_resolution: MediaResolution,
        cancel: Option<&CancellationToken>,
    ) -> Result<AssessmentResult> {
        check_cancelled(cancel)?;

        let prompt_parts = build_prompt_parts(
            prompt_profile,
            rubric,
            task_type,
            feedback_language,
            student_names,
            extra_instructions,
        );

        let model_id = model.strip_prefix("models/").unwrap_or(model);
        let url = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            self.base_url, model_id, self.api_key
        );

        let temperature = if prompt_profile.temperature.is_finite() {
            prompt_profile.temperature.clamp(0.0, 1.0)
        } else {
            0.25
        };

        let mut body = json!({
            "contents": [{
                "role": "user",
                "parts": [
                    {
                        "fileData": {
                            "fileUri": uploaded.uri,
                            "mimeType": uploaded.mime_type
                        }
                    },
                    { "text": prompt_parts.user_prompt }
                ]
            }],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
                "responseJsonSchema": assessment_result_gemini_schema(),
                "mediaResolution": media_resolution.as_api_str()
            }
        });
        if !prompt_parts.system_instruction.is_empty() {
            body["systemInstruction"] = json!({
                "parts": [{ "text": prompt_parts.system_instruction }]
            });
        }

        let req_fut = self
            .http
            .post(&url)
            .timeout(Duration::from_secs(300))
            .json(&body)
            .send();

        let resp = if let Some(tok) = cancel {
            tokio::select! {
                _ = tok.cancelled() => return Err(GraderError::Cancelled),
                res = req_fut => res.map_err(|e| GraderError::Gemini(format!("Lỗi khi gọi Gemini: {e}")))?,
            }
        } else {
            req_fut
                .await
                .map_err(|e| GraderError::Gemini(format!("Lỗi khi gọi Gemini: {e}")))?
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let txt = resp.text().await.unwrap_or_default();
            return Err(GraderError::Gemini(format!(
                "Lỗi khi gọi Gemini ({status}): {txt}"
            )));
        }

        let raw: Value = resp
            .json()
            .await
            .map_err(|e| GraderError::Gemini(format!("Lỗi đọc phản hồi Gemini: {e}")))?;

        let text = extract_candidate_text(&raw);
        if text.trim().is_empty() {
            return Err(GraderError::Gemini(
                "Gemini không trả về kết quả. Thử lại hoặc đổi model.".into(),
            ));
        }

        let cleaned = strip_json_fence(text.trim());
        serde_json::from_str::<AssessmentResult>(cleaned).map_err(|e| {
            let preview: String = cleaned.chars().take(500).collect();
            GraderError::Gemini(format!(
                "Không đọc được kết quả JSON từ Gemini: {e}\n---\n{preview}"
            ))
        })
    }

    /// Xóa file đã upload khỏi Gemini (bỏ qua lỗi).
    pub async fn cleanup_file(&self, file_name: &str) {
        if file_name.trim().is_empty() {
            return;
        }
        let normalized = file_name.strip_prefix('/').unwrap_or(file_name);
        let url = format!("{}/v1beta/{}?key={}", self.base_url, normalized, self.api_key);
        let _ = self
            .http
            .delete(&url)
            .timeout(Duration::from_secs(15))
            .send()
            .await;
    }
}

fn check_cancelled(cancel: Option<&CancellationToken>) -> Result<()> {
    if cancel.is_some_and(CancellationToken::is_cancelled) {
        Err(GraderError::Cancelled)
    } else {
        Ok(())
    }
}

fn current_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn extract_upload_url(headers: &HeaderMap) -> Result<String> {
    headers
        .get("x-goog-upload-url")
        .or_else(|| headers.get("X-Goog-Upload-URL"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            GraderError::Gemini("Gemini không trả về X-Goog-Upload-URL để tải file.".into())
        })
}

fn extract_candidate_text(raw: &Value) -> String {
    let Some(parts) = raw
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(Value::as_array)
    else {
        return String::new();
    };

    let mut out = String::new();
    for p in parts {
        if p.get("thought").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        if let Some(t) = p.get("text").and_then(Value::as_str) {
            out.push_str(t);
        }
    }
    out
}

fn strip_json_fence(s: &str) -> &str {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        rest.trim().strip_suffix("```").unwrap_or(rest).trim()
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest.trim().strip_suffix("```").unwrap_or(rest).trim()
    } else {
        trimmed
    }
}

struct ProgressAsyncReader {
    inner: tokio::fs::File,
    bytes_read: u64,
    tx: tokio::sync::mpsc::UnboundedSender<u64>,
    cancel: Option<CancellationToken>,
}

impl AsyncRead for ProgressAsyncReader {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        if self.cancel.as_ref().is_some_and(CancellationToken::is_cancelled) {
            return Poll::Ready(Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "cancelled",
            )));
        }
        let before = buf.filled().len();
        let poll = Pin::new(&mut self.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &poll {
            let delta = (buf.filled().len() - before) as u64;
            if delta > 0 {
                self.bytes_read += delta;
                let _ = self.tx.send(self.bytes_read);
            }
        }
        poll
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListModelsResponse {
    #[serde(default)]
    models: Vec<GeminiModelInfo>,
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelInfo {
    #[serde(default)]
    name: String,
    #[serde(default)]
    supported_generation_methods: Vec<String>,
}

#[derive(Deserialize)]
struct GeminiFileWrapper {
    file: GeminiFileResponse,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiFileResponse {
    #[serde(default)]
    name: String,
    #[serde(default)]
    uri: String,
    #[serde(default)]
    mime_type: String,
    #[serde(default)]
    state: String,
}

impl GeminiFileResponse {
    fn into_uploaded(self) -> UploadedFile {
        UploadedFile {
            name: self.name,
            uri: self.uri,
            mime_type: if self.mime_type.is_empty() {
                "video/mp4".to_string()
            } else {
                self.mime_type
            },
            state: self.state,
        }
    }
}
