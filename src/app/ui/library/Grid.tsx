import classNames from 'classnames'
import React from 'react'
import { findDOMNode } from 'react-dom'
import { ResizeSensor, IResizeEntry } from '@blueprintjs/core'

import { PhotoId, Photo, PhotoSectionId, PhotoSectionById, isLoadedPhotoSection } from 'common/CommonTypes'
import CancelablePromise from 'common/util/CancelablePromise'
import { bindMany } from 'common/util/LangUtil'

import { showError } from 'app/ErrorPresenter'
import { GridSectionLayout, GridLayout, JustifiedLayoutBox } from 'app/UITypes'
import { CommandGroupId, addCommandGroup, setCommandGroupEnabled, removeCommandGroup } from 'app/controller/HotkeyController'
import { NailedGridPosition, GetGridLayoutFunction, PhotoGridPosition } from 'app/controller/LibraryController'
import { LibrarySelectionController } from 'app/controller/LibrarySelectionController'
import { isPhotoSelected } from 'app/state/selectors'
import { PhotoLibraryPosition, PreselectionRange, SectionPreselection, SelectionState } from 'app/state/StateTypes'
import { gridScrollBarWidth, toolbarHeight } from 'app/style/variables'
import { getScrollbarSize } from 'app/util/DomUtil'

import GridScrollBar from './GridScrollBar'
import GridSection, { sectionHeadHeight } from './GridSection'
import { showDetailsCombo, toggleSelectedCombo } from './Picture'

import './Grid.less'


const gridSpacerHeight = 1
const gridBottomPadding = toolbarHeight
    // Add padding at the bottom, so the bottom bars (import and slider) don't cover a photo

interface Props {
    className?: any
    isActive: boolean
    sectionIds: PhotoSectionId[]
    sectionById: PhotoSectionById
    activePhoto: PhotoLibraryPosition | null
    selection: SelectionState | null
    preselectionRange: PreselectionRange | null
    gridRowHeight: number
    librarySelectionController: LibrarySelectionController
    getGridLayout: GetGridLayoutFunction
    getThumbnailSrc: (photo: Photo) => string
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => CancelablePromise<string>
    setDetailPhotoById: (sectionId: PhotoSectionId, photoId: PhotoId) => void
}

interface State {
    scrollTop: number
    viewportWidth: number
    viewportHeight: number
}

export default class Grid extends React.Component<Props, State> {

    private commandGroupId: CommandGroupId

    private gridLayout: GridLayout | null = null
    private nailedGridPosition: NailedGridPosition | null = null
    private releaseNailTimer: NodeJS.Timer | null = null


    constructor(props: Props) {
        super(props)

        this.state = { scrollTop: 0, viewportWidth: 0, viewportHeight: 0 }

        bindMany(this, 'showPhotoDetails', 'onShowActiveInDetail', 'onToggleActiveSelected', 'onResize', 'onScroll', 'setScrollTop',
            'moveActivePhotoLeft', 'moveActivePhotoRight', 'moveActivePhotoUp', 'moveActivePhotoDown')
    }

    componentDidMount() {
        this.commandGroupId = addCommandGroup([
            { combo: 'left', onAction: this.moveActivePhotoLeft },
            { combo: 'right', onAction: this.moveActivePhotoRight },
            { combo: 'up', onAction: this.moveActivePhotoUp },
            { combo: 'down', onAction: this.moveActivePhotoDown },
            { combo: toggleSelectedCombo, onAction: this.onToggleActiveSelected },
            { combo: showDetailsCombo, onAction: this.onShowActiveInDetail },
        ])
    }

    shouldComponentUpdate(nextProps: Props, nextState: State, nextContext: any): boolean {
        const prevProps = this.props
        const prevState = this.state
        const prevGridLayout = this.gridLayout

        if (nextProps.isActive !== prevProps.isActive) {
            setCommandGroupEnabled(this.commandGroupId, nextProps.isActive)
        }

        if (nextProps.gridRowHeight !== prevProps.gridRowHeight || nextState.viewportWidth !== prevState.viewportWidth ||
            nextProps.sectionIds !== prevProps.sectionIds)
        {
            // Sizes have changed (e.g. window resize, open/close info, change of gridRowHeight)
            // or content has changed (e.g. during import)
            // -> Nail the grid position
            if (prevGridLayout && !this.nailedGridPosition) {
                this.nailedGridPosition = getNailedGridPosition(prevState.scrollTop, prevState.viewportHeight,
                    prevGridLayout.sectionLayouts, prevProps.sectionIds, prevProps.sectionById)
            }

            if (this.releaseNailTimer) {
                clearTimeout(this.releaseNailTimer)
            }
            this.releaseNailTimer = setTimeout(() => {
                this.nailedGridPosition = null
            }, 1000)
        }

        this.gridLayout = this.getGridLayout(nextProps, nextState)

        return this.gridLayout !== prevGridLayout
            || nextProps.activePhoto !== prevProps.activePhoto
            || nextProps.selection !== prevProps.selection
            || nextProps.preselectionRange !== prevProps.preselectionRange
            || nextState.scrollTop !== prevState.scrollTop
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const { props, state, gridLayout, nailedGridPosition } = this
        if (nailedGridPosition && gridLayout) {
            const nextScrollTop = getScrollTopForNailedGridPosition(nailedGridPosition, state.viewportHeight,
                gridLayout.sectionLayouts, props.sectionIds, props.sectionById)

            this.nailedGridPosition = null
            if (nextScrollTop !== null && nextScrollTop !== state.scrollTop) {
                // Scroll to new position, which will trigger rendering without nailing
                this.setScrollTop(nextScrollTop)
            } else {
                const nextGridLayout = this.getGridLayout(props, state)
                if (gridLayout !== nextGridLayout) {
                    this.gridLayout = nextGridLayout
                    // Render without nailing
                    this.forceUpdate()
                }
            }
        }
    }

    componentWillUnmount() {
        removeCommandGroup(this.commandGroupId)
    }

    private getGridLayout(props: Props, state: State): GridLayout {
        return props.getGridLayout(props.sectionIds, props.sectionById, state.scrollTop,
            state.viewportWidth - gridScrollBarWidth, state.viewportHeight,
            props.gridRowHeight, this.nailedGridPosition)
    }

    private showPhotoDetails(sectionId: PhotoSectionId, photoId: PhotoId) {
        this.props.setDetailPhotoById(sectionId, photoId)
    }

    private onToggleActiveSelected() {
        const { props } = this
        if (props.activePhoto) {
            const { sectionId, photoId } = props.activePhoto
            const isSelected = isPhotoSelected(sectionId, photoId, props.selection)
            props.librarySelectionController.setPhotoSelected(sectionId, photoId, !isSelected)
        }
    }

    private onShowActiveInDetail() {
        const { props } = this
        if (props.activePhoto) {
            props.setDetailPhotoById(props.activePhoto.sectionId, props.activePhoto.photoId)
        }
    }

    private onResize(entries: IResizeEntry[]) {
        const contentRect = entries[0].contentRect
        this.setState({ viewportWidth: contentRect.width, viewportHeight: contentRect.height })
    }

    private onScroll(event: any) {
        const scrollPaneElem = findDOMNode(this.refs.scrollPane) as HTMLElement
        this.setState({ scrollTop: scrollPaneElem.scrollTop })
    }

    private setScrollTop(scrollTop: number) {
        scrollTop = Math.round(scrollTop)
        if (scrollTop !== this.state.scrollTop) {
            const scrollPaneElem = findDOMNode(this.refs.scrollPane) as HTMLElement
            scrollPaneElem.scrollTop = scrollTop
        }
    }

    private moveActivePhotoLeft() {
        this.props.librarySelectionController.moveActivePhoto('left')
    }

    private moveActivePhotoRight() {
        this.props.librarySelectionController.moveActivePhoto('right')
    }

    private moveActivePhotoUp() {
        this.props.librarySelectionController.moveActivePhoto('up')
    }

    private moveActivePhotoDown() {
        this.props.librarySelectionController.moveActivePhoto('down')
    }

    private renderVisibleSections() {
        const { props, state, gridLayout } = this

        if (!gridLayout) {
            return
        }

        const { activePhoto } = props
        let result: JSX.Element[] = []
        for (let sectionIndex = gridLayout.fromSectionIndex; sectionIndex < gridLayout.toSectionIndex; sectionIndex++) {
            const sectionId = props.sectionIds[sectionIndex]
            const layout = gridLayout.sectionLayouts[sectionIndex]
            if (!layout) {
                // This should not happen, but in some rare cases it might happen (had it on 2018-09-02 after empty trash)
                showError(`Expected to have a layout for section #${sectionIndex} (${sectionId})`)
                continue
            }
            result.push(
                <GridSection
                    key={sectionId}
                    className="Grid-section"
                    style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}
                    inSelectionMode={!!props.selection}
                    section={props.sectionById[sectionId]}
                    layout={layout}
                    activePhotoId={(activePhoto?.sectionId === sectionId) ? activePhoto.photoId : null}
                    sectionSelection={props.selection?.sectionSelectionById[sectionId]}
                    sectionPreselection={getSectionPreselection(sectionIndex, props.preselectionRange)}
                    librarySelectionController={props.librarySelectionController}
                    getThumbnailSrc={props.getThumbnailSrc}
                    createThumbnail={props.createThumbnail}
                    showPhotoDetails={this.showPhotoDetails}
                />
            )
        }
        return result
    }

    private calculateContentHeight(): number {
        const { props, gridLayout } = this
        const sectionCount = props.sectionIds.length
        if (!gridLayout || sectionCount === 0) {
            return 0
        } else {
            const lastLayout = gridLayout.sectionLayouts[sectionCount - 1]
            return lastLayout.top + lastLayout.height + gridBottomPadding
        }
    }

    render() {
        const { props, state, gridLayout } = this

        if (!this.gridLayout) {
            // This is the first call of `render`
            this.gridLayout = this.getGridLayout(props, state)
        }

        const contentHeight = this.calculateContentHeight()
        const scrollbarWidth = getScrollbarSize().width

        return (
            <ResizeSensor onResize={this.onResize}>
                <div className={classNames(props.className, 'Grid')}>
                    <div ref='scrollPane' className='Grid-scrollPane' style={{ right: `-${scrollbarWidth}px` }} onScroll={this.onScroll}>
                        {this.renderVisibleSections()}
                        {!!contentHeight &&
                            <div className='Grid-spacer' style={{ top: contentHeight - gridSpacerHeight }} />
                        }
                    </div>
                    {gridLayout && props.sectionIds.length > 0 &&
                        <GridScrollBar
                            className='Grid-scrollBar'
                            gridLayout={gridLayout!}
                            sectionIds={props.sectionIds}
                            sectionById={props.sectionById}
                            viewportHeight={state.viewportHeight}
                            contentHeight={contentHeight}
                            scrollTop={state.scrollTop}
                            setScrollTop={this.setScrollTop}
                        />
                    }
                </div>
            </ResizeSensor>
        )
    }
}


function getNailedGridPosition(scrollTop: number, viewportHeight: number, sectionLayouts: GridSectionLayout[],
    sectionIds: PhotoSectionId[], sectionById: PhotoSectionById): NailedGridPosition | null
{
    const positions: PhotoGridPosition[] = []

    const scrollBottom = scrollTop + viewportHeight
    const scrollCenter = (scrollTop + scrollBottom) / 2
    for (let sectionIndex = 0, sectionCount = sectionLayouts.length; sectionIndex < sectionCount; sectionIndex++) {
        const sectionLayout = sectionLayouts[sectionIndex]
        const section = sectionById[sectionIds[sectionIndex]]
        const sectionBodyTop = sectionLayout.top + sectionHeadHeight
        const sectionBottom = sectionLayout.top + sectionLayout.height
        if (sectionBottom >= scrollTop && sectionLayout.boxes && isLoadedPhotoSection(section)) {
            for (let photoIndex = 0, photoCount = sectionLayout.boxes.length; photoIndex < photoCount; photoIndex++) {
                const box = sectionLayout.boxes[photoIndex]
                const photoId = section.photoIds[photoIndex]
                const boxTopInGrid = sectionBodyTop + box.top
                const boxBottomInGrid = boxTopInGrid + box.height
                if (boxBottomInGrid >= scrollTop) {
                    if (boxTopInGrid <= scrollBottom || !positions.length) {
                        // This photo is in view
                        positions.push(getPhotoGridPosition(scrollCenter, sectionBodyTop, box, section.id, photoId))
                    } else {
                        // This photo is out of view -> We're done
                        return { positions }
                    }
                }
            }
        }
    }

    if (positions.length) {
        // Happens if the very last photo is in view
        return { positions }
    } else {
        return null
    }
}


function getSectionPreselection(sectionIndex: number, preselectionRange: PreselectionRange | null): SectionPreselection | undefined {
    if (!preselectionRange) {
        return undefined
    }

    const { selected, startSectionIndex, endSectionIndex } = preselectionRange
    if (sectionIndex < startSectionIndex || sectionIndex > endSectionIndex) {
        return undefined
    } else if (sectionIndex === startSectionIndex && sectionIndex === endSectionIndex) {
        return preselectionRange
    } else if (sectionIndex === startSectionIndex) {
        return { selected, startPhotoIndex: preselectionRange.startPhotoIndex, endPhotoIndex: Number.POSITIVE_INFINITY }
    } else if (sectionIndex === endSectionIndex) {
        return { selected, startPhotoIndex: 0, endPhotoIndex: preselectionRange.endPhotoIndex }
    } else {
        return selected ? 'all' : 'none'
    }
}


function getPhotoGridPosition(y: number, sectionBodyTop: number, box: JustifiedLayoutBox, sectionId: PhotoSectionId,
    photoId: PhotoId, positionToUpdate?: Partial<PhotoGridPosition> | null): PhotoGridPosition
{
    if (!positionToUpdate) {
        positionToUpdate = {}
    }

    positionToUpdate.sectionId = sectionId
    positionToUpdate.photoId = photoId

    const yWithinBox = y - sectionBodyTop - box.top
    let relativeY = yWithinBox / box.height
    let offsetY = 0
    if (relativeY < 0) {
        relativeY = 0
        offsetY = yWithinBox
    } else if (relativeY > 1) {
        relativeY = 1
        offsetY = yWithinBox - box.height
    }
    positionToUpdate.relativeY = relativeY
    positionToUpdate.offsetY = offsetY

    return positionToUpdate as PhotoGridPosition
}


function getScrollTopForNailedGridPosition(nailedGridPosition: NailedGridPosition, viewportHeight: number,
    sectionLayouts: GridSectionLayout[], sectionIds: PhotoSectionId[], sectionById: PhotoSectionById): number | null
{
    let totalCenterY = 0
    let centerYCount = 0
    for (const position of nailedGridPosition.positions) {
        const centerY = getYForPhotoGridPosition(position, sectionLayouts, sectionIds, sectionById)
        if (centerY != null) {
            totalCenterY += centerY
            centerYCount++
        }
    }

    if (centerYCount === 0) {
        return null
    }

    const avgCenterY = totalCenterY / centerYCount
    return Math.max(0, Math.round(avgCenterY - viewportHeight / 2))
}


function getYForPhotoGridPosition(position: PhotoGridPosition, sectionLayouts: GridSectionLayout[],
    sectionIds: PhotoSectionId[], sectionById: PhotoSectionById): number | null
{
    const sectionIndex = sectionIds.indexOf(position.sectionId)
    if (sectionIndex === -1) {
        return null
    }

    const section = sectionById[position.sectionId]
    const sectionLayout = sectionLayouts[sectionIndex]
    if (!isLoadedPhotoSection(section) || !sectionLayout.boxes) {
        return null
    }

    const photoIndex = section.photoIds.indexOf(position.photoId)
    if (photoIndex === -1) {
        return null
    }

    const box = sectionLayout.boxes[photoIndex]
    return sectionLayout.top + sectionHeadHeight + box.top + box.height * position.relativeY + position.offsetY
}
