import { isShallowEqual } from 'common/util/LangUtil'

import BackgroundClient from 'app/BackgroundClient'
import PhotoCanvas from 'app/renderer/PhotoCanvas'
import { Texture } from 'app/renderer/WebGLCanvas'
import Profiler from 'common/util/Profiler'


export type TextureError = 'error-notExisting' | 'error-loading'


interface TextureInfo {
    imagePath: string
    texture: Texture
    lastUse: number
}

export interface TextureCacheOptions {
    canvas: PhotoCanvas
    maxCacheSize: number
    profile?: boolean
    /**
     * Will be called when a texture was fetched (or fetching failed)
     *
     * @param imagePath The path of the fetched image
     * @param texture The texture - is `null` if fetching failed
     */
    onTextureFetched(imagePath: string, texture: Texture | null): void
}

export default class TextureCache {

    private imagePathsToFetch: (string | null)[]
    private isLoadingTexture = false
    private textureErrors: { [key: string]: TextureError } = {}
    private textureCache: { [key: string]: TextureInfo } = {}


    constructor(private options: TextureCacheOptions) {
        this.imagePathsToFetch = []
    }

    setImagesToFetch(imagePathsToFetch: (string | null)[]) {
        if (imagePathsToFetch.length > this.options.maxCacheSize) {
            throw new Error(`imagePathsToFetch (${imagePathsToFetch.length}) exceeds maxCacheSize (${this.options.maxCacheSize})`)
        }

        if (isShallowEqual(imagePathsToFetch, this.imagePathsToFetch)) {
            return
        }

        this.textureErrors = {}
        this.imagePathsToFetch = imagePathsToFetch
        this.tryToFetchTextures()
    }

    getTextureError(imagePath: string): TextureError | null {
        return this.textureErrors[imagePath] || null
    }

    getTexture(imagePath: string): Texture | null {
        const textureInfo = this.textureCache[imagePath]
        if (textureInfo) {
            textureInfo.lastUse = Date.now()
            return textureInfo.texture
        } else {
            return null
        }
    }

    private tryToFetchTextures() {
        for (const imagePath of this.imagePathsToFetch) {
            this.tryToFetchTexture(imagePath)
        }
    }

    private tryToFetchTexture(imagePath?: string | null) {
        if (!imagePath || this.isLoadingTexture || this.textureCache[imagePath] || this.textureErrors[imagePath]) {
            return
        }

        this.isLoadingTexture = true
        this.fetchTexture(imagePath)
            .catch(error => {
                console.error(`Loading ${imagePath} failed`, error)
            })
            .then(() => {
                this.isLoadingTexture = false
                this.tryToFetchTextures()
            })
    }

    private async fetchTexture(imagePath: string): Promise<Texture> {
        try {
            const { textureCache } = this

            const profiler = this.options.profile ? new Profiler(`Fetching texture for ${imagePath}`) : null

            const texture = await this.options.canvas.createTextureFromFile(imagePath, profiler)
            if (profiler) profiler.addPoint('Loaded texture')
            textureCache[imagePath] = { imagePath, texture, lastUse: Date.now() }

            const cachedImagePaths = Object.keys(textureCache)
            if (cachedImagePaths.length > this.options.maxCacheSize) {
                let oldestTextureInfo: TextureInfo | null = null
                for (const imagePath of cachedImagePaths) {
                    const textureInfo = textureCache[imagePath]
                    if (!oldestTextureInfo || textureInfo.lastUse < oldestTextureInfo.lastUse) {
                        oldestTextureInfo = textureInfo
                    }
                }
                if (oldestTextureInfo) {
                    oldestTextureInfo.texture.destroy()
                    delete textureCache[oldestTextureInfo.imagePath]
                }
                if (profiler) profiler.addPoint('Removed obsolete textures from cache')
            }

            this.options.onTextureFetched(imagePath, texture)
            if (profiler) profiler.addPoint('Called onTextureProcessed')

            if (profiler) profiler.logResult()
            return texture
        } catch (error) {
            const imageFileExists = await BackgroundClient.fileExists(imagePath)

            this.textureErrors[imagePath] = imageFileExists ? 'error-loading' : 'error-notExisting'
            this.options.onTextureFetched(imagePath, null)

            throw error
        }
    }

}
