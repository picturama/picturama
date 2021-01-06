import { PhotoId, TagId, TagById, Device, PhotoSectionId, PhotoSectionById, Settings, UiConfig, PhotoDetail, PhotoWork, ImportProgress, PhotoFilter, PhotoExportOptions, PhotoExportProgress, MetaData, ExifData, Photo} from 'common/CommonTypes'
import { FetchState } from 'app/UITypes'


export type AppState = {
    navigation: NavigationState
    data: DataState
    library: LibraryState
    detail: DetailState
    info: InfoState
    import: ImportState
    export: ExportState
}


export type NavigationState = {
    devicePixelRatio: number
    hasWebGLSupport: boolean
    isFullScreen: boolean
    isShiftPressed: boolean
    mainView: MainViewState
}

export type MainViewState = 'settings' | 'detail' | null


export type DataState = {
    readonly uiConfig: UiConfig
    readonly settings: Settings
    readonly tags: TagsState
    readonly devices: DevicesState
    readonly sections: SectionsState
}


export interface LibraryState {
    readonly display: DisplayState
    readonly filter: PhotoFilter
    /**
     * The active photo. This is the photo on which the last action was performed
     * (like viewing in detail, selecting or deseleting).
     * 
     * The active photo ...
     *   - acts as anchor for shift-(de)selection
     *   - has the keyboard focus
     */
    readonly activePhoto: PhotoLibraryPosition | null
    /** The photo over which the mouse is currently hovering */
    readonly hoverPhoto: PhotoLibraryPosition | null
    readonly selection: SelectionState | null
}

export interface DisplayState {
    /** The target row height of the grid. The grid won't hit this value exactly, as it depends on the layout. */
    readonly gridRowHeight: number
}

/**
 * The position of a photo in the library view
 */
export interface PhotoLibraryPosition {
    sectionId: PhotoSectionId
    photoId: PhotoId
}

export interface SelectionState {
    readonly totalSelectedCount: number
    readonly sectionSelectionById: { [K in PhotoSectionId]?: SectionSelectionState }
}

export interface SectionSelectionState {
    readonly sectionId: PhotoSectionId
    readonly selectedCount: number
    readonly selectedPhotosById: 'all' | { [K in PhotoId]?: true }
}

export type PhotoCollection = Photo | Photo[] | PhotoLibraryPosition | SelectionState

export interface PreselectionRange {
    selected: boolean
    startSectionIndex: number
    startPhotoIndex: number
    endSectionIndex: number
    endPhotoIndex: number
}

export type SectionPreselection = 'all' | 'none' | { selected: boolean, startPhotoIndex: number, endPhotoIndex: number }


export type TagsState = {
    readonly ids: TagId[]
    readonly byId: TagById
}

export type DevicesState = Device[]

export type SectionsState = {
    readonly fetchState: FetchState
    /** The total number of photos (when no filter is applied). Is null before fetched for the first time. */
    readonly totalPhotoCount: number | null
    /** The number of photos with the current filter applied */
    readonly photoCount: number
    readonly ids: PhotoSectionId[]
    readonly byId: PhotoSectionById
}


export type DetailState = {
    readonly currentPhoto: {
        readonly fetchState: FetchState
        readonly sectionId: PhotoSectionId
        readonly photoIndex: number
        readonly photoId: PhotoId
        /** Is `null` while loading */
        readonly photoWork: PhotoWork | null
    }
} | null


export interface InfoState {
    readonly showInLibrary: boolean
    readonly showInDetail: boolean
    readonly photoData?: InfoPhotoData
}

export interface InfoPhotoData {
    fetchState: FetchState
    sectionId: PhotoSectionId
    photoId: PhotoId
    /** Is `null` while loading */
    photoDetail: PhotoDetail | null
    masterFileSize: number | null
    metaData: MetaData | null
    exifData: ExifData | null
}


export type ImportState = {
    readonly progress: ImportProgress
} | null


export type ExportState = {
    readonly photos: PhotoCollection
    readonly exportOptions: PhotoExportOptions
    readonly showRemoveInfoDesc: boolean
    readonly progress: PhotoExportProgress | null
} | null
