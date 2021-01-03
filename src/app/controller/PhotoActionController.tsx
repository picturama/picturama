import { Photo, PhotoWork } from 'common/CommonTypes'
import { assertRendererProcess } from 'common/util/ElectronUtil'

import { rotatePhotos, setPhotosFlagged, movePhotosToTrash, restorePhotosFromTrash, updatePhotoWork } from 'app/controller/PhotoController'
import { openExportAction } from 'app/state/actions'
import { PhotoCollection } from 'app/state/StateTypes'
import store from 'app/state/store'
import { walkLoadedPhotosOfCollection } from 'app/util/PhotoCollectionResolver'


assertRendererProcess()


export interface PhotoActionController {
    /**
     * Returns whether all photos of a collection are flagged.
     * This will only consider the first 1000 photos of loaded sections
     */
    getPhotosAreFlagged(photos: PhotoCollection | null | undefined): boolean
    openExport(photos: PhotoCollection): void
    updatePhotoWork(photo: Photo, update: (photoWork: PhotoWork) => void): void
    rotatePhotos(photos: PhotoCollection, turns: number): void
    setPhotosFlagged(photos: PhotoCollection, flag: boolean): void
    movePhotosToTrash(photos: PhotoCollection): void
    restorePhotosFromTrash(photos: PhotoCollection): void
}


const maxCheckedPhotoCount = 1000


export const defaultPhotoActionController: PhotoActionController = {
    getPhotosAreFlagged(photos: PhotoCollection | null | undefined): boolean {
        let result = true
        if (photos) {
            let checkedPhotoCount = 0
            walkLoadedPhotosOfCollection(photos,
                photo => {
                    if (!photo.flag) {
                        result = false
                        return false
                    } else {
                        checkedPhotoCount++
                        return checkedPhotoCount < maxCheckedPhotoCount
                    }
                })
        }

        return result
    },
    openExport(photos: PhotoCollection) {
        store.dispatch(openExportAction(photos))
    },
    updatePhotoWork,
    rotatePhotos,
    setPhotosFlagged,
    movePhotosToTrash,
    restorePhotosFromTrash,
}
