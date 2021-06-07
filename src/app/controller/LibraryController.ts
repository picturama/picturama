import createLayout from 'justified-layout'

import { profileLibraryLayout, profileThumbnailRenderer } from 'common/LogConstants'
import { PhotoSectionId, PhotoSectionById, LoadedPhotoSection, isLoadedPhotoSection, Photo, PhotoId, PhotoSet } from 'common/CommonTypes'
import CancelablePromise, { isCancelError } from 'common/util/CancelablePromise'
import { getMasterPath } from 'common/util/DataUtil'
import { assertRendererProcess } from 'common/util/ElectronUtil'
import Profiler from 'common/util/Profiler'
import SerialJobQueue from 'common/util/SerialJobQueue'

import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import { GridSectionLayout, GridLayout, JustifiedLayoutBox } from 'app/UITypes'
import { sectionHeadHeight } from 'app/ui/library/GridSection'
import { forgetSectionPhotosAction, fetchSectionPhotosAction } from 'app/state/actions'
import store from 'app/state/store'

import { getThumbnailSrc } from './PhotoController'
import { collectionContainsSection } from 'app/util/PhotoCollectionResolver'


assertRendererProcess()


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
export const boxSpacing = 4
const sectionSpacingX = 30
const targetRowHeightTolerance = 0.25

let prevSectionIds: PhotoSectionId[] = []
let prevSectionById: PhotoSectionById = {}
let prevGridLayout: GridLayout = { fromSectionIndex: 0, toSectionIndex: 0, sectionLayouts: [] }
let prevScrollTop = 0
let prevViewportWidth = 0
let prevViewportHeight = 0
let prevGridRowHeight = -1

let isFetchingSectionPhotos = false


export function getPrevGridLayout(): GridLayout {
    return prevGridLayout
}

export type GetGridLayoutFunction = typeof getGridLayoutWithoutStoreUpdate

export function getGridLayoutWithoutStoreUpdate(sectionIds: PhotoSectionId[], sectionById: PhotoSectionById,
    scrollTop: number, viewportWidth: number, viewportHeight: number, gridRowHeight: number,
    nailedGridPosition: NailedGridPosition | null):
    GridLayout
{
    const profiler = profileLibraryLayout ? new Profiler(`Calculating layout for ${sectionIds.length} sections`) : null

    let sectionsChanged = false
    let fromSectionIndex: number | null = null
    let toSectionIndex: number | null = null
    const prevGridLayoutIsDirty = (viewportWidth !== prevViewportWidth) || (gridRowHeight !== prevGridRowHeight)

    // Step 1: Section-internal layout (layout photos inside each section):
    //
    //   - Create a layout for each section
    //   - Define `width` and `height`
    //   - Define `boxes` for loaded sections

    const sectionCount = sectionIds.length
    const sectionLayouts: GridSectionLayout[] = []
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

        if (!layout) {
            sectionsChanged = true
            // We have to update the layout
            if (usePlaceholder) {
                if (prevLayout && !prevLayoutIsDirty) {
                    // Section data was dropped -> Drop layout boxes as well
                    layout = {
                        left: 0,
                        top: 0,
                        width: prevLayout.width,
                        height: prevLayout.height
                    }
                } else {
                    layout = estimateSectionLayout(section.count, viewportWidth, gridRowHeight)
                }
            } else {
                // Calculate boxes
                layout = createLayoutForLoadedSection(section as LoadedPhotoSection, viewportWidth, gridRowHeight)
            }
        }

        sectionLayouts.push(layout)
    }

    if (profiler) {
        profiler.addPoint('Section-internal layout')
    }

    // Step 2: Inter-section layout:
    //
    //   - Define `left` and `top`
    //   - Do block-align for small sections shown in one row. This may scale those sections, so their
    //     `width` and `height` change

    let x = 0
    let y = 0
    let rowStartSectionIndex = 0
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
        const layout = sectionLayouts[sectionIndex]
        const originalLayout = layout.originalLayout || layout

        if (x != 0 && viewportWidth > 0 && x + originalLayout.width > viewportWidth) {
            // This section goes into a new row

            // Layout the row before
            const hasChange = layoutSectionRow(y, rowStartSectionIndex, sectionIndex - 1, sectionLayouts, viewportWidth)
            if (hasChange) {
                sectionsChanged = true
            }

            // Start a new row
            const prevLayout = sectionLayouts[sectionIndex - 1]
            x = 0
            y += prevLayout.height
            rowStartSectionIndex = sectionIndex
        }

        // Prepare next iteration
        x += originalLayout.width + sectionSpacingX
    }

    // Layout the last row
    const hasChange = layoutSectionRow(y, rowStartSectionIndex, sectionCount - 1, sectionLayouts, viewportWidth)
    if (hasChange) {
        sectionsChanged = true
    }

    if (profiler) {
        profiler.addPoint('Inter-section layout')
    }

    // Step 3: Mark visible parts of sections:
    //
    //   - Define `fromBoxIndex` and `toBoxIndex`

    let inDomMinY: number | null = null
    let inDomMaxY: number | null = null
    if (nailedGridPosition === null) {
        inDomMinY = scrollTop - pagesToPreload * viewportHeight
        inDomMaxY = scrollTop + (pagesToPreload + 1) * viewportHeight
    }

    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
        const sectionId = sectionIds[sectionIndex]
        const layout = sectionLayouts[sectionIndex]

        const sectionBottom = layout.top + layout.height
        if (inDomMinY === null || inDomMaxY === null) {
            // We have a NailedGridPosition
            // -> Just keep the previous `fromBoxIndex` and `toBoxIndex`
            const prevLayout = (sectionId === prevSectionIds[sectionIndex]) ? prevGridLayout.sectionLayouts[sectionIndex] : null
            if (layout.boxes && prevLayout && prevLayout.boxes && layout.boxes.length === prevLayout.boxes.length) {
                layout.fromBoxIndex = prevLayout.fromBoxIndex
                layout.toBoxIndex = prevLayout.toBoxIndex
            }
        } else {
            // We have no NailedGridPosition
            // -> Set `fromBoxIndex` and `toBoxIndex` in order to control which photos are added to the DOM
            if (sectionBottom >= inDomMinY && layout.top <= inDomMaxY) {
                // Show section in DOM
                const section = sectionById[sectionId]

                if (fromSectionIndex === null) {
                    fromSectionIndex = sectionIndex
                }

                if (!layout.boxes) {
                    // Section is not loaded yet, but will be shown in DOM -> Create dummy boxes
                    const sectionBodyHeight = layout.height - sectionHeadHeight
                    layout.boxes = createDummyLayoutBoxes(layout.width, sectionBodyHeight, gridRowHeight, section.count)
                }

                const prevFromBoxIndex = layout.fromBoxIndex
                const prevToBoxIndex = layout.toBoxIndex
                layout.fromBoxIndex = 0
                layout.toBoxIndex = section.count
                if (layout.top < inDomMinY || sectionBottom > inDomMaxY) {
                    // This section is partly visible -> Go throw the boxes and find the correct boundaries
                    const boxes = layout.boxes
                    const boxCount = boxes.length

                    let searchingStart = true
                    for (let boxIndex = 0; boxIndex < boxCount; boxIndex++) {
                        const box = boxes[boxIndex]
                        const boxTop = layout.top + sectionHeadHeight + box.top
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
    }

    if (toSectionIndex === null) {
        toSectionIndex = sectionCount
    }

    if (profiler) {
        profiler.addPoint('Mark visible parts of sections')
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

    if (profiler) {
        profiler.addPoint('Finish layout')
        profiler.logResult()
    }

    return nextGridLayout
}


export function getGridLayoutAndUpdateStore(sectionIds: PhotoSectionId[], sectionById: PhotoSectionById,
    scrollTop: number, viewportWidth: number, viewportHeight: number, gridRowHeight: number,
    nailedGridPosition: NailedGridPosition | null):
    GridLayout
{
    const gridLayout = getGridLayoutWithoutStoreUpdate(sectionIds, sectionById, scrollTop, viewportWidth, viewportHeight, gridRowHeight,
        nailedGridPosition)

    if (nailedGridPosition === null) {
        forgetAndFetchSections(sectionIds, sectionById, scrollTop, viewportHeight, gridLayout.sectionLayouts)
    }

    return gridLayout
}


export function createLayoutForLoadedSection(section: LoadedPhotoSection, viewportWidth: number, targetRowHeight: number): GridSectionLayout {
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
    const layoutResult = createLayout(aspects, { containerPadding, boxSpacing, containerWidth: viewportWidth, targetRowHeight, targetRowHeightTolerance })

    const { boxes } = layoutResult

    const firstBox = boxes[0]
    const lastBox = boxes[boxes.length - 1]
    const isSingleRow = (lastBox.top === firstBox.top)

    const bodyHeight = Math.round(layoutResult.containerHeight)

    return {
        left: 0,
        top: 0,
        width: isSingleRow ? Math.ceil(lastBox.left + lastBox.width + containerPadding) : viewportWidth,
        height: sectionHeadHeight + bodyHeight,
        boxes
    }
}


export function estimateSectionLayout(photoCount: number, viewportWidth: number, gridRowHeight: number, ): GridSectionLayout {
    let bodyWidth: number
    let bodyHeight: number
    if (viewportWidth === 0) {
        bodyWidth = 0
        bodyHeight = 2 * containerPadding + photoCount * gridRowHeight + (photoCount - 1) * boxSpacing
    } else {
        // Estimate section height (assuming a normal landscape aspect ratio of 3:2)
        const photoWidth = averageAspect * gridRowHeight
        const unwrappedWidth = photoCount * photoWidth
        const rows = Math.ceil(unwrappedWidth / viewportWidth)
        bodyWidth = Math.min(unwrappedWidth, viewportWidth)
        bodyHeight = 2 * containerPadding + rows * gridRowHeight + (rows - 1) * boxSpacing
    }

    return {
        left: 0,
        top: 0,
        width: bodyWidth,
        height: sectionHeadHeight + bodyHeight
    }
}


function layoutSectionRow(rowTop: number, rowStartSectionIndex: number, rowEndSectionIndex: number, sectionLayouts: GridSectionLayout[],
    viewportWidth: number): boolean
{
    let sectionsChanged = false
    let scaleFactor = 1
    if (rowStartSectionIndex !== rowEndSectionIndex) {
        // This row has multiple sections -> Determine the scale factor in order to block-align them

        let allLayoutsHaveBoxes = true
        let totalBoxWidth = 0
        let totalSpacingWidth = -sectionSpacingX
        for (let sectionIndex = rowStartSectionIndex; sectionIndex <= rowEndSectionIndex; sectionIndex++) {
            const layout = sectionLayouts[sectionIndex]
            const originalLayout = layout.originalLayout || layout

            if (originalLayout.boxes) {
                totalSpacingWidth += sectionSpacingX + 2 * containerPadding + (originalLayout.boxes.length - 1) * boxSpacing
                for (const box of originalLayout.boxes) {
                    totalBoxWidth += box.width
                }
            } else {
                allLayoutsHaveBoxes = false
                break
            }
        }

        if (allLayoutsHaveBoxes) {
            const wantedTotalBoxWidth = viewportWidth - totalSpacingWidth
            scaleFactor = wantedTotalBoxWidth / totalBoxWidth
            if (scaleFactor > 1 + targetRowHeightTolerance) {
                scaleFactor = 1
            }
        }
    }

    let x = 0
    for (let sectionIndex = rowStartSectionIndex; sectionIndex <= rowEndSectionIndex; sectionIndex++) {
        let layout = sectionLayouts[sectionIndex]

        if (scaleFactor === 1) {
            if (layout.originalLayout) {
                // Use the original (unscaled) layout
                layout = layout.originalLayout
                sectionLayouts[rowStartSectionIndex] = layout
                sectionsChanged = true
            }
        } else if (layout.scaleFactor !== scaleFactor) {
            const originalLayout = layout.originalLayout || layout
            const originalBoxes = originalLayout.boxes!
            const boxHeight = originalBoxes[0].height * scaleFactor
            const boxes: JustifiedLayoutBox[] = []
            let boxLeft = containerPadding
            for (const originalBox of originalBoxes) {
                const boxWidth = boxHeight * originalBox.aspectRatio
                boxes.push({
                    aspectRatio: originalBox.aspectRatio,
                    left: boxLeft,
                    top: containerPadding,
                    width: boxWidth,
                    height: boxHeight
                })
                boxLeft += boxWidth + boxSpacing
            }

            layout = {
                left: x,
                top: rowTop,
                width: Math.ceil(boxLeft - boxSpacing + containerPadding),
                height: Math.round(sectionHeadHeight + boxHeight + 2 * containerPadding),
                boxes,
                scaleFactor,
                originalLayout
            }
            sectionLayouts[sectionIndex] = layout
            sectionsChanged = true
        }

        if (layout.left !== x) {
            layout.left = x
            sectionsChanged = true
        }

        if (layout.top !== rowTop) {
            layout.top = rowTop
            sectionsChanged = true
        }

        x += layout.width + sectionSpacingX
    }

    return sectionsChanged
}


export function createDummyLayoutBoxes(sectionBodyWidth: number, sectionBodyHeight: number, gridRowHeight: number, photoCount: number): JustifiedLayoutBox[] {
    const rowCount = Math.round((sectionBodyHeight - 2 * containerPadding + boxSpacing) / (gridRowHeight + boxSpacing))   // Reverse `estimateContainerHeight`
    let boxes: JustifiedLayoutBox[] = []
    for (let row = 0; row < rowCount; row++) {
        const lastBoxIndex = Math.ceil(photoCount * (row + 1) / rowCount)  // index is excluding
        const colCount = lastBoxIndex - boxes.length
        let boxWidth = (sectionBodyWidth - 2 * containerPadding - (colCount - 1) * boxSpacing) / colCount
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

        const sectionTop = layout.top
        const sectionBottom = sectionTop + layout.height
        if (isLoadedPhotoSection(section)) {
            const keepSection = sectionBottom > keepMinY && sectionTop < keepMaxY
            if (!keepSection && !isProtectedSection(sectionId)) {
                if (!sectionIdsToForget) {
                    sectionIdsToForget = {}
                }
                sectionIdsToForget[sectionId] = true
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

    if (sectionIdsToLoad && !isFetchingSectionPhotos) {
        isFetchingSectionPhotos = true
        fetchSectionPhotos(sectionIdsToLoad)
            .catch(error => {
                showError(`Fetching photos for sections ${sectionIds.join(', ')} failed`, error)
            })
            .finally(() => {
                isFetchingSectionPhotos = false
            })
    }
}


function isProtectedSection(sectionId: PhotoSectionId): boolean {
    const state = store.getState()
    return !!(
        state.library.selection?.sectionSelectionById[sectionId] ||
        (sectionId === state.library.activePhoto?.sectionId) ||
        (sectionId === state.detail?.currentPhoto.sectionId) ||
        (sectionId === state.info.photoData?.sectionId) ||
        collectionContainsSection(state.export?.photos, sectionId)
    )
}


export async function fetchSectionPhotos(sectionIds: PhotoSectionId[]): Promise<PhotoSet[]> {
    const { filter } = store.getState().library
    const photoSets = await BackgroundClient.fetchSectionPhotos(sectionIds, filter)
    store.dispatch(fetchSectionPhotosAction(sectionIds, photoSets))
    return photoSets
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

    const boxTop = layout.top + sectionHeadHeight + box.top
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
