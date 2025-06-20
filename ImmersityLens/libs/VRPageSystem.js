// VR System that runs in page context - Clean approach with embedded LifLoader
// VR system starting in page context (logging removed to avoid noise when extension disabled)

// === EMBEDDED LIFLOADER CLASS (from original module) ===
// Check if BinaryStream already exists to prevent conflicts
if (typeof BinaryStream === 'undefined') {
    class BinaryStream {
        constructor(arrayBuffer) {
            this.dataView = new DataView(arrayBuffer);
            this.offset = 0;
        }
        readBytes(length) {
            const bytes = new Uint8Array(this.dataView.buffer, this.offset, length);
            this.offset += length;
            return bytes;
        }
        readUInt16() {
            const value = this.dataView.getUint16(this.offset, false);
            this.offset += 2;
            return value;
        }
        readUInt32() {
            const value = this.dataView.getUint32(this.offset, false);
            this.offset += 4;
            return value;
        }
    }

    class Field {
        constructor(fieldType = -1, data = new Uint8Array()) {
            this.fieldType = fieldType;
            this.fieldDataSize = data.byteLength;
            this.fieldData = data;
        }
        toBlob() {
            return new Blob([this.fieldData]);
        }
        toObjectUrl() {
            return URL.createObjectURL(this.toBlob());
        }
        toString() {
            return new TextDecoder().decode(this.fieldData);
        }
    }

    class Metadata {
        constructor() {
            this.fields = [];
            this.fullSize = 0;
            this.regionOffset = 0;
        }
        addField(field) {
            this.fields.push(field);
        }
        getFieldByType(fieldType) {
            return this.fields.find(field => field.fieldType === fieldType);
        }
        getJsonMeta() {
            const JSON_META = 7;
            const JSON_META_NEW = 8;
            const metaField = this.getFieldByType(JSON_META_NEW) || this.getFieldByType(JSON_META);
            if (!metaField) {
                throw new Error('Failed to extract LIF meta');
            }
            return JSON.parse(metaField.toString());
        }
    }

    class LifLoader {
        constructor() {
            this.views = null;
            this.stereo_render_data = null;
            this.animations = null;
        }

        async load(file) {
            const arrayBuffer = await file.arrayBuffer();
            const metadata = await this._parseBinary(arrayBuffer);
            const lifJson = metadata.getJsonMeta();
            console.log('📊 LIF JSON loaded:', lifJson);

            // Replace legacy keys with standardized names
            let result = this.replaceKeys(lifJson,
                ['albedo', 'disparity', 'inv_z_dist', 'max_disparity', 'min_disparity', 'inv_z_dist_min', 'inv_z_dist_max'],
                ['image', 'inv_z_map', 'inv_z_map', 'max', 'min', 'max', 'min']
            );

            // Process views and store them
            this.views = await this._processViews(result, metadata, arrayBuffer);
            this.stereo_render_data = result.stereo_render_data;

            return {
                views: this.views,
                stereo_render_data: this.stereo_render_data
            };
        }

        async _parseBinary(arrayBuffer) {
            const fullSize = arrayBuffer.byteLength;
            const stream = new BinaryStream(arrayBuffer);

            // Check magic end marker
            stream.offset = fullSize - 2;
            const endMarker = stream.readUInt16();
            if (endMarker !== 0x1e1a) {
                throw new Error('Not a LIF file');
            }

            stream.offset = fullSize - 6;
            const regionOffset = stream.readUInt32();
            stream.offset = fullSize - regionOffset;

            const metadata = new Metadata();
            metadata.fieldCount = stream.readUInt32();
            for (let i = 0; i < metadata.fieldCount; i++) {
                const fieldType = stream.readUInt32();
                const fieldDataSize = stream.readUInt32();
                const fieldData = stream.readBytes(fieldDataSize);
                metadata.addField(new Field(fieldType, fieldData));
            }
            metadata.regionOffset = regionOffset;
            metadata.fullSize = fullSize;
            return metadata;
        }

        replaceKeys(obj, oldKeys, newKeys) {
            if (typeof obj !== 'object' || obj === null) return obj;
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

        async getImageDimensions(url) {
            const img = new Image();
            return new Promise((resolve, reject) => {
                img.onload = () => resolve({ width: img.width, height: img.height });
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = url;
            });
        }

        async _processViews(result, metadata, arrayBuffer) {
            if (!result.views) return [];

            const makeUrls = (obj) => {
                // Safe image handling
                if (obj.image && obj.image.blob_id !== undefined) {
                    if (obj.image.blob_id === -1) {
                        const rgbBlob = new Blob([arrayBuffer], { type: 'image/jpeg' });
                        obj.image.url = URL.createObjectURL(rgbBlob);
                    } else {
                        const rgbBlob = metadata.getFieldByType(obj.image.blob_id).toBlob();
                        obj.image.url = URL.createObjectURL(rgbBlob);
                    }
                }

                // Safe depth map handling
                if (obj.inv_z_map && obj.inv_z_map.blob_id !== undefined) {
                    const invZBlob = metadata.getFieldByType(obj.inv_z_map.blob_id).toBlob();
                    obj.inv_z_map.url = URL.createObjectURL(invZBlob);
                }

                // Safe mask handling
                if (obj.mask && obj.mask.blob_id !== undefined) {
                    const maskBlob = metadata.getFieldByType(obj.mask.blob_id).toBlob();
                    obj.mask.url = URL.createObjectURL(maskBlob);
                }
            };

            for (const view of result.views) {
                makeUrls(view);

                // Legacy support: calculate dimensions if not provided
                if (!view.width_px) {
                    const dims = await this.getImageDimensions(view.image.url);
                    view.width_px = dims.width;
                    view.height_px = dims.height;
                    view.focal_px = view.camera_data.focal_ratio_to_width * dims.width;
                    view.position = view.camera_data.position;
                    view.frustum_skew = view.camera_data.frustum_skew;
                    view.rotation = view.camera_data.rotation;
                    view.inv_z_map.max /= -view.camera_data.focal_ratio_to_width;
                    view.inv_z_map.min /= -view.camera_data.focal_ratio_to_width;
                }

                // Handle layered depth images
                let outpaint_width_px, outpaint_height_px, camera_data;
                if (!view.layers_top_to_bottom && view.layered_depth_image_data) {
                    view.layers_top_to_bottom = view.layered_depth_image_data.layers_top_to_bottom;
                    outpaint_width_px = view.layered_depth_image_data.outpainting_added_width_px;
                    outpaint_height_px = view.layered_depth_image_data.outpainting_added_height_px;
                    camera_data = view.camera_data;
                    delete view.camera_data;
                }

                if (view.layers_top_to_bottom) {
                    for (const layer of view.layers_top_to_bottom) {
                        makeUrls(layer);
                        if (camera_data) {
                            layer.camera_data = camera_data;
                            layer.outpainting_added_width_px = outpaint_width_px;
                            layer.outpainting_added_height_px = outpaint_height_px;
                            layer.inv_z_map.min /= 1 + outpaint_width_px / view.width_px;
                            layer.inv_z_map.max /= 1 + outpaint_width_px / view.width_px;
                        }
                        if (layer.outpainting_added_width_px) {
                            outpaint_width_px = layer.outpainting_added_width_px;
                            outpaint_height_px = layer.outpainting_added_height_px;
                            layer.width_px = view.width_px + outpaint_width_px;
                            layer.height_px = view.height_px + outpaint_height_px;
                            layer.focal_px = view.focal_px;
                            layer.inv_z_map.max /= -layer.camera_data.focal_ratio_to_width;
                            layer.inv_z_map.min /= -layer.camera_data.focal_ratio_to_width;
                            delete layer.camera_data;
                            delete layer.outpainting_added_width_px;
                            delete layer.outpainting_added_height_px;
                            delete view.layered_depth_image_data;
                            delete view.camera_data;
                        }
                    }
                }
            }

            return result.views;
        }
    }

    // === EMBEDDED LIF RENDERER CLASSES (from VIZ/Renderers.js) ===
    class BaseRenderer {
        constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null) {
            this.gl = gl;
            this.views = null;
            this._debugCount = 0;
            this.debug = debug;
            this.limitSize = limitSize;
            this.windowEffect = false;
            this.renderCam = {
                pos: { x: 0, y: 0, z: 0 },
                sl: { x: 0, y: 0 },
                sk: { x: 0, y: 0 },
                roll: 0,
                f: 0
            };
            this.invd = null;

            this.program = BaseRenderer.createProgram(gl, BaseRenderer.defaultVertexShader(), fragmentShaderSource);
            if (!this.program) {
                throw new Error("Shader program creation failed.");
            }

            this.attribLocations = {
                vertexPosition: gl.getAttribLocation(this.program, "aVertexPosition"),
                textureCoord: gl.getAttribLocation(this.program, "aTextureCoord"),
            };

            this.buffers = BaseRenderer.setupCommonBuffers(gl);
            this.feathering = 0.1;
            this.background = [0.1, 0.1, 0.1, 1.0];

            this._processViews(views);
            this.renderCam.f = this.views[0].f * this.viewportScale();

            const ctx = this.gl;
            this.uniformLocations = {
                uTime: ctx.getUniformLocation(this.program, 'uTime'),
                oRes: ctx.getUniformLocation(this.program, "oRes"),
                feathering: ctx.getUniformLocation(this.program, "feathering"),
                background: ctx.getUniformLocation(this.program, "background"),
                iResOriginal: ctx.getUniformLocation(this.program, "iResOriginal")
            };
        }

        viewportScale() {
            return Math.min(this.gl.canvas.width, this.gl.canvas.height) / Math.min(this.views[0].width, this.views[0].height);
        }

        async _processViews(views) {
            this.views = this.replaceKeys(views,
                ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom', 'frustum_skew', 'rotation_slant', 'render_data'],
                ['width', 'height', 'f', 'invZ', 'layers', 'sk', 'sl', 'stereo_render_data']
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
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        static defaultVertexShader() {
            return `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying highp vec2 v_texcoord;
            void main(void) {
                gl_Position = aVertexPosition;
                v_texcoord = aTextureCoord;
            }
        `;
        }

        static setupCommonBuffers(gl) {
            const positions = new Float32Array([
                -1.0, 1.0,   // Top left
                1.0, 1.0,    // Top right
                -1.0, -1.0,  // Bottom left
                1.0, -1.0    // Bottom right
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
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                    if (key === "image") {
                        try {
                            const img = await this._loadImage2(obj[key].url);
                            obj[key]["texture"] = this._createTexture(img);
                        } catch (error) {
                            console.error("Error loading image:", error);
                        }
                    } else if (key === "invZ" && obj.hasOwnProperty("mask")) {
                        try {
                            const maskImg = await this._loadImage2(obj["mask"].url);
                            const invzImg = await this._loadImage2(obj["invZ"].url);
                            const maskedInvz = this._create4ChannelImage(invzImg, maskImg);
                            obj["invZ"]["texture"] = this._createTexture(maskedInvz);
                        } catch (error) {
                            console.error("Error loading mask or invZ image:", error);
                        }
                    } else if (key === "invZ") {
                        try {
                            const invzImg = await this._loadImage2(obj["invZ"].url);
                            obj["invZ"]["texture"] = this._createTexture(invzImg);
                        } catch (error) {
                            console.error("Error loading invZ image:", error);
                        }
                    } else if (typeof obj[key] === "object" && obj[key] !== null) {
                        await this._parseObjectAndCreateTextures(obj[key]);
                    }
                }
            }
        }

        async _loadImage2(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = url;
                img.onload = () => {
                    if (this.limitSize === null || Math.max(img.width, img.height) <= this.limitSize) {
                        resolve(img);
                        return;
                    }

                    const aspectRatio = img.height / img.width;
                    let newWidth = img.width;
                    let newHeight = img.height;
                    if (img.width > img.height) {
                        newWidth = this.limitSize;
                        newHeight = Math.round(this.limitSize * aspectRatio);
                    } else {
                        newHeight = this.limitSize;
                        newWidth = Math.round(this.limitSize / aspectRatio);
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = newWidth;
                    canvas.height = newHeight;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, newWidth, newHeight);

                    const downsampledImg = new Image();
                    downsampledImg.crossOrigin = "anonymous";
                    downsampledImg.onload = () => resolve(downsampledImg);
                    downsampledImg.src = canvas.toDataURL();
                };
                img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
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
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            return texture;
        }

        _create4ChannelImage(rgbImage, maskImage) {
            const width = rgbImage.width;
            const height = rgbImage.height;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d", { willReadFrequently: true });

            ctx.drawImage(rgbImage, 0, 0, width, height);
            const rgbData = ctx.getImageData(0, 0, width, height).data;

            ctx.clearRect(0, 0, width, height);

            ctx.drawImage(maskImage, 0, 0, width, height);
            const maskData = ctx.getImageData(0, 0, width, height).data;

            const combinedData = ctx.createImageData(width, height);
            const combinedPixels = combinedData.data;

            for (let i = 0; i < rgbData.length / 4; i++) {
                combinedPixels[i * 4] = rgbData[i * 4];
                combinedPixels[i * 4 + 1] = rgbData[i * 4 + 1];
                combinedPixels[i * 4 + 2] = rgbData[i * 4 + 2];
                combinedPixels[i * 4 + 3] = maskData[i * 4];
            }

            return combinedData;
        }

        drawScene() {
            throw new Error("drawScene() must be implemented by subclass");
        }
    }

    // MN2STRenderer: Mono Input → Stereo Output (perfect for VR!)
    class MN2STRenderer extends BaseRenderer {
        constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null) {
            super(gl, fragmentShaderSource, views, debug, limitSize);
            const ctx = this.gl;
            this.windowEffect = false;
            this.renderCamL = {
                pos: { x: 0, y: 0, z: 0 },
                sl: { x: 0, y: 0 },
                sk: { x: 0, y: 0 },
                roll: 0,
                f: 0
            };
            this.renderCamR = {
                pos: { x: 0, y: 0, z: 0 },
                sl: { x: 0, y: 0 },
                sk: { x: 0, y: 0 },
                roll: 0,
                f: 0
            };

            this.uniformLocations = {
                ...this.uniformLocations,
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
                uFacePositionL: ctx.getUniformLocation(this.program, "uFacePositionL"),
                sk2L: ctx.getUniformLocation(this.program, "sk2L"),
                sl2L: ctx.getUniformLocation(this.program, "sl2L"),
                roll2L: ctx.getUniformLocation(this.program, "roll2L"),
                f2L: ctx.getUniformLocation(this.program, "f2L"),
                uFacePositionR: ctx.getUniformLocation(this.program, "uFacePositionR"),
                sk2R: ctx.getUniformLocation(this.program, "sk2R"),
                sl2R: ctx.getUniformLocation(this.program, "sl2R"),
                roll2R: ctx.getUniformLocation(this.program, "roll2R"),
                f2R: ctx.getUniformLocation(this.program, "f2R")
            };

            for (let i = 0; i < 4; i++) {
                this.uniformLocations.uImage.push(ctx.getUniformLocation(this.program, `uImage[${i}]`));
                this.uniformLocations.uDisparityMap.push(ctx.getUniformLocation(this.program, `uDisparityMap[${i}]`));
            }
        }

        drawScene(t = 1.0) {
            const gl = this.gl;
            const views = this.views;
            const renderCamL = this.renderCamL;
            const renderCamR = this.renderCamR;

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
            gl.uniform1f(this.uniformLocations.uTime, t);
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

            if (this.windowEffect) {
                gl.uniform2f(this.uniformLocations.iResOriginal, views[0].width, views[0].height);
            } else {
                gl.uniform2f(this.uniformLocations.iResOriginal, gl.canvas.width, gl.canvas.height);
            }

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
            gl.uniform4fv(this.uniformLocations.background, this.background);

            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
    }

    // MN2MNRenderer: Mono Input → Mono Output (for individual eyes)
    class MN2MNRenderer extends BaseRenderer {
        constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null) {
            super(gl, fragmentShaderSource, views, debug, limitSize);
            const ctx = this.gl;
            this.windowEffect = false;
            this.uniformLocations = {
                ...this.uniformLocations,
                uNumLayers: ctx.getUniformLocation(this.program, "uNumLayers"),
                invZmin: ctx.getUniformLocation(this.program, "invZmin"),
                invZmax: ctx.getUniformLocation(this.program, "invZmax"),
                uViewPosition: ctx.getUniformLocation(this.program, "uViewPosition"),
                sk1: ctx.getUniformLocation(this.program, "sk1"),
                sl1: ctx.getUniformLocation(this.program, "sl1"),
                roll1: ctx.getUniformLocation(this.program, "roll1"),
                f1: ctx.getUniformLocation(this.program, "f1"),
                iRes: ctx.getUniformLocation(this.program, "iRes"),
                uFacePosition: ctx.getUniformLocation(this.program, "uFacePosition"),
                sk2: ctx.getUniformLocation(this.program, "sk2"),
                sl2: ctx.getUniformLocation(this.program, "sl2"),
                roll2: ctx.getUniformLocation(this.program, "roll2"),
                f2: ctx.getUniformLocation(this.program, "f2")
            };
            this.uniformLocations.uImage = [];
            this.uniformLocations.uDisparityMap = [];
            for (let i = 0; i < 4; i++) {
                this.uniformLocations.uImage.push(ctx.getUniformLocation(this.program, `uImage[${i}]`));
                this.uniformLocations.uDisparityMap.push(ctx.getUniformLocation(this.program, `uDisparityMap[${i}]`));
            }
        }

        drawScene(t = 1.0) {
            const gl = this.gl;
            const views = this.views;
            const renderCam = this.renderCam;
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
            gl.uniform1f(this.uniformLocations.uTime, t);
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
            if (this.windowEffect) {
                gl.uniform2f(this.uniformLocations.iResOriginal, views[0].width, views[0].height);
            } else {
                gl.uniform2f(this.uniformLocations.iResOriginal, gl.canvas.width, gl.canvas.height);
            }
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
            gl.uniform4fv(this.uniformLocations.background, this.background);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
    }

    // ST2MNRenderer: Stereo Input → Mono Output (for stereo LIF files)
    class ST2MNRenderer extends BaseRenderer {
        constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null) {
            super(gl, fragmentShaderSource, views, debug, limitSize);
            const ctx = this.gl;
            this.windowEffect = false;
            this.uniformLocations = {
                ...this.uniformLocations,
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
                uFacePosition: ctx.getUniformLocation(this.program, "uFacePosition"),
                sk2: ctx.getUniformLocation(this.program, "sk2"),
                sl2: ctx.getUniformLocation(this.program, "sl2"),
                roll2: ctx.getUniformLocation(this.program, "roll2"),
                f2: ctx.getUniformLocation(this.program, "f2")
            };
            for (let i = 0; i < 4; i++) {
                this.uniformLocations.uImageL.push(ctx.getUniformLocation(this.program, `uImageL[${i}]`));
                this.uniformLocations.uDisparityMapL.push(ctx.getUniformLocation(this.program, `uDisparityMapL[${i}]`));
                this.uniformLocations.uImageR.push(ctx.getUniformLocation(this.program, `uImageR[${i}]`));
                this.uniformLocations.uDisparityMapR.push(ctx.getUniformLocation(this.program, `uDisparityMapR[${i}]`));
            }
        }

        drawScene(t = 1.0) {
            const gl = this.gl;
            const views = this.views;
            const renderCam = this.renderCam;
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
            gl.uniform1f(this.uniformLocations.uTime, t);
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
            if (this.windowEffect) {
                gl.uniform2f(this.uniformLocations.iResOriginal, views[0].width, views[0].height);
            } else {
                gl.uniform2f(this.uniformLocations.iResOriginal, gl.canvas.width, gl.canvas.height);
            }
            gl.uniform3f(this.uniformLocations.uFacePosition, renderCam.pos.x, renderCam.pos.y, renderCam.pos.z);
            gl.uniform2f(this.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
            gl.uniform2f(this.uniformLocations.sk2, renderCam.sk.x, renderCam.sk.y);
            gl.uniform2f(this.uniformLocations.sl2, renderCam.sl.x, renderCam.sl.y);
            gl.uniform1f(this.uniformLocations.roll2, renderCam.roll);
            gl.uniform1f(this.uniformLocations.f2, renderCam.f);
            gl.uniform1f(this.uniformLocations.feathering, this.feathering);
            gl.uniform4fv(this.uniformLocations.background, this.background);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
    }

    // === VR SYSTEM CLASS ===
    class PageContextVRSystem {
        constructor() {
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            this.isVRActive = false;
            this.lifUrl = null;
            this.leftMesh = null;
            this.rightMesh = null;
            this.lifView = null;
            this.is3D = 1; // Default to 3D display mode
            this.viewportScale = 1.2; // Default viewport scale
            this.xrCanvasInitialized = false;
            this.focus = 0.01; // Focus distance constant
            this.MAX_TEX_SIZE_VR = 1920; // Maximum texture size for VR mode

            // Controller tracking variables
            this.leftController = null;
            this.rightController = null;
            this.leftXButtonPressed = false;
            this.leftXButtonJustPressed = false;
            this.displaySwitch = false; // For WebXROpenXRBridge timing
            this.openXRWindowPositioned = false; // Flag to ensure OpenXR window positioning only happens once

            // Image coordinates for OpenXR window positioning (passed from content script)
            this.imageCoordinates = null;
        }

        log(message) {
            console.log('🎯 VR:', message);
            window.postMessage({ type: 'VR_LIF_LOG', message: message }, '*');
        }

        setImageCoordinates(coordinates) {
            this.imageCoordinates = coordinates;
            this.log('Image coordinates set for OpenXR window positioning: ' + JSON.stringify(coordinates));
        }

        // OpenXR Window Positioning using pre-calculated coordinates from content script

        async positionOpenXRWindow() {
            console.log('🔧 OPENXR POSITIONING: Starting window positioning...');

            // Check if WebXROpenXRBridge is available
            if (typeof window.WebXROpenXRBridge === 'undefined') {
                console.log('❌ OPENXR POSITIONING: WebXROpenXRBridge not available');
                console.log('🔍 OPENXR DEBUG: window.WebXROpenXRBridge =', window.WebXROpenXRBridge);
                console.log('🔍 OPENXR DEBUG: typeof check =', typeof window.WebXROpenXRBridge);
                this.log('WebXROpenXRBridge not available - positioning skipped');
                return;
            }
            console.log('✅ OPENXR POSITIONING: WebXROpenXRBridge is available');

            if (!this.imageCoordinates) {
                console.log('❌ OPENXR POSITIONING: No image coordinates available');
                this.log('No image coordinates - positioning skipped');
                return;
            }
            console.log('✅ OPENXR POSITIONING: Using pre-calculated coordinates:', this.imageCoordinates);

            try {
                // Use the pre-calculated coordinates from content script
                const overlayRect = {
                    x: this.imageCoordinates.x,
                    y: this.imageCoordinates.y,
                    width: this.imageCoordinates.width,
                    height: this.imageCoordinates.height
                };

                console.log('🎯 OPENXR POSITIONING: Overlay coordinates:', overlayRect);
                console.log('🔍 OPENXR DEBUG: Original calculation details:', this.imageCoordinates);

                // CRITICAL: Handle fullscreen exit timing
                console.log('🔧 OPENXR POSITIONING: Checking fullscreen state...');
                try {
                    const isFullscreen = await window.WebXROpenXRBridge.getFullScreen();
                    console.log('🔍 OPENXR DEBUG: Current fullscreen state:', isFullscreen);

                    if (isFullscreen) {
                        console.log('🔧 OPENXR POSITIONING: Exiting fullscreen mode...');
                        await window.WebXROpenXRBridge.setFullScreen(0);
                        console.log('⏱️ OPENXR POSITIONING: Waiting 500ms for fullscreen exit...');
                        await new Promise(resolve => setTimeout(resolve, 500));
                        console.log('✅ OPENXR POSITIONING: Fullscreen exit complete');
                    } else {
                        console.log('✅ OPENXR POSITIONING: Already in windowed mode');
                    }
                } catch (error) {
                    console.log('⚠️ OPENXR POSITIONING: Fullscreen check failed:', error.message);
                }

                // Attempt to set window rectangle
                console.log('🎯 OPENXR POSITIONING: Calling setWindowRect with:', overlayRect);
                console.log('🔧 OPENXR POSITIONING: About to call window.WebXROpenXRBridge.setWindowRect...');

                const setRectResult = await window.WebXROpenXRBridge.setWindowRect(overlayRect);

                console.log('✅ OPENXR POSITIONING: setWindowRect completed successfully');
                console.log('🔍 OPENXR DEBUG: setWindowRect result:', setRectResult);

                this.log('OpenXR window positioned at: ' + overlayRect.x + ',' + overlayRect.y + ' size: ' + overlayRect.width + 'x' + overlayRect.height);

            } catch (error) {
                console.log('❌ OPENXR POSITIONING: Error occurred:', error);
                console.log('🔍 OPENXR DEBUG: Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
                this.log('OpenXR positioning failed: ' + error.message);
                throw error; // Re-throw so caller can handle it
            }
        }

        applyOpenXRSettings(leftCam, rightCam) {
            console.log('🔧 OPENXR SETTINGS: Applying projection method and settings...');
            try {
                console.log('🔧 OPENXR SETTINGS: Calling setProjectionMethod(1)...');
                window.WebXROpenXRBridge.setProjectionMethod(1); // display centric projection
                console.log('✅ OPENXR SETTINGS: Projection method set to Display Centric');

                setTimeout(() => {
                    console.log('🔧 OPENXR SETTINGS: Calling resetSettings(1.0)...');
                    window.WebXROpenXRBridge.resetSettings(1.0);
                    console.log('✅ OPENXR SETTINGS: Settings reset to default');

                    setTimeout(() => {
                        console.log('🔧 OPENXR SETTINGS: Resetting convergence plane...');
                        const resetSuccess = this.resetConvergencePlane(leftCam, rightCam);
                        console.log('✅ OPENXR SETTINGS: Convergence plane reset:', resetSuccess ? "SUCCESS" : "FAILED");
                    }, 500);
                }, 500);

            } catch (error) {
                console.log('❌ OPENXR SETTINGS: Error setting projection method:', error.message);
                this.log("Error setting projection method: " + error.message);
            }
        }

        async init() {
            this.log('Initializing clean VR system with embedded LifLoader...');

            try {
                // Create Three.js scene
                this.scene = new THREE.Scene();
                this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
                this.scene.add(this.camera);

                // Create WebGL renderer with XR support
                const canvas = document.createElement('canvas');
                canvas.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 10000; display: none;';
                document.body.appendChild(canvas);

                this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.xr.enabled = true;
                this.renderer.autoClear = false;

                this.log('Three.js setup complete');

                // Setup XR session events
                this.renderer.xr.addEventListener('sessionstart', () => {
                    this.log('XR session started');
                    this.isVRActive = true;
                    canvas.style.display = 'block';
                    this.setupVRControllers();
                    window.postMessage({ type: 'VR_LIF_SESSION_STARTED' }, '*');
                });

                this.renderer.xr.addEventListener('sessionend', () => {
                    this.log('XR session ended');
                    this.isVRActive = false;
                    canvas.style.display = 'none';
                    window.postMessage({ type: 'VR_LIF_SESSION_ENDED' }, '*');
                });

                // Create initial test scene
                this.createTestScene();

                // Start animation loop
                this.renderer.setAnimationLoop((time, frame) => this.render(time, frame));

                this.log('Clean VR system initialized successfully');

            } catch (error) {
                this.log('Failed to initialize VR system: ' + error.message);
                window.postMessage({ type: 'VR_LIF_ERROR', message: 'Failed to initialize VR system: ' + error.message }, '*');
            }
        }

        async loadAndStartVR(lifUrl) {
            this.log('Loading LIF file: ' + lifUrl);

            try {
                // Fetch LIF file
                const response = await fetch(lifUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch LIF file: ${response.status}`);
                }

                const blob = await response.blob();
                const file = new File([blob], 'temp.lif', { type: 'application/octet-stream' });

                // Load with embedded LifLoader
                const lifLoader = new LifLoader();
                const lifData = await lifLoader.load(file);

                this.log('LIF data loaded successfully with ' + (lifData.views?.length || 0) + ' views');

                // Create VR scene from LIF data
                await this.createLifVRScene(lifData);

                // Start VR session
                await this.startVRSession();

            } catch (error) {
                this.log('Failed to load LIF and start VR: ' + error.message);
                this.log('Falling back to test scene and starting VR...');
                this.createTestScene();
                await this.startVRSession();
            }
        }

        async startVRWithBlobData(arrayBuffer, imageCoordinates = null) {
            this.log('Starting VR with blob data...');

            // Store image coordinates if provided
            if (imageCoordinates) {
                this.setImageCoordinates(imageCoordinates);
            }

            try {
                // Convert array buffer to blob and then to file
                const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
                const file = new File([blob], 'temp.lif', { type: 'application/octet-stream' });

                // Load with embedded LifLoader
                const lifLoader = new LifLoader();
                const lifData = await lifLoader.load(file);

                this.log('LIF data loaded successfully with ' + (lifData.views?.length || 0) + ' views');

                // Create VR scene from LIF data
                await this.createLifVRScene(lifData);

                // Start VR session
                await this.startVRSession();

            } catch (error) {
                this.log('Failed to load LIF from blob data and start VR: ' + error.message);
                this.log('Falling back to test scene and starting VR...');
                this.createTestScene();
                await this.startVRSession();
            }
        }

        async createLifVRScene(lifData) {
            this.log('Creating LIF VR scene with proper dual-eye renderer...');

            // Clear existing scene content (including test cube)
            this.cleanup();

            // Get views from data
            const views = lifData.views || lifData;
            if (!Array.isArray(views) || views.length === 0) {
                throw new Error('No views found in LIF data');
            }

            this.log('Creating separate renderers for each eye...');

            try {
                // Create separate canvases for left and right eyes
                this.lifCanvasL = document.createElement('canvas');
                this.lifCanvasR = document.createElement('canvas');

                // Set canvas dimensions (will be adjusted in VR)
                const aspectRatio = views[0].height_px / views[0].width_px;
                this.lifCanvasL.width = Math.min(1920, views[0].width_px);
                this.lifCanvasL.height = Math.round(this.lifCanvasL.width * aspectRatio);
                this.lifCanvasR.width = this.lifCanvasL.width;
                this.lifCanvasR.height = this.lifCanvasL.height;

                this.lifCanvasL.style.display = 'none';
                this.lifCanvasR.style.display = 'none';
                document.body.appendChild(this.lifCanvasL);
                document.body.appendChild(this.lifCanvasR);

                // Get WebGL contexts for each eye
                this.lifGLL = this.lifCanvasL.getContext('webgl');
                this.lifGLR = this.lifCanvasR.getContext('webgl');

                if (!this.lifGLL || !this.lifGLR) {
                    throw new Error('Could not get WebGL contexts for LIF rendering');
                }

                // Create renderer instances based on LIF type (matching webXR approach)
                const stereoData = lifData.stereo_render_data || { inv_convergence_distance: 0 };

                if (views.length == 1) {
                    // Mono LIF - use rayCastMonoLDI shader
                    this.lifRendererL = await this.createRendererInstance(this.lifGLL, 'shaders/rayCastMonoLDI.glsl', views, false, 1920);
                    this.lifRendererR = await this.createRendererInstance(this.lifGLR, 'shaders/rayCastMonoLDI.glsl', views, false, 1920);
                } else if (views.length == 2) {
                    // Stereo LIF - use rayCastStereoLDI shader  
                    this.lifRendererL = await this.createStereoRendererInstance(this.lifGLL, 'shaders/rayCastStereoLDI-test.glsl', views, false, 1920);
                    this.lifRendererR = await this.createStereoRendererInstance(this.lifGLR, 'shaders/rayCastStereoLDI-test.glsl', views, false, 1920);
                } else {
                    throw new Error('Unsupported number of views: ' + views.length);
                }

                // Set up convergence distance and background for both renderers
                this.lifRendererL.invd = stereoData.inv_convergence_distance;
                this.lifRendererR.invd = stereoData.inv_convergence_distance;
                this.lifRendererL.background = [0.1, 0.1, 0.1, 0.0];
                this.lifRendererR.background = [0.1, 0.1, 0.1, 0.0];

                // Create Three.js planes to display the rendered LIF content
                await this.createVRDisplayPlanes();

                // Initialize VR tracking variables
                this.initialY = undefined;
                this.initialZ = undefined;
                this.IPD = undefined;
                this.convergencePlane = null;
                this.xrCanvasInitialized = false;

                this.lifView = views[0];
                this.log('Dual-eye LIF renderers created successfully for VR');

            } catch (error) {
                this.log('Failed to create LIF renderers: ' + error.message);
                // Fallback to simple scene
                this.createTestScene();
            }
        }

        async createRendererInstance(gl, shaderUrl, views, debug, limitSize) {
            // Use embedded simplified mono LIF shader for VR (page context can't access chrome.runtime.getURL)
            try {
                const fragmentShaderSource = this.getEmbeddedMonoShader();
                return new MN2MNRenderer(gl, fragmentShaderSource, views, debug, limitSize);
            } catch (error) {
                this.log('Failed to create mono renderer: ' + error.message);
                throw error;
            }
        }

        async createStereoRendererInstance(gl, shaderUrl, views, debug, limitSize) {
            // Use embedded simplified stereo LIF shader for VR (page context can't access chrome.runtime.getURL)
            try {
                const fragmentShaderSource = this.getEmbeddedStereoShader();
                return new ST2MNRenderer(gl, fragmentShaderSource, views, debug, limitSize);
            } catch (error) {
                this.log('Failed to create stereo renderer: ' + error.message);
                throw error;
            }
        }

        getEmbeddedMonoShader() {
            // Complete mono LIF fragment shader (embedded to avoid CSP issues) - EXACT COPY from rayCastMonoLDI.glsl
            return `
precision highp float;

#ifdef GL_ES
varying highp vec2 v_texcoord;
#else
in vec2 v_texcoord;
#endif

uniform vec2 iResOriginal;
uniform float uTime;

// info views
uniform sampler2D uImage[4]; // for LDI this is an array
uniform sampler2D uDisparityMap[4]; // for LDI this is an array
uniform float invZmin[4], invZmax[4]; // used to get invZ
uniform vec3 uViewPosition; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1, sl1; // common to all layers
uniform float roll1; // common to all layers, f1 in px
uniform float f1[4]; // f per layer
uniform vec2 iRes[4];
uniform int uNumLayers;

// info rendering params
uniform vec3 uFacePosition; // in normalized camera space
uniform vec2 sk2, sl2;
uniform float roll2, f2; // f2 in px
uniform vec2 oRes; // viewport resolution in px
uniform float feathering; // Feathering factor for smooth transitions at the edges

uniform vec4 background; // background color
/*vec4 texture2(sampler2D iChannel, vec2 coord) {
    ivec2 ivec = ivec2(int(coord.x * iRes.x),  // asssuming all input textures are of same size
                       int(coord.y * iRes.y));
    return texelFetch(iChannel, ivec, 0);
}*/
#define texture texture2D

//float edge = feathering;
// vec3 background = vec3(1.0);
float taper(vec2 uv) {
    return smoothstep(0.0, feathering, uv.x) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.x)) * smoothstep(0.0, feathering, uv.y) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.y));
    //float r2 = pow(2.0*uv.x-1.0,2.0)+pow(2.0*uv.y-1.0,2.0);
    //return 1.0-smoothstep(0.64,1.0,r2);
}

vec3 readColor(sampler2D iChannel, vec2 uv) {
    // return texture(iChannel, uv).rgb * taper(uv) + 0.1 * (1.0 - taper(uv));
    return texture(iChannel, uv).rgb;
}
float readDisp(sampler2D iChannel, vec2 uv, float vMin, float vMax, vec2 iRes) {
    return texture(iChannel, vec2(clamp(uv.x, 2.0 / iRes.x, 1.0 - 2.0 / iRes.x), clamp(uv.y, 2.0 / iRes.y, 1.0 - 2.0 / iRes.y))).x * (vMin - vMax) + vMax;
}

mat3 matFromSlant(vec2 sl) {

    // builds rotation matrix from slant (tangent space) info
    float invsqx = 1.0 / sqrt(1.0 + sl.x * sl.x);
    float invsqy = 1.0 / sqrt(1.0 + sl.y * sl.y);
    float invsq = 1.0 / sqrt(1.0 + sl.x * sl.x + sl.y * sl.y);

    return mat3(invsqx, 0.0, sl.x * invsq, 0.0, invsqy, sl.y * invsq, -sl.x * invsqx, -sl.y * invsqy, invsq);
}

mat3 matFromRoll(float th) {

    // builds rotation matrix from roll angle
    float PI = 3.141593;
    float c = cos(th * PI / 180.0);
    float s = sin(th * PI / 180.0);

    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

mat3 matFromSkew(vec2 sk) {

    // builds frustum skew matrix from tangent angles
    return mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, -sk.x, -sk.y, 1.0);

}

mat3 matFromFocal(vec2 fxy) {

    // builds focal matrix
    // includes correction for aspect ratio since f expressed in fraction image width
    return mat3(fxy.x, 0.0, 0.0, 0.0, fxy.y, 0.0, 0.0, 0.0, 1.0);
}

#ifdef GL_ES
// Matrix Math
float det(mat2 matrix) {
    return matrix[0].x * matrix[1].y - matrix[0].y * matrix[1].x;
}

mat3 transpose_m(mat3 matrix) {
    return mat3(vec3(matrix[0].x, matrix[1].x, matrix[2].x), vec3(matrix[0].y, matrix[1].y, matrix[2].y), vec3(matrix[0].z, matrix[1].z, matrix[2].z));
}

mat3 inverseMat(mat3 matrix) {
    vec3 row0 = matrix[0];
    vec3 row1 = matrix[1];
    vec3 row2 = matrix[2];
    vec3 minors0 = vec3(det(mat2(row1.y, row1.z, row2.y, row2.z)), det(mat2(row1.z, row1.x, row2.z, row2.x)), det(mat2(row1.x, row1.y, row2.x, row2.y)));
    vec3 minors1 = vec3(det(mat2(row2.y, row2.z, row0.y, row0.z)), det(mat2(row2.z, row2.x, row0.z, row0.x)), det(mat2(row2.x, row2.y, row0.x, row0.y)));
    vec3 minors2 = vec3(det(mat2(row0.y, row0.z, row1.y, row1.z)), det(mat2(row0.z, row0.x, row1.z, row1.x)), det(mat2(row0.x, row0.y, row1.x, row1.y)));
    mat3 adj = transpose_m(mat3(minors0, minors1, minors2));
    return (1.0 / dot(row0, minors0)) * adj;
}
#define inverse inverseMat
#endif

bool isMaskAround(vec2 xy, sampler2D tex, vec2 iRes) {
    for(float x = -1.0; x <= 1.0; x += 1.0) {
        for(float y = -1.0; y <= 1.0; y += 1.0) {
            const float maskDilation = 1.5; // prevents some edge artifacts, especially helpful for resized textures
            vec2 offset_xy = xy + maskDilation * vec2(x, y) / iRes;
            if(texture(tex, offset_xy).a < 0.5) {
                return true;
            }
        }
    }
    return false;
}

float isMaskAround_get_val(vec2 xy, sampler2D tex, vec2 iRes) {
    return texture(tex, xy).a;
}

// Action !
vec4 raycasting(vec2 s2, mat3 FSKR2, vec3 C2, mat3 FSKR1, vec3 C1, sampler2D iChannelCol, sampler2D iChannelDisp, float invZmin, float invZmax, vec2 iRes, float t,out float invZ2, out float confidence) {

    // s2 is normalized xy coordinate for synthesized view, centered at 0 so values in -0.5..0.5

    const int numsteps = 40;
    float numsteps_float = float(numsteps);

    float invZ = invZmin; // starting point for invZ search
    float dinvZ = (invZmin - invZmax) / numsteps_float; // dividing the step into 40 steps
    float invZminT = invZ * (1.0 - t); // for animation
    invZ += dinvZ; // step back once before start

    //vec2 s1 = s2; // inititalize s1
    invZ2 = 0.0; // initialize invZ2
    float disp = 0.0; //initialize disp
    float oldDisp = 0.0;
    float gradDisp = 0.0;
    float gradThr = 0.02 * (invZmin - invZmax) * 140.0 / numsteps_float;

    vec3 nor = vec3(0.0);

    mat3 P = FSKR1 * inverse(FSKR2);
    vec3 C = FSKR1 * (C2 - C1);

    // extract matrix blocks
    mat2 Pxyxy = mat2(P[0].xy, P[1].xy);
    vec2 Pxyz = P[2].xy;
    vec2 Pzxy = vec2(P[0].z, P[1].z);
    float Pzz = P[2].z;

    vec2 s1 = C.xy * invZ + (1.0 - C.z * invZ) * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz); // starting point for s1
    vec2 ds1 = (C.xy - C.z * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz)) * dinvZ; // initial s1 step size

    confidence = 1.0;
    // 40 steps
    for(int i = 0; i < numsteps; i++) {

        invZ -= dinvZ; // step forward
        s1 -= ds1;

        //s1 = C.xy*invZ + (1.0 - C.z*invZ)*(Pxyxy*s2 + Pxyz)/(dot(Pzxy,s2) + Pzz);

        disp = readDisp(iChannelDisp, s1 + .5, invZmin, invZmax, iRes);
        gradDisp = disp - oldDisp;
        oldDisp = disp;
        invZ2 = invZ * (dot(Pzxy, s2) + Pzz) / (1.0 - C.z * invZ);
        if((disp > invZ) && (invZ2 > 0.0)) { // if ray is below the "virtual surface"...
            if(abs(gradDisp) > gradThr)
                confidence = 0.0;
            invZ += dinvZ; // step back
            s1 += ds1;
            dinvZ /= 2.0; // increase precision
            ds1 /= 2.0;
        }

    }
    if((abs(s1.x) < 0.5) && (abs(s1.y) < 0.5) && (invZ2 > 0.0) && (invZ > invZminT)) {
    //if ((abs(s1.x*adjustAr(iChannelResolution[0].xy,iResolution.xy).x)<0.495)&&(abs(s1.y*adjustAr(iChannelResolution[0].xy,iResolution.xy).y)<0.495)&&(invZ2>0.0)) {
        if(uNumLayers == 0) { // non-ldi
            return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5));
        }
//
        // if(isMaskAround(s1 + .5, iChannelDisp, iRes))
        //     return vec4(0.0); // option b) original. 0.0 - masked pixel
        // return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5)); // 1.0 - non masked pixel
        confidence = taper(s1 + .5);
        return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5) * isMaskAround_get_val(s1 + .5, iChannelDisp, iRes));
    } else {
        invZ2 = 0.0;
        confidence = 0.0;
        return vec4(background.rgb, 0.0);
    }
}

void main(void) {

    // gl_FragColor = vec4(1.0,0.0,0.0,1.0);
    // gl_FragColor = texture2D(uImage[0],v_texcoord);
    // return;

    vec2 uv = v_texcoord;

    // Optional: Window at invZmin
    float s = min(oRes.x, oRes.y) / min(iResOriginal.x, iResOriginal.y);
    vec2 newDim = iResOriginal * s / oRes;

    if((abs(uv.x - .5) < .5 * newDim.x) && (abs(uv.y - .5) < .5 * newDim.y)) {

        vec3 C1 = uViewPosition;
        mat3 SKR1 = matFromSkew(sk1) * matFromRoll(roll1) * matFromSlant(sl1); // Notice the focal part is missing, changes per layer

        vec3 C2 = uFacePosition;
        mat3 FSKR2 = matFromFocal(vec2(f2 / oRes.x, f2 / oRes.y)) * matFromSkew(sk2) * matFromRoll(roll2) * matFromSlant(sl2);
        float invZ, confidence;

        // LDI
        vec4 result;
        // vec3 color;
        vec4 layer1 = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1[0] / iRes[0].x, f1[0] / iRes[0].y)) * SKR1, C1, uImage[0], uDisparityMap[0], invZmin[0], invZmax[0], iRes[0], 1.0, invZ, confidence);
        result = layer1;
        result.rgb *= result.a; // amount of light emitted by the layer
        if(!(result.a == 1.0 || uNumLayers == 1)) {
            vec4 layer2 = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1[1] / iRes[1].x, f1[1] / iRes[1].y)) * SKR1, C1, uImage[1], uDisparityMap[1], invZmin[1], invZmax[1], iRes[1], 1.0, invZ, confidence);
            result.rgb = result.rgb + (1.0 - result.a) * layer2.a * layer2.rgb; // Blend background with with layer2
            result.a = layer2.a + result.a * (1.0 - layer2.a); // Blend alpha
            // result.rgb /= result.a; // Normalize color
            if(!(result.a == 1.0 || uNumLayers == 2)) {
                vec4 layer3 = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1[2] / iRes[2].x, f1[2] / iRes[2].y)) * SKR1, C1, uImage[2], uDisparityMap[2], invZmin[2], invZmax[2], iRes[2], 1.0, invZ, confidence);
                result.rgb = result.rgb + (1.0 - result.a) * layer3.a * layer3.rgb; // Blend background with with layer3
                result.a = layer3.a + result.a * (1.0 - layer3.a); // Blend alpha
                // result.rgb /= result.a; // Normalize color
                if(!(result.a == 1.0 || uNumLayers == 3)) {
                    vec4 layer4 = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1[3] / iRes[3].x, f1[3] / iRes[3].y)) * SKR1, C1, uImage[3], uDisparityMap[3], invZmin[3], invZmax[3], iRes[3], 1.0, invZ, confidence);
                    result.rgb = result.rgb + (1.0 - result.a) * layer4.a * layer4.rgb; // Blend background with with layer4
                    result.a = layer4.a + result.a * (1.0 - layer4.a); // Blend alpha
                    // result.rgb /= result.a; // Normalize color
                }
            }
        }

        // Blend with the background
        result.rgb = background.rgb * background.a * (1.0 - result.a) + result.rgb;
        result.a = background.a + result.a * (1.0 - background.a); // Blend alpha
        // Optionally, show low confidence ("stretch marks") pixels in red (for debugging)
        // if (confidence == 0.0) {
        //     result.r = 1.0;
        // } 

        // Output the final color
        gl_FragColor = result;

    } else {
        gl_FragColor = background;
    }
}
`;
        }

        getEmbeddedStereoShader() {
            // Complete stereo LIF fragment shader (embedded to avoid CSP issues) - EXACT COPY from rayCastStereoLDI-test.glsl
            return `
precision highp float;

#ifdef GL_ES
varying highp vec2 v_texcoord;
#else
in vec2 v_texcoord;
#endif

uniform vec2 iResOriginal;
uniform float uTime;

// info view L
uniform sampler2D uImageL[4]; // for LDI this is an array
uniform sampler2D uDisparityMapL[4]; // for LDI this is an array
uniform float invZminL[4], invZmaxL[4]; // used to get invZ
uniform vec3 uViewPositionL; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1L, sl1L; // common to all layers
uniform float roll1L; // common to all layers, f1 in px
uniform float f1L[4]; // f per layer
uniform vec2 iResL[4];

// add originalF
uniform int uNumLayersL;

// info view R
uniform sampler2D uImageR[4]; // for LDI this is an array
uniform sampler2D uDisparityMapR[4]; // for LDI this is an array
uniform float invZminR[4], invZmaxR[4]; // used to get invZ
uniform vec3 uViewPositionR; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1R, sl1R; // common to all layers
uniform float roll1R; // common to all layers, f1 in px
uniform float f1R[4]; // f per layer
uniform vec2 iResR[4];
// add originalF
uniform int uNumLayersR;

// info rendering params
uniform vec3 uFacePosition; // in normalized camera space
uniform vec2 sk2, sl2;
uniform float roll2, f2; // f2 in px
uniform vec2 oRes; // viewport resolution in px
uniform float feathering;
uniform vec4 background; // background color

/*vec4 texture2(sampler2D iChannel, vec2 coord) {
    ivec2 ivec = ivec2(int(coord.x * iRes.x),  // asssuming all input textures are of same size
                       int(coord.y * iRes.y));
    return texelFetch(iChannel, ivec, 0);
}*/
#define texture texture2D

//float edge = feathering;
// vec3 background = vec3(1.0);
float taper(vec2 uv) {
    return smoothstep(0.0, feathering, uv.x) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.x)) * smoothstep(0.0, feathering, uv.y) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.y));
    //float r2 = pow(2.0*uv.x-1.0,2.0)+pow(2.0*uv.y-1.0,2.0);
    //return 1.0-smoothstep(0.64,1.0,r2);
}

vec3 readColor(sampler2D iChannel, vec2 uv) {
    // return texture(iChannel, uv).rgb * taper(uv) + 0.1 * (1.0 - taper(uv));
    return texture(iChannel, uv).rgb;
}

float readDisp(sampler2D iChannel, vec2 uv, float vMin, float vMax, vec2 iRes) {
    return texture(iChannel, vec2(clamp(uv.x, 2.0 / iRes.x, 1.0 - 2.0 / iRes.x), clamp(uv.y, 2.0 / iRes.y, 1.0 - 2.0 / iRes.y))).x * (vMin - vMax) + vMax;
}

mat3 matFromSlant(vec2 sl) {

    // builds rotation matrix from slant (tangent space) info
    float invsqx = 1.0 / sqrt(1.0 + sl.x * sl.x);
    float invsqy = 1.0 / sqrt(1.0 + sl.y * sl.y);
    float invsq = 1.0 / sqrt(1.0 + sl.x * sl.x + sl.y * sl.y);

    return mat3(invsqx, 0.0, sl.x * invsq, 0.0, invsqy, sl.y * invsq, -sl.x * invsqx, -sl.y * invsqy, invsq);
}

mat3 matFromRoll(float th) {

    // builds rotation matrix from roll angle
    float PI = 3.141593;
    float c = cos(th * PI / 180.0);
    float s = sin(th * PI / 180.0);

    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

mat3 matFromSkew(vec2 sk) {

    // builds frustum skew matrix from tangent angles
    return mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, -sk.x, -sk.y, 1.0);

}

mat3 matFromFocal(vec2 fxy) {

    // builds focal matrix
    // includes correction for aspect ratio since f expressed in fraction image width
    return mat3(fxy.x, 0.0, 0.0, 0.0, fxy.y, 0.0, 0.0, 0.0, 1.0);
}

#ifdef GL_ES
// Matrix Math
float det(mat2 matrix) {
    return matrix[0].x * matrix[1].y - matrix[0].y * matrix[1].x;
}

mat3 transpose_m(mat3 matrix) {
    return mat3(vec3(matrix[0].x, matrix[1].x, matrix[2].x), vec3(matrix[0].y, matrix[1].y, matrix[2].y), vec3(matrix[0].z, matrix[1].z, matrix[2].z));
}

mat3 inverseMat(mat3 matrix) {
    vec3 row0 = matrix[0];
    vec3 row1 = matrix[1];
    vec3 row2 = matrix[2];
    vec3 minors0 = vec3(det(mat2(row1.y, row1.z, row2.y, row2.z)), det(mat2(row1.z, row1.x, row2.z, row2.x)), det(mat2(row1.x, row1.y, row2.x, row2.y)));
    vec3 minors1 = vec3(det(mat2(row2.y, row2.z, row0.y, row0.z)), det(mat2(row2.z, row2.x, row0.z, row0.x)), det(mat2(row2.x, row2.y, row0.x, row0.y)));
    vec3 minors2 = vec3(det(mat2(row0.y, row0.z, row1.y, row1.z)), det(mat2(row0.z, row0.x, row1.z, row1.x)), det(mat2(row0.x, row0.y, row1.x, row1.y)));
    mat3 adj = transpose_m(mat3(minors0, minors1, minors2));
    return (1.0 / dot(row0, minors0)) * adj;
}
#define inverse inverseMat
#endif

bool isMaskAround(vec2 xy, sampler2D tex, vec2 iRes) {
    for(float x = -1.0; x <= 1.0; x += 1.0) {
        for(float y = -1.0; y <= 1.0; y += 1.0) {
            const float maskDilation = 1.5; // prevents some edge artifacts, especially helpful for resized textures
            vec2 offset_xy = xy + maskDilation * vec2(x, y) / iRes;
            if(texture(tex, offset_xy).a < 0.5) {
                return true;
            }
        }
    }
    return false;
}

float isMaskAround_get_val(vec2 xy, sampler2D tex, vec2 iRes) {
    return texture(tex, xy).a;
}

// Multiview weighting
float weight2(vec3 C, vec3 C1, vec3 C2) {

    // generalizes weightR for arbitrary 2 views blending
    return smoothstep(0.0, 1.0, dot(C2 - C1, C - C1) / dot(C2 - C1, C2 - C1));

}

// Action !
vec4 raycasting(vec2 s2, mat3 FSKR2, vec3 C2, mat3 FSKR1, vec3 C1, sampler2D iChannelCol, sampler2D iChannelDisp, float invZmin, float invZmax, vec2 iRes, float t, out float invZ2, out float confidence) {

    // s2 is normalized xy coordinate for synthesized view, centered at 0 so values in -0.5..0.5

    const int numCoarseSteps = 8; // Reduced number of coarse steps
    const int numBinarySteps = 5; // Number of binary search refinement steps
    float numsteps_float = float(numCoarseSteps);

    // Add accuracy threshold parameter
    const float accuracyThreshold = 1e-3;
    float targetAccuracy = (invZmin - invZmax) * accuracyThreshold;

    float invZ = invZmin; // starting point for invZ search
    float dinvZ = (invZmin - invZmax) / numsteps_float; // Coarser steps for initial search
    float invZminT = invZ * (1.0 - t); // for animation

    //vec2 s1 = s2; // inititalize s1
    invZ2 = 0.0; // initialize invZ2
    float disp = 0.0; //initialize disp
    float oldDisp = 0.0;
    float gradDisp = 0.0;
    float gradThr = 0.02 * (invZmin - invZmax) * 140.0 / numsteps_float;

    vec3 nor = vec3(0.0);

    mat3 P = FSKR1 * inverse(FSKR2);
    vec3 C = FSKR1 * (C2 - C1);

    // extract matrix blocks
    mat2 Pxyxy = mat2(P[0].xy, P[1].xy);
    vec2 Pxyz = P[2].xy;
    vec2 Pzxy = vec2(P[0].z, P[1].z);
    float Pzz = P[2].z;

    vec2 s1 = vec2(0.0); // Will be calculated below
    vec2 ds1 = vec2(0.0); // Will be calculated below

    confidence = 1.0;

    // Phase 1: Coarse linear search to find the first potential intersection
    bool intersectionFound = false;
    float invZBefore = invZ; // Store the invZ value before intersection
    float invZAfter = invZ;  // Store the invZ value after intersection
    vec2 s1Before = vec2(0.0); // Will store s1 before intersection
    vec2 s1After = vec2(0.0);  // Will store s1 after intersection

    for(int i = 0; i < numCoarseSteps+2; i++) {
        invZ = invZmin - float(i-1) * dinvZ; // Step linearly

        // Calculate s1 for current invZ
        s1 = C.xy * invZ + (1.0 - C.z * invZ) * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz);

        // Calculate s1 step size for next iteration
        ds1 = (C.xy - C.z * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz)) * dinvZ;

        disp = readDisp(iChannelDisp, s1 + .5, invZmin, invZmax, iRes);
        gradDisp = disp - oldDisp;
        oldDisp = disp;
        invZ2 = invZ * (dot(Pzxy, s2) + Pzz) / (1.0 - C.z * invZ);

        // Check if we've found an intersection
        if(disp > invZ) {
            // We found a transition from in front to behind the surface
            intersectionFound = true;
            invZAfter = invZ;
            s1After = s1;
            invZBefore = invZ + dinvZ;
            s1Before = s1 + ds1;

            if(abs(gradDisp) > gradThr)
                confidence = 0.0;

            break;
        }
    }

    // Phase 2: Binary search refinement if we found an intersection
    if(intersectionFound) {
        float invZLow = invZAfter;   // Behind the surface
        float invZHigh = invZBefore; // In front of the surface
        vec2 s1Low = s1After;
        vec2 s1High = s1Before;

        for(int j = 0; j < numBinarySteps; j++) {
            // Exit if we've reached desired accuracy
            if(invZHigh - invZLow < targetAccuracy) {
                break;
            }

            // Calculate midpoint
            float invZMid = (invZLow + invZHigh) * 0.5;

            // Calculate s1 for midpoint
            vec2 s1Mid = C.xy * invZMid + (1.0 - C.z * invZMid) * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz);

            // Read disparity at midpoint
            float dispMid = readDisp(iChannelDisp, s1Mid + .5, invZmin, invZmax, iRes);

            // Calculate invZ2 at midpoint
            float invZ2Mid = invZMid * (dot(Pzxy, s2) + Pzz) / (1.0 - C.z * invZMid);

            // Binary search decision: are we in front of or behind the surface?
            if((dispMid > invZMid) && (invZ2Mid > 0.0)) {
                // We're behind the surface, move the lower bound
                invZLow = invZMid;
                s1Low = s1Mid;
            } else {
                // We're in front of the surface, move the upper bound
                invZHigh = invZMid;
                s1High = s1Mid;
            }
        }

        // Use the values from the front of the surface
        invZ = invZHigh;
        s1 = s1High;
        invZ2 = invZ * (dot(Pzxy, s2) + Pzz) / (1.0 - C.z * invZ);
    } else {
        // No intersection found during coarse search
        invZ2 = 0.0;
        confidence = 0.0;
        // return vec4(background.rgb, 0.0);
    }

    if((abs(s1.x) < 0.5) && (abs(s1.y) < 0.5) && (invZ2 > 0.0) && (invZ > invZminT)) {
    //if ((abs(s1.x*adjustAr(iChannelResolution[0].xy,iResolution.xy).x)<0.495)&&(abs(s1.y*adjustAr(iChannelResolution[0].xy,iResolution.xy).y)<0.495)&&(invZ2>0.0)) {
        // if(uNumLayers == 0) { // non-ldi
        //     return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5));
        // }
//
        // if(isMaskAround(s1 + .5, iChannelDisp, iRes))
        //     return vec4(0.0); // option b) original. 0.0 - masked pixel
        // return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5)); // 1.0 - non masked pixel
        confidence = taper(s1 + .5);
        return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5) * isMaskAround_get_val(s1 + .5, iChannelDisp, iRes));
    } else {
        invZ2 = 0.0;
        confidence = 0.0;
        return vec4(background.rgb, 0.0);
    }
}

void main(void) {

    // gl_FragColor = vec4(1.0,0.0,0.0,1.0);
    // return;

    vec2 uv = v_texcoord;

    // Optional: Window at invZmin
    float s = min(oRes.x, oRes.y) / min(iResOriginal.x, iResOriginal.y);
    vec2 newDim = iResOriginal * s / oRes;

    if((abs(uv.x - .5) < .5 * newDim.x) && (abs(uv.y - .5) < .5 * newDim.y)) {

        vec3 C1L = uViewPositionL;
        mat3 SKR1L = matFromSkew(sk1L) * matFromRoll(roll1L) * matFromSlant(sl1L); // Notice the focal part is missing, changes per layer

        vec3 C1R = uViewPositionR;
        mat3 SKR1R = matFromSkew(sk1R) * matFromRoll(roll1R) * matFromSlant(sl1R); // Notice the focal part is missing, changes per layer

        vec3 C2 = uFacePosition;
        mat3 FSKR2 = matFromFocal(vec2(f2 / oRes.x, f2 / oRes.y)) * matFromSkew(sk2) * matFromRoll(roll2) * matFromSlant(sl2);

        // LDI
        vec4 resultL, resultR, result, layer;
        float invZL = 0.0;
        float invZR = 0.0;
        float invZ = 0.0;
        float aL, aR;

        float wR = weight2(C2, C1L, C1R);

        vec4 layer1L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[0] / iResL[0].x, f1L[0] / iResL[0].y)) * SKR1L, C1L, uImageL[0], uDisparityMapL[0], invZminL[0], invZmaxL[0], iResL[0], 1.0, invZL, aL);
        vec4 layer1R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[0] / iResR[0].x, f1R[0] / iResR[0].y)) * SKR1R, C1R, uImageR[0], uDisparityMapR[0], invZminR[0], invZmaxR[0], iResR[0], 1.0, invZR, aR);
        if((aL == 0.0) && (aR == 1.0) || (layer1L.a < layer1R.a-.1)) {
            layer1L = layer1R;
            // layer1L.r = 1.0;
            invZ = invZR;
        }
        if((aR == 0.0) && (aL == 1.0) || (layer1R.a < layer1L.a-.1)) {
            layer1R = layer1L;
            // layer1R.b = 1.0;
            invZ = invZL;
        }
        layer = (1.0 - wR) * layer1L + wR * layer1R;
        result = layer;
        result.rgb *= result.a; // amount of light emitted by the layer
        if(!(result.a == 1.0 || uNumLayersL == 1)) {
            vec4 layer2L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[1] / iResL[1].x, f1L[1] / iResL[1].y)) * SKR1L, C1L, uImageL[1], uDisparityMapL[1], invZminL[1], invZmaxL[1], iResL[1], 1.0, invZL, aL);
            vec4 layer2R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[1] / iResR[1].x, f1R[1] / iResR[1].y)) * SKR1R, C1R, uImageR[1], uDisparityMapR[1], invZminR[1], invZmaxR[1], iResR[1], 1.0, invZR, aR);
            if((aL == 0.0) && (aR == 1.0) || (layer2L.a < layer2R.a-.1)) {
                layer2L = layer2R;
                // layer2L.r = 1.0;
                invZ = invZR;
            }
            if((aR == 0.0) && (aL == 1.0) || (layer2R.a < layer2L.a-.1)) {
                layer2R = layer2L;
                // layer2R.b = 1.0;
                invZ = invZL;
            }
            layer = (1.0 - wR) * layer2L + wR * layer2R;
            result.rgb = result.rgb + (1.0 - result.a) * layer.a * layer.rgb; // Blend background with with layer2
            result.a = layer.a + result.a * (1.0 - layer.a); // Blend alpha
            if(!(result.a == 1.0 || uNumLayersL == 2)) {
                vec4 layer3L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[2] / iResL[2].x, f1L[2] / iResL[2].y)) * SKR1L, C1L, uImageL[2], uDisparityMapL[2], invZminL[2], invZmaxL[2], iResL[2], 1.0, invZL, aL);
                vec4 layer3R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[2] / iResR[2].x, f1R[2] / iResR[2].y)) * SKR1R, C1R, uImageR[2], uDisparityMapR[2], invZminR[2], invZmaxR[2], iResR[2], 1.0, invZL, aL);
                if((aL == 0.0) && (aR == 1.0) || (layer3L.a < layer3R.a-.1)) {
                    layer3L = layer3R;
                    // layer3L.r = 1.0;
                    invZ = invZR;
                }
                if((aR == 0.0) && (aL == 1.0) || (layer3R.a < layer3L.a-.1)) {
                    layer3R = layer3L;
                    // layer3R.b = 1.0;
                    invZ = invZL;
                }
                layer = (1.0 - wR) * layer3L + wR * layer3R;
                result.rgb = result.rgb + (1.0 - result.a) * layer.a * layer.rgb; // Blend background with with layer2
                result.a = layer.a + result.a * (1.0 - layer.a); // Blend alpha
                if(!(result.a == 1.0 || uNumLayersL == 3)) {
                    vec4 layer4L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[3] / iResL[3].x, f1L[3] / iResL[3].y)) * SKR1L, C1L, uImageL[3], uDisparityMapL[3], invZminL[3], invZmaxL[3], iResL[3], 1.0, invZL, aL);
                    vec4 layer4R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[3] / iResR[3].x, f1R[3] / iResR[3].y)) * SKR1R, C1R, uImageR[3], uDisparityMapR[3], invZminR[3], invZmaxR[3], iResR[3], 1.0, invZR, aR);
                    if((aL == 0.0) && (aR == 1.0) || (layer4L.a < layer4R.a-.1)) {
                        layer4L = layer4R;
                        // layer4L.r = 1.0;
                        invZ = invZR;
                    }
                    if((aR == 0.0) && (aL == 1.0) || (layer4R.a < layer4L.a-.1)) {
                        layer4R = layer4L;
                        // layer4R.b = 1.0;
                        invZ = invZL;
                    }
                    layer = (1.0 - wR) * layer4L + wR * layer4R;
                    result.rgb = result.rgb + (1.0 - result.a) * layer.a * layer.rgb; // Blend background with with layer2
                    result.a = layer.a + result.a * (1.0 - layer.a); // Blend alpha
                }

            }
        }

        // Blend with the background
        result.rgb = background.rgb * background.a * (1.0 - result.a) + result.rgb;
        result.a = background.a + result.a * (1.0 - background.a); // Blend alpha

        gl_FragColor = result;

    } else {
        gl_FragColor = background;
    }
}
`;
        }



        async createVRDisplayPlanes() {
            // Create separate planes for left and right eyes (matching webXR approach)
            const geometryL = new THREE.PlaneGeometry(1, 1); // Will be scaled dynamically
            const geometryR = new THREE.PlaneGeometry(1, 1);

            // Create textures from LIF canvases
            this.lifTextureL = new THREE.CanvasTexture(this.lifCanvasL);
            this.lifTextureL.minFilter = THREE.LinearFilter;
            this.lifTextureL.magFilter = THREE.LinearFilter;
            this.lifTextureL.format = THREE.RGBAFormat;

            this.lifTextureR = new THREE.CanvasTexture(this.lifCanvasR);
            this.lifTextureR.minFilter = THREE.LinearFilter;
            this.lifTextureR.magFilter = THREE.LinearFilter;
            this.lifTextureR.format = THREE.RGBAFormat;

            // Create materials with shaders for fade-in effect
            const materialL = new THREE.ShaderMaterial({
                uniforms: {
                    uTexture: { value: this.lifTextureL },
                    uOpacity: { value: 0.0 }
                },
                vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
                fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    vec4 texColor = texture2D(uTexture, vUv);
                    gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity);
                }
            `,
                transparent: true
            });

            const materialR = new THREE.ShaderMaterial({
                uniforms: {
                    uTexture: { value: this.lifTextureR },
                    uOpacity: { value: 0.0 }
                },
                vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
                fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    vec4 texColor = texture2D(uTexture, vUv);
                    gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity);
                }
            `,
                transparent: true
            });

            // Create mesh for each eye
            this.lifMeshL = new THREE.Mesh(geometryL, materialL);
            this.lifMeshL.layers.set(1); // Left eye only
            this.lifMeshL.visible = false;
            this.scene.add(this.lifMeshL);

            this.lifMeshR = new THREE.Mesh(geometryR, materialR);
            this.lifMeshR.layers.set(2); // Right eye only
            this.lifMeshR.visible = false;
            this.scene.add(this.lifMeshR);

            // Start fade-in animation after a delay
            setTimeout(() => {
                const startTime = performance.now();
                const duration = 1000; // 1 second fade-in

                const fadeIn = () => {
                    const currentTime = performance.now();
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1.0);

                    materialL.uniforms.uOpacity.value = progress;
                    materialR.uniforms.uOpacity.value = progress;

                    if (progress < 1.0) {
                        requestAnimationFrame(fadeIn);
                    }
                };

                fadeIn();
            }, 200);

            this.log('VR display planes created for both eyes');
        }

        // Create and set up VR controllers
        setupVRControllers() {
            // Create controller objects - use InputSources to check handedness
            const session = this.renderer.xr.getSession();

            if (!session) {
                this.log('No XR session available for controller setup');
                return;
            }

            // Function to set up controllers once input sources are available
            const setupControllersByHandedness = () => {
                if (!session.inputSources || session.inputSources.length === 0) {
                    // Try again in the next frame if no input sources are available yet
                    return requestAnimationFrame(setupControllersByHandedness);
                }

                // Clear any existing controllers
                if (this.leftController) {
                    this.scene.remove(this.leftController);
                }
                if (this.rightController) {
                    this.scene.remove(this.rightController);
                }

                // Find controllers by handedness
                session.inputSources.forEach((inputSource, index) => {
                    const controller = this.renderer.xr.getController(index);

                    if (inputSource.handedness === 'left') {
                        this.log('Found left controller');
                        this.leftController = controller;
                        this.leftController.userData.inputSource = inputSource; // Store reference to inputSource
                        this.scene.add(this.leftController);
                    }
                    else if (inputSource.handedness === 'right') {
                        this.log('Found right controller');
                        this.rightController = controller;
                        this.scene.add(this.rightController);
                    }
                });
            };

            // Set up controllers
            setupControllersByHandedness();

            // Also listen for inputsourceschange event to handle controller reconnection
            session.addEventListener('inputsourceschange', setupControllersByHandedness);
        }

        // Function to check X button state on left controller
        checkXButtonState() {
            if (!this.leftController || !this.leftController.userData.inputSource || !this.leftController.userData.inputSource.gamepad) {
                return false;
            }

            const gamepad = this.leftController.userData.inputSource.gamepad;
            // X button is typically at index 4 on left controller
            if (gamepad.buttons.length > 4) {
                return gamepad.buttons[4].pressed;
            }

            return false;
        }

        // Function to set canvas dimensions based on XR camera viewports and display mode
        setCanvasDimensions(providedLeftCam, providedRightCam) {
            // Get fresh camera data if not provided
            let leftCam = providedLeftCam;
            let rightCam = providedRightCam;

            if (!leftCam || !rightCam) {
                if (!this.renderer || !this.renderer.xr.isPresenting) {
                    this.log("Cannot get fresh camera data - renderer or XR not available");
                    return false;
                }

                const xrCam = this.renderer.xr.getCamera(this.camera);
                if (!xrCam || !xrCam.isArrayCamera || xrCam.cameras.length < 2) {
                    this.log("Cannot get fresh camera data - XR camera not ready");
                    return false;
                }

                leftCam = xrCam.cameras[0];
                rightCam = xrCam.cameras[1];
                this.log("Got fresh camera data - L viewport:", leftCam.viewport.width + "x" + leftCam.viewport.height);
            }

            if (!this.lifRendererL || !this.lifRendererR || !leftCam || !rightCam) {
                this.log("Cannot set canvas dimensions - renderers or cameras not available");
                return false;
            }

            if (this.is3D > 0.5) { // 3D display
                // Size canvas to match convergence plane aspect ratio, scaled to fit within viewport
                if (this.convergencePlane && !isNaN(this.convergencePlane.width) && !isNaN(this.convergencePlane.height) &&
                    this.convergencePlane.width > 0 && this.convergencePlane.height > 0) {

                    // Calculate scale factors to fit convergence plane in viewport
                    const scaleX = leftCam.viewport.width / this.convergencePlane.width;
                    const scaleY = leftCam.viewport.height / this.convergencePlane.height;
                    const scale = Math.min(scaleX, scaleY); // Maximize scale while fitting in viewport

                    // Calculate final canvas dimensions
                    const canvasWidth = Math.round(this.convergencePlane.width * scale);
                    const canvasHeight = Math.round(this.convergencePlane.height * scale);

                    this.lifCanvasL.width = canvasWidth;
                    this.lifCanvasL.height = canvasHeight;
                    this.lifCanvasR.width = canvasWidth;
                    this.lifCanvasR.height = canvasHeight;

                    this.log("3D canvas sized to convergence plane - convergence: " +
                        this.convergencePlane.width.toFixed(2) + "x" + this.convergencePlane.height.toFixed(2) +
                        " viewport: " + leftCam.viewport.width + "x" + leftCam.viewport.height +
                        " scale: " + scale.toFixed(3) + " final: " + canvasWidth + "x" + canvasHeight);
                } else {
                    // Fallback to viewport size if convergence plane not available
                    this.log("Convergence plane not available, using viewport size");
                    this.lifCanvasL.width = leftCam.viewport.width;
                    this.lifCanvasL.height = leftCam.viewport.height;
                    this.lifCanvasR.width = rightCam.viewport.width;
                    this.lifCanvasR.height = rightCam.viewport.height;
                }
                this.viewportScale = 1;
            } else { // VR
                // Calculate scaled dimensions while preserving aspect ratio and max dimension
                const aspectRatio = this.lifView.height_px / this.lifView.width_px;
                let width = this.lifView.width_px * this.viewportScale;
                let height = this.lifView.height_px * this.viewportScale;
                if (width > this.MAX_TEX_SIZE_VR) {
                    width = this.MAX_TEX_SIZE_VR;
                    height = width * aspectRatio;
                } else if (height > this.MAX_TEX_SIZE_VR) {
                    height = this.MAX_TEX_SIZE_VR;
                    width = height / aspectRatio;
                }
                this.lifCanvasL.width = width;
                this.lifCanvasL.height = height;
                this.lifCanvasR.width = width;
                this.lifCanvasR.height = height;
                this.lifRendererL.invd = this.focus * this.lifView.inv_z_map.min;
                this.lifRendererR.invd = this.focus * this.lifView.inv_z_map.min;
            }

            // Recreate textures when canvas dimensions change to avoid texture caching issues
            if (this.lifTextureL) {
                this.lifTextureL.dispose();
                this.lifTextureL = new THREE.CanvasTexture(this.lifCanvasL);
                this.lifTextureL.minFilter = THREE.LinearFilter;
                this.lifTextureL.magFilter = THREE.LinearFilter;
                this.lifTextureL.format = THREE.RGBAFormat;
                this.log("Recreated lifTextureL with new canvas dimensions");
            }
            if (this.lifTextureR) {
                this.lifTextureR.dispose();
                this.lifTextureR = new THREE.CanvasTexture(this.lifCanvasR);
                this.lifTextureR.minFilter = THREE.LinearFilter;
                this.lifTextureR.magFilter = THREE.LinearFilter;
                this.lifTextureR.format = THREE.RGBAFormat;
                this.log("Recreated lifTextureR with new canvas dimensions");
            }

            // Update plane materials with new textures if planes exist
            if (this.lifMeshL && this.lifMeshL.material && this.lifMeshL.material.uniforms) {
                this.lifMeshL.material.uniforms.uTexture.value = this.lifTextureL;
                this.log("Updated lifMeshL material with new texture");
            }
            if (this.lifMeshR && this.lifMeshR.material && this.lifMeshR.material.uniforms) {
                this.lifMeshR.material.uniforms.uTexture.value = this.lifTextureR;
                this.log("Updated lifMeshR material with new texture");
            }

            this.log("Canvas dimensions set - width: " + this.lifCanvasL.width + " height: " + this.lifCanvasL.height + " is3D: " + this.is3D);
            return true;
        }

        // Function to reset convergence plane and tracking variables
        resetConvergencePlane(leftCam, rightCam) {
            this.log("Resetting convergence plane and tracking variables...");

            try {
                // Recalculate convergence plane based on current camera positions
                this.convergencePlane = this.locateConvergencePlane(leftCam, rightCam);
                this.log("New convergence plane:", this.convergencePlane);

                // Reset canvas dimensions based on new convergence plane calculation (get fresh camera data)
                this.setCanvasDimensions();

                // Calculate camera positions in convergence plane's local coordinate system
                const localLeftCamPos = new THREE.Vector3().copy(leftCam.position).sub(this.convergencePlane.position);
                localLeftCamPos.applyQuaternion(this.convergencePlane.quaternion.clone().invert());

                const localRightCamPos = new THREE.Vector3().copy(rightCam.position).sub(this.convergencePlane.position);
                localRightCamPos.applyQuaternion(this.convergencePlane.quaternion.clone().invert());

                // Reset initial tracking variables using local coordinates
                this.initialY = (localLeftCamPos.y + localRightCamPos.y) / 2;
                this.initialZ = (localLeftCamPos.z + localRightCamPos.z) / 2;
                this.IPD = localLeftCamPos.distanceTo(localRightCamPos);

                this.log("Reset tracking variables - initialY:" + this.initialY.toFixed(3) + " initialZ:" + this.initialZ.toFixed(3) + " IPD:" + this.IPD.toFixed(3));

                // Update plane positions and scales
                if (this.lifMeshL && this.lifMeshR && !isNaN(this.convergencePlane.width) && !isNaN(this.convergencePlane.height)) {
                    this.lifMeshL.position.copy(this.convergencePlane.position);
                    this.lifMeshL.quaternion.copy(this.convergencePlane.quaternion);
                    this.lifMeshL.scale.set(this.convergencePlane.width, this.convergencePlane.height, 1);

                    this.lifMeshR.position.copy(this.convergencePlane.position);
                    this.lifMeshR.quaternion.copy(this.convergencePlane.quaternion);
                    this.lifMeshR.scale.set(this.convergencePlane.width, this.convergencePlane.height, 1);

                    this.log("Updated plane positions and scales");
                } else {
                    this.log("Could not update plane positions - invalid values or planes not initialized");
                }

                return true;
            } catch (error) {
                this.log("Error during convergence plane reset: " + error.message);
                return false;
            }
        }

        // Convergence plane calculation with local coordinate transform (from webXR demo)
        locateConvergencePlane(leftCam, rightCam) {
            this.log("locateConvergencePlane called with:" +
                " leftCam pos: " + leftCam.position.x.toFixed(3) + "," + leftCam.position.y.toFixed(3) + "," + leftCam.position.z.toFixed(3) +
                " rightCam pos: " + rightCam.position.x.toFixed(3) + "," + rightCam.position.y.toFixed(3) + "," + rightCam.position.z.toFixed(3));

            // Get quaternions from cameras and verify they match
            const leftQuat = leftCam.quaternion;
            const rightQuat = rightCam.quaternion;

            // Verify cameras have same orientation
            if (!leftQuat.equals(rightQuat)) {
                this.log('Left and right camera orientations do not match');
            }

            // Calculate center position between left and right cameras
            const centerCam = leftCam.position.clone().add(rightCam.position).multiplyScalar(0.5);

            const leftFov = this.computeFovTanAngles(leftCam);
            const rightFov = this.computeFovTanAngles(rightCam);

            // Check if FOVs are equal and symmetric
            const isSymmetric = Math.abs(leftFov.tanUp) === Math.abs(leftFov.tanDown) &&
                Math.abs(leftFov.tanLeft) === Math.abs(leftFov.tanRight);
            const isEqual = Math.abs(leftFov.tanUp - rightFov.tanUp) < 0.0001 &&
                Math.abs(leftFov.tanDown - rightFov.tanDown) < 0.0001 &&
                Math.abs(leftFov.tanLeft - rightFov.tanLeft) < 0.0001 &&
                Math.abs(leftFov.tanRight - rightFov.tanRight) < 0.0001;
            const isMirror = Math.abs(leftFov.tanLeft) === Math.abs(rightFov.tanRight) &&
                Math.abs(leftFov.tanRight) === Math.abs(rightFov.tanLeft) &&
                Math.abs(leftFov.tanUp) === Math.abs(rightFov.tanUp) &&
                Math.abs(leftFov.tanDown) === Math.abs(rightFov.tanDown);

            this.log("FOV analysis: isSymmetric:" + isSymmetric + " isEqual:" + isEqual + " isMirror:" + isMirror);

            // Extract FOV angles for both cameras
            const u0 = leftFov.tanUp;
            const d0 = -leftFov.tanDown;
            const r0 = leftFov.tanRight;
            const l0 = -leftFov.tanLeft;

            const u1 = rightFov.tanUp;
            const d1 = -rightFov.tanDown;
            const r1 = rightFov.tanRight;
            const l1 = -rightFov.tanLeft;

            // Transform camera positions to local coordinate system (centered at centerCam, aligned with leftQuat)
            const invLeftQuat = leftQuat.clone().invert();

            // Get camera positions relative to centerCam, then rotate to local space
            const localLeftPos = leftCam.position.clone().sub(centerCam).applyQuaternion(invLeftQuat);
            const localRightPos = rightCam.position.clone().sub(centerCam).applyQuaternion(invLeftQuat);

            this.log("World positions - Left: " + leftCam.position.x.toFixed(3) + "," + leftCam.position.y.toFixed(3) + "," + leftCam.position.z.toFixed(3) +
                " Right: " + rightCam.position.x.toFixed(3) + "," + rightCam.position.y.toFixed(3) + "," + rightCam.position.z.toFixed(3) +
                " Center: " + centerCam.x.toFixed(3) + "," + centerCam.y.toFixed(3) + "," + centerCam.z.toFixed(3));
            this.log("Local positions - Left: " + localLeftPos.x.toFixed(3) + "," + localLeftPos.y.toFixed(3) + "," + localLeftPos.z.toFixed(3) +
                " Right: " + localRightPos.x.toFixed(3) + "," + localRightPos.y.toFixed(3) + "," + localRightPos.z.toFixed(3));

            // Use local coordinates for calculation
            const x0 = localLeftPos.x;
            const y0 = localLeftPos.y;
            const z0 = localLeftPos.z;

            const x1 = localRightPos.x;
            const y1 = localRightPos.y;
            const z1 = localRightPos.z;

            // Calculate display position denominators - check for division by zero
            const denomX = (r1 - l1 - r0 + l0);
            const denomY = (u1 - d1 - u0 + d0);
            this.log("Denominators for position calculation: denomX:" + denomX.toFixed(6) + " denomY:" + denomY.toFixed(6));

            if (Math.abs(denomX) < 0.0001 || isMirror) {
                this.log("RENDERING for VR");
                this.is3D = 0;
                this.log("viewportScale: " + this.viewportScale);
                // Fallback to symmetric calculation
                const DISTANCE = .063 / this.lifView.inv_z_map.min / this.focus; // focus 0.01
                const width = this.viewportScale * DISTANCE / this.lifView.focal_px * this.lifView.width_px;
                const height = this.viewportScale * DISTANCE / this.lifView.focal_px * this.lifView.height_px;
                // Position in local space, then transform back to world space
                const localPos = new THREE.Vector3(0, 0, -DISTANCE);
                const worldPos = localPos.applyQuaternion(leftQuat).add(centerCam);

                // Remove roll from quaternion by extracting yaw and pitch only
                const euler = new THREE.Euler().setFromQuaternion(leftQuat, 'YXZ');
                euler.z = 0; // Remove roll
                const noRollQuat = new THREE.Quaternion().setFromEuler(euler);

                return {
                    position: worldPos,
                    quaternion: noRollQuat,
                    width: width,
                    height: height
                };
            }

            // Calculate display position in local coordinates
            const zd = (2 * (x1 - x0) + z1 * (r1 - l1) - z0 * (r0 - l0)) / denomX;
            const xd = x0 - (r0 - l0) * (zd - z0) / 2; // should equal x1 - (r1 - l1) * (zd - z1) / 2
            const yd = y0 - (u0 - d0) * (zd - z0) / 2; // should equal y1 - (u1 - d1) * (zd - z1) / 2

            this.log("Display position calculation (local coords): xd:" + xd.toFixed(3) + "|" + (x1 - (r1 - l1) * (zd - z1) / 2).toFixed(3) +
                " yd:" + yd.toFixed(3) + "|" + (y1 - (u1 - d1) * (zd - z1) / 2).toFixed(3) + " zd:" + zd.toFixed(3));

            // Calculate display size
            const W = (z0 - zd) * (l0 + r0); // Should equal (z1-zd)*(l1+r1)
            const H = (z0 - zd) * (u0 + d0); // Should equal (z1-zd)*(u1+d1)

            // Transform local position back to world coordinates
            const localPos = new THREE.Vector3(xd, yd, zd);
            const worldPos = localPos.applyQuaternion(leftQuat).add(centerCam);

            this.log("RENDERING for 3D");
            this.log("Local result - position: " + localPos.x.toFixed(3) + "," + localPos.y.toFixed(3) + "," + localPos.z.toFixed(3) +
                " width:" + Math.abs(W).toFixed(3) + " height:" + Math.abs(H).toFixed(3));
            this.log("World result - position: " + worldPos.x.toFixed(3) + "," + worldPos.y.toFixed(3) + "," + worldPos.z.toFixed(3) +
                " width:" + Math.abs(W).toFixed(3) + " height:" + Math.abs(H).toFixed(3));

            return {
                position: worldPos,
                quaternion: leftQuat.clone(),
                width: Math.abs(W),
                height: Math.abs(H)
            };
        }

        // FOV computation from projection matrix (from webXR demo)
        computeFovTanAngles(subcam) {
            const projMatrix = subcam.projectionMatrix;
            const m00 = projMatrix.elements[0];
            const m05 = projMatrix.elements[5];
            const m08 = projMatrix.elements[8];
            const m09 = projMatrix.elements[9];

            if (Math.abs(m00) < 0.0001 || Math.abs(m05) < 0.0001) {
                console.warn("Near-zero values in projection matrix");
            }

            const left = (1 - m08) / m00;
            const right = (1 + m08) / m00;
            const bottom = (1 - m09) / m05;
            const top = (1 + m09) / m05;

            return {
                tanUp: top,
                tanDown: -bottom,
                tanLeft: -left,
                tanRight: right
            };
        }

        async loadImage(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = (err) => {
                    this.log('Failed to load image: ' + url);
                    reject(err);
                };
                img.src = url;
            });
        }

        createTestScene() {
            // Fallback test cube
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            this.testCube = new THREE.Mesh(geometry, material);
            this.testCube.position.z = -3;
            this.scene.add(this.testCube);
            this.log('Test scene created as fallback');
        }

        async startVRSession() {
            this.log('Starting VR session...');

            try {
                if (!navigator.xr) {
                    throw new Error('WebXR not supported');
                }

                const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
                this.log('VR session support: ' + isSupported);

                if (!isSupported) {
                    throw new Error('Immersive VR not supported');
                }

                const session = await navigator.xr.requestSession('immersive-vr', {
                    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
                });

                this.log('VR session created successfully');
                await this.renderer.xr.setSession(session);

            } catch (error) {
                this.log('VR session failed: ' + error.message);
                window.postMessage({ type: 'VR_LIF_ERROR', message: 'VR session failed: ' + error.message }, '*');
            }
        }

        cleanup() {
            // Clean up test cube
            if (this.testCube) {
                this.scene.remove(this.testCube);
                if (this.testCube.material) this.testCube.material.dispose();
                if (this.testCube.geometry) this.testCube.geometry.dispose();
                this.testCube = null;
            }

            // Clean up old mesh-based approach
            if (this.leftMesh) {
                this.scene.remove(this.leftMesh);
                if (this.leftMesh.material) this.leftMesh.material.dispose();
                if (this.leftMesh.geometry) this.leftMesh.geometry.dispose();
            }

            if (this.rightMesh) {
                this.scene.remove(this.rightMesh);
                if (this.rightMesh.material) this.rightMesh.material.dispose();
                if (this.rightMesh.geometry) this.rightMesh.geometry.dispose();
            }

            // Clean up new dual LIF renderer approach
            if (this.lifMeshL) {
                this.scene.remove(this.lifMeshL);
                if (this.lifMeshL.material) this.lifMeshL.material.dispose();
                if (this.lifMeshL.geometry) this.lifMeshL.geometry.dispose();
            }

            if (this.lifMeshR) {
                this.scene.remove(this.lifMeshR);
                if (this.lifMeshR.material) this.lifMeshR.material.dispose();
                if (this.lifMeshR.geometry) this.lifMeshR.geometry.dispose();
            }

            if (this.lifCanvasL) {
                document.body.removeChild(this.lifCanvasL);
            }

            if (this.lifCanvasR) {
                document.body.removeChild(this.lifCanvasR);
            }

            // Clean up LIF-related objects
            this.leftMesh = null;
            this.rightMesh = null;
            this.lifMeshL = null;
            this.lifMeshR = null;
            this.lifRendererL = null;
            this.lifRendererR = null;
            this.lifGLL = null;
            this.lifGLR = null;
            this.lifCanvasL = null;
            this.lifCanvasR = null;
            this.lifTextureL = null;
            this.lifTextureR = null;
            this.lifView = null;

            // Reset tracking variables
            this.initialY = undefined;
            this.initialZ = undefined;
            this.IPD = undefined;
            this.convergencePlane = null;
            this.xrCanvasInitialized = false;
            this.is3D = 1; // Reset to default 3D display mode
            this.viewportScale = 1.2; // Reset to default viewport scale

            // Reset controller variables
            this.leftController = null;
            this.rightController = null;
            this.leftXButtonPressed = false;
            this.leftXButtonJustPressed = false;
            this.displaySwitch = false;
        }

        render(time, frame) {
            const currentTime = time * 0.001; // Convert to seconds

            // Get XR camera
            const xrCam = this.renderer.xr.getCamera(this.camera);

            if (this.lifRendererL && this.lifRendererR && xrCam.isArrayCamera && xrCam.cameras.length === 2) {
                // =============== VR MODE ===============
                this.isVRActive = true;

                const leftCam = xrCam.cameras[0];
                const rightCam = xrCam.cameras[1];

                // Initialize canvas dimensions once when XR cameras are available
                if (!this.xrCanvasInitialized) {
                    // Calculate convergence plane to determine display type and set canvas dimensions
                    this.convergencePlane = this.locateConvergencePlane(leftCam, rightCam);

                    // Use new setCanvasDimensions function with fresh camera data
                    this.setCanvasDimensions(leftCam, rightCam);

                    this.log('XR Canvas initialized - width:' + this.lifCanvasL.width + ' height:' + this.lifCanvasL.height + ' is3D:' + this.is3D);
                    this.xrCanvasInitialized = true;

                    // Set up eye layer visibility
                    leftCam.layers.enable(1);
                    rightCam.layers.enable(2);
                }

                // OpenXR window positioning and display switch with timing (matching webXR approach)
                if (!this.displaySwitch) {
                    this.displaySwitch = true;
                    console.log('🚀 OPENXR SETUP: Starting OpenXR configuration after VR session start...');
                    setTimeout(() => {
                        console.log('⏰ OPENXR SETUP: 1-second delay complete, checking bridge availability...');
                        if (window.WebXROpenXRBridge) {
                            console.log('✅ OPENXR SETUP: WebXROpenXRBridge is available');
                            console.log('🔍 OPENXR SETUP: Bridge methods available:', Object.getOwnPropertyNames(window.WebXROpenXRBridge));

                            // FIRST: Position OpenXR window as overlay (do this BEFORE projection method)
                            if (!this.openXRWindowPositioned && this.imageCoordinates) {
                                console.log('🎯 OPENXR SETUP: Starting window positioning (image coordinates available)');
                                this.positionOpenXRWindow()
                                    .then(() => {
                                        console.log('✅ OPENXR SETUP: Window positioning completed successfully');
                                        this.openXRWindowPositioned = true;
                                    })
                                    .catch(error => {
                                        console.log('❌ OPENXR SETUP: Window positioning failed:', error.message);
                                        // Continue with projection method even if positioning fails
                                    })
                                    .finally(() => {
                                        console.log('🔧 OPENXR SETUP: Proceeding to apply projection settings...');
                                        // THEN: Set projection method and reset settings
                                        this.applyOpenXRSettings(leftCam, rightCam);
                                    });
                            } else {
                                console.log('⚠️ OPENXR SETUP: Skipping window positioning (no image coordinates or already positioned)');
                                console.log('🔍 OPENXR SETUP: openXRWindowPositioned =', this.openXRWindowPositioned);
                                console.log('🔍 OPENXR SETUP: imageCoordinates =', !!this.imageCoordinates);
                                // No coordinates, just apply settings
                                this.applyOpenXRSettings(leftCam, rightCam);
                            }
                        } else {
                            console.log('❌ OPENXR SETUP: WebXROpenXRBridge not available');
                            console.log('🔍 OPENXR SETUP: window.WebXROpenXRBridge =', window.WebXROpenXRBridge);
                            this.log("WebXROpenXRBridge not available");
                        }
                    }, 1000); // 1 second delay
                }

                // Check X button state for convergence plane reset
                if (this.isVRActive) {
                    const newXButtonState = this.checkXButtonState();

                    // Detect when X button is first pressed (transition from false to true)
                    this.leftXButtonJustPressed = newXButtonState && !this.leftXButtonPressed;

                    // Only log changes in button state to avoid console spam
                    if (newXButtonState !== this.leftXButtonPressed) {
                        this.leftXButtonPressed = newXButtonState;
                        this.log('Left X button: ' + (this.leftXButtonPressed ? 'PRESSED' : 'RELEASED'));
                    }

                    // If X button was just pressed, reset convergence plane
                    if (this.leftXButtonJustPressed) {
                        const resetSuccess = this.resetConvergencePlane(leftCam, rightCam);
                        this.log("X button convergence plane reset: " + (resetSuccess ? "SUCCESS" : "FAILED"));
                    }
                }

                // Update plane positions and scales if convergence plane exists
                if (this.convergencePlane && this.lifMeshL && this.lifMeshR) {
                    // Position and scale the planes
                    this.lifMeshL.position.copy(this.convergencePlane.position);
                    this.lifMeshL.quaternion.copy(this.convergencePlane.quaternion);
                    this.lifMeshL.scale.set(this.convergencePlane.width, this.convergencePlane.height, 1);
                    this.lifMeshL.visible = true;

                    this.lifMeshR.position.copy(this.convergencePlane.position);
                    this.lifMeshR.quaternion.copy(this.convergencePlane.quaternion);
                    this.lifMeshR.scale.set(this.convergencePlane.width, this.convergencePlane.height, 1);
                    this.lifMeshR.visible = true;
                }

                // Calculate camera positions in convergence plane's local coordinate system
                const localLeftCamPos = new THREE.Vector3().copy(leftCam.position).sub(this.convergencePlane.position);
                localLeftCamPos.applyQuaternion(this.convergencePlane.quaternion.clone().invert());

                const localRightCamPos = new THREE.Vector3().copy(rightCam.position).sub(this.convergencePlane.position);
                localRightCamPos.applyQuaternion(this.convergencePlane.quaternion.clone().invert());

                // Capture initial head positions once (in local coordinates)
                if (this.initialY === undefined) {
                    this.initialY = (localLeftCamPos.y + localRightCamPos.y) / 2;
                    this.initialZ = (localLeftCamPos.z + localRightCamPos.z) / 2;
                    this.IPD = localLeftCamPos.distanceTo(localRightCamPos);
                    this.log('Initial tracking - Y:' + this.initialY + ' Z:' + this.initialZ + ' IPD:' + this.IPD);
                }

                // Render left eye (matching webXR renderCam setup)
                this.lifRendererL.renderCam.pos.x = localLeftCamPos.x / this.IPD;
                this.lifRendererL.renderCam.pos.y = (this.initialY - localLeftCamPos.y) / this.IPD;
                this.lifRendererL.renderCam.pos.z = (this.initialZ - localLeftCamPos.z) / this.IPD;

                // Apply skew correction
                this.lifRendererL.renderCam.sk.x = -this.lifRendererL.renderCam.pos.x * this.lifRendererL.invd /
                    (1 - this.lifRendererL.renderCam.pos.z * this.lifRendererL.invd);
                this.lifRendererL.renderCam.sk.y = -this.lifRendererL.renderCam.pos.y * this.lifRendererL.invd /
                    (1 - this.lifRendererL.renderCam.pos.z * this.lifRendererL.invd);

                // Set focal length with z-distance compensation (matching webXR exactly)
                this.lifRendererL.renderCam.f = this.lifRendererL.views[0].f * this.lifRendererL.viewportScale() *
                    Math.max(1 - this.lifRendererL.renderCam.pos.z * this.lifRendererL.invd, 0) / this.viewportScale;

                this.lifRendererL.drawScene(currentTime);
                this.lifTextureL.needsUpdate = true;

                // Render right eye
                this.lifRendererR.renderCam.pos.x = localRightCamPos.x / this.IPD;
                this.lifRendererR.renderCam.pos.y = (this.initialY - localRightCamPos.y) / this.IPD;
                this.lifRendererR.renderCam.pos.z = (this.initialZ - localRightCamPos.z) / this.IPD;

                // Apply skew correction
                this.lifRendererR.renderCam.sk.x = -this.lifRendererR.renderCam.pos.x * this.lifRendererR.invd /
                    (1 - this.lifRendererR.renderCam.pos.z * this.lifRendererR.invd);
                this.lifRendererR.renderCam.sk.y = -this.lifRendererR.renderCam.pos.y * this.lifRendererR.invd /
                    (1 - this.lifRendererR.renderCam.pos.z * this.lifRendererR.invd);

                // Set focal length with z-distance compensation (matching webXR exactly)
                this.lifRendererR.renderCam.f = this.lifRendererR.views[0].f * this.lifRendererR.viewportScale() *
                    Math.max(1 - this.lifRendererR.renderCam.pos.z * this.lifRendererR.invd, 0) / this.viewportScale;

                this.lifRendererR.drawScene(currentTime);
                this.lifTextureR.needsUpdate = true;

            } else {
                // ============ NOT IN VR ============
                this.isVRActive = false;

                // Hide VR planes
                if (this.lifMeshL) this.lifMeshL.visible = false;
                if (this.lifMeshR) this.lifMeshR.visible = false;
            }

            if (!this.renderer.xr.isPresenting) {
                this.renderer.clear();
            }
            this.renderer.render(this.scene, this.camera);
        }
    }

    // Initialize the VR system
    console.log('🚀 Initializing VR system...');
    window.vrSystem = new PageContextVRSystem();

    // Auto-initialize
    window.vrSystem.init().then(() => {
        console.log('✅ VR system initialized successfully');
    }).catch(error => {
        console.error('❌ VR system initialization failed:', error);
    });

    // Listen for commands from content script  
    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data.type?.startsWith('VR_LIF_COMMAND_')) return;

        console.log('📨 VR command received:', event.data.type);

        switch (event.data.type) {
            case 'VR_LIF_COMMAND_INIT':
                console.log('🎬 VR initialization command');
                // System is already initialized, just acknowledge
                window.postMessage({ type: 'VR_LIF_LOG', message: 'VR system ready' }, '*');
                break;
            case 'VR_LIF_COMMAND_START_VR':
                if (event.data.lifUrl) {
                    window.vrSystem.loadAndStartVR(event.data.lifUrl);
                }
                break;
            case 'VR_LIF_COMMAND_START_VR_WITH_DATA':
                if (event.data.lifData) {
                    window.vrSystem.startVRWithBlobData(event.data.lifData, event.data.imageCoordinates);
                }
                break;
            case 'VR_LIF_COMMAND_EXIT_VR':
                if (window.vrSystem.renderer && window.vrSystem.renderer.xr.isPresenting) {
                    window.vrSystem.renderer.xr.getSession().end();
                }
                break;
        }
    });

    console.log('✅ VR system ready for commands');
}