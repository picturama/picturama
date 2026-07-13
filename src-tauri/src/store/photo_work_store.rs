// PhotoWork is stored as a YAML sidecar file `picturama.yml` in the photo's directory.
// The legacy `ansel.json` format (Picturama v1.0.0 and earlier, when the app was named Ansel) is read but not written.

// TODO: Picasa.ini import

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde_yaml;

use crate::types::common_types::{Photo, PhotoWork};

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct DirectoryWorkData {
    #[serde(default)]
    photos: HashMap<String, PhotoWork>,
}

struct DirectoryCache {
    data: HashMap<PathBuf, DirectoryWorkData>,
}

static CACHE: Lazy<Mutex<DirectoryCache>> = Lazy::new(|| {
    Mutex::new(DirectoryCache { data: HashMap::new() })
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn fetch_photo_work_of_photo(photo: &Photo) -> Result<PhotoWork, String> {
    fetch_photo_work(Path::new(&photo.master_dir), &photo.master_filename)
}

pub fn fetch_photo_work(photo_dir: &Path, filename: &str) -> Result<PhotoWork, String> {
    let mut cache = CACHE.lock().unwrap();

    if !cache.data.contains_key(photo_dir) {
        let data = read_directory_data(photo_dir)?;
        cache.data.insert(photo_dir.to_path_buf(), data);
    }

    let data = cache.data.get(photo_dir).unwrap();
    Ok(data.photos.get(filename).cloned().unwrap_or_default())
}

pub fn store_photo_work(photo_dir: &Path, filename: &str, photo_work: &PhotoWork) -> Result<(), String> {
    let mut cache = CACHE.lock().unwrap();
    let data = cache.data.entry(photo_dir.to_path_buf()).or_default();

    let is_empty = serde_json::to_value(photo_work)
        .map(|v| v.as_object().map(|o| o.values().all(|v| v.is_null())).unwrap_or(true))
        .unwrap_or(true);

    if is_empty {
        data.photos.remove(filename);
    } else {
        data.photos.insert(filename.to_string(), photo_work.clone());
    }

    persist_directory_data(photo_dir, data)?;
    Ok(())
}

pub fn remove_photo_work(photo_dir: &Path, filename: &str) -> Result<(), String> {
    store_photo_work(photo_dir, filename, &PhotoWork::default())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn read_directory_data(photo_dir: &Path) -> Result<DirectoryWorkData, String> {
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
