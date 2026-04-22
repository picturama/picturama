import fs from 'fs'
import util from 'util'

import { PhotoId, Photo, ImportProgress } from 'common/CommonTypes'

import ImportScanner, { ImportScannerDelegate, PhotoOfDirectoryInfo, ImportScannerState } from 'background/ImportScanner'

const copyFile = util.promisify(fs.copyFile)
const exists = util.promisify(fs.exists)
const mkdir = util.promisify(fs.mkdir)
const writeFile = util.promisify(fs.writeFile)


const testPhotosDir = 'submodules/test-data/photos'
const testExifPhotosDir = 'submodules/test-data-exif-orientation'
const testBaseDir = 'dist-test'


testImportScanner('simple import',
    async testDir => {
        await copyFile(`${testPhotosDir}/IMG_9700.JPG`, `${testDir}/IMG_9700.JPG`)
        await copyFile(`${testPhotosDir}/800/door-knocker.jpg`, `${testDir}/door-knocker.jpg`)
    },
    async ({ testDir, storedPhotos, finalProgress }) => {
        expect(finalProgress).toEqual({
            phase: 'importPhotos',
            isPaused: false,
            total: 2,
            processed: 2,
            added: 2,
            removed: 0,
            currentPath: testDir
        })

        expectPhotos(storedPhotos, [
            {
                // Has a "normal" ISO value in EXIF data
                masterDir: testDir,
                masterFilename: 'IMG_9700.JPG',
                masterWidth: 5184,
                masterHeight: 3456,
                masterIsRaw: 0,
                editedWidth: 5184,
                editedHeight: 3456,
                flag: 0,
                trashed: 0
            },
            {
                // Has a ISO value of `[ 200, 0 ]` in EXIF data
                masterDir: testDir,
                masterFilename: 'door-knocker.jpg',
                masterWidth: 800,
                masterHeight: 533,
                masterIsRaw: 0,
                editedWidth: 800,
                editedHeight: 533,
                flag: 0,
            }
        ])
    })


testImportScanner('import png',
    async testDir => {
        await copyFile('src/package/icon.png', `${testDir}/icon.png`)
    },
    async ({ testDir, storedPhotos }) => {
        expectPhotos(storedPhotos, [
            {
                masterDir: testDir,
                masterFilename: 'icon.png',
                masterWidth: 256,
                masterHeight: 256,
                masterIsRaw: 0,
                editedWidth: 256,
                editedHeight: 256,
                flag: 0
            }
        ])
    })


testImportScanner('import jpg',
    async testDir => {
        await Promise.all([
            copyFile(`${testPhotosDir}/jpg/Apple_iPhone_XR_landscape.jpg`, `${testDir}/Apple_iPhone_XR_landscape.jpg`),
            copyFile(`${testPhotosDir}/jpg/Apple_iPhone_XR_portrait.jpg`,  `${testDir}/Apple_iPhone_XR_portrait.jpg`),
            copyFile(`${testPhotosDir}/jpg/NIKON_D90_landscape.jpg`,  `${testDir}/NIKON_D90_landscape.jpg`),
            copyFile(`${testPhotosDir}/jpg/NIKON_D90_portrait.jpg`,  `${testDir}/NIKON_D90_portrait.jpg`),
            copyFile(`${testPhotosDir}/jpg/Panasonic_DMC-G6_landscape.jpg`,  `${testDir}/Panasonic_DMC-G6_landscape.jpg`),
            copyFile(`${testPhotosDir}/jpg/Panasonic_DMC-G6_portrait.jpg`,  `${testDir}/Panasonic_DMC-G6_portrait.jpg`),
        ])
    },
    async ({ testDir, storedPhotos }) => {
        expectPhotos(storedPhotos, [
            {
                masterDir: 'dist-test/import_jpg',
                masterFilename: 'Apple_iPhone_XR_landscape.jpg',
                masterWidth: 3824,
                masterHeight: 2866,
                masterIsRaw: 0,
                editedWidth: 3824,
                editedHeight: 2866,
                dateSection: '2019-09-12',
                createdAt: 1568305337000,
                flag: 0,
                trashed: 0
            },
            {
                masterDir: 'dist-test/import_jpg',
                masterFilename: 'Apple_iPhone_XR_portrait.jpg',
                masterWidth: 480,
                masterHeight: 640,
                masterIsRaw: 0,
                editedWidth: 480,
                editedHeight: 640,
                dateSection: '2019-07-29',
                createdAt: 1564394038000,
                flag: 0,
                trashed: 0
            },
            {
                masterDir: 'dist-test/import_jpg',
                masterFilename: 'NIKON_D90_landscape.jpg',
                masterWidth: 4288,
                masterHeight: 2848,
                masterIsRaw: 0,
                editedWidth: 4288,
                editedHeight: 2848,
                dateSection: '2014-06-08',
                createdAt: 1402226372000,
                flag: 0,
                trashed: 0
            },
            {
                masterDir: 'dist-test/import_jpg',
                masterFilename: 'NIKON_D90_portrait.jpg',
                masterWidth: 2848,
                masterHeight: 4288,
                masterIsRaw: 0,
                editedWidth: 2848,
                editedHeight: 4288,
                dateSection: '2014-06-08',
                createdAt: 1402230977000,
                flag: 0,
                trashed: 0
            },
            {
                masterDir: 'dist-test/import_jpg',
                masterFilename: 'Panasonic_DMC-G6_landscape.jpg',
                masterWidth: 4608,
                masterHeight: 3456,
                masterIsRaw: 0,
                editedWidth: 4608,
                editedHeight: 3456,
                dateSection: '2014-06-08',
                createdAt: 1402229206000,
                flag: 0,
                trashed: 0
            },
            {
                masterDir: 'dist-test/import_jpg',
                masterFilename: 'Panasonic_DMC-G6_portrait.jpg',
                masterWidth: 3456,
                masterHeight: 4608,
                masterIsRaw: 0,
                editedWidth: 3456,
                editedHeight: 4608,
                dateSection: '2014-06-08',
                createdAt: 1402228725000,
                flag: 0,
                trashed: 0
            }
        ])
    })


testImportScanner('import heic',
    async testDir => {
        await copyFile(`${testPhotosDir}/heic/Apple_iPhone_XR_portrait.HEIC`, `${testDir}/Apple_iPhone_XR_portrait.HEIC`)
    },
    async ({ testDir, storedPhotos }) => {
        expectPhotos(storedPhotos, [
            {
                masterDir: 'dist-test/import_heic',
                masterFilename: 'Apple_iPhone_XR_portrait.HEIC',
                masterWidth: 3024,
                masterHeight: 4032,
                masterIsRaw: 0,
                editedWidth: 3024,
                editedHeight: 4032,
                dateSection: '2019-07-31',
                createdAt: 1564576474000,
                flag: 0,
                trashed: 0
            }
        ])
    })



testImportScanner('import exif orientation',
    async testDir => {
        const copyPromises: Promise<any>[] = []
        for (let exifOrientation = 8; exifOrientation <= 8; exifOrientation++) {
            copyPromises.push(
                copyFile(`${testExifPhotosDir}/Landscape_${exifOrientation}.jpg`, `${testDir}/Landscape_${exifOrientation}.jpg`),
                copyFile(`${testExifPhotosDir}/Portrait_${exifOrientation}.jpg`, `${testDir}/Portrait_${exifOrientation}.jpg`),
            )
        }
        await Promise.all(copyPromises)
    },
    async ({ testDir, storedPhotos }) => {
        const expectedPhotos: ExpectedPhoto[] = []
        for (let exifOrientation = 8; exifOrientation <= 8; exifOrientation++) {
            const switchSides = exifOrientation >= 5
            function createExpectedPhoto(master_filename: string, master_width: number, master_height: number): ExpectedPhoto {
                return {
                    masterDir: 'dist-test/import_exif_orientation',
                    masterFilename: master_filename,
                    masterWidth: master_width,
                    masterHeight: master_height,
                    masterIsRaw: 0,
                    editedWidth: master_width,
                    editedHeight: master_height,
                    flag: 0,
                    trashed: 0
                }
            }

            expectedPhotos.push(
                createExpectedPhoto(`Landscape_${exifOrientation}.jpg`, 1800, 1200),
                createExpectedPhoto(`Portrait_${exifOrientation}.jpg`, 1200, 1800)
            )
        }

        expectPhotos(storedPhotos, expectedPhotos)
    })



testImportScanner('import Picasa crop and tilt',
    async testDir => {
        await Promise.all([
            copyFile(`${testPhotosDir}/800/ice-cubes.jpg`, `${testDir}/ice-cubes.jpg`),
            writeFile(`${testDir}/.picasa.ini`,
                '[ice-cubes.jpg]\n' +
                'rotate=rotate(1)\n' +
                'backuphash=3812\n' +
                'filters=tilt=1,0.367535,0.000000;crop64=1,fde5dcc44cdb5cc;\n' +
                'crop=rect64(fde5dcc44cdb5cc)\n'),
        ])
    },
    async ({ testDir, storedPhotos }) => {
        expectPhotos(storedPhotos, [
            {
                masterDir: testDir,
                masterFilename: 'ice-cubes.jpg',
                masterWidth: 800,
                masterHeight: 533,
                masterIsRaw: 0,
                editedWidth: 170,
                editedHeight: 153,
                dateSection: '2018-06-28',
                createdAt: 1530207426000,
                flag: 0,
                trashed: 0
            }
        ])
    })


testImportScanner('import Picasa originals #1',
    async testDir => {
        // This is what happens if you select "Save" on an image in Picasa:
        // - Picasa moves the original image to a subdirectory called `.picasaoriginals` or `Originals`
        // - Picasa saves the changes to the `.picasa.ini` of the subdirectory
        // - Picasa saves the altered image to the main directory
        // - Picasa saves a `backuphash` to the `.picasa.ini` of the main directory

        await mkdir(`${testDir}/.picasaoriginals`)
        await Promise.all([
            copyFile(`${testPhotosDir}/800/ice-cubes.jpg`, `${testDir}/.picasaoriginals/ice-cubes.jpg`),
            writeFile(`${testDir}/.picasaoriginals/.picasa.ini`,
                '[ice-cubes.jpg]\n' +
                'filters=crop64=1,b3d66180e8f5bad5;finetune2=1,0.000000,0.000000,0.480000,00000000,0.000000;\n' +
                'crop=rect64(b3d66180e8f5bad5)\n' +
                'moddate=0000d4ff92d906a7\n' +
                'width=800\n' +
                'height=533\n' +
                'textactive=0\n'),
            copyFile(`${testPhotosDir}/800/ice-cubes.jpg`, `${testDir}/ice-cubes.jpg`),
            writeFile(`${testDir}/.picasa.ini`,
                '[ice-cubes.jpg]\n' +
                'backuphash=15177\n'),
        ])
    },
    async ({ testDir, storedPhotos }) => {
        expectPhotos(storedPhotos, [
            {
                masterDir: `${testDir}/.picasaoriginals`,
                masterFilename: 'ice-cubes.jpg',
                masterWidth: 800,
                masterHeight: 533,
                masterIsRaw: 0,
                editedWidth: 166,
                editedHeight: 186,
                dateSection: '2018-06-28',
                createdAt: 1530207426000,
                flag: 0,
                trashed: 0
            }
        ])
    })


testImportScanner('import Picasa originals #2',
    async testDir => {
        // This test simulates the following actions in Picasa:
        // - Add star
        // - Tilt image at maximum to the right
        // - Save image
        //   The saved image has the same size as the original, but its content is tilted and zoomed
        //   (in order to keep the tilted edges inside the original image).
        // - Crop image
        // - Add tags "Ice" and "Cube" (which are only stored to the DB, not to `.picasa.ini`)

        await mkdir(`${testDir}/.picasaoriginals`)
        await Promise.all([
            copyFile(`${testPhotosDir}/800/ice-cubes.jpg`, `${testDir}/.picasaoriginals/ice-cubes.jpg`),
            writeFile(`${testDir}/.picasaoriginals/.picasa.ini`,
                '[ice-cubes.jpg]\r\n' +
                'filters=tilt=1,1.000000,0.000000;\r\n' +
                'moddate=0000dd9893d9c304\r\n' +
                'width=800\r\n' +
                'height=533\r\n' +
                'textactive=0\r\n'),
            copyFile(`${testPhotosDir}/800/ice-cubes.jpg`, `${testDir}/ice-cubes.jpg`),
            writeFile(`${testDir}/.picasa.ini`,
                '[ice-cubes.jpg]\r\n' +
                'backuphash=56337\r\n' +
                'moddate=00001f098cd9c29f\r\n' +
                'star=yes\r\n' +
                'crop=rect64(6dc24aedceb8c9b9)\r\n' +
                'filters=crop64=1,6dc24aedceb8c9b9;\r\n'),
        ])
    },
    async ({ testDir, storedPhotos }) => {
        expectPhotos(storedPhotos, [
            {
                masterDir: `${testDir}/.picasaoriginals`,
                masterFilename: 'ice-cubes.jpg',
                masterWidth: 800,
                masterHeight: 533,
                masterIsRaw: 0,
                editedWidth: 251,
                editedHeight: 219,
                dateSection: '2018-06-28',
                createdAt: 1530207426000,
                flag: 1   // Important! This comes from the parent directory
            }
        ])
    })


// Test importing a broken (0 byte) jpg
testImportScanner('broken image',
    async testDir => {
        writeFile(`${testDir}/broken.jpg`, '')
    },
    async ({ testDir, storedPhotos, finalProgress }) => {
        expectPhotos(storedPhotos, [])
        expect(finalProgress).toEqual({
            phase: 'importPhotos',
            isPaused: false,
            total: 1,
            processed: 1,
            added: 0,
            removed: 0,
            currentPath: testDir
        })
    })


function testImportScanner(testName: string, prepareTestDir: (testDir: string) => Promise<void>,
    checkResult: (result: { testDir: string, storedPhotos: Photo[], finalProgress: ImportProgress }) => Promise<void>)
{
    test(testName, async () => {
        const testDir = `${testBaseDir}/${testName.replace(/ /g, '_')}`
        const testDirExists = await exists(testDir)
        if (!testDirExists) {
            const distTestExists = await exists(testBaseDir)
            if (!distTestExists) {
                await mkdir(testBaseDir)
            }
            await mkdir(testDir)
            await prepareTestDir(testDir)
        }

        const testImportScannerDelegate = new TestImportScannerDelegate()
        const importScanner = new ImportScanner(testImportScannerDelegate)
        const finalProgress = await importScanner.scanPhotos([ testDir ])
        if (!finalProgress) {
            throw new Error('Expected final progress')
        }

        const { storedPhotos } = testImportScannerDelegate
        await checkResult({ testDir, storedPhotos, finalProgress })
    })
}


type ExpectedPhoto = Partial<Photo> & { master_filename: string }
function expectPhotos(actualPhotos: Photo[], expectedPhotos: ExpectedPhoto[]) {
    function comparePhotos(photo1: { master_filename: string }, photo2: { master_filename: string }) {
        return photo1.master_filename.localeCompare(photo2.master_filename)
    }

    actualPhotos.sort(comparePhotos)
    expectedPhotos.sort(comparePhotos)

    expect(actualPhotos).toMatchObject(expectedPhotos)
}


class TestImportScannerDelegate implements ImportScannerDelegate {

    storedPhotos: Photo[] = []

    async deletePhotosOfRemovedDirsFromDb(existingDirs: string[]): Promise<number> {
        return 0
    }

    async deletePhotosFromDb(photoIds: PhotoId[]): Promise<void> {
    }

    async fetchPhotosOfDirectoryFromDb(dir: string): Promise<PhotoOfDirectoryInfo[]> {
        return []
    }

    nextTempRawConversionPaths(): { tempExtractThumbPath: string, tempNonRawImgPath: string } {
        throw new Error('Expected no raw conversion')
    }

    async storePhotoInDb(masterFullPath: string, photo: Photo, tempNonRawImgPath: string | null, tags: string[]): Promise<void> {
        this.storedPhotos.push(photo)
    }

    async updateProgressInUi(state: ImportScannerState, progress: ImportProgress): Promise<void> {
    }

    showError(msg: string, error?: Error): void {
        throw new Error('Unexpected error: ' + msg + ' - ' + error)
    }
}
