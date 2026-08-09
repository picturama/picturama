// Asset-protocol scope.
//
// The static scope in `tauri.conf.json` covers only `$RESOURCE`. Everything else the UI loads through
// `convertFileSrc` — the thumbnail cache and the user's photo directories — is granted here at runtime.
// That keeps the renderer from reading arbitrary files.

use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::app_config_builder::AppConfig;
use crate::store::settings_store;

/// Grants the thumbnail cache and the photo directories from the stored settings. Called once on startup.
pub fn allow_configured_dirs(app: &AppHandle, app_config: &AppConfig) {
    allow_directory(app, &app_config.picturama_home_dir.join("thumbnails"));

    let settings_path = app_config.picturama_home_dir.join("settings.json");
    match settings_store::fetch_settings(&settings_path) {
        Ok(settings) => allow_photo_dirs(app, &settings.photo_dirs),
        Err(e) => log::warn!("Could not read settings for the asset scope: {}", e),
    }
}

/// Grants the given photo directories. Called again whenever the settings change, so photos in a newly added
/// directory show up without a restart. The scope only ever grows: Tauri has no API to revoke a pattern, so a
/// directory removed from the settings stays granted until the next start.
pub fn allow_photo_dirs(app: &AppHandle, photo_dirs: &[String]) {
    for dir in photo_dirs {
        allow_directory(app, Path::new(dir));
    }
}

fn allow_directory(app: &AppHandle, dir: &Path) {
    grant(app, dir);

    // The scope matches against the canonicalised request path, so a directory reached through a symlink
    // needs its real path granted as well. Identical paths collapse in the scope's pattern set.
    if let Ok(real_dir) = dir.canonicalize() {
        if real_dir.as_path() != dir {
            grant(app, &real_dir);
        }
    }
}

fn grant(app: &AppHandle, dir: &Path) {
    if let Err(e) = app.asset_protocol_scope().allow_directory(dir, true) {
        log::warn!("Could not allow {:?} in the asset scope: {}", dir, e);
    }
}
