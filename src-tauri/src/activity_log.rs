use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const MAX_IN_MEMORY_LOGS: usize = 300;
const MAX_LOG_FILE_BYTES: u64 = 1_048_576; // 1 MB

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActivityLogEntry {
    pub timestamp_ms: i64,
    pub level: String,
    pub category: String,
    pub message: String,
}

pub struct ActivityLog {
    entries: Mutex<VecDeque<ActivityLogEntry>>,
    log_file: PathBuf,
}

impl ActivityLog {
    pub fn new(logs_dir: &Path) -> Self {
        let _ = fs::create_dir_all(logs_dir);
        let log_file = logs_dir.join("app.log");
        Self {
            entries: Mutex::new(VecDeque::with_capacity(MAX_IN_MEMORY_LOGS)),
            log_file,
        }
    }

    pub fn log_file_path(&self) -> &Path {
        &self.log_file
    }

    pub fn info(&self, category: &str, message: impl AsRef<str>) {
        self.record("INFO", category, message.as_ref());
    }

    pub fn warn(&self, category: &str, message: impl AsRef<str>) {
        self.record("WARN", category, message.as_ref());
    }

    pub fn error(&self, category: &str, message: impl AsRef<str>) {
        self.record("ERROR", category, message.as_ref());
    }

    pub fn record(&self, level: &str, category: &str, raw_message: &str) {
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let normalized_level = match level.trim().to_ascii_uppercase().as_str() {
            "ERROR" => "ERROR",
            "WARN" | "WARNING" => "WARN",
            _ => "INFO",
        }
        .to_string();
        let normalized_cat = category.trim().to_ascii_lowercase();
        let message = redact_secrets(raw_message.trim());

        let entry = ActivityLogEntry {
            timestamp_ms,
            level: normalized_level,
            category: if normalized_cat.is_empty() {
                "app".to_string()
            } else {
                normalized_cat
            },
            message,
        };

        if let Ok(mut guard) = self.entries.lock() {
            if guard.len() >= MAX_IN_MEMORY_LOGS {
                guard.pop_front();
            }
            guard.push_back(entry.clone());
        }

        self.append_to_file(&entry);
    }

    /// Returns entries newest-first for immediate display in the diagnostics panel.
    pub fn entries(&self) -> Vec<ActivityLogEntry> {
        let guard = match self.entries.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        guard.iter().rev().cloned().collect()
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.entries.lock() {
            guard.clear();
        }
        let _ = fs::write(&self.log_file, b"");
    }

    fn append_to_file(&self, entry: &ActivityLogEntry) {
        if let Ok(meta) = fs::metadata(&self.log_file) {
            if meta.len() >= MAX_LOG_FILE_BYTES {
                let rotated = self.log_file.with_extension("log.1");
                let _ = fs::remove_file(&rotated);
                let _ = fs::rename(&self.log_file, &rotated);
            }
        }
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file)
        {
            let _ = writeln!(
                file,
                "{} [{}] [{}] {}",
                entry.timestamp_ms, entry.level, entry.category, entry.message
            );
        }
    }
}

/// Redact Google/Gemini API keys and query `key=` parameters before storing or displaying logs.
pub fn redact_secrets(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        if input[i..].starts_with("AIza") {
            let start = i;
            let mut end = i + 4;
            while end < bytes.len() {
                let b = bytes[end];
                if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' {
                    end += 1;
                } else {
                    break;
                }
            }
            if end - start >= 12 {
                out.push_str("AIza••••");
                i = end;
                continue;
            }
        }

        if input[i..].starts_with("key=") {
            out.push_str("key=••••");
            let mut end = i + 4;
            while end < bytes.len() && !bytes[end].is_ascii_whitespace() && bytes[end] != b'&' {
                end += 1;
            }
            i = end;
            continue;
        }

        if let Some(ch) = input[i..].chars().next() {
            out.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_secrets_masks_api_keys_and_query_params() {
        let raw = "Request failed for https://generativelanguage.googleapis.com/v1beta/models?key=secret_token_123 with AIzaSyDummyKey1234567890abcd";
        let safe = redact_secrets(raw);
        assert!(!safe.contains("secret_token_123"));
        assert!(!safe.contains("AIzaSyDummyKey"));
        assert!(safe.contains("key=••••"));
        assert!(safe.contains("AIza••••"));
    }

    #[test]
    fn activity_log_records_rotates_and_clears() {
        let dir = std::env::temp_dir().join(format!("esg-log-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let log = ActivityLog::new(&dir);

        log.info("app", "Khởi động thành công");
        log.warn("media", "Cảnh báo thử nghiệm");
        log.error("gemini", "Lỗi key AIzaSySecretKey123456789");

        let entries = log.entries();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].level, "ERROR");
        assert!(!entries[0].message.contains("SecretKey"));
        assert!(entries[0].message.contains("AIza••••"));
        assert_eq!(entries[2].level, "INFO");

        let disk = fs::read_to_string(log.log_file_path()).unwrap();
        assert!(disk.contains("Khởi động thành công"));

        log.clear();
        assert!(log.entries().is_empty());

        let _ = fs::remove_dir_all(&dir);
    }
}
