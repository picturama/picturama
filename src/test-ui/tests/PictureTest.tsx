import React from 'react'

import { addSection, action } from 'test-ui/core/UiTester'
import { mockLibrarySelectionController, testDarkPhoto, testLightPhoto } from 'test-ui/util/MockData'

import { Photo, PhotoSectionId } from 'common/CommonTypes'
import CancelablePromise from 'common/util/CancelablePromise'
import { getNonRawPath } from 'common/util/DataUtil'
import ParameterTestDecorator from 'test-ui/util/ParameterTestDecorator'
import { fileUrlFromPath } from 'common/util/TextUtil'

import { boxSpacing } from 'app/controller/LibraryController'
import { gridBg } from 'app/style/variables'
import { defaultGridRowHeight } from 'app/UiConstants'
import Picture, { Props } from 'app/ui/library/Picture'


const testWrapperPadding = 40

type BaseTestProps = Omit<Props, 'librarySelectionController'>

const defaultPropsCommon: Omit<Props, 'photo' | 'layoutBox' | 'librarySelectionController'> = {
    inSelectionMode: false,
    sectionId: 'test-section',
    isActive: false,
    isSelected: false,
    getThumbnailSrc: (photo: Photo) => fileUrlFromPath(getNonRawPath(photo)),
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => {
        if (photo.master_filename === 'dummy') {
            return new CancelablePromise<string>(() => {})
        } else {
            return new CancelablePromise<string>(Promise.resolve(fileUrlFromPath(getNonRawPath(photo))))
        }
    },
    showPhotoDetails: action('showPhotoDetails'),
}

const defaultPropsLight: BaseTestProps = {
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

const defaultPropsDark: BaseTestProps = {
    ...defaultPropsCommon,
    photo: testDarkPhoto,
    layoutBox: {
        aspectRatio: testDarkPhoto.master_width / testDarkPhoto.master_height,
        left: defaultPropsLight.layoutBox.left + defaultPropsLight.layoutBox.width + boxSpacing,
        top: testWrapperPadding,
        width: Math.round(defaultGridRowHeight * testDarkPhoto.master_width / testDarkPhoto.master_height),
        height: defaultGridRowHeight
    },
}

addSection('Picture')
    .add('normal', context => {
        return (
            <ParameterTestDecorator
                testWrapperStyle={{
                    position: 'relative',
                    width:  defaultPropsDark.layoutBox.left + defaultPropsDark.layoutBox.width + testWrapperPadding,
                    height: defaultGridRowHeight + 2 * testWrapperPadding,
                    backgroundColor: gridBg
                }}
                forceRedrawOnChange={false}
                context={context}
                parameterSpec={{
                    inSelectionMode: { label: 'Selection mode', defaultValue: true },
                    isFavorite: { label: 'Favorite' },
                    isPreSelected: { label: 'Pre-Selected' },
                    isPreDeselected: { label: 'Pre-Deselected' },
                }}
                renderTest={(context, params) => {
                    return (
                        <>
                            {renderPicture(defaultPropsLight)}
                            {renderPicture(defaultPropsDark)}
                        </>
                    )

                    function renderPicture(props: BaseTestProps) {
                        const photoId = props.photo.id
                        return (
                            <Picture
                                {...props}
                                inSelectionMode={params.inSelectionMode}
                                photo={{ ...props.photo, flag: params.isFavorite ? 1 : 0 }}
                                isActive={context.state.activePhotoId === photoId}
                                isSelected={context.state.selectedIds?.[photoId]}
                                preselected={params.isPreSelected ? true : params.isPreDeselected ? false : undefined}
                                librarySelectionController={{
                                    ...mockLibrarySelectionController,
                                    setActivePhoto: () => {
                                        context.state.activePhotoId = photoId
                                        context.forceUpdate()
                                    },
                                    setPhotoSelected: (sectionId, photoId, selected) => {
                                        if (!context.state.selectedIds) {
                                            context.state.selectedIds = {}
                                        }
                                        context.state.selectedIds[photoId] = selected
                                        context.forceUpdate()
                                    },
                                }}
                            />
                        )
                    }

                }}
            />
        )
    })
