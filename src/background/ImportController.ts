import DB from 'sqlite3-helper/no-generators'
import moment = require('moment')
import notifier from 'node-notifier'

import { PhotoId, Photo, ImportProgress, Tag } from 'common/CommonTypes'
import config from 'common/config'
import { msg } from 'common/i18n/i18n'
import { getNonRawPath } from 'common/util/DataUtil'
import { formatNumber } from 'common/util/TextUtil'

import AppWindowController from 'background/AppWindowController'
import ForegroundClient from 'background/ForegroundClient'
import ImportScanner, { ImportScannerDelegate, PhotoOfDirectoryInfo, ImportScannerState } from 'background/ImportScanner'
import { deletePhotos } from 'background/store/PhotoStore'
import { storePhotoTags, fetchTags } from 'background/store/TagStore'
import { fsRename } from 'background/util/FileUtil'
import { toSqlStringCsv } from 'background/util/DbUtil'
import { fetchSettings } from './store/SettingsStore';


let importScanner: ImportScanner | null = null


export function startImport(): void {
    if (!importScanner) {
        importScanner = new ImportScanner(new ImportScannerDelegateImpl())
    }
    const startTime = Date.now()

    fetchSettings()
        .then(settings => importScanner!.scanPhotos(settings.photoDirs))
        .then(finalProgress => {
            if (finalProgress) {
                const duration = Date.now() - startTime
                notifier.notify({
                    title: 'Picturama',
                    message: msg('ImportController_importFinished', formatNumber(finalProgress.total), moment.duration(duration).humanize())
                })
            }
        })
        .catch(error => {
            ForegroundClient.showError('Scanning photos failed', error)
        })
}

export function toggleImportPaused() {
    if (importScanner) {
        importScanner.setPaused(!importScanner.isPaused())
    }
}

export function cancelImport() {
    if (importScanner) {
        importScanner.cancel()
    }
}


class ImportScannerDelegateImpl implements ImportScannerDelegate {

    private nextTempRawConversionId = 1
    private shouldFetchTags = false


    async deletePhotosOfRemovedDirsFromDb(existingDirs: string[]): Promise<number> {
        const dirsCsv = toSqlStringCsv(existingDirs)
        let photoIds = await DB().queryColumn<PhotoId>('id', `select id from photos where master_dir not in (${dirsCsv})`)
        await this.deletePhotosFromDb(photoIds)
        return photoIds.length
    }

    fetchPhotosOfDirectoryFromDb(dir: string): Promise<PhotoOfDirectoryInfo[]> {
        return DB().query<PhotoOfDirectoryInfo>(
            'select id, master_filename from photos where master_dir = ?', dir)
    }

    async deletePhotosFromDb(photoIds: PhotoId[]): Promise<void> {
        if (!photoIds.length) {
            return
        }

        const shouldFetchTags = await deletePhotos(photoIds)
        if (shouldFetchTags) {
            this.shouldFetchTags = shouldFetchTags
        }
    }

    nextTempRawConversionPaths(): { tempExtractThumbPath: string, tempNonRawImgPath: string } {
        const tempRawConversionId = this.nextTempRawConversionId++
        return {
            tempExtractThumbPath: `${config.tmp}/temp-thumb-${tempRawConversionId}.jpg`,
            tempNonRawImgPath: `${config.nonRawPath}/temp-non-raw-${tempRawConversionId}.${config.workExt}`
        }
    }

    async storePhotoInDb(masterFullPath: string, photo: Photo, tempNonRawImgPath: string | null, tags: string[]): Promise<void> {
        photo.id = await DB().insert('photos', photo)
        if (tempNonRawImgPath) {
            const nonRawPath = getNonRawPath(photo)
            if (nonRawPath === masterFullPath) {
                // Should not happen - but we check this just to be sure...
                throw new Error(`Expected non-raw path to differ original image path: ${nonRawPath}`)
            }
            await fsRename(tempNonRawImgPath, nonRawPath)
        }
    
        if (tags && tags.length) {
            const shouldUpdateTags = await storePhotoTags(photo.id, tags)
            if (shouldUpdateTags) {
                this.shouldFetchTags = true
            }
        }
    }

    async updateProgressInUi(state: ImportScannerState, progress: ImportProgress): Promise<void> {
        let updatedTags: Tag[] | null = null
        if (this.shouldFetchTags) {
            updatedTags = await fetchTags()
            this.shouldFetchTags = false
        }

        let progressBarProgress = 0
        if (state === 'idle') {
            progressBarProgress = -1  // Don't show progress
        } else if (state === 'importPhotos') {
            progressBarProgress = progress.processed / (progress.total || 1)
        } else {
            progressBarProgress = 2  // indeterminate
        }
        AppWindowController.getAppWindow().setProgressBar(progressBarProgress)

        await ForegroundClient.setImportProgress(state === 'idle' ? null : progress, updatedTags)
    }

    showError(msg: string, error?: Error) {
        ForegroundClient.showError(msg, error)
    }

}


