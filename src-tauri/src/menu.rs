use tauri::{
    AppHandle, Manager, menu::{
        AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem,
        SubmenuBuilder,
    }
};

use crate::{foreground_client::show_settings, window_service};

/// Build and return the application menu.
pub fn build(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // -----------------------------------------------------------------------
    // Picturama / File
    // -----------------------------------------------------------------------
    let file_menu = {
        let mut b = SubmenuBuilder::new(app, "File");

        #[cfg(target_os = "macos")]
        {
            b = b
                .item(&PredefinedMenuItem::about(
                    app,
                    None,
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
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator();
        }

        b.item(
            &MenuItemBuilder::with_id("file_scan", "Scan for photos")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file_settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?
    };

    // -----------------------------------------------------------------------
    // Edit
    // -----------------------------------------------------------------------
    //let edit_menu = SubmenuBuilder::new(app, "Edit")
    //    .item(&PredefinedMenuItem::undo(app, None)?)
    //    .item(&PredefinedMenuItem::redo(app, None)?)
    //    .separator()
    //    .item(&PredefinedMenuItem::cut(app, None)?)
    //    .item(&PredefinedMenuItem::copy(app, None)?)
    //    .item(&PredefinedMenuItem::paste(app, None)?)
    //    .item(&PredefinedMenuItem::select_all(app, None)?)
    //    .build()?;

    // -----------------------------------------------------------------------
    // View
    // -----------------------------------------------------------------------
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("view_toggle_devtools", "Toggle Developer Tools")
                .accelerator("CmdOrCtrl+Alt+I")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view_show_ui_tester", "Show UI tester")
                .accelerator("CmdOrCtrl+Alt+T")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view_reload", "Reload UI")
                .accelerator("CmdOrCtrl+Shift+R")
                .build(app)?,
        )
        .separator()
        // Tauri (or macOS?) will add "Enter Full Screen" here
        .build()?;

    // -----------------------------------------------------------------------
    // Window (macOS)
    // -----------------------------------------------------------------------
    //#[cfg(target_os = "macos")]
    //let window_menu = SubmenuBuilder::new(app, "Window")
    //    .item(&PredefinedMenuItem::minimize(app, None)?)
    //    .item(&PredefinedMenuItem::zoom(app, None)?)
    //    .separator()
    //    .item(&PredefinedMenuItem::bring_all_to_front(app, None)?)
    //    .build()?;

    // -----------------------------------------------------------------------
    // Help
    // -----------------------------------------------------------------------
    //let help_menu = SubmenuBuilder::new(app, "Help")
    //    .item(
    //        &MenuItemBuilder::with_id("help_github", "View on GitHub")
    //            .build(app)?,
    //    )
    //    .build()?;

    // -----------------------------------------------------------------------
    // Assemble
    // -----------------------------------------------------------------------
    let mut menu = MenuBuilder::new(app)
        .item(&file_menu)
        //.item(&edit_menu)
        .item(&view_menu);

    //#[cfg(target_os = "macos")]
    //{
    //    menu = menu.item(&window_menu);
    //}

    //menu = menu.item(&help_menu);

    Ok(menu.build()?)
}

/// Handle menu events.
/// Register this with `.on_menu_event(menu::handle_event)` in main.rs.
pub fn handle_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "file_scan" => {
        }

        "file_settings" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = show_settings(&app).await;
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
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("location.reload()").map_err(|e| e.to_string());
                }
            });
        }

        //"help_github" => {
        //    let _ = open::that("https://github.com/picturama/picturama");
        //}

        other => {
            eprintln!("Unhandled menu event: {}", other);
        }
    }
}
