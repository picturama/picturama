import { Settings } from 'common/CommonTypes'
import config from 'common/config'
import { isArray, isObject } from 'common/util/LangUtil'

import ForegroundClient from 'background/ForegroundClient'
import { fsReadFile, fsExists, fsWriteFile } from 'background/util/FileUtil'


let fetchSettingsPromise: Promise<Settings> | null = null


export function fetchSettings(): Promise<Settings> {
    if (!fetchSettingsPromise) {
        fetchSettingsPromise = (async () => {
            let settings: Settings | null = null
            try {
                const settingsExist = await fsExists(config.settings)
                if (settingsExist) {
                    const rawSettings = JSON.parse(await fsReadFile(config.settings))
                    if (isArray(rawSettings.photoDirs)) {
                        settings = rawSettings
                    } else if (isObject(rawSettings.directories) && typeof rawSettings.directories.photos === 'string') {
                        // This is a legacy `settings.json` created before 2019-08-18
                        settings = { photoDirs: [ rawSettings.directories.photos ] }
                        if (typeof rawSettings.directories.versions === 'string') {
                            settings.legacy = { versionsDir: rawSettings.directories.versions }
                        }
                    }
                }
            } catch (error) {
                ForegroundClient.showError('Reading settings.json failed', error)
                settings = null
            }
            if (settings == null) {
                settings = { photoDirs: [] }
            }
            return settings
        })()
    }
    return fetchSettingsPromise
}

export async function storeSettings(settings: Settings): Promise<void> {
    fetchSettingsPromise = Promise.resolve(settings)
    await fsWriteFile(config.settings, JSON.stringify(settings, null, 4))
}
