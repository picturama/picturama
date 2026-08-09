// Export commands.
//
// The pixels are still produced by the frontend WebGL canvas via the `renderPhoto` foreground RPC (as thumbnails do).
// Rust owns only the file-side work: sizing math, filename de-duplication, optional EXIF re-embedding, writing bytes,
// and preserving the master's mtime.

use std::path::Path;

use tauri::{AppHandle, State};

use crate::foreground_client;
use crate::store::photo_work_store;
use crate::types::common_types::{Photo, PhotoExportOptions, PhotoRenderFormat, PhotoRenderOptions};
use crate::types::geometry_types::Size;
use crate::user_dirs::UserDirs;

#[tauri::command]
pub async fn export_photo(
    app: AppHandle,
    user_dirs: State<'_, UserDirs>,
    photo: Photo,
    photo_index: u32,
    options: PhotoExportOptions,
) -> Result<(), String> {
    // Both parts of the target path come from the web view, so both are checked: the directory must be the
    // one the user picked in the native dialog, and the file name must not be able to climb out of it.
    if !user_dirs.contains_export_dir(&options.folder_path) {
        return Err("Export folder was not selected by the user".to_string());
    }
    if !is_plain_file_name(&options.file_name_prefix) {
        return Err("Invalid export file name prefix".to_string());
    }

    let master_path = format!("{}/{}", photo.master_dir, photo.master_filename);

    let max_size = compute_max_size(&photo, &options)?;
    let render_options = PhotoRenderOptions { format: options.format, quality: options.quality };

    // Fetch the non-destructive edits off the async thread (as `create_thumbnail` does).
    let photo_work = tokio::task::block_in_place(|| photo_work_store::fetch_photo_work_of_photo(&photo))?;

    // Produce the encoded (and edited) pixels in the frontend WebGL canvas.
    let binary = foreground_client::render_photo(&app, &photo, &photo_work, max_size, &render_options).await?;

    tokio::task::block_in_place(|| write_export(&photo, photo_index, &options, &master_path, &binary))
}

/// Whether a string may be pasted into an export file name. The prefix is free text from the export dialog,
/// so it is only rejected when it could leave the export directory. The `like-original` style needs no such
/// check: `file_stem()` already reduces the master file name to a single component.
fn is_plain_file_name(name: &str) -> bool {
    !name.contains('/') && !name.contains('\\') && !name.contains('\0')
}

/// Writes the rendered image to a collision-free path, re-embeds EXIF when requested, and copies the
/// master's modification time. Runs the blocking filesystem work off the async runtime.
fn write_export(
    photo: &Photo,
    photo_index: u32,
    options: &PhotoExportOptions,
    master_path: &str,
    binary: &str,
) -> Result<(), String> {
    let base_path = match options.file_name_style.as_str() {
        "like-original" => {
            let stem = Path::new(&photo.master_filename)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| photo.master_filename.clone());
            format!("{}/{}", options.folder_path, stem)
        }
        "sequence" => format!("{}/{}{}", options.folder_path, options.file_name_prefix, photo_index + 1),
        other => return Err(format!("Unsupported fileNameStyle: {}", other)),
    };

    let ext = options.format.extension();
    let mut counter: u32 = 0;
    let export_path = loop {
        let candidate = format!("{}{}.{}", base_path, dedup_suffix(counter), ext);
        if !Path::new(&candidate).exists() {
            break candidate;
        }
        counter += 1;
    };

    // The RPC result is a JS binary string (one char per byte, 0–255). Convert with `c as u8`, NOT
    // `as_bytes()` (which would UTF-8-encode chars > 127 as 2 bytes).
    let mut bytes: Vec<u8> = binary.chars().map(|c| c as u8).collect();

    // Re-embed the master's EXIF for jpg→jpg exports
    if options.with_metadata && options.format == PhotoRenderFormat::Jpg && master_is_jpg(&photo.master_filename)
    {
        bytes = embed_master_exif(master_path, bytes)?;
    }

    std::fs::write(&export_path, &bytes).map_err(|e| e.to_string())?;

    // Preserve the master's modification time (the field photos are ordered by)
    if let Ok(mtime) = std::fs::metadata(master_path).and_then(|m| m.modified()) {
        if let Ok(file) = std::fs::File::options().write(true).open(&export_path) {
            let _ = file.set_modified(mtime);
        }
    }

    log::info!("Exported {}", export_path);
    Ok(())
}

/// Computes the render `maxSize` from the export size option. `None` means "original" (no cap).
fn compute_max_size(photo: &Photo, options: &PhotoExportOptions) -> Result<Option<Size>, String> {
    let size = match options.size.as_str() {
        "S" => Some(reduce_size(photo, 6000.0)),
        "M" => Some(reduce_size(photo, 200_000.0)),
        "L" => Some(reduce_size(photo, 1_000_000.0)),
        "original" => None,
        "custom" => {
            let n = options.custom_size_pixels;
            let s = match options.custom_size_side.as_str() {
                "size" => Size { width: n, height: n },
                "width" => Size { width: n, height: 100 * n },
                "height" => Size { width: 100 * n, height: n },
                other => return Err(format!("Unsupported customSizeSide: {}", other)),
            };
            Some(s)
        }
        other => return Err(format!("Unsupported size type: {}", other)),
    };
    Ok(size)
}

/// Scales a target pixel count into a `Size` that keeps the photo's aspect ratio, never upscaling past the
/// source width.
fn reduce_size(photo: &Photo, pixel_count: f64) -> Size {
    let photo_width = photo.edited_width.unwrap_or(photo.master_width) as f64;
    let photo_height = photo.edited_height.unwrap_or(photo.master_height) as f64;

    let aspect = photo_width / photo_height;
    let width = photo_width.min((pixel_count * aspect).sqrt().round());
    Size { width: width as u32, height: (width / aspect).round() as u32 }
}

/// Builds the collision-avoiding filename suffix: `""`, `_001`, …, `_010`, …, `_100`.
fn dedup_suffix(counter: u32) -> String {
    if counter == 0 {
        String::new()
    } else {
        let pad = if counter < 10 {
            "00"
        } else if counter < 100 {
            "0"
        } else {
            ""
        };
        format!("_{}{}", pad, counter)
    }
}

fn master_is_jpg(filename: &str) -> bool {
    let lower = filename.to_ascii_lowercase();
    lower.ends_with(".jpg") || lower.ends_with(".jpeg")
}

/// Copies the EXIF segment from the master JPEG into the exported JPEG bytes. Returns the export bytes
/// unchanged if the master carries no EXIF.
fn embed_master_exif(master_path: &str, export_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    use img_parts::jpeg::Jpeg;
    use img_parts::{Bytes, ImageEXIF};

    let master_bytes = std::fs::read(master_path).map_err(|e| e.to_string())?;
    let master_jpeg = Jpeg::from_bytes(Bytes::from(master_bytes)).map_err(|e| e.to_string())?;
    let exif = match master_jpeg.exif() {
        Some(exif) => exif,
        None => return Ok(export_bytes),
    };

    let mut export_jpeg = Jpeg::from_bytes(Bytes::from(export_bytes)).map_err(|e| e.to_string())?;
    export_jpeg.set_exif(Some(exif));
    Ok(export_jpeg.encoder().bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn photo(width: u32, height: u32) -> Photo {
        Photo {
            id: 1,
            master_dir: "/photos".to_string(),
            master_filename: "IMG_0001.JPG".to_string(),
            master_width: width,
            master_height: height,
            edited_width: None,
            edited_height: None,
            date_section: "2026-07-13".to_string(),
            created_at: 0,
            updated_at: 0,
            imported_at: 0,
            flag: false,
            trashed: false,
        }
    }

    #[test]
    fn dedup_suffix_matches_reference_padding() {
        assert_eq!(dedup_suffix(0), "");
        assert_eq!(dedup_suffix(1), "_001");
        assert_eq!(dedup_suffix(9), "_009");
        assert_eq!(dedup_suffix(10), "_010");
        assert_eq!(dedup_suffix(99), "_099");
        assert_eq!(dedup_suffix(100), "_100");
        assert_eq!(dedup_suffix(1000), "_1000");
    }

    #[test]
    fn reduce_size_keeps_aspect_and_target_pixel_count() {
        // 3000x2000 (aspect 1.5), target 1_000_000 px² → width = round(sqrt(1e6 * 1.5)) = 1225.
        let s = reduce_size(&photo(3000, 2000), 1_000_000.0);
        assert_eq!(s.width, 1225);
        assert_eq!(s.height, 817); // round(1225 / 1.5)
    }

    #[test]
    fn reduce_size_never_upscales_past_source_width() {
        // Small source, large target → clamps to the source width.
        let s = reduce_size(&photo(800, 600), 1_000_000.0);
        assert_eq!(s.width, 800);
        assert_eq!(s.height, 600);
    }

    #[test]
    fn reduce_size_prefers_edited_dimensions() {
        let mut p = photo(4000, 3000);
        p.edited_width = Some(2000);
        p.edited_height = Some(1000); // aspect 2.0
        let s = reduce_size(&p, 200_000.0);
        assert_eq!(s.width, 632); // round(sqrt(200000 * 2)) = 632
        assert_eq!(s.height, 316);
    }

    #[test]
    fn custom_size_side_mapping() {
        let mut options = base_options();
        options.size = "custom".to_string();
        options.custom_size_pixels = 1024;

        options.custom_size_side = "size".to_string();
        assert_max_size(&options, 1024, 1024);

        options.custom_size_side = "width".to_string();
        assert_max_size(&options, 1024, 102_400);

        options.custom_size_side = "height".to_string();
        assert_max_size(&options, 102_400, 1024);
    }

    #[test]
    fn original_size_has_no_cap() {
        let mut options = base_options();
        options.size = "original".to_string();
        assert!(compute_max_size(&photo(3000, 2000), &options).unwrap().is_none());
    }

    fn assert_max_size(options: &PhotoExportOptions, width: u32, height: u32) {
        let s = compute_max_size(&photo(3000, 2000), options).unwrap().unwrap();
        assert_eq!((s.width, s.height), (width, height));
    }

    fn base_options() -> PhotoExportOptions {
        PhotoExportOptions {
            format: PhotoRenderFormat::Jpg,
            quality: 0.9,
            size: "L".to_string(),
            custom_size_side: "size".to_string(),
            custom_size_pixels: 1024,
            with_metadata: true,
            file_name_style: "like-original".to_string(),
            file_name_prefix: "photo_".to_string(),
            folder_path: "/out".to_string(),
        }
    }
}
