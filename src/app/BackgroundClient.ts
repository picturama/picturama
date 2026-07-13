import { invoke } from '@tauri-apps/api/core'

import {
    DecodedHeifImage,
    EmptyTrashResult,
    ExifData,
    MetaData,
    Photo,
    PhotoDetail,
    PhotoExportOptions,
    PhotoFilter,
    PhotoId,
    PhotoSection,
    PhotoSectionId,
    PhotoSet,
    PhotoWork,
    Settings,
    Tag,
    UiConfig,
} from 'common/CommonTypes'


// Command names are converted from camelCase to snake_case because Tauri expects Rust-style command names.
const toSnakeCase = (s: string): string =>
    s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

async function invokeCommand<T>(action: string, payload?: unknown): Promise<T> {
    let result: T
    try {
        result = await invoke(toSnakeCase(action), payload ?? {})
    } catch (error) {
        throw new Error(`Invoking ${action} on background failed: ${error}`)
    }
    return result
}

const BackgroundClient = {
    onBeforeRenderUi(payload: { locale: string, localeTexts: Record<string, string> }): Promise<void> {
        return invokeCommand('onBeforeRenderUi', payload)
    },

    toggleFullScreen(): Promise<void> {
        return invokeCommand('toggleFullScreen')
    },

    toggleDevTools(): Promise<void> {
        return invokeCommand('toggleDevTools')
    },

    toggleUiTester(): Promise<void> {
        return invokeCommand('toggleUiTester')
    },

    reloadUi(): Promise<void> {
        return invokeCommand('reloadUi')
    },

    fetchUiConfig(): Promise<UiConfig> {
        return invokeCommand('fetchUiConfig')
    },

    fetchSettings(): Promise<Settings> {
        return invokeCommand('fetchSettings')
    },

    storeSettings(settings: Settings): Promise<void> {
        return invokeCommand('storeSettings', { settings })
    },

    fileExists(path: string): Promise<boolean> {
        return invokeCommand('fileExists', { path })
    },

    getFileSize(path: string): Promise<number> {
        return invokeCommand('getFileSize', { path })
    },

    showItemInFolder(fullPath: string): Promise<void> {
        return invokeCommand('showItemInFolder', { fullPath })
    },

    readMetadataOfImage(imagePath: string): Promise<MetaData> {
        return invokeCommand('readMetadataOfImage', { imagePath })
    },

    getExifData(path: string): Promise<ExifData | null> {
        return Promise.resolve(null)
    },

    async loadHeifFile(path: string): Promise<DecodedHeifImage> {
        // The command returns raw bytes (an 8-byte little-endian header with width/height, then the
        // interleaved RGB8 pixels) as an ArrayBuffer, avoiding a > 100 MB JSON number array.
        const buf = await invokeCommand<ArrayBuffer>('loadHeifFile', { path })
        const header = new DataView(buf)
        const width = header.getUint32(0, true)
        const height = header.getUint32(4, true)
        const data = new Uint8Array(buf, 8) // view over the pixel bytes, no copy
        return { width, height, data }
    },

    extractRawPreviewJpg(path: string): Promise<ArrayBuffer> {
        return invokeCommand<ArrayBuffer>('extractRawPreviewJpg', { path })
    },

    selectScanDirectories(): Promise<string[] | undefined> {
        return invokeCommand('selectScanDirectories')
    },

    selectExportDirectory(): Promise<string | undefined> {
        return invokeCommand('selectExportDirectory')
    },

    startImport(): Promise<void> {
        return invokeCommand('startImport')
    },

    toggleImportPaused(): Promise<void> {
        return invokeCommand('toggleImportPaused')
    },

    cancelImport(): Promise<void> {
        return invokeCommand('cancelImport')
    },

    fetchTotalPhotoCount(): Promise<number> {
        return invokeCommand('fetchTotalPhotoCount')
    },

    fetchSections(filter: PhotoFilter, sectionIdsToKeepLoaded?: PhotoSectionId[]): Promise<PhotoSection[]> {
        return invokeCommand('fetchSections', { filter, sectionIdsToKeepLoaded })
    },

    fetchSectionPhotos(sectionIds: PhotoSectionId[], filter: PhotoFilter): Promise<PhotoSet[]> {
        return invokeCommand('fetchSectionPhotos', { sectionIds, filter })
    },

    updatePhotos(photoIds: PhotoId[], update: Partial<Photo>): Promise<void> {
        return invokeCommand('updatePhotos', { photoIds, update })
    },

    emptyTrash(): Promise<EmptyTrashResult> {
        return invokeCommand('emptyTrash')
    },

    fetchPhotoDetail(photoId: PhotoId): Promise<PhotoDetail> {
        return invokeCommand('fetchPhotoDetail', { photoId })
    },

    fetchPhotoWorkOfPhoto(photo: Photo): Promise<PhotoWork> {
        return invokeCommand('fetchPhotoWorkOfPhoto', { photo })
    },

    storePhotoWork(photoDir: string, photoFilename: string, photoWork: PhotoWork): Promise<void> {
        return invokeCommand('storePhotoWork', { photoDir, photoFilename, photoWork })
    },

    createThumbnail(photo: Photo): Promise<void> {
        return invokeCommand('createThumbnail', { photo })
    },

    deleteThumbnail(photoId: PhotoId): Promise<void> {
        return invokeCommand('deleteThumbnail', { photoId })
    },

    fetchTags(): Promise<Tag[]> {
        return invokeCommand('fetchTags')
    },

    storePhotoTags(photoId: PhotoId, photoTags: string[]): Promise<Tag[] | null> {
        return invokeCommand('storePhotoTags', { photoId, photoTags })
    },

    exportPhoto(photo: Photo, photoIndex: number, options: PhotoExportOptions): Promise<void> {
        return invokeCommand('exportPhoto', { photo, photoIndex, options })
    },
}

export default BackgroundClient
