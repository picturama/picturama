How to develop Picturama
========================


Directory structure
-------------------

    +-- dist/                 Build artifacts of the app (filled by `webpack`)
    +-- doc/                  Resources used by documentation
    +-- migrations/           DB migration scripts
    +-- src/
        +-- app/              Code running in web view of main UI (TypeScript / React)
        +-- image/            Source images
        +-- package/          Resources needed for creating distributable packages (used by `electron-builder`)
        +-- script/           Helper scripts
        +-- static/           Static files to be copied directly to `dist`
        +-- test-jest/        Unit tests
        +-- test-ui/          Code running in renderer electron process of UI Tester
        +-- typings/          TypeScript type definitions
    +-- src-tauri/            Code running on native side (Rust / Tauri)
        +-- dmg/              Background of DMG (MacOS package)
        +-- icons/            App icons (.icns for macOS, .ico for Windows, PNGs for Linux) 
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

  - Install node
  - Install Rust: https://rustup.rs
  - Install Tauri system dependencies (platform-specific):
    - See: https://tauri.app/start/prerequisites/
    - Mac OS:
      - Install Xcode and start it once. You can close Xcode after the "required components" have been installed.
      - `xcode-select --install`
    - Windows: Visual Studio Build Tools
    - Linux: `libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev`
  - Install `libheif` (native HEIC/HEIF decoding):
    - Mac OS: `brew install libheif`
    - Windows: `vcpkg install libheif` (and expose it to the linker, e.g. `VCPKG_ROOT` + the vcpkg toolchain)
    - Linux (Debian/Ubuntu): `sudo apt install libheif-dev`
  - Install Tauri CLI: `cargo install tauri-cli --version "^2"`

Fetch git submodules:

    git submodule update --init --recursive

Fetch dependencies and build and start Picturama:

    npm i
    npm start

Clean project:

    npm run clean

Development hotkeys:

  - Toggle developer tools: `Ctrl`+`Shift`+`I` (On Mac: `Alt`+`Cmd`+`I`)
  - Toggle UI tester:       `Ctrl`+`Shift`+`T` (On Mac: `Alt`+`Cmd`+`T`)
  - Reload UI:              `Ctrl`+`Shift`+`R` (On Mac: `Cmd`+`Shift`+`R`)


Unit tests
----------

Run unit tests:

    npm run test

Run unit tests in watch mode:

    npm run test:watch

Run a single test in watch mode (replace `my test`):

    npx jest -t 'my test' --watch


Build distributable package
---------------------------

### Prerequisites for a release build

In addition to the build prerequisites above, each platform needs `libheif` (and its codec dependencies)
available so it can be **bundled into the installer** — otherwise the app builds but crashes when decoding
HEIC on a machine without a system `libheif`:

  - **macOS:** `brew install libheif dylibbundler create-dmg`
    - `libheif` the library for decoding HEIC we want to embed
    — `dylibbundler` collects the dylibs for `Picturama.app` and rewrites the load paths
    - `create-dmg` produces the reference `.dmg` layout
  - **Windows:** `vcpkg install libheif`, then set the `VCPKG_ROOT` environment variable to your vcpkg
    directory (the release script copies `libheif.dll` + the codec DLLs from there to beside `Picturama.exe`).
  - **Linux:** `sudo apt install libheif-dev` (the AppImage bundler pulls the shared libs into the AppDir
    automatically — no further setup).

### Running release build

Run on the platform you want to build for:

    npm run clean && npm run release

This produces, in `src-tauri/target/release/bundle/`:

  - **macOS:**   `dmg/Picturama_<version>_<arch>.dmg` (and the `.app` under `macos/`)
  - **Windows:** `nsis/Picturama_<version>_<arch>-setup.exe`
  - **Linux:**   `appimage/Picturama_<version>_<arch>.AppImage`

Faster, unsigned local test build (skips optimisation):

    npm run release -- --debug

Bundling configuration lives in `src-tauri/tauri.conf.json` and `src-tauri/tauri.windows.conf.json` and the orchestrator
`src/script/release.mjs`. For platform details see: https://v2.tauri.app/distribute/


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

Everything the UI actually loads through `convertFileSrc` is granted at runtime, in `src-tauri/src/asset_scope.rs`:
the thumbnail cache and the configured photo directories on startup, and the photo directories again whenever the
settings are saved, so a newly added directory works without a restart.

Note that grants are never taken back: Tauri's scope API can add allowed patterns but not remove them, so a
directory removed from the settings stays readable for the rest of the session. Only the next start rebuilds the
scope from the then-current `settings.json`. That is acceptable — what stays granted is a directory the user had
configured themselves, not the whole home directory.


Code style
----------

Generally I think it's important to keep in mind why a codebase should follow a certain code style. In my opinion the
answer is: to make the code easier to read. Therefore I prefer rules arguing with readability over strict rules only
allowing one strict format.

  - Indent with 4 spaces
  - String quotes: In TypeScript use single quotes for strings. But the others may be used if it makes the code more readable (e.g. by avoiding escaping).
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
