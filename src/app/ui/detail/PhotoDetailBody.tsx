import React from 'react'
import classnames from 'classnames'
import { ResizeSensor, IResizeEntry, Spinner } from '@blueprintjs/core'

import { ExifOrientation, PhotoWork, PhotoSectionId, Photo, PhotoId } from 'common/CommonTypes'
import { CameraMetrics, CameraMetricsBuilder, RequestedPhotoPosition, PhotoPosition } from 'common/util/CameraMetrics'
import { Size, zeroSize, Insets, zeroInsets, Rect } from 'common/util/GeometryTypes'
import { bindMany, isShallowEqual } from 'common/util/LangUtil'

import CropModeLayer from './CropModeLayer'
import { DetailMode } from './DetailTypes'
import PhotoLayer from './PhotoLayer'
import ViewModeLayer from './ViewModeLayer'

import './PhotoDetailBody.less'


export const cropModeInsets: Insets = { left: 60, right: 80, top: 60, bottom: 60 }


export interface Props {
    className?: any
    style?: any
    topBarClassName: string
    bodyClassName: string
    isActive: boolean
    mode: DetailMode
    isShowingInfo: boolean
    sectionId: PhotoSectionId
    photo: Photo
    isFirst: boolean
    isLast: boolean
    src: string
    srcPrev: string | null
    srcNext: string | null
    orientation: ExifOrientation
    photoWork: PhotoWork | null
    toggleMaximized(): void
    setMode(mode: DetailMode): void
    setPreviousDetailPhoto(): void
    setNextDetailPhoto(): void
    toggleDiff(): void
    toggleShowInfo(): void
    updatePhotoWork: (photo: Photo, update: (photoWork: PhotoWork) => void) => void
    setPhotosFlagged: (photos: Photo[], flag: boolean) => void
    movePhotosToTrash: (photos: Photo[]) => void
    restorePhotosFromTrash: (photos: Photo[]) => void
    openExport: (sectionId: PhotoSectionId, photoIds: PhotoId[]) => void
    closeDetail(): void
}

interface State {
    prevMode: DetailMode | null
    prevSrc: string | null
    prevPhotoWork: PhotoWork | null
    loading: boolean
    canvasSize: Size
    textureSize: Size | null
    boundsRect: Rect | null
    photoPosition: RequestedPhotoPosition
    /** The PhotoWork which is changed in crop mode but not yet saved */
    editedPhotoWork: PhotoWork | null
    cameraMetricsBuilder: CameraMetricsBuilder
    cameraMetrics: CameraMetrics | null
}

export default class PhotoDetailBody extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onLoadingChange', 'onResize', 'onTextureSizeChange', 'setPhotoPosition', 'enterCropMode',
            'onPhotoWorkEdited', 'onCropDone')
        const cameraMetricsBuilder = new CameraMetricsBuilder()
        this.state = {
            prevMode: null,
            prevSrc: null,
            prevPhotoWork: null,
            loading: true,
            canvasSize: zeroSize,
            textureSize: null,
            boundsRect: null,
            photoPosition: 'contain',
            editedPhotoWork: null,
            cameraMetricsBuilder,
            cameraMetrics: null,
        }
    }

    static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
        const { cameraMetricsBuilder } = prevState
        let nextState: Partial<State> | null = null
        let nextBoundsRect = prevState.boundsRect
        let nextPhotoPosition = prevState.photoPosition
        let nextEditedPhotoWork = prevState.editedPhotoWork

        if (nextProps.src !== prevState.prevSrc) {
            nextState = { prevSrc: nextProps.src, textureSize: null, photoPosition: 'contain' }
        }

        if (nextProps.mode !== prevState.prevMode) {
            const isCropMode = nextProps.mode === 'crop'
            cameraMetricsBuilder
                .setInsets(isCropMode ? cropModeInsets : zeroInsets)
            nextBoundsRect = null
            nextState = { ...nextState, prevMode: nextProps.mode, boundsRect: nextBoundsRect }
            if (isCropMode) {
                nextPhotoPosition = 'contain'
                nextState.photoPosition = nextPhotoPosition
            }
        }

        if (nextProps.photoWork !== prevState.prevPhotoWork) {
            nextEditedPhotoWork = null
            nextPhotoPosition = 'contain'
            nextState = {
                ...nextState,
                prevPhotoWork: nextProps.photoWork,
                photoPosition: nextPhotoPosition,
                editedPhotoWork: nextEditedPhotoWork
            }
        }

        if (prevState.textureSize && nextProps.photoWork) {
            const cameraMetrics = cameraMetricsBuilder
                .setCanvasCssSize(prevState.canvasSize)
                .setTextureSize(prevState.textureSize)
                .setBoundsRect(nextBoundsRect)
                .setExifOrientation(nextProps.orientation)
                .setPhotoWork(nextEditedPhotoWork || nextProps.photoWork)
                .setPhotoPosition(nextPhotoPosition)
                .getCameraMetrics()
            if (cameraMetrics !== prevState.cameraMetrics) {
                nextState = { ...nextState, cameraMetrics }
            }
        } else if (prevState.cameraMetrics) {
            nextState = { ...nextState, cameraMetrics: null }
        }

        return nextState
    }

    private onLoadingChange(loading: boolean) {
        this.setState({ loading })
    }

    private onResize(entries: IResizeEntry[]) {
        const { state } = this
        const contentRect = entries[0].contentRect
        if (state.canvasSize.width !== contentRect.width || state.canvasSize.height !== contentRect.height) {
            const canvasSize: Size = { width: contentRect.width, height: contentRect.height }
            this.setState({ canvasSize })
        }
    }

    private onTextureSizeChange(textureSize: Size | null) {
        const { state } = this
        if (!isShallowEqual(textureSize, state.textureSize)) {
            this.setState({ textureSize })
        }
    }

    private setPhotoPosition(photoPosition: PhotoPosition) {
        this.setState({ photoPosition })
    }

    private enterCropMode() {
        this.props.setMode('crop')
    }

    private onPhotoWorkEdited(photoWork: PhotoWork, boundsRect?: Rect | null) {
        this.setState({ editedPhotoWork: photoWork, boundsRect: boundsRect || null })
    }

    private onCropDone() {
        const { editedPhotoWork } = this.state
        if (editedPhotoWork) {
            this.props.updatePhotoWork(this.props.photo, photoWork => {
                for (const key of Object.keys(photoWork)) {
                    delete photoWork[key]
                }
                for (const key of Object.keys(editedPhotoWork)) {
                    photoWork[key] = editedPhotoWork[key]
                }
            })
        }

        // NOTE: editedPhotoWork will be set to null when the new photoWork is set.
        //       This is important in order to avoid flickering (the old photoWork would be shown for a short time).
        this.props.setMode('view')
    }

    render() {
        const { props, state } = this
        return (
            <div className={classnames(props.className, 'PhotoDetailBody')}>
                <ResizeSensor onResize={this.onResize}>
                    <div className={classnames(props.bodyClassName, 'PhotoDetailBody-sizer')} />
                </ResizeSensor>
                <PhotoLayer
                    className={props.bodyClassName}
                    mode={props.mode}
                    canvasSize={state.canvasSize}
                    src={props.src}
                    srcPrev={props.srcPrev}
                    srcNext={props.srcNext}
                    orientation={props.orientation}
                    cameraMetrics={state.cameraMetrics}
                    onLoadingChange={this.onLoadingChange}
                    onTextureSizeChange={this.onTextureSizeChange}
                />
                {props.mode === 'view' &&
                    <ViewModeLayer
                        topBarClassName={props.topBarClassName}
                        bodyClassName={props.bodyClassName}
                        isActive={props.isActive}
                        sectionId={props.sectionId}
                        photo={props.photo}
                        isFirst={props.isFirst}
                        isLast={props.isLast}
                        cameraMetrics={state.cameraMetrics}
                        isShowingInfo={props.isShowingInfo}
                        toggleMaximized={props.toggleMaximized}
                        setPreviousDetailPhoto={props.setPreviousDetailPhoto}
                        setNextDetailPhoto={props.setNextDetailPhoto}
                        setPhotoPosition={this.setPhotoPosition}
                        toggleDiff={props.toggleDiff}
                        enterCropMode={this.enterCropMode}
                        toggleShowInfo={props.toggleShowInfo}
                        updatePhotoWork={props.updatePhotoWork}
                        setPhotosFlagged={props.setPhotosFlagged}
                        movePhotosToTrash={props.movePhotosToTrash}
                        restorePhotosFromTrash={props.restorePhotosFromTrash}
                        openExport={props.openExport}
                        closeDetail={props.closeDetail}
                    />
                }
                {props.mode === 'crop' && props.photoWork && state.cameraMetrics &&
                    <CropModeLayer
                        topBarClassName={props.topBarClassName}
                        bodyClassName={props.bodyClassName}
                        exifOrientation={props.photo.orientation}
                        photoWork={state.editedPhotoWork || props.photoWork}
                        cameraMetrics={state.cameraMetrics}
                        toggleMaximized={props.toggleMaximized}
                        onPhotoWorkEdited={this.onPhotoWorkEdited}
                        onDone={this.onCropDone}
                    />
                }
                {state.loading &&
                    <Spinner className='PhotoDetailBody-spinner' size={Spinner.SIZE_LARGE} />
                }
            </div>
        )
    }

}
