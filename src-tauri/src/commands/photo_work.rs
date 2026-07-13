// PhotoWork (non-destructive edit operations) commands.

use std::path::Path;

use crate::store::photo_work_store;
use crate::types::common_types::{Photo, PhotoWork};

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
