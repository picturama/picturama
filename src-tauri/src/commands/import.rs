// Import / scan control commands.

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};

use crate::app_config_builder::AppConfig;
use crate::import_scanner;
use crate::store::db::DbHandle;
use crate::store::settings_store;

/// Starts the directory scanner in a background task. Fire-and-forget: progress is streamed to the UI
/// via `foreground_client::set_import_progress`. Does nothing if an import is already running.
#[tauri::command]
pub async fn start_import(app: AppHandle) -> Result<(), String> {
    run_import_if_idle(&app)
}

/// Core of `start_import`, callable outside a command context (e.g. from the menu handler).
/// Resolves the managed state from the `AppHandle` itself so it needs no `State<'_>` arguments.
pub fn run_import_if_idle(app: &AppHandle) -> Result<(), String> {
    let app_config = app.state::<AppConfig>();
    let db = app.state::<DbHandle>();
    let import_state = app.state::<import_scanner::ImportState>();

    // Prevent concurrent imports: only proceed if we flip is_running false -> true.
    if import_state
        .is_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }
    import_state.should_cancel.store(false, Ordering::SeqCst);
    import_state.is_paused.store(false, Ordering::SeqCst);

    let settings_path = app_config.picturama_home_dir.join("settings.json");
    let photo_dirs = match settings_store::fetch_settings(&settings_path) {
        Ok(settings) => settings.photo_dirs,
        Err(e) => {
            import_state.is_running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };

    let app_handle = app.clone();
    let db_handle: DbHandle = db.inner().clone();
    tauri::async_runtime::spawn(async move {
        import_scanner::run_import(app_handle, db_handle, photo_dirs).await;
    });

    Ok(())
}

/// Toggles the pause state of the running scan.
#[tauri::command]
pub async fn toggle_import_paused(
    import_state: State<'_, import_scanner::ImportState>,
) -> Result<(), String> {
    let was_paused = import_state.is_paused.fetch_xor(true, Ordering::SeqCst);
    log::debug!("Import paused: {}", !was_paused);
    Ok(())
}

/// Requests cancellation of the running scan. Also clears pause so a paused scan can observe it.
#[tauri::command]
pub async fn cancel_import(
    import_state: State<'_, import_scanner::ImportState>,
) -> Result<(), String> {
    import_state.should_cancel.store(true, Ordering::SeqCst);
    import_state.is_paused.store(false, Ordering::SeqCst);
    Ok(())
}
