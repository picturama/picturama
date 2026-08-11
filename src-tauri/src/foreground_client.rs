// RPC mechanism for executing tasks in the frontend: src/app/ForegroundService.ts
//
// Pattern:
//
//   Rust                                    Frontend (ForegroundService.ts)
//   ─────                                   ────────────────────────────────
//   call_foreground("renderPhoto", params)
//     → stores oneshot sender under callId
//     → emits "execute-foreground-action"
//       { callId, action, params }
//                                           ← listens for "execute-foreground-action"
//                                           ← runs renderPhoto() in WebGL/canvas
//                                           ← calls invoke("foreground_action_done",
//                                               { callId, result, error })
//   foreground_action_done command
//     → looks up callId in pending map
//     → resolves / rejects the oneshot
//   ← returns BinaryString to caller
//
// Public API used from other Rust modules:
//
//   let png = foreground_rpc::call_foreground(
//       &app,
//       "renderPhoto",
//       serde_json::json!({ "photo": photo, "photoWork": photo_work, ... }),
//   ).await?;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

use crate::types::common_types::IpcErrorInfo;

// ---------------------------------------------------------------------------
// Pending-calls registry (stored as Tauri managed state)
// ---------------------------------------------------------------------------

type PendingTx = oneshot::Sender<Result<Value, IpcErrorInfo>>;

#[derive(Default)]
pub struct PendingCalls(pub Mutex<HashMap<u32, PendingTx>>);

static NEXT_CALL_ID: AtomicU32 = AtomicU32::new(1);

// ---------------------------------------------------------------------------
// Event payload sent to the frontend
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ForegroundRpcRequest<'a> {
    call_id: u32,
    action: &'a str,
    params: Value,
}

// ---------------------------------------------------------------------------
// Call the renderer and await its response
// ---------------------------------------------------------------------------

pub async fn call_foreground(
    app: &AppHandle,
    action: &str,
    params: Value,
) -> Result<Value, String> {
    let call_id = NEXT_CALL_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();

    {
        let pending: State<PendingCalls> = app.state();
        pending
            .0
            .lock()
            .unwrap()
            .insert(call_id, tx);
    }

    app.emit(
        "execute-foreground-action",
        ForegroundRpcRequest { call_id, action, params },
    )
    .map_err(|e| e.to_string())?;

    rx.await
        .map_err(|_| "foreground RPC channel dropped".to_string())?
        .map_err(|e| e.message)
}

// ---------------------------------------------------------------------------
// Tauri command called by the frontend to deliver the result
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn foreground_action_done(
    app: AppHandle,
    call_id: u32,
    result: Option<Value>,
    error: Option<IpcErrorInfo>,
) {
    let pending: State<PendingCalls> = app.state();
    let tx = pending.0.lock().unwrap().remove(&call_id);

    if let Some(tx) = tx {
        let outcome = match error {
            Some(err) => Err(err),
            None => Ok(result.unwrap_or(Value::Null)),
        };
        // Ignore send error – caller may have timed out
        let _ = tx.send(outcome);
    } else {
        eprintln!("foreground_action_done: unknown callId {}", call_id);
    }
}

// ---------------------------------------------------------------------------
// Typed helpers used in Rust code
// ---------------------------------------------------------------------------

/// Ask the UI to render a photo and return the result as a BinaryString.
pub async fn render_photo(
    app: &AppHandle,
    photo: &crate::types::common_types::Photo,
    photo_work: &crate::types::common_types::PhotoWork,
    max_size: Option<crate::types::geometry_types::Size>,
    options: &crate::types::common_types::PhotoRenderOptions,
) -> Result<String, String> {
    let params = serde_json::json!({
        "photo": photo,
        "photoWork": photo_work,
        "maxSize": max_size,
        "options": options,
    });
    let value = call_foreground(app, "renderPhoto", params).await?;
    value
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "renderPhoto: expected string result".to_string())
}

/// Show an error originating in the Rust process in the UI.
pub fn show_error(app: &AppHandle, msg: &str, error: Option<&str>) {
    let params = serde_json::json!({
        "processName": "background",
        "msg": msg,
        "errorStack": error,
    });
    let app = app.clone();
    let params_clone = params.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = call_foreground(&app, "showError", params_clone).await {
            eprintln!("show_error: failed to call foreground: {}", e);
        }
    });
}

/// Push an import-progress update to the UI.
pub async fn set_import_progress(
    app: &AppHandle,
    progress: Option<&crate::types::common_types::ImportProgress>,
    updated_tags: Option<&[crate::types::common_types::Tag]>,
) -> Result<(), String> {
    let params = serde_json::json!({
        "progress": progress,
        "updatedTags": updated_tags,
    });
    call_foreground(app, "setImportProgress", params).await?;
    Ok(())
}

/// Tell UI the full-screen state changed.
pub async fn on_full_screen_change(app: &AppHandle, is_full_screen: bool) -> Result<(), String> {
    let params = serde_json::json!({ "isFullScreen": is_full_screen });
    call_foreground(app, "onFullScreenChange", params).await?;
    Ok(())
}

/// Tell UI to open the settings dialog. Only the macOS menu needs this — on the other platforms the
/// UI opens the dialog itself (the cog button in the top bar).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub async fn show_settings(app: &AppHandle) -> Result<(), String> {
    call_foreground(app, "showSettings", serde_json::Value::Null).await?;
    Ok(())
}

/// Tell UI to open the export dialog for the current selection. Only the macOS menu needs this — on
/// the other platforms the export is started from the UI's photo actions.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub async fn trigger_export(app: &AppHandle) -> Result<(), String> {
    call_foreground(app, "showExport", serde_json::Value::Null).await?;
    Ok(())
}

/// Ask the UI to show the "import finished" toast.
pub async fn show_import_finished_toast(app: &AppHandle, photo_count: u32, duration_ms: u64) -> Result<(), String> {
    let params = serde_json::json!({ "photoCount": photo_count, "durationMs": duration_ms });
    call_foreground(app, "showImportFinishedToast", params).await?;
    Ok(())
}
