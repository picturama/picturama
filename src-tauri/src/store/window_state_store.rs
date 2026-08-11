// Geometry of the main window, stored as JSON in <picturama_home_dir>/window-state.json.
// Only the main window is persisted — the UI Tester window (created in menu.rs) is transient.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Position and size of the main window in *physical* pixels, plus whether it was maximized.
/// Physical (not logical) because that is what `outer_position()` / `inner_size()` report and what
/// `set_position()` / `set_size()` take back, so the round trip needs no scale-factor bookkeeping.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x:      i32,
    pub y:      i32,
    pub width:  u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

/// A monitor's usable area (work area, i.e. without taskbar / menu bar) in physical pixels:
/// `(x, y, width, height)`.
pub type MonitorArea = (i32, i32, u32, u32);

/// How much of the window must remain on a monitor for the stored position to be reused. Roughly a
/// grabbable piece of title bar — enough to drag the window back into view.
const MIN_VISIBLE_WIDTH:  i64 = 120;
const MIN_VISIBLE_HEIGHT: i64 = 40;

pub fn window_state_path(picturama_home_dir: &Path) -> PathBuf {
    picturama_home_dir.join("window-state.json")
}

/// Reads the stored window state. A missing, unreadable or degenerate file is not an error — the
/// window then simply keeps the defaults from tauri.conf.json.
pub fn fetch_window_state(path: &Path) -> Option<WindowState> {
    let raw = std::fs::read_to_string(path).ok()?;
    match serde_json::from_str::<WindowState>(&raw) {
        Ok(state) if state.width > 0 && state.height > 0 => Some(state),
        Ok(_) => None,
        Err(e) => {
            log::warn!("Ignoring unreadable window state {}: {}", path.display(), e);
            None
        }
    }
}

pub fn store_window_state(path: &Path, state: &WindowState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Whether enough of `state` lands on one of `monitors`. A monitor that was unplugged or a display
/// arrangement that changed since the last run would otherwise put the window somewhere the user
/// cannot reach it any more.
pub fn is_visible_on_monitors(state: &WindowState, monitors: &[MonitorArea]) -> bool {
    let window_left   = state.x as i64;
    let window_top    = state.y as i64;
    let window_right  = window_left + state.width as i64;
    let window_bottom = window_top + state.height as i64;

    monitors.iter().any(|&(x, y, width, height)| {
        let monitor_left   = x as i64;
        let monitor_top    = y as i64;
        let monitor_right  = monitor_left + width as i64;
        let monitor_bottom = monitor_top + height as i64;

        let overlap_width  = window_right.min(monitor_right) - window_left.max(monitor_left);
        let overlap_height = window_bottom.min(monitor_bottom) - window_top.max(monitor_top);
        overlap_width >= MIN_VISIBLE_WIDTH && overlap_height >= MIN_VISIBLE_HEIGHT
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(x: i32, y: i32, width: u32, height: u32) -> WindowState {
        WindowState { x, y, width, height, maximized: false }
    }

    #[test]
    fn stored_state_survives_a_round_trip() {
        let dir = std::env::temp_dir().join(format!("picturama-winstate-test-{}", std::process::id()));
        let path = window_state_path(&dir);

        // Nothing stored yet → no state, and the missing directory is created on write.
        assert_eq!(fetch_window_state(&path), None);

        let written = WindowState { x: -200, y: 40, width: 1024, height: 768, maximized: true };
        store_window_state(&path, &written).unwrap();
        assert_eq!(fetch_window_state(&path), Some(written));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn fetch_window_state_ignores_broken_or_degenerate_files() {
        let dir = std::env::temp_dir().join(format!("picturama-winstate-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = window_state_path(&dir);

        std::fs::write(&path, b"{ not json").unwrap();
        assert_eq!(fetch_window_state(&path), None);

        // A zero-sized window would be invisible - treat it like no stored state.
        std::fs::write(&path, br#"{"x":0,"y":0,"width":0,"height":600}"#).unwrap();
        assert_eq!(fetch_window_state(&path), None);

        // `maximized` was added later, so a file without it must still load.
        std::fs::write(&path, br#"{"x":10,"y":20,"width":800,"height":600}"#).unwrap();
        assert_eq!(fetch_window_state(&path), Some(state(10, 20, 800, 600)));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn is_visible_on_monitors_detects_off_screen_positions() {
        let primary  = (0, 0, 1920, 1080);
        let secondary = (-1920, -200, 1920, 1080);

        assert!(is_visible_on_monitors(&state(100, 100, 1280, 800), &[primary]));
        // Mostly off to the right, but a grabbable strip remains.
        assert!(is_visible_on_monitors(&state(1800, 100, 1280, 800), &[primary]));
        // Only 20 px wide sliver left → not enough.
        assert!(!is_visible_on_monitors(&state(1900, 100, 1280, 800), &[primary]));
        // Entirely on a monitor that is no longer connected.
        assert!(!is_visible_on_monitors(&state(-1800, -100, 1280, 800), &[primary]));
        assert!(is_visible_on_monitors(&state(-1800, -100, 1280, 800), &[primary, secondary]));
        // No monitors reported at all.
        assert!(!is_visible_on_monitors(&state(100, 100, 1280, 800), &[]));
    }
}
