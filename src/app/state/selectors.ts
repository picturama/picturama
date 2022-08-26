import { PhotoId, Photo, PhotoSectionId, TagId, isLoadedPhotoSection, LoadedPhotoSection } from 'common/CommonTypes'
import { isShallowEqual } from 'common/util/LangUtil'

import { AppState, DataState, PreselectionRange, SectionSelectionState, SelectionState } from './StateTypes'


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

export function getNextLoadedSectionByIdFromDataState(dataState: DataState, sectionId: PhotoSectionId): LoadedPhotoSection | null {
    const sectionIndex = dataState.sections.ids.indexOf(sectionId)
    let nextIndex = sectionIndex === (dataState.sections.ids.length - 1) ? 0 : sectionIndex + 1
    const nextIndexKey = dataState.sections.ids[nextIndex]
    const section = dataState.sections.byId[nextIndexKey]
    return isLoadedPhotoSection(section) ? section : null
}

export function getPrevLoadedSectionByIdFromDataState(dataState: DataState, sectionId: PhotoSectionId): LoadedPhotoSection | null {
    const sectionIndex = dataState.sections.ids.indexOf(sectionId)
    let prevIndex = sectionIndex === 0 ? (dataState.sections.ids.length - 1) : sectionIndex - 1
    const prevIndexKey = dataState.sections.ids[prevIndex]
    const section = dataState.sections.byId[prevIndexKey]
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


export const getPreselectionRange = (() => {
    let prevSubState: any = null
    let prevResult: PreselectionRange | null = null

    return function(state: AppState): PreselectionRange | null {
        if (!state.navigation.isShiftPressed || !state.library.selection || !state.library.activePhoto || !state.library.hoverPhoto) {
            return null
        }

        const { sections } = state.data
        const { selection, activePhoto, hoverPhoto } = state.library
        const subState = {
            sections,
            selection,
            activePhoto,
            hoverPhoto,
        }
        if (!isShallowEqual(prevSubState, subState)) {
            const activeSectionIndex = sections.ids.indexOf(activePhoto.sectionId)
            const hoverSectionIndex = sections.ids.indexOf(hoverPhoto.sectionId)
            const activeSection = sections.byId[activePhoto.sectionId]
            const hoverSection = sections.byId[hoverPhoto.sectionId]

            prevSubState = subState
            prevResult = null

            if (activeSectionIndex !== -1 && hoverSectionIndex !== -1 && isLoadedPhotoSection(activeSection) &&
                isLoadedPhotoSection(hoverSection))
            {
                const activePhotoIndex = activeSection.photoIds.indexOf(activePhoto.photoId)
                const hoverPhotoIndex = hoverSection.photoIds.indexOf(hoverPhoto.photoId)
                if (activePhotoIndex !== -1 && hoverPhotoIndex !== -1) {
                    const isActivePhotoSelected = isPhotoSelected(activePhoto.sectionId, activePhoto.photoId, selection)
                    if (activeSectionIndex < hoverSectionIndex ||
                        (activeSectionIndex === hoverSectionIndex && activePhotoIndex < hoverPhotoIndex))
                    {
                        prevResult = {
                            selected: isActivePhotoSelected,
                            startSectionIndex: activeSectionIndex,
                            startPhotoIndex: activePhotoIndex,
                            endSectionIndex: hoverSectionIndex,
                            endPhotoIndex: hoverPhotoIndex
                        }
                    } else {
                        prevResult = {
                            selected: isActivePhotoSelected,
                            startSectionIndex: hoverSectionIndex,
                            startPhotoIndex: hoverPhotoIndex,
                            endSectionIndex: activeSectionIndex,
                            endPhotoIndex: activePhotoIndex
                        }
                    }
                }
            }
        }

        return prevResult
    }
})()


export function getInfoPhoto(state: AppState): Photo | undefined {
    const { photoData } = state.info
    if (!photoData) {
        return undefined
    }

    const infoPhotoSection = state.data.sections.byId[photoData.sectionId]
    return isLoadedPhotoSection(infoPhotoSection) ? infoPhotoSection.photoData[photoData.photoId] : undefined
}
