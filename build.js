const fs = require('fs')
const path = require('path')
const { build, cliopts, scandir, watch } = require('estrella')
const { lessLoader } = require('esbuild-plugin-less')


const isProductionBuild = process.env.NODE_ENV === 'production'

const commonConfig = {
    bundle: true,
    assetNames: 'assets/[name]-[hash]',
    sourcemap: 'external',
    minify: isProductionBuild,
    logLevel: 'error'
        // Suppress annoying `require` warnings
        // TODO: Remove this option after estrella switched to newer esbuild version
        //       See: https://github.com/evanw/esbuild/pull/1155
}

const commonClientConfig = {
    ...commonConfig,
    platform: 'browser',
    plugins: [
        lessLoader(), // { paths: [ 'node_modules', 'src' ] }
            // Currently `esbuild-plugin-less` is pinned to version 1.0.2, since newer versions don't work with the old
            // version of esbuild which is used by estrella.
            // Maybe after estrella updated esbuild, we could update `esbuild-plugin-less` and get rid of all these
            // resolving workarounds.
        {
            name: 'resolve-stuff',
            setup(build) {
                // Resolve CSS loaded by less (e.g. in src/app/entry.less)
                build.onResolve({ filter: /\.css$/ }, args => {
                    if (!args.namespace === 'less') {
                        throw new Error(`Expected ${args.path} to be imported by less`)
                    }
                    return {
                        path: path.join(__dirname, 'node_modules', args.path.substring(args.resolveDir.length))
                    }
                })

                // Resolve fonts loaded by fontawesome (which is loaded by less in src/app/entry.less)
                const fontawesomeFontRegex = /(fontawesome-webfont\.(eot|woff|woff2|ttf|svg))(\?.*)?$/
                build.onResolve({ filter: fontawesomeFontRegex }, args => {
                    const match = fontawesomeFontRegex.exec(args.path)
                    return {
                        path: path.join(__dirname, 'node_modules/font-awesome/fonts', match[1])
                    }
                })
            }
        }
    ],
    loader: {
        '.woff': 'file',
        '.woff2': 'file',
        '.eot': 'file',
        '.svg': 'file',
        '.ttf': 'file',
    },
    define: {
        'global': 'window',
        'process.env.NODE_ENV': isProductionBuild ? '"production"' : '"development"',
        'process.env.BLUEPRINT_NAMESPACE': 'undefined',
        'process.env.REACT_APP_BLUEPRINT_NAMESPACE': 'undefined',
    },
    external: [ 'child_process', 'crypto', 'events', 'fs', 'net', 'os', 'readline', 'util', 'url', 'path' ]
}

{
    const fromPath = 'src/static'
    const toPath = 'dist'
    const filter = /\..*$/i

    function copyStatic(file) {
        //console.log(`Copying ${fromPath}/${file} -> ${toPath}/${file}`)
        fs.copyFile(path.join(__dirname, fromPath, file), path.join(__dirname, toPath, file), err => {
            if (err) throw err
        })
    }

    scandir(fromPath, filter, { recursive:true }).then(files => {
        files.map(copyStatic)
    
        if (cliopts.watch) {
            watch(fromPath, { filter, recursive:true }, changes => {
                changes.map(change => copyStatic(change.name))
            })
        }
    })
}

build({
    ...commonConfig,
    platform: 'node',
    entryPoints: [ 'src/background/entry.ts' ],
    outfile: 'dist/background.js',
    external: [
        '*/build/Release/node_libraw',
        'electron' // Needs to be external, so `getElectronPath` of `node_modules/electron/index.js` uses the right directory
    ]
})

build({
    ...commonClientConfig,
    entryPoints: [ 'src/app/entry.tsx' ],
    outfile: 'dist/app.js'
})

build({
    ...commonClientConfig,
    entryPoints: [ 'src/test-ui/entry.tsx' ],
    outfile: 'dist/test-ui.js'
})
