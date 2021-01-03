import { PhotoId, Photo, PhotoSectionId, TagId, isLoadedPhotoSection, LoadedPhotoSection } from 'common/CommonTypes'

import { AppState, DataState, SectionSelectionState, SelectionState } from './StateTypes'


export function getPhotoByIndex(state: AppState, sectionId: PhotoSectionId, photoIndex: number): Photo | null {
    const section = getLoadedSectionById(state, sectionId)
    return (section && section.photoData[section.photoIds[photoIndex]]) || null
}

export function getPhotoById(state: AppState, sectionId: PhotoSectionId, photoId: PhotoId): Photo | null {
    const section = getLoadedSectionById(state, sectionId)
    return section ? section.photoData[photoId] : null
}

export function getLoadedSectionById(state: AppState, sectionId: PhotoSectionId): LoadedPhotoSection | null {
    return getLoadedSectionByIdFromDataState(state.data, sectionId)
}

export function getLoadedSectionByIdFromDataState(dataState: DataState, sectionId: PhotoSectionId): LoadedPhotoSection | null {
    const section = dataState.sections.byId[sectionId]
    return isLoadedPhotoSection(section) ? section : null
}

let prevTagIds: TagId[] = []
let cachedTagTitles: string[] = []
export function getTagTitles(state: AppState): string[] {
    const tagIds = state.data.tags.ids
    if (tagIds !== prevTagIds) {
        const tagById = state.data.tags.byId
        cachedTagTitles = tagIds.map(tagId => tagById[tagId].title)
        prevTagIds = tagIds
    }
    return cachedTagTitles
}


export const getSectionSelections = (() => {
    const cacheSymbol = Symbol('sectionSelections')
    return function(selection: SelectionState): SectionSelectionState[] {
        let result = selection[cacheSymbol] as SectionSelectionState[] | undefined
        if (!result) {
            result = Object.values(selection.sectionSelectionById) as SectionSelectionState[]
            selection[cacheSymbol] = result
        }
        return result
    }
})()


export function isPhotoSelected(sectionId: PhotoSectionId, photoId: PhotoId, selection: SelectionState | null): boolean {
    return !!selection && isPhotoSelectedInSection(photoId, selection.sectionSelectionById[sectionId])
}

export function isPhotoSelectedInSection(photoId: PhotoId, sectionSelection: SectionSelectionState | null | undefined): boolean {
    return !!(sectionSelection && (sectionSelection.selectedPhotosById === 'all' || sectionSelection.selectedPhotosById[photoId]))
}


export function getInfoPhoto(state: AppState): Photo | undefined {
    const { photoData } = state.info
    if (!photoData) {
        return undefined
    }

    const infoPhotoSection = state.data.sections.byId[photoData.sectionId]
    return isLoadedPhotoSection(infoPhotoSection) ? infoPhotoSection.photoData[photoData.photoId] : undefined
}
