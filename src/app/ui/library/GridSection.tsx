import classNames from 'classnames'
import React from 'react'

import { PhotoId, Photo, PhotoSectionId, PhotoSection, isLoadedPhotoSection } from 'common/CommonTypes'
import CancelablePromise from 'common/util/CancelablePromise'

import { GridSectionLayout } from 'app/UITypes'

import Picture from './Picture'

import './GridSection.less'


export const sectionHeadHeight = 60  // Keep in sync with `GridSection.less`


export interface Props {
    className?: any
    style?: any
    section: PhotoSection
    layout: GridSectionLayout
    selectedPhotoIds: PhotoId[] | null
    getThumbnailSrc: (photo: Photo) => string
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => CancelablePromise<string>
    setActivePhoto(sectionId: PhotoSectionId, photoId: PhotoId): void
    setPhotoSelected(sectionId: PhotoSectionId, photoId: PhotoId, selected: boolean): void
    showPhotoDetails(sectionId: PhotoSectionId, photoId: PhotoId): void
}

export default class GridSection extends React.Component<Props> {

    renderPictures() {
        const props = this.props
        if (!props.layout.boxes || props.layout.fromBoxIndex == null || props.layout.toBoxIndex == null) {
            return
        }

        const toBoxIndex = props.layout.toBoxIndex
        let elems: JSX.Element[] = []
        if (isLoadedPhotoSection(props.section)) {
            const { photoIds, photoData } = props.section
            for (let photoIndex = props.layout.fromBoxIndex; photoIndex < toBoxIndex; photoIndex++) {
                const photoId = photoIds[photoIndex]
                elems.push(
                    <Picture
                        key={photoId}
                        inSelectionMode={false}
                        sectionId={props.section.id}
                        photo={photoData[photoId]}
                        layoutBox={props.layout.boxes[photoIndex]}
                        isActive={!!props.selectedPhotoIds && props.selectedPhotoIds.indexOf(photoId) !== -1}
                        isSelected={false}
                        getThumbnailSrc={props.getThumbnailSrc}
                        createThumbnail={props.createThumbnail}
                        setActivePhoto={props.setActivePhoto}
                        setPhotoSelected={props.setPhotoSelected}
                        showPhotoDetails={props.showPhotoDetails}
                    />
                )
            }
        } else {
            for (let photoIndex = props.layout.fromBoxIndex; photoIndex < toBoxIndex; photoIndex++) {
                const layoutBox = props.layout.boxes[photoIndex]
                elems.push(
                    <div
                        key={photoIndex}
                        className="GridSection-dummyBox"
                        style={{
                            left:   Math.round(layoutBox.left),
                            top:    Math.round(layoutBox.top),
                            width:  Math.round(layoutBox.width),
                            height: Math.round(layoutBox.height)
                        }}
                    />
                )
            }
        }
        return elems
    }

    render() {
        const props = this.props

        return (
            <div className={classNames(props.className, 'GridSection')} style={props.style}>
                <div className="GridSection-head">{props.section.title}</div>
                <div className="GridSection-body" style={{ height: props.layout.containerHeight }}>
                    {this.renderPictures()}
                </div>
            </div>
        );
    }

}
