// Image decoding commands (HEIC/HEIF native decode + RAW embedded-preview extraction). These are thin
// wrappers over the `crate::image` reader modules; the pixel/JPEG bytes are streamed as raw IPC
// responses rather than serde structs (see below).

use crate::image::{heif, raw_reader};

/// Decodes a HEIC/HEIF file to interleaved 8-bit RGB via libheif. The container's geometric
/// transforms (rotation/crop/mirror) are applied during decode, so `width`/`height` are the
/// display (oriented) dimensions and the frontend uploads the buffer as-is.
///
/// The result is returned as raw bytes (an 8-byte header + RGB8 pixels) rather than a serde struct:
/// serializing a 12 MP image, the ~36 MB pixel `Vec<u8>` as JSON would balloon it into a
/// ~130 MB number array, which would dominated the load time (because of JSON serialization/deserialization).
/// Raw bytes cross IPC as an `ArrayBuffer`.
#[tauri::command]
pub async fn load_heif_file(path: String) -> Result<tauri::ipc::Response, String> {
    let img = tokio::task::block_in_place(|| heif::decode_file(&path))?;
    Ok(tauri::ipc::Response::new(heif::encode_heif_response(&img)))
}

/// Extracts the largest embedded JPEG preview from a RAW file and returns its bytes. Picturama uses the
/// camera-developed preview instead of demosaicing the sensor data (see `raw_reader`). The bytes are a
/// self-describing JPEG which the frontend decodes with the browser, exactly like a normal `.jpg` — so
/// nothing is decoded in Rust, and the compressed bytes (rather than raw RGB) cross IPC.
#[tauri::command]
pub async fn extract_raw_preview_jpg(path: String) -> Result<tauri::ipc::Response, String> {
    let jpeg = tokio::task::block_in_place(|| raw_reader::extract_embedded_jpeg(&path))?;
    Ok(tauri::ipc::Response::new(jpeg))
}
