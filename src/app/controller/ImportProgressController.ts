import dayjs from 'dayjs'

import { ImportProgress, Tag, PhotoSectionId, isLoadedPhotoSection } from 'app/CommonTypes'
import { msg } from 'app/i18n/i18n'
import { fetchSections, fetchTotalPhotoCount } from 'app/controller/PhotoController'
import { setTags } from 'app/controller/PhotoTagController'
import { setImportProgressAction } from 'app/state/actions'
import store from 'app/state/store'
import toaster from 'app/Toaster'
import { observeStore } from 'app/util/ReduxUtil'
import { formatNumber } from 'app/util/TextUtil'


/** The interval in which to update the library grid while running an import (in ms) */
const importUiUpdateInterval = 10000

let prevImportUiUpdateTime = 0
let postponedUpdateLibraryUnsubscribe: (() => void) | null = null


export default class ImportProgressController {

    private constructor() {}

    static setImportProgress(progress: ImportProgress | null, updatedTags: Tag[] | null) {
        store.dispatch(setImportProgressAction(progress))

        const isImportFinished = !progress
        const now = Date.now()
        if (isImportFinished || now > prevImportUiUpdateTime + importUiUpdateInterval) {
            prevImportUiUpdateTime = now
            updateLibrary()
        }

        if (updatedTags) {
            setTags(updatedTags)
        }
    }

    /** Shows the "import finished" toast. Called from Rust via the `showImportFinishedToast` RPC on a
     *  successful scan (mirrors the reference `ImportController`). */
    static showImportFinishedToast(photoCount: number, durationMs: number) {
        toaster.show({
            icon: 'tick',
            message: msg('ImportController_importFinished', formatNumber(photoCount),
                dayjs.duration(durationMs).humanize()),
            intent: 'success'
        })
    }

}

function updateLibrary() {
    const state = store.getState()
    if (state.navigation.mainView === null) {
        // We want the current loaded sections to stay loaded in order to avoid blinking when the sections are updated.
        const loadedSectionIds: PhotoSectionId[] = []
        const sectionsById = state.data.sections.byId
        for (const sectionId of state.data.sections.ids) {
            if (isLoadedPhotoSection(sectionsById[sectionId])) {
                loadedSectionIds.push(sectionId)
            }
        }

        fetchTotalPhotoCount()
        fetchSections(loadedSectionIds)
    } else {
        // Workaround: If the detail view is active, the detail view would be closed by `fetchSections` since the
        //             section shown in detail view will get unloaded
        //             -> We postpone `fetchSections` until the detail view is closed
        if (!postponedUpdateLibraryUnsubscribe) {
            postponedUpdateLibraryUnsubscribe = observeStore(store,
                state => state.navigation.mainView,
                mainView => {
                    if (mainView === null) {
                        postponedUpdateLibraryUnsubscribe!()
                        postponedUpdateLibraryUnsubscribe = null
                        updateLibrary()
                    }
                })
        }
    }
}
