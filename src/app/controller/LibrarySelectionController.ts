import { isLoadedPhotoSection, LoadedPhotoSection, PhotoId, PhotoSectionId } from 'common/CommonTypes'
import { assertRendererProcess } from 'common/util/ElectronUtil'

import { setLibraryActivePhotoAction, setLibraryHoverPhotoAction, setLibrarySelectionAction } from 'app/state/actions'
import { getPreselectionRange } from 'app/state/selectors'
import { PhotoLibraryPosition, SectionSelectionState, SelectionState } from 'app/state/StateTypes'
import store from 'app/state/store'
import { GridSectionLayout } from 'app/UITypes'

import { getPrevGridLayout } from './LibraryController'


assertRendererProcess()


/**
 * The center in x-direction of the photo where the user started navigating using up and down keys.
 * This x-position will be used to determine the best matching photo in the row below or above. We keep using the same
 * x-position as long the user navigates with up/down, so the same photos will get active when the user changes the
 * direction.
 */
let prevUpDownActivePhotoCenterX: number | null


export type MoveDirection = 'left' | 'right' | 'up' | 'down'


export interface LibrarySelectionController {
    setActivePhoto(activePhoto: PhotoLibraryPosition | null): void
    setHoverPhoto(activePhoto: PhotoLibraryPosition | null): void
    moveActivePhoto(direction: MoveDirection): void
    setSectionSelected(sectionId: PhotoSectionId, selected: boolean): void
    setPhotoSelected(sectionId: PhotoSectionId, photoId: PhotoId, selected: boolean): void
    applyPreselection(): void
    clearSelection(): void
}


export const defaultLibrarySelectionController: LibrarySelectionController = {

    setActivePhoto(activePhoto: PhotoLibraryPosition | null): void {
        prevUpDownActivePhotoCenterX = null
        store.dispatch(setLibraryActivePhotoAction(activePhoto))
    },

    setHoverPhoto(hoverPhoto: PhotoLibraryPosition | null): void {
        store.dispatch(setLibraryHoverPhotoAction(hoverPhoto))
    },

    moveActivePhoto(direction: MoveDirection): void {
        const state = store.getState()
        const { sections } = state.data
        const { activePhoto } = state.library

        if (!activePhoto) {
            return
        }

        const activeSection = sections.byId[activePhoto.sectionId]
        if (!isLoadedPhotoSection(activeSection)) {
            return
        }

        let activePhotoIndex = activeSection.photoIds.indexOf(activePhoto.photoId)

        let nextSection: LoadedPhotoSection | undefined = activeSection
        let nextPhotoIndex: number | null = activePhotoIndex
        if (direction === 'left' || direction === 'right') {
            prevUpDownActivePhotoCenterX = null
            const indexDelta = (direction === 'left' ? -1 : 1)
            nextPhotoIndex += indexDelta
            if (nextPhotoIndex < 0 || nextPhotoIndex >= activeSection.count) {
                // Try the next section
                const activeSectionIndex = sections.ids.indexOf(activePhoto.sectionId)
                const nextSectionIndex = activeSectionIndex + indexDelta
                const nextSectionId = sections.ids[nextSectionIndex]
                const nextSectionCandidate = sections.byId[nextSectionId]
                if (isLoadedPhotoSection(nextSectionCandidate)) {
                    nextSection = nextSectionCandidate
                    nextPhotoIndex = (direction === 'left' ? (nextSection.count - 1) : 0)
                }
            }
        } else {
            const gridLayout = getPrevGridLayout()
            const activeSectionIndex = sections.ids.indexOf(activePhoto.sectionId)
            const sectionLayout = gridLayout.sectionLayouts[activeSectionIndex]
            if (sectionLayout && sectionLayout.boxes) {
                const currentPhotoBox = sectionLayout.boxes[activePhotoIndex]
                if (currentPhotoBox) {
                    if (prevUpDownActivePhotoCenterX === null) {
                        prevUpDownActivePhotoCenterX = currentPhotoBox.left + currentPhotoBox.width / 2
                    }
                    const moveUp = direction === 'up'
                    nextPhotoIndex = findPhotoIndexOfNextRowAtX(prevUpDownActivePhotoCenterX, sectionLayout, moveUp, activePhotoIndex)
                    if (nextPhotoIndex === null) {
                        // Try the next section
                        const nextSectionIndex = activeSectionIndex + (moveUp ? -1 : 1)
                        const nextSectionLayout = gridLayout.sectionLayouts[nextSectionIndex]
                        const nextSectionId = sections.ids[nextSectionIndex]
                        const nextSectionCandidate = sections.byId[nextSectionId]
                        if (isLoadedPhotoSection(nextSectionCandidate)) {
                            nextSection = nextSectionCandidate
                            nextPhotoIndex = findPhotoIndexOfNextRowAtX(prevUpDownActivePhotoCenterX, nextSectionLayout, moveUp)
                        }
                    }
                }
            }
        }

        const nextPhotoId = (nextPhotoIndex !== null) && nextSection?.photoIds[nextPhotoIndex]
        if (nextPhotoId && nextPhotoId !== activePhoto.photoId) {
            store.dispatch(setLibraryActivePhotoAction({
                sectionId: nextSection.id,
                photoId: nextPhotoId,
            }))
        }
    },

    setSectionSelected(sectionId: PhotoSectionId, selected: boolean): void {
        const state = store.getState()
        const prevSelection = state.library.selection
        const prevSectionSelection = prevSelection?.sectionSelectionById[sectionId]
        let nextSelection: SelectionState | null = null
        if (selected) {
            const section = state.data.sections.byId[sectionId]
            if (section && prevSectionSelection?.selectedPhotosById !== 'all') {
                const nextSectionSelection: SectionSelectionState = {
                    sectionId,
                    selectedCount: section.count,
                    selectedPhotosById: 'all'
                }
                nextSelection = {
                    totalSelectedCount: (prevSelection?.totalSelectedCount ?? 0) - (prevSectionSelection?.selectedCount ?? 0) + section.count,
                    sectionSelectionById: {
                        ...prevSelection?.sectionSelectionById,
                        [sectionId]: nextSectionSelection
                    }
                }
            }
        } else {
            if (prevSelection && prevSectionSelection) {
                const nextSectionSelectionById = { ...prevSelection?.sectionSelectionById }
                delete nextSectionSelectionById[sectionId]
                nextSelection = {
                    totalSelectedCount: prevSelection.totalSelectedCount - prevSectionSelection.selectedCount,
                    sectionSelectionById: nextSectionSelectionById
                }
            }
        }

        if (nextSelection) {
            if (nextSelection.totalSelectedCount === 0) {
                nextSelection = null
            }
            store.dispatch(setLibrarySelectionAction(nextSelection))
        }
    },

    setPhotoSelected(sectionId: PhotoSectionId, photoId: PhotoId, selected: boolean): void {
        const state = store.getState()
        const prevSelection = state.library.selection
        const prevSectionSelection = prevSelection?.sectionSelectionById[sectionId] as SectionSelectionState | undefined
        const prevSelectedPhotosById = prevSectionSelection?.selectedPhotosById
        const section = state.data.sections.byId[sectionId]

        let nextSectionSelection: SectionSelectionState | undefined = prevSectionSelection
        if (selected) {
            if (section && prevSelectedPhotosById !== 'all' && !prevSelectedPhotosById?.[photoId]) {
                const nextSelectedCount = Math.min(section.count, (prevSectionSelection?.selectedCount ?? 0) + 1)
                nextSectionSelection = {
                    sectionId,
                    selectedCount: nextSelectedCount,
                    selectedPhotosById:
                        (nextSelectedCount === section.count) ?
                        'all' :
                        {
                            ...prevSelectedPhotosById,
                            [photoId]: true
                        }
                }
            }
        } else {
            if (isLoadedPhotoSection(section) && prevSectionSelection && (prevSelectedPhotosById === 'all' || prevSelectedPhotosById?.[photoId])) {
                if (prevSectionSelection.selectedCount === 1) {
                    nextSectionSelection = undefined
                } else if (prevSelectedPhotosById === 'all') {
                    const nextSelectedPhotosById: { [K in PhotoId]: true } = {}
                    for (const sectionPhotoId of section.photoIds) {
                        if (sectionPhotoId !== photoId) {
                            nextSelectedPhotosById[sectionPhotoId] = true
                        }
                    }
                    nextSectionSelection = {
                        sectionId,
                        selectedCount: section.count - 1,
                        selectedPhotosById: nextSelectedPhotosById
                    }
                } else {
                    const nextSelectedPhotosById = { ...prevSelectedPhotosById }
                    delete nextSelectedPhotosById[photoId]
                    nextSectionSelection = {
                        sectionId,
                        selectedCount: prevSectionSelection.selectedCount - 1,
                        selectedPhotosById: nextSelectedPhotosById
                    }
                }
            }
        }

        if (nextSectionSelection !== prevSectionSelection) {
            const nextTotalSelectedCount = (prevSelection?.totalSelectedCount ?? 0) - (prevSectionSelection?.selectedCount ?? 0) + (nextSectionSelection?.selectedCount ?? 0)
            let nextSelection: SelectionState | null = null
            if (nextTotalSelectedCount > 0) {
                const nextSectionSelectionById = { ...prevSelection?.sectionSelectionById }
                if (nextSectionSelection) {
                    nextSectionSelectionById[sectionId] = nextSectionSelection
                } else {
                    delete nextSectionSelectionById[sectionId]
                }
                nextSelection = {
                    totalSelectedCount: (prevSelection?.totalSelectedCount ?? 0) - (prevSectionSelection?.selectedCount ?? 0) + (nextSectionSelection?.selectedCount ?? 0),
                    sectionSelectionById: nextSectionSelectionById
                }
            }
            store.dispatch(setLibrarySelectionAction(nextSelection, { sectionId, photoId }))
        }
    },

    applyPreselection() {
        const state = store.getState()
        const preselectionRange = getPreselectionRange(state)
        const prevSelection = state.library.selection
        const { sections } = state.data
        if (!preselectionRange || !prevSelection) {
            return
        }

        const { selected, startSectionIndex, endSectionIndex } = preselectionRange
        let nextTotalSelectedCount = prevSelection.totalSelectedCount
        const nextSectionSelectionById = { ...prevSelection.sectionSelectionById }
        for (let sectionIndex = startSectionIndex; sectionIndex <= endSectionIndex; sectionIndex++) {
            const sectionId = sections.ids[sectionIndex]
            const section = sections.byId[sectionId]
            const prevSectionSelection = prevSelection.sectionSelectionById[sectionId]

            let nextSectionSelection: SectionSelectionState | null = null
            if (sectionIndex !== startSectionIndex && sectionIndex !== endSectionIndex) {
                nextSectionSelection = selected ? { sectionId, selectedCount: section.count, selectedPhotosById: 'all' } : null
            } else if (isLoadedPhotoSection(section)) {
                const prevSelectedPhotosById = prevSectionSelection?.selectedPhotosById
                const startPhotoIndex = (sectionIndex === startSectionIndex) ? preselectionRange.startPhotoIndex : 0
                const endPhotoIndex   = (sectionIndex === endSectionIndex) ? preselectionRange.endPhotoIndex : (section.count - 1)

                let selectedCount = 0
                let selectedPhotosById: 'all' | { [K in PhotoId]?: true } = {}
                for (let photoIndex = 0; photoIndex < section.photoIds.length; photoIndex++) {
                    const photoId = section.photoIds[photoIndex]
                    if ((photoIndex >= startPhotoIndex && photoIndex <= endPhotoIndex) ?
                        selected :
                        (prevSelectedPhotosById === 'all' || prevSelectedPhotosById?.[photoId]))
                    {
                        selectedCount++
                        selectedPhotosById[photoId] = true
                    }
                }
                if (selectedCount === section.count) {
                    selectedPhotosById = 'all'
                }

                nextSectionSelection = (selectedCount) ? { sectionId, selectedCount, selectedPhotosById } : null
            }

            nextTotalSelectedCount += (nextSectionSelection?.selectedCount ?? 0) - (prevSectionSelection?.selectedCount ?? 0)
            if (nextSectionSelection) {
                nextSectionSelectionById[sectionId] = nextSectionSelection
            } else {
                delete nextSectionSelectionById[sectionId]
            }
        }

        store.dispatch(setLibrarySelectionAction(
            nextTotalSelectedCount ?
                { totalSelectedCount: nextTotalSelectedCount, sectionSelectionById: nextSectionSelectionById } :
                null,
            state.library.hoverPhoto || undefined))
    },

    clearSelection() {
        store.dispatch(setLibrarySelectionAction(null))
    },

// TODO
//    private setActivePhoto(sectionId: PhotoSectionId, photoId: PhotoId) {
//        const props = this.props
//
//        if (sectionId === props.selectedSectionId && isMac ? event.metaKey : event.ctrlKey) {
//            const photoIndex = props.selectedPhotoIds.indexOf(photoId)
//            const highlight = props.selectedPhotoIds && photoIndex === -1
//            if (highlight) {
//                if (photoIndex === -1) {
//                    props.setSelectedPhotos(sectionId, [ ...props.selectedPhotoIds, photoId ])
//                }
//            } else {
//                props.setSelectedPhotos(sectionId, cloneArrayWithItemRemoved(props.selectedPhotoIds, photoId))
//            }
//        } else {
//            props.setSelectedPhotos(sectionId, [ photoId ])
//        }
//    }

}


function findPhotoIndexOfNextRowAtX(preferredX: number, sectionLayout: GridSectionLayout | undefined, moveUp: boolean,
    startPhotoIndex?: number): number | null
{
    if (!sectionLayout || !sectionLayout.boxes) {
        return null
    }

    let startRowTop: number
    let firstPhotoIndexToCheck: number
    const startPhotoBox = (startPhotoIndex !== undefined) ? sectionLayout.boxes[startPhotoIndex] : undefined
    if (startPhotoBox) {
        startRowTop = startPhotoBox.top
        firstPhotoIndexToCheck = startPhotoIndex! + (moveUp ? -1 : 1)
    } else {
        startRowTop = -1
        firstPhotoIndexToCheck = moveUp ? (sectionLayout.boxes.length - 1) : 0
    }

    let prevRowTop = -1
    let bestBoxCenterXDiff = Number.POSITIVE_INFINITY
    let bestPhotoIndex: number | null = null
    for (let boxIndex = firstPhotoIndexToCheck; moveUp ? boxIndex >= 0 : boxIndex < sectionLayout.boxes.length; moveUp ? boxIndex-- : boxIndex++) {
        const box = sectionLayout.boxes[boxIndex]
        if (box.top !== startRowTop) {
            if (prevRowTop === -1) {
                prevRowTop = box.top
            } else if (box.top !== prevRowTop) {
                // We are one row too far
                break
            }

            const boxCenterX = box.left + box.width / 2
            const boxCenterXDiff = Math.abs(preferredX - boxCenterX)
            if (boxCenterXDiff < bestBoxCenterXDiff) {
                bestBoxCenterXDiff = boxCenterXDiff
                bestPhotoIndex = boxIndex
            }
        }
    }

    return bestPhotoIndex
}
