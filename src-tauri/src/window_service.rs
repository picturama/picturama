// Native window control commands called from the React frontend.

use tauri::{AppHandle, Emitter, Manager};

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
    let window = get_main_window(&app)?;
    #[cfg(debug_assertions)]
    {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
    #[cfg(not(debug_assertions))]
    {
        // DevTools are compiled out in release builds.
        // This is intentional: shipping a devtools toggle in production is
        // a security risk for any app that loads remote content.
        let _ = window;
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
        let app_clone = app.clone();
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::Moved(_) => {
                    // Resized fires after maximize/unmaximize – use it to
                    // push an updated state snapshot.
                    if let Some(w) = app_clone.get_webview_window("main") {
                        emit_window_state(&app_clone, &w);
                    }
                }
                _ => {}
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
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
