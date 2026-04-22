// Mirrors src-tauri/src/geometry_types.rs

export interface Point {
    x: number
    y: number
}
export const zeroPoint: Point = { x: 0, y: 0 }

export interface Size {
    width: number
    height: number
}
export const zeroSize: Size = { width: 0, height: 0 }
export function isSize(obj: any): obj is Size {
    return obj && typeof obj.width === 'number' && typeof obj.height === 'number'
}

export type Rect = Point & Size
export const zeroRect: Rect = { x: 0, y: 0, width: 0, height: 0 }

export type Corner = 'nw' | 'ne' | 'sw' | 'se'
export const corners: Corner[] = [ 'nw', 'ne', 'sw', 'se' ]

export type Side = 'n' | 'e' | 's' | 'w'
export const sides: Side[] = [ 'n', 'e', 's', 'w' ]

export interface Insets {
    left: number
    top: number
    right: number
    bottom: number
}
export const zeroInsets: Insets = { left: 0, top: 0, right: 0, bottom: 0 }
