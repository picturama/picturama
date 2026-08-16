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
///
/// Only success used to be remembered (the written thumbnail), so a photo whose render killed the web view
/// was requested again by the reloaded grid — endlessly, and without ever producing an error to react to.
/// A marker file written before the render closes that gap: it is removed as soon as the renderer answers
/// at all, so finding it means the last run was fatal and the photo has to be skipped.
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
    let failed_marker_path = thumbnail_store::failed_marker_path(&app_config.picturama_home_dir, photo.id);
    if failed_marker_path.exists() {
        // The frontend shows a placeholder for this (as for any failure), which is the whole point:
        // rendering it again would take the web view down again.
        return Err(format!("Rendering this photo killed the renderer before: {}", master_path));
    }

    if !Path::new(&master_path).exists() {
        // The frontend special-cases missing masters (error code 'master-missing').
        return Err(format!("Photo does not exist: {}", master_path));
    }

    let photo_work = tokio::task::block_in_place(|| photo_work_store::fetch_photo_work_of_photo(&photo))?;

    // Default row height of 'justified-layout' is 320px; wide max keeps panoramas at full height.
    let max_size = Size { width: 1024, height: 320 };
    let options = PhotoRenderOptions { format: PhotoRenderFormat::Webp, quality: 0.92 };
    tokio::task::block_in_place(|| thumbnail_store::write_failed_marker(&failed_marker_path, &master_path))?;
    let render_result = foreground_client::render_photo(&app, &photo, &photo_work, Some(max_size), &options).await;

    tokio::task::block_in_place(|| {
        let write_result = render_result.and_then(|binary| thumbnail_store::write_thumbnail(&thumbnail_path, &binary));
        // The renderer answered, so its run was survivable — whether it delivered pixels or an error.
        // Removing the marker after writing the thumbnail keeps a failing removal from causing a re-render:
        // the thumbnail is there and short-circuits the next call.
        thumbnail_store::delete_failed_marker(&failed_marker_path)?;
        write_result
    })
}

/// Remove a photo's thumbnail from the cache — and its failure marker, so an edited photo is rendered again.
#[tauri::command]
pub async fn delete_thumbnail(app_config: State<'_, AppConfig>, photo_id: PhotoId) -> Result<(), String> {
    tokio::task::block_in_place(|| thumbnail_store::delete_thumbnail(&app_config.picturama_home_dir, photo_id))
}
