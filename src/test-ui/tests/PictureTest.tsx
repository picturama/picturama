import React from 'react'

import { addSection, action } from 'test-ui/core/UiTester'

import Picture, { Props } from 'app/ui/library/Picture'

import { testDarkPhoto, testLightPhoto } from 'test-ui/util/MockData'
import { getNonRawPath } from 'common/util/DataUtil'
import { fileUrlFromPath } from 'common/util/TextUtil'
import { Photo, PhotoSectionId } from 'common/CommonTypes'
import CancelablePromise from 'common/util/CancelablePromise'
import { defaultGridRowHeight } from 'app/UiConstants'
import ParameterTestDecorator from 'test-ui/util/ParameterTestDecorator'


const testWrapperPadding = 40
const testBoxSpacing = 2

const defaultPropsCommon: Omit<Props, 'photo' | 'layoutBox'> = {
    sectionId: 'test-section',
    isActive: false,
    getThumbnailSrc: (photo: Photo) => fileUrlFromPath(getNonRawPath(photo)),
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => {
        if (photo.master_filename === 'dummy') {
            return new CancelablePromise<string>(() => {})
        } else {
            return new CancelablePromise<string>(Promise.resolve(fileUrlFromPath(getNonRawPath(photo))))
        }
    },
    onPhotoClick: action('onPhotoClick'),
    onPhotoDoubleClick: action('onPhotoDoubleClick'),
}

const defaultPropsLight: Props = {
    ...defaultPropsCommon,
    photo: testLightPhoto,
    layoutBox: {
        aspectRatio: testLightPhoto.master_width / testLightPhoto.master_height,
        left: testWrapperPadding,
        top: testWrapperPadding,
        width: Math.round(defaultGridRowHeight * testLightPhoto.master_width / testLightPhoto.master_height),
        height: defaultGridRowHeight
    },
}

const defaultPropsDark: Props = {
    ...defaultPropsCommon,
    photo: testDarkPhoto,
    layoutBox: {
        aspectRatio: testDarkPhoto.master_width / testDarkPhoto.master_height,
        left: defaultPropsLight.layoutBox.left + defaultPropsLight.layoutBox.width + testBoxSpacing,
        top: testWrapperPadding,
        width: Math.round(defaultGridRowHeight * testDarkPhoto.master_width / testDarkPhoto.master_height),
        height: defaultGridRowHeight
    },
}

addSection('Picture')
    .add('normal', context => (
        <ParameterTestDecorator
            testWrapperStyle={{
                position: 'relative',
                width:  defaultPropsDark.layoutBox.left + defaultPropsDark.layoutBox.width + testWrapperPadding,
                height: defaultGridRowHeight + 2 * testWrapperPadding,
                backgroundColor: '#cfd8dc'
            }}
            forceRedrawOnChange={false}
            context={context}
            parameterSpec={{
                isFavorite: { label: 'Favorite' },
            }}
            renderTest={(context, params) =>
                <>
                    <Picture
                        {...defaultPropsLight}
                        isActive={context.state.activePhoto === 'light'}
                        photo={{ ...defaultPropsLight.photo, flag: params.isFavorite ? 1 : 0 }}
                        onPhotoClick={() => {
                            context.state.activePhoto = 'light'
                            context.forceUpdate()
                        }}
                    />
                    <Picture
                        {...defaultPropsDark}
                        isActive={context.state.activePhoto === 'dark'}
                        photo={{ ...defaultPropsDark.photo, flag: params.isFavorite ? 1 : 0 }}
                        onPhotoClick={() => {
                            context.state.activePhoto = 'dark'
                            context.forceUpdate()
                        }}
                    />
                </>
            }
        />
    ))
