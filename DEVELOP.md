How to develop Picturama
========================



Directory structure
-------------------

    +-- dist/                 Build artifacts of the app (filled by `webpack`)
    +-- dist-package/         Build artifacts when creating distributable packages (filled by `electron-builder`)
    +-- doc/                  Resources used by documentation
    +-- migrations/           DB migration scripts
    +-- src/
        +-- app/              Code running in web view of main UI (TypeScript / React)
        +-- background/       The obsolete code which was running in main electron process (TODO: Remove after rust migration is finished)
        +-- common/           Shared code (TODO: Move to src/app)
        +-- package/          Resources needed for creating distributable packages (used by `electron-builder`)
        +-- static/           Static files to be copied directly to `dist`
        +-- test-jest/        Unit tests
        +-- test-jest-background/ Unit tests of the obsolete code which was running in main electron process (TODO: Port to Rust)
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
        +-- node-libraw/      Own fork of node-libraw
        +-- test-data/        Data used for testing



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

  - Toggle developer tools: `Shift`+`Ctrl`+`I` (On Mac: `Cmd`+`Shift`+`I`)
  - Toggle UI tester:       `Shift`+`Ctrl`+`T` (On Mac: `Cmd`+`Shift`+`T`)
  - Reload UI:              `Shift`+`Ctrl`+`R` (On Mac: `Cmd`+`Shift`+`R`)



Developing main process code
----------------------------

If you change code that runs in the main process, you have to restart Picturama each time in order to see your changes.
Here's how you can use a watch build in order to reduce turnaround time:

1. Run watch build (in extra console):

        npm run watch

2. Change your code.

3. Restart Picturama without building (since building is done by the watch):

        npm run start-no-build



Debug main process
------------------

Main process debugging is already pre-configured in `.vscode/launch.json`.

So debugging is easy:

1. Open project in [VS Code](https://code.visualstudio.com/)

2. Start debugging in the Debug View



Unit tests
----------

Run unit tests:

    npm run test

Run unit tests in watch mode:

    npm run test:watch

Run a single test in watch mode (example runs test `simple import`):

    npx jest -t 'simple import' --watch

Clean test cache:

    npm run test:clean



UI Tester
---------

1. Run watch build:

        npm run watch

2. Run Picturama (in extra console):

        npm run start-no-build

3. Open the UI Tester: `Shift`+`Ctrl`+`T` (On Mac: `Alt`+`Cmd`+`T`)

4. Change some React code and save

5. Wait for the watch build to build the changes

6. Reload UI Tester: `Shift`+`Ctrl`+`R` (On Mac: `Cmd`+`Shift`+`R`)



Add missing attributes to localization files
--------------------------------------------

Add missing attributes to `src/common/i18n/text_*.ts`:

    npm run i18n



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

    npm run release

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
  - `package.json` - Defines languages available in mac package (see key `electronLanguages`)
  - `src/common/i18n/i18n.ts` - Defines available languages and provides the I18N logic
  - `src/common/i18n/text_*.ts` - Holds the I18N messages for each language



Icons
-----

Used icon libs:

  - [Blueprint icons](https://blueprintjs.com/docs/#icons) - using `@blueprintjs/icons`
  - [Font Awesome](https://fontawesome.com/icons) - using `react-icons/fa`
  - [Material Design](https://material.io/tools/icons/) - using `react-icons/md`



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
