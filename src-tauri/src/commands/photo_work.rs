// PhotoWork (non-destructive edit operations) commands.

use std::path::Path;

use tauri::State;

use crate::store::photo_work_store;
use crate::types::common_types::{Photo, PhotoWork};
use crate::user_dirs::UserDirs;

#[tauri::command]
pub async fn fetch_photo_work_of_photo(photo: Photo) -> Result<PhotoWork, String> {
    tokio::task::block_in_place(|| photo_work_store::fetch_photo_work_of_photo(&photo))
}

#[tauri::command]
pub async fn store_photo_work(
    user_dirs: State<'_, UserDirs>,
    photo_dir: String,
    photo_filename: String,
    photo_work: PhotoWork,
) -> Result<(), String> {
    // The `picturama.yml` sidecar is written into the photo's own directory, which the web view supplies.
    // Accept only directories below one of the photo directories the user chose — writing (and, for empty
    // edits, deleting) a sidecar anywhere else is never a legitimate call.
    if !user_dirs.is_inside_photo_dir(&photo_dir) {
        return Err(format!("Not inside a photo directory: {}", photo_dir));
    }

    tokio::task::block_in_place(|| {
        photo_work_store::store_photo_work(
            Path::new(&photo_dir),
            &photo_filename,
            &photo_work,
        )
    })
}
