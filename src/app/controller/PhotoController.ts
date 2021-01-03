import { PhotoWork, PhotoSectionId, Photo, PhotoFilter, PhotoId } from 'common/CommonTypes'
import { getMasterPath, getThumbnailUrl } from 'common/util/DataUtil'
import { rotate } from 'common/util/EffectsUtil'
import { assertRendererProcess } from 'common/util/ElectronUtil'

import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import store from 'app/state/store'
import { fetchTotalPhotoCountAction, fetchSectionsAction, changePhotoWorkAction, changePhotosAction } from 'app/state/actions'
import { PhotoCollection, SelectionState } from 'app/state/StateTypes'
import { getPhotosOfCollection } from 'app/util/PhotoCollectionResolver'


assertRendererProcess()


let thumbnailVersion = Date.now()


export function fetchTotalPhotoCount() {
    BackgroundClient.fetchTotalPhotoCount()
        .then(totalPhotoCount => store.dispatch(fetchTotalPhotoCountAction(totalPhotoCount)))
}

export function fetchSections(sectionIdsToKeepLoaded?: PhotoSectionId[]) {
    internalFetchSections(null, sectionIdsToKeepLoaded)
}

export function setLibraryFilter(newFilter: PhotoFilter) {
    internalFetchSections(newFilter)
}

function internalFetchSections(newFilter: PhotoFilter | null, sectionIdsToKeepLoaded?: PhotoSectionId[]) {
    const filter = newFilter || store.getState().library.filter

    store.dispatch(fetchSectionsAction.request({ newFilter }))
    BackgroundClient.fetchSections(filter, sectionIdsToKeepLoaded)
        .then(sections => {
            store.dispatch(fetchSectionsAction.success({ sections }))
        })
        .catch(error => {
            console.error('Fetching sections failed', error)
            store.dispatch(fetchSectionsAction.failure(error))
        })
}


export function getThumbnailSrc(photo: Photo): string {
    const thumbnailUrl = getThumbnailUrl(photo.id)
    return `${thumbnailUrl}?v=${thumbnailVersion}`
}


// We queue pending PhotoWork updates, so we don't get lost updates if multiple updates wait for fetching to finish
const pendingUpdates: { photo: Photo, updates: ((photoWork: PhotoWork) => void)[] }[] = []

export function updatePhotoWork(photo: Photo, update: (photoWork: PhotoWork) => void) {
    const photoPath = getMasterPath(photo)
    let pendingUpdate = pendingUpdates[photoPath]
    if (pendingUpdate) {
        pendingUpdate.updates.push(update)
    } else {
        pendingUpdate = {
            photo,
            updates: [ update ]
        }
        pendingUpdates[photoPath] = pendingUpdate

        BackgroundClient.fetchPhotoWorkOfPhoto(photo)
            .then(photoWork => {
                const photoWorkBefore = { ...photoWork }
                for (const up of pendingUpdate.updates) {
                    up(photoWork)
                }
                delete pendingUpdates[photoPath]

                // Ignore changes on meta data (like flagged or tags)
                const thumbnailNeedsUpdate =
                    photoWork.rotationTurns !== photoWorkBefore.rotationTurns ||
                    photoWork.tilt !== photoWorkBefore.tilt ||
                    photoWork.cropRect !== photoWorkBefore.cropRect

                // We do all in parallel:
                //   - Show the new effects in UI
                //   - Store PhotoWork to picturama.yml
                //   - Update Thumbnail

                store.dispatch(changePhotoWorkAction(photo.id, photoWork))

                return Promise.all([
                    BackgroundClient.storePhotoWork(photo.master_dir, photo.master_filename, photoWork),
                    thumbnailNeedsUpdate ? onThumbnailChange(photo.id) : Promise.resolve()
                ])
            })
            .catch(error => {
                delete pendingUpdates[photoPath]
                showError('Updating photo work failed: ' + photoPath, error)
            })
    }
}

async function onThumbnailChange(photoId: PhotoId): Promise<void> {
    await BackgroundClient.deleteThumbnail(photoId)

    thumbnailVersion = Date.now()
    window.dispatchEvent(new CustomEvent('edit:thumnailChange', { detail: { photoId } }))
}

// TODO: Revive Legacy code of 'version' feature
/*
export function updatePhotoVersion(version: VersionType) {  // Type should be `Version`, but it doesn't work...
    // TODO: Fix
    throw new Error('Not implemented')
    //new Photo({ id: version.photo_id })
    //    .fetch({ withRelated: [ 'versions', 'tags' ] })
    //    .then(photoModel => {
    //        const photo = photoModel.toJSON()
    //        return onThumnailChange(photo.id)
    //            .then(() => {
    //                const updatedPhoto = addVersionToPhoto(photo)
    //                store.dispatch(changePhotosAction([ updatedPhoto ]))
    //            })
    //    })
}
*/


export function rotatePhotos(photos: PhotoCollection, turns: number) {
    getPhotosOfCollection(photos)
        .then(photos => {
            for (const photo of photos) {
                updatePhotoWork(photo, photoWork => rotate(photoWork, turns, true))
            }
        })

}

export function setPhotosFlagged(photos: PhotoCollection, flagged: boolean) {
    updatePhotos(photos, { flag: flagged ? 1 : 0 })
}

export function movePhotosToTrash(photos: PhotoCollection) {
    updatePhotos(photos, { trashed: 1 })
}

export function restorePhotosFromTrash(photos: PhotoCollection) {
    updatePhotos(photos, { trashed: 0 })
}

export function updatePhoto(photo: Photo, update: Partial<Photo>) {
    updatePhotos([ photo ], update)
}


export function updatePhotos(photos: PhotoCollection, update: Partial<Photo>) {
    doUpdatePhotos(photos, update)
        .catch(error => {
            showError('Updating photos failed', error)
        })
}

async function doUpdatePhotos(photos: PhotoCollection, update: Partial<Photo>): Promise<void> {
    photos = await getPhotosOfCollection(photos)

    let updatePhotoWorkPromise: Promise<any> | null = null
    if (update.hasOwnProperty('flag')) {
        updatePhotoWorkPromise = Promise.all(photos.map(photo =>
            updatePhotoWork(
                photo,
                photoWork => {
                    if (update.flag) {
                        photoWork.flagged = true
                    } else {
                        delete photoWork.flagged
                    }
                })
        ))
    }

    const photoIds = photos.map(photo => photo.id)
    await Promise.all([
        updatePhotoWorkPromise,
        BackgroundClient.updatePhotos(photoIds, update)
    ])

    const changedPhotos = photos.map(photo => ({ ...photo, ...update } as Photo))
    store.dispatch(changePhotosAction(changedPhotos, update))
}
