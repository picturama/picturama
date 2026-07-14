import BackgroundClient from 'app/BackgroundClient'
import { Photo, Tag } from 'app/CommonTypes'
import { fetchTagsAction, setPhotoTagsAction } from 'app/state/actions'
import store from 'app/state/store'
import { slug } from 'app/util/LangUtil'

import { updatePhotoWork } from './PhotoController'


export function setTags(tags: Tag[]) {
    store.dispatch(fetchTagsAction(tags))
}


export function fetchTags() {
    BackgroundClient.fetchTags()
        .then(tags => {
            setTags(tags)
        })
}


export async function setPhotoTags(photo: Photo, tags: string[]) {
    tags.sort((tag1, tag2) => slug(tag1) < slug(tag2) ? -1 : 1)

    store.dispatch(setPhotoTagsAction(photo.id, tags))

    const updatedTags = await BackgroundClient.storePhotoTags(photo.id, tags)

    if (updatedTags) {
        setTags(updatedTags)
    }

    updatePhotoWork(photo, photoWork => {
        if (!tags.length) {
            delete photoWork.tags
        } else {
            photoWork.tags = tags
        }
    })
}
