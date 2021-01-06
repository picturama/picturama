import { Action } from 'app/state/ActionType'
import { SET_DEVICE_PIXEL_RATIO, SET_WEB_GL_SUPPORT, SET_FULL_SCREEN, SET_SHIFT_PRESSED, OPEN_SETTINGS, CLOSE_SETTINGS } from 'app/state/actionTypes'

import { NavigationState, DetailState } from 'app/state/StateTypes'


const initialNavigationState: NavigationState = {
    devicePixelRatio: window.devicePixelRatio,
    hasWebGLSupport: true,
    isFullScreen: false,
    isShiftPressed: false,
    mainView: null
}

export const navigation = (state: NavigationState = initialNavigationState, detailState: DetailState | null, action: Action): NavigationState => {
    switch (action.type) {
        case SET_DEVICE_PIXEL_RATIO:
            return {
                ...state,
                devicePixelRatio: action.payload
            }
        case SET_WEB_GL_SUPPORT:
            return {
                ...state,
                hasWebGLSupport: action.payload
            }
        case SET_FULL_SCREEN:
            return {
                ...state,
                isFullScreen: action.payload
            }
        case SET_SHIFT_PRESSED:
            return {
                ...state,
                isShiftPressed: action.payload
            }
        case OPEN_SETTINGS:
            return {
                ...state,
                mainView: 'settings'
            }
        case CLOSE_SETTINGS:
            return {
                ...state,
                mainView: null
            }
        default:
            if (state.mainView === null && detailState) {
                return {
                    ...state,
                    mainView: 'detail'
                }
            } else if (state.mainView === 'detail' && !detailState) {
                return {
                    ...state,
                    mainView: null
                }
            } else {
                return state
            }
    }
}
