// Settings are stored as JSON in <picturama_home_dir>/settings.json.
// Legacy format (pre-2019-08-18) with `directories.photos` is also handled for backwards compatibility.

use std::path::Path;

use crate::types::common_types::Settings;

pub fn fetch_settings(settings_path: &Path) -> Result<Settings, String> {
    if !settings_path.exists() {
        return Ok(Settings { photo_dirs: vec![], export_options: None });
    }

    let raw = std::fs::read_to_string(settings_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    // Current format: { photoDirs: [...] }
    if let Some(photo_dirs) = json.get("photoDirs").and_then(|v| v.as_array()) {
        let dirs: Vec<String> = photo_dirs
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        return Ok(Settings { photo_dirs: dirs, export_options: None });
    }

    // Legacy format (before 2019-08-18): { directories: { photos: "..." } }
    if let Some(photos_dir) = json
        .get("directories")
        .and_then(|d| d.get("photos"))
        .and_then(|p| p.as_str())
    {
        return Ok(Settings {
            photo_dirs:     vec![photos_dir.to_string()],
            export_options: None,
        });
    }

    // Unrecognised format → return empty settings
    Ok(Settings { photo_dirs: vec![], export_options: None })
}

pub fn store_settings(settings_path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path, json).map_err(|e| e.to_string())?;
    Ok(())
}
