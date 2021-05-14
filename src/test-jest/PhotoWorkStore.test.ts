import { fetchPhotoWork } from 'background/store/PhotoWorkStore'
import { PhotoWork } from 'common/CommonTypes'


// The images in `submodules/test-data/photos/picasa-import/crop-and-tilt` have been cropped and tilted in Picasa
// using different 90° rotations so the red rect covers the full canvas.
// We expect these settings are imported from Picasa
test('fetchPhotoWork with Picasa crop and tilt', async () => {
    const photoDir = 'submodules/test-data/photos/picasa-import/crop-and-tilt'

    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop_1.jpg', 1000, 800), {
        cropRect: { x: -456, y: -278, width: 808, height: 388 }
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop_2.jpg', 1000, 800), {
        cropRect: { x: -84, y: -281, width: 289, height: 181 },
        rotationTurns: 1
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop_3.jpg', 1000, 800), {
        cropRect: { x: -321, y: -359, width: 576, height: 408 },
        rotationTurns: 2
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop_4.jpg', 1000, 800), {
        cropRect: { x: -217, y: -351, width: 544, height: 120 },
        rotationTurns: 3
    })

    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop-and-tilt_1.jpg', 1000, 800), {
        cropRect: { x: -324, y: -265, width: 223, height: 111 },
        tilt: 7.6
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop-and-tilt_2.jpg', 1000, 800), {
        cropRect: { x: -213, y: 96, width: 183, height: 118 },
        rotationTurns: 1,
        tilt: -7.4
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop-and-tilt_3.jpg', 1000, 800), {
        cropRect: { x: -332, y: -89, width: 327, height: 253 },
        tilt: 1.9
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop-and-tilt_4.jpg', 1000, 800), {
        cropRect: { x: -319, y: 29, width: 197, height: 169 },
        tilt: 0.8
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop-and-tilt_5.jpg', 1000, 800), {
        cropRect: { x: -255, y: -169, width: 475, height: 365 },
        rotationTurns: 2,
        tilt: 11.5
    })
    expectCropAndTilt(await fetchPhotoWork(photoDir, 'crop-and-tilt_6.jpg', 1000, 800), {
        cropRect: { x: -107, y: 15, width: 149, height: 318 },
        rotationTurns: 3,
        tilt: -8
    })

    function expectCropAndTilt(actualPhotoWork: PhotoWork, expectedPhotoWork: PhotoWork) {

        if (Math.abs(expectedPhotoWork.tilt! - actualPhotoWork.tilt!) > 1) {
            throw new Error(`Expected tilt ${actualPhotoWork.tilt} to be close to ${expectedPhotoWork.tilt}`)
        }

        const actualCrop = actualPhotoWork.cropRect!
        const expectedCrop = expectedPhotoWork.cropRect!
        const cropDiff = Math.max(
            Math.abs(expectedCrop.x - actualCrop.x),
            Math.abs(expectedCrop.y - actualCrop.y),
            Math.abs(expectedCrop.width - actualCrop.width),
            Math.abs(expectedCrop.height - actualCrop.height),
        )

        if (cropDiff > 5) {
            throw new Error(`Expected cropRect ${actualPhotoWork.cropRect} to be close to ${expectedPhotoWork.cropRect}`)
        }

        delete actualPhotoWork.tilt
        delete expectedPhotoWork.tilt
        delete actualPhotoWork.cropRect
        delete expectedPhotoWork.cropRect
        expect(actualPhotoWork).toEqual(expectedPhotoWork)
    }
})
