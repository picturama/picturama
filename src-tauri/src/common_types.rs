// Mirrors src/common/CommonTypes.ts.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;


// ----- Database types -----


pub type PhotoId = i64;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: PhotoId,
    /// The directory of the original image. Example: '/User/me/Pictures'
    pub master_dir: String,
    /// The filename (without directory) of the original image. Example: 'IMG_9700.JPG'
    pub master_filename: String,
    /// The width of the original image - only with EXIF rotation applied (in px).
    pub master_width: u32,
    /// The height of the original image - only with EXIF rotation applied (in px).
    pub master_height: u32,
    // NOTE: the DB still has a `master_is_raw` column (kept with `DEFAULT '0'` so no migration is needed),
    // but it is no longer used: RAW is displayed on demand from its embedded JPEG preview
    // (see `raw_reader` / `WebGLCanvas`), so the master path is used for every format.
    /// The width of the original image - after EXIF rotation and all PhotoWork have been applied (in px).
    pub edited_width: Option<u32>,
    /// The height of the original image - after EXIF rotation and all PhotoWork have been applied (in px).
    pub edited_height: Option<u32>,
    /// Example: '2016-09-18'
    pub date_section: String,
    /// The timestamp when the photo was created
    pub created_at: i64,
    /// The timestamp when the photo was modified
    pub updated_at: i64,
    /// The timestamp when the photo was imported
    pub imported_at: i64,
    /// Whether the image is flagged (= marked as favorite).
    pub flag: bool,
    /// Whether the image is in the trash (Picturama trash - not the file system's trash).
    pub trashed: bool,
}


pub type TagId = i64;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: TagId,
    pub title: String,
    pub slug: String,
    pub created_at: i64,
    pub updated_at: Option<i64>,
}


// ----- Other types (not database) -----


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcErrorInfo {
    pub message: String,
    pub error_code: Option<String>,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub photo_dirs: Vec<String>,
    pub export_options: Option<PhotoExportOptions>,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiConfig {
    pub version: String,
    pub platform: String,
    pub window_style: WindowStyle,
    pub has_native_menu: bool,
    pub raw_locale: String,
    pub thumbnail_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// The style of the main window:
///   - 'nativeTrafficLight': Window uses native MacOS traffic light buttons (top left corner)
///   - 'windowsButtons': Window shows HTML buttons in Windows 10 look (top right corner)
pub enum WindowStyle {
    NativeTrafficLight,
    WindowsButtons,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportPhase {
    ScanDirs,
    Cleanup,
    ImportPhotos,
    Error,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub phase: ImportPhase,
    pub is_paused: bool,
    pub total: u32,
    pub processed: u32,
    pub added: u32,
    pub removed: u32,
    pub current_path: Option<String>,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoDetail {
    //pub versions: Vec<Version>,
    /// The tags attached to this photo. This may also contain new tags which don't exist in DB yet.
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PhotoWork {
    /// 1 = 90°, 2 = 180°, 3 = 270°
    pub rotation_turns: Option<u8>,
    pub tilt: Option<f64>,
    pub crop_rect: Option<crate::geometry_types::Rect>,
    pub flagged: Option<bool>,
    pub tags: Option<Vec<String>>,
}

pub type PhotoSectionId = String;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoSection {
    pub id: PhotoSectionId,
    pub title: String,
    pub count: u32,
    /// Only set for LoadedPhotoSection
    #[serde(skip_serializing_if = "Option::is_none")]
    pub photo_ids: Option<Vec<PhotoId>>,
    /// Only set for LoadedPhotoSection
    #[serde(skip_serializing_if = "Option::is_none")]
    pub photo_data: Option<HashMap<PhotoId, Photo>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoSet {
    pub photo_ids: Vec<PhotoId>,
    pub photo_data: HashMap<PhotoId, Photo>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// The style of the main window:
///   - 'nativeTrafficLight': Window uses native MacOS traffic light buttons (top left corner)
///   - 'windowsButtons': Window shows HTML buttons in Windows 10 look (top right corner)
pub enum PhotoFilterType {
    All,
    Favorites,
    Trash,
    Tag,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoFilter {
    pub filter_type: PhotoFilterType,
    pub tag_id: Option<TagId>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoRenderOptions {
    pub format: PhotoRenderFormat,
    /// Quality 0.0–1.0 (ignored for PNG)
    pub quality: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PhotoRenderFormat {
    Jpg,
    Webp,
    Png,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoExportOptions {
    /// 'S' | 'M' | 'L' | 'original' | 'custom'
    pub size: String,
    /// 'width' | 'height' | 'size'
    pub custom_size_side: String,
    pub custom_size_pixels: u32,
    pub with_metadata: bool,
    /// 'like-original' | 'sequence'
    pub file_name_style: String,
    pub file_name_prefix: String,
    pub folder_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoExportProgress {
    pub processed: u32,
    pub total: u32,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmptyTrashResult {
    pub photo_ids: Vec<PhotoId>,
    pub updated_tags: Option<Vec<Tag>>,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaData {
    pub img_width: Option<u32>,
    pub img_height: Option<u32>,
    /// The assumed image width (in px). This width is not sure and should only be used if there is no other way for determining it
    pub img_width_assumed: Option<u32>,
    /// The assumed image height (in px). This height is not sure and should only be used if there is no other way for determining it
    pub img_height_assumed: Option<u32>,
    /// Example: 'SONY DSC-N2'
    pub camera: Option<String>,
    /// Example: 0.0166
    pub exposure_time: Option<f64>,
    /// Example: 200
    pub iso: Option<u32>,
    /// Example: 5.6
    pub aperture: Option<f64>,
    /// Example: 5
    pub focal_length: Option<f64>,
    pub created_at: Option<i64>,
    /// EXIF orientation (1=Up, 3=Bottom, 6=Right, 8=Left)
    pub orientation: u32,
    pub tags: Vec<String>,
}


/// One EXIF segment: an insertion-ordered map of exifr-style tag names to their (mostly
/// human-readable) values. `IndexMap` preserves the natural EXIF field order, which keeps the info
/// panel's "first 10 keys" fallback sensible.
pub type ExifSegment = IndexMap<String, JsonValue>;

/// The full per-segment EXIF dump for the info panel (the `getExifData` command), mirroring the
/// frontend `ExifData` type. Segments filled by `exif_reader`/`xmp_reader`: `ifd0`, `ifd1`, `exif`,
/// `gps`, `interop`, `xmp`, plus the raw `makerNote`/`userComment` byte blobs.
/// `iptc`, `icc` and `jfif` are non-EXIF standards not produced yet; they are kept for type parity and the frontend
/// renders "Photo has no …" for a missing segment.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exif: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ifd0: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ifd1: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gps: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interop: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jfif: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iptc: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xmp: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icc: Option<ExifSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maker_note: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_comment: Option<Vec<u8>>,
}


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedHeifImage {
    /// The width of the image (in px)
    pub width: u32,
    /// The height of the image (in px)
    pub height: u32,
    /// The image data in RGB (8 bit per channel). size in bytes = 3 * width * height
    pub data: Vec<u8>,
}
