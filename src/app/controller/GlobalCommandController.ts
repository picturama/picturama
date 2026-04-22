import BackgroundClient from 'app/BackgroundClient'
import { Command } from 'app/controller/HotkeyController'


/**
 * Creates hotkeys for Windows and Linux which have no menu. But only for functions which are not available on another way.
 *
 * MacOS defines hotkeys in menu (see src/background/MainMenu.ts).
 */
export function createGlobalCommands(): Command[] {
    return [
        { combo: 'F11',          onAction: () => BackgroundClient.toggleFullScreen() },
        { combo: 'Shift+Ctrl+I', onAction: () => BackgroundClient.toggleDevTools() },
        { combo: 'Shift+Ctrl+T', onAction: () => BackgroundClient.toggleUiTester() },
        { combo: 'Shift+Ctrl+R', onAction: () => BackgroundClient.reloadUi() },
    ]
}
