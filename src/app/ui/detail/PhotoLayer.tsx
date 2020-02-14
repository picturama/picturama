import classNames from 'classnames'
import React from 'react'
import { findDOMNode } from 'react-dom'

import { CameraMetrics } from 'common/util/CameraMetrics'
import { Size, zeroSize } from 'common/util/GeometryTypes'
import { bindMany } from 'common/util/LangUtil'
import { ExifOrientation } from 'common/CommonTypes'
import { profileDetailView } from 'common/LogConstants'

import { showError } from 'app/ErrorPresenter'
import PhotoCanvas from 'app/renderer/PhotoCanvas'
import { Texture } from 'app/renderer/WebGLCanvas'

import { DetailMode } from './DetailTypes'
import TextureCache from './TextureCache'

import './PhotoLayer.less'


export interface Props {
    className?: any
    style?: any
    mode: DetailMode
    canvasSize: Size
    src: string
    srcPrev: string | null
    srcNext: string | null
    orientation: ExifOrientation
    cameraMetrics: CameraMetrics | null
    onLoadingChange(loading: boolean): void
    onTextureSizeChange(textureSize: Size): void
}

interface State {
    prevSrc: string | null
    prevCanvasSize: Size
}

export default class PhotoLayer extends React.Component<Props, State> {

    private canvas: PhotoCanvas | null = null
    private textureCache: TextureCache | null = null

    private canvasSrc: string | null = null
    private deferredHideCanvasTimeout: NodeJS.Timer | null

    private prevLoading: boolean | null = null


    constructor(props: Props) {
        super(props)
        bindMany(this, 'onTextureFetched')
        this.state = {
            prevSrc: null,
            prevCanvasSize: zeroSize,
        }
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

        this.updateCanvas({}, {})
    }

    componentWillUnmount() {
        if (this.canvas) {
            const canvasElem = this.canvas.getElement()
            canvasElem.parentNode!.removeChild(canvasElem)
            this.canvas = null
        }
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        this.updateCanvas(prevProps, prevState)
    }

    private setLoading(loading: boolean) {
        if (loading !== this.prevLoading) {
            this.prevLoading = loading
            this.props.onLoadingChange(loading)
        }
    }

    private onTextureFetched(src: string, texture: Texture | null) {
        if (src === this.props.src && texture) {
            this.props.onTextureSizeChange({ width: texture.width, height: texture.height })
        }
        this.updateCanvas(this.props, this.state)
    }

    private updateCanvas(prevProps: Partial<Props>, prevState: Partial<State>) {
        const { props, state, canvas, textureCache } = this
        if (!canvas || !textureCache) {
            return
        }

        textureCache.setSourcesToFetch([ props.src, props.srcNext, props.srcPrev ])

        if (textureCache.hasTextureError(props.src)) {
            showError('Showing photo failed: ' + props.src)
            canvas.getElement().style.display = 'none'
            this.setLoading(false)
            return
        }

        let canvasChanged = false

        if (this.canvasSrc !== props.src) {
            let texture = textureCache.getTexture(props.src)
            canvas.setBaseTexture(texture, false)
            this.canvasSrc = texture ? props.src : null
            if (texture) {
                this.props.onTextureSizeChange({ width: texture.width, height: texture.height })
            }
            canvasChanged = true
        }

        if (props.canvasSize !== prevProps.canvasSize) {
            canvas.setCssSize(props.canvasSize)
            canvasChanged = true
        }

        if (props.mode !== prevProps.mode || props.cameraMetrics !== prevProps.cameraMetrics) {
            canvas.setClipRect((props.mode === 'view' && props.cameraMetrics) ? props.cameraMetrics.cropRect : null)
            canvasChanged = true
        }

        if (props.cameraMetrics !== prevProps.cameraMetrics) {
            if (props.cameraMetrics) {
                canvas
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
                this.setLoading(false)
            } else if (!this.deferredHideCanvasTimeout) {
                // We hide the old image of an invalid canvas with a little delay,
                // in order to avoid blinking if loading the next texture and photo work is fast
                this.deferredHideCanvasTimeout = setTimeout(() => {
                    this.deferredHideCanvasTimeout = null
                    canvas.getElement().style.display = 'none'
                    this.setLoading(true)
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
                style={{ ...props.style, width: props.canvasSize.width, height: props.canvasSize.height }}
            />
        )
    }
}
