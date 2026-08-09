
import { Action } from 'app/state/ActionType'
import { SET_SHOW_INFO, SET_INFO_PHOTO_DATA, SET_PHOTO_TAGS } from 'app/state/actionTypes'
import { InfoPhotoDataState, InfoState, LibraryState } from 'app/state/StateTypes'


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
                        sectionId: state.photoData.sectionId,
                        ...action.payload
                    }
                }
            } else {
                return state
            }
        case SET_PHOTO_TAGS:
            if (state && state.photoData?.photoId === action.payload.photoId && state.photoData?.state === InfoPhotoDataState.Loaded) {
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
                            state: InfoPhotoDataState.Loading,
                            sectionId: activePhoto.sectionId,
                            photoId: activePhoto.photoId,
                        } :
                        undefined
                }
            } else {
                return state
            }
        }
    }
}
