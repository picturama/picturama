#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod app_config_builder;
mod common_types;
mod exif_reader;
mod foreground_client;
mod geometry_types;
mod i18n;
mod import_scanner;
mod main_service;
mod menu;
mod raw_reader;
mod window_service;
mod xmp_reader;
mod store {
    pub mod db;
    pub mod photo_store;
    pub mod photo_work_store;
    pub mod settings_store;
    pub mod tag_store;
    pub mod thumbnail_store;
}

fn main() {
    tauri::Builder::default()
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
            // Lifecycle
            main_service::on_before_render_ui,
            main_service::fetch_ui_config,
            main_service::fetch_settings,
            main_service::store_settings,
            // Filesystem
            main_service::file_exists,
            main_service::get_file_size,
            main_service::show_item_in_folder,
            // Directory selection
            main_service::select_scan_directories,
            main_service::select_export_directory,
            // Import / scan
            main_service::start_import,
            main_service::toggle_import_paused,
            main_service::cancel_import,
            // Photos
            main_service::fetch_total_photo_count,
            main_service::fetch_sections,
            main_service::fetch_section_photos,
            main_service::update_photos,
            main_service::empty_trash,
            main_service::fetch_photo_detail,
            // PhotoWork
            main_service::fetch_photo_work_of_photo,
            main_service::store_photo_work,
            // Thumbnails
            main_service::create_thumbnail,
            main_service::delete_thumbnail,
            // Metadata & EXIF
            main_service::read_metadata_of_image,
            main_service::get_exif_data,
            // HEIC
            main_service::load_heif_file,
            // RAW
            main_service::extract_raw_preview_jpg,
            // Tags
            main_service::fetch_tags,
            main_service::store_photo_tags,
            // Export
            main_service::export_photo,
        ])
        .menu(|app| {
            // Create empty menu on startup until the real menu is created later (after I18N initialisation)
            // That " " label avoids weird macOS behavior while staying invisible enough.
            use tauri::menu::{Menu, Submenu};
            Ok(Menu::with_items(
                app,
                &[&Submenu::with_items(app, " ", true, &[])?], // basically empty
            )?)
        })
        .on_menu_event(menu::handle_event)
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

            app.manage(app_config);
            app.manage(db);

            window_service::register_window_state_listener(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|_app, _event| {});
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
