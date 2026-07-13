// Reads EXIF metadata from image files.

use std::fs::File;
use std::io::BufReader;
use std::time::UNIX_EPOCH;

use chrono::{Local, NaiveDateTime, TimeZone};
use exif::{Exif, In, Reader, Tag, Value};

use crate::common_types::MetaData;

/// Reads a summarized `MetaData` for an image.
/// On any EXIF error (or missing EXIF) it falls back to the file's creation time + orientation 1 (Up).
pub fn read_metadata_of_image(path: &str) -> MetaData {
    match read_exif(path) {
        Some(exif) => extract_meta_data_from_exif(&exif),
        None => fallback_meta_data(path),
    }
}

/// Returns whether an EXIF orientation has width and height switched between the encoded view and
/// the screen view (true for images rotated left or right).
pub fn has_exif_orientation_switched_sides(orientation: u32) -> bool {
    orientation >= 5
}

fn read_exif(path: &str) -> Option<Exif> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(&file);
    read_exif_from(&mut reader)
}

/// Reads the EXIF orientation (1-8) from in-memory image bytes, e.g. a RAW's extracted JPEG preview.
/// Returns 1 (Up) when none is present. This mirrors what a browser applies when it displays the same
/// bytes, so callers can keep stored dimensions consistent with the on-screen image.
pub fn read_orientation_of_bytes(bytes: &[u8]) -> u32 {
    let mut cursor = std::io::Cursor::new(bytes);
    read_exif_from(&mut cursor)
        .and_then(|exif| uint_field(&exif, Tag::Orientation))
        .filter(|&o| o != 0)
        .unwrap_or(1)
}

fn read_exif_from<R: std::io::BufRead + std::io::Seek>(reader: &mut R) -> Option<Exif> {
    // `continue_on_error` keeps partially-parsed EXIF (e.g. a child IFD with a non-standard "next
    // IFD" pointer) instead of failing outright, matching the leniency of the reference `exifr`.
    match Reader::new().continue_on_error(true).read_from_container(reader) {
        Ok(exif) => Some(exif),
        Err(e) => e.distill_partial_result(|_errors| {}).ok(),
    }
}

/// Fallback used when no EXIF data can be read.
fn fallback_meta_data(path: &str) -> MetaData {
    let created_at = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    MetaData {
        img_width: None,
        img_height: None,
        img_width_assumed: None,
        img_height_assumed: None,
        camera: None,
        exposure_time: None,
        iso: None,
        aperture: None,
        focal_length: None,
        created_at,
        orientation: 1,  // 1 = Up
        tags: vec![],
    }
}

fn extract_meta_data_from_exif(exif: &Exif) -> MetaData {
    // We don't trust the width/height written to EXIF the way `ExifImageWidth`/`ExifImageHeight` are,
    // since some cameras switch them during "Auto image rotation".
    // They are only kept as an assumed size and used when there is no other source.
    let (img_width_assumed, img_height_assumed) =
        match (uint_field(exif, Tag::PixelXDimension), uint_field(exif, Tag::PixelYDimension)) {
            (Some(w), Some(h)) => (Some(w), Some(h)),
            _ => (None, None),
        };

    MetaData {
        img_width: uint_field(exif, Tag::ImageWidth),
        img_height: uint_field(exif, Tag::ImageLength),
        img_width_assumed,
        img_height_assumed,
        camera: extract_camera(exif),
        exposure_time: rational_field(exif, Tag::ExposureTime),
        iso: uint_field(exif, Tag::PhotographicSensitivity),
        aperture: rational_field(exif, Tag::FNumber),
        focal_length: rational_field(exif, Tag::FocalLength),
        created_at: extract_created_at(exif),
        // Missing or invalid (0) orientation defaults to 1 (Up).
        orientation: uint_field(exif, Tag::Orientation).filter(|&o| o != 0).unwrap_or(1),
        tags: vec![],
    }
}

/// Assembles the human-readable camera name from `Make` + `Model`.
/// Examples: 'NIKON CORPORATION' + 'NIKON D3300' -> 'Nikon D3300'; 'SONY' + 'DSC-N2' -> 'SONY DSC-N2'.
fn extract_camera(exif: &Exif) -> Option<String> {
    let model = ascii_field(exif, Tag::Model)?;
    let brand = match ascii_field(exif, Tag::Make) {
        Some(b) => b,
        None => return Some(model),
    };

    let mut brand = brand.trim().to_string();
    brand = simplified_brand_name(&brand).map(|s| s.to_string()).unwrap_or(brand);

    let mut model_part = model.as_str();
    if model_part.to_lowercase().starts_with(&brand.to_lowercase()) {
        model_part = &model_part[brand.len()..];
    }
    Some(format!("{} {}", brand, model_part.trim()))
}

fn simplified_brand_name(brand: &str) -> Option<&'static str> {
    match brand {
        "CASIO COMPUTER CO.,LTD." => Some("CASIO"),
        "NIKON CORPORATION" => Some("Nikon"),
        "OLYMPUS IMAGING CORP." => Some("Olympus"),
        "RICOH IMAGING COMPANY, LTD." => Some("Ricoh"),
        _ => None,
    }
}

/// Capture date, in priority `DateTimeOriginal` > `DateTimeDigitized` (CreateDate) > `DateTime` (ModifyDate).
fn extract_created_at(exif: &Exif) -> Option<i64> {
    for tag in [Tag::DateTimeOriginal, Tag::DateTimeDigitized, Tag::DateTime] {
        if let Some(millis) = ascii_field(exif, tag).and_then(|s| parse_exif_datetime(&s)) {
            return Some(millis);
        }
    }
    None
}

/// EXIF datetimes are "YYYY:MM:DD HH:MM:SS" without a timezone. We interpret them as local time and
/// return the epoch in milliseconds. This stays consistent with `date_section`, which is also formatted in
/// local time (see `import_scanner::millis_to_date_section`).
fn parse_exif_datetime(s: &str) -> Option<i64> {
    let naive = NaiveDateTime::parse_from_str(s.trim(), "%Y:%m:%d %H:%M:%S").ok()?;
    Local
        .from_local_datetime(&naive)
        .single()
        .or_else(|| Local.from_local_datetime(&naive).earliest())
        .map(|dt| dt.timestamp_millis())
}

fn uint_field(exif: &Exif, tag: Tag) -> Option<u32> {
    exif.get_field(tag, In::PRIMARY).and_then(|f| f.value.get_uint(0))
}

fn rational_field(exif: &Exif, tag: Tag) -> Option<f64> {
    match exif.get_field(tag, In::PRIMARY).map(|f| &f.value) {
        Some(Value::Rational(v)) if !v.is_empty() => Some(v[0].to_f64()),
        _ => None,
    }
}

fn ascii_field(exif: &Exif, tag: Tag) -> Option<String> {
    match exif.get_field(tag, In::PRIMARY).map(|f| &f.value) {
        Some(Value::Ascii(v)) if !v.is_empty() => std::str::from_utf8(&v[0]).ok().map(str::to_string),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PHOTOS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../submodules/test-data/photos");

    /// Formats a capture-date epoch back into its local wall-clock string. EXIF dates are naive
    /// (no timezone) and parsed as local time, so this round-trips regardless of the machine's
    /// timezone — unlike a fixed UTC epoch, which would differ per machine.
    fn wall_clock(created_at: Option<i64>) -> String {
        chrono::Local
            .timestamp_millis_opt(created_at.unwrap())
            .single()
            .unwrap()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string()
    }

    fn approx(a: Option<f64>, b: f64) {
        assert!(a.map(|v| (v - b).abs() < 1e-9).unwrap_or(false), "expected ~{}, got {:?}", b, a);
    }

    fn read(rel: &str) -> MetaData {
        read_metadata_of_image(&format!("{}/{}", PHOTOS, rel))
    }

    #[test]
    fn reads_camera_metadata_and_capture_date() {
        let md = read("800/architecture.jpg");
        assert_eq!(md.camera.as_deref(), Some("Nikon D3300"));
        assert_eq!(wall_clock(md.created_at), "2017-03-25 10:22:15");
        assert_eq!(md.orientation, 1);
        assert_eq!(md.iso, Some(100));
        approx(md.aperture, 5.6);
        approx(md.exposure_time, 0.003125);
        approx(md.focal_length, 40.0);
        // EXIF IFD0 dimensions are absent in these JPEGs -> only the assumed size (if any) is set.
        assert_eq!(md.img_width, None);
        assert_eq!(md.img_height, None);
    }

    #[test]
    fn simplifies_brand_names() {
        assert_eq!(read("800/ice-cubes.jpg").camera.as_deref(), Some("FUJIFILM X-T2"));
        assert_eq!(read("800/light-bulb.jpg").camera.as_deref(), Some("SONY ILCE-7"));
        assert_eq!(read("800/railway-tracks.jpg").camera.as_deref(), Some("Olympus E-M10"));
        assert_eq!(read("800/tomatoes.jpg").camera.as_deref(), Some("Canon EOS 450D"));
        assert_eq!(read("800/water.jpg").camera.as_deref(), Some("Nikon D750"));
        assert_eq!(read("portrait.jpg").camera.as_deref(), Some("SONY DSLR-A850"));
    }

    #[test]
    fn reads_iso_and_exposure_edge_values() {
        assert_eq!(read("800/water.jpg").iso, Some(64));
        approx(read("800/light-bulb.jpg").exposure_time, 1.0);
        approx(read("800/rustic.jpg").exposure_time, 3.2);
    }

    #[test]
    fn reads_assumed_size_when_present() {
        let md = read("jpg/NIKON_D90_portrait.jpg");
        assert_eq!(md.camera.as_deref(), Some("Nikon D90"));
        assert_eq!(md.orientation, 1);
        assert_eq!(md.img_width_assumed, Some(4288));
        assert_eq!(md.img_height_assumed, Some(2848));

        let panorama = read("panorama.jpg");
        assert_eq!(panorama.camera, None);
        assert_eq!(panorama.img_width_assumed, Some(1024));
        assert_eq!(panorama.img_height_assumed, Some(225));
    }

    #[test]
    fn reads_full_orientation_range() {
        const ORIENT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../submodules/test-data-exif-orientation");
        // Orientations 1..=8 must round-trip for both landscape and portrait sources.
        for tag in 1..=8u32 {
            for kind in ["Landscape", "Portrait"] {
                let md = read_metadata_of_image(&format!("{}/{}_{}.jpg", ORIENT, kind, tag));
                assert_eq!(md.orientation, tag, "{}_{}.jpg", kind, tag);
            }
        }
        // Orientation 0 is invalid and must default to 1 (mirrors `Orientation || 1`).
        assert_eq!(read_metadata_of_image(&format!("{}/Landscape_0.jpg", ORIENT)).orientation, 1);
    }

    #[test]
    fn reads_rotated_orientation() {
        let md = read("jpg/Panasonic_DMC-G6_portrait.jpg");
        assert_eq!(md.orientation, 8);
        assert!(has_exif_orientation_switched_sides(md.orientation));
        assert!(!has_exif_orientation_switched_sides(1));
        assert!(has_exif_orientation_switched_sides(6));
    }
}
