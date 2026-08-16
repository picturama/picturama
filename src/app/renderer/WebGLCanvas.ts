import { mat4 } from 'gl-matrix'
import { convertFileSrc } from '@tauri-apps/api/core'

import BackgroundClient from 'app/BackgroundClient'
import { isHeicFile, isRawFile } from 'app/util/DataUtil'
import Profiler from 'app/util/Profiler'


export function hasWebGLSupport(): boolean {
    const canvas = document.createElement('canvas')
    return !!canvas.getContext('webgl2')
}


/**
 * A WebGL canvas. Has a more convenient API than using WebGL directly, but it lets you get down to WebGL if you need to.
 *
 * Links:
 *   - WebGl-Spec: https://www.khronos.org/registry/webgl/specs/1.0/
 */
export default class WebGLCanvas {

    readonly canvas: HTMLCanvasElement
    readonly gl: WebGLRenderingContext
    readonly internalFormat: number


    constructor(width: number = 0, height: number = 0, internalFormat: number = WebGLRenderingContext.RGB) {
        this.internalFormat = internalFormat

        this.canvas = document.createElement('canvas')

        const gl = this.canvas.getContext('webgl2') as WebGLRenderingContext
        if (!gl) {
            throw new Error('Unable to initialize WebGL. Your browser or machine may not support it.')
        }
        this.gl = gl

        this.setSize(width, height)
    }

    getElement() {
        return this.canvas
    }

    setSize(width: number, height: number): this {
        if (width === this.canvas.width && height === this.canvas.height) {
            // Nothing to do
            return this
        }

        this.canvas.width = width
        this.canvas.height = height
        this.gl.viewport(0, 0, width, height)
        return this
    }

    createBufferFromData(data: Float32Array, componentSize: number = 1): GraphicBuffer {
        const gl = this.gl
        const bufferId = gl.createBuffer()
        if (!bufferId) {
            throw new Error('Creating WebGL buffer failed')
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferId)
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
        gl.bindBuffer(gl.ARRAY_BUFFER, null)
        return new GraphicBuffer(gl, bufferId, gl.FLOAT, componentSize, data.length / componentSize)
    }

    async createTextureFromFile(filePath: string, srcFormat: number = WebGLRenderingContext.RGB, srcType: number = WebGLRenderingContext.UNSIGNED_BYTE, profiler: Profiler | null = null): Promise<Texture> {
        // For details see: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL

        const gl = this.gl

        let textureSource: ImageBitmap | Uint8Array
        let textureFormat: number
        let width: number
        let height: number
        if (isHeicFile(filePath)) {
            // HEIC is decoded natively in Rust (libheif) and returned as interleaved RGB8.
            const imageData = await BackgroundClient.loadHeifFile(filePath)
            if (profiler) profiler.addPoint('Loaded heic image')
            textureSource = imageData.data
            textureFormat = gl.RGB
            width = imageData.width
            height = imageData.height
            if (profiler) profiler.addPoint('Prepared image data')
        } else {
            const image = new Image()

            // The asset-protocol URL (convertFileSrc) is a different origin than the WebView, so without
            // CORS the image taints the WebGL texture and texImage2D throws a SecurityError. The Tauri asset
            // protocol sends the matching CORS headers, so an anonymous request loads it untainted.
            image.crossOrigin = 'anonymous'

            // RAW images can't be shown directly. Rust backend extracts the largest embedded JPEG preview and we
            // decode it with the browser like any other JPEG (via a blob URL). For all other formats the
            // image file is loaded straight from disk.
            const isRaw = isRawFile(filePath)
            const src = isRaw
                ? URL.createObjectURL(new Blob([await BackgroundClient.extractRawPreviewJpg(filePath)], { type: 'image/jpeg' }))
                : convertFileSrc(filePath)
            try {
                await new Promise((resolve, reject) => {
                    image.onload = resolve
                    image.onerror = errorEvt => {
                        reject(new Error(`Loading image failed: ${filePath}`))
                    }
                    image.src = src
                })
            } finally {
                if (isRaw) URL.revokeObjectURL(src)
            }
            if (profiler) profiler.addPoint('Loaded image')

            // Never hand the `<img>` itself to texImage2D: WebKit pulls the pixels out of the CGImage in
            // `GraphicsContextGLImageExtractor::extractImage`, and for a layout it doesn't handle it crashes the whole
            // web content process instead of throwing an Error.
            //
            // Example photo which causes a crash: submodules/test-data/photos/tif/tiff_CMYK_uncompressed.tiff
            // (I don't exactly know why this image crashes - it's not because of CMYK, since a CMYK JPEG works)
            //
            // Workaround: Using an ImageBitmap leaves that conversion to WebKit itself and measured no slower than the
            // direct upload.
            const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
            textureSource = bitmap
            textureFormat = -1  // Not needed for bitmaps

            // Using `from-image` in the `createImageBitmap` call above keeps the EXIF rotation the `<img>` applies.
            // Without it the bitmap would carry the unrotated pixels. So we don't apply EXIF rotation here.
            width = bitmap.width
            height = bitmap.height

            if (profiler) profiler.addPoint('Created image bitmap')
        }

        const textureId = this.gl.createTexture()
        if (!textureId) {
            throw new Error('Creating WebGL texture failed')
        }
        gl.bindTexture(gl.TEXTURE_2D, textureId)

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

        if (textureSource instanceof ImageBitmap) {
            gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, srcFormat, srcType, textureSource)
            // The pixels are in the texture now, so release the bitmap's copy right away instead of
            // waiting for the garbage collector - it holds a full RGBA frame.
            textureSource.close()
        } else {
            // The RGB8 buffer from Rust is packed tightly (row stride = width*3), but WebGL defaults
            // UNPACK_ALIGNMENT to 4, expecting each row to start on a 4-byte boundary. When width*3 is not a
            // multiple of 4 (e.g. a cropped HEIC with an odd width), that mismatch shifts every row and the
            // texture decodes to garbage/black. Setting alignment to 1 tells WebGL the rows are byte-packed.
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
            gl.texImage2D(gl.TEXTURE_2D, 0, textureFormat, width, height, 0, textureFormat, gl.UNSIGNED_BYTE, textureSource)
        }

        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (profiler) profiler.addPoint('Created texture')

        return new Texture(gl, textureId, width, height)
    }

}


/**
 * A WebGL buffer containing data stored in the graphic card's memory.
 *
 * Note: This class is called `GraphicBuffer` in order to avoid confusion with a ES6 `Buffer` or a `WebGLBuffer`
 */
export class GraphicBuffer {

    constructor(private gl: WebGLRenderingContext, public bufferId: WebGLBuffer, readonly type: number, readonly componentSize: number, readonly componentCount: number) {
    }

    bind(): this {
        const gl = this.gl
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufferId)
        return this
    }

    unbind(): this {
        const gl = this.gl
        gl.bindBuffer(gl.ARRAY_BUFFER, null)
        return this
    }

    /**
     * Sets this buffer as attribute for a vertex shader
     *
     * @param attribLocation the attribute location (from `gl.getAttribLocation`)
     * @param subsetSize the number of values to get - if only a subset of the component is needed (e.g. `2` if you need `u, v` from `x, y, z, u, v`)
     * @param subsetOffset the offset of the values to get - if only a subset of the component is needed (e.g. `3` if you need `u, v` from `x, y, z, u, v`)
     */
    setAsVertexAttrib(attribLocation: number, subsetSize?: number, subsetOffset?: number): this {
        const gl = this.gl

        let size = this.componentSize
        let stride = 0
        let offset = 0
        if (subsetSize) {
            let bytesPerValue
            switch (this.type) {
                case gl.FLOAT: bytesPerValue = 4; break
                default: throw new Error(`Unknown buffer value type: ${this.type}`)
            }

            size = subsetSize
            stride = this.componentSize * bytesPerValue
            offset = (subsetOffset || 0) * bytesPerValue
        }

        this.bind()
        gl.vertexAttribPointer(attribLocation, size, this.type, false, stride, offset)
        gl.enableVertexAttribArray(attribLocation)
        this.unbind()

        return this
    }

}


export class Texture {

    constructor(private gl: WebGLRenderingContext, public textureId: WebGLTexture,
        readonly width: number, readonly height: number)
    {
    }

    destroy() {
        this.gl.deleteTexture(this.textureId)
        this.textureId = null as any as WebGLTexture
    }

    bind(unit): this {
        const gl = this.gl
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, this.textureId)
        return this
    }

    unbind(unit): this {
        const gl = this.gl
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, null)
        return this
    }

}


export type ShaderParameter = Texture | Float32Array | mat4 | number
export type ShaderParameterMap = { [key: string]: ShaderParameter }

export class ShaderProgram<Uniforms extends ShaderParameterMap> {

    readonly programId: WebGLProgram

    constructor(readonly gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
        // For details see: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Adding_2D_content_to_a_WebGL_context

        const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
        const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)

        // Create the shader program
        const programId = gl.createProgram()
        if (!programId) {
            throw new Error('Creating WebGL program failed')
        }
        this.programId = programId
        gl.attachShader(programId, vertexShader)
        gl.attachShader(programId, fragmentShader)
        gl.linkProgram(programId)

        // Fail if creating the shader program failed
        if (!gl.getProgramParameter(programId, gl.LINK_STATUS)) {
            throw new Error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(programId))
        }
    }

    use(): this {
        this.gl.useProgram(this.programId)
        return this
    }

    unuse(): this {
        this.gl.useProgram(null)
        return this
    }

}


const defaultVertexShaderSource = `
    attribute vec4 aVertex;
    attribute vec2 aTextureCoord;

    varying highp vec2 vTextureCoord;

    void main() {
        gl_Position = aVertex;
        vTextureCoord = aTextureCoord;
    }`

const defaultFragmentShaderSource = `
    uniform sampler2D uSampler;

    varying highp vec2 vTextureCoord;

    void main(void) {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
    }`

/**
 * A shader program using standardized shader variables.
 * 
 * Standard variables for vertex shader:
 * 
 *   - `attribute vec4 aVertex`: The vertex coordinates
 *   - `attribute vec2 aTextureCoord`: The texture coordinates
 *   - `varying highp vec2 vTextureCoord`: Output for the transformed texture coordinates (will be used by fragment shader)
 * 
 * Standard variables for fragment shader:
 * 
 *   - `uniform sampler2D uSampler`: The texture sampler
 *   - `varying highp vec2 vTextureCoord` The texture coordinates (coming from vertex shader)
 */
export class StandardShaderProgram<Uniforms extends ShaderParameterMap> extends ShaderProgram<Uniforms> {

    private samplerUniformLocation: WebGLUniformLocation
    private vertexAttribLocation: number
    private textureCoordAttribLocation: number
    private vertexCount = 0

    constructor(gl: WebGLRenderingContext, vertexShaderSource: string = defaultVertexShaderSource, fragmentShaderSource: string = defaultFragmentShaderSource) {
        super(gl, vertexShaderSource, fragmentShaderSource)

        const programId = this.programId
        const samplerUniformLocation = gl.getUniformLocation(programId, 'uSampler')
        if (!samplerUniformLocation) {
            throw new Error('Creating WebGL sampler uniform location failed')
        }
        this.samplerUniformLocation = samplerUniformLocation
        this.vertexAttribLocation = gl.getAttribLocation(programId, 'aVertex')
        this.textureCoordAttribLocation = gl.getAttribLocation(programId, 'aTextureCoord')
    }

    /**
     * Sets the vertex buffer.
     *
     * @param vertexBuffer the buffer from which to read vertices
     * @param subsetSize the number of values to get - if only a subset of the component is needed (e.g. `3` if you need `x, y, z` from `x, y, z, u, v`)
     * @param subsetOffset the offset of the values to get - if only a subset of the component is needed (e.g. `0` if you need `x, y, z` from `x, y, z, u, v`)
     */
    setVertexBuffer(vertexBuffer: GraphicBuffer, subsetSize?: number, subsetOffset?: number): this {
        vertexBuffer.setAsVertexAttrib(this.vertexAttribLocation, subsetSize, subsetOffset)
        this.vertexCount = vertexBuffer.componentCount
        return this
    }

    /**
     * Sets the texture coordinates buffer.
     *
     * @param textureCoordBuffer the buffer from which to read texture coordinates
     * @param subsetSize the number of values to get - if only a subset of the component is needed (e.g. `2` if you need `u, v` from `x, y, z, u, v`)
     * @param subsetOffset the offset of the values to get - if only a subset of the component is needed (e.g. `3` if you need `u, v` from `x, y, z, u, v`)
     */
    setTextureCoordBuffer(textureCoordBuffer: GraphicBuffer, subsetSize?: number, subsetOffset?: number): this {
        textureCoordBuffer.setAsVertexAttrib(this.textureCoordAttribLocation, subsetSize, subsetOffset)
        return this
    }

    setTexture(texture: Texture, textureUnit: number = 0): this {
        texture.bind(textureUnit)
        this.gl.uniform1i(this.samplerUniformLocation, textureUnit)
        return this
    }

    setUniforms(vertexUniforms: Uniforms): this {
        const gl = this.gl
        for (var name of Object.keys(vertexUniforms)) {
            var location = gl.getUniformLocation(this.programId, name)
            if (location === null) continue // will be null if the uniform isn't used in the shader

            var value = vertexUniforms[name]
            if (value instanceof Texture) {
                gl.uniform1i(location, value.textureId as number)
            } else if (value instanceof Float32Array) {
                switch (value.length) {
                    case 1: gl.uniform1fv(location, value); break
                    case 2: gl.uniform2fv(location, value); break
                    case 3: gl.uniform3fv(location, value); break
                    case 4: gl.uniform4fv(location, value); break
                    case 9: gl.uniformMatrix3fv(location, false, value); break
                    case 16: gl.uniformMatrix4fv(location, false, value); break
                    default: throw new Error('Dont\'t know how to load uniform "' + name + '" of length ' + value.length)
                }
            } else if (typeof value === 'number') {
                gl.uniform1f(location, value)
            } else {
                throw new Error('Attempted to set uniform "' + name + '" to invalid value ' + ((value as any) || 'undefined').toString())
            }
        }
        return this
    }

    draw(first: number = 0, count?: number): this {
        const gl = this.gl
        gl.drawArrays(gl.TRIANGLE_STRIP, first, count || this.vertexCount)
        return this
    }

}


/**
 * Creates a shader of the given type, uploads the source and compiles it.
 */
function loadShader(gl: WebGLRenderingContext, type, source: string) {
    const shader = gl.createShader(type)
    if (!shader) {
        throw new Error('Creating WebGL shader failed')
    }

    // Send the source to the shader object
    gl.shaderSource(shader, source)
  
    // Compile the shader program
    gl.compileShader(shader)
  
    // See if it compiled successfully
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const msg = 'An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(msg)
    }
  
    return shader
}
