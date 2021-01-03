import { PhotoId } from 'common/CommonTypes'

import { FetchState } from 'app/UITypes'
import { Action } from 'app/state/ActionType'
import {
    SET_DETAIL_PHOTO, FETCH_DETAIL_PHOTO_DATA_REQUEST, FETCH_DETAIL_PHOTO_DATA_SUCCESS, FETCH_DETAIL_PHOTO_DATA_FAILURE,
    CLOSE_DETAIL, CHANGE_PHOTOWORK,
    FETCH_SECTIONS_SUCCESS, CHANGE_PHOTOS, EMPTY_TRASH, FETCH_SECTIONS_FAILURE
} from 'app/state/actionTypes'
import { getLoadedSectionByIdFromDataState } from 'app/state/selectors'
import { DetailState, DataState } from 'app/state/StateTypes'


export const detail = (state: DetailState = null, dataState: DataState, action: Action): DetailState => {
    switch (action.type) {
        case SET_DETAIL_PHOTO:
            return {
                currentPhoto: {
                    fetchState: FetchState.IDLE,
                    sectionId: action.payload.sectionId,
                    photoIndex: action.payload.photoIndex,
                    photoId: action.payload.photoId,
                    photoWork: null,
                }
            }
        case FETCH_DETAIL_PHOTO_DATA_REQUEST:
            if (!state || state.currentPhoto.photoId !== action.payload.photoId) {
                // The shown photo has changed in the mean time -> Ignore this action
                return state
            } else {
                return {
                    ...state,
                    currentPhoto: {
                        ...state.currentPhoto,
                        fetchState: FetchState.FETCHING,
                    }
                }
            }
        case FETCH_DETAIL_PHOTO_DATA_SUCCESS:
            if (!state || state.currentPhoto.photoId !== action.payload.photoId) {
                // The shown photo has changed in the mean time -> Ignore this action
                return state
            } else {
                return {
                    ...state,
                    currentPhoto: {
                        ...state.currentPhoto,
                        fetchState: FetchState.IDLE,
                        photoWork: action.payload.photoWork
                    }
                }
            }
        case FETCH_DETAIL_PHOTO_DATA_FAILURE:
            if (!state || state.currentPhoto.photoId !== action.payload.photoId) {
                // The shown photo has changed in the mean time -> Ignore this action
                return state
            } else {
                return {
                    ...state,
                    currentPhoto: {
                        ...state.currentPhoto,
                        fetchState: FetchState.FAILURE
                    }
                }
            }
        case CHANGE_PHOTOWORK:
            if (state && state.currentPhoto.photoId === action.payload.photoId) {
                return {
                    ...state,
                    currentPhoto: {
                        ...state.currentPhoto,
                        photoWork: { ...action.payload.photoWork }
                    }
                }
            } else {
                return state
            }
        case FETCH_SECTIONS_SUCCESS:
        case FETCH_SECTIONS_FAILURE:
        case CLOSE_DETAIL:
            return null
        case CHANGE_PHOTOS: {
            if (state && action.payload.update.trashed !== undefined) {
                // The photo was trashed (or restored from trash)
                // Wanted behaviour:
                //   - If possible, show the next photo (same index).
                //   - If last photo was trashed, show the previous photo (index - 1)
                //   - If the only photo of section was trashed, close details.

                const sectionId = state.currentPhoto.sectionId
                const section = getLoadedSectionByIdFromDataState(dataState, sectionId)
                let photoIndex = state.currentPhoto.photoIndex
                let photoId: PhotoId | null = null
                if (section) {
                    const photoCount = section.photoIds.length
                    if (photoIndex >= photoCount) {
                        photoIndex = photoCount - 1
                    }
                    photoId = section.photoIds[photoIndex] || null
                }

                if (!photoId) {
                    // The only photo of section was trashed -> Close details
                    return null
                } else {
                    return {
                        currentPhoto: {
                            fetchState: FetchState.IDLE,
                            sectionId,
                            photoIndex,
                            photoId,
                            photoWork: null
                        }
                    }
                }               
            } else {
                return state
            }
        }
        case EMPTY_TRASH:
            if (state && action.payload.trashedPhotoIds.indexOf(state.currentPhoto.photoId) !== -1) {
                return null
            } else {
                return state
            }
        default:
            return state
    }
}
