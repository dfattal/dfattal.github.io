// LifLoader.js

export class LifLoaderOld {
    /**
     * @param {Object} options
     * @param {boolean} [options.debug=false] - If true, debugs images by adding them to the document.
     */
    constructor({ debug = false } = {}) {
        this.debug = debug;
        this._debugCount = 0;
        // Saved views (with loaded images) are stored here after load().
        this.views = null;
        this.stereo_render_data = null;
    }

    async load(file) {
        const arrayBuffer = await file.arrayBuffer();
        const metadata = await this._parseBinary(arrayBuffer);
        const lifJson = metadata.getJsonMeta();
        console.log('LIF JSON:', lifJson);
        // Replace legacy keys with standardized names.
        let result = this.replaceKeys(lifJson,
            ['albedo', 'disparity', 'inv_z_dist', 'max_disparity', 'min_disparity', 'inv_z_dist_min', 'inv_z_dist_max'],
            ['image', 'inv_z_map', 'inv_z_map', 'max', 'min', 'max', 'min']
        );
        await this._processViews(result, metadata, arrayBuffer);
        result.views = this.replaceKeys(result.views,
            ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom', 'frustum_skew', 'rotation_slant', 'render_data'],
            ['width', 'height', 'f', 'invZ', 'layers', 'sk', 'sl', 'stereo_render_data']
        )
        // Load images from URLs and store them as "loadedImage" properties.
        await this._parseObjectAndCreateTextures(result.views);

        // Save the views internally for later texture binding.
        this.views = result.views;
        this.stereo_render_data = result.stereo_render_data;

        return {
            views: result.views,
            stereo_render_data: result.stereo_render_data
        };
    }

    /**
     * Creates textures from the saved images using the provided WebGL context.
     * Returns a deep-cloned version of the views, augmented with gl-bound textures,
     * and removes the saved images from that clone.
     *
     * @param {WebGLRenderingContext} gl - The WebGL context to bind textures.
     * @returns {Object} The new views object with textures.
     */
    bindTextures(gl) {
        const clonedViews = this._deepClone(this.views);
        this._bindTextures(clonedViews, gl);
        return clonedViews;
    }

    // --- Private Methods ---

    async _parseBinary(arrayBuffer) {
        const fullSize = arrayBuffer.byteLength;
        const stream = new BinaryStream(arrayBuffer);
        // Check magic end marker.
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

    handleBlob(blob) {
        return URL.createObjectURL(blob);
    }

    async getImageDimensions(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    }

    async _processViews(result, metadata, arrayBuffer) {
        if (!result.views) return;

        const makeUrls = (obj) => {
            // Process main image.
            if (obj.image) {
                if (obj.image.blob_id === -1) {
                    const rgbBlob = new Blob([arrayBuffer], { type: 'image/jpeg' });
                    obj.image.url = this.handleBlob(rgbBlob);
                } else {
                    const rgbBlob = metadata.getFieldByType(obj.image.blob_id).toBlob();
                    obj.image.url = this.handleBlob(rgbBlob);
                }
            }
            // Process inverse z-map.
            if (obj.inv_z_map) {
                const invZBlob = metadata.getFieldByType(obj.inv_z_map.blob_id).toBlob();
                obj.inv_z_map.url = this.handleBlob(invZBlob);
            }
            // Process mask if available.
            if (obj.mask) {
                const maskBlob = metadata.getFieldByType(obj.mask.blob_id).toBlob();
                obj.mask.url = this.handleBlob(maskBlob);
            }
        };

        for (const view of result.views) {
            makeUrls(view);

            // Legacy support: calculate dimensions if not already provided.
            if (!view.width_px) {
                const dims = await this.getImageDimensions(view.image.url);
                view.width_px = dims.width;
                view.height_px = dims.height;
                view.focal_px = view.camera_data.focal_ratio_to_width * dims.width;
                view.position = view.camera_data.position;
                view.frustum_skew = view.camera_data.frustum_skew;
                view.rotation = view.camera_data.rotation;
                view.invZ.max /= -view.camera_data.focal_ratio_to_width;
                view.invZ.min /= -view.camera_data.focal_ratio_to_width;
            }

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
                        layer.invZ.min /= 1 + outpaint_width_px / view.width_px;
                        layer.invZ.max /= 1 + outpaint_width_px / view.width_px;
                    }
                    if (layer.outpainting_added_width_px) {
                        outpaint_width_px = layer.outpainting_added_width_px;
                        outpaint_height_px = layer.outpainting_added_height_px;
                        layer.width_px = view.width_px + outpaint_width_px;
                        layer.height_px = view.height_px + outpaint_height_px;
                        layer.focal_px = view.focal_px;
                        layer.invZ.max /= -layer.camera_data.focal_ratio_to_width;
                        layer.invZ.min /= -layer.camera_data.focal_ratio_to_width;
                        delete layer.camera_data;
                        delete layer.outpainting_added_width_px;
                        delete layer.outpainting_added_height_px;
                        delete view.layered_depth_image_data;
                        delete view.camera_data;
                    }
                }
            }
        }
    }

    // Loads images from the processed views.
    // For each image key, the loaded image is stored in a "loadedImage" property.
    async _parseObjectAndCreateTextures(obj) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (key === 'image') {
                    try {
                        const img = await this._loadImage2(obj[key].url);
                        obj[key].loadedImage = img;
                        if (this.debug) {
                            this.debugTexture(img);
                        }
                    } catch (error) {
                        console.error('Error loading image:', error);
                    }
                } else if (key === 'invZ' && obj.hasOwnProperty('mask')) {
                    try {
                        const maskImg = await this._loadImage2(obj.mask.url);
                        const invzImg = await this._loadImage2(obj.invZ.url);
                        const combined = this._create4ChannelImage(invzImg, maskImg);
                        obj.invZ.loadedImage = combined;
                        if (this.debug) {
                            this.debugTexture(combined);
                        }
                    } catch (error) {
                        console.error('Error loading mask or invZ image:', error);
                    }
                } else if (key === 'invZ') { // When there's no mask.
                    try {
                        const invzImg = await this._loadImage2(obj.invZ.url);
                        obj.invZ.loadedImage = invzImg;
                    } catch (error) {
                        console.error('Error loading invZ image:', error);
                    }
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    await this._parseObjectAndCreateTextures(obj[key]);
                }
            }
        }
    }

    // Recursively traverses an object and, for each property that has a loadedImage,
    // creates a texture using the provided gl context and then removes the loadedImage property.
    _bindTextures(obj, gl) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (obj[key] && obj[key].loadedImage) {
                    obj[key].texture = this._createTexture(gl, obj[key].loadedImage);
                    delete obj[key].loadedImage;
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    this._bindTextures(obj[key], gl);
                }
            }
        }
    }

    // Encapsulated createTexture function using the provided gl context.
    _createTexture(gl, image) {
        if (!image || image.width === 0 || image.height === 0) {
            console.error("Invalid image passed to createTexture:", image);
            return null;
        }
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return texture;
    }

    // Debug function to display images if debugging is enabled.
    debugTexture(imgData) {
        const img = document.createElement('img');
        img.style.width = '50%';
        img.id = `debug-im${this._debugCount}`;
        img.classList.add('debug-im');
        if (imgData.src) {
            img.src = imgData.src;
            document.body.appendChild(document.createElement('br'));
        } else {
            img.src = imgData.toDataURL ? imgData.toDataURL() : '';
        }
        document.body.appendChild(img);
        this._debugCount++;
    }

    // Private method to load an image from a URL.
    async _loadImage2(url) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        return new Promise((resolve) => {
            img.onload = () => resolve(img);
        });
    }

    // Private method that combines an RGB image with a mask image into a 4-channel image.
    // Returns the canvas element which can be used as a texture source.
    _create4ChannelImage(rgbImage, maskImage) {
        const width = rgbImage.width;
        const height = rgbImage.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        // Draw the RGB image.
        ctx.drawImage(rgbImage, 0, 0, width, height);
        const rgbData = ctx.getImageData(0, 0, width, height).data;
        // Draw the mask image.
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(maskImage, 0, 0, width, height);
        const maskData = ctx.getImageData(0, 0, width, height).data;
        // Create combined image data.
        const combinedData = ctx.createImageData(width, height);
        for (let i = 0; i < rgbData.length / 4; i++) {
            combinedData.data[i * 4] = rgbData[i * 4];
            combinedData.data[i * 4 + 1] = rgbData[i * 4 + 1];
            combinedData.data[i * 4 + 2] = rgbData[i * 4 + 2];
            // Use the red channel of the mask as alpha.
            combinedData.data[i * 4 + 3] = maskData[i * 4];
        }
        ctx.putImageData(combinedData, 0, 0);
        return canvas;
    }

    // Private method to deeply clone an object.
    _deepClone(obj) {
        // If obj is null, or not an object, or is a DOM element, return it as-is.
        if (obj === null || typeof obj !== 'object' ||
            obj instanceof HTMLImageElement ||
            obj instanceof HTMLCanvasElement) {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this._deepClone(item));
        }
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this._deepClone(obj[key]);
            }
        }
        return cloned;
    }
}

export class LifLoader {
    /**
     * @param {Object} options
     * @param {boolean} [options.debug=false] - If true, debugs images by adding them to the document.
     */
    constructor({ debug = false } = {}) {
        this.debug = debug;
        this._debugCount = 0;
        // Saved views (processed but not yet loaded into WebGL) are stored here after load().
        this.views = null;
        this.stereo_render_data = null;
        this.animations = null;
    }

    /**
     * Loads a LIF file and extracts its metadata, views, and stereo rendering data.
     * @param {File} file - The LIF file to be loaded.
     * @returns {Object} The parsed views and stereo rendering data.
     */
    async load(file) {
        const arrayBuffer = await file.arrayBuffer();
        const metadata = await this._parseBinary(arrayBuffer);
        const lifJson = metadata.getJsonMeta();
        console.log('LIF JSON:', lifJson);

        // Replace legacy keys with standardized names.
        let result = this.replaceKeys(lifJson,
            ['albedo', 'disparity', 'inv_z_dist', 'max_disparity', 'min_disparity', 'inv_z_dist_min', 'inv_z_dist_max'],
            ['image', 'inv_z_map', 'inv_z_map', 'max', 'min', 'max', 'min']
        );

        // Process views and store them in this.views
        this.views = await this._processViews(result, metadata, arrayBuffer);

        // Store stereo rendering data separately
        this.stereo_render_data = result.stereo_render_data;

        return {
            views: this.views,
            stereo_render_data: this.stereo_render_data
        };
    }

    /**
     * Returns the processed views.
     * @returns {Array} The processed views stored in this.views.
     */
    getViews() {
        if (!this.views) {
            throw new Error("Views have not been loaded yet. Call load() first.");
        }
        return this.views;
    }

    /**
     * Returns the stereo rendering data.
     * @returns {Object} The stereo rendering data stored in this.stereo_render_data.
     */
    getStereoRenderData() {
        if (!this.stereo_render_data) {
            throw new Error("Stereo render data has not been loaded yet. Call load() first.");
        }
        return this.stereo_render_data;
    }

    /**
     * Returns the animations data.
     * @returns {Object} The animations data stored in this.animations.
     */
    getAnimations() {
        if (!this.animations) {
            throw new Error("Animations have not been loaded yet. Call load() first.");
        }
        return this.animations;
    }

    /**
     * Placeholder for getLoadedViews()
     * This function will later replace blob URLs with actual loaded images.
     */
    // getLoadedViews() {
    //     // TODO: Replace blob URLs with actual images.
    // }

    // --- Private Methods ---

    async _parseBinary(arrayBuffer) {
        const fullSize = arrayBuffer.byteLength;
        const stream = new BinaryStream(arrayBuffer);

        // Check magic end marker.
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

    async _processViews(result, metadata, arrayBuffer) {
        if (!result.views) return [];

        const makeUrls = (obj) => {
            if (obj.image) {
                if (obj.image.blob_id === -1) {
                    const rgbBlob = new Blob([arrayBuffer], { type: 'image/jpeg' });
                    obj.image.url = URL.createObjectURL(rgbBlob);
                } else {
                    const rgbBlob = metadata.getFieldByType(obj.image.blob_id).toBlob();
                    obj.image.url = URL.createObjectURL(rgbBlob);
                }
            }

            if (obj.inv_z_map) {
                const invZBlob = metadata.getFieldByType(obj.inv_z_map.blob_id).toBlob();
                obj.inv_z_map.url = URL.createObjectURL(invZBlob);
            }

            if (obj.mask) {
                const maskBlob = metadata.getFieldByType(obj.mask.blob_id).toBlob();
                obj.mask.url = URL.createObjectURL(maskBlob);
            }
        };

        for (const view of result.views) {
            makeUrls(view);

            // Legacy support: calculate dimensions if not already provided.
            if (!view.width_px) {
                const dims = await this.getImageDimensions(view.image.url);
                view.width_px = dims.width;
                view.height_px = dims.height;
                view.focal_px = view.camera_data.focal_ratio_to_width * dims.width;
                view.position = view.camera_data.position;
                view.frustum_skew = view.camera_data.frustum_skew;
                view.rotation = view.camera_data.rotation;
                view.invZ.max /= -view.camera_data.focal_ratio_to_width;
                view.invZ.min /= -view.camera_data.focal_ratio_to_width;
            }

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
                        layer.invZ.min /= 1 + outpaint_width_px / view.width_px;
                        layer.invZ.max /= 1 + outpaint_width_px / view.width_px;
                    }
                    if (layer.outpainting_added_width_px) {
                        outpaint_width_px = layer.outpainting_added_width_px;
                        outpaint_height_px = layer.outpainting_added_height_px;
                        layer.width_px = view.width_px + outpaint_width_px;
                        layer.height_px = view.height_px + outpaint_height_px;
                        layer.focal_px = view.focal_px;
                        layer.invZ.max /= -layer.camera_data.focal_ratio_to_width;
                        layer.invZ.min /= -layer.camera_data.focal_ratio_to_width;
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

// --- Helper Classes ---

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