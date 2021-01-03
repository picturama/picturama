import { remote } from 'electron'

import { assertRendererProcess } from 'common/util/ElectronUtil'

import BackgroundClient from 'app/BackgroundClient'
import { Command } from 'app/controller/HotkeyController'


assertRendererProcess()


/**
 * Creates hotkeys for Windows and Linux which have no menu. But only for functions which are not available on another way.
 *
 * MacOS defines hotkeys in menu (see src/background/MainMenu.ts).
 */
export function createGlobalCommands(): Command[] {
    return [
        { combo: 'F11',          onAction: () => BackgroundClient.toggleFullScreen() },
        { combo: 'Shift+Ctrl+I', onAction: () => remote.getCurrentWindow().webContents.toggleDevTools() },
        { combo: 'Shift+Ctrl+T', onAction: () => BackgroundClient.toggleUiTester() },
        { combo: 'Shift+Ctrl+R', onAction: () => BackgroundClient.reloadUi() },
    ]
}
