// PhotoWork is stored as a YAML sidecar file `picturama.yml` in the photo's directory.
// The legacy `ansel.json` format (Picturama v1.0.0 and earlier, when the app was named Ansel) is read but not written.
// Photos with no `picturama.yml` entry fall back to imported Picasa metadata (see `picasa_reader`).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde_yaml;

use crate::store::picasa_reader::{self, PicasaData};
use crate::types::common_types::{Photo, PhotoWork};

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct DirectoryWorkData {
    #[serde(default)]
    photos: HashMap<String, PhotoWork>,
}

/// All work data cached for one directory: the Picturama sidecar data (`picturama.yml` / `ansel.json`) plus
/// the read-only Picasa fallback (`.picasa.ini` / `Picasa.ini`), if any.
struct DirectoryData {
    picturama_data: DirectoryWorkData,
    picasa_data: Option<PicasaData>,
}

struct DirectoryCache {
    data: HashMap<PathBuf, DirectoryData>,
}

static CACHE: Lazy<Mutex<DirectoryCache>> = Lazy::new(|| {
    Mutex::new(DirectoryCache { data: HashMap::new() })
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn fetch_photo_work_of_photo(photo: &Photo) -> Result<PhotoWork, String> {
    fetch_photo_work(Path::new(&photo.master_dir), &photo.master_filename,
        photo.master_width, photo.master_height)
}

pub fn fetch_photo_work(photo_dir: &Path, filename: &str, master_width: u32, master_height: u32)
    -> Result<PhotoWork, String>
{
    let mut cache = CACHE.lock().unwrap();

    if !cache.data.contains_key(photo_dir) {
        let data = read_directory_data(photo_dir)?;
        cache.data.insert(photo_dir.to_path_buf(), data);
    }

    let data = cache.data.get(photo_dir).unwrap();

    // A `picturama.yml` entry always wins; only if absent do we convert imported Picasa rules.
    if let Some(photo_work) = data.picturama_data.photos.get(filename) {
        return Ok(photo_work.clone());
    }
    if let Some(picasa_data) = &data.picasa_data {
        if let Some(rules) = picasa_data.photos.get(filename) {
            return Ok(picasa_reader::create_photo_work_from_picasa_rules(
                rules, photo_dir, filename, master_width, master_height));
        }
    }
    Ok(PhotoWork::default())
}

pub fn store_photo_work(photo_dir: &Path, filename: &str, photo_work: &PhotoWork) -> Result<(), String> {
    let mut cache = CACHE.lock().unwrap();

    // Load any existing sidecar data first, so a store before the first fetch doesn't clobber it.
    if !cache.data.contains_key(photo_dir) {
        let data = read_directory_data(photo_dir)?;
        cache.data.insert(photo_dir.to_path_buf(), data);
    }
    let data = cache.data.get_mut(photo_dir).unwrap();

    let is_empty = serde_json::to_value(photo_work)
        .map(|v| v.as_object().map(|o| o.values().all(|v| v.is_null())).unwrap_or(true))
        .unwrap_or(true);

    // Only the Picturama sidecar is written; imported Picasa data stays read-only.
    if is_empty {
        data.picturama_data.photos.remove(filename);
    } else {
        data.picturama_data.photos.insert(filename.to_string(), photo_work.clone());
    }

    persist_directory_data(photo_dir, &data.picturama_data)?;
    Ok(())
}

pub fn remove_photo_work(photo_dir: &Path, filename: &str) -> Result<(), String> {
    store_photo_work(photo_dir, filename, &PhotoWork::default())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn read_directory_data(photo_dir: &Path) -> Result<DirectoryData, String> {
    let picturama_data = read_picturama_data(photo_dir)?;
    // Picasa data is a read-only fallback used only for photos without a Picturama sidecar entry.
    let picasa_data = picasa_reader::read_picasa_ini(photo_dir);
    Ok(DirectoryData { picturama_data, picasa_data })
}

fn read_picturama_data(photo_dir: &Path) -> Result<DirectoryWorkData, String> {
    // 1. Try picturama.yml (current format)
    let yml_path = photo_dir.join("picturama.yml");
    if yml_path.exists() {
        let contents = std::fs::read_to_string(&yml_path).map_err(|e| e.to_string())?;
        let data: DirectoryWorkData = serde_yaml::from_str(&contents)
            .map_err(|e| format!("Failed to parse {:?}: {}", yml_path, e))?;
        log::debug!("Loaded {:?}", yml_path);
        return Ok(data);
    }

    // 2. Try ansel.json (legacy format from v1.0.0 and earlier)
    let ansel_path = photo_dir.join("ansel.json");
    if ansel_path.exists() {
        let contents = std::fs::read_to_string(&ansel_path).map_err(|e| e.to_string())?;
        let data: DirectoryWorkData = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse {:?}: {}", ansel_path, e))?;
        log::debug!("Loaded {:?}", ansel_path);
        return Ok(data);
    }

    Ok(DirectoryWorkData::default())
}

fn persist_directory_data(photo_dir: &Path, data: &DirectoryWorkData) -> Result<(), String> {
    let yml_path = photo_dir.join("picturama.yml");
    let ansel_path = photo_dir.join("ansel.json");

    if data.photos.is_empty() {
        // Remove the file if it exists
        if yml_path.exists() {
            std::fs::remove_file(&yml_path).map_err(|e| e.to_string())?;
            log::debug!("Removed empty {:?}", yml_path);
        }
        // Also clean up legacy ansel.json if present
        if ansel_path.exists() {
            std::fs::remove_file(&ansel_path).map_err(|e| e.to_string())?;
        }
    } else {
        let header = "# This file contains the changes applied to photos in this directory using Picturama.\n\
                      # See: https://picturama.github.io/\n\n";
        let yml = serde_yaml::to_string(data)
            .map_err(|e| format!("Failed to serialise YAML: {}", e))?;
        std::fs::write(&yml_path, format!("{}{}", header, yml))
            .map_err(|e| e.to_string())?;
        log::debug!("Stored {:?}", yml_path);
        // Clean up legacy file if it still exists
        if ansel_path.exists() {
            let _ = std::fs::remove_file(&ansel_path);
        }
    }
    Ok(())
}
