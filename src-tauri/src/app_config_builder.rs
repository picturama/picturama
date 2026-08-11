use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use sys_locale::get_locale;

#[derive(Debug)]
pub struct AppConfig {
    /// The raw locale from the system. May have more than 2 characters (e.g. "de-DE") or an unsupported language
    pub raw_locale: String,

    /// The directory where Picturama is installed.
    /// Dev:     current working directory
    /// Release: <bundle>/Contents/Resources/app  (macOS)
    ///          <install dir>/resources/app      (Windows / Linux)
    pub app_dir: PathBuf,

    /// The Picturama home directory.
    /// Dev:     <cwd>/dot-picturama
    /// Release: ~/.picturama
    pub picturama_home_dir: PathBuf,
}

pub fn build_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let app_dir: PathBuf;
    let picturama_home_dir: PathBuf;
    if cfg!(debug_assertions) {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let project_root = dev_project_root(&cwd)?;

        app_dir            = project_root.clone();
        picturama_home_dir = project_root.join("dot-picturama");
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?;

        let home_dir = dirs::home_dir()
            .ok_or_else(|| "Could not determine home directory".to_string())?;

        app_dir            = resource_dir.join("app");
        picturama_home_dir = home_dir.join(".picturama");
    }

    Ok(AppConfig {
        raw_locale:         get_locale().unwrap(),
        app_dir:            app_dir,
        picturama_home_dir: picturama_home_dir,
    })
}

/// The project root in a dev build: the parent of the `<project>/src-tauri` working directory.
///
/// Deliberately lexical rather than `Path::canonicalize`: that returns a verbatim path on Windows
/// (`\\?\C:\...`), in which `\` is the only separator and `/` an ordinary filename character.
/// `picturama_home_dir` goes to the frontend as `thumbnailPath`, which appends `/<shortId>.webp` to it — on
/// a verbatim path that yields an invalid path, and the asset protocol answers with a bare 500 that it does
/// not even log. `current_dir` is already absolute (and prefix-free on Windows), so `parent` is enough.
fn dev_project_root(cwd: &Path) -> Result<PathBuf, String> {
    cwd.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| format!("Working directory {} has no parent", cwd.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_project_root_is_the_parent_of_src_tauri() {
        let cwd: PathBuf = ["some", "project", "src-tauri"].iter().collect();
        let expected: PathBuf = ["some", "project"].iter().collect();
        assert_eq!(dev_project_root(&cwd).unwrap(), expected);

        assert!(dev_project_root(Path::new("")).is_err());
    }

    /// The root must survive having a `/`-separated tail appended, as `getThumbnailPath` in
    /// src/app/util/DataUtil.ts does. Fails as soon as the path is run through `Path::canonicalize` again.
    #[test]
    fn dev_project_root_stays_usable_with_forward_slashes() {
        let cwd = std::env::current_dir().unwrap();
        let root = dev_project_root(&cwd).unwrap();

        assert!(!root.to_string_lossy().starts_with(r"\\?\"));
        // The test runs with src-tauri as the working directory, so this is the directory we just left.
        let child = format!("{}/{}", root.to_string_lossy(), cwd.file_name().unwrap().to_string_lossy());
        assert!(Path::new(&child).exists(), "{} should exist", child);
    }
}
