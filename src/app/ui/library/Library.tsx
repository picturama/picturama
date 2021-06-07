import classNames from 'classnames'
import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { ipcRenderer } from 'electron'
import { Button, NonIdealState, Spinner, MaybeElement, Icon, INonIdealStateProps } from '@blueprintjs/core'

import { PhotoId, Photo, PhotoSectionId, PhotoSectionById, PhotoFilterType } from 'common/CommonTypes'
import { msg } from 'common/i18n/i18n'
import CancelablePromise from 'common/util/CancelablePromise'
import { bindMany } from 'common/util/LangUtil'

import { setDetailPhotoById } from 'app/controller/DetailController'
import { defaultLibrarySelectionController, LibrarySelectionController } from 'app/controller/LibrarySelectionController'
import { GetGridLayoutFunction, getGridLayoutAndUpdateStore, createThumbnail } from 'app/controller/LibraryController'
import { PhotoActionController, defaultPhotoActionController } from 'app/controller/PhotoActionController'
import { fetchTotalPhotoCount, fetchSections, getThumbnailSrc } from 'app/controller/PhotoController'
import { fetchTags, setPhotoTags } from 'app/controller/PhotoTagController'
import { setGridRowHeightAction, setShowInfoAction } from 'app/state/actions'
import { getInfoPhoto, getPreselectionRange, getTagTitles } from 'app/state/selectors'
import { AppState, InfoPhotoData, PhotoLibraryPosition, PreselectionRange, SelectionState } from 'app/state/StateTypes'
import PhotoInfo from 'app/ui/info/PhotoInfo'
import LogoDecoration from 'app/ui/widget/LogoDecoration'
import { keySymbols } from 'app/UiConstants'
import { FetchState } from 'app/UITypes'
import { getCollectionSize } from 'app/util/PhotoCollectionResolver'

import LibraryTopBar from './LibraryTopBar'
import LibraryBottomBar from './LibraryBottomBar'
import Grid from './Grid'

import './Library.less'


const nonIdealStateMaxWidth = 400


interface OwnProps {
    style?: any
    className?: any
    topBarLeftItem?: MaybeElement
    bottomBarLeftItem?: MaybeElement
    isActive: boolean
}

interface StateProps {
    hasPhotoDirs: boolean
    isFetching: boolean
    isImporting: boolean
    libraryFilterType: PhotoFilterType
    photoCount: number
    totalPhotoCount: number | null
    sectionIds: PhotoSectionId[]
    sectionById: PhotoSectionById
    activePhoto: PhotoLibraryPosition | null
    selection: SelectionState | null
    preselectionRange: PreselectionRange | null
    showInfo: boolean
    infoPhoto?: Photo
    infoPhotoData?: InfoPhotoData
    tags: string[]
    gridRowHeight: number
    photoActionController: PhotoActionController
    librarySelectionController: LibrarySelectionController
}

interface DispatchProps {
    fetchTotalPhotoCount: () => void
    fetchSections: () => void
    fetchTags(): void
    getGridLayout: GetGridLayoutFunction
    getThumbnailSrc: (photo: Photo) => string
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => CancelablePromise<string>
    setGridRowHeight: (gridRowHeight: number) => void
    setDetailPhotoById: (sectionId: PhotoSectionId, photoId: PhotoId) => void
    setPhotoTags: (photo: Photo, tags: string[]) => void
    setShowInfo(showInfo: boolean): void
    startScanning: () => void
}

export interface Props extends OwnProps, StateProps, DispatchProps {
}

export class Library extends React.Component<Props> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'openExport', 'toggleShowInfo', 'getNonIdealStateDecorationWidth')
    }

    componentDidUpdate(prevProps: Props) {
        const props = this.props

        const isExportEnabled = props.isActive && getCollectionSize(props.selection || props.activePhoto) > 0
        const prevIsExportEnabled = prevProps.isActive && getCollectionSize(prevProps.selection || prevProps.activePhoto) > 0
        if (isExportEnabled !== prevIsExportEnabled) {
            ipcRenderer.send('toggleExportMenu', isExportEnabled)
            if (isExportEnabled) {
                ipcRenderer.on('exportClicked', this.openExport)
            } else {
                ipcRenderer.removeAllListeners('exportClicked')
            }
        }
    }

    componentDidMount() {
        const { props } = this
        props.fetchTotalPhotoCount()
        props.fetchSections()
        props.fetchTags()
    }

    private openExport() {
        const props = this.props
        if (props.selection) {
            props.photoActionController.openExport(props.selection)
        }
    }

    private toggleShowInfo() {
        const { props } = this
        props.setShowInfo(!props.showInfo)
    }

    private getNonIdealStateDecorationWidth(containerWidth: number): number {
        return (containerWidth - nonIdealStateMaxWidth) / 2 - 20
    }

    render() {
        const { props } = this

        let nonIdealStateProps: INonIdealStateProps | null = null
        if (props.totalPhotoCount === 0 && !props.isFetching && !props.isImporting) {
            if (!props.hasPhotoDirs) {
                const descriptionSplits = msg('Library_noSettings_message').split('{0}')
                nonIdealStateProps = {
                    icon: 'zoom-out',
                    title: msg('Library_noPhotos_title'),
                    description: (
                        <>
                            {descriptionSplits[0]}
                            <Icon icon='cog' style={{ verticalAlign: 'middle' }}/>
                            {descriptionSplits[1]}
                        </>
                    )
                }
            } else {
                const descriptionSplits = msg('Library_noPhotos_message').split('{0}')
                nonIdealStateProps = {
                    icon: 'zoom-out',
                    title: msg('Library_noPhotos_title'),
                    description: (
                        <>
                            {descriptionSplits[0]}
                            <code>{keySymbols.ctrlOrMacCommand}</code>+<code>R</code>
                            {descriptionSplits[1]}
                        </>
                    ),
                    action: (
                        <div className="bp3-dark">
                            <Button onClick={props.startScanning}>{msg('Library_startScanning')}</Button>
                        </div>
                    )
                }
            }
        } else if (props.photoCount === 0 && !props.isFetching && !props.isImporting) {
            let title: string
            switch (props.libraryFilterType) {
                case 'favorites': title = msg('Library_emptyFavorites'); break
                case 'trash':     title = msg('Library_emptyTrash'); break
                default:          title = msg('Library_emptyView'); break
            }

            nonIdealStateProps = {
                icon: props.libraryFilterType === 'trash' ? 'tick' : 'zoom-out',
                title,
                description: msg('Library_selectOtherView')
            }
        }

        const showGrid = !nonIdealStateProps

        return (
            <div
                ref="library"
                className={classNames(props.className, 'Library', { 'bp3-dark': showGrid, hasGrid: showGrid, hasRightSidebar: props.showInfo })}
                style={props.style}
            >
                <LibraryTopBar
                    className="Library-topBar"
                    leftItem={props.topBarLeftItem}
                    selectedPhotos={props.selection || props.activePhoto}
                    isShowingTrash={props.libraryFilterType === 'trash'}
                    isShowingInfo={props.showInfo}
                    photosCount={props.photoCount}
                    photoActionController={props.photoActionController}
                    toggleShowInfo={this.toggleShowInfo}
                />
                <div className="Library-body">
                    {nonIdealStateProps &&
                        <>
                            <LogoDecoration getDecorationWidth={this.getNonIdealStateDecorationWidth}/>
                            <NonIdealState {...nonIdealStateProps}/>
                        </>
                    }
                    {showGrid &&
                        <Grid
                            className="Library-grid"
                            isActive={props.isActive}
                            sectionIds={props.sectionIds}
                            sectionById={props.sectionById}
                            activePhoto={props.activePhoto}
                            selection={props.selection}
                            preselectionRange={props.preselectionRange}
                            gridRowHeight={props.gridRowHeight}
                            librarySelectionController={props.librarySelectionController}
                            getGridLayout={props.getGridLayout}
                            getThumbnailSrc={props.getThumbnailSrc}
                            createThumbnail={props.createThumbnail}
                            setDetailPhotoById={props.setDetailPhotoById}
                        />
                    }
                    {(props.isImporting ? props.photoCount === 0 : props.isFetching) &&
                        <Spinner className="Library-spinner" size={Spinner.SIZE_LARGE} />
                    }
                </div>
                <LibraryBottomBar
                    className="Library-bottomBar"
                    leftItem={props.bottomBarLeftItem}
                    showSlider={props.photoCount > 0}
                    gridRowHeight={props.gridRowHeight}
                    setGridRowHeight={props.setGridRowHeight}
                />
                <PhotoInfo
                    className="Library-rightSidebar"
                    isActive={props.showInfo}
                    photo={props.infoPhoto}
                    photoData={props.infoPhotoData}
                    tags={props.tags}
                    closeInfo={this.toggleShowInfo}
                    setPhotoTags={props.setPhotoTags}
                />
            </div>
        );
    }
}


const Connected = connect<StateProps, DispatchProps, OwnProps, AppState>(
    (state: AppState, props) => {
        const { sections } = state.data
        return {
            ...props,
            hasPhotoDirs: state.data.settings.photoDirs.length !== 0,
            isFetching: sections.totalPhotoCount === null || sections.fetchState === FetchState.FETCHING,
            isImporting: !!state.import && state.import.progress.phase !== 'error',
            libraryFilterType: state.library.filter.type,
            photoCount: sections.photoCount,
            totalPhotoCount: sections.totalPhotoCount,
            sectionIds: sections.ids,
            sectionById: sections.byId,
            activePhoto: state.library.activePhoto,
            selection: state.library.selection,
            preselectionRange: getPreselectionRange(state),
            showInfo: state.info.showInLibrary,
            infoPhoto: getInfoPhoto(state),
            infoPhotoData: state.info.photoData,
            tags: getTagTitles(state),
            gridRowHeight: state.library.display.gridRowHeight,
            photoActionController: defaultPhotoActionController,
            librarySelectionController: defaultLibrarySelectionController,
        }
    },
    dispatch => ({
        fetchTotalPhotoCount,
        fetchSections,
        fetchTags,
        getGridLayout: getGridLayoutAndUpdateStore,
        getThumbnailSrc,
        createThumbnail,
        setDetailPhotoById,
        setPhotoTags,
        setShowInfo(showInfo: boolean) {
            dispatch(setShowInfoAction('library', showInfo))
        },
        startScanning: () => {
            ipcRenderer.send('start-scanning')
        },
        ...bindActionCreators({
            setGridRowHeight: setGridRowHeightAction,
        }, dispatch)
    })
)(Library)

export default Connected
