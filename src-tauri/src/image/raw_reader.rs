// RAW embedded-preview reader.
//
// Picturama is an organizer, not a RAW developer: instead of demosaicing the sensor mosaic, it uses the
// camera-developed JPEG preview that every RAW file embeds. Extracting it is a cheap byte-slice (no
// decode) — the browser then decodes the JPEG like any other, and the same preview backs display, the
// thumbnail render and export.
//
// Two container families cover Picturama's `ACCEPTED_RAW = {raf, cr2, arw, dng}`:
//   - RAF (Fujifilm): a proprietary container with an explicit JPEG pointer in its header.
//   - TIFF-based (cr2/arw/dng): the preview is a JPEG referenced from an IFD/SubIFD.
//
// We pick the *largest* embedded JPEG so no resolution is lost versus the reference (libraw's
// `extractThumb`). This is deliberately dependency-free: the task is locating a JPEG blob in a
// container, which does not warrant a native RAW library (libraw) or a heavy RAW decoder (rawler).

/// Reads `path` and returns the bytes of the largest embedded JPEG preview.
pub fn extract_embedded_jpeg(path: &str) -> Result<Vec<u8>, String> {
    let buf = std::fs::read(path).map_err(|e| format!("Could not read {}: {}", path, e))?;
    let (offset, len) = locate_preview(&buf)
        .ok_or_else(|| format!("No embedded JPEG preview found in {}", path))?;
    Ok(buf[offset..offset + len].to_vec())
}

/// Locates `(offset, length)` of the largest embedded JPEG preview, dispatching by container magic.
fn locate_preview(buf: &[u8]) -> Option<(usize, usize)> {
    if let Some(range) = raf_preview(buf) {
        return Some(range);
    }
    tiff_preview(buf)
}

/// Reads a big-endian `u32` at offset `i`. Used for the RAF header, which is always big-endian.
/// Panics if fewer than 4 bytes remain at `i`; callers must bounds-check first.
fn be32(b: &[u8], i: usize) -> u32 {
    u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// Returns true if the slice looks like a JPEG. `0xFF 0xD8` is the SOI (start-of-image) marker and the
/// following `0xFF` begins the first segment marker.
fn is_jpeg(b: &[u8]) -> bool {
    b.len() >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF
}

/// Returns the pixel area (width * height) of a JPEG, but only when it is browser-displayable: a baseline
/// (SOF0), extended-sequential (SOF1) or progressive (SOF2) Huffman JPEG. Returns `None` for any other
/// frame type — crucially lossless JPEG (SOF3), which is how a CR2 stores its raw sensor data: that blob
/// also begins with `FF D8 FF` and is the *largest* JPEG in the file, but it is a Bayer mosaic that
/// renders black in a browser. Filtering by frame type keeps us on the camera-developed preview.
fn jpeg_display_area(b: &[u8]) -> Option<u64> {
    // Must start with the SOI (start-of-image) marker (0xFFD8).
    if b.len() < 2 || b[0] != 0xFF || b[1] != 0xD8 {
        return None;
    }
    // Walk the segment markers. `+ 9` ensures a full SOF header fits:
    // [0xFF, marker, len(2 bytes), precision(1), height(2), width(2)] — width ends at offset i+8.
    let mut i = 2;
    while i + 9 < b.len() {
        if b[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = b[i + 1];
        // Start-of-frame markers (0xC0..=0xCF) carry the geometry, except the three non-SOF markers in
        // that range: DHT 0xC4, JPG 0xC8, DAC 0xCC.
        if (0xC0..=0xCF).contains(&marker) && marker != 0xC4 && marker != 0xC8 && marker != 0xCC {
            // SOF0 (0xC0) baseline, SOF1 (0xC1) extended-sequential, SOF2 (0xC2) progressive are the
            // browser-displayable frame types; anything else (e.g. lossless SOF3 0xC3) is not.
            if marker != 0xC0 && marker != 0xC1 && marker != 0xC2 {
                return None;
            }
            // SOF payload after the 2-byte length: precision(1), height(2 @ i+5), width(2 @ i+7).
            let height = u16::from_be_bytes([b[i + 5], b[i + 6]]) as u64;
            let width = u16::from_be_bytes([b[i + 7], b[i + 8]]) as u64;
            return Some(width * height);
        }
        // Every marker before the SOF carries a 2-byte length (which includes those 2 bytes); skip the
        // whole segment.
        let len = u16::from_be_bytes([b[i + 2], b[i + 3]]) as usize;
        if len < 2 {
            return None;
        }
        i += 2 + len;
    }
    None
}

// --- RAF (Fujifilm) --------------------------------------------------------

/// Fujifilm RAF: the header carries the embedded JPEG's offset (big-endian u32 @ 84) and length (@ 88).
fn raf_preview(buf: &[u8]) -> Option<(usize, usize)> {
    // The file starts with the 8-byte "FUJIFILM" magic. We read up to byte 91 below (length @ 88..92),
    // so require at least 92 bytes.
    if buf.len() < 92 || &buf[0..8] != b"FUJIFILM" {
        return None;
    }
    let offset = be32(buf, 84) as usize;
    let len = be32(buf, 88) as usize;
    if len > 0 && offset.checked_add(len).map_or(false, |end| end <= buf.len()) && is_jpeg(&buf[offset..]) {
        Some((offset, len))
    } else {
        None
    }
}

// --- TIFF-based (cr2/arw/dng) ----------------------------------------------

struct Tiff<'a> {
    b: &'a [u8],
    le: bool,
}

impl<'a> Tiff<'a> {
    fn u16(&self, i: usize) -> u32 {
        let v = [self.b[i], self.b[i + 1]];
        (if self.le { u16::from_le_bytes(v) } else { u16::from_be_bytes(v) }) as u32
    }

    fn u32(&self, i: usize) -> u32 {
        let v = [self.b[i], self.b[i + 1], self.b[i + 2], self.b[i + 3]];
        if self.le { u32::from_le_bytes(v) } else { u32::from_be_bytes(v) }
    }
}

/// Walks a TIFF's IFDs (and SubIFDs), collects every referenced JPEG blob and returns the largest
/// *displayable* one. CR2/ARW/DNG store their preview either via `JPEGInterchangeFormat`/`Length`
/// (0x0201/0x0202) or as a JPEG-compressed strip (`Compression` 0x0103 == 6 old-style or 7 modern, with
/// `StripOffsets`/`StripByteCounts`). Raw-sensor IFDs (photometric CFA / LinearRaw) and non-displayable
/// frame types (e.g. lossless JPEG) are excluded so the raw data is never mistaken for a preview.
fn tiff_preview(buf: &[u8]) -> Option<(usize, usize)> {
    // The TIFF header is 8 bytes: byte order (2) + magic (2) + first-IFD offset (4).
    if buf.len() < 8 {
        return None;
    }
    // Byte order: "II" = little-endian (Intel), "MM" = big-endian (Motorola).
    let le = match &buf[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let t = Tiff { b: buf, le };
    // Bytes 2..4 hold the TIFF magic number 42; bytes 4..8 hold the offset of the first IFD.
    if t.u16(2) != 42 {
        return None;
    }

    let mut candidates: Vec<(usize, usize)> = Vec::new();
    let mut ifds: Vec<usize> = vec![t.u32(4) as usize];
    let mut seen = std::collections::HashSet::new();

    while let Some(ifd) = ifds.pop() {
        // Guard against malformed/looping offsets: skip out-of-range or already-visited IFDs.
        if ifd == 0 || ifd + 2 > buf.len() || !seen.insert(ifd) {
            continue;
        }
        // An IFD is a 2-byte entry count followed by `n` 12-byte entries. Each entry is
        // [tag(2), type(2), count(4), value-or-offset(4)]; the value field starts at p+8.
        let n = t.u16(ifd) as usize;
        let mut jpeg_off = None;
        let mut jpeg_len = None;
        let mut strip_off = None;
        let mut strip_len = None;
        let mut compression = None;
        let mut photometric = None;

        for e in 0..n {
            let p = ifd + 2 + e * 12;
            if p + 12 > buf.len() {
                break;
            }
            let tag = t.u16(p);
            let val = t.u32(p + 8);
            // TIFF/EXIF tag ids (hex):
            match tag {
                0x0103 => compression = Some(t.u16(p + 8)),  // Compression
                0x0106 => photometric = Some(t.u16(p + 8)),  // PhotometricInterpretation
                0x0111 => strip_off = Some(val),             // StripOffsets
                0x0117 => strip_len = Some(val),             // StripByteCounts
                0x0201 => jpeg_off = Some(val),              // JPEGInterchangeFormat (offset)
                0x0202 => jpeg_len = Some(val),              // JPEGInterchangeFormatLength
                0x014A => {                                  // SubIFDs
                    // SubIFDs: a count (@ p+4) of IFD offsets, stored inline (count 1) or at `val`.
                    let cnt = t.u32(p + 4) as usize;
                    if cnt == 1 {
                        ifds.push(val as usize);
                    } else {
                        for k in 0..cnt {
                            let ap = val as usize + k * 4;
                            if ap + 4 <= buf.len() {
                                ifds.push(t.u32(ap) as usize);
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Skip IFDs holding raw sensor data (photometric 32803 = CFA / Bayer, 34892 = LinearRaw). Those
        // are stored as JPEG too (a DNG's raw is a `Compression` 7 JPEG), but they are not displayable
        // previews. The SOF filter below already rejects lossless raw (SOF3); this also rejects *lossy*
        // DNG raw, which would be a baseline JPEG.
        let is_raw_ifd = matches!(photometric, Some(32803) | Some(34892));
        if !is_raw_ifd {
            if let (Some(o), Some(l)) = (jpeg_off, jpeg_len) {
                candidates.push((o as usize, l as usize));
            }
            // JPEG-compressed strip: `Compression` 6 (old-style JPEG) or 7 (modern JPEG, used by DNG and
            // newer previews). Single-strip previews are the norm, so `strip_off`/`strip_len` hold the
            // value directly; a multi-strip value would be an out-of-place offset and simply fail the
            // JPEG validation below, so it is safely ignored.
            if compression == Some(6) || compression == Some(7) {
                if let (Some(o), Some(l)) = (strip_off, strip_len) {
                    candidates.push((o as usize, l as usize));
                }
            }
        }

        // Right after the entries a 4-byte offset points to the next IFD in the chain (0 = end).
        let next_p = ifd + 2 + n * 12;
        if next_p + 4 <= buf.len() {
            ifds.push(t.u32(next_p) as usize);
        }
    }

    candidates
        .into_iter()
        .filter_map(|(o, l)| {
            let end = o.checked_add(l)?;
            if l == 0 || end > buf.len() {
                return None;
            }
            // Rank by pixel area, but only among browser-displayable JPEGs — this drops the raw sensor
            // data (lossless SOF3), which is the largest JPEG blob but would render black.
            jpeg_display_area(&buf[o..end]).map(|area| (o, l, area))
        })
        .max_by_key(|&(_, _, area)| area)
        .map(|(o, l, _)| (o, l))
}

#[cfg(test)]
mod tests {
    use super::*;

    const RAW: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../submodules/test-data/photos/raw");

    fn extract(name: &str) -> Vec<u8> {
        extract_embedded_jpeg(&format!("{}/{}", RAW, name)).unwrap()
    }

    fn assert_valid_jpeg_of_size(jpg: &[u8], w: usize, h: usize) {
        assert!(is_jpeg(jpg), "not a JPEG (bad SOI)");
        assert_eq!(&jpg[jpg.len() - 2..], &[0xFF, 0xD9], "JPEG not terminated by EOI");
        // The preview must be a browser-displayable JPEG (baseline/progressive), not e.g. lossless.
        assert_eq!(jpeg_display_area(jpg), Some((w * h) as u64), "not a displayable JPEG of the expected size");
        let size = imagesize::blob_size(jpg).expect("could not size embedded JPEG");
        assert_eq!((size.width, size.height), (w, h));
    }

    #[test]
    fn extracts_displayable_cr2_preview_not_raw_data() {
        // The 5D CR2 embeds a 160x120 thumbnail, a 2496x1664 developed preview, and its raw sensor data
        // as a *larger* lossless JPEG (~10 MB). We must pick the largest displayable preview (2496x1664),
        // never the lossless raw blob (which begins with FF D8 FF too but renders black in a browser).
        assert_valid_jpeg_of_size(&extract("raw_Canon_5D_ARGB.cr2"), 2496, 1664);
    }

    #[test]
    fn extracts_raf_previews() {
        assert_valid_jpeg_of_size(&extract("raw_Fujifilm_X100T.raf"), 1920, 1280);
        assert_valid_jpeg_of_size(&extract("raw_Fujifilm_X100S.raf"), 1920, 1280);
        assert_valid_jpeg_of_size(&extract("raw_Fuji_FinePix_X100.raf"), 2176, 1448);
    }

    #[test]
    fn extracts_arw_preview() {
        // Sony ARW (little-endian TIFF): the preview is a `JPEGInterchangeFormat` blob. The DSLR-A100
        // (2006) only embeds a 640x480 preview; newer bodies embed Sony's standard 1616x1080 preview.
        assert_valid_jpeg_of_size(&extract("raw_Sony_DSLR-A100.arw"), 640, 480);
        assert_valid_jpeg_of_size(&extract("raw_Sony_ILCE-7M3.arw"), 1616, 1080);
    }

    #[test]
    fn extracts_dng_preview_not_raw_data() {
        // Ricoh GR DNG (big-endian TIFF) embeds a 160x120 thumbnail, its 4960x3280 raw CFA data (as a
        // lossless `Compression`-7 JPEG) and a 640x424 baseline preview. We must yield the 640x424
        // preview: the raw CFA is excluded both by photometric interpretation and by frame type.
        assert_valid_jpeg_of_size(&extract("raw_Ricoh_GR.dng"), 640, 424);
        // Apple ProRAW DNG (big-endian) stores a full-size 4032x3024 preview as a `Compression`-7 YCbCr
        // JPEG strip — exercising the modern-JPEG-strip path at full resolution.
        assert_valid_jpeg_of_size(&extract("raw_Apple_iPhone_12_Pro.dng"), 4032, 3024);
    }

    #[test]
    fn fails_on_non_raw_bytes() {
        assert!(locate_preview(b"not a raw file at all").is_none());
    }
}
