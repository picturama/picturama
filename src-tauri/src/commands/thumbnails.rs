// Thumbnail cache commands.

use std::path::Path;
use tauri::{AppHandle, State};

use crate::app_config_builder::AppConfig;
use crate::foreground_client;
use crate::store::{photo_work_store, thumbnail_store};
use crate::types::common_types::{Photo, PhotoId, PhotoRenderFormat, PhotoRenderOptions};
use crate::types::geometry_types::Size;

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
