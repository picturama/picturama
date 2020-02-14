import React from 'react'
import classnames from 'classnames'
import { vec2 } from 'gl-matrix'

import { PhotoWork, ExifOrientation } from 'common/CommonTypes'
import { CameraMetrics, getInvertedProjectionMatrix, createProjectionMatrix } from 'common/util/CameraMetrics'
import { Point, Size, Rect, Side, Corner, corners, Insets, zeroInsets } from 'common/util/GeometryTypes'
import {
    transformRect, oppositeCorner, cornerPointOfRect, centerOfRect, intersectLineWithPolygon,
    rectFromCenterAndSize, isPointInPolygon, nearestPointOnPolygon, Vec2Like, rectFromCornerPointAndSize,
    rectFromPoints, directionOfPoints, movePoint, ceilVec2, floorVec2, roundVec2, boundsOfPoints,
    boundsOfRects, scaleRectToFitBorders
} from 'common/util/GeometryUtil'
import { bindMany, isShallowEqual } from 'common/util/LangUtil'

import CropOverlay from './CropOverlay'
import CropModeToolbar from './CropModeToolbar'
import { createDragRectFencePolygon } from './CropModeUtil'
import { AspectRatioType } from './DetailTypes'


const minCropRectSize = 32


export interface Props {
    topBarClassName: string
    bodyClassName: string
    exifOrientation: ExifOrientation
    photoWork: PhotoWork
    cameraMetrics: CameraMetrics
    toggleMaximized(): void
    onPhotoWorkEdited(photoWork: PhotoWork, boundsRect?: Rect | null): void
    onDone(): void
}

interface State {
    actionInfo:
        { type: 'tilt', centerInTextureCoords: vec2, maxCropRectSize: Size } |
        { type: 'drag-rect', startCropRect: Rect, fencePolygon: vec2[] } |
        { type: 'drag-side', dragStartMetrics: DragStartMetrics } |
        { type: 'drag-corner', dragStartMetrics: DragStartMetrics } |
        null
    aspectRatioType: AspectRatioType
    isAspectRatioLandscape: boolean
}

export default class CropModeLayer extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'setAspectRatio', 'onRectDrag', 'onSideDrag', 'onCornerDrag', 'onTiltChange')
        this.state = { actionInfo: null, aspectRatioType: 'free', isAspectRatioLandscape: true }
    }

    private setAspectRatio(aspectRatioType: AspectRatioType, isLandscape: boolean | null) {
        const { props } = this
        const { cameraMetrics } = props

        if (isLandscape === null) {
            // Detect landscape/portrait
            const { width, height } = cameraMetrics.cropRect
            isLandscape = (width === height) ? this.state.isAspectRatioLandscape : width > height
        }

        let nextCropRect: Rect | null = null
        const aspectRatio = getAspectRatio(aspectRatioType, isLandscape, cameraMetrics.textureSize)
        if (aspectRatio !== null) {
            const { cropRect: prevCropRect, textureSize } = cameraMetrics
            const texturePolygon = createTexturePolygon(cameraMetrics)

            let wantedCropRectSize: Size
            if (prevCropRect.width === textureSize.width || prevCropRect.height === textureSize.height) {
                // The last crop rect was full size -> Make the next crop rect full size again
                const maxSize = Math.max(textureSize.width, textureSize.height)
                wantedCropRectSize = aspectRatio > 1 ?
                    { width: maxSize, height: maxSize / aspectRatio } :
                    { width: maxSize * aspectRatio, height: maxSize }
            } else {
                // The new crop rect's area should have the same size as the previous one
                const width = Math.sqrt(prevCropRect.width * prevCropRect.height * aspectRatio)
                wantedCropRectSize = { width, height: width / aspectRatio }
            }

            nextCropRect = scaleRectToFitBorders(centerOfRect(prevCropRect), wantedCropRectSize, texturePolygon)
        }

        // Apply changes
        this.setState({ aspectRatioType, isAspectRatioLandscape: isLandscape })
        if (nextCropRect) {
            this.onPhotoWorkEdited({ ...props.photoWork, cropRect: nextCropRect })
        }
    }

    private onRectDrag(deltaX: number, deltaY: number, isFinished: boolean) {
        const { props } = this
        const { cameraMetrics } = props
        const { actionInfo } = this.state
        let nextState: Partial<State> | null = null

        let startCropRect: Rect
        let fencePolygon: vec2[]
        if (actionInfo && actionInfo.type === 'drag-rect') {
            startCropRect = actionInfo.startCropRect
            fencePolygon = actionInfo.fencePolygon
        } else {
            startCropRect = cameraMetrics.cropRect
            fencePolygon = createDragRectFencePolygon(startCropRect, createTexturePolygon(cameraMetrics))
            nextState = { actionInfo: { type: 'drag-rect', startCropRect, fencePolygon } }
        }

        // Limit the crop rect to the texture
        const zoom = cameraMetrics.photoPosition.zoom
        let nextRectLeftTop: Vec2Like = [startCropRect.x - deltaX / zoom, startCropRect.y - deltaY / zoom]
        if (!isPointInPolygon(nextRectLeftTop, fencePolygon)) {
            nextRectLeftTop = nearestPointOnPolygon(nextRectLeftTop, fencePolygon)
        }
        const cropRect = rectFromCornerPointAndSize(roundVec2(nextRectLeftTop), startCropRect)

        // Apply changes
        if (isFinished) {
            nextState = { actionInfo: null }
        }
        if (nextState) {
            this.setState(nextState as any)
        }
        this.onPhotoWorkEdited({ ...props.photoWork, cropRect })
    }

    private onSideDrag(side: Side, point: Point, isFinished: boolean) {
        const { props, state } = this
        const { cameraMetrics } = props
        const { actionInfo } = state
        const prevCropRect = cameraMetrics.cropRect
        let nextState: Partial<State> | null = null

        let dragStartMetrics: DragStartMetrics
        if (actionInfo && actionInfo.type === 'drag-side') {
            dragStartMetrics = actionInfo.dragStartMetrics
        } else {
            dragStartMetrics = getDragStartMetrics(cameraMetrics)
            nextState = { actionInfo: { type: 'drag-side', dragStartMetrics } }
        }

        const isHorizontal = (side === 'e' || side === 'w')
        const { projectedPoint, boundsRect } = getProjectedDragTarget(point, dragStartMetrics,
            isHorizontal ? 'x-only' : 'y-only')

        const nwCorner = cornerPointOfRect(prevCropRect, 'nw')
        const seCorner = cornerPointOfRect(prevCropRect, 'se')

        switch (side) {
            case 'w': nwCorner[0] = Math.min(seCorner[0] - minCropRectSize, projectedPoint[0]); break
            case 'n': nwCorner[1] = Math.min(seCorner[1] - minCropRectSize, projectedPoint[1]); break
            case 'e': seCorner[0] = Math.max(nwCorner[0] + minCropRectSize, projectedPoint[0]); break
            case 's': seCorner[1] = Math.max(nwCorner[1] + minCropRectSize, projectedPoint[1]); break
        }

        let wantedCropRect = rectFromPoints(nwCorner, seCorner)
        const aspectRatio = getAspectRatio(state.aspectRatioType, state.isAspectRatioLandscape, cameraMetrics.textureSize)
        if (aspectRatio) {
            const wantedCropRectCenter = centerOfRect(wantedCropRect)
            if (isHorizontal) {
                wantedCropRect = rectFromCenterAndSize(wantedCropRectCenter,
                    { width: wantedCropRect.width, height: wantedCropRect.width / aspectRatio })
            } else {
                wantedCropRect = rectFromCenterAndSize(wantedCropRectCenter,
                    { width: wantedCropRect.height * aspectRatio, height: wantedCropRect.height })
            }
        }

        const texturePolygon = createTexturePolygon(cameraMetrics)
        const cropRect = limitRectResizeToTexture(prevCropRect, wantedCropRect, texturePolygon)

        // Apply changes
        if (isFinished) {
            nextState = { actionInfo: null }
        }
        if (nextState) {
            this.setState(nextState as any)
        }
        this.onPhotoWorkEdited({ ...props.photoWork, cropRect }, isFinished ? null : boundsOfRects(boundsRect, cropRect))
    }

    private onCornerDrag(corner: Corner, point: Point, isFinished: boolean) {
        const { props, state } = this
        const { cameraMetrics } = props
        const { actionInfo } = state
        const prevCropRect = cameraMetrics.cropRect
        let nextState: Partial<State> | null = null

        let dragStartMetrics: DragStartMetrics
        if (actionInfo && actionInfo.type === 'drag-corner') {
            dragStartMetrics = actionInfo.dragStartMetrics
        } else {
            dragStartMetrics = getDragStartMetrics(cameraMetrics)
            nextState = { actionInfo: { type: 'drag-corner', dragStartMetrics } }
        }

        const { projectedPoint, boundsRect } = getProjectedDragTarget(point, dragStartMetrics, 'both')
        const oppositePoint = cornerPointOfRect(prevCropRect, oppositeCorner[corner])

        // Limit the crop rect to the texture
        // The oppositePoint stays fixed, find width/height that fits into the texture
        const texturePolygon = createTexturePolygon(cameraMetrics)
        const cornerDirection = [
            corner === 'ne' || corner === 'se' ? 1 : -1,
            corner === 'sw' || corner === 'se' ? 1 : -1
        ]

        let wantedCornerPoint: Vec2Like
        const aspectRatio = getAspectRatio(state.aspectRatioType, state.isAspectRatioLandscape, cameraMetrics.textureSize)
        if (aspectRatio) {
            let rawWidth  = Math.abs(projectedPoint[0] - oppositePoint[0])
            let rawHeight = Math.abs(projectedPoint[1] - oppositePoint[1])
            if (rawWidth / rawHeight < aspectRatio) {
                rawWidth = rawHeight * aspectRatio
            } else {
                rawHeight = rawWidth / aspectRatio
            }
            wantedCornerPoint = [
                oppositePoint[0] + cornerDirection[0] * rawWidth,
                oppositePoint[1] + cornerDirection[1] * rawHeight
            ]
        } else {
            wantedCornerPoint = isPointInPolygon(projectedPoint, texturePolygon) ? projectedPoint : nearestPointOnPolygon(projectedPoint, texturePolygon)
        }

        const nextCropRectSize = {
            width:  wantedCornerPoint[0] - oppositePoint[0],
            height: wantedCornerPoint[1] - oppositePoint[1]
        }
        let xCutFactor = maxCutFactor(oppositePoint, [nextCropRectSize.width, 0], texturePolygon) || 1
        let yCutFactor = maxCutFactor(oppositePoint, [0, nextCropRectSize.height], texturePolygon) || 1
        if (aspectRatio) {
            xCutFactor = yCutFactor = Math.min(xCutFactor, yCutFactor)
        }
        if (xCutFactor < 1) {
            nextCropRectSize.width *= xCutFactor
        }
        if (yCutFactor < 1) {
            nextCropRectSize.height *= yCutFactor
        }

        nextCropRectSize.width  = cornerDirection[0] * Math.max(minCropRectSize, Math.floor(cornerDirection[0] * nextCropRectSize.width))
        nextCropRectSize.height = cornerDirection[1] * Math.max(minCropRectSize, Math.floor(cornerDirection[1] * nextCropRectSize.height))
        const cropRect = rectFromCornerPointAndSize(oppositePoint, nextCropRectSize)

        // Apply changes
        if (isFinished) {
            nextState = { actionInfo: null }
        }
        if (nextState) {
            this.setState(nextState as any)
        }
        this.onPhotoWorkEdited({ ...props.photoWork, cropRect }, isFinished ? null : boundsOfRects(boundsRect, cropRect))
    }

    private onTiltChange(tilt: number) {
        const { props } = this
        const { cameraMetrics } = props
        const { actionInfo } = this.state
        let nextState: Partial<State> | null = null
        const prevCropRect = cameraMetrics.cropRect

        // Apply tilt
        const photoWork = { ...props.photoWork }
        if (tilt === 0) {
            delete photoWork.tilt
        } else {
            photoWork.tilt = tilt
        }

        // Get center and maximum size of crop rect
        let centerInTextureCoords: vec2
        let maxCropRectSize: Size
        if (actionInfo && actionInfo.type === 'tilt') {
            centerInTextureCoords = actionInfo.centerInTextureCoords
            maxCropRectSize = actionInfo.maxCropRectSize
        } else {
            const center = centerOfRect(prevCropRect)
            vec2.transformMat4(center, center, getInvertedProjectionMatrix(cameraMetrics))
            centerInTextureCoords = center
            maxCropRectSize = { width: prevCropRect.width, height: prevCropRect.height }
            nextState = { actionInfo: { type: 'tilt', centerInTextureCoords, maxCropRectSize } }
        }

        // Adjust crop rect
        const texturePolygon = createTexturePolygon(cameraMetrics)
        const nextProjectionMatrix = createProjectionMatrix(cameraMetrics.textureSize, props.exifOrientation, photoWork)
        const nextCropRectCenter = vec2.transformMat4(vec2.create(), centerInTextureCoords, nextProjectionMatrix)
        photoWork.cropRect = scaleRectToFitBorders(nextCropRectCenter, maxCropRectSize, texturePolygon)

        // Apply changes
        if (nextState) {
            this.setState(nextState as any)
        }
        this.onPhotoWorkEdited(photoWork)
    }

    private onPhotoWorkEdited(photoWork: PhotoWork, boundsRect?: Rect | null) {
        const { cropRect } = photoWork
        if (cropRect) {
            if (isShallowEqual(cropRect, this.props.cameraMetrics.neutralCropRect)) {
                delete photoWork.cropRect
            } else {
                photoWork.cropRect = cropRect
            }
        }

        this.props.onPhotoWorkEdited(photoWork, boundsRect)
    }

    render() {
        const { props, state } = this
        const { cameraMetrics } = props
        if (!cameraMetrics) {
            return null
        }

        const cropRectInViewCoords = transformRect(cameraMetrics.cropRect, cameraMetrics.cameraCssMatrix)
        return (
            <>
                <CropModeToolbar
                    className={classnames(props.topBarClassName, 'CropModeLayer-toolbar')}
                    aspectRatioType={state.aspectRatioType}
                    isAspectRatioLandscape={state.isAspectRatioLandscape}
                    photoWork={props.photoWork}
                    setAspectRatio={this.setAspectRatio}
                    toggleMaximized={props.toggleMaximized}
                    onPhotoWorkEdited={props.onPhotoWorkEdited}
                    onDone={props.onDone}
                />
                <CropOverlay
                    className={classnames(props.bodyClassName, 'CropModeLayer-body')}
                    width={cameraMetrics.canvasCssSize.width}
                    height={cameraMetrics.canvasCssSize.height}
                    rect={cropRectInViewCoords}
                    tilt={props.photoWork.tilt || 0}
                    onRectDrag={this.onRectDrag}
                    onSideDrag={this.onSideDrag}
                    onCornerDrag={this.onCornerDrag}
                    onTiltChange={this.onTiltChange}
                />
            </>
        )
    }

}


function getAspectRatio(aspectRatioType: AspectRatioType, isLandscape: boolean, textureSize: Size): number | null {
    let value: number
    switch (aspectRatioType) {
        case 'free':     return null
        case 'original': value = Math.max(1, textureSize.width, textureSize.height) / Math.max(1, Math.min(textureSize.width, textureSize.height)); break
        case '1:1':      value = 1; break
        case '16:9':     value = 16 / 9; break
        case '4:3':      value = 4 / 3; break
        case '3:2':      value = 3 / 2; break
        default: throw new Error('Unsupported aspectRatioType: ' + aspectRatioType)
    }

    return isLandscape ? value : 1 / value
}


/**
 * Creates a polygon of the texture's outline (in projected coordinates).
 */
function createTexturePolygon(cameraMetrics: CameraMetrics): vec2[] {
    const { textureSize, projectionMatrix } = cameraMetrics

    // Create the polygon in texture coordinates
    const polygon = [
        vec2.fromValues(0, 0),
        vec2.fromValues(textureSize.width, 0),
        vec2.fromValues(textureSize.width, textureSize.height),
        vec2.fromValues(0, textureSize.height),
    ]

    // Transform the polygon to projected coordinates
    for (let i = 0, il = polygon.length; i < il; i++) {
        vec2.transformMat4(polygon[i], polygon[i], projectionMatrix)
    }

    return polygon
}


function limitRectResizeToTexture(prevRect: Rect, wantedRect: Rect, texturePolygon: Vec2Like[]): Rect {
    let minFactor = 1

    if (wantedRect.width < minCropRectSize) {
        const minFactorX = (prevRect.width - minCropRectSize) / (wantedRect.width - minCropRectSize)
        if (minFactorX < minFactor) {
            minFactor = minFactorX
        }
    }
    if (wantedRect.height < minCropRectSize) {
        const minFactorY = (prevRect.height - minCropRectSize) / (wantedRect.height - minCropRectSize)
        if (minFactorY < minFactor) {
            minFactor = minFactorY
        }
    }

    let nwStart: vec2 | null = null
    let nwDirection: vec2 | null = null
    let seStart: vec2 | null = null
    let seDirection: vec2 | null = null
    for (const corner of corners) {
        const start = cornerPointOfRect(prevRect, corner)
        const end = cornerPointOfRect(wantedRect, corner)
        const direction = directionOfPoints(start, end)

        const cutFactor = maxCutFactor(start, direction, texturePolygon)
        if (cutFactor && cutFactor < minFactor) {
            minFactor = cutFactor
        }

        if (corner === 'nw') {
            nwStart = start
            nwDirection = cutFactor ? direction : null
        } else if (corner === 'se') {
            seStart = start
            seDirection = cutFactor ? direction : null
        }
    }

    const nextNwPoint = ceilVec2(nwDirection ? movePoint(nwStart!, nwDirection, minFactor) : nwStart!)
    const nextSePoint = floorVec2(seDirection ? movePoint(seStart!, seDirection, minFactor) : seStart!)
    return rectFromPoints(nextNwPoint, nextSePoint)
}


function maxCutFactor(lineStart: Vec2Like, lineDirection: Vec2Like, polygonPoints: Vec2Like[]): number | null {
    const factors = intersectLineWithPolygon(lineStart, lineDirection, polygonPoints)
    if (factors.length) {
        return factors[factors.length - 1]
    } else {
        return null
    }
}


interface DragStartMetrics {
    canvasSize: Size
    insets: Insets
    startZoom: number
    startBoundsNwScreen: vec2
    startBoundsSeScreen: vec2
    startBoundsNwProjected: vec2
    startBoundsSeProjected: vec2
    textureBounds: Rect
}

function getDragStartMetrics(startCameraMetrics: CameraMetrics): DragStartMetrics {
    const startBoundsNwProjected = cornerPointOfRect(startCameraMetrics.boundsRect, 'nw')
    const startBoundsSeProjected = cornerPointOfRect(startCameraMetrics.boundsRect, 'se')
    const startBoundsNwScreen = vec2.transformMat4(vec2.create(), startBoundsNwProjected, startCameraMetrics.cameraMatrix)
    const startBoundsSeScreen = vec2.transformMat4(vec2.create(), startBoundsSeProjected, startCameraMetrics.cameraMatrix)

    const texturePolygon = createTexturePolygon(startCameraMetrics)
    const textureBounds = boundsOfPoints(texturePolygon)

    return {
        canvasSize: startCameraMetrics.canvasCssSize,
        insets: startCameraMetrics.insets || zeroInsets,
        startZoom: startCameraMetrics.photoPosition.zoom,
        startBoundsNwScreen,
        startBoundsSeScreen,
        startBoundsNwProjected,
        startBoundsSeProjected,
        textureBounds,
    }
}


function getProjectedDragTarget(screenPoint: Point, dragStartMetrics: DragStartMetrics, adjust: 'x-only' | 'y-only' | 'both'):
    { projectedPoint: vec2, boundsRect: Rect }
{
    const {
        canvasSize, insets, startZoom, startBoundsNwScreen, startBoundsSeScreen,
        startBoundsNwProjected, startBoundsSeProjected, textureBounds
    } = dragStartMetrics
    const canvasPadding = 10

    const startBoundsWidthScreen = startBoundsSeScreen[0] - startBoundsNwScreen[0]
    const startBoundsHeightScreen = startBoundsSeScreen[1] - startBoundsNwScreen[1]

    const insetsRightX = canvasSize.width - insets.right
    const insetsBottomY = canvasSize.height - insets.bottom
    const mainAreaWidth = insetsRightX - insets.left
    const mainAreaHeight = insetsBottomY - insets.top

    const boundsNwProjected = vec2.clone(startBoundsNwProjected)
    const boundsSeProjected = vec2.clone(startBoundsSeProjected)

    if (screenPoint.x < startBoundsNwScreen[0] && adjust !== 'y-only') {
        if (screenPoint.x < insets.left) {
            const borderX = insets.left - screenPoint.x
            const borderWidth = insets.left - canvasPadding
            const borderInsideProjected = boundsNwProjected[0] - (mainAreaWidth - startBoundsWidthScreen) / startZoom
            const borderOutsideProjected = Math.min(borderInsideProjected - borderWidth / startZoom, textureBounds.x)
            boundsNwProjected[0] = Math.max(textureBounds.x, borderInsideProjected - (borderX / borderWidth) * (borderInsideProjected - borderOutsideProjected))
        } else {
            boundsNwProjected[0] = Math.max(textureBounds.x, startBoundsNwProjected[0] - (startBoundsNwScreen[0] - screenPoint.x) * 2 / startZoom)
        }
    } else if (screenPoint.x > startBoundsSeScreen[0] && adjust !== 'y-only') {
        const textureBoundsRight = textureBounds.x + textureBounds.width
        if (screenPoint.x > insetsRightX) {
            const borderX = insetsRightX - screenPoint.x
            const borderWidth = insets.right - canvasPadding
            const borderInsideProjected = boundsSeProjected[0] + (mainAreaWidth - startBoundsWidthScreen) / startZoom
            const borderOutsideProjected = Math.max(borderInsideProjected + borderWidth / startZoom, textureBoundsRight)
            boundsSeProjected[0] = Math.min(textureBoundsRight, borderInsideProjected + (borderX / borderWidth) * (borderInsideProjected - borderOutsideProjected))
        } else {
            boundsSeProjected[0] = Math.min(textureBoundsRight, startBoundsSeProjected[0] + (screenPoint.x - startBoundsSeScreen[0]) * 2 / startZoom)
        }
    }
    if (screenPoint.y < startBoundsNwScreen[1] && adjust !== 'x-only') {
        if (screenPoint.y < insets.top) {
            const borderY = insets.top - screenPoint.y
            const borderHeight = insets.top - canvasPadding
            const borderInsideProjected = boundsNwProjected[1] - (mainAreaHeight - startBoundsHeightScreen) / startZoom
            const borderOutsideProjected = Math.min(borderInsideProjected - borderHeight / startZoom, textureBounds.y)
            boundsNwProjected[1] = Math.max(textureBounds.y, borderInsideProjected - (borderY / borderHeight) * (borderInsideProjected - borderOutsideProjected))
        } else {
            boundsNwProjected[1] = Math.max(textureBounds.y, startBoundsNwProjected[1] - (startBoundsNwScreen[1] - screenPoint.y) * 2 / startZoom)
        }
    } else if (screenPoint.y > startBoundsSeScreen[1] && adjust !== 'x-only') {
        const textureBoundsRight = textureBounds.y + textureBounds.height
        if (screenPoint.y > insetsBottomY) {
            const borderY = insetsBottomY - screenPoint.y
            const borderHeight = insets.bottom - canvasPadding
            const borderInsideProjected = boundsSeProjected[1] + (mainAreaHeight - startBoundsHeightScreen) / startZoom
            const borderOutsideProjected = Math.max(borderInsideProjected + borderHeight / startZoom, textureBoundsRight)
            boundsSeProjected[1] = Math.min(textureBoundsRight, borderInsideProjected + (borderY / borderHeight) * (borderInsideProjected - borderOutsideProjected))
        } else {
            boundsSeProjected[1] = Math.min(textureBoundsRight, startBoundsSeProjected[1] + (screenPoint.y - startBoundsSeScreen[1]) * 2 / startZoom)
        }
    }

    const zoom = Math.min(
        startZoom,
        mainAreaWidth / (boundsSeProjected[0] - boundsNwProjected[0]),
        mainAreaHeight / (boundsSeProjected[1] - boundsNwProjected[1]))

    const mainAreaCenterX = insets.left + mainAreaWidth / 2
    const mainAreaCenterY = insets.top + mainAreaHeight / 2
    const boundsCenterXProjected = (boundsNwProjected[0] + boundsSeProjected[0]) / 2
    const boundsCenterYProjected = (boundsNwProjected[1] + boundsSeProjected[1]) / 2
    const projectedX = boundsCenterXProjected + (Math.max(insets.left, Math.min(insetsRightX, screenPoint.x)) - mainAreaCenterX) / zoom
    const projectedY = boundsCenterYProjected + (Math.max(insets.top, Math.min(insetsBottomY, screenPoint.y)) - mainAreaCenterY) / zoom

    const result = {
        projectedPoint: vec2.fromValues(projectedX, projectedY),
        boundsRect: boundsOfPoints([boundsNwProjected, boundsSeProjected])
    }
    return result
}
