// The Tauri command layer, split by domain. Each submodule holds the `#[tauri::command]` functions for
// one area (photos, tags, import, ...); they are wired into the invoke handler in `main.rs`.

pub mod export;
pub mod fs;
pub mod image;
pub mod import;
pub mod lifecycle;
pub mod metadata;
pub mod photo_work;
pub mod photos;
pub mod tags;
pub mod thumbnails;
