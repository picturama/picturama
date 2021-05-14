import exifr from 'exifr'

import { MetaData, ExifData, allExifSegments } from 'common/CommonTypes'

import { fsStat } from 'background/util/FileUtil'


// exifr can improve performance, if options object is cached
// See: https://github.com/MikeKovarik/exifr#tips-for-better-performance
const metadataExifrOptions = {
    translateValues: false,
        // We need `translateValues: false`, because we want a numeric `Orientation`, not something like `'Horizontal (normal)'`
    exif: true,
    xmp: true,
}
const fullExifrOptions = {
    mergeOutput: false,
    tiff: true,
}
for (const segment of allExifSegments) {
    fullExifrOptions[segment] = true
}


export async function readMetadataOfImage(imagePath: string): Promise<MetaData> {
    let metaData: MetaData | null = null
    try {
        const exifTags = await exifr.parse(imagePath, metadataExifrOptions)
        if (exifTags) {
            metaData = extractMetaDataFromExif(exifTags)
        }
    } catch (error) {
        console.log(`Reading EXIF data from ${imagePath} failed - continuing without. Error: ${error.message}`)
    }

    if (!metaData) {
        const stat = await fsStat(imagePath)
        metaData = {
            createdAt: stat.birthtime,
            orientation: 1,
            tags: []
        }
    }

    return metaData
}


export function getExifData(imagePath: string): Promise<ExifData | null> {
    return exifr.parse(imagePath, fullExifrOptions)
}


const simplifiedBrandNames: { [K in string]: string } = {
    'CASIO COMPUTER CO.,LTD.': 'CASIO',
    'NIKON CORPORATION': 'Nikon',
    'OLYMPUS IMAGING CORP.': 'Olympus'
}

function extractMetaDataFromExif(exifTags: { [K: string]: any }): MetaData {
    // Examples:
    //   - Make = 'Canon', Model = 'Canon EOS 30D'  ->  'Canon EOS 30D'
    //   - Make = 'SONY', Model = 'DSC-N2'  ->  'SONY DSC-N2'
    //   - Make = 'NIKON CORPORATION', Model = 'NIKON D7200'  ->  'Nikon D7200'
    //   - Make = 'OLYMPUS IMAGING CORP.', Model = 'E-M10'  ->  'Olympus E-M10'
    //   - Make = 'CASIO COMPUTER CO.,LTD.', Model = 'EX-Z5      '  ->  'CASIO EX-Z5'
    let cameraBrand: string | null = exifTags.Make
    let cameraModel: string | null = exifTags.Model
    let camera = cameraModel
    if (cameraBrand && cameraModel) {
        cameraBrand = cameraBrand.trim()
        cameraBrand = simplifiedBrandNames[cameraBrand] || cameraBrand

        if (cameraModel.toLowerCase().indexOf(cameraBrand.toLowerCase()) === 0) {
            cameraModel = cameraModel.substring(cameraBrand.length)
        }
        cameraModel = cameraModel.trim()

        camera = `${cameraBrand} ${cameraModel}`
    }
    //console.log(`## Make = '${exifTags.Make}', Model = '${exifTags.Model}'  ->  '${camera}'`)

    let iso: number | undefined = undefined
    if (typeof exifTags.ISO === 'number') {
        iso = exifTags.ISO
    } else if (exifTags.ISO instanceof Uint16Array && exifTags.ISO.length > 0) {
        // Sometimes `exifTags.ISO` is something like `new Uint16Array([ 200, 0 ])`
        iso = exifTags.ISO[0]
    }

    const metaData: MetaData = {
        imgWidth:     exifTags.ImageWidth,
        imgHeight:    exifTags.ImageHeight,
        camera:       camera || undefined,
        exposureTime: exifTags.ExposureTime,
        iso,
        aperture:     exifTags.FNumber,
        focalLength:  exifTags.FocalLength,
        createdAt:    exifTags.DateTimeOriginal || exifTags.DateTime || exifTags.CreateDate || exifTags.ModifyDate,
        orientation:  exifTags.Orientation || 1,
            // Details on orientation: https://www.impulseadventure.com/photo/exif-orientation.html
        tags:         []
    }
    if (exifTags.ExifImageWidth && exifTags.ExifImageHeight) {
        // We don't trust the width and height writted to EXIF data, since some cameras switch width and height when
        // they do "Auto image rotation".
        // Example:
        //    See `submodules/test-data/photos/jpg/NIKON D90_portrait.jpg`: A portrait photo with EXIF orientation 1 (up),
        //    but switched `exifTags.ExifImageWidth` and `exifTags.ExifImageHeight`.
        //    It appears as if this happens if "Auto image rotation" is switched "off" in the camera.
        //    See: https://www.dpreview.com/forums/thread/3201488
        metaData.imgWidthAssumed = exifTags.ExifImageWidth
        metaData.imgHeightAssumed = exifTags.ExifImageHeight
    }

    return metaData
}
