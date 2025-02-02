// Renderer.js

// ================================
// BaseRenderer: Shared functionality
// ================================
export class BaseRenderer {
    /**
     * @param {WebGLRenderingContext} gl - The WebGL context.
     * @param {string} vertexShaderSource - The vertex shader source.
     *   If not provided, a default shader is used.
     * @param {string} fragmentShaderSource - The fragment shader source.
     */
    constructor(gl, vertexShaderSource, fragmentShaderSource) {
        this.gl = gl;
        // Use default vertex shader if none is provided.
        if (!vertexShaderSource) {
            vertexShaderSource = `
          attribute vec4 aVertexPosition;
          attribute vec2 aTextureCoord;
          varying highp vec2 v_texcoord;
          void main(void) {
            gl_Position = aVertexPosition;
            v_texcoord = aTextureCoord;
          }
        `;
        }
        this.program = BaseRenderer.createProgram(gl, vertexShaderSource, fragmentShaderSource);
        if (!this.program) {
            throw new Error("Program creation failed");
        }
        // Common attribute locations.
        this.attribLocations = {
            vertexPosition: gl.getAttribLocation(this.program, "aVertexPosition"),
            textureCoord: gl.getAttribLocation(this.program, "aTextureCoord")
        };
        // Create common buffers (a full-screen quad).
        this.buffers = BaseRenderer.setupCommonBuffers(gl);
        this.feathering = 0.1;
        this.background = [0.1, 0.1, 0.1];
    }

    /**
     * Static async factory method.
     * If a fragment shader source is not provided, fetch it from the given URL
     * with a cache-busting query parameter.
     *
     * @param {WebGLRenderingContext} gl - The WebGL context.
     * @param {string} fragmentShaderUrl - URL for the fragment shader.
     * @param {string} [vertexShaderSource] - Optional vertex shader source.
     * @returns {Promise<BaseRenderer>} - A promise that resolves to a new BaseRenderer instance.
     */
    static async createInstance(gl, fragmentShaderUrl, vertexShaderSource) {
        if (!vertexShaderSource) {
            vertexShaderSource = `
          attribute vec4 aVertexPosition;
          attribute vec2 aTextureCoord;
          varying highp vec2 v_texcoord;
          void main(void) {
            gl_Position = aVertexPosition;
            v_texcoord = aTextureCoord;
          }
        `;
        }
        const response = await fetch(fragmentShaderUrl + '?t=' + Date.now());
        const fragmentShaderSource = await response.text();
        return new BaseRenderer(gl, vertexShaderSource, fragmentShaderSource);
    }

    // --- Static utility methods (unchanged) ---
    static createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    static createProgram(gl, vsSource, fsSource) {
        const vertexShader = BaseRenderer.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = BaseRenderer.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    static createBuffer(gl, target, data, usage = gl.STATIC_DRAW) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, usage);
        return buffer;
    }

    static setupCommonBuffers(gl) {
        const positions = new Float32Array([
            -1.0, 1.0,
            1.0, 1.0,
            -1.0, -1.0,
            1.0, -1.0
        ]);
        const textureCoords = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0
        ]);
        const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
        return {
            position: BaseRenderer.createBuffer(gl, gl.ARRAY_BUFFER, positions),
            textureCoord: BaseRenderer.createBuffer(gl, gl.ARRAY_BUFFER, textureCoords),
            indices: BaseRenderer.createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices)
        };
    }

    bindAttributes() {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.vertexAttribPointer(this.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.attribLocations.vertexPosition);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.textureCoord);
        gl.vertexAttribPointer(this.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.attribLocations.textureCoord);
    }

    // Abstract method – must be implemented by subclass.
    drawScene() {
        throw new Error("drawScene() must be implemented by subclass");
    }
}

// ================================
// MN2MNRenderer: Mono Input → Mono Output
// (Formerly setupWebGL & drawScene)
// ================================
export class MN2MNRenderer extends BaseRenderer {
    constructor(gl, vertexShaderSource, fragmentShaderSource) {
        super(gl, vertexShaderSource, fragmentShaderSource);
        const ctx = this.gl;
        this.uniformLocations = {
            uNumLayers: ctx.getUniformLocation(this.program, "uNumLayers"),
            invZmin: ctx.getUniformLocation(this.program, "invZmin"),
            invZmax: ctx.getUniformLocation(this.program, "invZmax"),
            uViewPosition: ctx.getUniformLocation(this.program, "uViewPosition"),
            sk1: ctx.getUniformLocation(this.program, "sk1"),
            sl1: ctx.getUniformLocation(this.program, "sl1"),
            roll1: ctx.getUniformLocation(this.program, "roll1"),
            f1: ctx.getUniformLocation(this.program, "f1"),
            iRes: ctx.getUniformLocation(this.program, "iRes"),
            iResOriginal: ctx.getUniformLocation(this.program, "iResOriginal"),
            uFacePosition: ctx.getUniformLocation(this.program, "uFacePosition"),
            sk2: ctx.getUniformLocation(this.program, "sk2"),
            sl2: ctx.getUniformLocation(this.program, "sl2"),
            roll2: ctx.getUniformLocation(this.program, "roll2"),
            f2: ctx.getUniformLocation(this.program, "f2"),
            oRes: ctx.getUniformLocation(this.program, "oRes"),
            feathering: ctx.getUniformLocation(this.program, "feathering"),
            background: ctx.getUniformLocation(this.program, "background")
        };
        this.uniformLocations.uImage = [];
        this.uniformLocations.uDisparityMap = [];
        for (let i = 0; i < 4; i++) {
            this.uniformLocations.uImage.push(ctx.getUniformLocation(this.program, `uImage[${i}]`));
            this.uniformLocations.uDisparityMap.push(ctx.getUniformLocation(this.program, `uDisparityMap[${i}]`));
        }
    }

    /**
     * @param {Array} views - Array with one view at index 0. That view must have:
     *                        position, sk, rotation, and a layers array. Each layer must have:
     *                        image.texture, invZ.texture, f, invZ.min, invZ.max, width, height.
     * @param {Object} renderCam - Camera object with properties: pos, sk, sl, roll, f.
     */
    drawScene(views, renderCam) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        this.bindAttributes();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);

        const numLayers = views[0].layers.length;
        for (let i = 0; i < numLayers; i++) {
            gl.activeTexture(gl.TEXTURE0 + (2 * i));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].image.texture);
            gl.uniform1i(this.uniformLocations.uImage[i], 2 * i);
            gl.activeTexture(gl.TEXTURE0 + (2 * i + 1));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].invZ.texture);
            gl.uniform1i(this.uniformLocations.uDisparityMap[i], 2 * i + 1);
        }
        gl.uniform1i(this.uniformLocations.uNumLayers, numLayers);
        gl.uniform3f(this.uniformLocations.uViewPosition,
            views[0].position.x, views[0].position.y, views[0].position.z);
        gl.uniform2f(this.uniformLocations.sk1,
            views[0].sk.x, views[0].sk.y);
        gl.uniform2f(this.uniformLocations.sl1,
            views[0].rotation.sl.x, views[0].rotation.sl.y);
        gl.uniform1f(this.uniformLocations.roll1, views[0].rotation.roll_degrees);
        gl.uniform1fv(this.uniformLocations.f1, views[0].layers.map(l => l.f));
        gl.uniform1fv(this.uniformLocations.invZmin, views[0].layers.map(l => l.invZ.min));
        gl.uniform1fv(this.uniformLocations.invZmax, views[0].layers.map(l => l.invZ.max));
        gl.uniform2fv(this.uniformLocations.iRes, views[0].layers.map(l => [l.width, l.height]).flat());
        gl.uniform2f(this.uniformLocations.iResOriginal, gl.canvas.width, gl.canvas.height);
        gl.uniform3f(this.uniformLocations.uFacePosition,
            renderCam.pos.x, renderCam.pos.y, renderCam.pos.z);
        gl.uniform2f(this.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(this.uniformLocations.sk2,
            renderCam.sk.x, renderCam.sk.y);
        gl.uniform2f(this.uniformLocations.sl2,
            renderCam.sl.x, renderCam.sl.y);
        gl.uniform1f(this.uniformLocations.roll2, renderCam.roll);
        gl.uniform1f(this.uniformLocations.f2, renderCam.f);
        gl.uniform1f(this.uniformLocations.feathering, this.feathering);
        gl.uniform3fv(this.uniformLocations.background, this.background);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
}

// ================================
// ST2MNRenderer: Stereo Input → Mono Output
// (Formerly setupWebGLST & drawSceneST)
// ================================
export class ST2MNRenderer extends BaseRenderer {
    constructor(gl, vertexShaderSource, fragmentShaderSource) {
        super(gl, vertexShaderSource, fragmentShaderSource);
        const ctx = this.gl;
        this.uniformLocations = {
            // Left view uniforms:
            uImageL: [],
            uDisparityMapL: [],
            uNumLayersL: ctx.getUniformLocation(this.program, "uNumLayersL"),
            invZminL: ctx.getUniformLocation(this.program, "invZminL"),
            invZmaxL: ctx.getUniformLocation(this.program, "invZmaxL"),
            uViewPositionL: ctx.getUniformLocation(this.program, "uViewPositionL"),
            sk1L: ctx.getUniformLocation(this.program, "sk1L"),
            sl1L: ctx.getUniformLocation(this.program, "sl1L"),
            roll1L: ctx.getUniformLocation(this.program, "roll1L"),
            f1L: ctx.getUniformLocation(this.program, "f1L"),
            iResL: ctx.getUniformLocation(this.program, "iResL"),
            // Right view uniforms:
            uImageR: [],
            uDisparityMapR: [],
            uNumLayersR: ctx.getUniformLocation(this.program, "uNumLayersR"),
            invZminR: ctx.getUniformLocation(this.program, "invZminR"),
            invZmaxR: ctx.getUniformLocation(this.program, "invZmaxR"),
            uViewPositionR: ctx.getUniformLocation(this.program, "uViewPositionR"),
            sk1R: ctx.getUniformLocation(this.program, "sk1R"),
            sl1R: ctx.getUniformLocation(this.program, "sl1R"),
            roll1R: ctx.getUniformLocation(this.program, "roll1R"),
            f1R: ctx.getUniformLocation(this.program, "f1R"),
            iResR: ctx.getUniformLocation(this.program, "iResR"),
            // Rendering info (mono output):
            iResOriginal: ctx.getUniformLocation(this.program, "iResOriginal"),
            uFacePosition: ctx.getUniformLocation(this.program, "uFacePosition"),
            sk2: ctx.getUniformLocation(this.program, "sk2"),
            sl2: ctx.getUniformLocation(this.program, "sl2"),
            roll2: ctx.getUniformLocation(this.program, "roll2"),
            f2: ctx.getUniformLocation(this.program, "f2"),
            oRes: ctx.getUniformLocation(this.program, "oRes"),
            feathering: ctx.getUniformLocation(this.program, "feathering"),
            background: ctx.getUniformLocation(this.program, "background")
        };
        for (let i = 0; i < 4; i++) {
            this.uniformLocations.uImageL.push(ctx.getUniformLocation(this.program, `uImageL[${i}]`));
            this.uniformLocations.uDisparityMapL.push(ctx.getUniformLocation(this.program, `uDisparityMapL[${i}]`));
            this.uniformLocations.uImageR.push(ctx.getUniformLocation(this.program, `uImageR[${i}]`));
            this.uniformLocations.uDisparityMapR.push(ctx.getUniformLocation(this.program, `uDisparityMapR[${i}]`));
        }
    }

    /**
     * Expects:
     *   views[0] as left view and views[1] as right view.
     *   renderCam is a mono camera for output.
     */
    drawScene(views, renderCam) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        this.bindAttributes();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
        const numLayersL = views[0].layers.length;
        for (let i = 0; i < numLayersL; i++) {
            gl.activeTexture(gl.TEXTURE0 + (4 * i));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].image.texture);
            gl.uniform1i(this.uniformLocations.uImageL[i], 4 * i);
            gl.activeTexture(gl.TEXTURE0 + (4 * i + 1));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].invZ.texture);
            gl.uniform1i(this.uniformLocations.uDisparityMapL[i], 4 * i + 1);
        }
        gl.uniform1i(this.uniformLocations.uNumLayersL, numLayersL);
        gl.uniform3f(this.uniformLocations.uViewPositionL,
            views[0].position.x, views[0].position.y, views[0].position.z);
        gl.uniform2f(this.uniformLocations.sk1L, views[0].sk.x, views[0].sk.y);
        gl.uniform2f(this.uniformLocations.sl1L, views[0].rotation.sl.x, views[0].rotation.sl.y);
        gl.uniform1f(this.uniformLocations.roll1L, views[0].rotation.roll_degrees);
        gl.uniform1fv(this.uniformLocations.f1L, views[0].layers.map(l => l.f));
        gl.uniform1fv(this.uniformLocations.invZminL, views[0].layers.map(l => l.invZ.min));
        gl.uniform1fv(this.uniformLocations.invZmaxL, views[0].layers.map(l => l.invZ.max));
        gl.uniform2fv(this.uniformLocations.iResL, views[0].layers.map(l => [l.width, l.height]).flat());
        const numLayersR = views[1].layers.length;
        for (let i = 0; i < numLayersR; i++) {
            gl.activeTexture(gl.TEXTURE0 + (4 * i + 2));
            gl.bindTexture(gl.TEXTURE_2D, views[1].layers[i].image.texture);
            gl.uniform1i(this.uniformLocations.uImageR[i], 4 * i + 2);
            gl.activeTexture(gl.TEXTURE0 + (4 * i + 3));
            gl.bindTexture(gl.TEXTURE_2D, views[1].layers[i].invZ.texture);
            gl.uniform1i(this.uniformLocations.uDisparityMapR[i], 4 * i + 3);
        }
        gl.uniform1i(this.uniformLocations.uNumLayersR, numLayersR);
        gl.uniform3f(this.uniformLocations.uViewPositionR,
            views[1].position.x, views[1].position.y, views[1].position.z);
        gl.uniform2f(this.uniformLocations.sk1R, views[1].sk.x, views[1].sk.y);
        gl.uniform2f(this.uniformLocations.sl1R, views[1].rotation.sl.x, views[1].rotation.sl.y);
        gl.uniform1f(this.uniformLocations.roll1R, views[1].rotation.roll_degrees);
        gl.uniform1fv(this.uniformLocations.f1R, views[1].layers.map(l => l.f));
        gl.uniform1fv(this.uniformLocations.invZminR, views[1].layers.map(l => l.invZ.min));
        gl.uniform1fv(this.uniformLocations.invZmaxR, views[1].layers.map(l => l.invZ.max));
        gl.uniform2fv(this.uniformLocations.iResR, views[1].layers.map(l => [l.width, l.height]).flat());
        gl.uniform2f(this.uniformLocations.iResOriginal, gl.canvas.width, gl.canvas.height);
        gl.uniform3f(this.uniformLocations.uFacePosition, renderCam.pos.x, renderCam.pos.y, renderCam.pos.z);
        gl.uniform2f(this.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(this.uniformLocations.sk2, renderCam.sk.x, renderCam.sk.y);
        gl.uniform2f(this.uniformLocations.sl2, renderCam.sl.x, renderCam.sl.y);
        gl.uniform1f(this.uniformLocations.roll2, renderCam.roll);
        gl.uniform1f(this.uniformLocations.f2, renderCam.f);
        gl.uniform1f(this.uniformLocations.feathering, this.feathering);
        gl.uniform3fv(this.uniformLocations.background, this.background);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
}

// ================================
// MN2STRenderer: Mono Input → Stereo Output
// (Formerly setupWebGL2ST & drawScene2ST)
// ================================
export class MN2STRenderer extends BaseRenderer {
    constructor(gl, vertexShaderSource, fragmentShaderSource) {
        super(gl, vertexShaderSource, fragmentShaderSource);
        const ctx = this.gl;
        // Uniforms for mono input and stereo rendering.
        this.uniformLocations = {
            // Mono input uniforms:
            uImage: [],
            uDisparityMap: [],
            uNumLayers: ctx.getUniformLocation(this.program, "uNumLayers"),
            invZmin: ctx.getUniformLocation(this.program, "invZmin"),
            invZmax: ctx.getUniformLocation(this.program, "invZmax"),
            uViewPosition: ctx.getUniformLocation(this.program, "uViewPosition"),
            sk1: ctx.getUniformLocation(this.program, "sk1"),
            sl1: ctx.getUniformLocation(this.program, "sl1"),
            roll1: ctx.getUniformLocation(this.program, "roll1"),
            f1: ctx.getUniformLocation(this.program, "f1"),
            iRes: ctx.getUniformLocation(this.program, "iRes"),
            iResOriginal: ctx.getUniformLocation(this.program, "iResOriginal"),
            // Stereo rendering uniforms:
            uFacePositionL: ctx.getUniformLocation(this.program, "uFacePositionL"),
            sk2L: ctx.getUniformLocation(this.program, "sk2L"),
            sl2L: ctx.getUniformLocation(this.program, "sl2L"),
            roll2L: ctx.getUniformLocation(this.program, "roll2L"),
            f2L: ctx.getUniformLocation(this.program, "f2L"),
            uFacePositionR: ctx.getUniformLocation(this.program, "uFacePositionR"),
            sk2R: ctx.getUniformLocation(this.program, "sk2R"),
            sl2R: ctx.getUniformLocation(this.program, "sl2R"),
            roll2R: ctx.getUniformLocation(this.program, "roll2R"),
            f2R: ctx.getUniformLocation(this.program, "f2R"),
            oRes: ctx.getUniformLocation(this.program, "oRes"),
            feathering: ctx.getUniformLocation(this.program, "feathering"),
            background: ctx.getUniformLocation(this.program, "background")
        };
        for (let i = 0; i < 4; i++) {
            this.uniformLocations.uImage.push(ctx.getUniformLocation(this.program, `uImage[${i}]`));
            this.uniformLocations.uDisparityMap.push(ctx.getUniformLocation(this.program, `uDisparityMap[${i}]`));
        }
    }

    /**
     * Expects:
     *   views[0] as mono input.
     *   renderCamL and renderCamR as stereo rendering camera parameters.
     */
    drawScene(views, renderCamL, renderCamR) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        this.bindAttributes();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
        const numLayers = views[0].layers.length;
        // Bind mono input textures for both stereo outputs.
        for (let i = 0; i < numLayers; i++) {
            gl.activeTexture(gl.TEXTURE0 + (2 * i));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].image.texture);
            gl.uniform1i(this.uniformLocations.uImage[i], 2 * i);
            gl.activeTexture(gl.TEXTURE0 + (2 * i + 1));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].invZ.texture);
            gl.uniform1i(this.uniformLocations.uDisparityMap[i], 2 * i + 1);
        }
        gl.uniform1i(this.uniformLocations.uNumLayers, numLayers);
        gl.uniform3f(this.uniformLocations.uViewPosition,
            views[0].position.x, views[0].position.y, views[0].position.z);
        gl.uniform2f(this.uniformLocations.sk1,
            views[0].sk.x, views[0].sk.y);
        gl.uniform2f(this.uniformLocations.sl1,
            views[0].rotation.sl.x, views[0].rotation.sl.y);
        gl.uniform1f(this.uniformLocations.roll1,
            views[0].rotation.roll_degrees);
        gl.uniform1fv(this.uniformLocations.f1, views[0].layers.map(l => l.f));
        gl.uniform1fv(this.uniformLocations.invZmin, views[0].layers.map(l => l.invZ.min));
        gl.uniform1fv(this.uniformLocations.invZmax, views[0].layers.map(l => l.invZ.max));
        gl.uniform2fv(this.uniformLocations.iRes, views[0].layers.map(l => [l.width, l.height]).flat());
        gl.uniform2f(this.uniformLocations.iResOriginal, gl.canvas.width, gl.canvas.height);
        // Stereo rendering uniforms:
        gl.uniform3f(this.uniformLocations.uFacePositionL,
            renderCamL.pos.x, renderCamL.pos.y, renderCamL.pos.z);
        gl.uniform2f(this.uniformLocations.sk2L,
            renderCamL.sk.x, renderCamL.sk.y);
        gl.uniform2f(this.uniformLocations.sl2L,
            renderCamL.sl.x, renderCamL.sl.y);
        gl.uniform1f(this.uniformLocations.roll2L, renderCamL.roll);
        gl.uniform1f(this.uniformLocations.f2L, renderCamL.f);
        gl.uniform3f(this.uniformLocations.uFacePositionR,
            renderCamR.pos.x, renderCamR.pos.y, renderCamR.pos.z);
        gl.uniform2f(this.uniformLocations.sk2R,
            renderCamR.sk.x, renderCamR.sk.y);
        gl.uniform2f(this.uniformLocations.sl2R,
            renderCamR.sl.x, renderCamR.sl.y);
        gl.uniform1f(this.uniformLocations.roll2R, renderCamR.roll);
        gl.uniform1f(this.uniformLocations.f2R, renderCamR.f);
        gl.uniform1f(this.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(this.uniformLocations.feathering, this.feathering);
        gl.uniform3fv(this.uniformLocations.background, this.background);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
}

// ---------------------------
// ST2STRenderer: Stereo input → Stereo output.
// (Former setupWebGLST2ST & drawSceneST2ST)
// ---------------------------
export class ST2STRenderer extends BaseRenderer {
    constructor(gl, vertexShaderSource, fragmentShaderSource) {
        super(gl, vertexShaderSource, fragmentShaderSource);
        const ctx = this.gl;
        // Uniform locations for left view
        this.uniformLocations = {
            // Left view uniforms
            uImageL: [],
            uDisparityMapL: [],
            uNumLayersL: ctx.getUniformLocation(this.program, "uNumLayersL"),
            invZminL: ctx.getUniformLocation(this.program, "invZminL"),
            invZmaxL: ctx.getUniformLocation(this.program, "invZmaxL"),
            uViewPositionL: ctx.getUniformLocation(this.program, "uViewPositionL"),
            sk1L: ctx.getUniformLocation(this.program, "sk1L"),
            sl1L: ctx.getUniformLocation(this.program, "sl1L"),
            roll1L: ctx.getUniformLocation(this.program, "roll1L"),
            f1L: ctx.getUniformLocation(this.program, "f1L"),
            iResL: ctx.getUniformLocation(this.program, "iResL"),
            // Right view uniforms
            uImageR: [],
            uDisparityMapR: [],
            uNumLayersR: ctx.getUniformLocation(this.program, "uNumLayersR"),
            invZminR: ctx.getUniformLocation(this.program, "invZminR"),
            invZmaxR: ctx.getUniformLocation(this.program, "invZmaxR"),
            uViewPositionR: ctx.getUniformLocation(this.program, "uViewPositionR"),
            sk1R: ctx.getUniformLocation(this.program, "sk1R"),
            sl1R: ctx.getUniformLocation(this.program, "sl1R"),
            roll1R: ctx.getUniformLocation(this.program, "roll1R"),
            f1R: ctx.getUniformLocation(this.program, "f1R"),
            iResR: ctx.getUniformLocation(this.program, "iResR"),
            // Rendering info (stereo):
            iResOriginal: ctx.getUniformLocation(this.program, "iResOriginal"),
            uFacePositionL: ctx.getUniformLocation(this.program, "uFacePositionL"),
            sk2L: ctx.getUniformLocation(this.program, "sk2L"),
            sl2L: ctx.getUniformLocation(this.program, "sl2L"),
            roll2L: ctx.getUniformLocation(this.program, "roll2L"),
            f2L: ctx.getUniformLocation(this.program, "f2L"),
            uFacePositionR: ctx.getUniformLocation(this.program, "uFacePositionR"),
            sk2R: ctx.getUniformLocation(this.program, "sk2R"),
            sl2R: ctx.getUniformLocation(this.program, "sl2R"),
            roll2R: ctx.getUniformLocation(this.program, "roll2R"),
            f2R: ctx.getUniformLocation(this.program, "f2R"),
            oRes: ctx.getUniformLocation(this.program, "oRes"),
            feathering: ctx.getUniformLocation(this.program, "feathering"),
            background: ctx.getUniformLocation(this.program, "background")
        };

        // Create uniform arrays for textures for left and right.
        for (let i = 0; i < 4; i++) {
            this.uniformLocations.uImageL.push(ctx.getUniformLocation(this.program, `uImageL[${i}]`));
            this.uniformLocations.uDisparityMapL.push(ctx.getUniformLocation(this.program, `uDisparityMapL[${i}]`));
            this.uniformLocations.uImageR.push(ctx.getUniformLocation(this.program, `uImageR[${i}]`));
            this.uniformLocations.uDisparityMapR.push(ctx.getUniformLocation(this.program, `uDisparityMapR[${i}]`));
        }
    }

    /**
     * Expects:
     *   views[0] as left view, views[1] as right view.
     *   renderCamL and renderCamR as the left and right rendering camera parameters.
     */
    drawScene(views, renderCamL, renderCamR) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        this.bindAttributes();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
        // Bind left view textures.
        const numLayersL = views[0].layers.length;
        for (let i = 0; i < numLayersL; i++) {
            gl.activeTexture(gl.TEXTURE0 + (4 * i));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].image.texture);
            gl.uniform1i(this.uniformLocations.uImageL[i], 4 * i);
            gl.activeTexture(gl.TEXTURE0 + (4 * i + 1));
            gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].invZ.texture);
            gl.uniform1i(this.uniformLocations.uDisparityMapL[i], 4 * i + 1);
        }
        gl.uniform1i(this.uniformLocations.uNumLayersL, numLayersL);
        gl.uniform3f(this.uniformLocations.uViewPositionL,
            views[0].position.x, views[0].position.y, views[0].position.z);
        gl.uniform2f(this.uniformLocations.sk1L, views[0].sk.x, views[0].sk.y);
        gl.uniform2f(this.uniformLocations.sl1L, views[0].rotation.sl.x, views[0].rotation.sl.y);
        gl.uniform1f(this.uniformLocations.roll1L, views[0].rotation.roll_degrees);
        gl.uniform1fv(this.uniformLocations.f1L, views[0].layers.map(l => l.f));
        gl.uniform1fv(this.uniformLocations.invZminL, views[0].layers.map(l => l.invZ.min));
        gl.uniform1fv(this.uniformLocations.invZmaxL, views[0].layers.map(l => l.invZ.max));
        gl.uniform2fv(this.uniformLocations.iResL, views[0].layers.map(l => [l.width, l.height]).flat());
        // Bind right view textures.
        const numLayersR = views[1].layers.length;
        for (let i = 0; i < numLayersR; i++) {
            gl.activeTexture(gl.TEXTURE0 + (4 * i + 2));
            gl.bindTexture(gl.TEXTURE_2D, views[1].layers[i].image.texture);
            gl.uniform1i(this.uniformLocations.uImageR[i], 4 * i + 2);
            gl.activeTexture(gl.TEXTURE0 + (4 * i + 3));
            gl.bindTexture(gl.TEXTURE_2D, views[1].layers[i].invZ.texture);
            gl.uniform1i(this.uniformLocations.uDisparityMapR[i], 4 * i + 3);
        }
        gl.uniform1i(this.uniformLocations.uNumLayersR, numLayersR);
        gl.uniform3f(this.uniformLocations.uViewPositionR,
            views[1].position.x, views[1].position.y, views[1].position.z);
        gl.uniform2f(this.uniformLocations.sk1R, views[1].sk.x, views[1].sk.y);
        gl.uniform2f(this.uniformLocations.sl1R, views[1].rotation.sl.x, views[1].rotation.sl.y);
        gl.uniform1f(this.uniformLocations.roll1R, views[1].rotation.roll_degrees);
        gl.uniform1fv(this.uniformLocations.f1R, views[1].layers.map(l => l.f));
        gl.uniform1fv(this.uniformLocations.invZminR, views[1].layers.map(l => l.invZ.min));
        gl.uniform1fv(this.uniformLocations.invZmaxR, views[1].layers.map(l => l.invZ.max));
        gl.uniform2fv(this.uniformLocations.iResR, views[1].layers.map(l => [l.width, l.height]).flat());
        // Rendering info for stereo:
        gl.uniform2f(this.uniformLocations.iResOriginal, gl.canvas.width, gl.canvas.height);
        gl.uniform3f(this.uniformLocations.uFacePositionL,
            renderCamL.pos.x, renderCamL.pos.y, renderCamL.pos.z);
        gl.uniform2f(this.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(this.uniformLocations.sk2L, renderCamL.sk.x, renderCamL.sk.y);
        gl.uniform2f(this.uniformLocations.sl2L, renderCamL.sl.x, renderCamL.sl.y);
        gl.uniform1f(this.uniformLocations.roll2L, renderCamL.roll);
        gl.uniform1f(this.uniformLocations.f2L, renderCamL.f);
        gl.uniform3f(this.uniformLocations.uFacePositionR,
            renderCamR.pos.x, renderCamR.pos.y, renderCamR.pos.z);
        gl.uniform2f(this.uniformLocations.sk2R, renderCamR.sk.x, renderCamR.sk.y);
        gl.uniform2f(this.uniformLocations.sl2R, renderCamR.sl.x, renderCamR.sl.y);
        gl.uniform1f(this.uniformLocations.roll2R, renderCamR.roll);
        gl.uniform1f(this.uniformLocations.f2R, renderCamR.f);
        gl.uniform1f(this.uniformLocations.feathering, this.feathering);
        gl.uniform3fv(this.uniformLocations.background, this.background);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
}


// ================================
// Export all four renderers.
export { MN2MNRenderer, ST2MNRenderer, MN2STRenderer, ST2STRenderer };