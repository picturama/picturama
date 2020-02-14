import ExifParser from 'exif-parser'

import { ExifOrientation } from 'common/CommonTypes'
import { isArray } from 'common/util/LangUtil'
import fs from 'fs'
import { fsStat } from 'background/util/FileUtil'

export interface MetaData {
    imgWidth?:     number
    imgHeight?:    number
    camera?:       string
    exposureTime?: number
    iso?:          number
    aperture?:     number
    focalLength?:  number
    createdAt?:    Date
    /** Details on orientation: https://www.impulseadventure.com/photo/exif-orientation.html */
    orientation:   ExifOrientation
    tags:          string[]
}


export function readMetadataOfImage(imagePath: string): Promise<MetaData> {
    return readExifOfImage(imagePath)
        .then(extractMetaDataFromExif)
        .catch(error => {
            if (error.message !== 'Invalid JPEG section offset') {
                console.log(`Reading EXIF data from ${imagePath} failed - continuing without. Error: ${error.message}`)
            }
            return fsStat(imagePath)
                .then(stat => ({
                    createdAt: stat.birthtime,
                    orientation: 1,
                    tags: []
                }))
        })
}


function readExifOfImage(imagePath) {
    let chunks: Buffer[] = [];
    let totalBytes = 0;
    let done = false;
    let readStream = fs.createReadStream(imagePath);
    return new Promise((resolve, reject) => {
      const processor = () => {
        try {
            const buffer = Buffer.concat(chunks);
            const parser = ExifParser.create(buffer) as any
            done = true;
            readStream.destroy();
            const result = parser.parse();
            resolve(result);
        } catch (e) {
            reject(e);
        }
      }
      readStream
        .on('data', function (chunk: Buffer) {
          if (done) {
              return;
          }
          totalBytes += chunk.byteLength;
          chunks.push(chunk);

          // EXIF data should be in the first 100Kb of a JPEG file.
          if (totalBytes > 100000) {
              processor();
          }
      }).on('end', () => {
          if (!done) {
              processor();
          }
      })
    }).catch((err) => {
        console.error("EXIF parsing error for file ", imagePath, err);
    })
}


const simplifiedBrandNames: { [K in string]: string } = {
    'CASIO COMPUTER CO.,LTD.': 'CASIO',
    'NIKON CORPORATION': 'Nikon',
    'OLYMPUS IMAGING CORP.': 'Olympus'
}

function extractMetaDataFromExif(exifData): MetaData {
    const exifTags = exifData.tags
    const rawDate = exifTags.DateTimeOriginal || exifTags.DateTime || exifTags.CreateDate || exifTags.ModifyDate

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
    } else if (isArray(exifTags.ISO) && typeof exifTags.ISO[0] === 'number') {
        // Sometimes `exifTags.ISO` is something like `[ 200, 0 ]`
        iso = exifTags.ISO[0]
    }

    const metaData: MetaData = {
        imgWidth:     (exifData.imageSize && exifData.imageSize.width)  || exifTags.ExifImageWidth,
        imgHeight:    (exifData.imageSize && exifData.imageSize.height) || exifTags.ExifImageHeight,
        camera:       camera || undefined,
        exposureTime: exifTags.ExposureTime,
        iso,
        aperture:     exifTags.FNumber,
        focalLength:  exifTags.FocalLength,
        createdAt:    rawDate ? new Date(rawDate * 1000) : undefined,
        orientation:  exifTags.Orientation || 1,
            // Details on orientation: https://www.impulseadventure.com/photo/exif-orientation.html
        tags:         []
    }

    // TODO: Translate from `exiv2` result into `exif-parser` result
    //if (exData.hasOwnProperty('Xmp.dc.subject'))
    //  metaData.tags = exData['Xmp.dc.subject'].split(', ');

    return metaData
}
