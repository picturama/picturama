import React from 'react'

import { Photo, PhotoDetail } from 'common/CommonTypes'

import PhotoInfo, { Props } from 'app/ui/info/PhotoInfo'

import { addSection, action, TestContext } from 'test-ui/core/UiTester'
import { testBigPhoto, testBigPhotoMetData, testExifData } from 'test-ui/util/MockData'
import { FetchState } from 'app/UITypes'
import { InfoPhotoData } from 'app/state/StateTypes'


const baseUrl = 'dist'
const defaultTags = [ 'Holiday', 'Family', 'Cool stuff' ]

let sharedPhotoDetail: PhotoDetail = {
    versions: [],
    tags: [ defaultTags[0], defaultTags[2] ]
}

const defaultPhotoData: InfoPhotoData = {
    fetchState: FetchState.IDLE,
    sectionId: 'test-section',
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
        photo: { ...testBigPhoto, master_dir: `${baseUrl}/${testBigPhoto.master_dir}` } as Photo,
        photoData: {
            ...defaultPhotoData,
            photoDetail: sharedPhotoDetail,
        },
        tags: defaultTags,
        setPhotoTags: (photo: Photo, tags: string[]) => {
            sharedPhotoDetail = {
                versions: sharedPhotoDetail.versions,
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
            photo={{ ...testBigPhoto, edited_width: 800, edited_height: 600 }}
        />
    ))
    .add('filename overflow', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photo={{ ...testBigPhoto, master_filename: 'RAW_FUJI_FINEPIX_X100.RAF' }}
        />
    ))
    .add('no tags', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photoData={{
                ...defaultPhotoData,
                photoDetail: { versions: [], tags: [] }
            }}
        />
    ))
    .add('loading tags', context => (
        <PhotoInfo
            {...createDefaultProps(context)}
            photoData={{
                ...defaultPhotoData,
                photoDetail: null
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
