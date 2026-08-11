// Native window control commands called from the React frontend.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

use crate::app_config_builder::AppConfig;
use crate::store::window_state_store::{self, MonitorArea, WindowState};

// Event name kept in sync with ForegroundService.ts
const EVT_WINDOW_STATE: &str = "window-state-changed";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStatePayload {
    pub is_maximized: bool,
    pub is_fullscreen: bool,
}

// ---------------------------------------------------------------------------
// Minimize / maximize / restore / close
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn toggle_full_screen(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
        window
            .set_fullscreen(!is_fullscreen)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_minimize(app: AppHandle) -> Result<(), String> {
    let window = get_main_window(&app)?;
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn window_maximize(app: AppHandle) -> Result<(), String> {
    let window = get_main_window(&app)?;
    window.maximize().map_err(|e| e.to_string())?;
    emit_window_state(&app, &window);
    Ok(())
}

#[tauri::command]
pub async fn window_unmaximize(app: AppHandle) -> Result<(), String> {
    let window = get_main_window(&app)?;
    window.unmaximize().map_err(|e| e.to_string())?;
    emit_window_state(&app, &window);
    Ok(())
}

#[tauri::command]
pub async fn window_close(app: AppHandle) -> Result<(), String> {
    let window = get_main_window(&app)?;
    window.close().map_err(|e| e.to_string())
}

/// Returns the current window state so the frontend can initialise its
/// maximize/restore button correctly on startup.
#[tauri::command]
pub async fn window_get_state(app: AppHandle) -> Result<WindowStatePayload, String> {
    let window = get_main_window(&app)?;
    Ok(WindowStatePayload {
        is_maximized: window.is_maximized().map_err(|e| e.to_string())?,
        is_fullscreen: window.is_fullscreen().map_err(|e| e.to_string())?,
    })
}

// ---------------------------------------------------------------------------
// DevTools
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn toggle_dev_tools(app: AppHandle) -> Result<(), String> {
    // DevTools are available in release builds too, via the `devtools` feature on
    // the `tauri` crate (see Cargo.toml) — which makes `open_devtools()` etc.
    // unconditionally available regardless of `debug_assertions`. Picturama loads
    // no remote content (local UI only) and ships outside the Mac App Store, so
    // enabling devtools in production is safe here.
    let window = get_active_window(&app)?;
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Window-state event listener (called once at startup from main.rs)
//
// Tauri fires on_window_event for maximize / unmaximize / enter/exit
// fullscreen. We forward these to the frontend so WindowControls.tsx can
// update the maximize/restore icon without polling.
// ---------------------------------------------------------------------------

pub fn register_window_state_listener(app: &AppHandle) {
    let app = app.clone();
    if let Some(window) = app.get_webview_window("main") {
        let last_fullscreen = Arc::new(AtomicBool::new(window.is_fullscreen().unwrap_or(false)));
        let app_clone = app.clone();
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::Moved(_) => {
                    // Resized fires after maximize/unmaximize – use it to
                    // push an updated state snapshot.
                    if let Some(w) = app_clone.get_webview_window("main") {
                        emit_window_state(&app_clone, &w);

                        // Notify the frontend, but only when fullscreen actually flips, regardless of how fullscreen
                        // was toggled (menu, F11, or the macOS green traffic-light button).
                        let is_fullscreen = w.is_fullscreen().unwrap_or(false);
                        if last_fullscreen.swap(is_fullscreen, Ordering::Relaxed) != is_fullscreen {
                            let app_for_rpc = app_clone.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) =
                                    crate::foreground_client::on_full_screen_change(&app_for_rpc, is_fullscreen).await
                                {
                                    eprintln!("on_full_screen_change RPC failed: {}", e);
                                }
                            });
                        }
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    // Closing the window destroys it, so the geometry has to be read now — the
                    // later RunEvent::Exit would find nothing.
                    save_window_state(&app_clone);
                }
                _ => {}
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Window geometry persistence (main window only — the UI Tester is transient)
// ---------------------------------------------------------------------------

/// Applies the stored geometry to the main window and shows it. The window is configured
/// `"visible": false` in tauri.conf.json so that happens before the first paint — otherwise the
/// window would flash at the default position and jump.
///
/// Call this once from `setup()`, after `register_window_state_listener`.
pub fn restore_window_state(app: &AppHandle, picturama_home_dir: &Path) {
    if let Some(window) = app.get_webview_window("main") {
        let stored = window_state_store::fetch_window_state(
            &window_state_store::window_state_path(picturama_home_dir));

        if let Some(state) = &stored {
            if let Err(e) = window.set_size(PhysicalSize::new(state.width, state.height)) {
                log::warn!("Could not restore window size: {}", e);
            }
            // The position is only reused while it still lands on a screen: a display that was
            // unplugged or rearranged would otherwise put the window out of the user's reach. An
            // empty monitor list means the platform told us nothing (the window is still hidden at
            // this point) — then the stored position is used unchecked rather than dropped.
            let monitors = monitor_areas(&window);
            if monitors.is_empty() || window_state_store::is_visible_on_monitors(state, &monitors) {
                if let Err(e) = window.set_position(PhysicalPosition::new(state.x, state.y)) {
                    log::warn!("Could not restore window position: {}", e);
                }
            } else {
                log::info!("Stored window position {},{} is off-screen — using the default",
                    state.x, state.y);
            }
        }

        if stored.map_or(false, |state| state.maximized) {
            if let Err(e) = window.maximize() {
                log::warn!("Could not restore maximized window: {}", e);
            }
        }

        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Reads the main window's geometry and writes it to disk. Called both when the window closes and
/// when the app exits, because not every platform's quit path passes through both — whichever runs
/// while the window still exists wins, the other one finds no window and does nothing.
pub fn save_window_state(app: &AppHandle) {
    let (Some(window), Some(app_config)) =
        (app.get_webview_window("main"), app.try_state::<AppConfig>()) else { return };
    let path = window_state_store::window_state_path(&app_config.picturama_home_dir);

    let is_maximized  = window.is_maximized().unwrap_or(false);
    let is_fullscreen = window.is_fullscreen().unwrap_or(false);
    let is_minimized  = window.is_minimized().unwrap_or(false);
    // Fullscreen itself is not restored, so a window quit in fullscreen comes back windowed.
    let maximized = is_maximized && !is_fullscreen;

    let state = if !is_maximized && !is_fullscreen && !is_minimized {
        read_geometry(&window, maximized)
    } else {
        // In those states the window reports the maximized / fullscreen / iconified rect, not the
        // geometry it should return to. The stored file still holds that geometry (it was written
        // while the window was in a normal state), so keep it and update only the flag.
        match window_state_store::fetch_window_state(&path) {
            Some(stored) => Some(WindowState { maximized, ..stored }),
            // Nothing stored yet. A maximized window's rect is at least on the right screen; a
            // minimized one's is a platform placeholder, so that one is dropped instead.
            None if !is_minimized => read_geometry(&window, maximized),
            None => None,
        }
    };

    let Some(state) = state else { return };
    if let Err(e) = window_state_store::store_window_state(&path, &state) {
        log::warn!("Could not store window state: {}", e);
    }
}

/// The window's current outer position and inner size — the pair `set_position` / `set_size` take
/// back. `None` when the platform won't report them or reports a degenerate size.
fn read_geometry(window: &tauri::WebviewWindow, maximized: bool) -> Option<WindowState> {
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    if size.width == 0 || size.height == 0 {
        return None;
    }
    Some(WindowState { x: position.x, y: position.y, width: size.width, height: size.height, maximized })
}

/// The work areas of all monitors, in physical pixels — the coordinate space the stored geometry
/// uses.
fn monitor_areas(window: &tauri::WebviewWindow) -> Vec<MonitorArea> {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            (area.position.x, area.position.y, area.size.width, area.size.height)
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

/// The currently focused window, falling back to the main window. Used by actions that should act on
/// whichever window the user is looking at (e.g. devtools, reload) rather than always the main window.
/// (`get_focused_window` is behind Tauri's `unstable` feature, so we scan the webview windows for the
/// focused one ourselves.)
pub(crate) fn get_active_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| app.get_webview_window("main"))
        .ok_or_else(|| "No active window found".to_string())
}

fn emit_window_state(app: &AppHandle, window: &tauri::WebviewWindow) {
    let payload = WindowStatePayload {
        is_maximized: window.is_maximized().unwrap_or(false),
        is_fullscreen: window.is_fullscreen().unwrap_or(false),
    };
    if let Err(e) = app.emit(EVT_WINDOW_STATE, payload) {
        eprintln!("Failed to emit {}: {}", EVT_WINDOW_STATE, e);
    }
}
