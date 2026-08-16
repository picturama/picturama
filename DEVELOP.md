How to develop Picturama
========================

Picturama is a local photo organizer: a Tauri 2 desktop app with a React/Redux web view (`src/app`) and a
Rust native side (`src-tauri/src`). Nothing is uploaded anywhere — the app makes no network requests at all.


Directory structure
-------------------

    +-- dist/                 Build artifacts of the web view (filled by `vite`)
    +-- doc/                  Resources used by documentation
    +-- migrations/           DB migration scripts
    +-- src/
        +-- app/              Code running in web view of main UI (TypeScript / React)
            +-- entry.tsx           App entry point
            +-- BackgroundClient.ts IPC adapter (calls Tauri commands via `invoke()`)
            +-- ForegroundService.ts Receives RPC calls FROM Rust (renderPhoto, ...)
            +-- controller/         Imperative glue: calls BackgroundClient, dispatches into the store
            +-- state/              Redux store, actions, selectors
            +-- ui/                 React components (declarative, read from selectors)
            +-- renderer/           WebGL rendering (the only place that can render a photo)
            +-- i18n/               Localisation
        +-- image/            Source images (app icon sources)
        +-- script/           Helper scripts
        +-- static/           Static files to be copied directly to `dist`
        +-- test-jest/        Unit tests (TypeScript)
        +-- test-ui/          Code running in the web view of the UI Tester
        +-- typings/          TypeScript type definitions
    +-- src-tauri/            Code running on native side (Rust / Tauri)
        +-- dmg/              Background of DMG (MacOS package)
        +-- icons/            App icons (.icns for macOS, .ico for Windows, PNGs for Linux)
        +-- capabilities/     Tauri permissions granted to the web view
        +-- src/
            +-- main.rs           Tauri builder, managed state, setup(), module declarations
            +-- commands/         Tauri command layer, split by domain (photos, tags, import, thumbnails, ...)
            +-- image/            Image-format readers/decoders (exif_reader, raw_reader, xmp_reader, heif)
            +-- types/            Shared IPC types (common_types) + geometry (geometry_types)
            +-- store/            DB & file persistence (db, photo/tag/settings/photo_work/thumbnail stores)
            +-- ...               menu, window_service, foreground_client, i18n, import_scanner, app_config_builder
        +-- Cargo.toml
        +-- tauri.conf.json
    +-- submodules/           Third-party projects fetched as git submodules
        +-- test-data*/       Data used for testing


Build from sources
------------------

Prerequirements:

  - Install node: https://nodejs.org/en/download
  - Install Rust: https://rustup.rs
  - Install Tauri system dependencies (platform-specific):
    - See: https://tauri.app/start/prerequisites/
    - Mac OS:
      - Install Xcode and start it once. You can close Xcode after the "required components" have been installed.
      - `xcode-select --install`
    - Windows: Visual Studio Build Tools (including "Desktop Development with C++")
    - Linux: `libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev`
  - Install `libheif` (native HEIC/HEIF decoding):
    - Mac OS: `brew install libheif`
    - Windows: `vcpkg install libheif[core]`, then set `VCPKG_ROOT` to your vcpkg directory and add
      `%VCPKG_ROOT%\installed\x64-windows\bin` to `PATH`, so the dev build finds `heif.dll` and the codec DLLs at
      runtime. We link libheif dynamically: `src-tauri/.cargo/config.toml` sets `VCPKGRS_DYNAMIC=1` so `libheif-sys`
      looks in the `x64-windows` triplet rather than its default `x64-windows-static-md`.
    - Linux (Debian/Ubuntu): `sudo apt install libheif-dev`
  - Install Tauri CLI: `cargo install tauri-cli --version "^2"`

Fetch git submodules:

    git submodule update --init --recursive

Fetch dependencies and build and start Picturama:

    npm i
    npm run licenses
    npm start

Clean project:

    npm run clean

Development hotkeys:

  - Toggle developer tools: `Ctrl`+`Shift`+`I` (On Mac: `Alt`+`Cmd`+`I`)
  - Toggle UI tester:       `Ctrl`+`Shift`+`T` (On Mac: `Alt`+`Cmd`+`T`)
  - Reload UI:              `Ctrl`+`Shift`+`R` (On Mac: `Cmd`+`Shift`+`R`)


Unit tests
----------

Tests are split by language and run separately.

TypeScript (Jest, only `src/test-jest/`):

    npm run test                    # run all tests
    npm run test:watch              # watch mode
    npx jest -t 'my test' --watch   # a single test in watch mode (replace `my test`)

Rust:

    npm run tauri:test                                  # cargo test --bin Picturama
    cd src-tauri && cargo test --bin Picturama heif     # single test / name filter

Rust tests live inline as `#[cfg(test)] mod tests` in the source files, not in a separate tree — that is
where most of the real test coverage is. Several of them read real photos from `submodules/test-data/`, so
`git submodule update --init --recursive` is a prerequisite. On Windows they additionally need the vcpkg bin
directory on `PATH` to find `heif.dll`.


Architecture
------------

### The IPC boundary runs in both directions

**Frontend → Rust** is ordinary Tauri: `src/app/BackgroundClient.ts` wraps `invoke()` and converts method
names from camelCase to snake_case, so `fetchTotalPhotoCount()` reaches `fetch_total_photo_count` in
`src-tauri/src/commands/`. Every command must also be listed in `generate_handler!` in `main.rs`.

```typescript
// BackgroundClient.ts wraps all calls:
import { invoke } from '@tauri-apps/api/core'
invoke('fetch_sections', { filter, sectionIdsToKeepLoaded })
```

**Rust → Frontend** is a hand-rolled RPC in `src-tauri/src/foreground_client.rs`. It is used for
`renderPhoto`, `renderImage`, `setImportProgress`, `onPhotoTrashed` and similar actions that need a result
back from the web view:

```
Rust: foreground_client::call_foreground(&app, "renderPhoto", params).await
  → emits "execute-foreground-action" event with { callId, action, params }
  → ForegroundService.ts handles it, calls invoke("foreground_action_done", { callId, result })
  → Rust resolves the oneshot channel, returns the BinaryString result
```

### Image rendering

**Image rendering only works in the web view**, in WebGL (`src/app/renderer/`). So when Rust needs a rendered photo —
thumbnail generation (`commands/thumbnails.rs`) and export (`commands/export.rs`) — it calls *back* into the frontend
and waits for the pixels. Rust drives, the web view renders.

In rare cases a render can take the web view down with it (a crash in the WebGL layer is a process death, not a JS error),
and then the RPC never answers. `create_thumbnail` therefore writes a marker file next to the thumbnail *before* it asks
the frontend and removes it as soon as the frontend answers — with pixels or with an error. A marker found on the next
attempt means the last render was fatal, so the photo is skipped and the grid shows a placeholder instead of triggering
the same crash again after every reload.

### Frontend layering

`src/app/controller/` holds the imperative glue: controllers call `BackgroundClient` and dispatch into the
Redux store (`src/app/state/`). React components under `src/app/ui/` stay declarative and read from
selectors. New cross-cutting behaviour belongs in a controller, not in a component.

### Dev and release differ in where they read and write

`src-tauri/src/app_config_builder.rs` is the single place that decides. In debug builds the home directory
is `dot-picturama/` inside the repo and the app dir is the project root; in release builds they are
`~/.picturama` and the bundled resource dir. Code that needs either must go through `AppConfig` rather than
computing paths itself.

### Persistence

All paths are under `<picturama_home_dir>` (see above). Originals are never modified — that is a product
guarantee, not an implementation detail.

  - **Database** — `db.sqlite3`. Migrations are compatible with `sqlite3-helper` (same `migrations` table,
    same `-- Down` split convention).
  - **Settings** — `settings.json`
  - **PhotoWork (non-destructive edits)** — `picturama.yml` sidecar per photo directory.
  - **Thumbnails** — `thumbnails/<shortId>.webp`, plus `thumbnails/<shortId>.failed` for a photo whose render killed
    the web view (see "Image rendering" above)


I18N
----

The following files provide I18N:

  - `.github/workflows/codespell.yml` - The `text_*.ts` have to be excluded from codespell checks, since it only checks
    the English language.
  - `src/app/i18n/i18n.ts` - Defines available languages and provides the I18N logic
  - `src/app/i18n/text_*.ts` - Holds the I18N messages for each language
  - `src/script/check-i18n.mjs` - Adds missing attributes (called by `npm run i18n` - see below)

Add missing attributes to localization files:

    npm run i18n


Licenses
--------

Picturama is MIT, but a build ships components written by others. Their license text and the copyright notice accompany
the binary.

  - `npm run licenses` collects the components and their license texts.
  - `licenses.json.gz` — the result, in the project root. Declared as a Tauri resource in `tauri.conf.json` so it lands
    in `app_dir` next to `migrations/`. Gzipped because it is mostly license texts: 820 KB become 82 KB

Why generated, not checked in: the list is a property of the build, not of the source tree. The Rust crates differ per
target platform, and the Debian package versions inside the AppImage differ between architectures and change whenever
the build container is rebuilt. A checked-in list would be a second source of truth that goes stale silently.


Icons
-----

Used icon libs:

  - [Blueprint icons](https://blueprintjs.com/docs/#icons) - using `@blueprintjs/icons`
  - [Font Awesome](https://fontawesome.com/icons) - using `react-icons/fa`
  - [Material Design](https://material.io/tools/icons/) - using `react-icons/md`


Security
--------

In a Tauri app the web view is the untrusted side and the command layer is the boundary. Our
`src-tauri/capabilities/default.json` grants only `core:default` and `core:window:*` — no fs and no shell
plugin — so the frontend can reach the file system only through the commands we write ourselves and through
the asset protocol. Photo content is not an injection vector: the frontend contains no
`dangerouslySetInnerHTML`, no `innerHTML` and no `eval`, and it makes no network requests at all, so EXIF and
XMP strings read from untrusted photos stay inert text. What the two settings below defend against is a
compromised npm dependency shipping code into the web view.

### Content-Security-Policy

Defined in `src-tauri/tauri.conf.json` under `app.security.csp`:

  - `default-src 'self'` — the baseline. `script-src`, `object-src` and `frame-src` are deliberately absent:
    they fall back to `default-src`, and the app loads no external scripts, plugins or frames.
  - `img-src 'self' asset: http://asset.localhost blob: data:`
      - `asset:` and `http://asset.localhost` are the asset protocol — the first form is used on macOS and
        Linux, the second on Windows. We bundle for all three, so both are needed.
      - `blob:` — RAW previews are extracted by Rust and handed to the browser as a blob URL
        (`src/app/renderer/WebGLCanvas.ts`).
      - `data:` — Blueprint 3's stylesheet uses `url("data:image/svg+xml,…")` background images.
  - `style-src 'self' 'unsafe-inline'` — required by the `style` attribute on `<html>` in `index.html` and by
    React's inline styles (the photo grid is positioned that way by `justified-layout`).
  - `connect-src 'self' ipc: http://ipc.localhost` — Tauri's IPC transport, with the same platform split as
    the asset protocol. Without it every `invoke()` is blocked.
  - `base-uri 'self'` and `form-action 'none'` — spelled out because, unlike the directives above, these two
    have no fallback to `default-src`.

### Asset protocol scope

The static scope in `tauri.conf.json` allows `$RESOURCE/**` and nothing else.

Everything the UI actually loads through `convertFileSrc` is granted at runtime, in `src-tauri/src/asset_scope.rs`.

Note that grants are never taken back: Tauri's scope API can add allowed patterns but not remove them, so a
directory removed from the settings stays readable for the rest of the session. Only the next start rebuilds the
scope from the then-current `settings.json`. That is acceptable — what stays granted is a directory the user had
configured themselves, not the whole home directory.

### Only the user picks directories

The web view can invoke any command with any argument, so a path in a command argument means nothing on its own —
`storeSettings({ photoDirs: ['/'] })` would otherwise hand out the whole file system, and `exportPhoto` would write
wherever it liked.

`src-tauri/src/user_dirs.rs` therefore keeps the set of directories the user actually chose: seeded from
`settings.json` at startup, extended by the two native folder dialogs in `src-tauri/src/commands/fs.rs`. Everything
else is checked against that set:

  - `store_settings` refuses a `photoDirs` entry that is not in it. This is what stops a poisoned `settings.json`
    from granting a directory on the *next* start.
  - `export_photo` refuses a `folderPath` that is not in it, and refuses a `fileNamePrefix` containing a path
    separator — the prefix is free text from the export dialog and is pasted into the target file name.
  - `store_photo_work` refuses a `photoDir` that is not inside one of them. This one checks "inside" rather
    than "is", because it receives a photo's own directory, which is normally a subdirectory of a configured
    photo directory.

The rule for new code: a command that takes a directory from the frontend and writes to it must check it against
`UserDirs` first.


Code style
----------

Generally I think it's important to keep in mind why a codebase should follow a certain code style. In my opinion the
answer is: to make the code easier to read. Therefore I prefer rules arguing with readability over strict rules only
allowing one strict format.

  - Use english in all code files.
  - Indent with 4 spaces
  - String quotes: In TypeScript use single quotes for strings. But the others may be used if it makes the code more readable (e.g. by avoiding escaping).
  - In JavaScript/TypeScript: Avoid semicolons after statements.
  - No EOL spaces: The code should not contain EOL white space. But if there already is EOL white space, this can be fixed if the code is changed the next time (since it doesn't really affect readability - small diffs are more important here).
  - Trailing commas are optional. I add trailing commas if I think it's likely that the list gets more attributes in the future (which then can be added with a smaller diff).
  - Break lines after 120 characters: All code should be readable without horizontal scrolling.
      - For parameter lists I add the normal indentation (4 spaces) for each new line and I put the `{` of the method body
        unindented, so the parameter list and the function body are visually separated
        (the same applies for if statements and similar):

        ```TypeScript
        class MyClass {

            doStuff(param1: number, param2: string,
                param3: boolean): string
            {
                return ...
            }

        }
        ```


CSS naming conventions
----------------------

Inspired by: [SUIT CSS naming conventions](https://github.com/suitcss/suit/blob/master/doc/naming-conventions.md)

CSS example:

```css
// Component:
// - CamelCase uppercase
.MyComponent { ... }

// Status:
// - camelCase lowercase with prefix `is` or `has`
// - Always combined with another class
.MyComponent.isExpanded { ... }

// Component children:
// - camelCase lowercase with component name plus a minus as prefix
.MyComponent-header { ... }
```

less template:

```less
// Component
.MyComponent {
    ...

    // Status
    &.isExpanded {
        ...
    }
}

// Component child
.MyComponent-header {
    ...
}
```

HTML example:

```html
<div class="MyComponent isExpanded">
    <div class="MyComponent-header">...</div>
</div>
```
