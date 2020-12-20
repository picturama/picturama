import { PhotoId, Photo, PhotoDetail, MetaData, ExifData } from 'common/CommonTypes'


// Relative to folder `dist`
export const testPhotosDir = '../submodules/test-data/photos'
const testPhotos800Dir = `${testPhotosDir}/800`


let nextTestPhotoId: PhotoId = 49
export function createTestPhotoId(): PhotoId {
    return nextTestPhotoId++
}


function createMockPhoto(options: { dir: string, filename: string, width: number, height: number, special?: Partial<Photo> }): Photo {
    return {
        id: createTestPhotoId(),
        master_dir: options.dir,
        master_filename: options.filename,
        master_width: options.width,
        master_height: options.height,
        master_is_raw: 0,
        edited_width: options.width,
        edited_height:  options.height,
        date_section: '2018-05-15',
        created_at: 1474222345000,
        updated_at: 1474222345000,
        imported_at: 1565807324226,
        flag: 0,
        trashed: 0,
        ...options.special
    }
}


export const testBigPhoto = createMockPhoto({
    dir: testPhotosDir,
    filename: 'IMG_9700.JPG',
    width: 5184,
    height: 3456,
})

export const testBigPhotoMetData: MetaData = {
    aperture: 5.6,
    camera: 'Canon EOS 700D',
    createdAt: new Date(2016, 9-1, 18, 16, 12, 25),
    exposureTime: 0.016666666666666666,
    focalLength: 55,
    imgHeight: 3456,
    imgWidth: 5184,
    iso: 1600,
    orientation: 1,
    tags: [],
}

export const testLandscapePhoto = createMockPhoto({
    dir: testPhotosDir,
    filename: 'landscape.jpg',
    width: 800,
    height: 530,
})

export const testPortraitPhoto = createMockPhoto({
    dir: testPhotosDir,
    filename: 'portrait.jpg',
    width: 785,
    height: 1024,
    special: { flag: 1 }
})

export const testPanoramaPhoto = createMockPhoto({
    dir: testPhotosDir,
    filename: 'panorama.jpg',
    width: 1024,
    height: 225,
})

export const testLightPhoto = createMockPhoto({
    dir: testPhotos800Dir,
    filename: 'ice-cubes.jpg',
    width: 800,
    height: 533,
})

export const testDarkPhoto = testPortraitPhoto


export const testPhotos: Photo[] = [
    { dir: testPhotos800Dir, filename: 'alone.jpg',          width: 800, height: 533 },
    { dir: testPhotos800Dir, filename: 'architecture.jpg',   width: 800, height: 533 },
    { dir: testPhotos800Dir, filename: 'door-knocker.jpg',   width: 800, height: 533 },
    { dir: testPhotos800Dir, filename: 'koblenz.jpg',        width: 800, height: 518 },
    { dir: testPhotos800Dir, filename: 'light-bulb.jpg',     width: 800, height: 533 },
    { dir: testPhotos800Dir, filename: 'railway-tracks.jpg', width: 800, height: 533 },
    { dir: testPhotos800Dir, filename: 'rustic.jpg',         width: 800, height: 450 },
    { dir: testPhotos800Dir, filename: 'tomatoes.jpg',       width: 516, height: 800 },
    { dir: testPhotos800Dir, filename: 'water.jpg',          width: 800, height: 450 },
    { dir: testPhotos800Dir, filename: 'wolf.jpg',           width: 800, height: 498 },
].map(createMockPhoto)
testPhotos.unshift(testLandscapePhoto, testPortraitPhoto, testLightPhoto)

export const testPhotoDetail: PhotoDetail = {
    tags: [],
    versions: []
}

export const testExifData: ExifData = {
    exif: {
        ApertureValue: 1.6959938128383605,
        BrightnessValue: 5.969318478544695,
        ColorSpace: 65535,
        ComponentsConfiguration: new Uint8Array([1,2,3,0]),
        CreateDate: '2019-09-16T17:14:32.000Z',
        DateTimeOriginal: '2019-09-16T17:14:32.000Z',
        ExifImageHeight: 3024,
        ExifImageWidth: 4032,
        ExifVersion: '2.2.1',
        ExposureCompensation: 0,
        ExposureMode: 'Auto',
        ExposureProgram: 'Normal program',
        ExposureTime: 0.00819672131147541,
        FNumber: 1.8,
        Flash: 'Flash did not fire, auto mode',
        FlashpixVersion: '1.0',
        FocalLength: 4.25,
        FocalLengthIn35mmFormat: 26,
        ISO: 32,
        LensInfo: [ 4.25, 4.25, 1.8, 1.8 ],
        LensMake: 'Apple',
        LensModel: 'iPhone XR back camera 4.25mm f/1.8',
        MeteringMode: 'Pattern',
        SceneCaptureType: 'Standard',
        SceneType: 'Directly photographed',
        SensingMethod: 'One-chip color area sensor',
        ShutterSpeedValue: 6.925417839813095,
        SubSecTimeDigitized: '528',
        SubSecTimeOriginal: '528',
        SubjectArea: new Uint8Array([221,7,231,5,169,8,50,5]),
        WhiteBalance: 'Auto'
    },
    gps: {
        GPSAltitude: 2.379370382570232,
        GPSAltitudeRef: new Uint8Array([0]),
        GPSDateStamp: '2019:09:16',
        GPSDestBearing: 157.90253451473316,
        GPSDestBearingRef: 'True North',
        GPSHPositioningError: 5.144150682564368,
        GPSImgDirection: 157.90253451473316,
        GPSImgDirectionRef: 'T',
        GPSLatitude: [ 42, 6, 44.24 ],
        GPSLatitudeRef: 'N',
        GPSLongitude: [ 9, 33, 5.73 ],
        GPSLongitudeRef: 'E',
        GPSSpeed: 0.2356741726187231,
        GPSSpeedRef: 'K',
        GPSTimeStamp: '17:14:30.99',
        latitude: 42.11228888888889,
        longitude: 9.551591666666667
    },
    icc: {
        BlueMatrixColumn: new Uint8Array([88,89,90,32,0,0,0,0,0,0,40,56,0,0,17,11,0,0,200,185]),
        BlueTRC: new Uint8Array([112,97,114,97,0,0,0,0,0,3,0,0,0,2,102,102,0,0,242,167,0,0,13,89,0,0,19,208,0,0,10,91]),
        ChromaticAdaptation: new Uint8Array([115,102,51,50,0,0,0,0,0,1,12,66,0,0,5,222,255,255,243,38,0,0,7,147,0,0,253,144,255,255,251,162,255,255,253,163,0,0,3,220,0,0,192,110]),
        ColorSpaceData: 'RGB',
        DeviceManufacturer: 'Apple Computer',
        GreenMatrixColumn: new Uint8Array([88,89,90,32,0,0,0,0,0,0,74,191,0,0,177,55,0,0,10,185]),
        GreenTRC: new Uint8Array([112,97,114,97,0,0,0,0,0,3,0,0,0,2,102,102,0,0,242,167,0,0,13,89,0,0,19,208,0,0,10,91]),
        MediaWhitePoint: new Uint8Array([88,89,90,32,0,0,0,0,0,0,243,81,0,1,0,0,0,1,22,204]),
        PrimaryPlatform: 'Apple Computer',
        ProfileCMMType: 'Apple Computer',
        ProfileClass: 'Monitor',
        ProfileConnectionSpace: 'XYZ',
        ProfileCopyright: 'Copyright Apple Inc.',
        ProfileCreator: 'Apple Computer',
        ProfileDateTime: '2017-07-07T13:22:32.000Z',
        ProfileDescription: 'Display P3',
        ProfileFileSignature: 'acsp',
        ProfileVersion: '4.0.0',
        RedMatrixColumn: new Uint8Array([88,89,90,32,0,0,0,0,0,0,131,223,0,0,61,191,255,255,255,187]),
        RedTRC: new Uint8Array([112,97,114,97,0,0,0,0,0,3,0,0,0,2,102,102,0,0,242,167,0,0,13,89,0,0,19,208,0,0,10,91]),
        RenderingIntent: 'Perceptual'
    },
    ifd0: {
        Make: 'Apple',
        Model: 'iPhone XR',
        ModifyDate: '2019-09-16T17:14:32.000Z',
        Orientation: 'Horizontal (normal)',
        ResolutionUnit: 'inches',
        Software: '12.4',
        XResolution: 72,
        YCbCrPositioning: 1,
        YResolution: 72
    },
    jfif: {
        JFIFVersion: 257,
        ResolutionUnit: 0,
        ThumbnailHeight: 0,
        ThumbnailWidth: 0,
        XResolution: 1,
        YResolution: 1
    },
    makerNote: new Uint8Array([65,112,112,108,101,32,105,79,83,0,0,1,77,77,0,23,0,1,0,9,0,0,0,1,0,0,0,10,0,2,0,7,0,0,2,46,0,0,1,40,0,3,0,7,0,0,0,104,0,0,3,86,0,4,0,9,0,0,0,1,0,0,0,1,0,5,0,9,0,0,0,1,0,0,0,178,0,6,0,9,0,0,0,1,0,0,0,187,0,7,0,9,0,0,0,1,0,0,0,1,0,8,0,10,0,0,0,3,0,0,3,190,0,12,0,10,0,0,0,2,0,0,3,214,0,13,0,9,0,0,0,1,0,0,0,28,0,14,0,9,0,0,0,1,0,0,0,0,0,16,0,9,0,0,0,1,0,0,0,1,0,20,0,9,0,0,0,1,0,0,0,10,0,23,0,9,0,0,0,1,0,208,32,0,0,25,0,9,0,0,0,1,0,0,0,2,0,26,0,2,0,0,0,6,0,0,3,230,0,31,0,9,0,0,0,1,0,0,0,0,0,33,0,10,0,0,0,1,0,0,3,236,0,35,0,9,0,0,0,2,0,0,3,244,0,37,0,9,0,0,0,1,0,0,1,138,0,38,0,9,0,0,0,1,0,0,0,3,0,39,0,10,0,0,0,1,0,0,3,252,0,40,0,9,0,0,0,1,0,0,0,1,0,0,0,0,98,112,108,105,115,116,48,48,79,17,2,0,52,3,94,3,120,3,58,3,35,3,20,3,4,3,245,2,235,2,219,2,216,2,208,2,178,2,197,1,65,1,196,0,47,3,54,3,97,3,104,3,57,3,41,3,34,3,22,3,6,3,103,2,193,1,37,1,148,0,69,0,41,0,24,0,50,3,52,3,66,3,59,3,38,3,39,2,161,1,244,0,175,0,42,0,22,0,17,0,68,0,55,0,13,0,13,0,43,3,45,3,52,3,56,3,9,3,72,2,177,1,170,0,75,0,64,0,38,0,152,0,194,0,195,0,34,0,12,0,194,2,204,2,210,2,222,2,178,2,120,2,214,2,101,2,190,1,166,2,19,2,54,1,119,0,80,0,26,0,13,0,19,2,26,2,255,1,35,1,117,0,3,1,1,1,212,0,210,0,12,1,131,0,77,1,134,0,108,0,29,0,11,0,74,1,77,1,78,1,241,0,180,0,151,0,106,0,82,0,72,0,50,0,33,0,34,0,67,0,66,0,68,0,13,0,54,1,31,1,255,0,121,0,93,0,84,0,57,0,44,0,47,0,34,0,30,0,53,0,80,0,65,0,62,0,42,0,119,0,119,0,130,0,124,0,114,0,117,0,97,0,84,0,63,0,41,0,30,0,27,0,68,0,34,0,37,0,15,0,127,0,126,0,106,0,91,0,83,0,121,0,127,0,97,0,94,0,95,0,76,0,71,0,63,0,66,0,46,0,43,0,111,0,105,0,106,0,104,0,97,0,86,0,91,0,104,0,96,0,83,0,85,0,68,0,69,0,77,0,51,0,42,0,121,0,123,0,117,0,102,0,94,0,86,0,77,0,68,0,76,0,74,0,77,0,73,0,76,0,95,0,103,0,96,0,127,0,124,0,107,0,91,0,91,0,72,0,81,0,86,0,78,0,72,0,74,0,73,0,66,0,73,0,67,0,55,0,130,0,128,0,120,0,104,0,99,0,104,0,108,0,107,0,100,0,90,0,87,0,104,0,96,0,77,0,68,0,57,0,131,0,130,0,123,0,121,0,121,0,121,0,111,0,140,0,146,0,115,0,95,0,82,0,90,0,82,0,82,0,68,0,132,0,134,0,127,0,124,0,122,0,120,0,108,0,86,0,111,0,134,0,131,0,102,0,84,0,96,0,90,0,68,0,0,8,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,12,98,112,108,105,115,116,48,48,212,1,2,3,4,5,6,7,8,85,102,108,97,103,115,85,118,97,108,117,101,89,116,105,109,101,115,99,97,108,101,85,101,112,111,99,104,16,1,19,0,2,54,86,22,73,88,211,18,59,154,202,0,16,0,8,17,23,29,39,45,47,56,61,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,63,255,255,191,19,0,0,65,137,0,0,10,75,0,4,241,173,255,255,200,145,0,1,208,181,0,0,49,207,0,0,1,0,0,0,6,167,0,0,0,64,113,57,48,48,110,0,0,0,0,0,0,0,0,1,0,0,1,165,16,0,0,98,0,4,254,253,0,0,27,137])
}
