import { mat4 } from 'gl-matrix'

import CancelablePromise from 'common/util/CancelablePromise'
import { zeroPoint, Size, Rect } from 'common/util/GeometryTypes'
import { transformRect } from 'common/util/GeometryUtil'
import Profiler from 'common/util/Profiler'

import WebGLCanvas, { GraphicBuffer, Texture } from './WebGLCanvas'
import { TransformationShader } from './Shaders'


/**
 * Renders a photo using a WebGL canvas. Provides a high-level API suited for Picturama's photo rendering.
 */
export default class PhotoCanvas {

    private webGlCanvas: WebGLCanvas

    private size: Size = { width: 0, height: 0 }
    private clipRect: Rect | null = null

    private projectionMatrix: mat4
    private cameraMatrix: mat4

    private baseTexturePromise: CancelablePromise<void> | null = null
    private baseTexture: Texture | null = null
    private unitSquareBuffer: GraphicBuffer
    private transformationShader: TransformationShader


    constructor() {
        this.webGlCanvas = new WebGLCanvas()
        const gl = this.webGlCanvas.gl

        this.cameraMatrix = mat4.create()

        // Create a buffer for a unit square (a square from 0,0 to 1,1)
        const squarePositions = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
        ])
        this.unitSquareBuffer = this.webGlCanvas.createBufferFromData(squarePositions, 2)

        this.transformationShader = new TransformationShader(gl)
    }

    getElement() {
        return this.webGlCanvas.getElement()
    }

    isValid(): boolean {
        return !!(this.baseTexture)
    }

    setCssSize(size: Size): this {
        this.size = {height: size.height, width: size.width}
        this.size.height *= window.devicePixelRatio || 1;
        this.size.width *= window.devicePixelRatio || 1;
        return this
    }

    /**
     * Sets the rect where to clip the photo. In projected coordinates.
     */
    setClipRect(clipRect: Rect | null): this {
        this.clipRect = clipRect
        return this
    }

    /**
     * Sets the projection matrix translating from texture coordinates to projected coordinates.
     * See: `doc/geometry-concept.md`
     */
    setProjectionMatrix(projectionMatrix: mat4): this {
        this.projectionMatrix = projectionMatrix
        return this
    }

    /**
     * Sets the camera matrix translating projected coordinates to screen coordinates.
     * See: `doc/geometry-concept.md`
     */
    setCameraMatrix(cameraMatrix: mat4): this {
        this.cameraMatrix = cameraMatrix
        return this
    }

    loadFromSrc(src: string, profiler: Profiler | null = null): CancelablePromise<void> {
        if (this.baseTexturePromise !== null) {
            this.baseTexturePromise.cancel()
        }
        this.setBaseTexture(null)

        this.baseTexturePromise = this.createTextureFromSrc(src, profiler)
            .then(texture => {
                this.baseTexturePromise = null
                this.setBaseTexture(texture)
                    .update()
                if (profiler) profiler.addPoint('Updadated canvas')
            })

        return this.baseTexturePromise
    }

    createTextureFromSrc(src: string, profiler: Profiler | null = null): CancelablePromise<Texture> {
        return this.webGlCanvas.createTextureFromSrc(src, undefined, undefined, profiler)
    }

    setBaseTexture(texture: Texture | null, destroyLast = true): this {
        if (destroyLast && this.baseTexture !== null) {
            this.baseTexture.destroy()
            this.baseTexture = null
        }
        this.baseTexture = texture

        return this
    }

    update(): this {
        const { size, baseTexture, clipRect } = this

        if (!baseTexture) {
            const gl = this.webGlCanvas.gl
            gl.clearColor(0.0, 0.0, 0.0, 1.0)
            gl.clear(gl.COLOR_BUFFER_BIT)

            return this
        }

        // ===== Calculate =====

        let viewportOrigin = zeroPoint
        let viewportSize = size
        if (clipRect) {
            const viewportRect = transformRect(clipRect, this.cameraMatrix)
            viewportOrigin = viewportRect
            viewportSize = viewportRect
        }

        // Important for matrix: Build it backwards (first operation last)
        const matrix = mat4.create()
        // Move origin to the center (0 .. 2) to clipspace coordinates (-1/1 .. 1/-1)
        mat4.translate(matrix, matrix, [ -1, 1, 0 ])
        // Scale to clipspace units (0 .. viewportWidth/viewportWidth) -> (0/2 .. 2/0)
        //   - 2 because clipspace coordinates are (-1 .. 1)
        //   - flip y, because clipspace's y axis goes from bottom to top
        mat4.scale(matrix, matrix, [ 2 / viewportSize.width, -2 / viewportSize.height, 1 ])
        if (clipRect) {
            mat4.translate(matrix, matrix, [ -viewportOrigin.x, -viewportOrigin.y, 0 ])
        }
        // Apply camera
        mat4.multiply(matrix, matrix, this.cameraMatrix)
        // Apply projection
        mat4.multiply(matrix, matrix, this.projectionMatrix)
        // Scale from unit coordinates (0 .. 1) to texture coordinates (0 .. textureSize)
        mat4.scale(matrix, matrix, [ baseTexture.width, baseTexture.height, 1 ])

        // ===== Draw =====

        this.webGlCanvas.setSize(size.width, size.height)

        const gl = this.webGlCanvas.gl

        // Clear the canvas before we start drawing on it.
        // TODO: Make clear color configurable
        gl.viewport(0, 0, size.width, size.height)
        gl.clearColor(0.0, 0.0, 0.0, 1.0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        if (clipRect) {
            // Screen coordinates (as defined in `doc/geometry-concept.md`) go from top to bottom,
            // but Web GL measures the viewport from bottom to top
            // -> Translate y (it's the bottom of the rect measured from the bottom of the canvas)
            const glViewportY = size.height - viewportOrigin.y - viewportSize.height
            gl.viewport(viewportOrigin.x, glViewportY, viewportSize.width, viewportSize.height)
        }

        this.transformationShader
            .use()
            .setVertexBuffer(this.unitSquareBuffer)
            .setTextureCoordBuffer(this.unitSquareBuffer)
            .setTexture(baseTexture)
            .setUniforms({ uTransformationMatrix: matrix })
            .draw()

        return this
    }

}
