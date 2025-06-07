/**
 * VRRenderers.js - WebGL Rendering System for Chrome Extension VR
 * Includes BaseRenderer, MN2MNRenderer, and ST2MNRenderer classes
 * Note: Depends on LIF.js for LifLoader, BinaryStream, Field, and Metadata classes
 */

// BaseRenderer Class
class BaseRenderer {
    constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null) {
        this.gl = gl;
        this.views = null;
        this.debug = debug;
        this.limitSize = limitSize;
        this.renderCam = { pos: { x: 0, y: 0, z: 0 }, sl: { x: 0, y: 0 }, sk: { x: 0, y: 0 }, roll: 0, f: 0 };
        this.invd = null;
        this.program = BaseRenderer.createProgram(gl, BaseRenderer.defaultVertexShader(), fragmentShaderSource);
        if (!this.program) throw new Error("Shader program creation failed.");
        this.attribLocations = {
            vertexPosition: gl.getAttribLocation(this.program, "aVertexPosition"),
            textureCoord: gl.getAttribLocation(this.program, "aTextureCoord"),
        };
        this.buffers = BaseRenderer.setupCommonBuffers(gl);
        this.feathering = 0.1;
        this.background = [0.1, 0.1, 0.1, 1.0];
        this._processViews(views);
        this.renderCam.f = this.views[0].f * this.viewportScale();
    }

    viewportScale() {
        return Math.min(this.gl.canvas.width, this.gl.canvas.height) / Math.min(this.views[0].width, this.views[0].height);
    }

    async _processViews(views) {
        this.views = this.replaceKeys(views,
            ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom'],
            ['width', 'height', 'f', 'invZ', 'layers']
        );
        await this._parseObjectAndCreateTextures(this.views);
    }

    replaceKeys(obj, oldKeys, newKeys) {
        if (typeof obj !== "object" || obj === null) return obj;
        const newObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const index = oldKeys.indexOf(key);
                const updatedKey = index !== -1 ? newKeys[index] : key;
                newObj[updatedKey] = this.replaceKeys(obj[key], oldKeys, newKeys);
            }
        }
        return Array.isArray(obj) ? Object.values(newObj) : newObj;
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

    static createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    static defaultVertexShader() {
        return `attribute vec4 aVertexPosition; attribute vec2 aTextureCoord; varying highp vec2 v_texcoord; void main(void) { gl_Position = aVertexPosition; v_texcoord = aTextureCoord; }`;
    }

    static setupCommonBuffers(gl) {
        const positions = new Float32Array([-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]);
        const textureCoords = new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0]);
        const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
        return {
            position: BaseRenderer.createBuffer(gl, gl.ARRAY_BUFFER, positions),
            textureCoord: BaseRenderer.createBuffer(gl, gl.ARRAY_BUFFER, textureCoords),
            indices: BaseRenderer.createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
        };
    }

    static createBuffer(gl, target, data, usage = gl.STATIC_DRAW) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, usage);
        return buffer;
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

    async _parseObjectAndCreateTextures(obj) {
        if (!obj) return;
        const processObject = async (item) => {
            if (item.image && item.image.url) {
                const imgElement = await this._loadImage2(item.image.url);
                item.image.texture = this._createTexture(imgElement);
            }
            if (item.invZ && item.invZ.url) {
                const invZElement = await this._loadImage2(item.invZ.url);
                item.invZ.texture = this._createTexture(invZElement);
            }
        };
        if (Array.isArray(obj)) {
            for (const view of obj) {
                await processObject(view);
                if (view.layers) {
                    for (const layer of view.layers) {
                        await processObject(layer);
                    }
                }
            }
        }
    }

    async _loadImage2(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    _createTexture(image) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        return texture;
    }
}

// MN2MNRenderer Class
class MN2MNRenderer extends BaseRenderer {
    constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null) {
        super(gl, fragmentShaderSource, views, debug, limitSize);
        this.setupUniforms();
    }

    setupUniforms() {
        const ctx = this.gl;
        this.uniformLocations = Object.assign(this.uniformLocations || {}, {
            uNumLayers: ctx.getUniformLocation(this.program, "uNumLayers"),
            uImage: [],
            uDisparityMap: []
        });
        for (let i = 0; i < 4; i++) {
            this.uniformLocations.uImage.push(ctx.getUniformLocation(this.program, `uImage[${i}]`));
            this.uniformLocations.uDisparityMap.push(ctx.getUniformLocation(this.program, `uDisparityMap[${i}]`));
        }
    }

    drawScene(t = 1.0) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        this.bindAttributes();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
}

// ST2MNRenderer Class  
class ST2MNRenderer extends BaseRenderer {
    constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null) {
        super(gl, fragmentShaderSource, views, debug, limitSize);
        this.setupUniforms();
    }

    setupUniforms() {
        const ctx = this.gl;
        this.uniformLocations = Object.assign(this.uniformLocations || {}, {
            uImageL: [],
            uDisparityMapL: [],
            uImageR: [],
            uDisparityMapR: []
        });
        for (let i = 0; i < 4; i++) {
            this.uniformLocations.uImageL.push(ctx.getUniformLocation(this.program, `uImageL[${i}]`));
            this.uniformLocations.uDisparityMapL.push(ctx.getUniformLocation(this.program, `uDisparityMapL[${i}]`));
            this.uniformLocations.uImageR.push(ctx.getUniformLocation(this.program, `uImageR[${i}]`));
            this.uniformLocations.uDisparityMapR.push(ctx.getUniformLocation(this.program, `uDisparityMapR[${i}]`));
        }
    }

    drawScene(t = 1.0) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        this.bindAttributes();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
}

// Make classes available globally for Chrome extension
window.BaseRenderer = BaseRenderer;
window.MN2MNRenderer = MN2MNRenderer;
window.ST2MNRenderer = ST2MNRenderer; 