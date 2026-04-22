import { combineReducers } from 'redux'

import { PhotoById, TagId, TagById, LoadedPhotoSection, isLoadedPhotoSection, PhotoSectionId, PhotoSectionById, Settings, UiConfig} from 'common/CommonTypes'
import { cloneArrayWithItemRemoved } from 'common/util/LangUtil'

import { Action } from 'app/state/ActionType'
import {
    INIT, SET_SETTINGS, FETCH_TOTAL_PHOTO_COUNT, FETCH_SECTIONS_REQUEST, FETCH_SECTIONS_SUCCESS, FETCH_SECTIONS_FAILURE,
    CHANGE_PHOTOS, EMPTY_TRASH,
    FETCH_TAGS, FORGET_SECTION_PHOTOS, FETCH_SECTION_PHOTOS
} from 'app/state/actionTypes'
import { DataState, TagsState, DevicesState, SectionsState } from 'app/state/StateTypes'
import { FetchState } from 'app/UITypes'


const uiConfig = (state: UiConfig | undefined, action: Action): UiConfig => {
    state = state || {} as UiConfig
    switch (action.type) {
        case INIT:
            return action.payload.uiConfig
        default:
            return state
    }
}


const settings = (state: Settings | undefined, action: Action): Settings => {
    state = state || {} as Settings
    switch (action.type) {
        case INIT:
            return action.payload.settings
        case SET_SETTINGS:
            return action.payload
        default:
            return state
    }
}


const initialTagsState: TagsState = {
    ids: [],
    byId: {}
}

const tags = (state: TagsState = initialTagsState, action: Action): TagsState => {
    switch (action.type) {
        case FETCH_TAGS: {
            let ids: TagId[] = []
            let byId: TagById = {}
            for (const tag of action.payload) {
                ids.push(tag.id)
                byId[tag.id] = tag
            }
            return { ids, byId }
        }
        default:
            return state
    }
}


const initialSectionsState: SectionsState = {
    fetchState: FetchState.IDLE,
    totalPhotoCount: null,
    photoCount: 0,
    ids: [],
    byId: {}
}

const sections = (state: SectionsState = initialSectionsState, action: Action): SectionsState => {
    switch (action.type) {
        case FETCH_TOTAL_PHOTO_COUNT:
            return {
                ...state,
                totalPhotoCount: action.payload.totalPhotoCount
            }
        case FETCH_SECTIONS_REQUEST:
            return {
                ...state,  // We keep the old photos while loading
                fetchState: FetchState.FETCHING
            }
        case FETCH_SECTIONS_SUCCESS: {
            let photoCount = 0
            let ids: PhotoSectionId[] = []
            let byId: PhotoSectionById = {}
            for (const section of action.payload.sections) {
                photoCount += section.count
                ids.push(section.id)
                byId[section.id] = section
            }

            return {
                ...state,
                fetchState: FetchState.IDLE,
                photoCount,
                ids,
                byId
            }
        }
        case FETCH_SECTIONS_FAILURE:
            return {
                ...state,  // We keep the old photos
                fetchState: FetchState.FAILURE
            }
        case FETCH_SECTION_PHOTOS: {
            const { sectionIds, photoSets } = action.payload
            const nextSectionById = { ...state.byId }
            for (let i = 0, il = sectionIds.length; i < il; i++) {
                const sectionId = sectionIds[i]
                const section = nextSectionById[sectionId]
                if (section) {
                    const photoSet = photoSets[i]
                    const nextSection: LoadedPhotoSection = {
                        ...section,
                        ...photoSet,
                        count: photoSet.photoIds.length,  // Should be correct already, but we set it just in case
                    }
                    nextSectionById[sectionId] = nextSection
                }
            }
            return {
                ...state,
                byId: nextSectionById
            }
        }
        case FORGET_SECTION_PHOTOS: {
            const sectionIdsToForget = action.payload.sectionIds
            let newSectionById = {}
            for (const sectionId of state.ids) {
                const prevSection = state.byId[sectionId]
                newSectionById[sectionId] = sectionIdsToForget[sectionId] ?
                    {
                        id: prevSection.id,
                        title: prevSection.title,
                        count: prevSection.count
                    } :
                    prevSection
            }

            return {
                ...state,
                byId: newSectionById
            }
        }
        case CHANGE_PHOTOS: {
            const updatedPhotos = action.payload.photos
            const removeUpdatedPhotos = action.payload.update.trashed !== undefined
                // The trashed state has changed. So either a photos were moved to trash or they were recovered from trash
                // In both cases the photos should be removed from the currently shown photos

            let totalPhotoCount = state.totalPhotoCount
            let photoCount = state.photoCount
            let newSectionIds: PhotoSectionId[] = []
            let newSectionById: PhotoSectionById = {}
            for (const sectionId of state.ids) {
                const section = state.byId[sectionId]
                let newSection: LoadedPhotoSection | null = null

                if (isLoadedPhotoSection(section)) {
                    const photoData = section.photoData
                    let newPhotoData: PhotoById | null = null
                    for (const updatedPhoto of updatedPhotos) {
                        const prevPhoto = photoData[updatedPhoto.id]
                        if (prevPhoto) {
                            if (!newPhotoData || !newSection) {
                                newPhotoData = { ...photoData }
                                newSection = { ...section, photoData: newPhotoData }
                            }
                            if (removeUpdatedPhotos) {
                                const prevPhotoIndex = newSection.photoIds.indexOf(prevPhoto.id)
                                if (prevPhotoIndex !== -1) {
                                    newSection.photoIds.splice(prevPhotoIndex, 1)
                                }
                                if (totalPhotoCount != null && action.payload.update.trashed) {
                                    totalPhotoCount--
                                }
                                newSection.count--
                                photoCount--
                            } else {
                                newPhotoData[updatedPhoto.id] = updatedPhoto
                            }
                        }
                    }
                }

                if (!newSection || newSection.photoIds.length !== 0) {
                    newSectionIds.push(sectionId)
                    newSectionById[sectionId] = newSection || section
                }
            }

            return {
                ...state,
                totalPhotoCount,
                photoCount,
                ids: newSectionIds,
                byId: newSectionById
            }
        }
        case EMPTY_TRASH:
            return {
                ...state,
                photoCount: 0,
                ids: [],
                byId: {}
            }
        default:
            return state
    }
}


export const data = combineReducers<DataState>({
    uiConfig,
    settings,
    tags,
    sections
})
