// Directory scanner + photo importer.
//
// Walks the configured photo directories, imports new photos into the SQLite DB, removes rows for files/dirs that no
// longer exist, and streams progress to the UI via `foreground_client::set_import_progress`.
//
// State machine: idle -> scanDirs -> cleanup -> importPhotos -> idle.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::common_types::{ImportPhase, ImportProgress, PhotoId};
use crate::foreground_client;
use crate::store::db::DbHandle;
use crate::store::{photo_store, photo_work_store};
use crate::store::photo_store::NewPhoto;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ACCEPTED_NON_RAW: &[&str] = &["png", "jpg", "jpeg", "tif", "tiff", "webp"];
const ACCEPTED_HEIC: &[&str] = &["heic", "heif"];
const ACCEPTED_RAW: &[&str] = &["raf", "cr2", "arw", "dng"];

/// Number of photos accumulated before a batch is written in one transaction (one fsync per batch
/// instead of one per photo). Deliberately independent of directory size.
const BATCH_SIZE: usize = 500;

/// Minimum interval between progress updates pushed to the UI.
const UI_UPDATE_INTERVAL_MS: u64 = 200;

// ---------------------------------------------------------------------------
// Managed control state (registered in main.rs)
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct ImportState {
    pub is_running: AtomicBool,
    pub should_cancel: AtomicBool,
    pub is_paused: AtomicBool,
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

struct DirectoryInfo {
    path: String,
    photo_filenames: Vec<String>,
    picasa_original_subdirs: Option<Vec<PicasaOriginalDirectoryInfo>>,
}

struct PicasaOriginalDirectoryInfo {
    dir_name: String,
    photo_filenames: Vec<String>,
}

/// Result of the scan: either it finished/failed, or it was cancelled (a clean stop).
enum ScanControl {
    Cancelled,
    Error(String),
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Runs a full import. Owns the whole lifecycle: on completion it clears the control flags and pushes
/// a final `null` progress (with an updated tag list if any new tags were created) to the UI.
pub async fn run_import(app: AppHandle, db: DbHandle, photo_dirs: Vec<String>) {
    let start = Instant::now();
    let mut scanner = Scanner::new(app.clone(), db);
    let result = scanner.run(photo_dirs).await;

    // Reset control flags so a subsequent import can start.
    {
        let state = app.state::<ImportState>();
        state.is_running.store(false, Ordering::SeqCst);
        state.should_cancel.store(false, Ordering::SeqCst);
        state.is_paused.store(false, Ordering::SeqCst);
    }

    match &result {
        Ok(()) => log::info!(
            "Import finished in {} ms (added {}, removed {})",
            start.elapsed().as_millis(),
            scanner.progress.added,
            scanner.progress.removed,
        ),
        Err(ScanControl::Cancelled) => log::info!("Import cancelled after {} ms", start.elapsed().as_millis()),
        Err(ScanControl::Error(e)) => log::error!("Import failed: {}", e),
    }

    // Tell the UI the import is done (progress = null), refreshing tags if the import created any.
    let updated_tags = if scanner.tags_changed {
        tokio::task::block_in_place(|| crate::store::tag_store::fetch_tags(&scanner.db)).ok()
    } else {
        None
    };
    let _ = foreground_client::set_import_progress(&app, None, updated_tags.as_deref()).await;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

struct Scanner {
    app: AppHandle,
    db: DbHandle,
    progress: ImportProgress,
    batch: Vec<(NewPhoto, Vec<String>)>,
    last_emit: Instant,
    tags_changed: bool,
    import_start: i64,
}

impl Scanner {
    fn new(app: AppHandle, db: DbHandle) -> Self {
        Scanner {
            app,
            db,
            progress: ImportProgress {
                phase: ImportPhase::ScanDirs,
                is_paused: false,
                total: 0,
                processed: 0,
                added: 0,
                removed: 0,
                current_path: None,
            },
            batch: Vec::new(),
            last_emit: Instant::now(),
            tags_changed: false,
            import_start: 0,
        }
    }

    async fn run(&mut self, photo_dirs: Vec<String>) -> Result<(), ScanControl> {
        self.import_start = chrono::Utc::now().timestamp_millis();

        // --- Phase: scanDirs ---
        self.progress.phase = ImportPhase::ScanDirs;
        self.emit_progress(true).await;
        let dirs = self.scan_all(photo_dirs).await?;

        // --- Phase: cleanup (remove photos of directories that are gone) ---
        self.progress.phase = ImportPhase::Cleanup;
        self.emit_progress(true).await;
        let existing_dirs: Vec<String> = dirs.iter().map(|d| d.path.clone()).collect();
        let removed = tokio::task::block_in_place(|| {
            photo_store::delete_photos_of_removed_dirs(&self.db, &existing_dirs)
        })
        .map_err(ScanControl::Error)?;
        self.progress.removed += removed;
        self.emit_progress(true).await;

        // --- Phase: importPhotos ---
        self.progress.phase = ImportPhase::ImportPhotos;
        self.emit_progress(true).await;
        for dir in &dirs {
            self.process_directory(dir).await?;
        }
        self.flush_batch().await?;
        self.progress.current_path = None;
        self.emit_progress(true).await;

        Ok(())
    }

    // --- Scanning ---

    async fn scan_all(&mut self, photo_dirs: Vec<String>) -> Result<Vec<DirectoryInfo>, ScanControl> {
        let mut dirs: Vec<DirectoryInfo> = Vec::new();
        for path in remove_subdirectories(photo_dirs) {
            self.check_pause_and_cancel().await?;

            let p = Path::new(&path);
            if !p.exists() {
                log::warn!("Import path does not exist: {}", path);
                continue;
            }
            if !p.is_dir() {
                log::warn!("Import path is not a directory: {}", path);
                continue;
            }

            self.scan_directory(&mut dirs, &path)?;
            self.emit_progress(false).await;
        }
        Ok(dirs)
    }

    /// Recursively walks `dir`, collecting directories that contain photos. Synchronous (directory
    /// listing is fast); only cancellation is checked here, pause is honoured at async boundaries.
    fn scan_directory(&mut self, result: &mut Vec<DirectoryInfo>, dir: &str) -> Result<(), ScanControl> {
        if self.is_cancelled() {
            return Err(ScanControl::Cancelled);
        }

        let mut photo_filenames: Vec<String> = Vec::new();
        let mut picasa_subdirs: Vec<PicasaOriginalDirectoryInfo> = Vec::new();

        let entries = std::fs::read_dir(dir).map_err(|e| ScanControl::Error(e.to_string()))?;
        for entry in entries {
            let entry = entry.map_err(|e| ScanControl::Error(e.to_string()))?;
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();

            if file_type.is_dir() {
                if let Some(picasa) = self.detect_picasa_original_dir(dir, &name)? {
                    self.progress.total += picasa.photo_filenames.len() as u32;
                    picasa_subdirs.push(picasa);
                } else {
                    let child = format!("{}/{}", dir, name);
                    self.scan_directory(result, &child)?;
                }
            } else if file_type.is_file() && is_accepted_ext(&name) {
                photo_filenames.push(name);
            }
        }

        if !photo_filenames.is_empty() {
            self.progress.total += photo_filenames.len() as u32;
            result.push(DirectoryInfo {
                path: dir.to_string(),
                photo_filenames,
                picasa_original_subdirs: if picasa_subdirs.is_empty() { None } else { Some(picasa_subdirs) },
            });
        }

        Ok(())
    }

    /// Detects a Picasa "originals" subdirectory (`.picasaoriginals` / `Originals` containing a
    /// `Picasa.ini` and at least one photo). These hold the true originals; the edited copies with the
    /// same filename in the parent are ignored during import.
    fn detect_picasa_original_dir(
        &self,
        parent_dir: &str,
        dir_name: &str,
    ) -> Result<Option<PicasaOriginalDirectoryInfo>, ScanControl> {
        if dir_name != ".picasaoriginals" && dir_name != "Originals" {
            return Ok(None);
        }

        let dir_path = format!("{}/{}", parent_dir, dir_name);
        let entries = std::fs::read_dir(&dir_path).map_err(|e| ScanControl::Error(e.to_string()))?;
        let mut has_picasa_ini = false;
        let mut photo_filenames: Vec<String> = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|e| ScanControl::Error(e.to_string()))?;
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();
                if name == ".picasa.ini" || name == "Picasa.ini" {
                    has_picasa_ini = true;
                } else if is_accepted_ext(&name) {
                    photo_filenames.push(name);
                }
            }
        }

        if !has_picasa_ini || photo_filenames.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PicasaOriginalDirectoryInfo { dir_name: dir_name.to_string(), photo_filenames }))
        }
    }

    // --- Importing ---

    async fn process_directory(&mut self, dir: &DirectoryInfo) -> Result<(), ScanControl> {
        self.check_pause_and_cancel().await?;

        let mut ignore: HashSet<String> = HashSet::new();
        if let Some(subdirs) = &dir.picasa_original_subdirs {
            // Filenames present as Picasa originals are ignored in the parent (the parent copies are
            // Picasa's edited versions of the same photos).
            for sub in subdirs {
                for name in &sub.photo_filenames {
                    ignore.insert(name.clone());
                }
            }
            // Import the originals as their own directory first.
            for sub in subdirs {
                let sub_path = format!("{}/{}", dir.path, sub.dir_name);
                self.process_photo_list(&sub_path, &sub.photo_filenames, &HashSet::new()).await?;
            }
        }

        self.process_photo_list(&dir.path, &dir.photo_filenames, &ignore).await?;
        Ok(())
    }

    /// Diffs `filenames` against the DB rows for `dir_path`: imports new files, deletes rows whose file
    /// vanished. `ignore` holds filenames handled elsewhere (Picasa originals).
    async fn process_photo_list(
        &mut self,
        dir_path: &str,
        filenames: &[String],
        ignore: &HashSet<String>,
    ) -> Result<(), ScanControl> {
        self.check_pause_and_cancel().await?;
        self.progress.current_path = Some(dir_path.to_string());

        let existing = tokio::task::block_in_place(|| {
            photo_store::fetch_photos_of_directory(&self.db, dir_path)
        })
        .map_err(ScanControl::Error)?;
        let mut remaining: HashMap<String, PhotoId> =
            existing.into_iter().map(|(id, name)| (name, id)).collect();

        for (i, filename) in filenames.iter().enumerate() {
            self.progress.processed += 1;
            if !ignore.contains(filename) && remaining.remove(filename).is_none() {
                self.import_photo(dir_path, filename).await?;
            }
            if i % 16 == 0 {
                self.check_pause_and_cancel().await?;
            }
            self.emit_progress(false).await;
        }
        self.emit_progress(false).await;

        // Rows left in `remaining` correspond to files that no longer exist on disk.
        let removed_ids: Vec<PhotoId> = remaining.into_values().collect();
        if !removed_ids.is_empty() {
            tokio::task::block_in_place(|| photo_store::delete_photos(&self.db, &removed_ids))
                .map_err(ScanControl::Error)?;
            self.progress.removed += removed_ids.len() as u32;
        }

        Ok(())
    }

    /// Probes a single new photo and queues it for the next batch write.
    /// Per-photo failures are logged and swallowed so the import continues.
    async fn import_photo(&mut self, dir: &str, filename: &str) -> Result<(), ScanControl> {
        if is_raw_ext(filename) || is_heic_ext(filename) {
            return Ok(()); // TODO: Support RAW/HEIC
        }

        let import_start = self.import_start;
        let dir_owned = dir.to_string();
        let file_owned = filename.to_string();
        let built = tokio::task::block_in_place(|| build_new_photo(&dir_owned, &file_owned, import_start));

        match built {
            Ok(Some(item)) => {
                self.batch.push(item);
                if self.batch.len() >= BATCH_SIZE {
                    self.flush_batch().await?;
                }
            }
            Ok(None) => { /* size could not be determined -> skipped */ }
            Err(e) => log::warn!("Importing {}/{} failed: {}", dir, filename, e),
        }
        Ok(())
    }

    async fn flush_batch(&mut self) -> Result<(), ScanControl> {
        if self.batch.is_empty() {
            return Ok(());
        }
        let batch = std::mem::take(&mut self.batch);
        let (added, tags_changed) = tokio::task::block_in_place(|| {
            photo_store::insert_photos_batch(&self.db, &batch)
        })
        .map_err(ScanControl::Error)?;
        self.progress.added += added;
        if tags_changed {
            self.tags_changed = true;
        }
        self.emit_progress(false).await;
        Ok(())
    }

    // --- Control flags & progress ---

    fn is_cancelled(&self) -> bool {
        self.app.state::<ImportState>().should_cancel.load(Ordering::SeqCst)
    }

    fn is_paused_flag(&self) -> bool {
        self.app.state::<ImportState>().is_paused.load(Ordering::SeqCst)
    }

    async fn check_pause_and_cancel(&mut self) -> Result<(), ScanControl> {
        if self.is_cancelled() {
            return Err(ScanControl::Cancelled);
        }
        if self.is_paused_flag() {
            self.progress.is_paused = true;
            self.emit_progress(true).await;
            loop {
                tokio::time::sleep(Duration::from_millis(150)).await;
                if self.is_cancelled() {
                    return Err(ScanControl::Cancelled);
                }
                if !self.is_paused_flag() {
                    break;
                }
            }
            self.progress.is_paused = false;
            self.emit_progress(true).await;
        }
        Ok(())
    }

    async fn emit_progress(&mut self, force: bool) {
        let now = Instant::now();
        if !force && now.duration_since(self.last_emit) < Duration::from_millis(UI_UPDATE_INTERVAL_MS) {
            return;
        }
        self.last_emit = now;
        let paused = self.is_paused_flag();
        self.progress.is_paused = paused;
        if let Err(e) = foreground_client::set_import_progress(&self.app, Some(&self.progress), None).await {
            log::warn!("Failed to send import progress: {}", e);
        }
    }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

fn ext_lower(filename: &str) -> Option<String> {
    Path::new(filename).extension().map(|e| e.to_string_lossy().to_lowercase())
}

fn is_raw_ext(filename: &str) -> bool {
    ext_lower(filename).map(|e| ACCEPTED_RAW.contains(&e.as_str())).unwrap_or(false)
}

fn is_heic_ext(filename: &str) -> bool {
    ext_lower(filename).map(|e| ACCEPTED_HEIC.contains(&e.as_str())).unwrap_or(false)
}

fn is_accepted_ext(filename: &str) -> bool {
    match ext_lower(filename) {
        Some(e) => {
            let e = e.as_str();
            ACCEPTED_NON_RAW.contains(&e) || ACCEPTED_HEIC.contains(&e) || ACCEPTED_RAW.contains(&e)
        }
        None => false,
    }
}

/// Returns a copy of `paths` with any directory that is nested under another removed.
/// Ported from ImportScanner.ts `removeSubdirectories`.
fn remove_subdirectories(paths: Vec<String>) -> Vec<String> {
    let mut result = paths;
    let mut i = result.len();
    while i > 0 {
        i -= 1;
        let is_subdirectory = result
            .iter()
            .enumerate()
            .any(|(j, other)| j != i && result[i].starts_with(other.as_str()));
        if is_subdirectory {
            result.remove(i);
        }
    }
    result
}

/// Builds a `NewPhoto` for a standard raster image, or `Ok(None)` if its size can't be determined.
fn build_new_photo(
    dir: &str,
    filename: &str,
    import_start: i64,
) -> Result<Option<(NewPhoto, Vec<String>)>, String> {
    let full_path = format!("{}/{}", dir, filename);

    let meta = std::fs::metadata(&full_path).map_err(|e| e.to_string())?;
    let modified = system_time_to_millis(meta.modified().ok());
    // TODO: Get EXIF creation date; fall back to the file's creation time, then its modified time.
    let created = match meta.created().ok().map(|t| system_time_to_millis(Some(t))) {
        Some(ms) if ms > 0 => ms,
        _ => modified,
    };

    let size = match imagesize::size(&full_path) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("Could not determine size of {}: {}", full_path, e);
            return Ok(None);
        }
    };
    let master_width = size.width as u32;
    let master_height = size.height as u32;
    if master_width == 0 || master_height == 0 {
        log::warn!("Invalid image size for {}", full_path);
        return Ok(None);
    }

    let photo_work = photo_work_store::fetch_photo_work(Path::new(dir), filename)?;

    let (edited_width, edited_height) = if let Some(crop) = &photo_work.crop_rect {
        (crop.width.round() as u32, crop.height.round() as u32)
    } else if photo_work.rotation_turns.unwrap_or(0) % 2 == 1 {
        (master_height, master_width)
    } else {
        (master_width, master_height)
    };

    let new_photo = NewPhoto {
        master_dir: dir.to_string(),
        master_filename: filename.to_string(),
        master_width,
        master_height,
        master_is_raw: false, // TODO: Support RAW
        edited_width,
        edited_height,
        date_section: millis_to_date_section(created),
        created_at: created,
        updated_at: modified,
        imported_at: import_start,
        flag: photo_work.flagged.unwrap_or(false),
    };
    let tags = photo_work.tags.clone().unwrap_or_default();

    Ok(Some((new_photo, tags)))
}

fn system_time_to_millis(time: Option<SystemTime>) -> i64 {
    time.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn millis_to_date_section(millis: i64) -> String {
    use chrono::TimeZone;
    match chrono::Local.timestamp_millis_opt(millis).single() {
        Some(dt) => dt.format("%Y-%m-%d").to_string(),
        None => "1970-01-01".to_string(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
//
// These exercise the real import data-path headlessly (no Tauri window): the pure classification /
// dedup helpers, the single-photo probe `build_new_photo`, and a full probe -> batch-insert -> fetch
// -> cleanup-delete round-trip against a temp, freshly-migrated SQLite DB. The `Scanner` loop itself
// only orchestrates these pieces plus progress emission, so this covers the substantive import logic.

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    use crate::store::db;
    use crate::store::photo_store;

    /// Unique temp directory for one test, removed on drop.
    struct TempDir {
        path: std::path::PathBuf,
    }

    impl TempDir {
        fn new(tag: &str) -> Self {
            static COUNTER: AtomicU32 = AtomicU32::new(0);
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let path = std::env::temp_dir().join(format!("picturama-test-{}-{}-{}", tag, nanos, n));
            std::fs::create_dir_all(&path).unwrap();
            TempDir { path }
        }

        fn str(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    /// Writes a minimal PNG whose IHDR advertises `w` x `h`. Only the header is needed: `imagesize`
    /// reads the dimensions straight from IHDR and never decodes pixel data or checks the CRC.
    fn write_png(dir: &Path, filename: &str, w: u32, h: u32) {
        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend_from_slice(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]); // signature
        bytes.extend_from_slice(&[0, 0, 0, 0x0D]); // IHDR length = 13
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&w.to_be_bytes());
        bytes.extend_from_slice(&h.to_be_bytes());
        bytes.extend_from_slice(&[8, 2, 0, 0, 0]); // bit depth, colour type (RGB), compression, filter, interlace
        bytes.extend_from_slice(&[0, 0, 0, 0]); // dummy CRC
        std::fs::write(dir.join(filename), &bytes).unwrap();
    }

    fn migrations_dir() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("migrations")
    }

    #[test]
    fn classifies_extensions() {
        assert!(is_accepted_ext("a.jpg") && is_accepted_ext("a.JPG") && is_accepted_ext("a.png"));
        assert!(is_accepted_ext("a.cr2") && is_accepted_ext("a.heic")); // recognised (counted), imported later
        assert!(!is_accepted_ext("a.txt") && !is_accepted_ext("Picasa.ini") && !is_accepted_ext("noext"));
        assert!(is_raw_ext("a.CR2") && !is_raw_ext("a.jpg"));
        assert!(is_heic_ext("a.heif") && !is_heic_ext("a.png"));
    }

    #[test]
    fn drops_nested_directories() {
        let input = vec![
            "/photos".to_string(),
            "/photos/2024".to_string(), // nested under /photos -> dropped
            "/other".to_string(),
        ];
        let kept = remove_subdirectories(input);
        assert!(kept.contains(&"/photos".to_string()));
        assert!(kept.contains(&"/other".to_string()));
        assert!(!kept.contains(&"/photos/2024".to_string()));
    }

    #[test]
    fn probes_dimensions_and_skips_unreadable() {
        let dir = TempDir::new("probe");
        write_png(&dir.path, "landscape.png", 40, 30);
        std::fs::write(dir.path.join("broken.png"), b"not really a png").unwrap();

        let (photo, tags) = build_new_photo(&dir.str(), "landscape.png", 111).unwrap().unwrap();
        assert_eq!((photo.master_width, photo.master_height), (40, 30));
        assert_eq!((photo.edited_width, photo.edited_height), (40, 30)); // no PhotoWork -> unchanged
        assert!(!photo.master_is_raw && !photo.flag);
        assert_eq!(photo.imported_at, 111);
        assert_eq!(photo.date_section.len(), 10); // YYYY-MM-DD
        assert!(tags.is_empty());

        // A file whose header can't be parsed is skipped (Ok(None)), not an error.
        assert!(build_new_photo(&dir.str(), "broken.png", 111).unwrap().is_none());
    }

    #[test]
    fn imports_new_photos_and_cleans_up_vanished_ones() {
        let photos = TempDir::new("photos");
        let home = TempDir::new("home");
        write_png(&photos.path, "a.png", 4, 6);
        write_png(&photos.path, "b.png", 100, 50);
        std::fs::write(photos.path.join("notes.txt"), b"ignore me").unwrap(); // not a photo
        std::fs::write(photos.path.join("raw.cr2"), b"raw-placeholder").unwrap(); // recognised, deferred

        let db = db::open(&home.path.join("db.sqlite3"), &migrations_dir()).unwrap();
        let dir = photos.str();

        // Nothing imported yet.
        assert!(photo_store::fetch_photos_of_directory(&db, &dir).unwrap().is_empty());

        // Replicate what the scanner does per directory: keep accepted files, defer RAW/HEIC, probe the
        // rest, and write them in one batch.
        let filenames: Vec<String> = std::fs::read_dir(&photos.path)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| is_accepted_ext(n))
            .collect();
        assert_eq!(filenames.len(), 3); // a.png, b.png, raw.cr2 (notes.txt excluded)

        let mut batch: Vec<(NewPhoto, Vec<String>)> = Vec::new();
        for name in &filenames {
            if is_raw_ext(name) || is_heic_ext(name) {
                continue; // deferred to Phase 6
            }
            if let Some(item) = build_new_photo(&dir, name, 999).unwrap() {
                batch.push(item);
            }
        }
        let (added, tags_changed) = photo_store::insert_photos_batch(&db, &batch).unwrap();
        assert_eq!(added, 2); // only a.png + b.png; raw.cr2 deferred
        assert!(!tags_changed);

        let mut stored: Vec<String> =
            photo_store::fetch_photos_of_directory(&db, &dir).unwrap().into_iter().map(|(_, n)| n).collect();
        stored.sort();
        assert_eq!(stored, vec!["a.png".to_string(), "b.png".to_string()]);

        // Re-running the same diff imports nothing new (already-present filenames are skipped).
        let existing: HashSet<String> = photo_store::fetch_photos_of_directory(&db, &dir)
            .unwrap()
            .into_iter()
            .map(|(_, n)| n)
            .collect();
        let second: Vec<_> = filenames.iter().filter(|n| !existing.contains(*n) && !is_raw_ext(n)).collect();
        assert!(second.is_empty());

        // The directory is gone from the configured set -> its rows are cleaned up.
        let removed = photo_store::delete_photos_of_removed_dirs(&db, &[]).unwrap();
        assert_eq!(removed, 2);
        assert!(photo_store::fetch_photos_of_directory(&db, &dir).unwrap().is_empty());
    }
}
