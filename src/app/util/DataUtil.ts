import { convertFileSrc } from '@tauri-apps/api/core'

import { PhotoId, Photo, ExifOrientation, BinaryString, UiConfig, PhotoRenderFormat } from 'app/CommonTypes'


const workExt: PhotoRenderFormat = 'webp'

let uiConfig: UiConfig | undefined
let heicExtensionRE: RegExp | undefined
let rawExtensionRE: RegExp | undefined

export function init(nextUiConfig: UiConfig) {
    uiConfig = nextUiConfig
    heicExtensionRE = extensionRE(nextUiConfig.acceptedHeicExtensions)
    rawExtensionRE = extensionRE(nextUiConfig.acceptedRawExtensions)
}

function extensionRE(extensions: string[]): RegExp {
    return new RegExp(`\\.(${extensions.join('|')})$`, 'i')
}

/**
 * Whether this file is decoded by libheif in Rust rather than by the web view.
 *
 * Which extensions those are is decided by the scanner in Rust (`import_scanner.rs`) and travels in the
 * `UiConfig` - the frontend must not keep a list of its own, or it would drift apart from the one that
 * decides what gets imported.
 *
 * Answers `false` before `init` - the UI Tester (`test-ui.html`) never fetches a `UiConfig`, and the photos
 * it shows are JPEGs, for which the plain path is the right one anyway.
 */
export function isHeicFile(filePath: string): boolean {
    return heicExtensionRE?.test(filePath) ?? false
}

/** Whether this file is shown through its embedded JPEG preview. See `isHeicFile` for where the list comes from. */
export function isRawFile(filePath: string): boolean {
    return rawExtensionRE?.test(filePath) ?? false
}

export function getVersion(): string | undefined {
    return uiConfig?.version
}

export function getPlatform(): string | undefined {
    return uiConfig?.platform
}

export function getMasterPath(photo: Photo | { masterDir: string, masterFilename: string }): string {
    return `${photo.masterDir}/${photo.masterFilename}`
}

export function getThumbnailPath(photoId: PhotoId): string {
    return `${uiConfig!.thumbnailPath}/${shortId(photoId)}.${workExt}`
}

export function getThumbnailUrl(photoId: PhotoId): string {
    return convertFileSrc(getThumbnailPath(photoId))
}


function shortId(id: number): string {
    return id.toString(36)
}


/**
 * Returns whether an EXIF orientation has width and height switched between its encoded view and its screen view.
 * (Is `true` for images rotated left or right, is `false` for images not rotated or rotated 180°.)
 */
export function hasExifOrientationSwitchedSides(exifOrientation: ExifOrientation): boolean {
    return exifOrientation >= 5
}


function decodeImageDataUrlAsBase64String(dataUrl: string): string {
    // Example data URL: 'data:image/webp;base64,UklG...'
    const dataPrefix = 'base64,'
    return dataUrl.substr(dataUrl.indexOf(dataPrefix) + dataPrefix.length)
}

export function decodeImageDataUrlAsBinaryString(dataUrl: string): BinaryString {
    return atob(decodeImageDataUrlAsBase64String(dataUrl))
}

//export function decodeImageDataUrlAsBuffer(dataUrl: string): Buffer {
//    return Buffer.from(decodeImageDataUrlAsBase64String(dataUrl), 'base64')
//}

//export function encodeImageDataUrl(mimeType: 'image/jpg' | 'image/png', imageData: Buffer): string {
//    return `data:${mimeType};base64,${imageData.toString('base64')}`
//}
