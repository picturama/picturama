// Asset-protocol scope.
//
// The static scope in `tauri.conf.json` covers only `$RESOURCE`. Everything else the UI loads through
// `convertFileSrc` — the thumbnail cache and the user's photo directories — is granted here at runtime.
// That keeps the renderer from reading arbitrary files.
//
// The scope is only ever extended from a trustworthy source: the photo dirs stored in `settings.json` on
// startup, and the dirs the user picks in the native folder dialog. It is deliberately not extended from
// `store_settings`, whose argument the web view controls (see `user_dirs.rs`).

use std::path::Path;

use tauri::{AppHandle, Manager};

/// Grants the thumbnail cache below the Picturama home directory.
pub fn allow_thumbnail_cache(app: &AppHandle, picturama_home_dir: &Path) {
    allow_directory(app, &picturama_home_dir.join("thumbnails"));
}

/// Grants the given photo directories. There is no counterpart: Tauri's scope API can add allowed patterns
/// but not remove them, so a directory stays granted until the next start.
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
    // Tauri's `allow_directory` will dedupe duplicate diretory rules, so we don't have to do deduping
    if let Err(e) = app.asset_protocol_scope().allow_directory(dir, true) {
        log::warn!("Could not allow {:?} in the asset scope: {}", dir, e);
    }
}
