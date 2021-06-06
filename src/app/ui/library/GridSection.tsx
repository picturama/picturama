import classNames from 'classnames'
import React from 'react'
import { Button } from '@blueprintjs/core'
import { FaCheckCircle, FaRegCircle } from 'react-icons/fa'

import { PhotoId, Photo, PhotoSectionId, PhotoSection, isLoadedPhotoSection } from 'common/CommonTypes'
import CancelablePromise from 'common/util/CancelablePromise'
import { bindMany } from 'common/util/LangUtil'

import { LibrarySelectionController } from 'app/controller/LibrarySelectionController'
import { isPhotoSelectedInSection } from 'app/state/selectors'
import { SectionPreselection, SectionSelectionState } from 'app/state/StateTypes'
import { selectionButtonSize } from 'app/style/variables'
import { GridSectionLayout } from 'app/UITypes'
import RedCheckCircle from 'app/ui/widget/icon/RedCheckCircle'

import Picture from './Picture'

import './GridSection.less'


export const sectionHeadHeight = 60  // Keep in sync with `GridSection.less`


export interface Props {
    className?: any
    style?: any
    inSelectionMode: boolean
    section: PhotoSection
    layout: GridSectionLayout
    activePhotoId: PhotoId | null
    sectionSelection?: SectionSelectionState
    sectionPreselection?: SectionPreselection
    librarySelectionController: LibrarySelectionController
    getThumbnailSrc: (photo: Photo) => string
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => CancelablePromise<string>
    showPhotoDetails(sectionId: PhotoSectionId, photoId: PhotoId): void
}

export default class GridSection extends React.Component<Props> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onToggleSectionSelected')
    }

    private onToggleSectionSelected() {
        const { props } = this
        props.librarySelectionController.setSectionSelected(props.section.id, props.sectionSelection?.selectedPhotosById !== 'all')
    }

    private renderPictures() {
        const { props } = this
        if (!props.layout.boxes || props.layout.fromBoxIndex == null || props.layout.toBoxIndex == null) {
            return
        }
        
        const { activePhotoId } = props
        const toBoxIndex = props.layout.toBoxIndex
        let elems: JSX.Element[] = []
        if (isLoadedPhotoSection(props.section)) {
            const { photoIds, photoData } = props.section
            for (let photoIndex = props.layout.fromBoxIndex; photoIndex < toBoxIndex; photoIndex++) {
                const photoId = photoIds[photoIndex]
                elems.push(
                    <Picture
                        key={photoId}
                        inSelectionMode={props.inSelectionMode}
                        sectionId={props.section.id}
                        photo={photoData[photoId]}
                        layoutBox={props.layout.boxes[photoIndex]}
                        isActive={photoId === activePhotoId}
                        isSelected={isPhotoSelectedInSection(photoId, props.sectionSelection)}
                        preselected={getPhotoPreselection(photoIndex, props.sectionPreselection)}
                        librarySelectionController={props.librarySelectionController}
                        getThumbnailSrc={props.getThumbnailSrc}
                        createThumbnail={props.createThumbnail}
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
        const { props } = this

        const bodyHeight = props.layout.height - sectionHeadHeight
        return (
            <div className={classNames(props.className, 'GridSection')} style={props.style}>
                <div className='GridSection-head'>
                    {props.section.title}
                    {props.section.count > 1 &&
                        <Button className={classNames('GridSection-toggleSelection', { isAlwaysVisible: props.inSelectionMode })}
                            minimal={true}
                            icon={
                                !props.inSelectionMode ? <FaCheckCircle/> :
                                props.sectionSelection?.selectedPhotosById === 'all' ? <RedCheckCircle size={selectionButtonSize}/> :
                                <FaRegCircle/>}
                            onClick={this.onToggleSectionSelected}
                        />
                    }
                </div>
                <div className='GridSection-body' style={{ height: bodyHeight }}>
                    {this.renderPictures()}
                </div>
            </div>
        );
    }

}


function getPhotoPreselection(photoIndex: number, sectionPreselection?: SectionPreselection): boolean | undefined {
    if (!sectionPreselection) {
        return undefined
    } else if (sectionPreselection === 'all') {
        return true
    } else if (sectionPreselection === 'none') {
        return false
    }

    const isPhotoInRange = photoIndex >= sectionPreselection.startPhotoIndex && photoIndex <= sectionPreselection.endPhotoIndex
    return isPhotoInRange ? sectionPreselection.selected : undefined
}
