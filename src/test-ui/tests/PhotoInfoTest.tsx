import React from 'react'

import { Photo, PhotoDetail, PhotoSectionId } from 'app/CommonTypes'

import PhotoInfo, { Props } from 'app/ui/info/PhotoInfo'

import { addSection, action, TestContext } from 'test-ui/core/UiTester'
import { testBigPhoto, testBigPhotoMetData, testExifData } from 'test-ui/util/MockData'
import { InfoPhotoDataState, LoadedInfoPhotoData } from 'app/state/StateTypes'


const baseUrl = 'dist'
const defaultTags = [ 'Holiday', 'Family', 'Cool stuff' ]

let sharedPhotoDetail: PhotoDetail = {
    tags: [ defaultTags[0], defaultTags[2] ]
}

const defaultPhotoData: LoadedInfoPhotoData = {
    state: InfoPhotoDataState.Loaded,
    sectionId: 'test-section' as PhotoSectionId,
    photoId: testBigPhoto.id,
    photoDetail: sharedPhotoDetail,
    masterFileSize: 3380326,
    metaData: testBigPhotoMetData,
    exifData: testExifData,
}

function createDefaultProps(context: TestContext): Props {
    return {
        style: { width: '300px', height: '100%' },

        isActive: true,
        photo: { ...testBigPhoto, masterDir: `${baseUrl}/${testBigPhoto.masterDir}` } as Photo,
        photoData: {
            ...defaultPhotoData,
            photoDetail: sharedPhotoDetail,
        },
        tags: defaultTags,
        setPhotoTags: (photo: Photo, tags: string[]) => {
            sharedPhotoDetail = {
                tags
            }
            context.forceUpdate()
        },
        closeInfo: action('closeInfo'),
    }
}


addSection('PhotoInfo')
    .add('normal', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
        />
    ))
    .add('with edited size', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photo={{ ...testBigPhoto, editedWidth: 800, editedHeight: 600 }}
        />
    ))
    .add('filename overflow', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photo={{ ...testBigPhoto, masterFilename: 'RAW_FUJI_FINEPIX_X100.RAF' }}
        />
    ))
    .add('no tags', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photoData={{
                ...defaultPhotoData,
                photoDetail: {
                    tags: []
                }
            }}
        />
    ))
    .add('loading info', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photoData={{
                state: InfoPhotoDataState.Loading,
                photoId: defaultPhotoData.photoId,
                sectionId: defaultPhotoData.sectionId,
            }}
        />
    ))
    .add('photo missing', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photoData={{
                state: InfoPhotoDataState.MasterIsMissing,
                photoId: defaultPhotoData.photoId,
                sectionId: defaultPhotoData.sectionId,
                photoDetail: defaultPhotoData.photoDetail,
            }}
        />
    ))
    .add('fetching info failed', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photoData={{
                state: InfoPhotoDataState.Error,
                photoId: defaultPhotoData.photoId,
                sectionId: defaultPhotoData.sectionId,
            }}
        />
    ))
    .add('no photo', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photo={undefined}
        />
    ))
    .add('not active', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            isActive={false}
        />
    ))
