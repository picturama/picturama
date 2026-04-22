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
    define: {
        'window.PICTURAMA_DEV_MODE': JSON.stringify(process.env.PICTURAMA_DEV_MODE ?? ''),
    },
})
