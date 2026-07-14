#!/usr/bin/env node
// Platform-aware build and packaging of the Picturama release version.
//
// `tauri build` only emits installers for the host OS, so this script is run once per platform.
// Its extra job over a plain `tauri build` is bundling the native `libheif` stack into the artifact
// so the app decodes HEIC on machines without a system libheif:
//
//   - Linux:   AppImage. Tauri's bundler runs `linuxdeploy`, which copies the binary's NEEDED shared
//              libs (libheif + libde265/aom/dav1d) into the AppDir automatically. Nothing extra to do.
//   - Windows: NSIS. The codec DLLs are staged into `src-tauri/libs/windows/` here and installed next
//              to `Picturama.exe` via `bundle.resources` (see `tauri.windows.conf.json`).
//   - macOS:   Build the `.app`, run `dylibbundler` to copy+relink the dylibs into
//              `Contents/Frameworks`, then create the `.dmg` from the fixed app.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
const tauriDir = join(repoRoot, 'src-tauri')
const forwardedArgs = process.argv.slice(2)

const version = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8')).version

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  if (res.status !== 0) {
    console.error(`\n✖ Command failed: ${cmd} ${args.join(' ')}`)
    process.exit(res.status ?? 1)
  }
}

function tauriBuild(bundles) {
  run('npx', ['tauri', 'build', '--bundles', bundles, ...forwardedArgs], { cwd: repoRoot })
}

function bundleDir(...parts) {
  return join(tauriDir, 'target', 'release', 'bundle', ...parts)
}

// Logs a build-step title.
function step(title) {
  console.log(`\x1b[1;36m▶ ${title}\x1b[0m`)
    // ANSI bold (1) + cyan (36), reset (0)
}

// ── Linux ────────────────────────────────────────────────────────────────────────────────────────
function releaseLinux() {
  step('Building AppImage')
  tauriBuild('appimage')
  console.log(`\n✓ AppImage written to ${bundleDir('appimage')}`)
}

// ── Windows ──────────────────────────────────────────────────────────────────────────────────────
function releaseWindows() {
  // Stage the libheif codec DLLs so `bundle.resources` (tauri.windows.conf.json) installs them next to
  // the exe. Sourced from a vcpkg install (`vcpkg install libheif`). Point VCPKG_ROOT at the vcpkg dir.
  step('Staging libheif DLLs')
  const vcpkgRoot = process.env.VCPKG_ROOT
  const stageDir = join(tauriDir, 'libs', 'windows')
  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })

  if (!vcpkgRoot) {
    console.error('✖ VCPKG_ROOT is not set — cannot locate the libheif DLLs to bundle.')
    console.error('  Install with `vcpkg install libheif` and set VCPKG_ROOT to your vcpkg directory.')
    process.exit(1)
  }
  const vcpkgBin = join(vcpkgRoot, 'installed', 'x64-windows', 'bin')
  // libheif + its transitive codec deps. Names as produced by vcpkg (x64-windows triplet).
  const wanted = ['heif.dll', 'libde265.dll', 'aom.dll', 'dav1d.dll', 'x265.dll']
  let staged = 0
  for (const name of readdirSync(vcpkgBin)) {
    if (wanted.includes(name) || name.startsWith('heif')) {
      copyFileSync(join(vcpkgBin, name), join(stageDir, name))
      staged++
    }
  }
  if (staged === 0) {
    console.error(`✖ No libheif DLLs found in ${vcpkgBin}. Is libheif installed via vcpkg?`)
    process.exit(1)
  }
  console.log(`Staged ${staged} DLL(s) from ${vcpkgBin} → ${stageDir}`)

  step('Building NSIS installer')
  tauriBuild('nsis')
  console.log(`\n✓ NSIS installer written to ${bundleDir('nsis')}`)
}

// ── macOS ────────────────────────────────────────────────────────────────────────────────────────
function releaseMac() {
  // 1. Build only the .app (the .dmg would be made from the un-fixed app, so we make it ourselves later).
  step('Building app bundle')
  const macosDir = bundleDir('macos')
  tauriBuild('app')

  const appPath = join(macosDir, 'Picturama.app')
  if (!existsSync(appPath)) {
    console.error(`✖ Expected app bundle not found at ${appPath}`)
    process.exit(1)
  }

  // 2. Collect + relink libheif and its deps into Contents/Frameworks, rewriting the binary's absolute
  //    Homebrew load paths to @executable_path/../Frameworks/… so the app runs on Macs without Homebrew.
  const exe = join(appPath, 'Contents', 'MacOS', 'Picturama')
  const frameworks = join(appPath, 'Contents', 'Frameworks')
  step('Bundling libheif dylibs')
  run('dylibbundler', [
    '--overwrite-dir', '--bundle-deps', '--create-dir',
    '--fix-file', exe,
    '--dest-dir', frameworks,
    '--install-path', '@executable_path/../Frameworks/'
  ])

  // 3. Collapse duplicate LC_RPATHs. dylibbundler adds `@executable_path/../Frameworks/` more than once to a
  //    lib several bundled libs depend on (e.g. libde265, used by libheif). MacOS 15+/26 dyld aborts at launch
  //    on a *duplicate* LC_RPATH ("Library not loaded … Library missing"). Delete every copy from the binary
  //    and each dylib, then add exactly one back on the executable. The install names are already
  //    @executable_path-anchored, so this one rpath is just belt-and-suspenders for any @rpath reference.
  step('Normalizing rpaths')
  const rpath = '@executable_path/../Frameworks/'
  const dylibs = existsSync(frameworks)
    ? readdirSync(frameworks).filter(n => n.endsWith('.dylib')).map(n => join(frameworks, n))
    : []
  for (const f of [exe, ...dylibs]) {
    while (spawnSync('install_name_tool', ['-delete_rpath', rpath, f], { stdio: 'ignore' }).status === 0) { /**/ }
  }
  spawnSync('install_name_tool', ['-add_rpath', rpath, exe], { stdio: 'ignore' })
  // install_name_tool invalidates the ad-hoc code signature; re-sign the bundle (nested code first via --deep)
  // or dyld would reject the modified images.
  run('codesign', ['--force', '--deep', '--sign', '-', appPath])

  // 4. Create the .dmg from the fixed .app.
  step('Creating DMG')
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
  const dmgDir = bundleDir('dmg')
  mkdirSync(dmgDir, { recursive: true })
  const dmgPath = join(dmgDir, `Picturama_${version}_${arch}.dmg`)
  rmSync(dmgPath, { force: true })

  // Prefer `create-dmg` (Homebrew / andreyvit) for better layout with background image + a
  // drag-to-applications link. Falls back to a plain hdiutil image if create-dmg is missing.
  const hasCreateDmg = spawnSync('which', ['create-dmg']).status === 0
  if (hasCreateDmg) {
    // Retina display support: Combine the 1x + @2x PNGs into a multi-resolution TIFF
    const bgHidpi = join(tmpdir(), 'picturama-dmg-background.tiff')
    run('tiffutil', ['-cathidpicheck',
      join(tauriDir, 'dmg', 'background.png'),
      join(tauriDir, 'dmg', 'background@2x.png'),
      '-out', bgHidpi
    ])
    run('create-dmg', [
      '--volname', 'Picturama',
      '--background', bgHidpi,
      '--window-size', '540', '380',
      '--icon-size', '128',
      '--icon', 'Picturama.app', '140', '190',
      '--app-drop-link', '400', '190',
      '--hide-extension', 'Picturama.app',
      dmgPath, macosDir
    ])
  } else {
    console.warn('⚠ create-dmg not found — falling back to a plain hdiutil image (no background / no ' +
                 'Applications link). Install it with `brew install create-dmg` for the full layout.')
    run('hdiutil', ['create', '-volname', 'Picturama', '-srcfolder', appPath, '-ov', '-format', 'UDZO', dmgPath])
  }
  console.log('\n')
  step(`✓ DMG written to ${dmgPath}`)
}

// Clean the bundle output from previous runs before building. Cheap — this only removes finished artifacts
// (installers, the macOS `.app` with its injected Frameworks, staged libs), NOT the compiled Rust objects in
// target/release, so it does not trigger a recompile. Run `npm run clean` first if you want a full rebuild.
// Prevents stale-artifact bugs such as a duplicate `@executable_path/../Frameworks/` LC_RPATH accumulating in
// the macOS Frameworks across re-runs (which macOS 15+/26 dyld rejects at launch as "Library missing").
step('Cleaning bundle output')
rmSync(bundleDir(), { recursive: true, force: true })

switch (process.platform) {
  case 'linux':
    releaseLinux()
    break
  case 'win32':
    releaseWindows()
    break
  case 'darwin':
    releaseMac()
    break
  default:
    console.error(`✖ Unsupported platform: ${process.platform}`)
    process.exit(1)
}
