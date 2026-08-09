// Filesystem helper commands + directory selection.

use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::asset_scope;
use crate::user_dirs::UserDirs;

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

/// Opens a native folder picker and returns the selected directories. Returns None when the user cancels.
#[tauri::command]
pub async fn select_scan_directories(app: AppHandle, user_dirs: State<'_, UserDirs>)
    -> Result<Option<Vec<String>>, String>
{
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

    // The native dialog is the only trustworthy source of a photo directory: remember the choice so
    // `store_settings` accepts it, and open the asset protocol right away so the photos show without a
    // restart.
    user_dirs.add_photo_dirs(&dirs);
    asset_scope::allow_photo_dirs(&app, &dirs);

    Ok(Some(dirs))
}

/// Opens a native folder picker for a single export target directory. Returns None when the user cancels.
#[tauri::command]
pub async fn select_export_directory(app: AppHandle, user_dirs: State<'_, UserDirs>)
    -> Result<Option<String>, String>
{
    let picked = tokio::task::block_in_place(|| app.dialog().file().blocking_pick_folder());
    let folder = match picked {
        Some(folder) => folder,
        None => return Ok(None), // cancelled
    };

    let dir = folder
        .into_path()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    // `export_photo` writes only to a directory that passed through this dialog.
    user_dirs.add_export_dir(&dir);

    Ok(Some(dir))
}
