import { BrowserWindow, ipcMain } from 'electron'

import { Tag, ImportProgress, PhotoId, Photo, PhotoWork, PhotoRenderOptions, IpcErrorInfo, BinaryString } from 'common/CommonTypes'
import { assertMainProcess } from 'common/util/ElectronUtil'
import { Size } from 'common/util/GeometryTypes'
import { decodeIpcError } from 'common/util/IpcUtil'


assertMainProcess()


interface CallInfo {
    resolve(result: any): void
    reject(error: any): void
}


let mainWindow: BrowserWindow | null = null

let isInitialized = false
let nextCallId = 1
const pendingCalls: { [key:number]: CallInfo } = {}


export default {

    init(mainWin: BrowserWindow) {
        if (isInitialized) {
            throw new Error('ForegroundClient is already initialized')
        }
        isInitialized = true

        mainWindow = mainWin

        ipcMain.on('onForegroundActionDone', (event, callId: number, error: IpcErrorInfo | null, result: any | null) => {
            const callInfo = pendingCalls[callId]
            delete pendingCalls[callId]
            if (callInfo) {
                if (error) {
                    callInfo.reject(decodeIpcError(error))
                } else {
                    callInfo.resolve(result)
                }
            }
        })
    },

    showError(msg: string, error?: Error) {
        console.error(msg, error)
        const errorStack = error && error.stack
        callOnForeground('showError', { processName: 'background', msg, errorStack })
            .catch(error => {
                console.error('Showing background error failed', error)
            })
    },

    async onFullScreenChange(isFullScreen: boolean): Promise<void> {
        return callOnForeground('onFullScreenChange', { isFullScreen })
    },

    async showSettings(): Promise<void> {
        return callOnForeground('showSettings')
    },

    async setImportProgress(progress: ImportProgress | null, updatedTags: Tag[] | null): Promise<void> {
        return callOnForeground('setImportProgress', { progress, updatedTags })
    },

    async onPhotoTrashed(photoIds: PhotoId[], updatedTags: Tag[] | null): Promise<void> {
        return callOnForeground('onPhotoTrashed', { photoIds, updatedTags })
    },

    async renderPhoto(photo: Photo, photoWork: PhotoWork, maxSize: Size | null, options: PhotoRenderOptions): Promise<BinaryString> {
        return callOnForeground('renderPhoto', { photo, photoWork, maxSize, options })
    },

    async renderImage(imagePath: string, maxSize: Size | null, options: PhotoRenderOptions): Promise<BinaryString> {
        return callOnForeground('renderImage', { imagePath, maxSize, options })
    },
}


async function callOnForeground(action: string, params: any = null): Promise<any> {
    if (!isInitialized) {
        throw new Error('ForegroundClient is not yet initialized')
    }

    const callId = nextCallId++

    return new Promise<any>((resolve, reject) => {
        pendingCalls[callId] = { resolve, reject }
        if (!mainWindow) {
            reject(new Error('ForegroundClient not yet initialized'))
        } else {
            mainWindow.webContents.send('executeForegroundAction', callId, action, params)
        }
    })
}
