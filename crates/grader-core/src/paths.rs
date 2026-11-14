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

    /// Resolve paths with an explicit OS app-local-data directory (e.g. Tauri's `app_local_data_dir()`):
    /// - Portable mode when `./data` exists in CWD or next to the executable.
    /// - `<app_local_data_dir>/data` when provided.
    /// - Standard OS user-data directory (`ProjectDirs`) fallback otherwise.
    pub fn resolve_with_app_data_dir(app_local_data_dir: Option<PathBuf>) -> Self {
        if let Some(portable) = Self::resolve_portable() {
            return portable;
        }

        if let Some(base) = app_local_data_dir {
            return Self::from_standard_data_dir(base.join("data"));
        }

        Self::resolve_fallback()
    }

    /// Resolve paths automatically (for CLI/tests without a Tauri runtime):
    /// - Portable mode when `./data` exists in CWD or next to the executable.
    /// - Standard OS user-data directory (`ProjectDirs`) otherwise.
    pub fn resolve() -> Self {
        Self::resolve_portable().unwrap_or_else(Self::resolve_fallback)
    }

    fn resolve_portable() -> Option<Self> {
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.join("data").is_dir() {
                return Some(Self::from_base_dir(cwd));
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                if exe_dir.join("data").is_dir() {
                    return Some(Self::from_base_dir(exe_dir));
                }
            }
        }
        None
    }

    fn resolve_fallback() -> Self {
        if let Some(proj) = ProjectDirs::from("com", "englishspeak", "grader") {
            return Self::from_standard_data_dir(proj.data_local_dir().to_path_buf());
        }

        Self::from_base_dir(std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
    }

    fn from_standard_data_dir(data_dir: PathBuf) -> Self {
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
        Self {
            db_path: data_dir.join("grader.db"),
            bin_dir: data_dir.join("bin"),
            data_dir,
            exports_dir,
            is_portable: false,
        }
    }

    /// Ensure core database directory exists on disk (export directories are created lazily when writing).
    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.data_dir)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_base_dir_uses_portable_layout() {
        let base = PathBuf::from("/tmp/esg-portable");
        let paths = AppPaths::from_base_dir(&base);
        assert!(paths.is_portable);
        assert_eq!(paths.data_dir, base.join("data"));
        assert_eq!(paths.db_path, base.join("data").join("grader.db"));
        assert_eq!(paths.exports_dir, base.join("exports"));
        assert_eq!(paths.bin_dir, base.join("bin"));
    }

    #[test]
    fn resolve_with_app_data_dir_nests_core_data_safely() {
        let app_dir = PathBuf::from("/tmp/com.englishspeak.grader");
        let paths = AppPaths::resolve_with_app_data_dir(Some(app_dir.clone()));
        assert!(!paths.is_portable);
        assert_eq!(paths.data_dir, app_dir.join("data"));
        assert_eq!(paths.db_path, app_dir.join("data").join("grader.db"));
        assert_eq!(paths.bin_dir, app_dir.join("data").join("bin"));
    }
}
