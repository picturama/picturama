import { promisify } from 'util'
import moment from 'moment'
import BluebirdPromise from 'bluebird'
import { imageSize as getImageSizeWithCallback } from 'image-size'

import { Photo, ExifOrientation, ImportProgress, PhotoId } from 'common/CommonTypes'
import { profileScanner } from 'common/LogConstants'
import config from 'common/config'
import { hasExifOrientationSwitchedSides } from 'common/util/DataUtil'
import { bindMany } from 'common/util/LangUtil'
import Profiler from 'common/util/Profiler'

import ForegroundClient from 'background/ForegroundClient'
import { readMetadataOfImage } from 'background/MetaData'
import { fetchPhotoWork } from 'background/store/PhotoWorkStore'
import { fsReadDirWithFileTypes, fsStat, fsUnlink, fsExists, fsWriteFile } from 'background/util/FileUtil'

const getImageSize = promisify(getImageSizeWithCallback)


const acceptedExtensions = [ ...config.acceptedNonRawExtensions, ...config.acceptedHeicExtensions, ...config.acceptedRawExtensions ]

const acceptedRawExtensionRE = new RegExp(`\\.(${config.acceptedRawExtensions.join('|')})$`, 'i')
const acceptedExtensionRE = new RegExp(`\\.(${acceptedExtensions.join('|')})$`, 'i')

const uiUpdateInterval = 200  // In ms

let libraw: any | false | null = null

interface DirectoryInfo {
    path: string
    photoFilenames: string[]
    picasaOriginalSubDirs: PicasaOriginalDirectoryInfo[] | null
}

type PicasaOriginalDirectoryName = '.picasaoriginals' | 'Originals'
interface PicasaOriginalDirectoryInfo {
    dirName: PicasaOriginalDirectoryName
    photoFilenames: string[]
}


export type PhotoOfDirectoryInfo = { id: PhotoId, master_filename: string }

export interface ImportScannerDelegate {
    deletePhotosOfRemovedDirsFromDb(existingDirs: string[]): Promise<number>
    deletePhotosFromDb(photoIds: PhotoId[]): Promise<void>
    fetchPhotosOfDirectoryFromDb(dir: string): Promise<PhotoOfDirectoryInfo[]>
    nextTempRawConversionPaths(): { tempExtractThumbPath: string, tempNonRawImgPath: string }
    storePhotoInDb(masterFullPath: string, photo: Photo, tempNonRawImgPath: string | null, tags: string[]): Promise<void>
    updateProgressInUi(state: ImportScannerState, progress: ImportProgress): Promise<void>
    showError(msg: string, error?: Error): void
}

export type ImportScannerState = 'idle' | 'scan-dirs' | 'cleanup' | 'import-photos'

export default class ImportScanner {

    private state: ImportScannerState = 'idle'
    private shouldCancel = false
    private pausePromise: Promise<void> | null = null
    private resolvePause: (() => void) | null = null

    private importStartTime = 0

    private progress: ImportProgress
    private lastUIUpdateTime = 0
    private isUIUpdateRunning = false
    private needsFollowupUIUpdate = false


    constructor(private delegate: ImportScannerDelegate) {
        bindMany(this, 'processDirectory')
        this.reset()
    }

    private reset() {
        this.state = 'idle'
        this.shouldCancel = false
        this.pausePromise = null
        this.progress = {
            phase: 'scan-dirs',
            isPaused: false,
            total: 0,
            processed: 0,
            added: 0,
            removed: 0,
            currentPath: null
        }
    }

    scanPhotos(photoDirs: string[]): BluebirdPromise<ImportProgress | null> {
        if (this.state != 'idle') {
            // Already scanning
            return BluebirdPromise.resolve(null)
        }

        const startTime = Date.now()
        const profiler = profileScanner ? new Profiler('Import scanning') : null

        this.reset()
        this.state = 'scan-dirs'
        this.importStartTime = Date.now()
        this.progress.phase = 'scan-dirs'
        this.onProgressChange(true)

        if (libraw === null) {
            try {
                libraw = require('libraw')
            } catch (error) {
                libraw = false
                console.warn('libraw is not supported', error)
            }
        }

        const dirs: DirectoryInfo[] = []
        return BluebirdPromise.resolve(removeSubdirectories(photoDirs))
            .reduce(async (result: DirectoryInfo[], path) => {
                const pathExists = await fsExists(path)
                if (!pathExists) {
                    console.warn('Import path does not exist: ' + path)
                    return
                }

                const stats = await fsStat(path)
                if (!stats.isDirectory()) {
                    console.warn('Import path is no directory: ' + path)
                    return
                }

                await this.scanDirectory(result, path)

                return result
            }, dirs)
            .then(async () => {
                if (profiler) { profiler.addPoint(`Scanned directories (${this.progress.total} photos in ${dirs.length} directories)`) }

                // Delete photos of removed directories

                this.state = 'cleanup'
                this.progress.phase = 'cleanup'
                this.onProgressChange(true)

                const deletedPhotoCount = await this.delegate.deletePhotosOfRemovedDirsFromDb(dirs.map(dirInfo => dirInfo.path))
                this.progress.removed += deletedPhotoCount
                this.onProgressChange()
                if (profiler) { profiler.addPoint(`Deleted ${deletedPhotoCount} photos of removed directories`) }

                this.state = 'import-photos'
                this.progress.phase = 'import-photos'
                this.onProgressChange(true)

                return dirs
            })
            .map(this.processDirectory, { concurrency: config.concurrency })
            .then(() => {
                const finalProgress = this.progress
                const photoCount = finalProgress.total
                if (profiler) profiler.addPoint(`Scanned ${photoCount} images`)
                this.reset()

                const duration = Date.now() - startTime
                console.log(`Finished scanning ${photoCount} photos in ${duration} ms`)
                return finalProgress
            })
            .catch(error => {
                if (error['isCancelImport']) {
                    const finalProgress = this.progress
                    if (profiler) profiler.addPoint(`Cancelled import`)
                    this.reset()

                    const duration = Date.now() - startTime
                    console.log(`Cancelled scanning after ${duration} ms`)
                    return finalProgress
                } else {
                    if (profiler) profiler.addPoint('Scanning failed')
                    this.progress.phase = 'error'
                    this.onProgressChange(true)
                    throw error
                }
            })
            .lastly(() => {
                if (profiler) profiler.logResult()
                this.state = 'idle'
                this.onProgressChange(true)
            })
    }

    isPaused(): boolean {
        return !!this.pausePromise
    }

    setPaused(paused: boolean) {
        if (paused) {
            if (!this.pausePromise && this.state !== 'idle') {
                this.pausePromise = new Promise<void>(resolve => this.resolvePause = resolve)
                    .then(() => {
                        this.pausePromise = null
                        this.resolvePause = null
                        this.onProgressChange(true)
                    })
                this.onProgressChange(true)
            }
        } else {
            if (this.pausePromise && this.resolvePause) {
                this.resolvePause()
            }
        }
    }

    cancel() {
        this.shouldCancel = true
    }

    private async checkPauseAndCancel(): Promise<void> {
        if (this.shouldCancel) {
            const cancelError = new Error('cancel import')
            cancelError['isCancelImport'] = true
            throw cancelError
        }
        if (this.pausePromise) {
            await this.pausePromise
        }
    }

    private async scanDirectory(result: DirectoryInfo[], dir: string): Promise<void> {
        await this.checkPauseAndCancel()

        const photoFilenames: string[] = []
        let picasaOriginalSubDirs: PicasaOriginalDirectoryInfo[] | null = null
        const files = await fsReadDirWithFileTypes(dir)
        await Promise.all(files.map(async fileInfo => {
            const filename = fileInfo.name
            const filePath = `${dir}/${filename}`
            if (fileInfo.isDirectory()) {
                const picasaOriginalSubDir = await this.detectPicasaOriginalDirectory(dir, filename)
                if (picasaOriginalSubDir) {
                    if (!picasaOriginalSubDirs) {
                        picasaOriginalSubDirs = [ picasaOriginalSubDir ]
                    } else {
                        picasaOriginalSubDirs.push(picasaOriginalSubDir)
                    }
                    this.progress.total += picasaOriginalSubDir.photoFilenames.length
                } else {
                    await this.scanDirectory(result, filePath)
                }
            } else if (fileInfo.isFile()) {
                if (acceptedExtensionRE.test(filename)) {
                    photoFilenames.push(filename)
                }
            }
        }))

        if (photoFilenames.length) {
            result.push({ path: dir, photoFilenames, picasaOriginalSubDirs })
            this.progress.total += photoFilenames.length
            this.onProgressChange()
        }
    }

    /**
     * Detects whether there is a subdirectory with Picasa originals.
     *
     * A "Picasa original" is the original version of a photo saved by Picasa. When a photo is saved in Picasa, it
     * stores the original in a subdirectory called `.picasaoriginals` (or `Originals` in older versions) and it stores
     * the edited image in the parent directory.
     */
    private async detectPicasaOriginalDirectory(parentDirPath: string, dirName: string):
        Promise<PicasaOriginalDirectoryInfo | null>
    {
        if (dirName !== '.picasaoriginals' && dirName !== 'Originals') {
            return null
        }

        const dirPath = `${parentDirPath}/${dirName}`
        const files = await fsReadDirWithFileTypes(dirPath)
        let hasPicasaIni = false
        const photoFilenames: string[] = []
        for (const fileInfo of files) {
            const filename = fileInfo.name
            if (fileInfo.isFile()) {
                if (filename === '.picasa.ini' || filename === 'Picasa.ini') {
                    hasPicasaIni = true
                } else if (acceptedExtensionRE.test(filename)) {
                    photoFilenames.push(filename)
                }
            }
        }

        if (!hasPicasaIni || !photoFilenames.length) {
            return null
        } else {
            return { dirName, photoFilenames }
        }
    }

    private async processDirectory(dirInfo: DirectoryInfo) {
        await this.checkPauseAndCancel()

        const fileNamesToIgnore: { [K in string]: true } = {}
        if (dirInfo.picasaOriginalSubDirs) {
            for (const picasaOriginalSubDir of dirInfo.picasaOriginalSubDirs) {
                for (const fileName of picasaOriginalSubDir.photoFilenames) {
                    fileNamesToIgnore[fileName] = true
                }
                await this.processDirectory({
                    path: `${dirInfo.path}/${picasaOriginalSubDir.dirName}`,
                    photoFilenames: picasaOriginalSubDir.photoFilenames,
                    picasaOriginalSubDirs: null
                })
            }
        }

        this.progress.currentPath = dirInfo.path

        type PhotoOfDirectoryInfo = { id: PhotoId, master_filename: string }
        const photosInDb = await this.delegate.fetchPhotosOfDirectoryFromDb(dirInfo.path)

        const remainingPhotosMap: { [K in string]: PhotoOfDirectoryInfo } = {}
        for (const photo of photosInDb) {
            remainingPhotosMap[photo.master_filename] = photo
        }

        for (const filename of dirInfo.photoFilenames) {
            this.progress.processed++

            if (!fileNamesToIgnore[filename]) {
                const photo = remainingPhotosMap[filename]
                if (photo) {
                    // This photo already exists in the DB
                    delete remainingPhotosMap[filename]
    
                    // Don't call `onProgressChange` - delete is too fast (progress will be updated after the next "real" operation)
                } else {
                    // This is a new photo -> Import it
                    const importSucceed = await this.importPhoto(dirInfo.path, filename)
                    if (importSucceed) {
                        this.progress.added++
                        this.onProgressChange()
                    }
                }
            }
        }
        this.onProgressChange()

        const removedIds = Object.values(remainingPhotosMap).map(photo => photo.id)
        if (removedIds.length) {
            await this.delegate.deletePhotosFromDb(removedIds)
            this.progress.removed += removedIds.length
        }
    }

    private async importPhoto(masterDir: string, masterFileName: string): Promise<boolean> {
        await this.checkPauseAndCancel()

        const masterFullPath = `${masterDir}/${masterFileName}`
        const profiler = profileScanner ? new Profiler(`Importing ${masterFullPath}`) : null

        try {
            const isRaw = acceptedRawExtensionRE.test(masterFileName)
            if (isRaw && !libraw) {
                return false
            }

            // Fetch meta data and PhotoWork

            const [ fileStats, metaData ] = await Promise.all([
                fsStat(masterFullPath),
                readMetadataOfImage(masterFullPath),
            ])
            if (profiler) profiler.addPoint('Fetched meta data and PhotoWork')

            const switchMasterSides = hasExifOrientationSwitchedSides(metaData.orientation)
            let master_width = switchMasterSides ? metaData.imgHeight : metaData.imgWidth
            let master_height = switchMasterSides ? metaData.imgWidth : metaData.imgHeight

            let createdAt = metaData.createdAt || fileStats.ctime

            // Store non-raw version of the photo (only if photo is raw)

            let tempNonRawImgPath: string | null = null
            if (isRaw) {
                const tempRawConversionPaths = this.delegate.nextTempRawConversionPaths()
                tempNonRawImgPath = tempRawConversionPaths.tempNonRawImgPath

                const tempJpgPath = await libraw.extractThumb(masterFullPath, tempRawConversionPaths.tempExtractThumbPath)
                if (profiler) profiler.addPoint('Extracted non-raw image')

                const webpBinaryString = await ForegroundClient.renderImage(tempJpgPath, null, { format: config.workExt, quality: 0.9 })
                await fsWriteFile(tempNonRawImgPath, webpBinaryString, 'binary')
                await fsUnlink(tempJpgPath)

                const imageInfo = await getImageSize(tempNonRawImgPath)
                if (!imageInfo) {
                    console.error(`Received invalid non-raw size for ${masterFullPath} using non-raw ${tempNonRawImgPath}`, imageInfo)
                    throw new Error('Received invalid non-raw size')
                }

                master_width  = imageInfo.width
                master_height = imageInfo.height
                if (profiler) profiler.addPoint('Transcoded extracted image')
            }

            // Get photo size (if not available from meta data)

            if (!master_width || !master_height) {
                try {
                    const imageInfo = await getImageSize(masterFullPath)
                    if (!imageInfo || typeof imageInfo.width !== 'number' || typeof imageInfo.height !== 'number') {
                        console.error(`Received invalid photo size for ${masterFullPath}:`, imageInfo)
                        throw new Error('Received invalid photo size')
                    }
                    const orientation = imageInfo.orientation || ExifOrientation.Up
                    const switchMasterSides = hasExifOrientationSwitchedSides(orientation)
                    master_width  = switchMasterSides ? imageInfo.height : imageInfo.width
                    master_height = switchMasterSides ? imageInfo.width : imageInfo.height
                } catch (error) {
                    // Use assumed photo size if there is no other source
                    if (metaData.imgWidthAssumed && metaData.imgHeightAssumed) {
                        const switchMasterSides = hasExifOrientationSwitchedSides(metaData.orientation)
                        master_width = switchMasterSides ? metaData.imgHeightAssumed : metaData.imgWidthAssumed
                        master_height = switchMasterSides ? metaData.imgWidthAssumed : metaData.imgHeightAssumed
                    } else {
                        console.error('Detecting photo size failed', masterFullPath, error)
                        if (profiler) {
                            profiler.addPoint('Detecting photo size failed')
                            profiler.logResult()
                        }
                        return false
                    }
                }
            }

            // Get edited size

            const photoWork = await fetchPhotoWork(masterDir, masterFileName, master_width, master_height)

            let edited_width: number
            let edited_height: number
            if (photoWork.cropRect) {
                edited_width = photoWork.cropRect.width
                edited_height = photoWork.cropRect.height
            } else {
                const switchEditedSides = (photoWork.rotationTurns || 0) % 2 === 1
                edited_width = switchEditedSides ? master_height : master_width
                edited_height = switchEditedSides ? master_width : master_height
            }

            // Store photo in DB

            const photo: Photo = {
                id: undefined as any,  // Just set to satisfy type checking (ID will be autogenerated by DB)
                master_dir: masterDir,
                master_filename: masterFileName,
                master_width,
                master_height,
                master_is_raw: isRaw ? 1 : 0,
                edited_width,
                edited_height,
                date_section: moment(createdAt).format('YYYY-MM-DD'),
                created_at: createdAt.getTime(),
                updated_at: fileStats.mtime.getTime(),
                imported_at: this.importStartTime,
                flag: photoWork.flagged ? 1 : 0,
                trashed: 0,
            }

            const tags = photoWork.tags || metaData.tags
            this.delegate.storePhotoInDb(masterFullPath, photo, tempNonRawImgPath, tags)
            if (profiler) profiler.addPoint('Stored photo to DB')

            // Done

            if (profiler) profiler.logResult()
            return true
        } catch (error) {
            // TODO: Show error in UI (in progress info, not using `ForegroundClient.showError`)
            console.error('Importing photo failed', masterFullPath, error)
            if (profiler) {
                profiler.addPoint('Caught error')
                profiler.logResult()
            }
            return false
        }
    }

    private onProgressChange(forceSendingNow?: boolean) {
        const now = Date.now()
        if (forceSendingNow || now > this.lastUIUpdateTime + uiUpdateInterval) {
            if (this.isUIUpdateRunning) {
                this.needsFollowupUIUpdate = true
            } else {
                this.isUIUpdateRunning = true
                this.needsFollowupUIUpdate = false
                this.lastUIUpdateTime = now
                Promise.resolve()
                    .then(async () => {
                        const { state, progress } = this
                        progress.isPaused = this.isPaused()

                        await this.delegate.updateProgressInUi(state, progress)

                        this.isUIUpdateRunning = false
                        if (this.needsFollowupUIUpdate) {
                            this.onProgressChange(true)
                        }
                    })
                    .catch(error => {
                        this.isUIUpdateRunning = false
                        this.delegate.showError('Notifying progress failed', error)
                    })
            }
        }
    }

}


/**
 * Returns a copy of `paths` where all duplicate directories or subdirectories have been removed.
 *
 * E.g. [ '/my/pics', '/my/pics/special', '/my/pics' ]  ->  [ '/my/pics' ]
 */
function removeSubdirectories(paths: string[]): string[] {
    const result: string[] = [ ...paths ]
    for (let i = result.length - 1; i >= 0; i--) {
        const path = result[i]

        let isSubdirectory = false
        for (let j = 0; j < result.length; j++) {
            if (j !== i && path.startsWith(result[j])) {
                isSubdirectory = true
                break
            }
        }

        if (isSubdirectory) {
            result.splice(i, 1)
        }
    }
    return result
}
