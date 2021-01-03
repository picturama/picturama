import { Action } from 'app/state/ActionType'
import { OPEN_EXPORT, CLOSE_EXPORT, SET_EXPORT_OPTIONS, TOGGLE_SHOW_EXPORT_REMOVE_INFO_DESC, SET_EXPORT_PROGRESS } from 'app/state/actionTypes'
import { ExportState, DataState } from 'app/state/StateTypes'
import { PhotoExportOptions } from 'common/CommonTypes'
import { msg } from 'common/i18n/i18n'


export const exportReducer = (state: ExportState = null, dataState: DataState, action: Action): ExportState => {
    switch (action.type) {
        case OPEN_EXPORT:
            return {
                photos: action.payload.photos,
                exportOptions: dataState.settings.exportOptions || createDefaultExportOptions(),
                showRemoveInfoDesc: false,
                progress: null,
            }
        case CLOSE_EXPORT:
            return null
        case SET_EXPORT_OPTIONS:
            if (state) {
                return {
                    ...state,
                    exportOptions: action.payload
                }
            } else {
                return null
            }
        case TOGGLE_SHOW_EXPORT_REMOVE_INFO_DESC:
            if (state) {
                return {
                    ...state,
                    showRemoveInfoDesc: !state.showRemoveInfoDesc
                }
            } else {
                return null
            }
        case SET_EXPORT_PROGRESS:
            if (state) {
                return {
                    ...state,
                    progress: action.payload
                }
            } else {
                return null
            }
        default:
            return state
    }
}


export function createDefaultExportOptions(): PhotoExportOptions {
    return {
        format: 'jpg',
        quality: 0.9,
        size: 'L',
        customSizeSide: 'size',
        customSizePixels: 1024,
        withMetadata: true,
        fileNameStyle: 'like-original',
        fileNamePrefix: `${msg('ExportDialog_fileName_sequencePrefixDefault')}_`,
        folderPath: ''
    }
}
