use std::path::{Path, PathBuf};

use directories::{ProjectDirs, UserDirs};

/// Resolved filesystem paths for SQLite database, exports, and local binaries.
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub exports_dir: PathBuf,
    pub db_path: PathBuf,
    pub bin_dir: PathBuf,
    pub is_portable: bool,
}

impl AppPaths {
    /// Build paths rooted at a specific base directory (for portable mode and tests).
    pub fn from_base_dir(base: impl AsRef<Path>) -> Self {
        let base = base.as_ref().to_path_buf();
        let data_dir = base.join("data");
        let exports_dir = base.join("exports");
        Self {
            db_path: data_dir.join("grader.db"),
            bin_dir: base.join("bin"),
            data_dir,
            exports_dir,
            is_portable: true,
        }
    }

    /// Resolve paths automatically:
    /// - Portable mode when `./data` exists in CWD or next to the executable.
    /// - Standard OS user-data directory (`ProjectDirs`) otherwise.
    pub fn resolve() -> Self {
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.join("data").is_dir() {
                return Self::from_base_dir(cwd);
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                if exe_dir.join("data").is_dir() {
                    return Self::from_base_dir(exe_dir);
                }
            }
        }

        if let Some(proj) = ProjectDirs::from("com", "englishspeak", "grader") {
            let data_dir = proj.data_local_dir().to_path_buf();
            let exports_dir = UserDirs::new()
                .and_then(|u| {
                    u.document_dir()
                        .or_else(|| u.download_dir())
                        .or_else(|| u.desktop_dir())
                        .map(|d| d.to_path_buf())
                        .or_else(|| Some(u.home_dir().to_path_buf()))
                })
                .map(|d| d.join("EnglishSpeakGrader"))
                .unwrap_or_else(|| data_dir.join("exports"));
            return Self {
                db_path: data_dir.join("grader.db"),
                bin_dir: data_dir.join("bin"),
                data_dir,
                exports_dir,
                is_portable: false,
            };
        }

        Self::from_base_dir(std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
    }

    /// Ensure core database directory exists on disk (export directories are created lazily when writing).
    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.data_dir)?;
        Ok(())
    }
}
