// Picasa (`.picasa.ini` / `Picasa.ini`) import.
//
// Reads Picasa's per-photo edit rules and converts them into a `PhotoWork` (star flag, 90° rotation, free-angle tilt
// and crop rect).
//
// For the details of the Picasa.ini format (tilt factor, rect64) see `doc/picasa-ini-format.md`.

use std::collections::HashMap;
use std::f64::consts::PI;
use std::path::Path;

use crate::types::common_types::PhotoWork;
use crate::types::geometry_types::Rect;

/// Empirically-derived factor translating Picasa's tilt value (`-1`..`1`) into degrees.
/// See `doc/picasa-ini-format.md`.
const TILT_FACTOR_TO_DEGREES: f64 = -11.3848;

/// The raw Picasa rule lines of a directory, keyed by photo basename (one `[section]` per photo).
pub struct PicasaData {
    pub photos: HashMap<String, Vec<String>>,
}

// ---------------------------------------------------------------------------
// Reading `.picasa.ini`
// ---------------------------------------------------------------------------

/// Reads `<dir>/.picasa.ini` (fallback `<dir>/Picasa.ini`) into raw per-photo rules. Returns `None` if
/// neither exists.
///
/// If `dir` is a Picasa "originals" directory (`.picasaoriginals` / `Originals`), the parent directory's
/// `.picasa.ini` holds the edited versions of these originals; its matching section rules are appended to
/// each section here.
pub fn read_picasa_ini(dir: &Path) -> Option<PicasaData> {
    let picasa_file = {
        let dotted = dir.join(".picasa.ini");
        if dotted.exists() {
            dotted
        } else {
            let capitalized = dir.join("Picasa.ini");
            if capitalized.exists() {
                capitalized
            } else {
                return None;
            }
        }
    };

    let edited_picasa_data = match dir.file_name().and_then(|n| n.to_str()) {
        Some(".picasaoriginals") | Some("Originals") => dir.parent().and_then(read_picasa_ini),
        _ => None,
    };

    let bytes = std::fs::read(&picasa_file).ok()?;
    let contents = String::from_utf8_lossy(&bytes);

    let mut photos: HashMap<String, Vec<String>> = HashMap::new();
    let mut current_key: Option<String> = None;
    let mut current_rules: Vec<String> = Vec::new();

    for line in contents.lines() {
        if let Some(key) = parse_section_start(line) {
            flush_section(&mut photos, &mut current_key, &mut current_rules, edited_picasa_data.as_ref());
            current_key = Some(key.to_string());
        } else {
            current_rules.push(line.to_string());
        }
    }
    flush_section(&mut photos, &mut current_key, &mut current_rules, edited_picasa_data.as_ref());

    log::debug!("Fetched {:?}", picasa_file);
    Some(PicasaData { photos })
}

/// Matches the reference `sectionStartRegExp` (`/^\[(.*)\]$/`), returning the section name.
fn parse_section_start(line: &str) -> Option<&str> {
    if line.len() >= 2 && line.starts_with('[') && line.ends_with(']') {
        Some(&line[1..line.len() - 1])
    } else {
        None
    }
}

fn flush_section(photos: &mut HashMap<String, Vec<String>>, current_key: &mut Option<String>,
    current_rules: &mut Vec<String>, edited: Option<&PicasaData>)
{
    if let Some(key) = current_key.take() {
        let mut rules = std::mem::take(current_rules);
        if let Some(edited_rules) = edited.and_then(|d| d.photos.get(&key)) {
            rules.extend(edited_rules.iter().cloned());
        }
        photos.insert(key, rules);
    }
    current_rules.clear();
}

// ---------------------------------------------------------------------------
// Converting rules to PhotoWork
// ---------------------------------------------------------------------------

/// Converts the Picasa rules of one photo into a `PhotoWork`.
/// `master_width` / `master_height` are needed to resolve the relative crop rect into texture pixels.
pub fn create_photo_work_from_picasa_rules(rules: &[String], dir: &Path, basename: &str,
    master_width: u32, master_height: u32) -> PhotoWork
{
    let mut photo_work = PhotoWork::default();
    let mut import_problems: Vec<String> = Vec::new();
    let mut picasa_crop_rect: Option<String> = None;

    for rule in rules {
        if let Some(turns) = parse_rotate_rule(rule) {
            apply_rotate(&mut photo_work, turns);
        } else if rule == "star=yes" {
            photo_work.flagged = Some(true);
        } else if let Some(filters) = rule.strip_prefix("filters=") {
            for filter in filters.split(';') {
                if let Some(picasa_tilt) = parse_tilt_filter(filter) {
                    // For the formula see: doc/picasa-ini-format.md
                    photo_work.tilt = Some(photo_work.tilt.unwrap_or(0.0) + picasa_tilt * TILT_FACTOR_TO_DEGREES);
                } else if let Some(hex) = parse_crop64_filter(filter) {
                    set_crop_rect(&mut picasa_crop_rect, hex, &mut import_problems);
                } else if !filter.is_empty() {
                    import_problems.push(format!("Unknown filter: {}", filter));
                }
            }
        } else if let Some(hex) = parse_crop_rule(rule) {
            set_crop_rect(&mut picasa_crop_rect, hex, &mut import_problems);
        } else if !is_ignored_rule(rule) {
            import_problems.push(format!("Unknown rule: {}", rule));
        }
    }

    if picasa_crop_rect.is_some() || photo_work.tilt.is_some() {
        // Picasa works in the opposite order to us: it first crops the original image, then tilts it and
        // shrinks it to fit into the borders of the cropped image while keeping the aspect ratio.
        // For details see: doc/picasa-ini-format.md

        if let Some(tilt) = photo_work.tilt {
            photo_work.tilt = Some(round1(tilt));
        }

        let picasa_canvas_rect = picasa_canvas_rect(&picasa_crop_rect, master_width, master_height,
            &mut import_problems);

        let rotation_turns = photo_work.rotation_turns.unwrap_or(0);
        let project = make_projection(master_width, master_height, photo_work.tilt, rotation_turns);

        let corners = corner_points(&picasa_canvas_rect);
        let border_polygon = [
            project(corners[0]), // nw
            project(corners[1]), // ne
            project(corners[2]), // se
            project(corners[3]), // sw
        ];
        let projected_center = project(center_of_rect(&picasa_canvas_rect));
        let (size_width, size_height) = if rotation_turns == 1 || rotation_turns == 3 {
            (picasa_canvas_rect.height, picasa_canvas_rect.width)
        } else {
            (picasa_canvas_rect.width, picasa_canvas_rect.height)
        };
        photo_work.crop_rect =
            Some(scale_rect_to_fit_borders(projected_center, size_width, size_height, &border_polygon));
    }

    if !import_problems.is_empty() {
        let mut msg = format!("Picasa import is incomplete for {}/{}:", dir.display(), basename);
        for problem in &import_problems {
            msg.push_str(&format!("\n  - {}", problem));
        }
        log::warn!("{}", msg);
    }

    photo_work
}

/// Sets `picasa_crop_rect` unless already set to a different value (which is an import problem).
fn set_crop_rect(picasa_crop_rect: &mut Option<String>, hex: String, import_problems: &mut Vec<String>) {
    match picasa_crop_rect {
        None => *picasa_crop_rect = Some(hex),
        Some(existing) if *existing != hex => {
            import_problems.push(format!("Duplicate crop rects: {} and {}", existing, hex));
        }
        Some(_) => {}
    }
}

/// Resolves the Picasa `rect64` hex into a canvas rect in texture pixels, falling back to the full master
/// rect when absent or invalid.
fn picasa_canvas_rect(picasa_crop_rect: &Option<String>, master_width: u32, master_height: u32,
    import_problems: &mut Vec<String>) -> Rect
{
    if let Some(hex) = picasa_crop_rect {
        if hex.len() > 16 {
            import_problems.push(format!("Invalid crop rect (length > 16): {}", hex));
        } else {
            let padded = format!("{:0>16}", hex);
            let mw = master_width as f64;
            let mh = master_height as f64;
            let coord = |slice: &str, dim: f64| {
                u32::from_str_radix(slice, 16).unwrap_or(0) as f64 / 0xffff as f64 * dim
            };
            return rect_from_points(
                (coord(&padded[0..4], mw), coord(&padded[4..8], mh)),
                (coord(&padded[8..12], mw), coord(&padded[12..16], mh)),
            );
        }
    }
    Rect { x: 0.0, y: 0.0, width: master_width as f64, height: master_height as f64 }
}

fn apply_rotate(photo_work: &mut PhotoWork, turns: i64) {
    let prev = photo_work.rotation_turns.unwrap_or(0) as i64;
    let new_turns = (prev + turns).rem_euclid(4);
    photo_work.rotation_turns = if new_turns == 0 { None } else { Some(new_turns as u8) };
}

// ---------------------------------------------------------------------------
// Rule parsing
// ---------------------------------------------------------------------------

fn parse_rotate_rule(rule: &str) -> Option<i64> {
    let inner = rule.strip_prefix("rotate=rotate(")?.strip_suffix(')')?;
    if inner.is_empty() || !inner.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    inner.parse::<i64>().ok()
}

/// Captures the middle tilt factor.
fn parse_tilt_filter(filter: &str) -> Option<f64> {
    let rest = filter.strip_prefix("tilt=1,")?;
    let comma = rest.find(',')?;
    let (middle, third) = (&rest[..comma], &rest[comma + 1..]);
    let middle_ok = !middle.is_empty()
        && middle.chars().all(|c| c == '-' || c == '.' || c.is_ascii_digit());
    // `0.0*`: a `0`, any single char, then zero or more `0`s.
    let third_ok = third.len() >= 2 && third.starts_with('0') && third[2..].bytes().all(|b| b == b'0');
    if middle_ok && third_ok {
        middle.parse::<f64>().ok()
    } else {
        None
    }
}

fn parse_crop64_filter(filter: &str) -> Option<String> {
    let hex = filter.strip_prefix("crop64=1,")?;
    if is_lower_hex(hex) { Some(hex.to_string()) } else { None }
}

fn parse_crop_rule(rule: &str) -> Option<String> {
    let hex = rule.strip_prefix("crop=rect64(")?.strip_suffix(')')?;
    if is_lower_hex(hex) { Some(hex.to_string()) } else { None }
}

fn is_lower_hex(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_ignored_rule(rule: &str) -> bool {
    rule.trim().is_empty()
        || rule.starts_with("backuphash=")
        || rule.starts_with("width=")
        || rule.starts_with("height=")
        || rule.starts_with("moddate=")
        || rule.starts_with("textactive=0")
        || rule.starts_with("redo=")
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

type Point = (f64, f64);

/// Returns the collapsed `createProjectionMatrix` transform: it centers a texture point on the origin and
/// rotates it by `tilt` plus the 90° turns.
fn make_projection(master_width: u32, master_height: u32, tilt: Option<f64>, rotation_turns: u8)
    -> impl Fn(Point) -> Point
{
    let angle = tilt.unwrap_or(0.0) * PI / 180.0 + rotation_turns as f64 * PI / 2.0;
    let (sin, cos) = angle.sin_cos();
    let offset_x = (-(master_width as f64) / 2.0).round();
    let offset_y = (-(master_height as f64) / 2.0).round();
    move |(x, y)| {
        let tx = x + offset_x;
        let ty = y + offset_y;
        (tx * cos - ty * sin, tx * sin + ty * cos)
    }
}

fn rect_from_points(p1: Point, p2: Point) -> Rect {
    Rect {
        x: p1.0.min(p2.0),
        y: p1.1.min(p2.1),
        width: (p1.0 - p2.0).abs(),
        height: (p1.1 - p2.1).abs(),
    }
}

fn rect_from_center_and_size(center: Point, width: f64, height: f64) -> Rect {
    let w = width.abs();
    let h = height.abs();
    Rect { x: center.0 - w / 2.0, y: center.1 - h / 2.0, width: w, height: h }
}

fn center_of_rect(rect: &Rect) -> Point {
    (rect.x + rect.width / 2.0, rect.y + rect.height / 2.0)
}

/// Corner points order: nw, ne, se, sw.
fn corner_points(rect: &Rect) -> [Point; 4] {
    [
        (rect.x, rect.y),
        (rect.x + rect.width, rect.y),
        (rect.x + rect.width, rect.y + rect.height),
        (rect.x, rect.y + rect.height),
    ]
}

fn round_rect(rect: Rect) -> Rect {
    Rect {
        x: rect.x.round(),
        y: rect.y.round(),
        width: rect.width.round(),
        height: rect.height.round(),
    }
}

/// Intersects two lines given as start + direction, returning `(factorOnLine1, factorOnLine2)`.
/// Returns `NaN`s for parallel lines (matches the reference, whose `NaN` comparisons then fail).
fn intersect_lines(start1: Point, dir1: Point, start2: Point, dir2: Point) -> (f64, f64) {
    let f = dir2.0 * dir1.1 - dir1.0 * dir2.1;
    if f == 0.0 {
        (f64::NAN, f64::NAN)
    } else {
        let vx3 = start2.0 - start1.0;
        let vy3 = start2.1 - start1.1;
        ((dir2.0 * vy3 - vx3 * dir2.1) / f, (dir1.0 * vy3 - vx3 * dir1.1) / f)
    }
}

fn intersect_line_with_polygon(line_start: Point, line_dir: Point, polygon: &[Point]) -> Vec<f64> {
    let mut result = Vec::new();
    let n = polygon.len();
    let mut j = n - 1;
    for i in 0..n {
        let segment_start = polygon[i];
        let segment_end = polygon[j];
        let segment_dir = (segment_end.0 - segment_start.0, segment_end.1 - segment_start.1);
        let (f0, f1) = intersect_lines(segment_start, segment_dir, line_start, line_dir);
        if f0 >= 0.0 && f0 <= 1.0 {
            result.push(f1);
        }
        j = i;
    }
    result.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    result
}

/// Scales a rect (given by its center and max size) to fit into a rotated version of itself.
fn scale_rect_to_fit_borders(center: Point, width: f64, height: f64, polygon: &[Point]) -> Rect {
    let out1 = intersect_line_with_polygon(center, (width / 2.0, height / 2.0), polygon);
    let mut min_factor = out1.iter().fold(1.0_f64, |min, &f| min.min(f.abs()));
    let out2 = intersect_line_with_polygon(center, (width / 2.0, -height / 2.0), polygon);
    min_factor = out2.iter().fold(min_factor, |min, &f| min.min(f.abs()));
    round_rect(rect_from_center_and_size(center, width * min_factor, height * min_factor))
}

/// JS `round(value, 1)` (`parseFloat(value.toFixed(1))`).
fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::photo_work_store::fetch_photo_work;

    // The images in `submodules/test-data/photos/picasa-import/crop-and-tilt` were cropped and tilted in
    // Picasa (with different 90° rotations) so the crop covers the full canvas.
    #[test]
    fn fetch_photo_work_with_picasa_crop_and_tilt() {
        let photo_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../submodules/test-data/photos/picasa-import/crop-and-tilt");

        let fetch = |name: &str| fetch_photo_work(&photo_dir, name, 1000, 800).unwrap();

        expect_crop_and_tilt(fetch("crop_1.jpg"), (-456.0, -278.0, 808.0, 388.0), None, None);
        expect_crop_and_tilt(fetch("crop_2.jpg"), (-84.0, -281.0, 289.0, 181.0), Some(1), None);
        expect_crop_and_tilt(fetch("crop_3.jpg"), (-321.0, -359.0, 576.0, 408.0), Some(2), None);
        expect_crop_and_tilt(fetch("crop_4.jpg"), (-217.0, -351.0, 544.0, 120.0), Some(3), None);

        expect_crop_and_tilt(fetch("crop-and-tilt_1.jpg"), (-324.0, -265.0, 223.0, 111.0), None, Some(7.6));
        expect_crop_and_tilt(fetch("crop-and-tilt_2.jpg"), (-213.0, 96.0, 183.0, 118.0), Some(1), Some(-7.4));
        expect_crop_and_tilt(fetch("crop-and-tilt_3.jpg"), (-332.0, -89.0, 327.0, 253.0), None, Some(1.9));
        expect_crop_and_tilt(fetch("crop-and-tilt_4.jpg"), (-319.0, 29.0, 197.0, 169.0), None, Some(0.8));
        expect_crop_and_tilt(fetch("crop-and-tilt_5.jpg"), (-255.0, -169.0, 475.0, 365.0), Some(2), Some(11.5));
        expect_crop_and_tilt(fetch("crop-and-tilt_6.jpg"), (-107.0, 15.0, 149.0, 318.0), Some(3), Some(-8.0));
    }

    /// Same tolerances as the reference `expectCropAndTilt`: tilt within ±1, each cropRect field within ±5,
    /// rotationTurns exact.
    fn expect_crop_and_tilt(actual: PhotoWork, expected_crop: (f64, f64, f64, f64),
        expected_turns: Option<u8>, expected_tilt: Option<f64>)
    {
        assert_eq!(actual.rotation_turns, expected_turns, "rotationTurns");
        assert_eq!(actual.flagged, None, "flagged");

        if let Some(expected) = expected_tilt {
            let actual_tilt = actual.tilt.expect("expected a tilt");
            assert!((expected - actual_tilt).abs() <= 1.0, "tilt {} not close to {}", actual_tilt, expected);
        }

        let crop = actual.crop_rect.expect("expected a cropRect");
        let diff = (expected_crop.0 - crop.x).abs()
            .max((expected_crop.1 - crop.y).abs())
            .max((expected_crop.2 - crop.width).abs())
            .max((expected_crop.3 - crop.height).abs());
        assert!(diff <= 5.0,
            "cropRect ({}, {}, {}, {}) not close to ({}, {}, {}, {})",
            crop.x, crop.y, crop.width, crop.height,
            expected_crop.0, expected_crop.1, expected_crop.2, expected_crop.3);
    }
}
