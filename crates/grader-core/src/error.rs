use thiserror::Error;

/// Unified error type for `grader-core`.
#[derive(Debug, Error)]
pub enum GraderError {
    #[error("{0}")]
    Gemini(String),

    #[error("Lỗi cơ sở dữ liệu SQLite: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Lỗi xuất file Excel: {0}")]
    Export(String),

    #[error("{0}")]
    Audio(String),

    #[error("{0}")]
    Video(String),

    #[error("Lỗi đọc/ghi file: {0}")]
    Io(#[from] std::io::Error),

    #[error("Lỗi dữ liệu JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    InvalidInput(String),

    #[error("Tác vụ đã bị hủy.")]
    Cancelled,
}

pub type Result<T> = std::result::Result<T, GraderError>;
