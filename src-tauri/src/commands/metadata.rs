// Image metadata & EXIF commands.

use crate::image::exif_reader;
use crate::types::common_types::{ExifData, MetaData};

/// Reads a summarized `MetaData` (camera, capture date, orientation, exposure, ...) from an image's
/// EXIF data. On any error it falls back to the file's creation time + orientation 1 (Up).
#[tauri::command]
pub async fn read_metadata_of_image(image_path: String) -> Result<MetaData, String> {
    Ok(tokio::task::block_in_place(|| exif_reader::read_metadata_of_image(&image_path)))
}

/// Reads the full per-segment EXIF dump (`ifd0`, `exif`, `gps`, XMP, MakerNote, ...) for the info
/// panel. Returns `None` when the image carries no EXIF/XMP metadata.
#[tauri::command]
pub async fn get_exif_data(path: String) -> Result<Option<ExifData>, String> {
    Ok(tokio::task::block_in_place(|| exif_reader::read_exif_data(&path)))
}
