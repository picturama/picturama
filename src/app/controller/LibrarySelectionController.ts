import { isLoadedPhotoSection, PhotoId, PhotoSectionId } from 'common/CommonTypes'
import { assertRendererProcess } from 'common/util/ElectronUtil'

import { setLibraryActivePhotoAction, setLibrarySelectionAction } from 'app/state/actions'
import { PhotoLibraryPosition, SectionSelectionState, SelectionState } from 'app/state/StateTypes'
import store from 'app/state/store'

import { getPrevGridLayout } from './LibraryController'


assertRendererProcess()


export type MoveDirection = 'left' | 'right' | 'up' | 'down'


export interface LibrarySelectionController {
    setActivePhoto(activePhoto: PhotoLibraryPosition | null): void
    moveActivePhoto(direction: MoveDirection): void
    setSectionSelected(sectionId: PhotoSectionId, selected: boolean): void
    setPhotoSelected(sectionId: PhotoSectionId, photoId: PhotoId, selected: boolean): void
    clearSelection(): void
}


export const defaultLibrarySelectionController: LibrarySelectionController = {

    setActivePhoto(activePhoto: PhotoLibraryPosition | null): void {
        store.dispatch(setLibraryActivePhotoAction(activePhoto))
    },

    moveActivePhoto(direction: MoveDirection): void {
        const state = store.getState()
        const { activePhoto } = state.library

        if (!activePhoto) {
            return
        }

        const activePhotoSection = state.data.sections.byId[activePhoto.sectionId]
        if (!isLoadedPhotoSection(activePhotoSection)) {
            return
        }

        let activePhotoIndex = activePhotoSection.photoIds.indexOf(activePhoto.photoId)

        let nextPhotoIndex = activePhotoIndex
        if (direction === 'left' || direction === 'right') {
            nextPhotoIndex += (direction === 'left' ? -1 : 1)
        } else {
            const gridLayout = getPrevGridLayout()
            const activePhotoSectionIndex = state.data.sections.ids.indexOf(activePhoto.sectionId)
            const sectionLayout = gridLayout.sectionLayouts[activePhotoSectionIndex]
            if (sectionLayout && sectionLayout.boxes) {
                const currentPhotoBox = sectionLayout.boxes[activePhotoIndex]
                if (currentPhotoBox) {
                    const currentPhotoCenterX = currentPhotoBox.left + currentPhotoBox.width / 2
                    const moveUp = (direction === 'up')
                    let prevRowTopY = -1
                    let bestBoxCenterXDiff = Number.POSITIVE_INFINITY
                    for (let boxIndex = activePhotoIndex + (moveUp ? -1 : 1); moveUp ? boxIndex >= 0 : boxIndex < sectionLayout.boxes.length; moveUp ? boxIndex-- : boxIndex++) {
                        const box = sectionLayout.boxes[boxIndex]
                        if (box.top !== currentPhotoBox.top) {
                            if (prevRowTopY === -1) {
                                prevRowTopY = box.top
                            } else if (box.top !== prevRowTopY) {
                                // We are one row to far
                                break
                            }

                            const boxCenterX = box.left + box.width / 2
                            const boxCenterXDiff = Math.abs(currentPhotoCenterX - boxCenterX)
                            if (boxCenterXDiff < bestBoxCenterXDiff) {
                                bestBoxCenterXDiff = boxCenterXDiff
                                nextPhotoIndex = boxIndex
                            }
                        }
                    }
                }
            }
        }

        const nextPhotoId = activePhotoSection.photoIds[nextPhotoIndex]
        if (nextPhotoId) {
            store.dispatch(setLibraryActivePhotoAction({
                sectionId: activePhoto.sectionId,
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
