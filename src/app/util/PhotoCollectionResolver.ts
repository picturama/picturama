import { isLoadedPhotoSection, Photo, PhotoSectionId, PhotoSet } from 'common/CommonTypes'

import { fetchSectionPhotos } from 'app/controller/LibraryController'
import { PhotoCollection, SectionSelectionState, SectionsState, SelectionState } from 'app/state/StateTypes'
import store from 'app/state/store'
import { getSectionSelections } from 'app/state/selectors'


/**
 * Walks all loaded photos of a collection.
 *
 * @param photos the collection to process
 * @param processPhoto will be called for each photo. If `processPhoto` returns `false`, walking will be stopped.
 */
export function walkLoadedPhotosOfCollection(photos: PhotoCollection, processPhoto: (photo: Photo) => boolean) {
    if (isPhoto(photos)) {
        processPhoto(photos)
    } else if (Array.isArray(photos)) {
        for (const photo of photos) {
            const shouldProceed = processPhoto(photo)
            if (!shouldProceed) {
                return
            }
        }
    } else if (isSelectionState(photos)) {
        const state = store.getState()
        for (const sectionSelection of getSectionSelections(photos)) {
            const section = state.data.sections.byId[sectionSelection.sectionId]
            if (isLoadedPhotoSection(section)) {
                for (const photoId of section.photoIds) {
                    if (sectionSelection.selectedPhotosById[photoId]) {
                        const shouldProceed = processPhoto(section.photoData[photoId])
                        if (!shouldProceed) {
                            return
                        }
                    }
                }
            }
        }
    } else {
        const { sectionId, photoId } = photos
        const state = store.getState()
        let section = state.data.sections.byId[sectionId]
        if (isLoadedPhotoSection(section)) {
            const photo = section.photoData[photoId]
            if (photo) {
                processPhoto(photo)
            }
        }
    }
}


export async function getPhotosOfCollection(photos: PhotoCollection): Promise<Photo[]> {
    if (isPhoto(photos)) {
        return [ photos ]
    } else if (Array.isArray(photos)) {
        return photos
    } else if (isSelectionState(photos)) {
        return getPhotosOfSelection(photos)
    } else {
        const { sectionId, photoId } = photos
        const state = store.getState()
        let section = state.data.sections.byId[sectionId]
        let photo: Photo | undefined
        if (isLoadedPhotoSection(section)) {
            photo = section.photoData[photoId]
        } else {
            const fetchedSections = await fetchSectionPhotos([ sectionId ])
            photo = fetchedSections[0].photoData[photoId]
        }
        return photo ? [ photo ] : []
    }
}

function isPhoto(photos: PhotoCollection): photos is Photo {
    return !!photos['master_dir']
}

function isSelectionState(photos: PhotoCollection): photos is SelectionState {
    return !!photos['sectionSelectionById']
}


/**
 * Returns the photos of a selection in the same order as they are shown in the library.
 */
const getPhotosOfSelection = (() => {
    let prevSelection: SelectionState | null = null
    let prevResult: Promise<Photo[]>

    return async function getPhotosOfSelection(selection: SelectionState): Promise<Photo[]> {
        if (selection !== prevSelection) {
            const state = store.getState()
            prevSelection = selection
            prevResult = fetchSelectedPhotos(selection, state.data.sections)
        }

        return prevResult
    }

    async function fetchSelectedPhotos(selection: SelectionState, sectionsSate: SectionsState): Promise<Photo[]> {
        const sectionPhotosById: { [K in PhotoSectionId]: Photo[] } = {}
        const sectionIdsToFetch: PhotoSectionId[] = []
        const sectionSelections = Object.values(selection.sectionSelectionById) as SectionSelectionState[]
        for (const sectionSelection of sectionSelections) {
            const { sectionId } = sectionSelection
            const section = sectionsSate.byId[sectionId]
            if (isLoadedPhotoSection(section)) {
                sectionPhotosById[sectionId] = filterSelectedPhotosOfSection(sectionSelection, section)
            } else {
                sectionIdsToFetch.push(sectionId)
            }
        }

        if (sectionIdsToFetch.length) {
            const fetchedSections = await fetchSectionPhotos(sectionIdsToFetch)
            for (let fetchedSectionIndex = 0; fetchedSectionIndex < sectionIdsToFetch.length; fetchedSectionIndex++) {
                const sectionId = sectionIdsToFetch[fetchedSectionIndex]
                const photoSet = fetchedSections[fetchedSectionIndex]
                const sectionSelection = selection.sectionSelectionById[sectionId]
                sectionPhotosById[sectionId] = filterSelectedPhotosOfSection(sectionSelection!, photoSet)
            }
        }

        const result: Photo[] = []
        for (const sectionId of sectionsSate.ids) {
            const sectionPhotos = sectionPhotosById[sectionId]
            if (sectionPhotos) {
                result.push(...sectionPhotos)
            }
        }
        return result
    }

    function filterSelectedPhotosOfSection(sectionSelection: SectionSelectionState, photoSet: PhotoSet): Photo[] {
        const result: Photo[] = []
        const { selectedPhotosById } = sectionSelection
        for (const photoId of photoSet.photoIds) {
            if (selectedPhotosById === 'all' || selectedPhotosById[photoId]) {
                result.push(photoSet.photoData[photoId])
            }
        }
        return result
    }
})()


export function getCollectionSize(photos: PhotoCollection | null | undefined): number {
    if (!photos) {
        return 0
    } else if (isPhoto(photos)) {
        return 1
    } else if (Array.isArray(photos)) {
        return photos.length
    } else if (isSelectionState(photos)) {
        return photos.totalSelectedCount
    } else {
        return 1
    }
}


export function collectionContainsSection(photos: PhotoCollection | null | undefined, sectionId: PhotoSectionId): boolean {
    if (!photos || isPhoto(photos) || Array.isArray(photos)) {
        return false
    } else if (isSelectionState(photos)) {
        return !!photos.sectionSelectionById[sectionId]
    } else {
        return photos.sectionId === sectionId
    }
}
