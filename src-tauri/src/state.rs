use std::collections::HashMap;
use std::path::PathBuf;

use grader_core::{AppPaths, Database, UploadCache};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::media_server::MediaServer;

pub struct AppState {
    pub paths: AppPaths,
    pub db: Database,
    pub upload_cache: UploadCache,
    pub media_server: MediaServer,
    cancel_tokens: Mutex<HashMap<String, CancellationToken>>,
}

impl AppState {
    pub fn initialize() -> Result<Self, String> {
        let paths = AppPaths::resolve();
        paths
            .ensure_dirs()
            .map_err(|e| format!("Không tạo được thư mục dữ liệu: {e}"))?;

        let db = Database::new(&paths.db_path);
        db.init()
            .map_err(|e| format!("Không khởi tạo được SQLite: {e}"))?;

        let media_server = MediaServer::start()
            .map_err(|e| format!("Không khởi động được media server nội bộ: {e}"))?;

        Ok(Self {
            paths,
            db,
            upload_cache: UploadCache::new(),
            media_server,
            cancel_tokens: Mutex::new(HashMap::new()),
        })
    }

    /// Resolve effective Gemini API key:
    /// 1. Explicit non-empty override from UI header
    /// 2. Saved `gemini_api_key` in SQLite `app_settings`
    pub fn resolve_api_key(&self, override_key: Option<&str>) -> String {
        if let Some(k) = override_key.map(str::trim).filter(|s| !s.is_empty()) {
            return k.to_string();
        }
        if let Ok(Some(saved)) = self.db.get_setting("gemini_api_key") {
            let trimmed = saved.trim().to_string();
            if !trimmed.is_empty() {
                return trimmed;
            }
        }
        String::new()
    }

    pub fn effective_export_dir(&self) -> PathBuf {
        if let Ok(Some(custom)) = self.db.get_setting("export_dir") {
            let trimmed = custom.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed);
            }
        }
        self.paths.exports_dir.clone()
    }

    pub fn has_custom_export_dir(&self) -> bool {
        self.db
            .get_setting("export_dir")
            .ok()
            .flatten()
            .is_some_and(|s| !s.trim().is_empty())
    }

    pub fn effective_ffmpeg_custom_path(&self) -> Option<PathBuf> {
        self.db
            .get_setting("ffmpeg_path")
            .ok()
            .flatten()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
    }

    pub fn resolve_fonts_dir(&self) -> Option<PathBuf> {
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("ui/public/fonts"));
            candidates.push(cwd.join("../ui/public/fonts"));
            candidates.push(cwd.join("fonts"));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                candidates.push(exe_dir.join("fonts"));
                candidates.push(exe_dir.join("resources/fonts"));
                candidates.push(exe_dir.join("../Resources/fonts"));
                candidates.push(exe_dir.join("../ui/public/fonts"));
            }
        }
        candidates.push(self.paths.data_dir.join("fonts"));
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ui/public/fonts"));

        candidates.into_iter().find(|dir| dir.is_dir())
    }

    pub async fn register_task(&self, task_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        let mut guard = self.cancel_tokens.lock().await;
        if let Some(old) = guard.insert(task_id.to_string(), token.clone()) {
            old.cancel();
        }
        token
    }

    pub async fn finish_task(&self, task_id: &str) {
        self.cancel_tokens.lock().await.remove(task_id);
    }

    pub async fn cancel_task(&self, task_id: &str) -> bool {
        if let Some(tok) = self.cancel_tokens.lock().await.get(task_id) {
            tok.cancel();
            true
        } else {
            false
        }
    }
}
