import { combineReducers } from 'redux'

import { PhotoFilter } from 'common/CommonTypes'

import { defaultGridRowHeight } from 'app/UiConstants'
import { Action } from 'app/state/ActionType'
import {
    SET_GRID_ROW_HEIGHT, FETCH_SECTIONS_REQUEST, FETCH_SECTIONS_SUCCESS, FETCH_SECTIONS_FAILURE,
    CHANGE_PHOTOS, SET_LIBRARY_ACTIVE_PHOTO, SET_LIBRARY_HOVER_PHOTO, SET_LIBRARY_SELECTION, EMPTY_TRASH, SET_DETAIL_PHOTO
} from 'app/state/actionTypes'
import { LibraryState, DisplayState, SelectionState, InfoState, PhotoLibraryPosition } from 'app/state/StateTypes'


const initialDisplayState: DisplayState = {
    gridRowHeight: defaultGridRowHeight
}

const display = (state: DisplayState = initialDisplayState, action: Action): DisplayState => {
    switch (action.type) {
        case SET_GRID_ROW_HEIGHT:
            return {
                gridRowHeight: action.payload.gridRowHeight
            }
        default:
            return state
    }
}


const initialFilterState: PhotoFilter = {
    type: 'all'
}

const filter = (state: PhotoFilter = initialFilterState, action: Action): PhotoFilter => {
    switch (action.type) {
        case FETCH_SECTIONS_REQUEST:
            if (action.payload.newFilter) {
                return action.payload.newFilter
            } else {
                return state
            }
        default:
            return state
    }
}


const activePhoto = (state: PhotoLibraryPosition | null = null, action: Action): PhotoLibraryPosition | null => {
    switch (action.type) {
        case SET_LIBRARY_ACTIVE_PHOTO:
            return action.payload
        case SET_LIBRARY_SELECTION:
            if (action.payload.activePhoto && action.payload.activePhoto.photoId !== state?.photoId) {
                return action.payload.activePhoto
            } else {
                return state
            }
        case SET_DETAIL_PHOTO:
            return { sectionId: action.payload.sectionId, photoId: action.payload.photoId }
        default:
            return state
    }
}


const hoverPhoto = (state: PhotoLibraryPosition | null = null, action: Action): PhotoLibraryPosition | null => {
    switch (action.type) {
        case SET_LIBRARY_HOVER_PHOTO:
            return action.payload
        default:
            return state
    }
}


const selection = (state: SelectionState | null = null, action: Action): SelectionState | null => {
    switch (action.type) {
        case FETCH_SECTIONS_SUCCESS:
        case FETCH_SECTIONS_FAILURE:
        case EMPTY_TRASH:
            return null
        case CHANGE_PHOTOS: {
            const removeUpdatedPhotos = action.payload.update.trashed !== undefined
            if (removeUpdatedPhotos) {
                return null
            } else {
                return state
            }
        }
        case SET_LIBRARY_SELECTION:
            return action.payload.selection
        default:
            return state
    }
}


export const library = combineReducers<LibraryState>({
    display,
    filter,
    activePhoto,
    hoverPhoto,
    selection,
})
