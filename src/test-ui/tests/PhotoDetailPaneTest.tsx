import React from 'react'

import { PhotoSectionId } from 'app/CommonTypes'
import { InfoPhotoDataState } from 'app/state/StateTypes'
import { PhotoDetailPane, Props } from 'app/ui/detail/PhotoDetailPane'

import {addSection, action, TestContext} from 'test-ui/core/UiTester'
import { mockLibrarySelectionController, mockPhotoActionController, testBigPhoto, testBigPhotoMetData } from 'test-ui/util/MockData'


function createDefaultProps(context: TestContext): Props {
    const props: Props = {
        style: { width: '100%', height: '100%', overflow: 'hidden' },
        isActive: true,
        devicePixelRatio: window.devicePixelRatio,
        sectionId: 'dummy' as PhotoSectionId,
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
        setShowInfo(showInfo: boolean) {
            context.state.showInfo = showInfo
            context.forceUpdate()
        },
        closeDetail: action('closeDetail'),
    }

    if (context.state.showInfo) {
        props.showInfo = true
        props.infoPhoto = props.photo
        props.infoPhotoData = {
            state: InfoPhotoDataState.Loaded,
            sectionId: props.sectionId,
            photoId: props.photo.id,
            photoDetail: {
                tags: []
            },
            masterFileSize: 3380326,
            metaData: testBigPhotoMetData,
            exifData: null
        }
    }

    return props
}


addSection('PhotoDetailPane')
    .add('normal', context => (
        <PhotoDetailPane
            {...createDefaultProps(context)}
        />
    ))
    .add('selection mode', context => {
        const defaultProps = createDefaultProps(context)
        return (
            <PhotoDetailPane
                {...defaultProps}
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
        )
    })
    .add('loading', context => (
        <PhotoDetailPane
            {...createDefaultProps(context)}
            photoWork={null}
        />
    ))
    .add('error', context => (
        <PhotoDetailPane
            {...createDefaultProps(context)}
            photo={{ ...testBigPhoto, masterFilename: 'missing-master' }}
        />
    ))
