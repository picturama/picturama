import { mat4, vec2 } from 'gl-matrix'

import { Point, Size, Rect, Corner } from 'app/util/GeometryTypes'

import { round } from './LangUtil'


export type Vec2Like = vec2 | [ number, number ]

export const oppositeCorner: { [K in Corner]: Corner } = {
    nw: 'se',
    ne: 'sw',
    sw: 'ne',
    se: 'nw'
}

export function toVec2(point: Vec2Like | Point): vec2 {
    if (isVec2(point)) {
        return point
    } else if (isPoint(point)) {
        return vec2.fromValues(point.x, point.y)
    } else {
        return vec2.fromValues(point[0], point[1])
    }
}

export function isVec2(obj: Vec2Like | Point | null | undefined): obj is vec2 {
    return obj instanceof Float32Array && obj.length === 2
}

export function isVec2Like(obj: Vec2Like | Point | null | undefined): obj is Vec2Like {
    return !!obj && obj['length'] === 2 && typeof obj[0] === 'number' && typeof obj[1] === 'number'
}

export function isPoint(obj: Vec2Like | Point | null | undefined): obj is Point {
    return !!obj && typeof obj['x'] === 'number' && typeof obj['y'] === 'number'
}

export function roundVec2(vector: Vec2Like, fractionDigits: number = 0): vec2 {
    return vec2.fromValues(
        round(vector[0], fractionDigits),
        round(vector[1], fractionDigits)
    )
}

export function ceilVec2(vector: Vec2Like, fractionDigits: number = 0): vec2 {
    return vec2.fromValues(Math.ceil(vector[0]), Math.ceil(vector[1]))
}

export function floorVec2(vector: Vec2Like, fractionDigits: number = 0): vec2 {
    return vec2.fromValues(Math.floor(vector[0]), Math.floor(vector[1]))
}

export function movePoint(point: Vec2Like, direction: Vec2Like, factor = 1): vec2 {
    return vec2.fromValues(point[0] + factor * direction[0], point[1] + factor * direction[1])
}

export function roundRect(rect: Rect, fractionDigits: number = 0): Rect {
    return {
        x: round(rect.x, fractionDigits),
        y: round(rect.y, fractionDigits),
        width: round(rect.width, fractionDigits),
        height: round(rect.height, fractionDigits)
    }
}

export function transformRect(rect: Rect, matrix: mat4): Rect {
    const point1 = cornerPointOfRect(rect, 'nw')
    vec2.transformMat4(point1, point1, matrix)
    const point2 = cornerPointOfRect(rect, 'se')
    vec2.transformMat4(point2, point2, matrix)
    return rectFromPoints(point1, point2)
}

export function rectFromPoints(point1: Vec2Like, point2: Vec2Like): Rect {
    return {
        x: Math.min(point1[0], point2[0]),
        y: Math.min(point1[1], point2[1]),
        width: Math.abs(point1[0] - point2[0]),
        height: Math.abs(point1[1] - point2[1])
    }
}

export function rectFromCenterAndSize(center: Vec2Like, size: Size): Rect {
    const width = Math.abs(size.width)
    const height = Math.abs(size.height)
    return {
        x: center[0] - width / 2,
        y: center[1] - height / 2,
        width,
        height
    }
}

export function rectFromCornerPointAndSize(cornerPoint: Vec2Like, size: Size): Rect {
    return {
        x: size.width > 0 ? cornerPoint[0] : cornerPoint[0] + size.width,
        y: size.height > 0 ? cornerPoint[1] : cornerPoint[1] + size.height,
        width: Math.abs(size.width),
        height: Math.abs(size.height)
    }
}

export function centerOfRect(rect: Rect): vec2 {
    return vec2.fromValues(rect.x + rect.width / 2, rect.y + rect.height / 2)
}

export function cornerPointOfRect(rect: Rect, corner: Corner): vec2 {
    const x = (corner === 'nw' || corner === 'sw') ? rect.x : (rect.x + rect.width)
    const y = (corner === 'nw' || corner === 'ne') ? rect.y : (rect.y + rect.height)
    return vec2.fromValues(x, y)
}

/**
 * Returns a rect covering `rect1` and `rect2`.
 */
export function boundsOfRects(rect1: Rect, rect2: Rect): Rect {
    const rect1Right = rect1.x + rect1.width
    const rect1Bottom = rect1.y + rect1.height
    const rect2Right = rect2.x + rect2.width
    const rect2Bottom = rect2.y + rect2.height
    if (rect1.x <= rect2.x && rect1.y <= rect2.y && rect1Right >= rect2Right && rect1Bottom >= rect2Bottom) {
        // rect1 covers rect2
        return rect1
    } else if (rect2.x <= rect1.x && rect2.y <= rect1.y && rect2Right >= rect1Right && rect2Bottom >= rect1Bottom) {
        // rect2 covers rect1
        return rect2
    } else {
        const minX = Math.min(rect1.x, rect2.x)
        const minY = Math.min(rect1.y, rect2.y)
        return {
            x: minX,
            y: minY,
            width: Math.max(rect1Right, rect2Right) - minX,
            height: Math.max(rect1Bottom, rect2Bottom) - minY,
        }
    }
}

export function boundsOfPoints(points: Vec2Like[]): Rect {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const point of points) {
        if (point[0] < minX) minX = point[0]
        if (point[0] > maxX) maxX = point[0]
        if (point[1] < minY) minY = point[1]
        if (point[1] > maxY) maxY = point[1]
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function scaleSize(size: Size, factor: number): Size {
    if (factor === 1) {
        return size
    } else {
        return { width: size.width * factor, height: size.height * factor }
    }
}

export function directionOfPoints(start: Vec2Like, end: Vec2Like): vec2 {
    return vec2.fromValues(end[0] - start[0], end[1] - start[1])
}

export function intersectLines(start1: Vec2Like, direction1: Vec2Like, start2: Vec2Like, direction2: Vec2Like, outFactors: number[]) {
    intersectLinesPlain(start1[0], start1[1], direction1[0], direction1[1], start2[0], start2[1], direction2[0], direction2[1], outFactors)
}

export function intersectLinesPlain(startX1: number, startY1: number, directionX1: number, directionY1: number,
    startX2: number, startY2: number, directionX2: number, directionY2: number, outFactors: number[])
{
    const f = directionX2*directionY1 - directionX1*directionY2
    if (f == 0) {
        outFactors[0] = NaN
        outFactors[1] = NaN
    } else {
        const vX3 = startX2 - startX1, vY3 = startY2 - startY1
        outFactors[0] = (directionX2*vY3 - vX3*directionY2)/f
        outFactors[1] = (directionX1*vY3 - vX3*directionY1)/f
    }
}

export function isPointInPolygon(point: Vec2Like, polygonPoints: Vec2Like[]): boolean {
    // Original code from: https://github.com/substack/point-in-polygon/blob/master/index.js
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    let x = point[0], y = point[1]

    let inside = false
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
        const xi = polygonPoints[i][0], yi = polygonPoints[i][1]
        const xj = polygonPoints[j][0], yj = polygonPoints[j][1]

        const intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
    }

    return inside
}

export function squareDistanceOfPoints(point1: Vec2Like, point2: Vec2Like): number {
    const distX = point2[0] - point1[0]
    const distY = point2[1] - point1[1]
    return distX*distX + distY*distY
}

/**
 * Finds the nearest point on a line.
 * Returns `null` if `lineDirection` is `[0, 0]`
 */
export function nearestPointOnLine(point: Vec2Like, lineStart: Vec2Like, lineDirection: Vec2Like): vec2 | null {
    if (!lineDirection[0] && !lineDirection[1]) {
        // This line is no real line -> Return `null` (and avoid division by 0)
        return null
    }
    const [ bx, by ] = lineDirection
    const vx = point[0] - lineStart[0]
    const vy = point[1] - lineStart[1]
    const t = (vx*bx + vy*by) / (bx*bx + by*by)
    return vec2.fromValues(
        lineStart[0] + t*bx,
        lineStart[1] + t*by
    )
}

/**
 * Finds the nearest point on a polygon.
 */
export function nearestPointOnPolygon(point: Vec2Like, polygonPoints: Vec2Like[]): vec2 {
    let minSquareDistance: number | null = null
    let bx: number, by: number, vx: number, vy: number, t: number, nx: number, ny: number, distX: number, distY: number,
        squareDistance: number, nearestX = 0, nearestY = 0, nearestSegmentIndex = 0

    const polygonSize = polygonPoints.length
    for (let i = 0, j = polygonSize - 1; i < polygonSize; j = i++) {
        const segmentStart = polygonPoints[i]
        const segmentEnd = polygonPoints[j]

        bx = segmentEnd[0] - segmentStart[0]
        by = segmentEnd[1] - segmentStart[1]
        if (bx == 0 && by == 0) {
            // This segment has the same start and end point
            // -> Ignore it (and avoid division by 0)
            continue
        }
        vx = point[0] - segmentStart[0]
        vy = point[1] - segmentStart[1]
        t = (vx*bx + vy*by) / (bx*bx + by*by)
        if (t <= 0) {
            nx = segmentStart[0]
            ny = segmentStart[1]
        } else if (t >= 1) {
            nx = segmentEnd[0]
            ny = segmentEnd[1]
        } else {
            nx = segmentStart[0] + t*bx
            ny = segmentStart[1] + t*by
        }
        distX = point[0] - nx
        distY = point[1] - ny
        squareDistance = distX*distX + distY*distY
        if (minSquareDistance == null || squareDistance < minSquareDistance) {
            minSquareDistance = squareDistance
            nearestX = nx
            nearestY = ny
            nearestSegmentIndex = i
        }
    }

    return vec2.fromValues(nearestX, nearestY)
}

export function intersectLineWithPolygon(lineStart: Vec2Like, lineDirection: Vec2Like, polygonPoints: Vec2Like[]): number[] {
    const result: number[] = []

    const intersectOutFactors: number[] = []
    const polygonSize = polygonPoints.length
    for (let i = 0, j = polygonSize - 1; i < polygonSize; j = i++) {
        const segmentStart = polygonPoints[i]
        const segmentEnd = polygonPoints[j]
        const segmentDirection = directionOfPoints(segmentStart, segmentEnd)
        intersectLines(segmentStart, segmentDirection, lineStart, lineDirection, intersectOutFactors)
        if (intersectOutFactors[0] >= 0 && intersectOutFactors[0] <= 1) {
            // The line cuts this segment
            result.push(intersectOutFactors[1])
        }
    }

    result.sort(compareNumbers)
    return result
}

function compareNumbers(a: number, b: number): number {
    return a - b
}

/**
 * Scales a rect to fit into a rotated version of itself (same center and same size).
 */
export function scaleRectToFitBorders(rectCenter: Vec2Like | Point, maxRectSize: Size, rotatedRectPolygon: Vec2Like[]): Rect {
    if (isPoint(rectCenter)) {
        rectCenter = toVec2(rectCenter)
    }

    let outFactors: number[]
    outFactors = intersectLineWithPolygon(rectCenter, [maxRectSize.width / 2, maxRectSize.height / 2], rotatedRectPolygon)
    let minFactor = outFactors.reduce((minFactor, factor) => Math.min(minFactor, Math.abs(factor)), 1)
    outFactors = intersectLineWithPolygon(rectCenter, [maxRectSize.width / 2, -maxRectSize.height / 2], rotatedRectPolygon)
    minFactor = outFactors.reduce((minFactor, factor) => Math.min(minFactor, Math.abs(factor)), minFactor)
    return roundRect(rectFromCenterAndSize(rectCenter, scaleSize(maxRectSize, minFactor)))
}
