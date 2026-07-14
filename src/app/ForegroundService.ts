import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

import { showExternalError } from 'app/ErrorPresenter'
import ImportProgressController from 'app/controller/ImportProgressController'
import { renderPhoto, renderImage } from 'app/renderer/PhotoRenderer'
import { setFullScreenAction, openSettingsAction, openExportAction } from 'app/state/actions'
import store from 'app/state/store'
import { encodeIpcError } from 'app/util/IpcUtil'

/** RPC request payload emitted by Rust (see src-tauri/src/foreground_client.rs) */
interface ForegroundRpcRequest {
    /** Unique ID used to route the reply back to the waiting Rust future */
    callId: number
    action: string
    params: any
}

/** init – called once from entry.tsx after the backend is ready */
export async function init(): Promise<void> {
    // -- RPC server (Rust calls renderer, awaits result) ----------------------
    await listen<ForegroundRpcRequest>('execute-foreground-action', async (event) => {
        const { callId, action, params } = event.payload
        try {
            const result = await executeForegroundAction(action, params)
            await invoke('foreground_action_done', { callId, result: result ?? null, error: null })
        } catch (err: any) {
            const error = encodeIpcError(err)
            await invoke('foreground_action_done', { callId, result: null, error })
        }
    })
}

/** Action dispatcher */
async function executeForegroundAction(action: string, params: any): Promise<any> {
    if (action === 'showError') {
        showExternalError(params.processName, params.msg, params.errorStack)
    } else if (action === 'onFullScreenChange') {
        store.dispatch(setFullScreenAction(params.isFullScreen))
    } else if (action === 'showSettings') {
        store.dispatch(openSettingsAction())
    } else if (action === 'showExport') {
        const selection = store.getState().library.selection
        if (selection) {
            store.dispatch(openExportAction(selection))
        }
    } else if (action === 'setImportProgress') {
        ImportProgressController.setImportProgress(params.progress, params.updatedTags)
    } else if (action === 'showImportFinishedToast') {
        ImportProgressController.showImportFinishedToast(params.photoCount, params.durationMs)
    } else if (action === 'renderPhoto') {
        // We send the image as binary string (not as node Buffer), because all data is converted to JSON which doesn't support Buffers
        return renderPhoto(params.photo, params.photoWork, params.maxSize, params.options)
    } else if (action === 'renderImage') {
        // We send the image as binary string (not as node Buffer), because all data is converted to JSON which doesn't support Buffers
        return renderImage(params.imagePath, params.maxSize, params.options)
    } else {
        throw new Error('Unknown foreground action: ' + action)
    }
}
