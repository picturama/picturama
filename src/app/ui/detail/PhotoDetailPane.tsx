import { ipcRenderer } from 'electron'
import classNames from 'classnames'
import React from 'react'
import { connect } from 'react-redux'

import { Photo, PhotoWork, PhotoSectionId } from 'common/CommonTypes'
import { getNonRawPath } from 'common/util/DataUtil'
import { bindMany } from 'common/util/LangUtil'

import PhotoInfo from 'app/ui/info/PhotoInfo'
import { setDetailPhotoByIndex, setPreviousDetailPhoto, setNextDetailPhoto } from 'app/controller/DetailController'
import { defaultLibrarySelectionController, LibrarySelectionController } from 'app/controller/LibrarySelectionController'
import { defaultPhotoActionController, PhotoActionController } from 'app/controller/PhotoActionController'
import { setPhotoTags } from 'app/controller/PhotoTagController'
import { setShowInfoAction } from 'app/state/actions'
import { getPhotoById, getPhotoByIndex, getLoadedSectionById, getTagTitles, getInfoPhoto } from 'app/state/selectors'
import { AppState, InfoPhotoData, SelectionState } from 'app/state/StateTypes'

import { DetailMode } from './DetailTypes'
import PhotoDetailBody from './PhotoDetailBody'

import './PhotoDetailPane.less'


interface OwnProps {
    style?: any
    className?: any
    isActive: boolean
}

interface StateProps {
    devicePixelRatio: number
    sectionId: PhotoSectionId
    photo: Photo
    photoPrev: Photo | null
    photoNext: Photo | null
    photoWork: PhotoWork | null
    selection: SelectionState | null
    tags: string[]
    isFirst: boolean
    isLast: boolean
    showInfo: boolean
    infoPhoto?: Photo
    infoPhotoData?: InfoPhotoData
    photoActionController: PhotoActionController
    librarySelectionController: LibrarySelectionController
}

interface DispatchProps {
    setPreviousDetailPhoto: () => void
    setNextDetailPhoto: () => void
    setPhotoTags: (photo: Photo, tags: string[]) => void
    setShowInfo(showInfo: boolean): void
    closeDetail: () => void
}

export interface Props extends OwnProps, StateProps, DispatchProps {
}

interface State {
    mode: DetailMode
}

export class PhotoDetailPane extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props);
        bindMany(this, 'toggleShowInfo', 'setMode')
        this.state = {
            mode: 'view',
        }
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const { props, state } = this
        if (props.isActive !== prevProps.isActive || state.mode !== prevState.mode) {
            ipcRenderer.send('toggleExportMenu', props.isActive && state.mode === 'view')
        }
    }

    private toggleShowInfo() {
        const { props } = this
        props.setShowInfo(!props.showInfo)
    }

    private setMode(mode: DetailMode) {
        const { props } = this
        if (mode === 'crop' && props.showInfo) {
            props.setShowInfo(false)
        }
        this.setState({ mode })
    }

    render() {
        const { props, state } = this

        return (
            <div
                className={classNames(props.className, 'PhotoDetailPane', { hasRightSidebar: props.showInfo })}
                style={props.style}
            >
                <PhotoDetailBody
                    topBarClassName='PhotoDetailPane-topBar'
                    bodyClassName='PhotoDetailPane-body'
                    devicePixelRatio={props.devicePixelRatio}
                    selection={props.selection}
                    isActive={props.isActive}
                    mode={state.mode}
                    isShowingInfo={props.showInfo}
                    sectionId={props.sectionId}
                    photo={props.photo}
                    isFirst={props.isFirst}
                    isLast={props.isLast}
                    imagePath={getNonRawPath(props.photo)}
                    imagePathPrev={props.photoPrev && getNonRawPath(props.photoPrev)}
                    imagePathNext={props.photoNext && getNonRawPath(props.photoNext)}
                    photoWork={props.photoWork}
                    photoActionController={props.photoActionController}
                    librarySelectionController={props.librarySelectionController}
                    setMode={this.setMode}
                    setPreviousDetailPhoto={props.setPreviousDetailPhoto}
                    setNextDetailPhoto={props.setNextDetailPhoto}
                    toggleShowInfo={this.toggleShowInfo}
                    closeDetail={props.closeDetail}
                />

                <PhotoInfo
                    className="PhotoDetailPane-rightSidebar"
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
        const currentPhoto = state.detail!.currentPhoto
        const sectionId = currentPhoto.sectionId
        const section = getLoadedSectionById(state, sectionId)
        return {
            ...props,
            devicePixelRatio: state.navigation.devicePixelRatio,
            sectionId: currentPhoto.sectionId,
            photo: getPhotoById(state, sectionId, currentPhoto.photoId)!,
            photoPrev: getPhotoByIndex(state, sectionId, currentPhoto.photoIndex - 1),
            photoNext: getPhotoByIndex(state, sectionId, currentPhoto.photoIndex + 1),
            photoWork: currentPhoto.photoWork,
            selection: state.library.selection,
            tags: getTagTitles(state),
            isFirst: currentPhoto.photoIndex === 0,
            isLast: !section || currentPhoto.photoIndex === section.photoIds.length - 1,
            showInfo: state.info.showInDetail,
            infoPhoto: getInfoPhoto(state),
            infoPhotoData: state.info.photoData,
            photoActionController: defaultPhotoActionController,
            librarySelectionController: defaultLibrarySelectionController,
        }
    },
    dispatch => ({
        setPreviousDetailPhoto,
        setNextDetailPhoto,
        setPhotoTags,
        setShowInfo(showInfo: boolean) {
            dispatch(setShowInfoAction('detail', showInfo))
        },
        closeDetail: () => setDetailPhotoByIndex(null, null)
    })
)(PhotoDetailPane)

export default Connected
