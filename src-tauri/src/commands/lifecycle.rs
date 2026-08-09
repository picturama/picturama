// Lifecycle & configuration commands.

use std::collections::HashMap;
use std::env;
use tauri::{AppHandle, Manager, State};

use crate::app_config_builder::AppConfig;
use crate::asset_scope;
use crate::i18n::I18n;
use crate::menu;
use crate::store::settings_store;
use crate::types::common_types::{Settings, UiConfig, WindowStyle};

#[tauri::command]
pub async fn on_before_render_ui(app: AppHandle, locale_texts: HashMap<String, String>)
    -> Result<(), String>
{
    let i18n = I18n::new(locale_texts);

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

#[tauri::command]
pub async fn fetch_settings(app_config: State<'_, AppConfig>) -> Result<Settings, String> {
    let settings_path = app_config.picturama_home_dir.join("settings.json");
    settings_store::fetch_settings(&settings_path)
}

#[tauri::command]
pub async fn store_settings(
    app: AppHandle,
    settings: Settings,
    app_config: State<'_, AppConfig>,
) -> Result<(), String> {
    let settings_path = app_config.picturama_home_dir.join("settings.json");
    settings_store::store_settings(&settings_path, &settings)?;

    // Photos in a newly added directory must be displayable without a restart.
    asset_scope::allow_photo_dirs(&app, &settings.photo_dirs);

    Ok(())
}
