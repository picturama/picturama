// Tag commands.

use tauri::State;

use crate::store::db::DbHandle;
use crate::store::tag_store;
use crate::types::common_types::{PhotoId, Tag};

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
