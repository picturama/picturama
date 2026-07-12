use std::env;
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

use crate::{
    common_types::*,
    app_config_builder::AppConfig,
    i18n::I18n,
    menu,
    store::{
        db::DbHandle,
        photo_store,
        photo_work_store,
        settings_store,
        tag_store,
    }
};


// ---------------------------------------------------------------------------
// Lifecycle & configuration
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn on_before_render_ui(app: AppHandle, locale: String, locale_texts: HashMap<String, String>)
    -> Result<(), String>
{
    let i18n = I18n::new(locale, locale_texts);

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
        non_raw_path:    app_config.picturama_home_dir.join("non-raw").to_str().unwrap().to_string(),
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
    settings: Settings,
    app_config: State<'_, AppConfig>,
) -> Result<(), String> {
    let settings_path = app_config.picturama_home_dir.join("settings.json");
    settings_store::store_settings(&settings_path, &settings)
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn show_item_in_folder(full_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", &full_path])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .args(["/select,", &full_path])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(
            Path::new(&full_path)
                .parent()
                .unwrap_or(Path::new("/")),
        )
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Directory selection
// ---------------------------------------------------------------------------

/// TODO(phase3): Open a native folder picker and save the result to SQLite.
#[tauri::command]
pub async fn select_scan_directories(_app: AppHandle) -> Result<Option<Vec<String>>, String> {
    // Returns None → UI treats this as "cancelled" (same as Electron behaviour)
    Ok(None)
}

/// TODO(phase5): Open a native folder picker for export.
#[tauri::command]
pub async fn select_export_directory(_app: AppHandle) -> Result<Option<String>, String> {
    Ok(None)
}

// ---------------------------------------------------------------------------
// Import / scan
// ---------------------------------------------------------------------------

/// TODO(phase3): Start the real directory scanner.
#[tauri::command]
pub async fn start_import() -> Result<(), String> {
    Ok(())
}

/// TODO(phase3): Pause the running scan.
#[tauri::command]
pub async fn toggle_import_paused() -> Result<(), String> {
    Ok(())
}

/// TODO(phase3): Cancel the running scan.
#[tauri::command]
pub async fn cancel_import() -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Photo queries
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fetch_total_photo_count(db: State<'_, DbHandle>) -> Result<u32, String> {
    tokio::task::block_in_place(|| photo_store::fetch_total_photo_count(&db))
}

#[tauri::command]
pub async fn fetch_sections(
    filter: PhotoFilter,
    section_ids_to_keep_loaded: Option<Vec<PhotoSectionId>>,
    db: State<'_, DbHandle>,
) -> Result<Vec<PhotoSection>, String> {
    let keep = section_ids_to_keep_loaded.unwrap_or_default();
    tokio::task::block_in_place(|| {
        photo_store::fetch_sections(
            &db,
            &filter,
            if keep.is_empty() { None } else { Some(&keep) },
        )
    })
}

#[tauri::command]
pub async fn fetch_section_photos(
    section_ids: Vec<PhotoSectionId>,
    filter: PhotoFilter,
    db: State<'_, DbHandle>,
) -> Result<Vec<PhotoSet>, String> {
    tokio::task::block_in_place(|| {
        photo_store::fetch_section_photos(&db, &section_ids, &filter)
    })
}

#[tauri::command]
pub async fn update_photos(
    photo_ids: Vec<PhotoId>,
    update: serde_json::Value,
    db: State<'_, DbHandle>,
) -> Result<(), String> {
    tokio::task::block_in_place(|| photo_store::update_photos(&db, &photo_ids, &update))
}

#[tauri::command]
pub async fn empty_trash(
    db: State<'_, DbHandle>,
) -> Result<EmptyTrashResult, String> {
    // Fetch photos to delete
    let trashed = tokio::task::block_in_place(|| photo_store::fetch_trashed_photos(&db))?;
    let photo_ids: Vec<PhotoId> = trashed.iter().map(|p| p.id).collect();

    // Delete from DB
    tokio::task::block_in_place(|| photo_store::delete_photos(&db, &photo_ids))?;

    // Move master files to system trash
    for photo in &trashed {
        let master_path = format!("{}/{}", photo.master_dir, photo.master_filename);
        // Use trash crate (added to Cargo.toml) or fall back to std::fs::remove_file
        if let Err(e) = trash::delete(&master_path) {
            log::warn!("Could not move {} to trash: {}", master_path, e);
        }
        // Remove PhotoWork sidecar (write empty work = removes the file)
        let _ = photo_work_store::remove_photo_work(
            Path::new(&photo.master_dir),
            &photo.master_filename,
        );
    }

    // Re-fetch tags in case tag references changed
    let updated_tags = if !photo_ids.is_empty() {
        Some(tokio::task::block_in_place(|| tag_store::fetch_tags(&db))?)
    } else {
        None
    };

    Ok(EmptyTrashResult { photo_ids, updated_tags })
}

#[tauri::command]
pub async fn fetch_photo_detail(
    photo_id: PhotoId,
    db: State<'_, DbHandle>,
) -> Result<PhotoDetail, String> {
    tokio::task::block_in_place(|| photo_store::fetch_photo_detail(&db, photo_id))
}

// ---------------------------------------------------------------------------
// PhotoWork (non-destructive edit operations)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fetch_photo_work_of_photo(photo: Photo) -> Result<PhotoWork, String> {
    tokio::task::block_in_place(|| photo_work_store::fetch_photo_work_of_photo(&photo))
}

#[tauri::command]
pub async fn store_photo_work(
    photo_dir: String,
    photo_filename: String,
    photo_work: PhotoWork,
) -> Result<(), String> {
    tokio::task::block_in_place(|| {
        photo_work_store::store_photo_work(
            Path::new(&photo_dir),
            &photo_filename,
            &photo_work,
        )
    })
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

/// TODO(phase4): Generate thumbnail and store in cache.
#[tauri::command]
pub async fn create_thumbnail(_photo: Photo) -> Result<(), String> {
    Ok(())
}

/// TODO(phase4): Remove thumbnail from cache.
#[tauri::command]
pub async fn delete_thumbnail(_photo_id: PhotoId) -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Image metadata & EXIF
// ---------------------------------------------------------------------------

/// TODO(phase5): Read real metadata with image-rs.
#[tauri::command]
pub async fn read_metadata_of_image(_image_path: String) -> Result<MetaData, String> {
    Ok(MetaData {
        img_width:          None,
        img_height:         None,
        img_width_assumed:  None,
        img_height_assumed: None,
        camera:             None,
        exposure_time:      None,
        iso:                None,
        aperture:           None,
        focal_length:       None,
        created_at:         None,
        orientation:        1,  // 1=Up
        tags:               vec![],
    })
}

// ---------------------------------------------------------------------------
// HEIF / HEIC
// ---------------------------------------------------------------------------

/// TODO(phase6): Returns true once libheif-rs is linked.
#[tauri::command]
pub async fn load_heif_file_supported() -> Result<bool, String> {
    Ok(false)
}

/// TODO(phase6): Decode HEIC image with libheif-rs.
#[tauri::command]
pub async fn load_heif_file(_path: String) -> Result<DecodedHeifImage, String> {
    Err("HEIC support not yet implemented (phase 6)".to_string())
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fetch_tags(db: State<'_, DbHandle>) -> Result<Vec<Tag>, String> {
    tokio::task::block_in_place(|| tag_store::fetch_tags(&db))
}

#[tauri::command]
pub async fn store_photo_tags(
    photo_id: PhotoId,
    photo_tags: Vec<String>,
    db: State<'_, DbHandle>,
) -> Result<Option<Vec<Tag>>, String> {
    tokio::task::block_in_place(|| tag_store::store_photo_tags(&db, photo_id, &photo_tags))
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/// TODO(phase5): Implement real image export.
#[tauri::command]
pub async fn export_photo(
    _photo: Photo,
    _photo_index: u32,
    _options: PhotoExportOptions,
) -> Result<(), String> {
    Ok(())
}
