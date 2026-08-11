import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [
        react(),
    ],
    resolve: {
        alias: {
            app:       path.resolve(__dirname, 'src/app'),
            common:    path.resolve(__dirname, 'src/common'),
            'test-ui': path.resolve(__dirname, 'src/test-ui'),
        },
        extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    server: {
        port: 3030,
        strictPort: true,
        watch: {
            // Never watch the Rust side: `cargo tauri dev` rewrites executables under `src-tauri/target`
            // while they are open, which makes the Windows file watcher fail with EBUSY and kills the
            // dev server. Rust changes are watched by the Tauri CLI itself.
            ignored: ['**/src-tauri/**'],
        },
    },
    build: {
        // Tauri uses Chromium / WebKit which support modern JS – no need to target legacy browsers.
        target: ['es2021', 'chrome105', 'safari15'],
        // Prevent Vite from obscuring Rust-side errors in development.
        //minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
        //sourcemap: !!process.env.TAURI_ENV_DEBUG,
        sourcemap: 'inline',
        rollupOptions: {
            input: {
                // Must match the HTML files at the repo root.
                app:       path.resolve(__dirname, 'index.html'),
                'test-ui': path.resolve(__dirname, 'test-ui.html'),
            },
        },
        assetsInlineLimit: 10_000,  // 10 kB threshold for asset inlining.
    },
    css: {
        // Blueprint 3's shipped CSS contains spec-invalid selectors (e.g. `::after.bp3-active`),
        // which the default lightningcss minifier rejects with a hard error. errorRecovery downgrades
        // these to warnings so the build succeeds (browsers already tolerate the selectors).
        lightningcss: {
            errorRecovery: true,
        },
    },
    define: {
        'window.PICTURAMA_DEV_MODE': JSON.stringify(process.env.PICTURAMA_DEV_MODE ?? ''),
        // Absolute path to the test-data photos, injected so the UI Tester can build valid
        // `asset://` URLs (the asset protocol needs an absolute path within an allowed scope).
        __PICTURAMA_TEST_PHOTOS_DIR__: JSON.stringify(path.resolve(__dirname, 'submodules/test-data/photos')),
    },
})
