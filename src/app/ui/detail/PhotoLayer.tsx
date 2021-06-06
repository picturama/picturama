import classNames from 'classnames'
import React from 'react'
import { findDOMNode } from 'react-dom'

import { CameraMetrics } from 'common/util/CameraMetrics'
import { Size } from 'common/util/GeometryTypes'
import { bindMany } from 'common/util/LangUtil'
import { profileDetailView } from 'common/LogConstants'

import PhotoCanvas from 'app/renderer/PhotoCanvas'
import { Texture } from 'app/renderer/WebGLCanvas'

import { DetailMode } from './DetailTypes'
import TextureCache, { TextureError } from './TextureCache'

import './PhotoLayer.less'


export type PhotoLayerLoadingState = 'loading' | 'done' | TextureError


export interface Props {
    className?: any
    style?: any
    mode: DetailMode
    /** The size of the detail body (in px) */
    bodySize: Size
    imagePath: string
    imagePathPrev: string | null
    imagePathNext: string | null
    cameraMetrics: CameraMetrics | null
    onLoadingStateChange(loadingState: PhotoLayerLoadingState): void
    onTextureChange(textureSize: Size): void
}

export default class PhotoLayer extends React.Component<Props> {

    private canvas: PhotoCanvas | null = null
    private textureCache: TextureCache | null = null

    private canvasImagePath: string | null = null
    private deferredHideCanvasTimeout: NodeJS.Timer | null

    private prevLoadingState: PhotoLayerLoadingState | null = null


    constructor(props: Props) {
        super(props)
        bindMany(this, 'onTextureFetched')
    }

    componentDidMount() {
        this.canvas = new PhotoCanvas()
        const canvasElem = this.canvas.getElement()
        canvasElem.className = 'PhotoLayer-canvas'
        canvasElem.style.display = 'none'
        const mainElem = findDOMNode(this.refs.main) as HTMLDivElement
        mainElem.appendChild(canvasElem)

        this.textureCache = new TextureCache({
            canvas: this.canvas,
            maxCacheSize: 5,
            profile: profileDetailView,
            onTextureFetched: this.onTextureFetched
        })

        this.updateCanvas({})
    }

    componentWillUnmount() {
        if (this.canvas) {
            const canvasElem = this.canvas.getElement()
            canvasElem.parentNode!.removeChild(canvasElem)
            this.canvas = null
        }
    }

    componentDidUpdate(prevProps: Props) {
        this.updateCanvas(prevProps)
    }

    private setLoadingState(loadingState: PhotoLayerLoadingState) {
        if (loadingState !== this.prevLoadingState) {
            this.prevLoadingState = loadingState
            this.props.onLoadingStateChange(loadingState)
        }
    }

    private onTextureFetched(imagePath: string, texture: Texture | null) {
        if (imagePath === this.props.imagePath && texture) {
            this.props.onTextureChange({ width: texture.width, height: texture.height })
        }
        this.updateCanvas(this.props)
    }

    private updateCanvas(prevProps: Partial<Props>) {
        const { props, canvas, textureCache } = this
        if (!canvas || !textureCache) {
            return
        }

        textureCache.setImagesToFetch([ props.imagePath, props.imagePathNext, props.imagePathPrev ])

        const textureError = textureCache.getTextureError(props.imagePath)
        if (textureError) {
            canvas.getElement().style.display = 'none'
            this.setLoadingState(textureError)
            return
        }

        let canvasChanged = false

        if (this.canvasImagePath !== props.imagePath) {
            let texture = textureCache.getTexture(props.imagePath)
            canvas.setBaseTexture(texture, false)
            this.canvasImagePath = texture ? props.imagePath : null
            if (texture) {
                this.props.onTextureChange({ width: texture.width, height: texture.height })
            }
            canvasChanged = true
        }

        if (props.bodySize !== prevProps.bodySize) {
            const canvasElem = canvas.getElement()
            canvasElem.style.width  = `${props.bodySize.width}px`
            canvasElem.style.height = `${props.bodySize.height}px`
        }

        if (props.mode !== prevProps.mode || props.cameraMetrics !== prevProps.cameraMetrics) {
            canvas.setClipRect((props.mode === 'view' && props.cameraMetrics) ? props.cameraMetrics.cropRect : null)
            canvasChanged = true
        }

        if (props.cameraMetrics !== prevProps.cameraMetrics) {
            if (props.cameraMetrics) {
                canvas
                    .setSize(props.cameraMetrics.canvasSize)
                    .setProjectionMatrix(props.cameraMetrics.projectionMatrix)
                    .setCameraMatrix(props.cameraMetrics.cameraMatrix)
            }
            canvasChanged = true
        }

        if (canvasChanged) {
            if (props.cameraMetrics && canvas.isValid()) {
                if (this.deferredHideCanvasTimeout) {
                    clearTimeout(this.deferredHideCanvasTimeout)
                    this.deferredHideCanvasTimeout = null
                }
                canvas.update()
                canvas.getElement().style.display = 'block'
                this.setLoadingState('done')
            } else if (!this.deferredHideCanvasTimeout) {
                // We hide the old image of an invalid canvas with a little delay,
                // in order to avoid blinking if loading the next texture and photo work is fast
                this.deferredHideCanvasTimeout = setTimeout(() => {
                    this.deferredHideCanvasTimeout = null
                    canvas.getElement().style.display = 'none'
                    this.setLoadingState('loading')
                }, 100)
            }
        }
    }

    render() {
        const { props } = this
        return (
            <div
                ref="main"
                className={classNames(props.className, 'PhotoLayer')}
                style={{ ...props.style, width: props.bodySize.width, height: props.bodySize.height }}
            />
        )
    }
}
