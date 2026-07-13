import { Photo, PhotoId, PhotoById, PhotoSectionId, LoadedPhotoSection } from 'common/CommonTypes'

import { createTestPhotoId, testBigPhoto } from './MockData'


export function createRandomDummyPhoto(): Photo {
    const id = createTestPhotoId()
    const minAspect = 3/4
    const maxAspect = 16/9
    const aspect = minAspect + Math.random() * (maxAspect - minAspect)
    const masterWidth  = 200 + Math.random() * 2000
    const masterHeight = masterWidth / aspect
    return {
        ...testBigPhoto,
        id,
        masterDir: 'some/dir',
        masterFilename: 'dummy',
        masterWidth,
        masterHeight,
        editedWidth: masterWidth,
        editedHeight: masterHeight,
    }
}


export function createSection(sectionId: PhotoSectionId, photos: Photo[]): LoadedPhotoSection {
    let photoIds: PhotoId[] = []
    let photoData: PhotoById = {}
    for (const photo of photos) {
        photoIds.push(photo.id)
        photoData[photo.id] = photo
    }

    return {
        id: sectionId,
        title: sectionId,
        count: photoIds.length,
        photoIds,
        photoData
    }
}
