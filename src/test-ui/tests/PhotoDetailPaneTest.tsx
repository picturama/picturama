import React from 'react'

import { MetaData, ExifData } from 'common/CommonTypes'

import { PhotoDetailPane, Props } from 'app/ui/detail/PhotoDetailPane'

import {addSection, action} from 'test-ui/core/UiTester'
import { testBigPhoto, testBigPhotoMetData } from 'test-ui/util/MockData'


const defaultProps: Props = {
    style: { width: '100%', height: '100%', overflow: 'hidden' },
    isActive: true,
    devicePixelRatio: window.devicePixelRatio,
    inSelectionMode: false,
    sectionId: 'dummy',
    photo: testBigPhoto,
    photoPrev: null,
    photoNext: null,
    photoWork: {},
    photoDetail: { versions: [], tags: [] },
    tags: [],
    isFirst: true,
    isLast: false,
    isSelected: false,
    setPreviousDetailPhoto: action('setPreviousDetailPhoto'),
    setNextDetailPhoto: action('setNextDetailPhoto'),
    getFileSize(path: string): Promise<number> { return Promise.resolve(3380326) },
    readMetadataOfImage(imagePath: string): Promise<MetaData> { return Promise.resolve(testBigPhotoMetData) },
    getExifData(path: string): Promise<ExifData | null> { return Promise.resolve(null) },
    setPhotoSelected: action('setPhotoSelected'),
    updatePhotoWork: action('updatePhotoWork'),
    setPhotosFlagged: action('setPhotosFlagged'),
    setPhotoTags: action('setPhotoTags'),
    movePhotosToTrash: action('movePhotosToTrash'),
    restorePhotosFromTrash: action('restorePhotosFromTrash'),
    openExport: action('openExport'),
    openDiff: action('openDiff'),
    closeDetail: action('closeDetail'),
}


addSection('PhotoDetailPane')
    .add('normal', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
        />
    ))
    .add('selection mode', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
            inSelectionMode={true}
            isSelected={!!context.state.isSelected}
            setPhotoSelected={() => {
                context.state.isSelected = !context.state.isSelected
                context.forceUpdate()
            }}
        />
    ))
    .add('loading', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
            photoWork={null}
            photoDetail={null}
        />
    ))
    .add('error', context => (
        <PhotoDetailPane
            {...defaultProps}
            devicePixelRatio={window.devicePixelRatio}
            photo={{ ...testBigPhoto, master_filename: 'missing-master' }}
        />
    ))
