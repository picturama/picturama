import { shell } from 'electron'
import DB from 'sqlite3-helper/no-generators'

import { PhotoId, Photo, PhotoById, PhotoDetail, PhotoFilter, PhotoSection, PhotoSet, LoadedPhotoSection, PhotoSectionId, Version, Tag } from 'common/CommonTypes'
import { getThumbnailPath, getRenderedRawPath, getMasterPath } from 'common/util/DataUtil'

import ForegroundClient from 'background/ForegroundClient'
import { fsUnlinkIfExists } from 'background/util/FileUtil'

import { deleteTagsOfPhotos, fetchTags } from './TagStore'
import { removePhotoWork } from './PhotoWorkStore'
import { toSqlStringCsv } from 'background/util/DbUtil';


export async function fetchTotalPhotoCount(): Promise<number> {
    const photoCount = await DB().queryFirstCell<number>('select count(*) from photos;')
    return photoCount!
}


export async function fetchSections(filter: PhotoFilter, sectionIdsToKeepLoaded?: PhotoSectionId[]):
    Promise<PhotoSection[]>
{
    const filterWhere = createWhereForFilter(filter)
    const sql = `select date_section as id, date_section as title, count(*) as count from photos where ${filterWhere.sql} group by date_section order by date_section desc`
    const sections = await DB().query<PhotoSection>(sql, ...filterWhere.params)

    if (sectionIdsToKeepLoaded && sectionIdsToKeepLoaded.length) {
        const photos = await fetchSectionPhotos(sectionIdsToKeepLoaded, filter)

        const sectionPhotosById: { [K in PhotoSectionId]: PhotoSet } = {}
        for (let i = 0, il = sectionIdsToKeepLoaded.length; i < il; i++) {
            const sectionId = sectionIdsToKeepLoaded[i]
            sectionPhotosById[sectionId] = photos[i]
        }

        for (const section of sections) {
            const sectionPhotos = sectionPhotosById[section.id]
            if (sectionPhotos) {
                const loadedSection = section as LoadedPhotoSection
                loadedSection.photoIds = sectionPhotos.photoIds
                loadedSection.photoData = sectionPhotos.photoData
            }
        }
    }

    return sections
}


export async function fetchSectionPhotos(sectionIds: PhotoSectionId[], filter: PhotoFilter): Promise<PhotoSet[]> {
    if (!sectionIds.length) {
        return []
    }

    const result: PhotoSet[] = []
    const photoSetBySectionId: { [K in PhotoSectionId]: PhotoSet } = {}
    for (const sectionId of sectionIds) {
        const photoSet: PhotoSet = { photoIds: [], photoData: {} }
        result.push(photoSet)
        photoSetBySectionId[sectionId] = photoSet
    }

    const filterWhere = createWhereForFilter(filter)
    const allPhotos = await DB().query<Photo>(
        `select * from photos where date_section in (${toSqlStringCsv(sectionIds)}) and ${filterWhere.sql} order by created_at asc`,
        ...filterWhere.params)
    for (const photo of allPhotos) {
        const sectionId: PhotoSectionId = photo.date_section
        const photoSet = photoSetBySectionId[sectionId]
        if (!photoSet) {
            console.warn('Expected photoSet for section ' + sectionId)
            continue
        }
        photoSet.photoIds.push(photo.id)
        photoSet.photoData[photo.id] = photo
    }

    return result
}


function createWhereForFilter(filter: PhotoFilter): { sql: string, params: any[] } {
    let sql = 'trashed = ?'
    let params: any[] = [
        (filter.type === 'trash') ? 1 : 0
    ]

    if (filter.type === 'favorites') {
        sql += ' and flag = 1'
    }

    if (filter.type === 'tag') {
        sql += ' and id in (select photo_id from photos_tags where tag_id = ?)'
        params.push(filter.tagId)
    }

    return { sql, params }
}


export async function fetchPhotoDetail(photoId: PhotoId): Promise<PhotoDetail> {
    const [ tags, versions ] = await Promise.all([
        DB().queryColumn<string>('title', 'select title from tags where id in (select tag_id from photos_tags where photo_id = ?) order by slug', photoId),
        DB().query<Version>('select * from versions where photo_id = ? order by version', photoId)
    ])

    return { tags, versions } as PhotoDetail

    // TODO: Revive Legacy code of 'version' feature
    //const lastVersion = photo.versions[photo.versions.length - 1]
    //photo.non_raw = lastVersion.output || photo.non_raw
}


export async function updatePhotos(photoIds: PhotoId[], update: Partial<Photo>): Promise<void> {
    await Promise.all(photoIds.map(photoId =>
        DB().update<Photo>('photos', update, [ 'id = ?', photoId ])
    ))
}


export async function emptyTrash(): Promise<void> {
    const photosToDelete = await DB().query<{ id: PhotoId, master_dir: string, master_filename: string }>(
        'select id, master_dir, master_filename from photos where trashed = 1')

    const photoIds = photosToDelete.map(photo => photo.id)

    const shouldFetchTags = await deletePhotos(photoIds)

    for (const photo of photosToDelete) {
        shell.moveItemToTrash(getMasterPath(photo))
    }

    await Promise.all(photosToDelete.map(photo => removePhotoWork(photo.master_dir, photo.master_filename)))

    let updatedTags: Tag[] | null = null
    if (shouldFetchTags) {
        updatedTags = await fetchTags()
    }

    await ForegroundClient.onPhotoTrashed(photoIds, updatedTags)
}


export async function deletePhotos(photoIds: PhotoId[]): Promise<boolean> {
    if (!photoIds.length) {
        return false
    }

    let shouldFetchTags: boolean
    await DB().query('BEGIN')
    try {
        const photoIdsCsv = photoIds.join(',')

        shouldFetchTags = await deleteTagsOfPhotos(photoIds)
        await DB().run(`delete from versions where photo_id in (${photoIdsCsv})`)
        await DB().run(`delete from photos where id in (${photoIdsCsv})`)

        await DB().query('END')
    } catch (error) {
        console.error('Removing obsolete photos from DB failed', error)
        await DB().query('ROLLBACK')
        throw error
    }

    const deletePromises: Promise<any>[] = []
    for (const photoId of photoIds) {
        deletePromises.push(
            fsUnlinkIfExists(getThumbnailPath(photoId)),
            fsUnlinkIfExists(getRenderedRawPath(photoId)),
        )
    }
    await Promise.all(deletePromises)

    return shouldFetchTags
}
