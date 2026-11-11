use std::path::{Path, PathBuf};

use directories::{ProjectDirs, UserDirs};

/// Resolved filesystem paths for SQLite database, exports, and local binaries.
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub exports_dir: PathBuf,
    pub db_path: PathBuf,
    pub bin_dir: PathBuf,
    pub env_path: Option<PathBuf>,
    pub is_portable: bool,
}

impl AppPaths {
    /// Build paths rooted at a specific base directory (for portable mode and tests).
    pub fn from_base_dir(base: impl AsRef<Path>) -> Self {
        let base = base.as_ref().to_path_buf();
        let data_dir = base.join("data");
        let exports_dir = base.join("exports");
        let env_candidate = base.join(".env");
        Self {
            db_path: data_dir.join("grader.db"),
            bin_dir: base.join("bin"),
            data_dir,
            exports_dir,
            env_path: env_candidate.is_file().then_some(env_candidate),
            is_portable: true,
        }
    }

    /// Resolve paths automatically:
    /// - Portable mode when `./data` or `./.env` exists in CWD or next to the executable.
    /// - Standard OS user-data directory (`ProjectDirs`) otherwise.
    pub fn resolve() -> Self {
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.join("data").is_dir() || cwd.join(".env").is_file() {
                return Self::from_base_dir(cwd);
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                if exe_dir.join("data").is_dir() || exe_dir.join(".env").is_file() {
                    return Self::from_base_dir(exe_dir);
                }
            }
        }

        if let Some(proj) = ProjectDirs::from("com", "englishspeak", "grader") {
            let data_dir = proj.data_local_dir().to_path_buf();
            let exports_dir = UserDirs::new()
                .and_then(|u| u.document_dir().map(|d| d.join("EnglishSpeakGrader")))
                .unwrap_or_else(|| data_dir.join("exports"));
            let env_cwd = std::env::current_dir()
                .ok()
                .map(|d| d.join(".env"))
                .filter(|p| p.is_file());
            return Self {
                db_path: data_dir.join("grader.db"),
                bin_dir: data_dir.join("bin"),
                data_dir,
                exports_dir,
                env_path: env_cwd,
                is_portable: false,
            };
        }

        Self::from_base_dir(std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
    }

    /// Ensure core directories exist on disk.
    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.data_dir)?;
        std::fs::create_dir_all(&self.exports_dir)?;
        Ok(())
    }
}
