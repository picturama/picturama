use std::path::PathBuf;

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

    /// The legacy home directory of Ansel (former name of Picturama).
    /// Dev:     <cwd>/dot-ansel
    /// Release: ~/.ansel
    pub ansel_home_dir: PathBuf,

    /// The Picturama home directory.
    /// Dev:     <cwd>/dot-picturama
    /// Release: ~/.picturama
    pub picturama_home_dir: PathBuf,
}

pub fn build_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let app_dir: PathBuf;
    let ansel_home_dir: PathBuf;
    let picturama_home_dir: PathBuf;
    if cfg!(debug_assertions) {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let project_root = cwd.join("..").canonicalize().unwrap();

        app_dir            = project_root.clone();
        ansel_home_dir     = project_root.join("dot-ansel");
        picturama_home_dir = project_root.join("dot-picturama");
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?;

        let home_dir = dirs::home_dir()
            .ok_or_else(|| "Could not determine home directory".to_string())?;

        app_dir            = resource_dir.join("app");
        ansel_home_dir     = home_dir.join(".ansel");
        picturama_home_dir = home_dir.join(".picturama");
    }

    Ok(AppConfig {
        raw_locale:         get_locale().unwrap(),
        app_dir:            app_dir,
        ansel_home_dir:     ansel_home_dir,
        picturama_home_dir: picturama_home_dir,
    })
}
