// Mirrors src-tauri/src/common_types.rs

import { Rect } from 'common/util/GeometryTypes'


// ----- Database types -----


declare const __photoId: unique symbol
export type PhotoId = number & { [__photoId]: '' }
export interface Photo {
    id: PhotoId,
    /** The directory of the original image. Example: '/User/me/Pictures' */
    masterDir: string,
    /** The filename (without directory) of the original image. Example: 'IMG_9700.JPG' */
    masterFilename: string,
    /** The width of the original image - only with EXIF rotation applied (in px). */
    masterWidth: number
    /** The height of the original image - only with EXIF rotation applied (in px). */
    masterHeight: number
    /** Whether the master image has a raw format */
    masterIsRaw: boolean,
    /** The width of the original image - after EXIF rotation and all PhotoWork have been applied (in px). */
    editedWidth: number | null
    /** The height of the original image - after EXIF rotation and all PhotoWork have been applied (in px). */
    editedHeight: number | null
    /** Example: '2016-09-18' */
    dateSection: string,
    /** The timestamp when the photo was created */
    createdAt: number,
    /** The timestamp when the photo was modified */
    updatedAt: number,
    /** The timestamp when the photo was imported */
    importedAt: number,
    /** Whether the image is flagged (= marked as favorite). */
    flag: boolean,
    /** Whether the image is in the trash (Picturama trash - not the file system's trash). */
    trashed: boolean,
}
export type PhotoById = { [K in PhotoId]: Photo }


declare const __tagId: unique symbol
export type TagId = number & { [__tagId]: '' }
export interface Tag {
    id: TagId
    title: string
    slug: string
    created_at: number
    updated_at: number | null
}
export type TagById = { [K in TagId]: Tag }


//declare const __versionId: unique symbol
//export type VersionId = number & { [__versionId]: '' }
//export interface Version {
//    id: VersionId
//    type: string | null,
//    master: string | null,
//    output: string | null,
//    thumbnail: string | null,
//    version: number | null,
//    photo_id: number | null,
//}


// ----- Other types (not database) -----


/** A string with binary data */
export type BinaryString = string


/** An EXIF orientation. See: https://www.impulseadventure.com/photo/exif-orientation.html */
export enum ExifOrientation { Up = 1, Bottom = 3, Right = 6, Left = 8 }


export interface IpcErrorInfo {
    message: string
    errorCode?: string
}


export interface Settings {
    photoDirs: string[]
    exportOptions?: PhotoExportOptions
    legacy?: {
        versionsDir?: string
    }
}


export interface UiConfig {
    version: string
    platform: 'linux' | 'macos' | 'windows'
    windowStyle: WindowStyle
    hasNativeMenu: boolean
    rawLocale: string
    nonRawPath: string
    thumbnailPath: string
}

/**
 * The style of the main window:
 *   - 'nativeTrafficLight': Window uses native MacOS traffic light buttons (top left corner)
 *   - 'windowsButtons': Window shows HTML buttons in Windows 10 look (top right corner)
 */
export type WindowStyle = 'nativeTrafficLight' | 'windowsButtons'

export type ImportPhase = 'scanDirs' | 'cleanup' | 'importPhotos' | 'error'

export type ImportProgress = {
    phase: ImportPhase
    isPaused: boolean
    /** Total number of photos found in file system */
    total: number
    /** Number of processed photos (photos which exist in file system and have been checked) */
    processed: number
    /** Number of photos added to the DB */
    added: number
    /** Number of photos removed from DB */
    removed: number
    /** The path of the directory which is currently scanned or processed */
    currentPath: string | null
}

export interface PhotoDetail {
    //versions: Version[],
    /** The tags attached to this photo. This may also contain new tags which don't exist in DB yet. */
    tags: string[]
}

export interface PhotoWork {
    rotationTurns?: 1 | 2 | 3
    /** The number of degrees the photo is tilted (= rotated around the z axis) */
    tilt?: number
    /**
     * The rectangle where the photo should be cropped.
     * In projected coordinates (see `doc/geometry-concept.md`).
     */
    cropRect?: Rect
    flagged?: true
    tags?: string[]
}

declare const __photoSectionId: unique symbol
export type PhotoSectionId = string & { [__photoSectionId]: '' }
export interface PhotoSection {
    id: PhotoSectionId
    title: string
    count: number
}
export interface PhotoSet {
    photoIds: PhotoId[]
    photoData: PhotoById
}
export interface LoadedPhotoSection extends PhotoSection, PhotoSet {
}
export function isLoadedPhotoSection(section: PhotoSection | null | undefined | false): section is LoadedPhotoSection {
    return !!(section && (section as any).photoIds)
}
export type PhotoSectionById = { [K in PhotoSectionId]: PhotoSection | LoadedPhotoSection }


export type PhotoFilterType = 'all' | 'favorites' | 'trash' | 'tag'  //  | 'processed'
export type PhotoFilter =
    { readonly filterType: 'all' } |
    { readonly filterType: 'favorites' } |
    { readonly filterType: 'trash' } |
    { readonly filterType: 'tag', readonly tagId: TagId }
    // TODO: Revive Legacy code of 'version' feature
    // -> Add 'processed'


export interface PhotoRenderOptions {
    format: PhotoRenderFormat
    /** Quality between `0` and `1`. Will be ignored if `format` is `png` */
    quality: number
}
export type PhotoRenderFormat = 'jpg' | 'webp' | 'png'
export const photoRenderFormats: PhotoRenderFormat[] = [ 'jpg', 'webp', 'png' ]


export interface PhotoExportOptions extends PhotoRenderOptions {
    size: PhotoExportSizeType
    customSizeSide: PhotoExportCustomSizeSide
    customSizePixels: number
    withMetadata: boolean
    fileNameStyle: PhotoExportFileNameStyle
    fileNamePrefix: string
    folderPath: string
}
export type PhotoExportSizeType = 'S' | 'M' | 'L' | 'original' | 'custom'
export type PhotoExportCustomSizeSide = 'width' | 'height' | 'size'
export type PhotoExportFileNameStyle = 'like-original' | 'sequence'

export interface PhotoExportProgress {
    processed: number
    total: number
}


export interface EmptyTrashResult {
    photoIds: number[]
    updatedTags?: Tag[]
}


export interface MetaData {
    imgWidth?:     number
    imgHeight?:    number
    /** The assumed image width (in px). This width is not sure and should only be used if there is no other way for determining it */
    imgWidthAssumed?:  number
    /** The assumed image height (in px). This height is not sure and should only be used if there is no other way for determining it */
    imgHeightAssumed?: number
    /** Example: 'SONY DSC-N2' */
    camera?:       string
    /** Example: 0.0166 */
    exposureTime?: number
    /** Example: 200 */
    iso?:          number
    /** Example: 5.6 */
    aperture?:     number
    /** Example: 5 */
    focalLength?:  number
    createdAt?:    Date
    /** Details on orientation: https://www.impulseadventure.com/photo/exif-orientation.html */
    orientation:   ExifOrientation
    tags:          string[]
}


export type ExifData = {
    exif?:        { [K: string]: any }
    ifd0?:        { [K: string]: any }
    ifd1?:        { [K: string]: any }
    gps?:         { [K: string]: any }
    interop?:     { [K: string]: any }
    jfif?:        { [K: string]: any }
    iptc?:        { [K: string]: any }
    xmp?:         { [K: string]: any }
    icc?:         { [K: string]: any }
    makerNote?:   Uint8Array
    userComment?: Uint8Array
}

export type ExifSegment = 'exif' | 'ifd0' | 'ifd1' | 'gps' | 'interop' | 'jfif' | 'iptc' | 'xmp' | 'icc' | 'makerNote' | 'userComment'
export const allExifSegments: ExifSegment[] = [ 'exif', 'ifd0', 'ifd1', 'gps', 'interop', 'jfif', 'iptc', 'xmp', 'icc', 'makerNote', 'userComment' ]


export interface DecodedHeifImage {
    /** The width of the image (in px) */
    width: number
    /** The height of the image (in px) */
    height: number
    /** The image data in RGB (8 bit per channel). size in bytes = 3 * width * height */
    data: Int8Array
}
