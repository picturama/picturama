import React from 'react'
import { Button } from '@blueprintjs/core'

import { Photo, PhotoSectionById, PhotoSectionId, LoadedPhotoSection, PhotoFilter, MetaData, ExifData } from 'common/CommonTypes'
import CancelablePromise from 'common/util/CancelablePromise'
import { getNonRawPath } from 'common/util/DataUtil'
import { addErrorCode } from 'common/util/LangUtil'
import { fileUrlFromPath } from 'common/util/TextUtil'

import { defaultGridRowHeight } from 'app/UiConstants'
import { FetchState, GridLayout } from 'app/UITypes'
import { Library, Props } from 'app/ui/library/Library'
import { LibraryFilterButton } from 'app/ui/library/LibraryFilterButton'
import SelectionSummary from 'app/ui/library/SelectionSummary'
import ImportProgressButton from 'app/ui/ImportProgressButton'

import { addSection, action, TestContext } from 'test-ui/core/UiTester'
import { mockLibrarySelectionController, mockPhotoActionController, testBigPhotoMetData, testLandscapePhoto, testPanoramaPhoto, testPhotos } from 'test-ui/util/MockData'
import { createRandomDummyPhoto, createSection, createLayoutForSection } from 'test-ui/util/TestUtil'


const defaultSectionId: PhotoSectionId = '2018-08-15'
const defaultPhotos = testPhotos
const defaultSection = createSection(defaultSectionId, defaultPhotos)

let sharedGridRowHeight = defaultGridRowHeight
    // Use the same gridRowHeight among all tests (so row height doesn't change when changing between tests)

function createDefaultProps(context: TestContext): Props {
    return {
        style: { width: '100%', height: '100%', overflow: 'hidden' },
        topBarLeftItem: renderTopBarLeftItem({ type: 'all' }),
        isActive: true,

        hasPhotoDirs: true,
        isFetching: false,
        isImporting: false,
        libraryFilterType: 'all',
        photoCount: 1042,
        totalPhotoCount: 12345,
        sectionIds: [ defaultSectionId ],
        sectionById: {
            [defaultSectionId]: defaultSection
        } as PhotoSectionById,
        activePhoto: null,
        selection: null,
        preselectionRange: null,
        showInfo: false,
        infoPhoto: undefined,
        infoPhotoData: undefined,
        tags: [ 'Flower', 'Panorama' ],
        gridRowHeight: sharedGridRowHeight,
        photoActionController: mockPhotoActionController,
        librarySelectionController: mockLibrarySelectionController,

        fetchTotalPhotoCount: action('fetchTotalPhotoCount'),
        fetchSections: action('fetchSections'),
        fetchTags: action('fetchTags'),
        getGridLayout,
        getThumbnailSrc: (photo: Photo) => fileUrlFromPath(getNonRawPath(photo)),
        createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => {
            if (photo.master_filename === 'dummy') {
                return new CancelablePromise<string>(() => {})
            } else if (photo.master_filename === 'error_master-missing') {
                return new CancelablePromise<string>(Promise.reject(addErrorCode(new Error('test error'), 'master-missing')))
            } else {
                return new CancelablePromise<string>(Promise.resolve(fileUrlFromPath(getNonRawPath(photo))))
            }
        },
        setGridRowHeight: (gridRowHeight: number) => {
            sharedGridRowHeight = gridRowHeight
            context.forceUpdate()
        },
        setDetailPhotoById: action('setDetailPhotoById'),
        setPhotoTags: action('setPhotoTags'),
        setShowInfo: action('setShowInfo'),
        startScanning: action('startScanning'),
    }
}

function renderTopBarLeftItem(libraryFilter: PhotoFilter): JSX.Element {
    return (
        <>
            <LibraryFilterButton
                libraryFilter={libraryFilter}
                tagIds={[ 1, 2 ]}
                tagById={{
                    1: {
                        created_at: 1565357205167,
                        id: 1,
                        slug: 'flower',
                        title: 'Flower',
                        updated_at: null
                    },
                    2: {
                        created_at: 1565357205167,
                        id: 2,
                        slug: 'panorama',
                        title: 'Panorama',
                        updated_at: null
                    }
                }}
                devices={[]}
                setLibraryFilter={action('setLibraryFilter')}
            />
            <Button
                minimal={true}
                icon='cog'
                onClick={action('openSettings')}
            />
        </>
    )
}


function getGridLayout(sectionIds: PhotoSectionId[], sectionById: PhotoSectionById,
    scrollTop: number, viewportWidth: number, viewportHeight: number, gridRowHeight: number):
    GridLayout
{
    let sectionTop = 0
    const sectionLayouts = sectionIds.map(sectionId => {
        const section = sectionById[sectionId]
        const layout = createLayoutForSection(section as LoadedPhotoSection, sectionTop, viewportWidth, gridRowHeight)
        sectionTop += layout.height
        return layout
    })

    return {
        fromSectionIndex: 0,
        toSectionIndex: sectionIds.length,
        sectionLayouts
    }
}


addSection('Library')
    .add('normal', context => (
        <Library
            {...createDefaultProps(context)}
        />
    ))
    .add('active photo', context => (
        <Library
            {...createDefaultProps(context)}
            activePhoto={{ sectionId: defaultSectionId, photoId: defaultSection.photoIds[2] }}
        />
    ))
    .add('selection mode', context => (
        <Library
            {...createDefaultProps(context)}
            topBarLeftItem={
                <SelectionSummary
                    selectedCount={3}
                    onClearSelection={action('onClearSelection')}
                />
            }
            selection={{
                totalSelectedCount: 3,
                sectionSelectionById: {
                    [defaultSectionId]: {
                        sectionId: defaultSectionId,
                        selectedCount: 3,
                        selectedPhotosById: {
                            [defaultSection.photoIds[2]]: true,
                            [defaultSection.photoIds[3]]: true,
                            [defaultSection.photoIds[5]]: true,
                        }
                    }
                }
            }}
        />
    ))
    .add('pre-selection', context => (
        <Library
            {...createDefaultProps(context)}
            topBarLeftItem={
                <SelectionSummary
                    selectedCount={3}
                    onClearSelection={action('onClearSelection')}
                />
            }
            activePhoto={{ sectionId: defaultSectionId, photoId: defaultSection.photoIds[2] }}
            selection={{
                totalSelectedCount: 2,
                sectionSelectionById: {
                    [defaultSectionId]: {
                        sectionId: defaultSectionId,
                        selectedCount: 2,
                        selectedPhotosById: {
                            [defaultSection.photoIds[2]]: true,
                            [defaultSection.photoIds[4]]: true,
                        }
                    }
                }
            }}
            preselectionRange={{ selected: true, startSectionIndex: 0, startPhotoIndex: 2, endSectionIndex: 0, endPhotoIndex: 5 }}
        />
    ))
    .add('pre-deselection', context => (
        <Library
            {...createDefaultProps(context)}
            topBarLeftItem={
                <SelectionSummary
                    selectedCount={3}
                    onClearSelection={action('onClearSelection')}
                />
            }
            activePhoto={{ sectionId: defaultSectionId, photoId: defaultSection.photoIds[2] }}
            selection={{
                totalSelectedCount: 1,
                sectionSelectionById: {
                    [defaultSectionId]: {
                        sectionId: defaultSectionId,
                        selectedCount: 1,
                        selectedPhotosById: {
                            [defaultSection.photoIds[4]]: true,
                        }
                    }
                }
            }}
            preselectionRange={{ selected: false, startSectionIndex: 0, startPhotoIndex: 2, endSectionIndex: 0, endPhotoIndex: 5 }}
        />
    ))
    .add('info', context => {
        const infoPhotoId = defaultSection.photoIds[2]
        return (
            <Library
                {...createDefaultProps(context)}
                activePhoto={{ sectionId: defaultSectionId, photoId: infoPhotoId }}
                showInfo={true}
                infoPhoto={defaultSection.photoData[infoPhotoId]}
                infoPhotoData={{
                    fetchState: FetchState.IDLE,
                    sectionId: defaultSectionId,
                    photoId: infoPhotoId,
                    photoDetail: {
                        versions: [],
                        tags: []
                    },
                    masterFileSize: 3380326,
                    metaData: testBigPhotoMetData,
                    exifData: null
                }}
            />
        )
    })
    .add('panorama', context => {
        let photos = [ ...defaultPhotos ]
        photos.splice(2, 0, testPanoramaPhoto)
        const section = createSection(defaultSectionId, photos)

        return (
            <Library
                {...createDefaultProps(context)}
                sectionIds={[ defaultSectionId ]}
                sectionById={{
                    [defaultSectionId]: section
                } as PhotoSectionById}
            />
        )
    })
    .add('scrolling', context => {
        const sectionIds: PhotoSectionId[] = []
        for (let i = 50; i > 0; i--) {
            const month = (i % 12) + 1
            const year = 2000 + Math.floor(i / 12)
            sectionIds.push(`${year}-${month < 10 ? '0' : ''}${month}-01`)
        }

        const sectionById: PhotoSectionById = {}
        const minPhotoCount = 2
        for (const sectionId of sectionIds) {
            const photos = randomizedArray(testPhotos)
            photos.splice(minPhotoCount, Math.floor(Math.random() * (photos.length - minPhotoCount)))
            sectionById[sectionId] = createSection(sectionId, photos)
        }

        return (
            <Library
                {...createDefaultProps(context)}
                sectionIds={sectionIds}
                sectionById={sectionById}
            />
        )
    })
    .add('importing', context => (
        <Library
            {...createDefaultProps(context)}
            bottomBarLeftItem={
                <ImportProgressButton
                    progress={{ phase: 'import-photos', isPaused: false, total: 1042, processed: 120, added: 40, removed: 21, currentPath: '/user/me/documents/mypics/2018/summer vacation' }}
                    toggleImportPaused={action('toggleImportPaused')}
                    cancelImport={action('cancelImport')}
                />
            }
            isImporting={true}
        />
    ))
    .add('first import', context => (
        <Library
            {...createDefaultProps(context)}
            bottomBarLeftItem={
                <ImportProgressButton
                    progress={{ phase: 'scan-dirs', isPaused: false, total: 120, processed: 0, added: 0, removed: 0, currentPath: '/user/me/documents/mypics/2016/birthday party' }}
                    toggleImportPaused={action('toggleImportPaused')}
                    cancelImport={action('cancelImport')}
                />
            }
            isImporting={true}
            photoCount={0}
            sectionIds={[]}
            sectionById={{}}
        />
    ))
    .add('Fetching sections', context => (
        <Library
            {...createDefaultProps(context)}
            isFetching={true}
            photoCount={0}
            sectionIds={[]}
            sectionById={{}}
        />
    ))
    .add('creating thumbnails', context => {
        let photos = [ ...defaultPhotos ]
        for (let i = 0; i < 100; i++) {
            photos.push(createRandomDummyPhoto())
        }
        photos = randomizedArray(photos)
        const section = createSection(defaultSectionId, photos)

        return (
            <Library
                {...createDefaultProps(context)}
                sectionIds={[ defaultSectionId ]}
                sectionById={{
                    [defaultSectionId]: section
                } as PhotoSectionById}
            />
        )
    })
    .add('thumbnail error', context => {
        let photos = [ ...defaultPhotos ]
        const errorPhoto1 = createRandomDummyPhoto()
        errorPhoto1.master_filename = 'error_load-failed'
        const errorPhoto2 = createRandomDummyPhoto()
        errorPhoto2.master_filename = 'error_master-missing'
        photos.splice(1, 0, errorPhoto1, errorPhoto2)
        const section = createSection(defaultSectionId, photos)

        return (
            <Library
                {...createDefaultProps(context)}
                sectionIds={[ defaultSectionId ]}
                sectionById={{
                    [defaultSectionId]: section
                } as PhotoSectionById}
            />
        )
    })
    .add('No photo dirs', context => (
        <Library
            {...createDefaultProps(context)}
            hasPhotoDirs={false}
            photoCount={0}
            totalPhotoCount={0}
            sectionIds={[]}
            sectionById={{}}
        />
    ))
    .add('No photos', context => (
        <Library
            {...createDefaultProps(context)}
            photoCount={0}
            totalPhotoCount={0}
            sectionIds={[]}
            sectionById={{}}
        />
    ))
    .add('Empty favorites', context => (
        <Library
            {...createDefaultProps(context)}
            topBarLeftItem={renderTopBarLeftItem({ type: 'favorites' })}
            libraryFilterType={'favorites'}
            photoCount={0}
            sectionIds={[]}
            sectionById={{}}
        />
    ))
    .add('Empty trash', context => (
        <Library
            {...createDefaultProps(context)}
            topBarLeftItem={renderTopBarLeftItem({ type: 'trash' })}
            libraryFilterType={'trash'}
            photoCount={0}
            sectionIds={[]}
            sectionById={{}}
        />
    ))
    .add('Trash with selection', context => (
        <Library
            {...createDefaultProps(context)}
            topBarLeftItem={
                <SelectionSummary
                    selectedCount={1}
                    onClearSelection={action('onClearSelection')}
                />
            }
            libraryFilterType={'trash'}
            selection={{
                totalSelectedCount: 1,
                sectionSelectionById: {
                    [defaultSectionId]: {
                        sectionId: defaultSectionId,
                        selectedCount: 1,
                        selectedPhotosById: {
                            [testLandscapePhoto.id]: true,
                        }
                    }
                }
            }}
        />
    ))


function randomizedArray<T>(array: T[]): T[] {
    const remaining = [ ...array ]
    const result: T[] = []
    while (remaining.length > 0) {
        const randomIndex = Math.floor(Math.random() * remaining.length)
        result.push(remaining.splice(randomIndex, 1)[0])
    }
    return result
}
