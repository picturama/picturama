import { Action } from 'app/state/ActionType'

import { AppState } from 'app/state/StateTypes'

import { navigation } from './navigation'
import { data } from './data'
import { library } from './library'
import { detail } from './detail'
import { info } from './info'
import { importReducer } from './import'
import { exportReducer } from './export'


export default (state: AppState = {} as AppState, action: Action) => {
    const dataState = data(state.data, action)
    const libraryState = library(state.library, action)
    const detailState = detail(state.detail, dataState, action)
    return {
        navigation: navigation(state.navigation, detailState, action),
        data: dataState,
        library: libraryState,
        detail: detailState,
        info: info(state.info, libraryState, action),
        import: importReducer(state.import, action),
        export: exportReducer(state.export, dataState, action),
    }
}
