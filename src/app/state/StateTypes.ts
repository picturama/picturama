import { PhotoId, TagId, TagById, Device, PhotoSectionId, PhotoSectionById, Settings, UiConfig, PhotoDetail, PhotoWork, ImportProgress, PhotoFilter, PhotoExportOptions, PhotoExportProgress} from 'common/CommonTypes'
import { FetchState } from 'app/UITypes'


export type AppState = {
    navigation: NavigationState
    data: DataState
    library: LibraryState
    detail: DetailState
    import: ImportState
    export: ExportState
}


export type NavigationState = {
    devicePixelRatio: number
    isFullScreen: boolean
    hasWebGLSupport: boolean
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


export type LibraryState = {
    readonly display: DisplayState
    readonly filter: PhotoFilter
    readonly selection: SelectionState
    readonly info: InfoState
}

export type DisplayState = {
    /** The target row height of the grid. The grid won't hit this value exactly, as it depends on the layout. */
    readonly gridRowHeight: number
}

export type SelectionState = {
    readonly sectionId: PhotoSectionId | null
    readonly photoIds: PhotoId[]
}

export type InfoState = {
    readonly sectionId: PhotoSectionId
    readonly photoId: PhotoId
    /** Is `null` while loading */
    readonly photoDetail: PhotoDetail | null
} | null


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
        readonly photoDetail: PhotoDetail | null
        /** Is `null` while loading */
        readonly photoWork: PhotoWork | null
    }
} | null


export type ImportState = {
    readonly progress: ImportProgress
} | null


export type ExportState = {
    readonly sectionId: PhotoSectionId
    readonly photoIds: PhotoId[]
    readonly exportOptions: PhotoExportOptions
    readonly showRemoveInfoDesc: boolean
    readonly progress: PhotoExportProgress | null
} | null
