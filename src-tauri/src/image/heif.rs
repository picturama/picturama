// HEIC/HEIF decoding via libheif. The container's geometric transforms (rotation/crop/mirror) are
// applied during decode, so the returned size is the *display* (oriented) size and the frontend uploads
// the buffer as-is.

use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};

/// A decoded HEIC/HEIF image: interleaved 8-bit RGB pixels plus their display dimensions.
///
/// This is an internal type that does not cross the IPC boundary (the command layer streams the pixels
/// as raw bytes via `tauri::ipc::Response`, see `encode_heif_response`), so it carries no serde derives.
pub struct DecodedHeifImage {
    /// The width of the image (in px)
    pub width: u32,
    /// The height of the image (in px)
    pub height: u32,
    /// The image data in RGB (8 bit per channel). size in bytes = 3 * width * height
    pub data: Vec<u8>,
}

/// Serialize a decoded image for the raw IPC response: an 8-byte little-endian header
/// (width, height as u32) followed by the interleaved RGB8 pixels.
pub fn encode_heif_response(img: &DecodedHeifImage) -> Vec<u8> {
    let mut buf = Vec::with_capacity(8 + img.data.len());
    buf.extend_from_slice(&img.width.to_le_bytes());
    buf.extend_from_slice(&img.height.to_le_bytes());
    buf.extend_from_slice(&img.data);
    buf
}

pub fn decode_file(path: &str) -> Result<DecodedHeifImage, String> {
    let lib_heif = LibHeif::new();
    let ctx = HeifContext::read_from_file(path).map_err(|e| e.to_string())?;
    let handle = ctx.primary_image_handle().map_err(|e| e.to_string())?;
    let image = lib_heif
        .decode(&handle, ColorSpace::Rgb(RgbChroma::Rgb), None)
        .map_err(|e| e.to_string())?;

    let width = image.width();
    let height = image.height();
    let planes = image.planes();
    let plane = planes
        .interleaved
        .ok_or_else(|| "HEIC decode returned no interleaved RGB plane".to_string())?;

    // The plane's stride may exceed width*3 (row padding); pack rows tightly so that
    // data.len() == 3 * width * height, as the frontend WebGL upload expects.
    let row_bytes = width as usize * 3;
    let mut data = Vec::with_capacity(row_bytes * height as usize);
    for y in 0..height as usize {
        let start = y * plane.stride;
        data.extend_from_slice(&plane.data[start..start + row_bytes]);
    }

    Ok(DecodedHeifImage { width, height, data })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn decodes_heic_to_packed_rgb() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..").join("submodules").join("test-data").join("photos")
            .join("heic").join("Apple_iPhone_XR_portrait.HEIC");
        let img = decode_file(path.to_str().unwrap()).expect("decode HEIC");
        assert!(img.width > 0 && img.height > 0);
        // Rows are packed tightly (no stride padding): exactly 3 bytes per pixel.
        assert_eq!(img.data.len(), img.width as usize * img.height as usize * 3);
        // libheif applies the container's orientation transform -> displayed portrait.
        assert!(img.height > img.width);
    }

    #[test]
    fn encodes_heif_response_header_and_length() {
        let img = DecodedHeifImage { width: 2, height: 1, data: vec![10, 20, 30, 40, 50, 60] };
        let buf = encode_heif_response(&img);
        assert_eq!(buf.len(), 8 + img.data.len());
        assert_eq!(u32::from_le_bytes(buf[0..4].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(buf[4..8].try_into().unwrap()), 1);
        assert_eq!(&buf[8..], img.data.as_slice());
    }
}
