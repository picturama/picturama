import { vec2 } from 'gl-matrix'

import { Rect, corners } from 'app/util/GeometryTypes'
import { cornerPointOfRect, Vec2Like, directionOfPoints, nearestPointOnLine, squareDistanceOfPoints, movePoint, intersectLines } from 'app/util/GeometryUtil'


/**
 * Creates a polygon which describes the area where the the left-top corner of `rect` can be moved
 * (while keeping its size) in order to keep the rect in `polygon`.
 * `rect` must be inside `polygon`.
 */
export function createDragRectFencePolygon(rect: Rect, polygon: Vec2Like[]): vec2[] {
    // Choose a reference point
    // This could be any point. We use the left-top corner of `rect` so it's easy to create the moved rect.
    const referencePoint = cornerPointOfRect(rect, 'nw')

    // Step 1: Treat each segment of `polygon` as a line. Move that line towards the `rect` until it works as a fence.

    // Content of fenceLines: [ start1, direction1, start2, direction2, ... ]
    const fenceLines: vec2[] = []

    const polygonSize = polygon.length
    for (let i = 0; i < polygonSize; i++) {
        const segmentStart = polygon[i]
        const segmentEnd = polygon[(i + 1) % polygonSize]
        const segmentDirection = directionOfPoints(segmentStart, segmentEnd)

        // Find the corner which would violate `polygon` first. This is the corner which is the nearest to our segment line
        let minSquareDistance = Number.POSITIVE_INFINITY
        let nearestCornerPoint = referencePoint
        for (const corner of corners) {
            const cornerPoint = cornerPointOfRect(rect, corner)
            const nearestPoint = nearestPointOnLine(cornerPoint, segmentStart, segmentDirection)
            if (nearestPoint) {
                const squareDistance = squareDistanceOfPoints(cornerPoint, nearestPoint)
                if (squareDistance < minSquareDistance) {
                    minSquareDistance = squareDistance
                    nearestCornerPoint = cornerPoint
                }
            }
        }

        // Get the direction we have to move the segment line in order to get a fence for the reference point:
        //   - Lay a parallel to the segment line through `nearestCornerPoint`
        //   - Find the nearest point on the parallel to the reference point
        //   - The direction from that point to the reference point is the direction we have to move the segment line
        const nearestOnParallel = nearestPointOnLine(referencePoint, nearestCornerPoint, segmentDirection)
        const fenceDirection: Vec2Like = nearestOnParallel ? directionOfPoints(nearestOnParallel, referencePoint) : [0,0]

        // Add the fence line
        const fenceStart = movePoint(segmentStart, fenceDirection)
        fenceLines.push(fenceStart, segmentDirection)
    }

    // Step 2: Create a polygon from the cut points of the fence lines.

    const result: vec2[] = []
    const outFactors: number[] = []
    for (let i = 0, j = polygonSize - 1; i < polygonSize; j = i++) {
        const fenceStart1 = fenceLines[i*2]
        const fenceDirection1 = fenceLines[i*2 + 1]
        const fenceStart2 = fenceLines[j*2]
        const fenceDirection2 = fenceLines[j*2 + 1]

        intersectLines(fenceStart1, fenceDirection1, fenceStart2, fenceDirection2, outFactors)
        result.push(movePoint(fenceStart1, fenceDirection1, outFactors[0]))
    }

    return result
}
