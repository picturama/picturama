import createLayout from 'justified-layout'

import { profileLibraryLayout, profileThumbnailRenderer } from 'common/LogConstants'
import { PhotoSectionId, PhotoSectionById, LoadedPhotoSection, isLoadedPhotoSection, Photo, PhotoId } from 'common/CommonTypes'
import CancelablePromise, { isCancelError } from 'common/util/CancelablePromise'
import { getMasterPath } from 'common/util/DataUtil'
import Profiler from 'common/util/Profiler'
import SerialJobQueue from 'common/util/SerialJobQueue'

import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import { GridSectionLayout, GridLayout, JustifiedLayoutBox } from 'app/UITypes'
import { sectionHeadHeight } from 'app/ui/library/GridSection'
import { forgetSectionPhotosAction, fetchSectionPhotosAction, setLibraryInfoPhotoAction } from 'app/state/actions'
import store from 'app/state/store'

import { getThumbnailSrc } from './PhotoController'


/**
 * A nailed grid position.
 *
 * **Background:** If the grid data is updated or if sizes are changing, we don't want the grid to keep its scroll
 * position in terms of pixels. Instead we want the grid to stay at the same photos it showed before.
 * A `NailedGridPosition` describes the position of photos shown by the grid at a certain moment.
 * This information is used to restore that position after the mentioned changes were applied.
 */
export interface NailedGridPosition {
    /** The position of the photos in view */
    positions: PhotoGridPosition[]
}

/** A y-position within a photo  */
export interface PhotoGridPosition {
    sectionId: PhotoSectionId
    photoId: PhotoId
    /**
     * The relative position within the photo.
     * Has a value between `0` and `1`: `0` = photo's top, `1` = photo's bottom
     */
    relativeY: number
    /**
     * The offset to apply (in pixels).
     * 
     * This is normally `0`. Will be set to another value if the position is outside the photo
     * - so `relativeY` is either `0` or `1`.
     */
    offsetY: number
}


const pagesToKeep = 4
const pagesToPreload = 3
const averageAspect = 3 / 2
const containerPadding = 10
export const boxSpacing = 2

let prevSectionIds: PhotoSectionId[] = []
let prevSectionById: PhotoSectionById = {}
let prevGridLayout: GridLayout = { fromSectionIndex: 0, toSectionIndex: 0, sectionLayouts: [] }
let prevScrollTop = 0
let prevViewportWidth = 0
let prevViewportHeight = 0
let prevGridRowHeight = -1

let isFetchingSectionPhotos = false


export type GetGridLayoutFunction = typeof getGridLayout

export function getGridLayout(sectionIds: PhotoSectionId[], sectionById: PhotoSectionById,
    scrollTop: number, viewportWidth: number, viewportHeight: number, gridRowHeight: number,
    nailedGridPosition: NailedGridPosition | null):
    GridLayout
{
    const profiler = profileLibraryLayout ? new Profiler(`Calculating layout for ${sectionIds.length} sections`) : null

    let sectionsChanged = false
    let fromSectionIndex: number | null = null
    let toSectionIndex: number | null = null
    let sectionLayouts: GridSectionLayout[] = []
    const prevGridLayoutIsDirty = (viewportWidth !== prevViewportWidth) || (gridRowHeight !== prevGridRowHeight)

    let inDomMinY: number | null = null
    let inDomMaxY: number | null = null
    if (nailedGridPosition === null) {
        inDomMinY = scrollTop - pagesToPreload * viewportHeight
        inDomMaxY = scrollTop + (pagesToPreload + 1) * viewportHeight
    }

    let sectionTop = 0
    const sectionCount = sectionIds.length
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
        const sectionId = sectionIds[sectionIndex]
        const section = sectionById[sectionId]

        const usePlaceholder = !isLoadedPhotoSection(section)
        const prevLayout = (sectionId === prevSectionIds[sectionIndex]) ? prevGridLayout.sectionLayouts[sectionIndex] : null
        const prevLayoutIsDirty = prevGridLayoutIsDirty ||
            (!usePlaceholder && section !== prevSectionById[prevSectionIds[sectionIndex]])
                // We have to compare sections, not section IDs in order to detect changes inside the section.
                // See `createLayoutForLoadedSection`

        let layout: GridSectionLayout | null = null
        if (prevLayout && !prevLayoutIsDirty) {
            const prevLayoutIsPlaceholder = !prevLayout.boxes
            if (usePlaceholder == prevLayoutIsPlaceholder) {
                layout = prevLayout
            }
        }

        if (layout) {
            if (layout.sectionTop !== sectionTop) {
                layout.sectionTop = sectionTop
                sectionsChanged = true
            }
        } else {
            sectionsChanged = true
            // We have to update the layout
            if (usePlaceholder) {
                if (prevLayout && !prevLayoutIsDirty) {
                    // Section data was dropped -> Drop layout boxes as well
                    layout = { sectionTop, containerHeight: prevLayout.containerHeight }
                } else {
                    layout = { sectionTop, containerHeight: estimateContainerHeight(viewportWidth, gridRowHeight, section.count) }
                }
            } else {
                // Calculate boxes
                layout = createLayoutForLoadedSection(section as LoadedPhotoSection, sectionTop, viewportWidth, gridRowHeight)
            }
        }

        const sectionHeight = sectionHeadHeight + layout.containerHeight
        const sectionBottom = sectionTop + sectionHeight
        if (inDomMinY === null || inDomMaxY === null) {
            // We have a NailedGridPosition
            // -> Just keep the previous `fromBoxIndex` and `toBoxIndex`
            if (layout.boxes && prevLayout && prevLayout.boxes && layout.boxes.length === prevLayout.boxes.length) {
                layout.fromBoxIndex = prevLayout.fromBoxIndex
                layout.toBoxIndex = prevLayout.toBoxIndex
            }
        } else {
            // We have no NailedGridPosition
            // -> Set `fromBoxIndex` and `toBoxIndex` in order to control which photos are added to the DOM
            if (sectionBottom >= inDomMinY && sectionTop <= inDomMaxY) {
                // Show section in DOM

                if (fromSectionIndex === null) {
                    fromSectionIndex = sectionIndex
                }

                if (!layout.boxes) {
                    // Section is not loaded yet, but will be shown in DOM -> Create dummy boxes
                    layout.boxes = createDummyLayoutBoxes(viewportWidth, gridRowHeight, layout.containerHeight, section.count)
                }

                const prevFromBoxIndex = layout.fromBoxIndex
                const prevToBoxIndex = layout.toBoxIndex
                layout.fromBoxIndex = 0
                layout.toBoxIndex = section.count
                if (sectionTop < inDomMinY || sectionBottom > inDomMaxY) {
                    // This section is party visible -> Go throw the boxes and find the correct boundaries
                    const boxes = layout.boxes
                    const boxCount = boxes.length
    
                    let searchingStart = true
                    for (let boxIndex = 0; boxIndex < boxCount; boxIndex++) {
                        const box = boxes[boxIndex]
                        const boxTop = sectionTop + sectionHeadHeight + box.top
                        const boxBottom = boxTop + box.height
                        if (searchingStart) {
                            if (boxBottom >= inDomMinY) {
                                layout.fromBoxIndex = boxIndex
                                searchingStart = false
                            }
                        } else if (boxTop > inDomMaxY) {
                            layout.toBoxIndex = boxIndex
                            break
                        }
                    }
                }
                if (layout.fromBoxIndex !== prevFromBoxIndex || layout.toBoxIndex !== prevToBoxIndex) {
                    sectionsChanged = true
                }
            } else {
                // Remove section from DOM
                if (toSectionIndex === null && fromSectionIndex !== null) {
                    // This is the first section to remove from DOM -> Remember its index
                    toSectionIndex = sectionIndex
                }
                if (layout.boxes) {
                    // This section is fully invisible -> Keep the layout but add no photos to the DOM
                    layout.fromBoxIndex = undefined
                    layout.toBoxIndex = undefined
                }
            }
        }

        sectionLayouts.push(layout)

        // Prepare next iteration
        sectionTop = sectionBottom
    }

    if (toSectionIndex === null) {
        toSectionIndex = sectionCount
    }

    if (nailedGridPosition === null) {
        forgetAndFetchSections(sectionIds, sectionById, scrollTop, viewportHeight, sectionLayouts)
    }

    if (profiler) {
        profiler.addPoint('Calculated layout')
        profiler.logResult()
    }

    let nextGridLayout: GridLayout
    if (sectionsChanged
        || fromSectionIndex !== prevGridLayout.fromSectionIndex
        || toSectionIndex !== prevGridLayout.toSectionIndex)
    {
        nextGridLayout = {
            fromSectionIndex: fromSectionIndex || 0,
            toSectionIndex: toSectionIndex || 0,
            sectionLayouts
        }
    } else {
        nextGridLayout = prevGridLayout
    }

    prevSectionIds = sectionIds
    prevSectionById = sectionById
    prevGridLayout = nextGridLayout
    if (nailedGridPosition === null) {
        prevScrollTop = scrollTop
    }
    prevViewportWidth = viewportWidth
    prevViewportHeight = viewportHeight
    prevGridRowHeight = gridRowHeight

    return nextGridLayout
}


export function createLayoutForLoadedSection(section: LoadedPhotoSection, sectionTop: number, containerWidth: number, targetRowHeight: number): GridSectionLayout {
    const { photoData } = section

    const aspects = section.photoIds.map(photoId => {
        const photo = photoData[photoId]
        const { edited_width, edited_height } = photo
        // If we have no edited size yet (which happens when loading an old DB were it was missing), the following will happen:
        //   - We calculate a layout using the average aspect (which is how the loading rect of the photo is shown)
        //   - `PhotoRenderer.renderPhoto` will detect that the edited size is missing and will update the DB
        //   - The Grid will trigger a layout, because the photo has changed in the app state
        //   - `getLayoutForSections` will detect that the section changed and so it will get a ney layout using the correct edited size
        return (edited_width && edited_height) ? (edited_width / edited_height) : averageAspect
    })
    const layout = createLayout(aspects, { containerPadding, boxSpacing, containerWidth, targetRowHeight })
    layout.sectionTop = sectionTop
    layout.containerHeight = Math.round(layout.containerHeight)
    return layout
}


export function estimateContainerHeight(viewportWidth: number, gridRowHeight: number, photoCount: number): number {
    if (viewportWidth === 0) {
        return 2 * containerPadding + photoCount * gridRowHeight + (photoCount - 1) * boxSpacing
    } else {
        // Estimate section height (assuming a normal landscape aspect ratio of 3:2)
        const unwrappedWidth = averageAspect * photoCount * gridRowHeight
        const rows = Math.ceil(unwrappedWidth / viewportWidth)
        return 2 * containerPadding + rows * gridRowHeight + (rows - 1) * boxSpacing
    }
}

export function createDummyLayoutBoxes(viewportWidth: number, gridRowHeight: number, containerHeight: number, photoCount: number): JustifiedLayoutBox[] {
    const rowCount = Math.round((containerHeight - 2 * containerPadding + boxSpacing) / (gridRowHeight + boxSpacing))   // Reverse `estimateContainerHeight`
    let boxes: JustifiedLayoutBox[] = []
    for (let row = 0; row < rowCount; row++) {
        const lastBoxIndex = Math.ceil(photoCount * (row + 1) / rowCount)  // index is excluding
        const colCount = lastBoxIndex - boxes.length
        let boxWidth = (viewportWidth - 2 * containerPadding - (colCount - 1) * boxSpacing) / colCount
        if (row === rowCount - 1) {
            boxWidth = Math.min(boxWidth, averageAspect * gridRowHeight)
        }
        const aspectRatio = boxWidth / gridRowHeight

        for (let col = 0; col < colCount; col++) {
            if (boxes.length >= photoCount) {
                break
            }
            boxes.push({
                aspectRatio,
                left: containerPadding + col * boxWidth + (col - 1) * boxSpacing,
                top: containerPadding + row * (gridRowHeight + boxSpacing),
                width: boxWidth,
                height: gridRowHeight
            })
        }
    }
    return boxes
}


/** Determines which sections we have to load or forget */
function forgetAndFetchSections(sectionIds: PhotoSectionId[], sectionById: PhotoSectionById,
    viewportTop: number, viewportHeight: number, sectionLayouts: GridSectionLayout[])
{
    let sectionIdsToProtect: { [index: string]: true } | null = null
    let sectionIdsToForget: { [index: string]: true } | null = null
    let sectionIdsToLoad: PhotoSectionId[] | null = null

    const isScrollingDown = (viewportTop >= prevScrollTop)
    const keepMinY = viewportTop - pagesToKeep * viewportHeight
    const keepMaxY = viewportTop + (pagesToKeep + 1) * viewportHeight
    const preloadMinY = viewportTop - (isScrollingDown ? 0 : pagesToPreload) * viewportHeight
    const preloadMaxY = viewportTop + ((isScrollingDown ? pagesToPreload : 0) + 1) * viewportHeight

    for (let sectionIndex = 0, sectionCount = sectionIds.length; sectionIndex < sectionCount; sectionIndex++) {
        const sectionId = sectionIds[sectionIndex]
        const section = sectionById[sectionId]
        const layout = sectionLayouts[sectionIndex]

        const sectionTop = layout.sectionTop
        const sectionBottom = sectionTop + sectionHeadHeight + layout.containerHeight
        if (isLoadedPhotoSection(section)) {
            const keepSection = sectionBottom > keepMinY && sectionTop < keepMaxY
            if (!keepSection) {
                if (!sectionIdsToProtect) {
                    sectionIdsToProtect = getSectionIdsToProtect()
                }

                if (!sectionIdsToProtect[sectionId]) {
                    if (!sectionIdsToForget) {
                        sectionIdsToForget = {}
                    }
                    sectionIdsToForget[sectionId] = true
                }
            }
        } else if (!isFetchingSectionPhotos) {
            const loadSection = sectionBottom > preloadMinY && sectionTop < preloadMaxY
            if (loadSection) {
                if (!sectionIdsToLoad) {
                    sectionIdsToLoad = [ sectionId ]
                } else {
                    sectionIdsToLoad.push(sectionId)
                }
            }
        }
    }

    if (sectionIdsToForget) {
        const nailedSectionIdsToForget = sectionIdsToForget
        setTimeout(() => store.dispatch(forgetSectionPhotosAction(nailedSectionIdsToForget)))
    }
    if (sectionIdsToLoad) {
        fetchSectionPhotos(sectionIdsToLoad)
    }
}


function getSectionIdsToProtect(): { [index: string]: true } {
    const state = store.getState()
    let sectionsToProtect = {}

    const selectedSectionId = state.library.selection.sectionId
    if (selectedSectionId) {
        sectionsToProtect[selectedSectionId] = true
    }

    if (state.library.info) {
        sectionsToProtect[state.library.info.sectionId] = true
    }

    if (state.detail) {
        sectionsToProtect[state.detail.currentPhoto.sectionId] = true
    }

    if (state.export) {
        sectionsToProtect[state.export.sectionId] = true
    }

    return sectionsToProtect
}


function fetchSectionPhotos(sectionIds: PhotoSectionId[]) {
    if (isFetchingSectionPhotos) {
        return
    }

    const filter = store.getState().library.filter

    isFetchingSectionPhotos = true
    BackgroundClient.fetchSectionPhotos(sectionIds, filter)
        .then(photoSets => {
            isFetchingSectionPhotos = false
            store.dispatch(fetchSectionPhotosAction(sectionIds, photoSets))
        })
        .catch(error => {
            isFetchingSectionPhotos = false
            showError(`Fetching photos for sections ${sectionIds.join(', ')} failed`, error)
        })
}


let runningInfoPhotoDetailPromise: CancelablePromise<void> | null = null

export function setInfoPhoto(sectionId: PhotoSectionId | null, photoId: PhotoId | null) {
    store.dispatch(setLibraryInfoPhotoAction.request({ sectionId, photoId }))
    if (runningInfoPhotoDetailPromise) {
        runningInfoPhotoDetailPromise.cancel()
        runningInfoPhotoDetailPromise = null
    }

    if (photoId) {
        runningInfoPhotoDetailPromise = new CancelablePromise(BackgroundClient.fetchPhotoDetail(photoId))
            .then(photoDetail => store.dispatch(setLibraryInfoPhotoAction.success({ photoDetail })))
            .catch(error => {
                if (!isCancelError(error)) {
                    store.dispatch(setLibraryInfoPhotoAction.failure(error))
                    showError('Fetching photo detail failed', error)
                }
            })
    }
}


type CreateThumbnailJob = { isCancelled: boolean, sectionId: PhotoSectionId, photo: Photo, profiler: Profiler | null }

const createThumbnailQueue = new SerialJobQueue(
    (newJob, existingJob) => (newJob.photo.id === existingJob.photo.id) ? newJob : null,
    createNextThumbnail,
    getThumbnailPriority)

export function createThumbnail(sectionId: PhotoSectionId, photo: Photo): CancelablePromise<string> {
    const profiler = profileThumbnailRenderer ? new Profiler(`Creating thumbnail for ${getMasterPath(photo)}`) : null

    const job: CreateThumbnailJob = { isCancelled: false, sectionId, photo, profiler }

    return new CancelablePromise<string>(
        createThumbnailQueue.addJob(job)
            .then(() => {
                if (profiler) profiler.logResult()
                return getThumbnailSrc(photo)
            })
    )
    .catch(error => {
        if (isCancelError(error)) {
            job.isCancelled = true
        }
        throw error
    })
}

async function createNextThumbnail(job: CreateThumbnailJob): Promise<void> {
    if (job.isCancelled) {
        return
    }

    await BackgroundClient.createThumbnail(job.photo)
    if (job.profiler) {
        job.profiler.addPoint('Create thumbnail on disk')
    }
}

function getThumbnailPriority(job: CreateThumbnailJob): number {
    const { sectionId, photo } = job
    const sectionIndex = prevSectionIds.indexOf(sectionId)
    const section = prevSectionById[sectionId]
    const layout = prevGridLayout.sectionLayouts[sectionIndex]
    if (!isLoadedPhotoSection(section) || !layout || !layout.boxes) {
        return Number.MIN_VALUE
    }

    const photoIndex = section.photoIds.indexOf(photo.id)
    const box = layout.boxes[photoIndex]
    if (!box) {
        return Number.MIN_VALUE
    }

    const boxTop = layout.sectionTop + sectionHeadHeight + box.top
    if (boxTop < prevScrollTop) {
        // Box is above viewport (or only partly visible) -> Use a negative prio reflecting the distance
        return boxTop - prevScrollTop
    }

    const boxBottom = boxTop + box.height
    const scrollBottom = prevScrollTop + prevViewportHeight
    if (boxBottom > scrollBottom) {
        // Box is below viewport (or only partly visible) -> Use a negative prio reflecting the distance
        return scrollBottom - boxBottom
    }

    // Box is fully visible -> Use a positive prio reflecting position (images should appear in reading order)
    const prio = (scrollBottom - boxTop) + (prevViewportWidth - box.left) / prevViewportWidth
    return prio
}
