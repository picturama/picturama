import { action, createAsyncAction } from 'typesafe-actions'

import { PhotoId, Photo, Tag, Device, PhotoDetail, PhotoWork, PhotoSection, PhotoSectionId, PhotoSet, PhotoFilter, Settings, UiConfig, PhotoExportOptions, PhotoExportProgress, ExifData, MetaData } from 'common/CommonTypes'
import { ImportProgress } from 'common/CommonTypes'

import {
    INIT, SET_WEB_GL_SUPPORT, SET_DEVICE_PIXEL_RATIO, SET_FULL_SCREEN, OPEN_SETTINGS, SET_SETTINGS, CLOSE_SETTINGS, SET_GRID_ROW_HEIGHT,
    SET_DETAIL_PHOTO, FETCH_DETAIL_PHOTO_DATA_REQUEST, FETCH_DETAIL_PHOTO_DATA_SUCCESS, FETCH_DETAIL_PHOTO_DATA_FAILURE,
    CLOSE_DETAIL, SET_LIBRARY_ACTIVE_PHOTO, SET_LIBRARY_SELECTION, FETCH_TOTAL_PHOTO_COUNT, FETCH_SECTIONS_REQUEST,
    FETCH_SECTIONS_SUCCESS, FETCH_SECTIONS_FAILURE,
    FETCH_SECTION_PHOTOS, FORGET_SECTION_PHOTOS,
    CHANGE_PHOTOWORK, CHANGE_PHOTOS, EMPTY_TRASH, SET_SHOW_INFO, SET_INFO_PHOTO_DATA, SET_INFO_PHOTO_DATA_FAILURE,
    SET_IMPORT_PROGRESS, FETCH_TAGS, SET_PHOTO_TAGS,
    INIT_DEVICES, ADD_DEVICE, REMOVE_DEVICE, OPEN_EXPORT, CLOSE_EXPORT, SET_EXPORT_OPTIONS,
    TOGGLE_SHOW_EXPORT_REMOVE_INFO_DESC, SET_EXPORT_PROGRESS
} from './actionTypes'
import { PhotoCollection, PhotoLibraryPosition, SelectionState } from './StateTypes'


export const initAction = (uiConfig: UiConfig, settings: Settings) => action(INIT, { uiConfig, settings })
export const setWebGLSupport = (hasWebGLSupport: boolean) => action(SET_WEB_GL_SUPPORT, hasWebGLSupport)
export const setDevicePixelRatioAction = (devicePixelRatio: number) => action(SET_DEVICE_PIXEL_RATIO, devicePixelRatio)
export const setFullScreenAction = (isFullScreen: boolean) => action(SET_FULL_SCREEN, isFullScreen)
export const openSettingsAction = () => action(OPEN_SETTINGS)
export const setSettingsAction = (settings: Settings) => action(SET_SETTINGS, settings)
export const closeSettingsAction = () => action(CLOSE_SETTINGS)

export const setGridRowHeightAction = (gridRowHeight: number) => action(SET_GRID_ROW_HEIGHT, { gridRowHeight })

export const setDetailPhotoAction = (sectionId: PhotoSectionId, photoIndex: number, photoId: PhotoId) => action(SET_DETAIL_PHOTO, { sectionId, photoIndex, photoId })
export const fetchDetailPhotoDataAction = createAsyncAction(FETCH_DETAIL_PHOTO_DATA_REQUEST, FETCH_DETAIL_PHOTO_DATA_SUCCESS, FETCH_DETAIL_PHOTO_DATA_FAILURE)<{ photoId: PhotoId }, { photoId: PhotoId, photoWork: PhotoWork }, { photoId: PhotoId, error: Error }>()
export const closeDetailAction = () => action(CLOSE_DETAIL)

export const setLibraryActivePhotoAction = (activePhoto: PhotoLibraryPosition | null) => action(SET_LIBRARY_ACTIVE_PHOTO, activePhoto)
export const setLibrarySelectionAction = (selection: SelectionState | null, activePhoto?: PhotoLibraryPosition) => action(SET_LIBRARY_SELECTION, { selection, activePhoto })

export const fetchTotalPhotoCountAction = (totalPhotoCount: number) => action(FETCH_TOTAL_PHOTO_COUNT, { totalPhotoCount })
export const fetchSectionsAction = createAsyncAction(FETCH_SECTIONS_REQUEST, FETCH_SECTIONS_SUCCESS, FETCH_SECTIONS_FAILURE)<{ newFilter: PhotoFilter | null }, { sections: PhotoSection[] }, Error>()
export const fetchSectionPhotosAction = (sectionIds: PhotoSectionId[], photoSets: PhotoSet[]) => action(FETCH_SECTION_PHOTOS, { sectionIds, photoSets })
export const forgetSectionPhotosAction = (sectionIds: { [index: string]: true }) => action(FORGET_SECTION_PHOTOS, { sectionIds })
export const changePhotoWorkAction = (photoId: PhotoId, photoWork: PhotoWork) => action(CHANGE_PHOTOWORK, { photoId, photoWork })
export const changePhotosAction = (photos: Photo[], update: Partial<Photo>) => action(CHANGE_PHOTOS, { photos, update })
export const emptyTrashAction = (trashedPhotoIds: PhotoId[]) => action(EMPTY_TRASH, { trashedPhotoIds })

export const setShowInfoAction = (view: 'library' | 'detail', showInfo: boolean) => action(SET_SHOW_INFO, { view, showInfo })
export const setInfoPhotoDataAction = (payload: { photoId: PhotoId, photoDetail: PhotoDetail, masterFileSize: number, metaData: MetaData, exifData: ExifData | null }) => action(SET_INFO_PHOTO_DATA, payload)
export const setInfoPhotoDataFailureAction = (photoId: PhotoId) => action(SET_INFO_PHOTO_DATA_FAILURE, { photoId })

export const setImportProgressAction = (progress: ImportProgress | null) => action(SET_IMPORT_PROGRESS, progress)

export const fetchTagsAction = (tags: Tag[]) => action(FETCH_TAGS, tags)
export const setPhotoTagsAction = (photoId: PhotoId, tags: string[]) => action(SET_PHOTO_TAGS, { photoId, tags })

export const initDevicesAction = (devices: Device[]) => action(INIT_DEVICES, { devices })
export const addDeviceAction = (device: Device) => action(ADD_DEVICE, { device })
export const removeDeviceAction = (device: Device) => action(REMOVE_DEVICE, { device })

export const openExportAction = (photos: PhotoCollection) => action(OPEN_EXPORT, { photos })
export const closeExportAction = () => action(CLOSE_EXPORT)
export const setExportOptionsAction = (options: PhotoExportOptions) => action(SET_EXPORT_OPTIONS, options)
export const toggleShowExportRemoveInfoDescAction = () => action(TOGGLE_SHOW_EXPORT_REMOVE_INFO_DESC)
export const setExportProgressAction = (progress: PhotoExportProgress) => action(SET_EXPORT_PROGRESS, progress)
