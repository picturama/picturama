// Thumbnail cache: writes/deletes the rendered thumbnail files that the frontend
// loads directly via the asset protocol (convertFileSrc).

use std::path::{Path, PathBuf};

use crate::types::common_types::PhotoId;

/// File extension for cached thumbnails (matches `config.workExt` in the frontend).
const THUMBNAIL_EXT: &str = "webp";

/// File extension for the marker of a render attempt that never came back (see `create_thumbnail`).
const FAILED_MARKER_EXT: &str = "failed";

/// Encode a photo id as base-36 (digits 0-9a-z), matching JS `Number.toString(36)`
/// used by `shortId` in src/common/util/DataUtil.ts. Ids are positive (auto-increment).
pub fn short_id(photo_id: PhotoId) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if photo_id == 0 {
        return "0".to_string();
    }
    let mut n = photo_id as u64;
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).unwrap()
}

/// The on-disk path of a photo's thumbnail: `<home_dir>/thumbnails/<short_id>.webp`.
pub fn thumbnail_path(home_dir: &Path, photo_id: PhotoId) -> PathBuf {
    cache_path(home_dir, photo_id, THUMBNAIL_EXT)
}

/// The on-disk path of a photo's failure marker: `<home_dir>/thumbnails/<short_id>.failed`.
pub fn failed_marker_path(home_dir: &Path, photo_id: PhotoId) -> PathBuf {
    cache_path(home_dir, photo_id, FAILED_MARKER_EXT)
}

fn cache_path(home_dir: &Path, photo_id: PhotoId, ext: &str) -> PathBuf {
    home_dir
        .join("thumbnails")
        .join(format!("{}.{}", short_id(photo_id), ext))
}

/// Write a rendered thumbnail (a JS binary string) to `path`, creating the cache dir.
pub fn write_thumbnail(path: &Path, binary: &str) -> Result<(), String> {
    create_cache_dir(path)?;
    // `binary` is a JS binary string (one char per byte, 0-255). Map each char back to
    // its byte value; do NOT use `as_bytes()` (would UTF-8-encode chars > 127 as 2 bytes).
    let bytes: Vec<u8> = binary.chars().map(|c| c as u8).collect();
    std::fs::write(path, bytes)
        .map_err(|e| format!("Could not write thumbnail {}: {}", path.display(), e))
}

/// Write the marker that a render for this photo is under way. It is removed as soon as the renderer
/// answers, so a marker found later means the renderer never answered at all — see `create_thumbnail`.
pub fn write_failed_marker(path: &Path, master_path: &str) -> Result<(), String> {
    create_cache_dir(path)?;
    // Nothing reads the content; it is there for whoever looks into the cache directory.
    std::fs::write(path, master_path)
        .map_err(|e| format!("Could not write marker {}: {}", path.display(), e))
}

/// Remove a photo's cached thumbnail if it exists (a missing file is not an error).
///
/// Removes the failure marker as well: this is the "the thumbnail is stale" path (a rotated or otherwise
/// edited photo), and after an edit the render is worth another try.
pub fn delete_thumbnail(home_dir: &Path, photo_id: PhotoId) -> Result<(), String> {
    remove_file_if_exists(&thumbnail_path(home_dir, photo_id))?;
    remove_file_if_exists(&failed_marker_path(home_dir, photo_id))
}

/// Remove a photo's failure marker if it exists (a missing file is not an error).
pub fn delete_failed_marker(path: &Path) -> Result<(), String> {
    remove_file_if_exists(path)
}

fn create_cache_dir(path: &Path) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create thumbnail dir: {}", e))?;
    }
    Ok(())
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not delete {}: {}", path.display(), e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_id_matches_js_to_string_36() {
        assert_eq!(short_id(0), "0");
        assert_eq!(short_id(1), "1");
        assert_eq!(short_id(35), "z");
        assert_eq!(short_id(36), "10");
        assert_eq!(short_id(1234), "ya");
    }

    #[test]
    fn thumbnail_path_uses_base36_and_webp() {
        let path = thumbnail_path(Path::new("/home/.picturama"), 1234);
        assert!(path.ends_with("thumbnails/ya.webp"));
    }

    #[test]
    fn failed_marker_sits_next_to_the_thumbnail() {
        let path = failed_marker_path(Path::new("/home/.picturama"), 1234);
        assert!(path.ends_with("thumbnails/ya.failed"));
    }

    #[test]
    fn delete_thumbnail_removes_the_marker_too() {
        let dir = std::env::temp_dir().join(format!("picturama-marker-test-{}", std::process::id()));
        let marker_path = failed_marker_path(&dir, 1234);
        write_failed_marker(&marker_path, "/photos/broken.tiff").unwrap();
        write_thumbnail(&thumbnail_path(&dir, 1234), "x").unwrap();

        delete_thumbnail(&dir, 1234).unwrap();
        assert!(!thumbnail_path(&dir, 1234).exists());
        assert!(!marker_path.exists());
        // Deleting again is not an error — neither file is there any more.
        delete_thumbnail(&dir, 1234).unwrap();
        delete_failed_marker(&marker_path).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_thumbnail_preserves_high_bytes() {
        let dir = std::env::temp_dir().join(format!("picturama-thumb-test-{}", std::process::id()));
        let path = dir.join("thumbnails").join("t.webp");
        // Binary string with bytes spanning 0..=255, including > 127.
        let binary: String = (0u32..=255).map(|b| char::from_u32(b).unwrap()).collect();
        write_thumbnail(&path, &binary).unwrap();
        let written = std::fs::read(&path).unwrap();
        assert_eq!(written, (0u8..=255).collect::<Vec<u8>>());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
