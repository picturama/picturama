import fs from 'fs'
import readline from 'readline'
import { vec2 } from 'gl-matrix'
import yaml from 'js-yaml'

import { Photo, PhotoWork, ExifOrientation } from 'common/CommonTypes'
import { createProjectionMatrix } from 'common/util/CameraMetrics'
import { rotate } from 'common/util/EffectsUtil'
import { assertMainProcess } from 'common/util/ElectronUtil'
import { Rect } from 'common/util/GeometryTypes'
import { scaleRectToFitBorders, centerOfRect, Vec2Like, cornerPointOfRect, rectFromPoints } from 'common/util/GeometryUtil'
import { round } from 'common/util/LangUtil'
import { parsePath } from 'common/util/TextUtil'

import { fsExists, fsUnlink, fsWriteFile, fsReadFile, fsUnlinkIfExists } from 'background/util/FileUtil'


declare global {
    interface JSON {
        parse(text: Buffer, reviver?: (key: any, value: any) => any): any
    }
}


assertMainProcess()


/** The data as it is stored in picturama.yml */
interface DirectoryWorkData {
    photos: { [key:string]: PhotoWork }
}

/** The rules of a picasa.ini for one photo */
type PicasaRules = string[]

/** Data parsed from picasa.ini */
interface PicasaData {
    photos: { [key:string]: PicasaRules }
}

/** All work data we have about one directory */
interface DirectoryData {
    picturamaData: DirectoryWorkData,
    picasaData?: PicasaData
}


const refetchInterval = 30000
const storeDelay = 2000

const picturamaYmlHeader =
    '# This file contains the changes applied to photos in this directory using Picturama.\n' +
    '# See: https://picturama.github.io/\n\n'


class DirectoryWork {

    private data: DirectoryData | null = null
    private lastFetchTime: number = 0
    private runningFetch: Promise<DirectoryData> | null = null
    private isStoreRunning: boolean = false
    private needsStoreFollowup: boolean = false


    constructor(public directoryPath: string) {
    }


    public isIdle(): boolean {
        return !this.runningFetch && !this.isStoreRunning && !this.needsStoreFollowup
    }


    private async fetchData(): Promise<DirectoryData> {
        if (this.data && (this.isStoreRunning || this.needsStoreFollowup || Date.now() < this.lastFetchTime + refetchInterval)) {
            return this.data
        } else if (this.runningFetch) {
            return this.runningFetch
        } else {
            this.runningFetch = Promise.all(
                [
                    fetchPicturamaYml(this.directoryPath),
                    fetchPicasaIni(this.directoryPath)
                ])
                .then((results: [ DirectoryWorkData, PicasaData | null ]) => {
                    const [ picturamaData, picasaData ] = results
                    return { picturamaData, picasaData: picasaData || undefined }
                })

            this.runningFetch.then(
                data => {
                    this.data = data
                    this.lastFetchTime = Date.now()
                    this.runningFetch = null
                },
                error => {
                    this.runningFetch = null
                })

            return this.runningFetch
        }
    }

    public async fetchPhotoWork(photoBasename: string, masterWidth: number, masterHeight: number): Promise<PhotoWork> {
        const data = await this.fetchData()

        let photoWork = data.picturamaData.photos[photoBasename]

        if (!photoWork && data.picasaData) {
            const picasaRules = data.picasaData.photos[photoBasename]
            if (picasaRules) {
                photoWork = createPhotoWorkFromPicasaRules(picasaRules, this.directoryPath, photoBasename, masterWidth, masterHeight)
            }
        }

        return photoWork || {}
    }

    public async storePhotoWork(photoBasename: string, photoWork: PhotoWork) {
        const data = await this.fetchData()
        const picturamaData = data.picturamaData

        const isEmpty = Object.keys(photoWork).length === 0
        if (isEmpty) {
            delete picturamaData.photos[photoBasename]
        } else {
            picturamaData.photos[photoBasename] = photoWork
        }

        this.onDataChanged()
    }

    private onDataChanged() {
        if (this.isStoreRunning) {
            this.needsStoreFollowup = true
            return
        }

        this.isStoreRunning = true
        const storePromise =
            (async () => {
                await new Promise(resolve => setTimeout(resolve, storeDelay))
                this.needsStoreFollowup = false
                const picturamaData = this.data && this.data.picturamaData

                const picturamaYmlFile = this.directoryPath + '/picturama.yml'
                const isEmpty = !picturamaData || Object.keys(picturamaData.photos).length === 0
                if (isEmpty) {
                    if (await fsExists(picturamaYmlFile)) {
                        await fsUnlink(picturamaYmlFile)
                        console.log('Removed empty ' + picturamaYmlFile)
                    }
                } else {
                    // Why `sortKeys: true`?
                    // We store the photos in canonical order (with sorted keys) so a `picturama.yml` file produces less conflicts when version controlled.
                    const ymlString = picturamaYmlHeader + yaml.safeDump(picturamaData, { sortKeys: true, flowLevel: 3 })
                    await fsWriteFile(picturamaYmlFile, ymlString, 'utf8')
                    console.log('Stored ' + picturamaYmlFile)
                }

                await fsUnlinkIfExists(this.directoryPath + '/ansel.json')
            })()
            .then(() => {
                this.isStoreRunning = false
                if (this.needsStoreFollowup) {
                    this.onDataChanged()
                }
            },
            error => {
                this.isStoreRunning = false
                console.error('Storing directory work failed: ' + this.directoryPath, error)
            })
    }

}


async function fetchPicturamaYml(directoryPath: string): Promise<DirectoryWorkData> {
    const picturamaYmlFile = directoryPath + '/picturama.yml'
    const anselJsonFile = directoryPath + '/ansel.json'
    let result: DirectoryWorkData
    if (await fsExists(picturamaYmlFile)) {
        const ymlString = await fsReadFile(picturamaYmlFile, 'utf8')
        result = yaml.safeLoad(ymlString) as DirectoryWorkData
        console.log('Fetched ' + picturamaYmlFile)
    } else if (await fsExists(anselJsonFile)) {
        // Legacy support: `ansel.json` was used by version 1.0.0 and before (where Picturama's name was Ansel)
        const buffer = await fsReadFile(anselJsonFile)
        result = JSON.parse(buffer)
        console.log('Fetched ' + anselJsonFile)
    } else {
        result = { photos: {} }
    }
    return result
}


const sectionStartRegExp = /^\[(.*)\]$/

async function fetchPicasaIni(directoryPath: string): Promise<PicasaData | null> {
    let picasaFile = directoryPath + '/.picasa.ini'
    if (! await fsExists(picasaFile)) {
        picasaFile = directoryPath + '/Picasa.ini'
        if (! await fsExists(picasaFile)) {
            return null
        }
    }

    let editedPicasaData: PicasaData | null = null
        // The picasa data of the edited images of which this directory holds the originals
    const directoryParts = parsePath(directoryPath)
    if (directoryParts.base === '.picasaoriginals' || directoryParts.base === 'Originals') {
        // This is a Picasa originals directory
        // -> Fetch the `.picasa.ini` of the parent directory (which holds the edited versions of the originals in this directory)
        editedPicasaData = await fetchPicasaIni(directoryParts.dir)
    }

    return await new Promise<PicasaData>(
        (resolve, reject) => {
            const picasaData: PicasaData = { photos: {} }

            const lineReader = readline.createInterface({
                input: fs.createReadStream(picasaFile)
            })

            let currentSectionKey: string | null = null
            let currentSectionRules: string[] = []

            function flushCurrentSection() {
                if (currentSectionKey) {
                    const editedSectionRules = editedPicasaData && editedPicasaData.photos[currentSectionKey]
                    if (editedSectionRules) {
                        currentSectionRules.push(...editedSectionRules)
                    }

                    picasaData.photos[currentSectionKey] = currentSectionRules
                    currentSectionKey = null
                    currentSectionRules = []
                }
            }

            lineReader.on('line', line => {
                try {
                    const match = sectionStartRegExp.exec(line)
                    if (match) {
                        flushCurrentSection()
                        currentSectionKey = match[1]
                    } else {
                        currentSectionRules.push(line)
                    }
                } catch (error) {
                    reject(error)
                }
            })
            lineReader.on('close', () => {
                try {
                    flushCurrentSection()
                    console.log('Fetched ' + picasaFile)
                    resolve(picasaData)
                } catch (error) {
                    reject(error)
                }
            })
        })
}


const rotateRuleRegExp = /^rotate=rotate\((\d+)\)$/
const filtersRuleRegExp = /^filters=(.*)$/
const cropRuleRegExp = /^crop=rect64\(([0-9a-f]+)\)$/
const ignoredRulesRegExp = /^([ \t]*$|backuphash=|width=|height=|moddate=|textactive=0|redo=)/

const tiltFilterRegExp = /^tilt=1,([-0-9.]+),0.0*$/
const cropFilterRegExp = /^crop64=1,([0-9a-f]+)$/

function createPhotoWorkFromPicasaRules(picasaRules: PicasaRules, directoryPath: string, photoBasename: string,
    masterWidth: number, masterHeight: number): PhotoWork
{
    // For information about picasa.ini see:
    //   - https://gist.github.com/fbuchinger/1073823

    const photoWork: PhotoWork = {}

    let importProblems: string[] = []

    let match: RegExpMatchArray | null = null
    let picasaCropRect: string | null = null
    for (const rule of picasaRules) {
        if (match = rotateRuleRegExp.exec(rule)) {
            rotate(photoWork, parseInt(match[1]), false)
        } else if (rule == 'star=yes') {
            photoWork.flagged = true
        } else if (match = filtersRuleRegExp.exec(rule)) {
            const filterSplits = match[1].split(';')
            for (const filter of filterSplits) {
                if (match = tiltFilterRegExp.exec(filter)) {
                    const picasaTilt = parseFloat(match[1])
                    photoWork.tilt = (photoWork.tilt || 0) + picasaTilt * -11.3848
                        // For formula see: doc/picasa-ini-format.md
                } else if (match = cropFilterRegExp.exec(filter)) {
                    if (!picasaCropRect) {
                        picasaCropRect = match[1]
                    } else if (picasaCropRect !== match[1]) {
                        importProblems.push(`Duplicate crop rects: ${picasaCropRect} and ${match[1]}`)
                    }
                } else if (filter.length) {
                    importProblems.push('Unknown filter: ' + filter)
                }
            }
        } else if (match = cropRuleRegExp.exec(rule)) {
            if (!picasaCropRect) {
                picasaCropRect = match[1]
            } else if (picasaCropRect !== match[1]) {
                importProblems.push(`Duplicate crop rects: ${picasaCropRect} and ${match[1]}`)
            }
        } else if (! ignoredRulesRegExp.test(rule)) {
            // Unknown rule
            importProblems.push('Unknown rule: ' + rule)
        }
    }

    if (picasaCropRect || photoWork.tilt) {
        // Picasa works in the opposite order like we do: Picasa first crops the original image, then in tilts it and
        // shrinks it to fit into the borders of the cropped image while keeping the aspect ratio.
        // For details see: doc/picasa-ini-format.md

        if (photoWork.tilt) {
            photoWork.tilt = round(photoWork.tilt, 1)
        }

        let picasaCanvasRect: Rect | null = null
        if (picasaCropRect) {
            if (picasaCropRect.length > 16) {
                importProblems.push('Invalid crop rect (length > 16): ' + picasaCropRect)
            } else {
                while (picasaCropRect.length < 16) {
                    picasaCropRect = '0' + picasaCropRect
                }
                picasaCanvasRect = rectFromPoints(
                    [
                        parseInt(picasaCropRect.substring(0, 4), 16) / 0xffff * masterWidth,
                        parseInt(picasaCropRect.substring(4, 8), 16) / 0xffff * masterHeight
                    ], [
                        parseInt(picasaCropRect.substring(8, 12), 16) / 0xffff * masterWidth,
                        parseInt(picasaCropRect.substring(12, 16), 16) / 0xffff * masterHeight
                    ])
            }
        }
        if (!picasaCanvasRect) {
            picasaCanvasRect = {
                x:      0,
                y:      0,
                width:  masterWidth,
                height: masterHeight
            }
        }

        const projectionMatrix = createProjectionMatrix({ width: masterWidth, height: masterHeight }, photoWork)
        const borderPolygon: Vec2Like[] = [
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'nw'), projectionMatrix),
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'ne'), projectionMatrix),
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'se'), projectionMatrix),
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'sw'), projectionMatrix)
        ]
        const projectedCropRectCenter = vec2.transformMat4(vec2.create(), centerOfRect(picasaCanvasRect), projectionMatrix)
        const projectedCropRectSize = (photoWork.rotationTurns === 1 || photoWork.rotationTurns === 3) ?
            { width: picasaCanvasRect.height, height: picasaCanvasRect.width } :
            picasaCanvasRect
        photoWork.cropRect = scaleRectToFitBorders(projectedCropRectCenter, projectedCropRectSize, borderPolygon)
    }

    if (importProblems.length) {
        let msg = `Picasa import is incomplete for ${directoryPath}/${photoBasename}:`
        for (const problem of importProblems) {
            msg += '\n  - ' + problem
        }
        console.warn(msg)
    }

    return photoWork
}


const directoryWorkByPath: { [key:string]: DirectoryWork } = {}
let directoryWorkCacheSize = 0
const maxDirectoryWorkCacheSize = 100

function getDirectoryWork(directoryPath: string): DirectoryWork {
    let directoryWork = directoryWorkByPath[directoryPath]
    if (!directoryWork) {
        if (directoryWorkCacheSize >= maxDirectoryWorkCacheSize) {
            for (const path of Object.keys(directoryWorkByPath)) {
                const cachedDirectoryWork = directoryWorkByPath[path]
                if (cachedDirectoryWork.isIdle()) {
                    delete directoryWorkByPath[path]
                    directoryWorkCacheSize--
                }
            }
        }

        directoryWork = new DirectoryWork(directoryPath)
        directoryWorkByPath[directoryPath] = directoryWork
        directoryWorkCacheSize++
    }
    return directoryWork
}


export async function fetchPhotoWorkOfPhoto(photo: Photo): Promise<PhotoWork> {
    return fetchPhotoWork(photo.master_dir, photo.master_filename, photo.master_width, photo.master_height)
}

export async function fetchPhotoWork(photoDir: string, photoFileName: string, masterWidth: number, masterHeight: number):
    Promise<PhotoWork>
{
    return getDirectoryWork(photoDir)
        .fetchPhotoWork(photoFileName, masterWidth, masterHeight)
}


export async function storePhotoWork(photoDir: string, photoFileName: string, photoWork: PhotoWork): Promise<void> {
    return getDirectoryWork(photoDir)
        .storePhotoWork(photoFileName, photoWork)
}


export async function removePhotoWork(photoDir: string, photoFileName: string): Promise<void> {
    await storePhotoWork(photoDir, photoFileName, {})
}
