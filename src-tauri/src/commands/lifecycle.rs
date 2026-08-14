// Lifecycle & configuration commands.

use std::collections::HashMap;
use std::env;
use std::fs;

use flate2::read::GzDecoder;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::app_config_builder::AppConfig;
use crate::i18n::I18n;
#[cfg(target_os = "macos")]
use crate::menu;
use crate::store::settings_store;
use crate::types::common_types::{Settings, UiConfig, WindowStyle};
use crate::user_dirs::UserDirs;

#[tauri::command]
pub async fn on_before_render_ui(app: AppHandle, locale_texts: HashMap<String, String>)
    -> Result<(), String>
{
    let i18n = I18n::new(locale_texts);

    // Only macOS has a native menu — see the comment in main.rs.
    #[cfg(target_os = "macos")]
    match menu::build(&app, &i18n) {
        Ok(native_menu) => {
            let _ = app.set_menu(native_menu);
        }
        Err(e) => {
            eprintln!("Failed to build menu: {}", e);
        }
    }

    app.manage(i18n);

    Ok(())
}

#[tauri::command]
pub async fn fetch_ui_config(app_config: State<'_, AppConfig>) -> Result<UiConfig, String> {
    Ok(UiConfig {
        version:         env!("CARGO_PKG_VERSION").to_string(),
        platform:        env::consts::OS.to_string(),
        window_style:    if env::consts::OS == "macos" { WindowStyle::NativeTrafficLight } else { WindowStyle::WindowsButtons },
        has_native_menu: env::consts::OS == "macos",
        raw_locale:      app_config.raw_locale.to_string(),
        thumbnail_path:  app_config.picturama_home_dir.join("thumbnails").to_str().unwrap().to_string(),
    })
}

/// Picturama and every component this build ships with it, as written by `src/script/collect-licenses.mjs`.
///
/// The file is a build artifact, not source: which crates, npm packages and system libraries end up in a build
/// depends on the platform it was built for. It is bundled as a resource next to `migrations/`, so it is found
/// through [`AppConfig::app_dir`] in both a debug and a release build. Gzipped, because it is mostly license
/// texts and those compress to about a tenth.
///
/// Returned as a [`serde_json::Value`] rather than a typed struct: the shape is defined by the generator, and
/// mirroring it here would mean a second definition to keep in sync for data Rust never looks at. Parsing it
/// instead of passing the text through also keeps Tauri from escaping the whole document into a JSON string.
#[tauri::command]
pub async fn fetch_licenses(app_config: State<'_, AppConfig>) -> Result<Value, String> {
    let path = app_config.app_dir.join("licenses.json.gz");
    let packed = fs::File::open(&path)
        .map_err(|e| format!("Could not read {}: {}", path.display(), e))?;
    serde_json::from_reader(GzDecoder::new(packed))
        .map_err(|e| format!("Could not parse {}: {}", path.display(), e))
}

#[tauri::command]
pub async fn fetch_settings(app_config: State<'_, AppConfig>) -> Result<Settings, String> {
    let settings_path = app_config.picturama_home_dir.join("settings.json");
    settings_store::fetch_settings(&settings_path)
}

#[tauri::command]
pub async fn store_settings(
    settings: Settings,
    app_config: State<'_, AppConfig>,
    user_dirs: State<'_, UserDirs>,
) -> Result<(), String> {
    // A photo directory may only enter the settings through the native folder picker (or have been there
    // when the app started). Otherwise the web view could write any path into `photoDirs` and have the next
    // start grant itself asset-protocol access to it.
    for dir in &settings.photo_dirs {
        if !user_dirs.contains_photo_dir(dir) {
            return Err(format!("Photo directory was not selected by the user: {}", dir));
        }
    }

    let settings_path = app_config.picturama_home_dir.join("settings.json");
    settings_store::store_settings(&settings_path, &settings)
}
