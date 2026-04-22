import os from 'os'
import { app, screen, BrowserWindow } from 'electron'
import DB, { DBOptions } from 'sqlite3-helper/no-generators'
import { install as initSourceMapSupport } from 'source-map-support'

import { WindowStyle } from 'common/CommonTypes'
import config from 'common/config'
import { setLocale } from 'common/i18n/i18n'

import AppWindowController from 'background/AppWindowController'
import MainMenu from 'background/MainMenu'
//import Usb from 'background/usb'
//import Watch from 'background/watch'
import { init as initBackgroundService, onBackgroundReady } from 'background/BackgroundService'
import ForegroundClient from 'background/ForegroundClient'
import { fsUnlink, fsUnlinkDeep, fsMkDirIfNotExists, fsExists, fsRename } from 'background/util/FileUtil'


initSourceMapSupport()

let initDbPromise: Promise<any> | null = null
let mainWindow: BrowserWindow | null = null


process.on('SIGINT', () => {
    app.quit()
})

app.on('window-all-closed', () => {
    // if (process.platform !== 'darwin')
    app.quit()
})

app.on('ready', () => {
    const locale = app.getLocale()
    setLocale(locale)

    let cursorPos = screen.getCursorScreenPoint()
    let workAreaSize = screen.getDisplayNearestPoint(cursorPos).workAreaSize

    app.setName('Picturama')

    const platform = os.platform()
    const windowStyle: WindowStyle = platform === 'darwin' ? 'nativeTrafficLight' : 'windowsButtons'  // TODO
    const hasNativeMenu = platform === 'darwin'

    let icon: string | undefined = undefined
    if (platform === 'linux') {
        // Workaround for Linux: Setting the icon is buggy in electron-builder
        // See: https://github.com/electron-userland/electron-builder/issues/2577
        // Using the 1024x1024 icon makes the icon look bad (Ubuntu doesn't use anti-aliasing - at least for big icons)
        // -> We use a 128x128 px icon
        icon = __dirname + '/icon_128.png'
    }

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
        width: 1356,
        height: 768,
        icon,
        title: 'Picturama',
        backgroundColor: '#37474f',  // @blue-grey-800
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
        }
    }
    if (windowStyle === 'nativeTrafficLight') {
        windowOptions.titleBarStyle = 'hiddenInset'
    } else {
        windowOptions.frame = false
    }
    mainWindow = new BrowserWindow(windowOptions)
    const mainMenu = hasNativeMenu ? new MainMenu(mainWindow) : null

    if (workAreaSize.width <= 1366 && workAreaSize.height <= 768) {
        mainWindow.maximize()
    }

    mainWindow.loadURL('file://' + __dirname + '/app.html')
    mainWindow.setTitle('Picturama')
    AppWindowController.init(mainWindow)
    initBackgroundService(mainWindow, { version: config.version, platform, windowStyle, hasNativeMenu, locale })
    ForegroundClient.init(mainWindow)

    //let usb = new Usb()
    //
    //usb.scan((err, drives) => {
    //  mainWindow.webContents.send('scanned-devices', drives)
    //})
    //
    //usb.watch((err, action, drive) => {
    //  if (action === 'add')
    //    mainWindow.webContents.send('add-device', drive)
    //  else
    //    mainWindow.webContents.send('remove-device', drive)
    //})

    mainWindow.on('enter-full-screen', () => ForegroundClient.onFullScreenChange(true))
    mainWindow.on('leave-full-screen', () => ForegroundClient.onFullScreenChange(false))
    mainWindow.on('closed', () => { mainWindow = null })

    initDb()
        .then(() => {
            mainMenu?.onBackgroundReady()
            onBackgroundReady()
        })
        .catch(error => {
            ForegroundClient.showError('Initializing failed', error)
        })
})


function initDb(): Promise<any> {
    if (!initDbPromise) {
        const dbOptions: DBOptions = { path: config.dbFile, migrate: false }
        initDbPromise =
            (async() => {
                if (await fsExists(config.anselHomeDir)) {
                    await fsRename(config.anselHomeDir, config.picturamaHomeDir)
                }
                await fsMkDirIfNotExists(config.picturamaHomeDir)
                await Promise.all([
                    fsMkDirIfNotExists(config.tmp),
                    fsMkDirIfNotExists(config.nonRawPath),
                    fsMkDirIfNotExists(config.thumbnailPath),
                ])

                return DB(dbOptions)
                    .queryFirstCell<boolean>('SELECT 1 FROM sqlite_master WHERE type="table" AND name="knex_migrations"')
            })()
            .then(async (isLegacyDb) => {
                if (isLegacyDb) {
                    // This is a DB created with bookshelf.js and knex.js (before 2019-08-11)
                    // -> Delete the DB and create a new one
                    console.warn('Picturama database is a legacy database - creating a new one')
                    await Promise.all([
                        DB().close()
                            .then(() => fsUnlink(config.dbFile)),
                        fsUnlinkDeep(`${config.picturamaHomeDir}/non-raw`),
                        fsUnlinkDeep(`${config.picturamaHomeDir}/thumbs`),
                        fsUnlinkDeep(`${config.picturamaHomeDir}/thumbs-250`),
                        fsUnlinkDeep(`${config.picturamaHomeDir}/thumbnails`),
                    ])
                    DB(dbOptions)
                }
            })
            .then(async () => {
                await DB().connection()
                await DB().migrate({
                    force: false,
                    migrationsPath: config.dbMigrationsFolder
                })
            })
    }

    return initDbPromise
}
