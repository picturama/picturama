import BackgroundClient from 'app/BackgroundClient'
import { PhotoId, PhotoSectionId } from 'app/CommonTypes'
import { showError } from 'app/ErrorPresenter'
import { msg } from 'app/i18n/i18n'
import { setDetailPhotoAction, fetchDetailPhotoDataAction, closeDetailAction } from 'app/state/actions'
import { getPhotoByIndex, getLoadedSectionById, getPhotoById } from 'app/state/selectors'
import store from 'app/state/store'
import { AppState } from 'app/state/StateTypes'
import toaster from 'app/Toaster'
import { FetchState } from 'app/UITypes'
import CancelablePromise, { isCancelError } from 'app/util/CancelablePromise'
import { getMasterPath } from 'app/util/DataUtil'
import SerialUpdater from 'app/util/SerialUpdater'

import { fetchSectionPhotos } from './LibraryController'


export function setDetailPhotoById(sectionId: PhotoSectionId, photoId: PhotoId | null) {
    const state = store.getState()
    const section = getLoadedSectionById(state, sectionId)
    const photoIndex = (section && photoId != null) ? section.photoIds.indexOf(photoId) : -1
    setDetailPhotoByIndex(sectionId, (photoIndex === -1) ? null : photoIndex)
}

export function setDetailPhotoByIndex(sectionId: PhotoSectionId | null, photoIndex: number | null) {
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
            moveDetailToAdjacentSection(-1)
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
        } else {
            moveDetailToAdjacentSection(1)
        }
    }
}


/** Guards against overlapping section switches while an arrow key is held down */
let isSwitchingSection = false
/** The key of the last "switched to section" toast - so fast paging replaces the toast instead of stacking */
let sectionToastKey: string | undefined

/**
 * Continues paging beyond the boundary of the current section: shows the first photo of the next section
 * (`direction === 1`) or the last photo of the previous section (`direction === -1`) and reports the switch
 * using a toast. Does nothing if there is no such section - so paging stops at the very first and the very
 * last photo.
 *
 * The photos of the adjacent section may not be loaded yet, so this is asynchronous. The caller doesn't wait
 * for it - this function reports errors itself and never rejects.
 */
async function moveDetailToAdjacentSection(direction: -1 | 1) {
    if (isSwitchingSection) {
        return
    }

    const state = store.getState()
    if (!state.detail) {
        return
    }
    const startPhotoId = state.detail.currentPhoto.photoId
    const sectionIds = state.data.sections.ids
    const currentSectionIndex = sectionIds.indexOf(state.detail.currentPhoto.sectionId)
    if (currentSectionIndex === -1) {
        return
    }

    isSwitchingSection = true
    try {
        for (let i = currentSectionIndex + direction; i >= 0 && i < sectionIds.length; i += direction) {
            const sectionId = sectionIds[i]
            let section = getLoadedSectionById(store.getState(), sectionId)
            if (!section) {
                await fetchSectionPhotos([ sectionId ])
                const nextState = store.getState()
                if (nextState.detail?.currentPhoto.photoId !== startPhotoId) {
                    // The detail view was closed or another photo was shown in the mean time -> Give up
                    return
                }
                section = getLoadedSectionById(nextState, sectionId)
            }

            if (!section || section.photoIds.length === 0) {
                // An empty section (may happen after photos were trashed) -> Skip it
                continue
            }

            setDetailPhotoByIndex(sectionId, (direction === 1) ? 0 : section.photoIds.length - 1)
            sectionToastKey = toaster.show({
                icon: (direction === 1) ? 'arrow-right' : 'arrow-left',
                message: msg((direction === 1) ? 'PhotoDetailPane_nextSection' : 'PhotoDetailPane_prevSection',
                    section.title),
                timeout: 2000
            }, sectionToastKey)
            return
        }
    } catch (error) {
        showError('Switching to the adjacent section failed', error)
    } finally {
        isSwitchingSection = false
    }
}
