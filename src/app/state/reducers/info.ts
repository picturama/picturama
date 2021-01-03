
import { Action } from 'app/state/ActionType'
import { SET_SHOW_INFO, SET_INFO_PHOTO_DATA, SET_INFO_PHOTO_DATA_FAILURE, SET_PHOTO_TAGS } from 'app/state/actionTypes'
import { InfoState, LibraryState } from 'app/state/StateTypes'
import { FetchState } from 'app/UITypes'


const initialInfoState: InfoState = {
    showInLibrary: false,
    showInDetail: false,
}

export const info = (state: InfoState = initialInfoState, libraryState: LibraryState, action: Action): InfoState => {
    switch (action.type) {
        case SET_SHOW_INFO:
            if (action.payload.view === 'library') {
                return {
                    ...state,
                    showInLibrary: action.payload.showInfo
                }
            } else {
                return {
                    ...state,
                    showInDetail: action.payload.showInfo
                }
            }
        case SET_INFO_PHOTO_DATA:
            if (action.payload.photoId === state.photoData?.photoId) {
                return {
                    ...state,
                    photoData: {
                        fetchState: FetchState.IDLE,
                        sectionId: state.photoData.sectionId,
                        photoId: action.payload.photoId,
                        photoDetail: action.payload.photoDetail,
                        masterFileSize: action.payload.masterFileSize,
                        metaData: action.payload.metaData,
                        exifData: action.payload.exifData,
                    }
                }
            } else {
                return state
            }
        case SET_INFO_PHOTO_DATA_FAILURE:
            if (action.payload.photoId === state.photoData?.photoId) {
                return {
                    ...state,
                    photoData: {
                        ...state.photoData,
                        fetchState: FetchState.FAILURE,
                    }
                }
            } else {
                return state
            }
        case SET_PHOTO_TAGS:
            if (state && state.photoData?.photoId === action.payload.photoId && state.photoData?.photoDetail) {
                return {
                    ...state,
                    photoData: {
                        ...state.photoData,
                        photoDetail: {
                            ...state.photoData.photoDetail,
                            tags: action.payload.tags
                        }
                    }
                }
            }
        default: {
            const { activePhoto } = libraryState
            if (activePhoto?.photoId !== state.photoData?.photoId || activePhoto?.sectionId !== state.photoData?.sectionId) {
                return {
                    ...state,
                    photoData: activePhoto ?
                        {
                            fetchState: FetchState.FETCHING,
                            sectionId: activePhoto.sectionId,
                            photoId: activePhoto.photoId,
                            photoDetail: null,
                            masterFileSize: null,
                            metaData: null,
                            exifData: null,
                        } :
                        undefined
                }
            } else {
                return state
            }
        }
    }
}
