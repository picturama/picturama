import BackgroundClient from 'app/BackgroundClient'
import { PhotoId } from 'app/CommonTypes'
import { showError } from 'app/ErrorPresenter'
import { setInfoPhotoDataAction } from 'app/state/actions'
import { getInfoPhoto } from 'app/state/selectors'
import { AppState, InfoPhotoDataState, InfoPhotoDataWithoutSection } from 'app/state/StateTypes'
import store from 'app/state/store'
import { getMasterPath } from 'app/util/DataUtil'
import { observeStore } from 'app/util/ReduxUtil'


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
    return (state.info.showInDetail || state.info.showInLibrary) && state.info.photoData?.state === InfoPhotoDataState.Loading
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
    fetchInfoPhotoData(photoId, getMasterPath(infoPhoto))
        .then(info => {
            store.dispatch(setInfoPhotoDataAction(info))
        })
        .catch(error => {
            showError('Fetching info photo data failed', error)
            store.dispatch(setInfoPhotoDataAction({ state: InfoPhotoDataState.Error, photoId }))
        })
        .finally(() => {
            isFetching = false
            tryUpdate()
        })
}


async function fetchInfoPhotoData(photoId: PhotoId, masterPath: string): Promise<InfoPhotoDataWithoutSection> {
    const [ photoDetailResult, fileSizeResult, metaDataResult, exifDataResult ] = await Promise.allSettled([
        BackgroundClient.fetchPhotoDetail(photoId),
        BackgroundClient.getFileSize(masterPath),
        BackgroundClient.readMetadataOfImage(masterPath),
        BackgroundClient.getExifData(masterPath),
    ])

    // The tags come from the DB, so this one has nothing to do with the master file
    if (photoDetailResult.status === 'rejected') {
        throw photoDetailResult.reason
    }

    // The master file may be gone (moved, deleted, disk not connected). That's an expected
    // situation: the DB still knows the photo, so show what we have plus a hint. Any other reason
    // for a failure (no permission, unreadable, broken IPC) must not be swallowed. Only ask the
    // disk if something actually failed - so we don't pay an extra IPC roundtrip per photo.
    const fileError = errorOf(fileSizeResult) ?? errorOf(metaDataResult) ?? errorOf(exifDataResult)
    const isMasterMissing = fileError != null && !await BackgroundClient.fileExists(masterPath)
    if (fileError != null && !isMasterMissing) {
        throw fileError
    }

    if (isMasterMissing) {
        return {
            state: InfoPhotoDataState.MasterIsMissing,
            photoId,
            photoDetail: photoDetailResult.value,
        }
    } else {
        return {
            state: InfoPhotoDataState.Loaded,
            photoId,
            photoDetail: photoDetailResult.value,
            masterFileSize: valueOf(fileSizeResult),
            metaData: valueOf(metaDataResult),
            exifData: valueOf(exifDataResult),
        }
    }
}


/** The value of a fulfilled result - or the error thrown */
function valueOf<T>(result: PromiseSettledResult<T>): T {
    if (result.status !== 'fulfilled') {
        throw result.reason
    }
    return result.value
}


/** The reason of a rejected result - or `null` if it was fulfilled */
function errorOf(result: PromiseSettledResult<unknown>): unknown {
    return result.status === 'rejected' ? result.reason : null
}
