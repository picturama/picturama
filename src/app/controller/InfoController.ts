import { getMasterPath } from 'common/util/DataUtil'
import { assertRendererProcess } from 'common/util/ElectronUtil'

import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import { setInfoPhotoDataAction, setInfoPhotoDataFailureAction } from 'app/state/actions'
import { getInfoPhoto } from 'app/state/selectors'
import { AppState } from 'app/state/StateTypes'
import store from 'app/state/store'
import { FetchState } from 'app/UITypes'
import { observeStore } from 'app/util/ReduxUtil'


assertRendererProcess()


let isFetching = false


export function init() {
    observeStore(store,
        isUpdateNeeded,
        needsUpdate => {
            if (needsUpdate) {
                tryUpdate()
            }
        })
}


function isUpdateNeeded(state: AppState): boolean {
    return (state.info.showInDetail || state.info.showInLibrary) && state.info.photoData?.fetchState === FetchState.FETCHING
}


function tryUpdate() {
    if (isFetching) {
        return
    }

    const state = store.getState()
    const infoPhoto = getInfoPhoto(state)
    if (!isUpdateNeeded(state) || !infoPhoto) {
        return
    }

    isFetching = true
    const photoId = infoPhoto.id
    const masterPath = getMasterPath(infoPhoto)
    Promise
        .all([
            BackgroundClient.fetchPhotoDetail(photoId),
            BackgroundClient.getFileSize(masterPath),
            BackgroundClient.readMetadataOfImage(masterPath),
            BackgroundClient.getExifData(masterPath),
        ])
        .then(([photoDetail, masterFileSize, metaData, exifData]) => {
            store.dispatch(setInfoPhotoDataAction({ photoId, photoDetail, masterFileSize, metaData, exifData }))
        })
        .catch(error => {
            showError('Fetching info photo data failed', error)
            store.dispatch(setInfoPhotoDataFailureAction(photoId))
        })
        .finally(() => {
            isFetching = false
            tryUpdate()
        })
}
