export enum FetchState { IDLE, FETCHING, FAILURE }

export type DateTree = { years: { id: string, months: { id: string, days: { id: string }[] }[] }[] }

/** The result of 'justified-layout' */
export interface JustifiedLayoutResult {
    containerHeight: number
    widowCount: number
    boxes: JustifiedLayoutBox[]
}
export interface JustifiedLayoutBox {
    aspectRatio: number
    left: number
    top: number
    width: number
    height: number
}

export interface GridSectionLayout {
    left: number
    top: number
    width: number
    height: number
    /** The index of the first photo to render (inclusive) */
    fromBoxIndex?: number
    /** The index of the last photo to render (exclusive) */
    toBoxIndex?: number
    boxes?: JustifiedLayoutBox[]
}

export interface GridLayout {
    /** The index of the first section to render (inclusive) */
    fromSectionIndex: number
    /** The index of the last section to render (exclusive) */
    toSectionIndex: number
    sectionLayouts: GridSectionLayout[]
}
