use chrono::{ NaiveDate, TimeZone, Utc };
use std::env;
use tauri::{AppHandle, State};

use crate::{common_types::*, app_config_builder::AppConfig};


// ---------------------------------------------------------------------------
// Lifecycle & configuration
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn wait_for_background_ready() -> Result<(), String> {
    // Always succeeds – no separate background process needed (yet).
    Ok(())
}

/// TODO(phase1): Returns a hardcoded locale; later read from system settings.
#[tauri::command]
pub async fn fetch_ui_config(app_config: State<'_, AppConfig>) -> Result<UiConfig, String> {
    Ok(UiConfig {
        version: "dev".to_string(),
        platform: env::consts::OS.to_string(),
        window_style: if env::consts::OS == "macos" { WindowStyle::NativeTrafficLight } else { WindowStyle::WindowsButtons },
        has_native_menu: env::consts::OS == "macos",
        locale: "en".to_string(),
        non_raw_path:   app_config.picturama_home_dir.join("non-raw").to_str().unwrap().to_string(),
        thumbnail_path: app_config.picturama_home_dir.join("thumbnails").to_str().unwrap().to_string(),
    })
}

/// TODO(phase2): Load settings from SQLite.
#[tauri::command]
pub async fn fetch_settings() -> Result<Settings, String> {
    Ok(Settings {
        photo_dirs: vec![],
        export_options: None,
    })
}

/// TODO(phase2): Persist settings to SQLite.
#[tauri::command]
pub async fn store_settings(_settings: Settings) -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
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
            std::path::Path::new(&full_path)
                .parent()
                .unwrap_or(std::path::Path::new("/")),
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

/// TODO(phase3): Read from SQLite.
#[tauri::command]
pub async fn fetch_total_photo_count() -> Result<u32, String> {
    Ok(mock_photos().len() as u32)
}

/// TODO(phase3): Read from SQLite and apply filter.
#[tauri::command]
pub async fn fetch_sections(
    _filter: PhotoFilter,
    _section_ids_to_keep_loaded: Option<Vec<PhotoSectionId>>,
) -> Result<Vec<PhotoSection>, String> {
    Ok(vec![
        PhotoSection {
            id: "2024-01-01".to_string(),
            title: "2024-01-01".to_string(),
            count: 2,
        },
        PhotoSection {
            id: "2024-03-01".to_string(),
            title: "2024-03-01".to_string(),
            count: 1,
        },
    ])
}

/// TODO(phase3): Load photos per section from SQLite.
#[tauri::command]
pub async fn fetch_section_photos(
    section_ids: Vec<PhotoSectionId>,
    _filter: PhotoFilter,
) -> Result<Vec<PhotoSet>, String> {
    let mut all_photos = mock_photos();
    let sets = section_ids
        .into_iter()
        .map(|sid| {
            let photos: Vec<Photo> = all_photos
                .extract_if(.., |photo| photo.date_section == sid)
                .collect();
            let photo_ids: Vec<PhotoId> = photos.iter().map(|p| p.id).collect();
            PhotoSet {
                photo_ids,
                photo_data: photos.into_iter().map(|p| (p.id, p)).collect(),
            }
        })
        .collect();
    Ok(sets)
}

/// TODO(phase3): Update photo record in SQLite.
#[tauri::command]
pub async fn update_photos(
    _photo_ids: Vec<PhotoId>,
    _update: serde_json::Value,
) -> Result<(), String> {
    Ok(())
}

/// TODO(phase3): Delete photos record in SQLite and move files to system trash.
#[tauri::command]
pub async fn empty_trash() -> Result<EmptyTrashResult, String> {
    Ok(EmptyTrashResult { photo_ids: vec![], updated_tags: vec![] })
}

/// TODO(phase3): Load photo detail from SQLite + EXIF.
#[tauri::command]
pub async fn fetch_photo_detail(photo_id: PhotoId) -> Result<PhotoDetail, String> {
    Ok(PhotoDetail { tags: vec![] })
}

// ---------------------------------------------------------------------------
// PhotoWork (non-destructive edit operations)
// ---------------------------------------------------------------------------

/// TODO(phase2): Read from the ansel.json sidecar file next to the image.
#[tauri::command]
pub async fn fetch_photo_work_of_photo(_photo: Photo) -> Result<PhotoWork, String> {
    Ok(PhotoWork {
        rotation_turns: None,
        tilt:           None,
        crop_rect:      None,
        flagged:        None,
        tags:           None,
    })
}

/// TODO(phase2): Write to the ansel.json sidecar file next to the image.
#[tauri::command]
pub async fn store_photo_work(
    _photo_dir: String,
    _photo_filename: String,
    _photo_work: PhotoWork,
) -> Result<(), String> {
    Ok(())
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

/// TODO(phase2): Load tags from SQLite.
#[tauri::command]
pub async fn fetch_tags() -> Result<Vec<Tag>, String> {
    Ok(vec![
        Tag {
            id:         1,
            created_at: 1565357205167,
            slug:       "flower".to_string(),
            title:      "Flower".to_string(),
            updated_at: None,
        },
        Tag {
            id:         2,
            created_at: 1565357205167,
            slug:       "panorama".to_string(),
            title:      "Panorama".to_string(),
            updated_at: None,
        },
    ])
}

/// TODO(phase2): Persist photo tags to SQLite.
#[tauri::command]
pub async fn store_photo_tags(
    _photo_id: PhotoId,
    _photo_tags: Vec<String>,
) -> Result<Option<Vec<Tag>>, String> {
    Ok(None)
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

// ---------------------------------------------------------------------------
// Mock data (replaced by real DB queries in phase 3)
// ---------------------------------------------------------------------------

fn mock_photos() -> Vec<Photo> {
    vec![
        Photo {
            id: 1,
            master_dir: "/mock/photos/2024-03".to_string(),
            master_filename: "DSC_0001.jpg".to_string(),
            master_width: 4000,
            master_height: 3000,
            master_is_raw: false,
            edited_width: None,
            edited_height: None,
            date_section: "2024-03-01".to_string(),
            created_at: to_timestamp("2024-03-01"),
            updated_at: to_timestamp("2024-03-01"),
            imported_at: to_timestamp("2024-03-01"),
            flag: false,
            trashed: false,
        },
        Photo {
            id: 2,
            master_dir: "/mock/photos/2024-03".to_string(),
            master_filename: "DSC_0002.jpg".to_string(),
            master_width: 3000,
            master_height: 4000,
            master_is_raw: false,
            edited_width: None,
            edited_height: None,
            date_section: "2024-03-01".to_string(),
            created_at: to_timestamp("2024-03-01"),
            updated_at: to_timestamp("2024-03-01"),
            imported_at: to_timestamp("2024-03-01"),
            flag: false,
            trashed: false,
        },
        Photo {
            id: 3,
            master_dir: "/mock/photos/2024-01".to_string(),
            master_filename: "IMG_0042.png".to_string(),
            master_width: 1920,
            master_height: 1080,
            master_is_raw: false,
            edited_width: None,
            edited_height: None,
            date_section: "2024-01-01".to_string(),
            created_at: to_timestamp("2024-01-01"),
            updated_at: to_timestamp("2024-01-01"),
            imported_at: to_timestamp("2024-01-01"),
            flag: false,
            trashed: false,
        },
    ]
}

// date_str format: YYYY-MM-DD
fn to_timestamp(date_str: &str) -> i64 {
    let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .expect("Invalid date format");

    let datetime = date.and_hms_opt(0, 0, 0)
        .expect("Invalid time");

    Utc.from_utc_datetime(&datetime).timestamp() * 1000
}
