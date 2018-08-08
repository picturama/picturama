import { combineReducers } from 'redux'
import { NavigationState, navigation } from './navigation'
import { LibraryState, library } from './library'
import { DetailState, detail } from './detail'
import { ImportState, importReducer } from './import'
import { ExportState, exportReducer } from './export'

export type AppState = {
    readonly navigation: NavigationState
    readonly library: LibraryState
    readonly detail: DetailState
    readonly import: ImportState
    readonly export: ExportState
}

export default combineReducers<AppState>({
    navigation,
    library,
    detail,
    import: importReducer,
    export: exportReducer
})