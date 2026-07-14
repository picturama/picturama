import { intersectLinesPlain, Vec2Like, intersectLineWithPolygon } from 'app/util/GeometryUtil'


test('test intersectLines', () => {
    const outFactors: number[] = []

    // Test two normal lines
    intersectLinesPlain(1,2,4,0, 2,1,0,2, outFactors)
    expect(outFactors.length).toBe(2)
    expect(outFactors[0]).toBe(0.25)
    expect(outFactors[1]).toBe(0.5)

    // Test two lines which don't intersect (expect factors outside 0..1)
    intersectLinesPlain(1,2,4,0, 6,3,0,2, outFactors)
    expect(outFactors.length).toBe(2)
    expect(outFactors[0]).toBe(1.25)
    expect(outFactors[1]).toBe(-0.5)

    // Test two parallel lines
    intersectLinesPlain(0,0,2,2, 2,1,1,1, outFactors)
    expect(outFactors.length).toBe(2)
    expect(outFactors[0]).toBe(NaN)
    expect(outFactors[1]).toBe(NaN)
})


test('test intersectLineWithPolygon', () => {
    const polygon: Vec2Like[] = [
        [1, 1],
        [1, 3],
        [3, 5],
        [5, 1],
    ]

    // Test line inside polygon
    expect(intersectLineWithPolygon([3,2], [1,0], polygon)).toEqual([-2, 1.5])

    // Test line outside polygon
    expect(intersectLineWithPolygon([2,5], [0,2], polygon)).toEqual([-2, -0.5])

    // Test line not cutting the polygon
    expect(intersectLineWithPolygon([0,0], [3,0], polygon)).toEqual([])

    // Test line intersecting the polygon (expect one factor to be in 0..1)
    expect(intersectLineWithPolygon([2,2], [-2,0], polygon)).toEqual([-1.25, 0.5])

    // Test line intersecting the polygon at a node (expect two times the same factor)
    expect(intersectLineWithPolygon([5,3], [0,-1], polygon)).toEqual([2, 2])
})
