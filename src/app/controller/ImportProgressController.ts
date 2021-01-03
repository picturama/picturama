import { Tag, PhotoSectionId, isLoadedPhotoSection } from 'common/CommonTypes'
import { ImportProgress } from 'common/CommonTypes'
import { assertRendererProcess } from 'common/util/ElectronUtil'

import { fetchSections, fetchTotalPhotoCount } from 'app/controller/PhotoController'
import { setTags } from 'app/controller/PhotoTagController'
import { setImportProgressAction } from 'app/state/actions'
import store from 'app/state/store'

import { observeStore } from 'app/util/ReduxUtil'


assertRendererProcess()


/** The interval in which to update the library grid while running an import (in ms) */
const importUiUpdateInterval = 10000

let prevImportUiUpdateTime = 0
let postponedUpdateLibraryUnsubscribe: (() => void) | null = null


export default class ImportProgressController {

    private constructor() {}

    static setImportProgress(progress: ImportProgress | null, updatedTags: Tag[] | null) {
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
