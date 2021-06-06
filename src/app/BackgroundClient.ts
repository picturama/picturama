import { ipcRenderer } from 'electron'

import { UiConfig, Settings, PhotoSet, PhotoExportOptions, IpcErrorInfo, MetaData, ExifData, DecodedHeifImage } from 'common/CommonTypes'
import { PhotoId, Photo, PhotoDetail, PhotoWork, PhotoFilter, PhotoSection, PhotoSectionId, Tag } from 'common/CommonTypes'
import { assertRendererProcess } from 'common/util/ElectronUtil'
import { decodeIpcError } from 'common/util/IpcUtil'


assertRendererProcess()


// We used to use electron.require for this, but it was too buggy.
// (I passed a value to an IPC stub and the other side got a value from a previous call)


interface CallInfo {
    resolve(result: any)
    reject(error: any)
}


let isInitialized = false
let nextCallId = 1
const pendingCalls: { [key:number]: CallInfo } = {}


export default {

    init() {
        if (isInitialized) {
            throw new Error('BackgroundClient is already initialized')
        }
        isInitialized = true
        ipcRenderer.on('onBackgroundActionDone', (event, callId: number, error: IpcErrorInfo | null, result: any | null) => {
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

    waitForBackgroundReady(): Promise<void> {
        return callOnBackground('waitForBackgroundReady')
    },

    toggleFullScreen(): Promise<void> {
        return callOnBackground('toggleFullScreen')
    },

    toggleUiTester(): Promise<void> {
        return callOnBackground('toggleUiTester')
    },

    reloadUi(): Promise<void> {
        return callOnBackground('reloadUi')
    },

    fetchUiConfig(): Promise<UiConfig> {
        return callOnBackground('fetchUiConfig')
    },

    fetchSettings(): Promise<Settings> {
        return callOnBackground('fetchSettings')
    },

    storeSettings(settings: Settings) {
        return callOnBackground('storeSettings', { settings })
    },

    fileExists(path: string): Promise<boolean> {
        return callOnBackground('fileExists', { path })
    },

    getFileSize(path: string): Promise<number> {
        return callOnBackground('getFileSize', { path })
    },

    showItemInFolder(fullPath: string): Promise<void>  {
        return callOnBackground('showItemInFolder', { fullPath })
    },

    readMetadataOfImage(imagePath: string): Promise<MetaData> {
        return callOnBackground('readMetadataOfImage', { imagePath })
    },

    getExifData(path: string): Promise<ExifData | null> {
        return callOnBackground('getExifData', { path })
    },

    loadHeifFileSupported(): Promise<boolean> {
        return callOnBackground('loadHeifFileSupported')
    },

    loadHeifFile(path: string): Promise<DecodedHeifImage> {
        return callOnBackground('loadHeifFile', { path })
    },

    selectScanDirectories(): Promise<string[] | undefined> {
        return callOnBackground('selectScanDirectories')
    },

    selectExportDirectory(): Promise<string | undefined> {
        return callOnBackground('selectExportDirectory')
    },

    startImport(): Promise<void> {
        return callOnBackground('startImport')
    },

    toggleImportPaused(): Promise<void> {
        return callOnBackground('toggleImportPaused')
    },

    cancelImport(): Promise<void> {
        return callOnBackground('cancelImport')
    },

    fetchTotalPhotoCount(): Promise<number> {
        return callOnBackground('fetchTotalPhotoCount')
    },

    fetchSections(filter: PhotoFilter, sectionIdsToKeepLoaded?: PhotoSectionId[]): Promise<PhotoSection[]> {
        return callOnBackground('fetchSections', { filter, sectionIdsToKeepLoaded })
    },

    fetchSectionPhotos(sectionIds: PhotoSectionId[], filter: PhotoFilter): Promise<PhotoSet[]> {
        return callOnBackground('fetchSectionPhotos', { sectionIds, filter })
    },

    updatePhotos(photoIds: PhotoId[], update: Partial<Photo>): Promise<void> {
        return callOnBackground('updatePhotos', { photoIds, update })
    },

    fetchPhotoDetail(photoId: PhotoId): Promise<PhotoDetail> {
        return callOnBackground('fetchPhotoDetail', { photoId })
    },

    fetchPhotoWorkOfPhoto(photo: Photo): Promise<PhotoWork> {
        return callOnBackground('fetchPhotoWorkOfPhoto', { photo })
    },

    storePhotoWork(photoDir: string, photoFileName: string, photoWork: PhotoWork): Promise<void> {
        return callOnBackground('storePhotoWork', { photoDir, photoFileName, photoWork })
    },

    createThumbnail(photo: Photo): Promise<void> {
        return callOnBackground('createThumbnail', { photo })
    },

    deleteThumbnail(photoId: PhotoId): Promise<void> {
        return callOnBackground('deleteThumbnail', { photoId })
    },

    fetchTags(): Promise<Tag[]> {
        return callOnBackground('fetchTags')
    },

    storePhotoTags(photoId: PhotoId, photoTags: string[]): Promise<Tag[] | null> {
        return callOnBackground('storePhotoTags', { photoId, photoTags })
    },

    exportPhoto(photo: Photo, photoIndex: number, options: PhotoExportOptions): Promise<void> {
        return callOnBackground('exportPhoto', { photo, photoIndex, options })
    },
}

async function callOnBackground(action: string, params: any = null): Promise<any> {
    if (!isInitialized) {
        throw new Error('BackgroundClient is not yet initialized')
    }

    const callId = nextCallId++

    return new Promise<any>((resolve, reject) => {
        pendingCalls[callId] = { resolve, reject }
        ipcRenderer.send('executeBackgroundAction', callId, action, params)
    })
}
