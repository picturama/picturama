import { PhotoId, PhotoSectionId } from 'common/CommonTypes'
import CancelablePromise, { isCancelError } from 'common/util/CancelablePromise'
import { getMasterPath } from 'common/util/DataUtil'
import { assertRendererProcess } from 'common/util/ElectronUtil'
import { msg } from 'common/i18n/i18n'

import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import toaster from 'app/Toaster'
import { setDetailPhotoAction, fetchDetailPhotoDataAction, closeDetailAction } from 'app/state/actions'
import { getPhotoByIndex, getLoadedSectionById, getPhotoById, getNextLoadedSectionByIdFromDataState, getPrevLoadedSectionByIdFromDataState } from 'app/state/selectors'
import store from 'app/state/store'
import { AppState } from 'app/state/StateTypes'
import SerialUpdater from 'app/util/SerialUpdater'
import { FetchState } from 'app/UITypes'


assertRendererProcess()


export function setDetailPhotoById(sectionId: PhotoSectionId, photoId: PhotoId | null) {
    const state = store.getState()
    const section = getLoadedSectionById(state, sectionId)
    const photoIndex = (section && photoId != null) ? section.photoIds.indexOf(photoId) : -1
    setDetailPhotoByIndex(sectionId, (photoIndex === -1) ? null : photoIndex)
}

export function setDetailPhotoByIndex(sectionId: PhotoSectionId | null, photoIndex: number | null) {
    if (sectionId == null || photoIndex == null) {
        store.dispatch(closeDetailAction())
        return
    }

    const state = store.getState()
    const photo = getPhotoByIndex(state, sectionId, photoIndex)
    if (!photo) {
        showError(`No photo at index ${photoIndex}`)
        return
    }

    store.dispatch(setDetailPhotoAction(sectionId, photoIndex, photo.id))
}


new SerialUpdater({
    getUpdateParameters(state: AppState) {
        const detailState = state.detail
        return {
            photo: detailState && getPhotoById(state, detailState.currentPhoto.sectionId, detailState.currentPhoto.photoId),
            needsData: !!(detailState && !detailState.currentPhoto.photoWork && detailState.currentPhoto.fetchState === FetchState.IDLE)
        }
    },
    async runUpdate({ photo, needsData }) {
        if (photo && needsData) {
            const photoId = photo.id
            store.dispatch(fetchDetailPhotoDataAction.request({ photoId }))
            return new CancelablePromise(BackgroundClient.fetchPhotoWorkOfPhoto(photo))
                .then(photoWork => {
                    store.dispatch(fetchDetailPhotoDataAction.success({ photoId, photoWork }))
                })
                .catch(error => {
                    if (!isCancelError(error)) {
                        showError('Fetching photo data failed: ' + getMasterPath(photo), error)
                        store.dispatch(fetchDetailPhotoDataAction.failure({ photoId, error }))
                    }
                })
        }
    }
})


export function setPreviousDetailPhoto() {
    const state = store.getState()
    if (state.detail) {
        const currentPhoto = state.detail.currentPhoto
        const currentIndex = currentPhoto.photoIndex
        if (currentIndex > 0) {
            setDetailPhotoByIndex(currentPhoto.sectionId, currentIndex - 1)
        } else {
            const prevSection = getNextLoadedSectionByIdFromDataState(state.data, currentPhoto.sectionId)
            setDetailPhotoByIndex(prevSection ? prevSection.id : null, prevSection ? prevSection.count - 1 : null)
            toaster.show({
                message: msg('DetailController_SectionUpdated', [prevSection?.id])
            })
        }
    }
}

export function setNextDetailPhoto() {
    const state = store.getState()
    if (state.detail) {
        const currentPhoto = state.detail.currentPhoto
        const currentIndex = currentPhoto.photoIndex
        const section = getLoadedSectionById(state, currentPhoto.sectionId)
        if (section && currentIndex < section.photoIds.length - 1) {
            setDetailPhotoByIndex(currentPhoto.sectionId, currentIndex + 1)
        } else if (section && currentIndex == section.photoIds.length - 1){
            const nextSection = getNextLoadedSectionByIdFromDataState(state.data, currentPhoto.sectionId)
            setDetailPhotoByIndex(nextSection ? nextSection.id : null, 0)
            toaster.show({
                message: msg('DetailController_SectionUpdated', [nextSection?.id])
            })
        }
    }
}
