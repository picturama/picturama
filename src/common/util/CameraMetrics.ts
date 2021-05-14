import { mat4 } from 'gl-matrix'

import { PhotoWork } from 'common/CommonTypes'
import { isShallowEqual } from 'common/util/LangUtil'
import { Size, zeroSize, Rect, zeroRect, Insets, zeroInsets } from 'common/util/GeometryTypes'


const globalMinZoom = 0.0000001
export const maxZoom = 2

export interface CameraMetrics {
    textureSize: Size
    canvasSize: Size
    displaySize: Size
    /** The scaling from canvas coordinates to display coordinates */
    displayScaling: number
    insets: Insets | null
    /**
     * The camera bounds. Pan and zoom actions are limited to this area.
     * In projected coordinates.
     */
    boundsRect: Rect
    requestedPhotoPosition: RequestedPhotoPosition
    photoPosition: PhotoPosition
    minZoom: number
    maxZoom: number
    cropRect: Rect
    /**
     * The crop rect which shows the whole texture.
     * Only valid if no tilt is applied.
     */
    neutralCropRect: Rect
    /**
     * The projection matrix translating from texture coordinates to projected coordinates.
     * See: `doc/geometry-concept.md`
     */
    projectionMatrix: mat4
    invertedProjectionMatrix?: mat4
    /**
     * The camera matrix translating projected coordinates to canvas coordinates.
     * See: `doc/geometry-concept.md`
     */
    cameraMatrix: mat4
    invertedCameraMatrix?: mat4
    /**
     * The display matrix translating projected coordinates to display coordinates.
     * See: `doc/geometry-concept.md`
     */
    displayMatrix: mat4
    invertedDisplayMatrix?: mat4
}

export const zeroCameraMetrics: CameraMetrics = {
    textureSize: zeroSize,
    canvasSize: zeroSize,
    displaySize: zeroSize,
    displayScaling: 1,
    insets: null,
    boundsRect: zeroRect,
    requestedPhotoPosition: 'contain',
    photoPosition: { centerX: 0, centerY: 0, zoom: 0 },
    cropRect: zeroRect,
    neutralCropRect: zeroRect,
    minZoom: globalMinZoom,
    maxZoom,
    projectionMatrix: mat4.create(),
    cameraMatrix: mat4.create(),
    displayMatrix: mat4.create(),
}

export interface PhotoPosition {
    /** The x-coordinate of the photo's pixel to show at the center */
    centerX: number
    /** The y-coordinate of the photo's pixel to show at the center */
    centerY: number
    /** The zoom factor (1 = show photo 1:1) */
    zoom: number
}

/**
 * - `contain`: Show the whole photo, centered in the canvas
 */
export type RequestedPhotoPosition = 'contain' | PhotoPosition

export class CameraMetricsBuilder {

    private textureSize: Size = zeroSize
    private canvasSize: Size | null = null
    private displayScaling = 1
    private insets: Insets = zeroInsets
    private boundsRect: Rect | null = null
    private adjustCanvasSize = false
    private requestedPhotoPosition: RequestedPhotoPosition = 'contain'
    private photoWork: PhotoWork

    private isDirty = true
    private cameraMetrics: CameraMetrics = zeroCameraMetrics


    constructor() {
        this.photoWork = {}
    }

    setTextureSize(textureSize: Size): this {
        if (!isShallowEqual(this.textureSize, textureSize)) {
            this.textureSize = textureSize
            this.isDirty = true
        }
        return this
    }

    /**
     * Sets the canvas size.
     * If set to `null` the canvas size will be set to the size of the bounds rect (which falls back to the crop rect).
     */
    setCanvasSize(canvasSize: Size | null): this {
        const displayScaling = 1
        if (!isShallowEqual(this.canvasSize, canvasSize) || this.displayScaling !== displayScaling) {
            this.canvasSize = canvasSize
            this.displayScaling = displayScaling
            this.isDirty = true
        }
        return this
    }

    setDisplaySize(displaySize: Size, displayScaling: number): this {
        const canvasSize: Size = { width: displaySize.width / displayScaling, height: displaySize.height / displayScaling }
        if (!isShallowEqual(this.canvasSize, canvasSize) || this.displayScaling !== displayScaling) {
            this.canvasSize = canvasSize
            this.displayScaling = displayScaling
            this.isDirty = true
        }
        return this
    }

    /**
     * Sets insets to apply when requestedPhotoPosition is `contain` (in display coordinates).
     */
    setInsets(insets: Insets): this {
        if (!isShallowEqual(this.insets, insets)) {
            this.insets = insets
            this.isDirty = true
        }
        return this
    }

    /**
     * Sets the camera bounds. Pan and zoom actions are limited to this area.
     * In projected coordinates.
     * If set to `null` the `clipRect` will be used.
     */
    setBoundsRect(boundsRect: Rect | null): this {
        if (!isShallowEqual(this.boundsRect, boundsRect)) {
            this.boundsRect = boundsRect
            this.isDirty = true
        }
        return this
    }

    /**
     * Sets whether the `canvasSize` of the CameraMetrics should be adjusted in order to show the whole photo without
     * borders.
     * This will only be done if `requestedPhotoPosition` is `'contain'`.
     * This only changes the `canvasSize` of the CameraMetrics returned by `getCameraMetrics` it does not change the
     * canvas size set by `setCanvasSize`.
     */
    setAdjustCanvasSize(adjustCanvasSize: boolean): this {
        if (this.adjustCanvasSize !== adjustCanvasSize) {
            this.adjustCanvasSize = adjustCanvasSize
            this.isDirty = true
        }
        return this
    }

    setPhotoPosition(photoPosition: RequestedPhotoPosition): this {
        if (!isShallowEqual(this.requestedPhotoPosition, photoPosition)) {
            this.requestedPhotoPosition = photoPosition
            this.isDirty = true
        }
        return this
    }

    getRequestedPhotoPosition(): RequestedPhotoPosition {
        return this.requestedPhotoPosition
    }

    setPhotoWork(photoWork: PhotoWork): this {
        if (this.photoWork !== photoWork) {
            this.photoWork = photoWork
            this.isDirty = true
        }
        return this
    }

    getCameraMetrics(): CameraMetrics {
        if (!this.isDirty) {
            return this.cameraMetrics
        }

        const { textureSize, displayScaling, photoWork, insets, requestedPhotoPosition } = this

        const rotationTurns = photoWork.rotationTurns || 0
        const insetsWidth = insets.left + insets.right
        const insetsHeight = insets.top + insets.bottom
        const neutralCropRect = updateNeutralCropRect(rotationTurns, textureSize, this.cameraMetrics && this.cameraMetrics.neutralCropRect)
        const cropRect = photoWork.cropRect || neutralCropRect
        const boundsRect = this.boundsRect || cropRect
        let canvasSize: Size = this.canvasSize || { width: boundsRect.width, height: boundsRect.height }

        let photoPosition: PhotoPosition
        const minZoom = (boundsRect.width === 0 || boundsRect.height === 0 || insetsWidth >= canvasSize.width || insetsHeight >= canvasSize.height) ?
            globalMinZoom :
            Math.min(maxZoom,
                (canvasSize.width - insetsWidth / displayScaling) / boundsRect.width,
                (canvasSize.height - insetsHeight / displayScaling) / boundsRect.height)
        if (requestedPhotoPosition === 'contain') {
            const zoom = minZoom
            const insetsOffsetX = (insets.right - insets.left) / 2
            const insetsOffsetY = (insets.bottom - insets.top) / 2
            photoPosition = {
                centerX: boundsRect.x + boundsRect.width / 2 + insetsOffsetX / displayScaling / zoom,
                centerY: boundsRect.y + boundsRect.height / 2 + insetsOffsetY / displayScaling /zoom,
                zoom
            }
            if (this.adjustCanvasSize) {
                canvasSize = {
                    width:  Math.floor(boundsRect.width  * zoom),
                    height: Math.floor(boundsRect.height * zoom)
                }
            }
        } else {
            photoPosition = requestedPhotoPosition
            const zoom = photoPosition.zoom
            if (zoom < minZoom || zoom > maxZoom) {
                photoPosition = { ...photoPosition, zoom: Math.min(maxZoom, Math.max(minZoom, zoom)) }
            }
        }

        // Important for matrix: Build it backwards (first operation last)

        const cameraMatrix = mat4.create()
        // We have canvas coordinates here
        // Move origin to left-top corner
        mat4.translate(cameraMatrix, cameraMatrix, [ canvasSize.width / 2, canvasSize.height / 2, 0 ])
        // Scale from texture pixels to screen pixels
        mat4.scale(cameraMatrix, cameraMatrix, [ photoPosition.zoom, photoPosition.zoom, 1 ])
        // Translate texture
        mat4.translate(cameraMatrix, cameraMatrix, [ -photoPosition.centerX, -photoPosition.centerY, 0 ])
        // We have projected coordinates here

        let displaySize: Size
        let displayMatrix: mat4
        if (displayScaling === 1) {
            displaySize = canvasSize
            displayMatrix = cameraMatrix
        } else {
            displaySize = { width: canvasSize.width * displayScaling, height: canvasSize.height * displayScaling }

            displayMatrix = mat4.create()
            // We have display coordinates here
            // Scale from canvas coordinates to display coordinates
            mat4.scale(displayMatrix, displayMatrix, [ displayScaling, displayScaling, 0 ])
            // We have canvas coordinates here
            mat4.multiply(displayMatrix, displayMatrix, cameraMatrix)
            // We have projected coordinates here
        }

        this.cameraMetrics = {
            textureSize,
            canvasSize,
            displaySize,
            displayScaling,
            insets,
            boundsRect,
            requestedPhotoPosition,
            photoPosition,
            minZoom,
            maxZoom,
            cropRect,
            neutralCropRect,
            projectionMatrix: createProjectionMatrix(textureSize, photoWork),
            cameraMatrix,
            displayMatrix,
        }
        this.isDirty = false
        return this.cameraMetrics
    }

}


function updateNeutralCropRect(rotationTurns: number, textureSize: Size, prevNeutralCropRect: Rect | null): Rect {
    const switchSides = rotationTurns % 2 === 1
    const neutralWidth  = switchSides ? textureSize.height : textureSize.width
    const neutralHeight = switchSides ? textureSize.width : textureSize.height
    let neutralX = -neutralWidth / 2
    let neutralY = -neutralHeight / 2

    // correct x and y to the rounded origin of projected coordinates
    neutralX = (rotationTurns === 0 || rotationTurns === 3) ? Math.ceil(neutralX) : Math.floor(neutralX)
    neutralY = (rotationTurns === 0 || rotationTurns === 1) ? Math.ceil(neutralY) : Math.floor(neutralY)

    let neutralCropRect = prevNeutralCropRect
    if (!neutralCropRect || neutralCropRect.x !== neutralX || neutralCropRect.y !== neutralY ||
        neutralCropRect.width !== neutralWidth || neutralCropRect.height !== neutralHeight)
    {
        neutralCropRect = { x: neutralX, y: neutralY, width: neutralWidth, height: neutralHeight }
    }

    return neutralCropRect
}


export function createProjectionMatrix(textureSize: Size, photoWork: PhotoWork): mat4 {
    const rotationTurns = photoWork.rotationTurns || 0

    const projectionMatrix = mat4.create()
    // We have projected coordinates here
    // Apply tilt
    if (photoWork.tilt) {
        mat4.rotateZ(projectionMatrix, projectionMatrix, photoWork.tilt * Math.PI / 180)
    }
    // Apply 90° rotation
    mat4.rotateZ(projectionMatrix, projectionMatrix, rotationTurns * Math.PI / 2)
    // Move texture to the center
    // The center is rounded so projected pixels corresponded to whole texture pixels (even if width or height is odd)
    mat4.translate(projectionMatrix, projectionMatrix, [ Math.round(-textureSize.width / 2), Math.round(-textureSize.height / 2), 0 ])
    // We have texture coordinates here

    return projectionMatrix
}


/**
 * Returns a PhotoPosition which keeps the photo inside the view. Returns `photoPosition` it is already OK.
 *
 * @param allowExceedingToCurrentPosition Whether to allow exceeding min/max as far as the current photoPosition does.
 *      This may happen after zooming using the mouse wheel.
 *      So when min/max is exceeded because the user zoomed near the edges,
 *      the photo won't jump when panned, but panning back so far won't work.
 */
export function limitPhotoPosition(cameraMetrics: CameraMetrics, photoPosition: PhotoPosition, allowExceedingToCurrentPosition: boolean): PhotoPosition {
    const { canvasSize, boundsRect, photoPosition: prevPhotoPosition, cropRect } = cameraMetrics
    const { zoom } = photoPosition

    const halfCanvasWidthInPhotoPix = canvasSize.width / 2 / zoom
    const halfCanvasHeightInPhotoPix = canvasSize.height / 2 / zoom
    const panLimitX = Math.min(halfCanvasWidthInPhotoPix, cropRect.width - halfCanvasWidthInPhotoPix)
    const panLimitY = Math.min(halfCanvasHeightInPhotoPix, cropRect.height - halfCanvasHeightInPhotoPix)
    let minCenterX = boundsRect.x + panLimitX
    let minCenterY = boundsRect.y + panLimitY
    let maxCenterX = boundsRect.x + boundsRect.width - panLimitX
    let maxCenterY = boundsRect.y + boundsRect.height - panLimitY

    if (allowExceedingToCurrentPosition && prevPhotoPosition && photoPosition.zoom === prevPhotoPosition.zoom) {
        minCenterX = Math.min(minCenterX, prevPhotoPosition.centerX)
        maxCenterX = Math.max(maxCenterX, prevPhotoPosition.centerX)
        minCenterY = Math.min(minCenterY, prevPhotoPosition.centerY)
        maxCenterY = Math.max(maxCenterY, prevPhotoPosition.centerY)
    }

    const centerX = Math.max(minCenterX, Math.min(maxCenterX, photoPosition.centerX))
    const centerY = Math.max(minCenterY, Math.min(maxCenterY, photoPosition.centerY))

    if (centerX === photoPosition.centerX && centerY === photoPosition.centerY) {
        return photoPosition
    } else {
        return { centerX, centerY, zoom }
    }
}


export function getInvertedProjectionMatrix(cameraMetrics: CameraMetrics): mat4 {
    if (!cameraMetrics.invertedProjectionMatrix) {
        cameraMetrics.invertedProjectionMatrix = mat4.invert(mat4.create(), cameraMetrics.projectionMatrix)!
    }
    return cameraMetrics.invertedProjectionMatrix
}


export function getInvertedCameraMatrix(cameraMetrics: CameraMetrics): mat4 {
    if (!cameraMetrics.invertedCameraMatrix) {
        cameraMetrics.invertedCameraMatrix = mat4.invert(mat4.create(), cameraMetrics.cameraMatrix)!
    }
    return cameraMetrics.invertedCameraMatrix
}
