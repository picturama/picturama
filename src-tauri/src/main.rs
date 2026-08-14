#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod app_config_builder;
mod asset_scope;
mod commands;
mod foreground_client;
mod i18n;
mod image;
mod import_scanner;
mod menu;
mod types;
mod user_dirs;
mod window_service;
mod store {
    pub mod db;
    pub mod photo_store;
    pub mod photo_work_store;
    pub mod picasa_reader;
    pub mod settings_store;
    pub mod tag_store;
    pub mod thumbnail_store;
    pub mod window_state_store;
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .manage(foreground_client::PendingCalls::default())
        .manage(import_scanner::ImportState::default())
        .manage(menu::ExportMenuItem::default())
        .invoke_handler(tauri::generate_handler![
            // Foreground RPC
            foreground_client::foreground_action_done,
            // Window control
            window_service::toggle_full_screen,
            window_service::window_minimize,
            window_service::window_maximize,
            window_service::window_unmaximize,
            window_service::window_close,
            window_service::window_get_state,
            window_service::toggle_dev_tools,
            window_service::toggle_ui_tester,
            window_service::reload_ui,
            // Menu
            menu::set_export_menu_enabled,
            // Lifecycle
            commands::lifecycle::on_before_render_ui,
            commands::lifecycle::fetch_ui_config,
            commands::lifecycle::fetch_settings,
            commands::lifecycle::store_settings,
            commands::lifecycle::fetch_licenses,
            // Filesystem
            commands::fs::file_exists,
            commands::fs::get_file_size,
            commands::fs::show_item_in_folder,
            // Directory selection
            commands::fs::select_scan_directories,
            commands::fs::select_export_directory,
            // Import / scan
            commands::import::start_import,
            commands::import::toggle_import_paused,
            commands::import::cancel_import,
            // Photos
            commands::photos::fetch_total_photo_count,
            commands::photos::fetch_sections,
            commands::photos::fetch_section_photos,
            commands::photos::update_photos,
            commands::photos::empty_trash,
            commands::photos::fetch_photo_detail,
            // PhotoWork
            commands::photo_work::fetch_photo_work_of_photo,
            commands::photo_work::store_photo_work,
            // Thumbnails
            commands::thumbnails::create_thumbnail,
            commands::thumbnails::delete_thumbnail,
            // Metadata & EXIF
            commands::metadata::read_metadata_of_image,
            commands::metadata::get_exif_data,
            // HEIC
            commands::image::load_heif_file,
            // RAW
            commands::image::extract_raw_preview_jpg,
            // Tags
            commands::tags::fetch_tags,
            commands::tags::store_photo_tags,
            // Export
            commands::export::export_photo,
        ]);

    // A macOS app always has a menu bar, so there the native menu stays (it is built in
    // `on_before_render_ui`, once the translations are known). On Windows and Linux there is no
    // menu at all — the UI offers those actions itself and via the hotkeys of
    // `GlobalCommandController.ts`.
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(|app| {
            // Create empty menu on startup until the real menu is created later (after I18N initialisation)
            // That " " label avoids weird macOS behavior while staying invisible enough.
            use tauri::menu::{Menu, Submenu};
            Ok(Menu::with_items(
                app,
                &[&Submenu::with_items(app, " ", true, &[])?], // basically empty
            )?)
        })
        .on_menu_event(menu::handle_event);

    builder
        .setup(|app| {
            let app_config = app_config_builder::build_app_config(app.handle())
                .map_err(|e| e.to_string())?;

            // Open (and migrate) the SQLite database.
            let db_path = app_config.picturama_home_dir.join("db.sqlite3");
            let migrations_dir = app_config.app_dir.join("migrations");
            let db = store::db::open(&db_path, &migrations_dir)
                .map_err(|e| e.to_string())?;

            // RAW no longer uses a rendered-derivative cache, so clean up a `non-raw` directory left by
            // older versions.
            remove_legacy_non_raw_dir(&app_config.picturama_home_dir);

            // The static asset-protocol scope covers only `$RESOURCE`, so grant the directories the UI
            // actually loads from: the thumbnail cache and the photo dirs configured on disk. The stored
            // photo dirs also seed the set of user-chosen directories the commands validate against.
            let settings_path = app_config.picturama_home_dir.join("settings.json");
            let photo_dirs = match store::settings_store::fetch_settings(&settings_path) {
                Ok(settings) => settings.photo_dirs,
                Err(e) => {
                    log::warn!("Could not read settings on startup: {}", e);
                    Vec::new()
                }
            };
            let user_dirs = user_dirs::UserDirs::default();
            user_dirs.add_photo_dirs(&photo_dirs);

            asset_scope::allow_thumbnail_cache(app.handle(), &app_config.picturama_home_dir);
            asset_scope::allow_photo_dirs(app.handle(), &photo_dirs);

            let picturama_home_dir = app_config.picturama_home_dir.clone();

            app.manage(user_dirs);
            app.manage(app_config);
            app.manage(db);

            // The UI draws its own title bar, so on Windows and Linux the native decorations are dropped — otherwise the
            // window would have two title bars. macOS keeps them: there the title bar is a transparent overlay
            // (`titleBarStyle` in tauri.conf.json) the UI just leaves room for. This runs while the window is still
            // hidden, so the change is never visible, and before the geometry is restored, so the
            // stored size lands on the final client area.
            #[cfg(not(target_os = "macos"))]
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = window.set_decorations(false) {
                    log::warn!("Could not remove the window decorations: {}", e);
                }
            }

            window_service::register_window_state_listener(app.handle());

            // Restores position/size of the last session and shows the window (it starts hidden, so
            // the restored geometry is in place before the first paint).
            window_service::restore_window_state(app.handle(), &picturama_home_dir);

            // In dev builds the UI Tester (test-ui.html) has no backend, so it shows the real
            // photos from `submodules/test-data` as fake thumbnails via the asset protocol. That
            // directory lives inside the source checkout (outside `$HOME`/`$RESOURCE`), so extend
            // the asset-protocol scope to allow it. Not compiled into release builds.
            #[cfg(debug_assertions)]
            {
                let test_data_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .parent() // picturama/src-tauri → picturama/
                    .map(|dir| dir.join("submodules/test-data"));
                if let Some(dir) = test_data_dir {
                    if let Err(e) = app.asset_protocol_scope().allow_directory(&dir, true) {
                        log::warn!("Could not allow test-data dir {:?} in asset scope: {}", dir, e);
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|app, event| {
            // Quitting the app (macOS Cmd+Q, the Quit menu item) does not necessarily close the
            // window first, so persist the tracked geometry here as well. `save_window_state` is a
            // no-op when the file already holds it.
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                window_service::save_window_state(app);
            }
        });
}

/// Removes a legacy `non-raw` directory (the old RAW rendered-derivative cache). RAW is now displayed on
/// demand from its embedded JPEG preview, so this cache is obsolete; it is cleaned up on startup if a
/// previous version left one behind.
fn remove_legacy_non_raw_dir(picturama_home_dir: &std::path::Path) {
    let dir = picturama_home_dir.join("non-raw");
    if dir.exists() {
        match std::fs::remove_dir_all(&dir) {
            Ok(()) => log::info!("Removed legacy non-raw directory {:?}", dir),
            Err(e) => log::warn!("Could not remove legacy non-raw directory {:?}: {}", dir, e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_legacy_non_raw_dir_when_present_and_is_idempotent() {
        let base = std::env::temp_dir().join(format!("picturama-nonraw-test-{}", std::process::id()));
        let non_raw = base.join("non-raw");
        std::fs::create_dir_all(non_raw.join("sub")).unwrap();
        std::fs::write(non_raw.join("sub").join("2s.webp"), b"stale").unwrap();
        assert!(non_raw.exists());

        remove_legacy_non_raw_dir(&base);
        assert!(!non_raw.exists());

        // A missing directory is a no-op, not an error.
        remove_legacy_non_raw_dir(&base);

        std::fs::remove_dir_all(&base).ok();
    }
}
