use std::env;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    common_types::*,
    app_config_builder::AppConfig,
    exif_reader,
    foreground_client,
    geometry_types::Size,
    i18n::I18n,
    import_scanner,
    menu,
    store::{
        db::DbHandle,
        photo_store,
        photo_work_store,
        settings_store,
        tag_store,
        thumbnail_store,
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

/// Opens a native folder picker and returns the selected directories. Returns None when the user cancels.
#[tauri::command]
pub async fn select_scan_directories(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let picked = tokio::task::block_in_place(|| app.dialog().file().blocking_pick_folders());
    let folders = match picked {
        Some(folders) if !folders.is_empty() => folders,
        _ => return Ok(None), // cancelled
    };

    let dirs: Vec<String> = folders
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    Ok(Some(dirs))
}

/// TODO(phase5): Open a native folder picker for export.
#[tauri::command]
pub async fn select_export_directory(_app: AppHandle) -> Result<Option<String>, String> {
    Ok(None)
}

// ---------------------------------------------------------------------------
// Import / scan
// ---------------------------------------------------------------------------

/// Starts the directory scanner in a background task. Fire-and-forget: progress is streamed to the UI
/// via `foreground_client::set_import_progress`. Does nothing if an import is already running.
#[tauri::command]
pub async fn start_import(app: AppHandle) -> Result<(), String> {
    run_import_if_idle(&app)
}

/// Core of `start_import`, callable outside a command context (e.g. from the menu handler).
/// Resolves the managed state from the `AppHandle` itself so it needs no `State<'_>` arguments.
pub fn run_import_if_idle(app: &AppHandle) -> Result<(), String> {
    let app_config = app.state::<AppConfig>();
    let db = app.state::<DbHandle>();
    let import_state = app.state::<import_scanner::ImportState>();

    // Prevent concurrent imports: only proceed if we flip is_running false -> true.
    if import_state
        .is_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }
    import_state.should_cancel.store(false, Ordering::SeqCst);
    import_state.is_paused.store(false, Ordering::SeqCst);

    let settings_path = app_config.picturama_home_dir.join("settings.json");
    let photo_dirs = match settings_store::fetch_settings(&settings_path) {
        Ok(settings) => settings.photo_dirs,
        Err(e) => {
            import_state.is_running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };

    let app_handle = app.clone();
    let db_handle: DbHandle = db.inner().clone();
    tauri::async_runtime::spawn(async move {
        import_scanner::run_import(app_handle, db_handle, photo_dirs).await;
    });

    Ok(())
}

/// Toggles the pause state of the running scan.
#[tauri::command]
pub async fn toggle_import_paused(
    import_state: State<'_, import_scanner::ImportState>,
) -> Result<(), String> {
    let was_paused = import_state.is_paused.fetch_xor(true, Ordering::SeqCst);
    log::debug!("Import paused: {}", !was_paused);
    Ok(())
}

/// Requests cancellation of the running scan. Also clears pause so a paused scan can observe it.
#[tauri::command]
pub async fn cancel_import(
    import_state: State<'_, import_scanner::ImportState>,
) -> Result<(), String> {
    import_state.should_cancel.store(true, Ordering::SeqCst);
    import_state.is_paused.store(false, Ordering::SeqCst);
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

/// Writes a thumbnail image to `<picturama_home>/thumbnails/<short_id>.webp`.
/// 
/// Will be called after a thumbnail was rendered by the frontend WebGL canvas via the `renderPhoto` RPC.
#[tauri::command]
pub async fn create_thumbnail(
    app: AppHandle,
    app_config: State<'_, AppConfig>,
    photo: Photo,
) -> Result<(), String> {
    let thumbnail_path = thumbnail_store::thumbnail_path(&app_config.picturama_home_dir, photo.id);
    if thumbnail_path.exists() {
        return Ok(());
    }

    let master_path = format!("{}/{}", photo.master_dir, photo.master_filename);
    if !Path::new(&master_path).exists() {
        // The frontend special-cases missing masters (error code 'master-missing').
        return Err(format!("Photo does not exist: {}", master_path));
    }

    let photo_work = tokio::task::block_in_place(|| photo_work_store::fetch_photo_work_of_photo(&photo))?;

    // Default row height of 'justified-layout' is 320px; wide max keeps panoramas at full height.
    let max_size = Size { width: 1024, height: 320 };
    let options = PhotoRenderOptions { format: PhotoRenderFormat::Webp, quality: 0.92 };
    let binary = foreground_client::render_photo(&app, &photo, &photo_work, Some(max_size), &options).await?;

    tokio::task::block_in_place(|| thumbnail_store::write_thumbnail(&thumbnail_path, &binary))
}

/// Remove a photo's thumbnail from the cache.
#[tauri::command]
pub async fn delete_thumbnail(app_config: State<'_, AppConfig>, photo_id: PhotoId) -> Result<(), String> {
    tokio::task::block_in_place(|| thumbnail_store::delete_thumbnail(&app_config.picturama_home_dir, photo_id))
}

// ---------------------------------------------------------------------------
// Image metadata & EXIF
// ---------------------------------------------------------------------------

/// Reads a summarized `MetaData` (camera, capture date, orientation, exposure, ...) from an image's
/// EXIF data. On any error it falls back to the file's creation time + orientation 1 (Up).
#[tauri::command]
pub async fn read_metadata_of_image(image_path: String) -> Result<MetaData, String> {
    Ok(tokio::task::block_in_place(|| exif_reader::read_metadata_of_image(&image_path)))
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
