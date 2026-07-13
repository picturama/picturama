// Builds the native application menu using localised strings from I18n.
//
// `build()` is called from setup() in main.rs (not from Builder::menu())
// because the translations must be fetched from the frontend first — which
// requires the WebView to be running — and only then can the menu be built
// and applied to the window.

use tauri::{
    AppHandle, Manager,
    menu::{
        AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder,
        PredefinedMenuItem, SubmenuBuilder,
    },
};

use crate::i18n::I18n;
use crate::window_service;

/// Build and apply the application menu to the main window.
/// Must be called after I18n is loaded (i.e. inside setup()).
pub fn build(app: &AppHandle, i18n: &I18n) -> tauri::Result<Menu<tauri::Wry>> {
    // -----------------------------------------------------------------------
    // File menu (on macOS this is the app menu)
    // -----------------------------------------------------------------------
    let file_menu = {
        let mut b = SubmenuBuilder::new(app, i18n.msg("MainMenu_file"));

        #[cfg(target_os = "macos")]
        {
            b = b
                .item(&PredefinedMenuItem::about(
                    app,
                    Some(&i18n.msg("MainMenu_about")),
                    Some(
                        AboutMetadataBuilder::new()
                            .name(Some("Picturama"))
                            .version(Some(env!("CARGO_PKG_VERSION")))
                            .authors(Some(vec!["The Picturama contributors".to_string()]))
                            .license(Some("MIT"))
                            .website(Some("https://picturama.github.io"))
                            .build(),
                    ),
                )?)
                .separator()
                .item(&PredefinedMenuItem::services(app, Some(&i18n.msg("MainMenu_services")))?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, Some(&i18n.msg("MainMenu_hide")))?)
                .item(&PredefinedMenuItem::hide_others(app, Some(&i18n.msg("MainMenu_hideOthers")))?)
                .item(&PredefinedMenuItem::show_all(app, Some(&i18n.msg("MainMenu_showAll")))?)
                .separator();
        }

        b.item(
            &MenuItemBuilder::with_id("file_scan", i18n.msg("MainMenu_scan"))
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file_settings", i18n.msg("MainMenu_settings"))
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(&i18n.msg("MainMenu_quit")))?)
        .build()?
    };

    // -----------------------------------------------------------------------
    // View menu
    // -----------------------------------------------------------------------
    let view_menu = SubmenuBuilder::new(app, i18n.msg("MainMenu_view"))
        .item(
            &MenuItemBuilder::with_id("view_toggle_devtools", i18n.msg("MainMenu_toggleDevTools"))
                .accelerator("CmdOrCtrl+Alt+I")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view_show_ui_tester", i18n.msg("MainMenu_toggleUiTester"))
                .accelerator("CmdOrCtrl+Alt+T")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view_reload", i18n.msg("MainMenu_reloadUi"))
                .accelerator("CmdOrCtrl+Shift+R")
                .build(app)?,
        )
        .separator()
        // Tauri (or macOS?) will add "Enter Full Screen" here
        .build()?;

    // -----------------------------------------------------------------------
    // Assemble
    // -----------------------------------------------------------------------
    let menu = MenuBuilder::new(app)
        .item(&file_menu)
        .item(&view_menu)
        .build()?;

    Ok(menu)
}

/// Handle menu events.
pub fn handle_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "file_scan" => {
            if let Err(e) = crate::commands::import::run_import_if_idle(app) {
                eprintln!("file_scan: failed to start import: {}", e);
                crate::foreground_client::show_error(app, "Could not start scanning photos.", Some(&e));
            }
        }

        "file_settings" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::foreground_client::show_settings(&app).await;
            });
        }

        "view_toggle_devtools" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = window_service::toggle_dev_tools(app).await;
            });
        }

        "view_show_ui_tester" => {
            let app = app.clone();
            if let Some(window) = app.get_webview_window("ui-tester") {
                // Window already exists → bring it to front
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            } else {
                // Create it            
                tauri::WebviewWindowBuilder::new(
                    &app,
                    "ui-tester",
                    tauri::WebviewUrl::App("test-ui.html".into())
                )
                .title("UI Tester")
                .build()
                .unwrap();
            }
        }

        "view_reload" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("location.reload()");
                }
            });
        }

        other => {
            eprintln!("Unhandled menu event: {}", other);
        }
    }
}
