// Export commands.

use crate::types::common_types::{Photo, PhotoExportOptions};

/// TODO(phase5): Implement real image export.
#[tauri::command]
pub async fn export_photo(
    _photo: Photo,
    _photo_index: u32,
    _options: PhotoExportOptions,
) -> Result<(), String> {
    Ok(())
}
