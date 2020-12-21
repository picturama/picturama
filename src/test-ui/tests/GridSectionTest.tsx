import React from 'react'

import CancelablePromise from 'common/util/CancelablePromise'
import { Photo, PhotoSectionId } from 'common/CommonTypes'
import { getNonRawPath } from 'common/util/DataUtil'
import { fileUrlFromPath } from 'common/util/TextUtil'

import { defaultGridRowHeight } from 'app/UiConstants'
import { estimateContainerHeight, createDummyLayoutBoxes } from 'app/controller/LibraryController'
import { gridBg } from 'app/style/variables'
import GridSection, { Props } from 'app/ui/library/GridSection'

import { addSection, action } from 'test-ui/core/UiTester'
import { createTestPhotoId, testBigPhoto, testPanoramaPhoto, testPortraitPhoto } from 'test-ui/util/MockData'
import { createSection, createRandomDummyPhoto, createLayoutForSection } from 'test-ui/util/TestUtil'


const containerWidth = 800
const scrollBarWidth = 20
const viewportWidth = containerWidth - scrollBarWidth

const defaultSectionId: PhotoSectionId = '2018-08-15'
const defaultPhotos = [ testBigPhoto, testPortraitPhoto, testPanoramaPhoto ]
const defaultSection = createSection(defaultSectionId, defaultPhotos)
const defaultLayout = createLayoutForSection(defaultSection, 0, viewportWidth, defaultGridRowHeight)


const defaultProps: Props = {
    inSelectionMode: false,
    section: defaultSection,
    layout: defaultLayout,
    selectedPhotoIds: null,
    getThumbnailSrc: (photo: Photo) => fileUrlFromPath(getNonRawPath(photo)),
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => {
        if (photo.master_filename === 'dummy') {
            return new CancelablePromise<string>(() => {})
        } else {
            return new CancelablePromise<string>(Promise.resolve(fileUrlFromPath(getNonRawPath(photo))))
        }
    },
    setActivePhoto: action('setActivePhoto'),
    setSectionSelected: action('setSectionSelected'),
    setPhotoSelected: action('setPhotoSelected'),
    showPhotoDetails: action('showPhotoDetails'),
}


addSection('GridSection')
    .setArenaStyle({ width: containerWidth, padding: 0, backgroundColor: gridBg, overflowY: 'auto' })
    .add('normal', context => (
        <GridSection
            {...defaultProps}
        />
    ))
    .add('selection mode', context => (
        <GridSection
            {...defaultProps}
            inSelectionMode={true}
            selectedPhotoIds={[ testPortraitPhoto.id ]}
        />
    ))
    .add('selection mode (all)', context => (
        <GridSection
            {...defaultProps}
            inSelectionMode={true}
            selectedPhotoIds='all'
        />
    ))
    .add('selection', context => (
        <GridSection
            {...defaultProps}
            selectedPhotoIds={[ testPortraitPhoto.id ]}
        />
    ))
    .add('creating thumbnails', context => {
        let photos = [ ...defaultPhotos ]
        for (let i = 0; i < 20; i++) {
            photos.push(createRandomDummyPhoto())
        }
        photos[0] = { ...photos[0], id: createTestPhotoId(), master_filename: 'dummy' }
        const section = createSection(defaultSectionId, photos)
        const layout = createLayoutForSection(section, 0, viewportWidth, defaultGridRowHeight)

        return (
            <GridSection
                {...defaultProps}
                section={section}
                layout={layout}
            />
        )
    })
    .add('loading section data', context => {
        const photoCount = 14
        const containerHeight = estimateContainerHeight(viewportWidth, defaultGridRowHeight, photoCount)
        return (
            <GridSection
                {...defaultProps}
                section={{
                    id: defaultSectionId,
                    title: defaultSectionId,
                    count: 14
                }}
                layout={{
                    sectionTop: 0,
                    containerHeight,
                    fromBoxIndex: 0,
                    toBoxIndex: photoCount,
                    boxes: createDummyLayoutBoxes(viewportWidth, defaultGridRowHeight, containerHeight, photoCount)
                }}
                selectedPhotoIds={null}
            />
        )
    })


    createDummyLayoutBoxes