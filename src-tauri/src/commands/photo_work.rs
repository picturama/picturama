// PhotoWork (non-destructive edit operations) commands.

use std::path::{Component, Path};

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
    let dir_path = Path::new(&photo_dir);
    if !dir_path.is_absolute() || dir_path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("Invalid photo directory".to_string());
    }
    let filename_path = Path::new(&photo_filename);
    if filename_path
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::RootDir))
    {
        return Err("Invalid photo filename".to_string());
    }

    tokio::task::block_in_place(|| {
        photo_work_store::store_photo_work(dir_path, &photo_filename, &photo_work)
    })
}
