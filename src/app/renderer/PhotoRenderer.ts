import { Photo, PhotoWork, PhotoRenderOptions, PhotoRenderFormat, ExifOrientation } from 'common/CommonTypes'
import { CameraMetricsBuilder } from 'common/util/CameraMetrics'
import { getNonRawUrl, getMasterPath } from 'common/util/DataUtil'
import { assertRendererProcess } from 'common/util/ElectronUtil'
import { Size } from 'common/util/GeometryTypes'
import SerialJobQueue from 'common/util/SerialJobQueue'
import Profiler from 'common/util/Profiler'

import { updatePhoto } from 'app/controller/PhotoController'

import PhotoCanvas from './PhotoCanvas'


assertRendererProcess()


interface RenderJob {
    nonRawUrl: string
    photo: Photo
    photoWork: PhotoWork
    maxSize: Size | null
    options: PhotoRenderOptions
    profiler: Profiler | null
}

const queue = new SerialJobQueue(
    (newJob, existingJob) => (newJob.nonRawUrl === existingJob.nonRawUrl) ? newJob : null,
    renderNext)


let cameraMetricsBuilder = new CameraMetricsBuilder()
let canvas: PhotoCanvas | null = null

const mimeTypeByFormat: { [K in PhotoRenderFormat]: string } = {
    jpg:  'image/jpeg',
    webp: 'image/webp',
    png:  'image/png',
}


export async function renderPhoto(photo: Photo, photoWork: PhotoWork, maxSize: Size | null, options: PhotoRenderOptions,
    profiler: Profiler | null = null): Promise<string>
{
    const nonRawUrl = getNonRawUrl(photo)
    return queue.addJob({ nonRawUrl: nonRawUrl, photo, photoWork, maxSize, options, profiler })
}


async function renderNext(job: RenderJob): Promise<string> {
    const { nonRawUrl, photo, photoWork, options, profiler } = job
    if (profiler) profiler.addPoint('Waited in queue')

    if (canvas === null) {
        canvas = new PhotoCanvas()
        if (profiler) profiler.addPoint('Created canvas')
    }

    const texture = await canvas.createTextureFromSrc(nonRawUrl, profiler)

    // Get camera metrics
    const cameraMetrics = cameraMetricsBuilder
        .setCanvasCssSize(job.maxSize)
        .setAdjustCanvasSize(job.maxSize !== null)
        .setTextureSize({ width: texture.width, height: texture.height })
        .setExifOrientation(photo.orientation)
        .setPhotoWork(photoWork)
        .getCameraMetrics()

    // Update photo size in DB (asynchronously)
    const { cropRect } = cameraMetrics
    const switchMasterSides = (photo.orientation == ExifOrientation.Left) || (photo.orientation == ExifOrientation.Right)
    const master_width = switchMasterSides ? texture.height : texture.width
    const master_height = switchMasterSides ? texture.width : texture.height
    const masterSizeIsWrong = photo.master_width !== master_width || photo.master_height !== master_height
    if (masterSizeIsWrong || photo.edited_width !== cropRect.width || photo.edited_height !== cropRect.height) {
        if (masterSizeIsWrong) {
            console.info(`Correcting master size of #${photo.id} (${getMasterPath(photo)}) from ${photo.master_width}x${photo.master_height} to ${master_width}x${master_height}`)
        }
        updatePhoto(photo, { master_width, master_height, edited_width: cropRect.width, edited_height: cropRect.height })
    }
    if (profiler) profiler.addPoint('Checked photo size in DB')

    // Render thumbnail
    canvas
        .setBaseTexture(texture)
        .setCssSize(cameraMetrics.canvasCssSize)
        .setProjectionMatrix(cameraMetrics.projectionMatrix)
        .setCameraMatrix(cameraMetrics.cameraMatrix)
        .update()
    if (profiler) profiler.addPoint('Rendered canvas')

    if (!canvas.isValid()) {
        throw new Error('Photo rendering canvas not valid')
    }

    const dataUrl = canvas.getElement().toDataURL(mimeTypeByFormat[options.format], options.quality)
    if (profiler) profiler.addPoint('Encoded thumbnail to data URL')
    return dataUrl
}
