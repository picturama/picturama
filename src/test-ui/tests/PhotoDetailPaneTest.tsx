import React from 'react'

import { PhotoDetailPane, Props } from 'app/ui/detail/PhotoDetailPane'

import {addSection, action} from 'test-ui/core/UiTester'
import { mockLibrarySelectionController, mockPhotoActionController, testBigPhoto, testBigPhotoMetData } from 'test-ui/util/MockData'
import { FetchState } from 'app/UITypes'


const defaultProps: Props = {
    style: { width: '100%', height: '100%', overflow: 'hidden' },
    isActive: true,
    devicePixelRatio: window.devicePixelRatio,
    sectionId: 'dummy',
    photo: testBigPhoto,
    photoPrev: null,
    photoNext: null,
    photoWork: {},
    selection: null,
    tags: [],
    isFirst: true,
    isLast: false,
    showInfo: false,
    infoPhoto: undefined,
    infoPhotoData: undefined,
    photoActionController: mockPhotoActionController,
    librarySelectionController: mockLibrarySelectionController,
    setPreviousDetailPhoto: action('setPreviousDetailPhoto'),
    setNextDetailPhoto: action('setNextDetailPhoto'),
    setPhotoTags: action('setPhotoTags'),
    setShowInfo: action('setShowInfo'),
    closeDetail: action('closeDetail'),
}


addSection('PhotoDetailPane')
    .add('normal', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
        />
    ))
    .add('info', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
            showInfo={true}
            infoPhoto={defaultProps.photo}
            infoPhotoData={{
                fetchState: FetchState.IDLE,
                sectionId: defaultProps.sectionId,
                photoId: defaultProps.photo.id,
                photoDetail: {
                    versions: [],
                    tags: []
                },
                masterFileSize: 3380326,
                metaData: testBigPhotoMetData,
                exifData: null
            }}
        />
    ))
    .add('selection mode', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
            selection={{
                totalSelectedCount: 1,
                sectionSelectionById: {
                    [defaultProps.sectionId]: {
                        sectionId: defaultProps.sectionId,
                        selectedCount: 1,
                        selectedPhotosById: context.state.isSelected ? { [defaultProps.photo.id]: true } : {}
                    }
                }
            }}
            librarySelectionController={{
                ...mockLibrarySelectionController,
                setPhotoSelected: () => {
                    context.state.isSelected = !context.state.isSelected
                    context.forceUpdate()
                }
            }}
        />
    ))
    .add('loading', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
            photoWork={null}
        />
    ))
    .add('error', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
            photo={{ ...testBigPhoto, master_filename: 'missing-master' }}
        />
    ))
