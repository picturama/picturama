import { PhotoExportOptions } from 'app/CommonTypes'
import { msg } from 'app/i18n/i18n'
import { closeExportAction, setExportProgressAction, setSettingsAction } from 'app/state/actions'
import { PhotoCollection } from 'app/state/StateTypes'
import store from 'app/state/store'
import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import toaster from 'app/Toaster'
import { bindMany } from 'app/util/LangUtil'
import { getPhotosOfCollection } from 'app/util/PhotoCollectionResolver'
import { formatNumber } from 'app/util/TextUtil'


interface ExportInfo {
    exportOptions: PhotoExportOptions
    photos: PhotoCollection
    isCancelled: boolean
}

class ExportDialogController {

    private runningExport: ExportInfo | null

    constructor() {
        bindMany(this, 'startExport', 'cancelExport')
    }

    startExport() {
        if (this.runningExport) {
            this.runningExport.isCancelled = true
        }

        const state = store.getState()
        const exportState = state.export!
        const exportInfo: ExportInfo = {
            exportOptions: exportState.exportOptions,
            photos: exportState.photos,
            isCancelled: false
        }

        this.runningExport = exportInfo
        runExport(exportInfo)
            .catch(error => {
                showError('Export failed', error)
            })
            .finally(() => {
                if (this.runningExport === exportInfo) {
                    this.runningExport = null
                }
            })
    }

    cancelExport() {
        if (this.runningExport) {
            this.runningExport.isCancelled = true
        }
        store.dispatch(closeExportAction())
    }

}


async function runExport(exportInfo: ExportInfo): Promise<void> {
    const { exportOptions } = exportInfo

    // Select target folder

    const filePath: string | undefined = await BackgroundClient.selectExportDirectory()
    if (exportInfo.isCancelled) {
        return
    }
    if (!filePath) {
        // User cancelled
        store.dispatch(closeExportAction())
        return
    }
    exportOptions.folderPath = filePath

    // Store settings

    const settings = store.getState().data.settings
    settings.exportOptions = exportOptions
    store.dispatch(setSettingsAction(settings))
    await BackgroundClient.storeSettings(settings)
    if (exportInfo.isCancelled) {
        return
    }

    // Export photos

    const photos = await getPhotosOfCollection(exportInfo.photos)
    const photoCount = photos.length
    for (let photoIndex = 0; photoIndex < photoCount; photoIndex++) {
        store.dispatch(setExportProgressAction({
            processed: photoIndex,
            total: photoCount
        }))

        const photo = photos[photoIndex]
        await BackgroundClient.exportPhoto(photo, photoIndex, exportOptions)
        if (exportInfo.isCancelled) {
            return
        }
    }

    // Show done notification

    toaster.show({
        icon: 'tick',
        message: photoCount === 1 ? msg('ExportDialog_done_one') : msg('ExportDialog_done_more', formatNumber(photoCount)),
        intent: 'success'
    })

    store.dispatch(closeExportAction())
}


const singleton = new ExportDialogController()
export default singleton
