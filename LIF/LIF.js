
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
        const value = this.dataView.getUint16(this.offset, false); // Big-endian
        this.offset += 2;
        return value;
    }
    readUInt32() {
        const value = this.dataView.getUint32(this.offset, false); // Big-endian
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

async function parseBinary(arrayBuffer) {
    const fullSize = arrayBuffer.byteLength;
    const bf = new BinaryStream(arrayBuffer);
    bf.offset = fullSize - 2;
    const endMarker = bf.readUInt16();
    if (endMarker !== 0x1e1a) {
        throw new Error('Not a LIF file');
    }
    bf.offset = fullSize - 6;
    const regionOffset = bf.readUInt32();
    bf.offset = fullSize - regionOffset;

    const metadata = new Metadata();
    metadata.fieldCount = bf.readUInt32();
    //console.log(metadata.fieldCount);
    for (let i = 0; i < metadata.fieldCount; i++) {
        const fieldType = bf.readUInt32();
        const fieldDataSize = bf.readUInt32();
        const fieldData = bf.readBytes(fieldDataSize);
        const field = new Field(fieldType, fieldData);
        metadata.addField(field);
    }
    metadata.regionOffset = regionOffset;
    metadata.fullSize = fullSize;
    //console.log(metadata);
    return metadata;
}

function handleBlob(blob) {
    return URL.createObjectURL(blob);
}

async function parseLif5(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = {};
    const lifMeta = await parseBinary(arrayBuffer);
    const lifJson = lifMeta.getJsonMeta();
    //console.log(lifJson);
    const layers = [];
    for (const view of lifJson.views) {
        if (view.albedo) {
            if (view.albedo.blob_id == -1 /*source image*/) {
                const albedo = new Blob([arrayBuffer], { type: 'image/jpeg' });
                result.rgb = handleBlob(albedo);
            } else {
                const albedo = lifMeta.getFieldByType(view.albedo.blob_id).toBlob();
                result.rgb = handleBlob(albedo);
            }
        }
        if (view.disparity) {
            const disparity = lifMeta.getFieldByType(view.disparity.blob_id).toBlob();
            result.disp = handleBlob(disparity);
            result.minDisp = view.disparity.min_disparity;
            result.maxDisp = view.disparity.max_disparity;
        }
        if (view.camera_data) {
            result.f = view.camera_data.focal_ratio_to_width;
        }
        let layers = view.layers_top_to_bottom;
        if (!layers) layers = view.layered_depth_image_data.layers_top_to_bottom;
        result.layers = [];
        for (const layer of layers) {
            const rgb = lifMeta.getFieldByType(layer.albedo.blob_id).toBlob();
            const disp = lifMeta.getFieldByType(layer.disparity.blob_id).toBlob();
            const mask = lifMeta.getFieldByType(layer.mask.blob_id).toBlob();
            const layObj = {};
            layObj.rgb = handleBlob(rgb);
            layObj.disp = handleBlob(disp);
            layObj.mask = handleBlob(mask);
            layObj.minDisp = layer.disparity.min_disparity;
            layObj.maxDisp = layer.disparity.max_disparity;
            //layObj.f = ...
            result.layers.push(layObj);
            //console.log(layer);
            // access other layer propeties here if needed
        }
        //        if (view.layered_depth_image_data) {
        //          result.outpaintWidth = view.layered_depth_image_data.outpainting_added_width_px;
        //        } else {
        //          result.totalOutpaintedWidth = view.view.layers_top_to_bottom[0].outpainting_added_width_px;
        //        }
    }
    return result;
}

function replaceKeys(obj, oldKeys, newKeys) {
    if (typeof obj !== 'object' || obj === null) {
        return obj; // Return the value if it's not an object
    }

    const newObj = {};

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            // Find the index of the key in the oldKeys array
            const index = oldKeys.indexOf(key);
            // Determine the new key: replace it if found, otherwise keep the original key
            const updatedKey = (index !== -1) ? newKeys[index] : key;
            // Recursively apply the function to nested objects
            newObj[updatedKey] = replaceKeys(obj[key], oldKeys, newKeys);
        }
    }

    return Array.isArray(obj) ? Object.values(newObj) : newObj;
}

async function getImageDimensions(url) {
    const img = new Image();

    return new Promise((resolve, reject) => {
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };

        img.onerror = (error) => {
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

function arrayBufferToBinaryString(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return binary;
}

async function parseLif53(file) {
    const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
    const lifMeta = await parseBinary(arrayBuffer);
    const lifJson = lifMeta.getJsonMeta();
    console.dir(lifJson, { depth: null });
    let result = replaceKeys(lifJson,
        ['albedo', 'disparity', 'inv_z_dist', 'max_disparity', 'min_disparity', 'inv_z_dist_min', 'inv_z_dist_max'],
        ['image', 'inv_z_map', 'inv_z_map', 'max', 'min', 'max', 'min']
    );

    function make_urls(obj) {
        // handle image
        if (obj.image.blob_id == -1 /*source image*/) {
            const rgb = new Blob([arrayBuffer], { type: 'image/jpeg' });
            obj.image.url = handleBlob(rgb);
        } else {
            const rgb = lifMeta.getFieldByType(obj.image.blob_id).toBlob();
            obj.image.url = handleBlob(rgb);
        }

        // handle invZ
        const invZmap = lifMeta.getFieldByType(obj.inv_z_map.blob_id).toBlob();
        obj.inv_z_map.url = handleBlob(invZmap);

        //handle mask
        if (obj.mask) {
            const mask = lifMeta.getFieldByType(obj.mask.blob_id).toBlob();
            obj.mask.url = handleBlob(mask);
        }
    }

    if (result.views) {

        for (const view of result.views) {

            make_urls(view);
            if (!view.width_px) { // prior to 5.3
                const dims = await getImageDimensions(view.image.url);
                view.width_px = dims.width;
                view.height_px = dims.height;
                view.focal_px = view.camera_data.focal_ratio_to_width * dims.width;
                view.position = view.camera_data.position;
                view.frustum_skew = view.camera_data.frustum_skew;
                view.rotation = view.camera_data.rotation;
                view.inv_z_map.max /= -view.camera_data.focal_ratio_to_width;
                view.inv_z_map.min /= -view.camera_data.focal_ratio_to_width;
            }

            let outpaint_width_px, outpaint_height_px, camera_data;

            if (!view.layers_top_to_bottom) { // 5.1
                view.layers_top_to_bottom = view.layered_depth_image_data.layers_top_to_bottom;
                outpaint_width_px = view.layered_depth_image_data.outpainting_added_width_px;
                outpaint_height_px = view.layered_depth_image_data.outpainting_added_height_px;
                camera_data = view.camera_data;
                delete view.camera_data;
            }

            let layers = view.layers_top_to_bottom;
            for (const layer of layers) {
                make_urls(layer);
                if (camera_data) { // 5.1
                    layer.camera_data = camera_data;
                    layer.outpainting_added_width_px = outpaint_width_px;
                    layer.outpainting_added_height_px = outpaint_height_px;
                    layer.inv_z_map.min /= 1 + outpaint_width_px / view.width_px;
                    layer.inv_z_map.max /= 1 + outpaint_width_px / view.width_px;
                }
                if (layer.outpainting_added_width_px) { //5.2
                    outpaint_height_px = layer.outpainting_added_height_px;
                    outpaint_width_px = layer.outpainting_added_width_px;
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
    return result;
}

// ShaderImage Class
class lifViewer {
    static instances = [];

    constructor(lifUrl, container, height = 300, autoplay = false, mouseOver = true) {
        lifViewer.instances.push(this);
        this.MAX_LAYERS = 4;
        this.lifUrl = lifUrl;
        this.animations = []; // will store LIF animation list
        this.container = container;
        this.autoplay = autoplay;
        this.running = false;
        this.mouseOver = mouseOver;
        this.mouseOverAmplitude = 1;
        this.mousePosOld = { x: 0, y: 0 };
        this.mousePos = { x: 0, y: 0 };

        this.img = document.createElement('img');
        this.img.src = lifUrl;
        this.img.height = height;
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl');
        this.canvas.style.display = 'none';

        if (this.lifUrl) this.init();
        this.disableAnim = false;
        this.currentAnimation;


        this.renderCam = {
            pos: { x: 0, y: 0, z: 0 }, // default
            sl: { x: 0, y: 0 },
            sk: { x: 0, y: 0 },
            roll: 0,
            f: 0 // placeholder
        };

        this.startTime = Date.now() / 1000;
        this.phase = 0;
        this.focus = 0;
        this.animationFrame = null;
        this.render = this.render.bind(this);

    }

    // Static method to disable animations for all instances
    static disableAllAnimations() {
        lifViewer.instances.forEach(instance => {
            instance.disableAnim = true;
        });
    }

    static enableAllAnimations() {
        lifViewer.instances.forEach(instance => {
            instance.disableAnim = false;
        });
    }

    // Helper to await the image load
    async loadImage() {
        return new Promise((resolve, reject) => {
            this.img.onload = () => resolve();
            this.img.onerror = () => reject(new Error('Image failed to load'));
        });
    }

    async afterLoad() { };

    async replaceKeys(obj, oldKeys, newKeys) {
        if (typeof obj !== 'object' || obj === null) {
            return obj; // Return the value if it's not an object
        }

        const newObj = {};

        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                // Find the index of the key in the oldKeys array
                const index = oldKeys.indexOf(key);
                // Determine the new key: replace it if found, otherwise keep the original key
                const updatedKey = (index !== -1) ? newKeys[index] : key;
                // Recursively apply the function to nested objects
                newObj[updatedKey] = replaceKeys(obj[key], oldKeys, newKeys);
            }
        }

        return Array.isArray(obj) ? Object.values(newObj) : newObj;
    }

    async initWebGLResources() {
        // Initialize or reinitialize WebGL resources (shaders, textures, etc.)
        await this.parseObjAndCreateTextures(this.views);

        this.fragmentShaderUrl = this.views.length < 2 ? "../Shaders/rayCastMonoLDIGlow.glsl" : "../Shaders/rayCastStereoLDIGlow.glsl";
        this.vertexShaderUrl = "../Shaders/vertex.glsl";

        if (this.views.length < 2) {
            await this.setupWebGLMN();  // Setup shaders and buffers for mono view
        } else {
            await this.setupWebGLST();  // Setup shaders and buffers for stereo view
        }
    }

    async init() {

        await this.loadImage();
        this.container.appendChild(this.img);
        this.container.appendChild(this.canvas);
        this.canvas.addEventListener('mousemove', function (event) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left - rect.width / 2; // Get mouse X position relative to the canvas
            const mouseY = event.clientY - rect.top - rect.height / 2; // Get mouse Y position relative to the canvas

            // Calculate the position relative to the center, normalized between -0.5 and +0.5
            this.mousePos.x = (mouseX / rect.width);
            this.mousePos.y = (mouseY / rect.width);

            // console.log(`(${relativeX}, ${relativeY}`); // Outputs values between -0.5 and +0.5
        }.bind(this));
        this.afterLoad();
        this.resizeCanvasToContainer();
        const response = await fetch(this.lifUrl);
        const blob = await response.blob();
        const file = new File([blob], 'lifImage.jpg', { type: 'image/jpeg' });
        this.lifInfo = await parseLif53(file);
        this.views = await this.replaceKeys(this.lifInfo.views,
            ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom', 'frustum_skew', 'rotation_slant'],
            ['width', 'height', 'f', 'invZ', 'layers', 'sk', 'sl']
        );

        if (this.lifInfo.animations) this.animations = this.lifInfo.animations;
        // for now hardcode animations[0];
        const zAmp = 0.5 / this.views[0].invZ.min;
        //const invd = this.focus * this.views[0].layers[0].invZ.min; // set focus point
        const invd = Math.abs(this.views[0].sk.x) / 0.5 // usualy zero with no black band for pre-converged stereo
        const xc = this.views.length > 1 ? -0.5 : 0;
        this.animations[0] = {
            type: "harmonic",
            name: "Default Animation",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: invd,
                position: {
                    x: { amplitude: 0.0, phase: 0.0, bias: xc },
                    y: { amplitude: 0.0, phase: 0.0, bias: 0 },
                    z: { amplitude: zAmp / 2, phase: -0.25, bias: zAmp / 2 }
                }
            }
        }
        this.currentAnimation = this.animations[0];

        await this.initWebGLResources();

        if (this.autoplay) {
            this.startAnimation();
            // setTimeout(() => {
            //     this.stopAnimation();
            // }, 4000);
        }
    }

    async loadImage2(url) { // without cache busting
        const img = new Image();
        img.crossorigin = "anonymous"; // Set cross-origin attribute
        img.src = url;
        return new Promise((resolve) => {
            img.onload = () => resolve(img);
        });
    }

    createTexture(image) {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        return texture;
    }

    createTexture2(image) {
        const downsampleFactor = image.height / 1024;
        const width = Math.floor(image.width / downsampleFactor);
        const height = Math.floor(image.height / downsampleFactor);

        // Create a temporary canvas to downsample the image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');

        // Ensure the alpha channel is preserved by enabling transparency on the canvas
        ctx.clearRect(0, 0, width, height);  // Clear the canvas
        ctx.drawImage(image, 0, 0, width, height);  // Draw the image to the canvas with downsampling

        // Create the WebGL texture
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        // Bind the downsampled canvas as the texture data with RGBA format
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, tempCanvas);

        // Set texture parameters for scaling and wrapping
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        return texture;
    }

    // create4ChannelImage(dispImage, maskImage) {

    //     const width = dispImage.width;
    //     const height = dispImage.height;

    //     const canvas = document.createElement('canvas');
    //     canvas.width = width;
    //     canvas.height = height;

    //     // Pass { willReadFrequently: true } to optimize for frequent read operations
    //     const ctx = canvas.getContext('2d', { willReadFrequently: true });

    //     // Draw the disp image
    //     ctx.drawImage(dispImage, 0, 0, width, height);
    //     const dispData = ctx.getImageData(0, 0, width, height).data;

    //     // Draw the mask image
    //     ctx.clearRect(0, 0, width, height);
    //     ctx.drawImage(maskImage, 0, 0, width, height);
    //     const maskData = ctx.getImageData(0, 0, width, height).data;

    //     // Create a new image data object for the 4-channel image
    //     const combinedData = ctx.createImageData(width, height);
    //     for (let i = 0; i < dispData.length / 4; i++) {
    //         combinedData.data[i * 4] = dispData[i * 4];
    //         combinedData.data[i * 4 + 1] = dispData[i * 4 + 1];
    //         combinedData.data[i * 4 + 2] = dispData[i * 4 + 2];
    //         combinedData.data[i * 4 + 3] = maskData[i * 4]; // Use the red channel of the mask image for the alpha channel
    //     }

    //     return combinedData;
    // }
    create4ChannelImage(dispImage, maskImage) {
        const width = dispImage.width;
        const height = dispImage.height;

        // Create a new canvas to store the combined 4-channel image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Draw the dispImage (RGB) to the canvas
        ctx.drawImage(dispImage, 0, 0, width, height);
        const dispData = ctx.getImageData(0, 0, width, height).data;

        // Draw the maskImage to the canvas (temporarily) to retrieve its pixel data
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(maskImage, 0, 0, width, height);
        const maskData = ctx.getImageData(0, 0, width, height).data;

        // Now combine the dispData (RGB) with maskData (used for alpha)
        const combinedImageData = ctx.createImageData(width, height);
        const combinedData = combinedImageData.data;

        for (let i = 0; i < dispData.length; i += 4) {
            combinedData[i] = dispData[i];       // Red
            combinedData[i + 1] = dispData[i + 1]; // Green
            combinedData[i + 2] = dispData[i + 2]; // Blue
            combinedData[i + 3] = maskData[i];   // Alpha (from mask image's red channel)
        }

        // Put the new 4-channel (RGBA) image back into the canvas
        ctx.putImageData(combinedImageData, 0, 0);

        // Return the canvas itself, which can be used in createTexture
        return canvas;
    }

    async parseObjAndCreateTextures(obj) {
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (key === 'image') {
                    try {
                        const img = await this.loadImage2(obj[key].url);
                        obj[key]['texture'] = this.createTexture2(img);
                        console.log()
                    } catch (error) {
                        console.error('Error loading image:', error);
                    }
                } else if (key === 'invZ' && obj.hasOwnProperty('mask')) {
                    try {
                        const maskImg = await this.loadImage2(obj['mask'].url);
                        const invzImg = await this.loadImage2(obj['invZ'].url);
                        const maskedInvz = this.create4ChannelImage(invzImg, maskImg);
                        obj['invZ']['texture'] = this.createTexture2(maskedInvz);
                    } catch (error) {
                        console.error('Error loading mask or invz image:', error);
                    }
                } else if (key === 'invZ') { // no mask
                    try {
                        const invzImg = await this.loadImage2(obj['invZ'].url);
                        obj['invZ']['texture'] = this.createTexture2(invzImg);
                    } catch (error) {
                        console.error('Error loading invz image:', error);
                    }

                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    // Recursively parse nested objects
                    await this.parseObjAndCreateTextures(obj[key]);
                }
            }
        }
    }

    async loadShaderFile(url) {
        const response = await fetch(url + '?t=' + new Date().getTime()); // Append cache-busting query parameter);
        return response.text();
    }

    async loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    async initShaderProgram(vsSource, fsSource) {
        const vertexShader = await this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = await this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);
        const shaderProgram = this.gl.createProgram();
        this.gl.attachShader(shaderProgram, vertexShader);
        this.gl.attachShader(shaderProgram, fragmentShader);
        this.gl.linkProgram(shaderProgram);

        if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(shaderProgram));
            return null;
        }

        return shaderProgram;
    }

    async setupWebGLMN() {

        const vsSource = await this.loadShaderFile(this.vertexShaderUrl);
        const fsSource = await this.loadShaderFile(this.fragmentShaderUrl);

        // Initialize shaders and program
        const shaderProgram = await this.initShaderProgram(vsSource, fsSource);
        this.programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(shaderProgram, 'a_position'),
                textureCoord: this.gl.getAttribLocation(shaderProgram, 'a_texcoord')
            },
            uniformLocations: {
                uTime: this.gl.getUniformLocation(shaderProgram, 'uTime'),
                //views info
                uImage: [],
                uDisparityMap: [],
                uNumLayers: this.gl.getUniformLocation(shaderProgram, 'uNumLayers'),
                invZmin: this.gl.getUniformLocation(shaderProgram, 'invZmin'), // float array
                invZmax: this.gl.getUniformLocation(shaderProgram, 'invZmax'), // float array
                uViewPosition: this.gl.getUniformLocation(shaderProgram, 'uViewPosition'),
                sk1: this.gl.getUniformLocation(shaderProgram, 'sk1'),
                sl1: this.gl.getUniformLocation(shaderProgram, 'sl1'),
                roll1: this.gl.getUniformLocation(shaderProgram, 'roll1'),
                f1: this.gl.getUniformLocation(shaderProgram, 'f1'),
                iRes: this.gl.getUniformLocation(shaderProgram, 'iRes'), // vec2 array
                iResOriginal: this.gl.getUniformLocation(shaderProgram, 'iResOriginal'),

                // rendering info
                uFacePosition: this.gl.getUniformLocation(shaderProgram, 'uFacePosition'),
                sk2: this.gl.getUniformLocation(shaderProgram, 'sk2'),
                sl2: this.gl.getUniformLocation(shaderProgram, 'sl2'),
                roll2: this.gl.getUniformLocation(shaderProgram, 'roll2'),
                f2: this.gl.getUniformLocation(shaderProgram, 'f2'),
                oRes: this.gl.getUniformLocation(shaderProgram, 'oRes')
            },
        };

        // Populate the uniform location arrays
        for (let i = 0; i < this.MAX_LAYERS; i++) { // looks like it works with numLayers instead of MAX_LAYERS...
            this.programInfo.uniformLocations.uImage.push(this.gl.getUniformLocation(shaderProgram, `uImage[${i}]`));
            this.programInfo.uniformLocations.uDisparityMap.push(this.gl.getUniformLocation(shaderProgram, `uDisparityMap[${i}]`));
        }

        // Vertex positions and texture coordinates
        const positions = new Float32Array([
            -1.0, 1.0,
            1.0, 1.0,
            -1.0, -1.0,
            1.0, -1.0,
        ]);
        const textureCoords = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
        ]);

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const textureCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, textureCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, textureCoords, this.gl.STATIC_DRAW);

        const indexBuffer = this.gl.createBuffer();
        const indices = [0, 1, 2, 2, 1, 3];
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

        this.buffers = { position: positionBuffer, textureCoord: textureCoordBuffer, indices: indexBuffer };
    }

    async setupWebGLST() {

        const vsSource = await this.loadShaderFile(this.vertexShaderUrl);
        const fsSource = await this.loadShaderFile(this.fragmentShaderUrl);

        // Initialize shaders and program
        const shaderProgram = await this.initShaderProgram(vsSource, fsSource);
        this.programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(shaderProgram, 'a_position'),
                textureCoord: this.gl.getAttribLocation(shaderProgram, 'a_texcoord')
            },
            uniformLocations: {
                uTime: this.gl.getUniformLocation(shaderProgram, 'uTime'),
                //view L info
                uImageL: [],
                uDisparityMapL: [],
                uNumLayersL: this.gl.getUniformLocation(shaderProgram, 'uNumLayersL'),
                invZminL: this.gl.getUniformLocation(shaderProgram, 'invZminL'), // float array
                invZmaxL: this.gl.getUniformLocation(shaderProgram, 'invZmaxL'), // float array
                uViewPositionL: this.gl.getUniformLocation(shaderProgram, 'uViewPositionL'),
                sk1L: this.gl.getUniformLocation(shaderProgram, 'sk1L'),
                sl1L: this.gl.getUniformLocation(shaderProgram, 'sl1L'),
                roll1L: this.gl.getUniformLocation(shaderProgram, 'roll1L'),
                f1L: this.gl.getUniformLocation(shaderProgram, 'f1L'),
                iResL: this.gl.getUniformLocation(shaderProgram, 'iResL'), // vec2 array

                //view R info
                uImageR: [],
                uDisparityMapR: [],
                uNumRayersR: this.gl.getUniformLocation(shaderProgram, 'uNumLayersR'),
                invZminR: this.gl.getUniformLocation(shaderProgram, 'invZminR'), // float array
                invZmaxR: this.gl.getUniformLocation(shaderProgram, 'invZmaxR'), // float array
                uViewPositionR: this.gl.getUniformLocation(shaderProgram, 'uViewPositionR'),
                sk1R: this.gl.getUniformLocation(shaderProgram, 'sk1R'),
                sl1R: this.gl.getUniformLocation(shaderProgram, 'sl1R'),
                roll1R: this.gl.getUniformLocation(shaderProgram, 'roll1R'),
                f1R: this.gl.getUniformLocation(shaderProgram, 'f1R'),
                iResR: this.gl.getUniformLocation(shaderProgram, 'iResR'), // vec2 array

                // rendering info
                iResOriginal: this.gl.getUniformLocation(shaderProgram, 'iResOriginal'),
                uFacePosition: this.gl.getUniformLocation(shaderProgram, 'uFacePosition'),
                sk2: this.gl.getUniformLocation(shaderProgram, 'sk2'),
                sl2: this.gl.getUniformLocation(shaderProgram, 'sl2'),
                roll2: this.gl.getUniformLocation(shaderProgram, 'roll2'),
                f2: this.gl.getUniformLocation(shaderProgram, 'f2'),
                oRes: this.gl.getUniformLocation(shaderProgram, 'oRes')
            },
        };

        // Populate the uniform location arrays
        for (let i = 0; i < this.MAX_LAYERS; i++) { // looks like it works with numLayers instead of MAX_LAYERS...
            this.programInfo.uniformLocations.uImageL.push(this.gl.getUniformLocation(shaderProgram, `uImageL[${i}]`));
            this.programInfo.uniformLocations.uDisparityMapL.push(this.gl.getUniformLocation(shaderProgram, `uDisparityMapL[${i}]`));
            this.programInfo.uniformLocations.uImageR.push(this.gl.getUniformLocation(shaderProgram, `uImageR[${i}]`));
            this.programInfo.uniformLocations.uDisparityMapR.push(this.gl.getUniformLocation(shaderProgram, `uDisparityMapR[${i}]`));
        }

        // Vertex positions and texture coordinates
        const positions = new Float32Array([
            -1.0, 1.0,
            1.0, 1.0,
            -1.0, -1.0,
            1.0, -1.0,
        ]);
        const textureCoords = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
        ]);

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const textureCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, textureCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, textureCoords, this.gl.STATIC_DRAW);

        const indexBuffer = this.gl.createBuffer();
        const indices = [0, 1, 2, 2, 1, 3];
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

        this.buffers = { position: positionBuffer, textureCoord: textureCoordBuffer, indices: indexBuffer };
    }

    drawSceneMN(t) {

        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.useProgram(this.programInfo.program);

        // Vertex positions
        {
            const numComponents = 2;
            const type = this.gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
            this.gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
            this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
        }

        // Texture coordinates
        {
            const numComponents = 2;
            const type = this.gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.textureCoord);
            this.gl.vertexAttribPointer(this.programInfo.attribLocations.textureCoord, numComponents, type, normalize, stride, offset);
            this.gl.enableVertexAttribArray(this.programInfo.attribLocations.textureCoord);
        }

        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);

        const numLayers = this.views[0].layers.length;
        // Loop through each layer and bind textures
        for (let i = 0; i < numLayers; i++) {
            this.gl.activeTexture(this.gl.TEXTURE0 + (2 * i));
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.views[0].layers[i].image.texture);
            this.gl.uniform1i(this.programInfo.uniformLocations.uImage[i], 2 * i);

            this.gl.activeTexture(this.gl.TEXTURE0 + (2 * i + 1));
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.views[0].layers[i].invZ.texture);
            this.gl.uniform1i(this.programInfo.uniformLocations.uDisparityMap[i], 2 * i + 1);
        }
        // Pass the actual number of layers to the shader
        this.gl.uniform1i(this.gl.getUniformLocation(this.programInfo.program, 'uNumLayers'), numLayers);

        this.gl.uniform1f(this.gl.getUniformLocation(this.programInfo.program, 'uTime'), t);
        // this.views info
        this.gl.uniform3f(this.programInfo.uniformLocations.uViewPosition, this.views[0].position.x, this.views[0].position.y, this.views[0].position.z);
        this.gl.uniform2f(this.programInfo.uniformLocations.sk1, this.views[0].sk.x, this.views[0].sk.y);
        this.gl.uniform2f(this.programInfo.uniformLocations.sl1, this.views[0].rotation.sl.x, this.views[0].rotation.sl.y);
        this.gl.uniform1f(this.programInfo.uniformLocations.roll1, this.views[0].rotation.roll_degrees);
        this.gl.uniform1fv(this.programInfo.uniformLocations.f1, this.views[0].layers.map(layer => layer.f)); // in px
        this.gl.uniform1fv(this.programInfo.uniformLocations.invZmin, this.views[0].layers.map(layer => layer.invZ.min));
        this.gl.uniform1fv(this.programInfo.uniformLocations.invZmax, this.views[0].layers.map(layer => layer.invZ.max));
        this.gl.uniform2fv(this.programInfo.uniformLocations.iRes, this.views[0].layers.map(layer => [layer.width, layer.height]).flat());

        // rendering info
        this.gl.uniform2f(this.programInfo.uniformLocations.iResOriginal, this.views[0].width, this.views[0].height); // for window effect only
        this.gl.uniform3f(this.programInfo.uniformLocations.uFacePosition, this.renderCam.pos.x, this.renderCam.pos.y, this.renderCam.pos.z); // normalized to camera space
        this.gl.uniform2f(this.programInfo.uniformLocations.oRes, this.gl.canvas.width, this.gl.canvas.height);
        this.gl.uniform2f(this.programInfo.uniformLocations.sk2, this.renderCam.sk.x, this.renderCam.sk.y);
        this.gl.uniform2f(this.programInfo.uniformLocations.sl2, this.renderCam.sl.x, this.renderCam.sl.y);
        this.gl.uniform1f(this.programInfo.uniformLocations.roll2, this.renderCam.roll);
        this.gl.uniform1f(this.programInfo.uniformLocations.f2, this.renderCam.f); // in px

        const vertexCount = 6;
        const type = this.gl.UNSIGNED_SHORT;
        const offset = 0;

        this.gl.drawElements(this.gl.TRIANGLES, vertexCount, type, offset);
        //this.logAllUniforms()
    }

    drawSceneST(t) {

        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.useProgram(this.programInfo.program);

        // Vertex positions
        {
            const numComponents = 2;
            const type = this.gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
            this.gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
            this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
        }

        // Texture coordinates
        {
            const numComponents = 2;
            const type = this.gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.textureCoord);
            this.gl.vertexAttribPointer(this.programInfo.attribLocations.textureCoord, numComponents, type, normalize, stride, offset);
            this.gl.enableVertexAttribArray(this.programInfo.attribLocations.textureCoord);
        }

        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);

        this.gl.uniform1f(this.gl.getUniformLocation(this.programInfo.program, 'uTime'), t);
        // view L info
        const numLayersL = this.views[0].layers.length;

        // Loop through each layer and bind textures
        for (let i = 0; i < numLayersL; i++) {
            this.gl.activeTexture(this.gl.TEXTURE0 + (4 * i));
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.views[0].layers[i].image.texture);
            this.gl.uniform1i(this.programInfo.uniformLocations.uImageL[i], 4 * i);

            this.gl.activeTexture(this.gl.TEXTURE0 + (4 * i + 1));
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.views[0].layers[i].invZ.texture);
            this.gl.uniform1i(this.programInfo.uniformLocations.uDisparityMapL[i], 4 * i + 1);
        }
        // Pass the actual number of layers to the shader
        this.gl.uniform1i(this.programInfo.uniformLocations.uNumLayersL, numLayersL);

        this.gl.uniform3f(this.programInfo.uniformLocations.uViewPositionL, this.views[0].position.x, this.views[0].position.y, this.views[0].position.z);
        this.gl.uniform2f(this.programInfo.uniformLocations.sk1L, this.views[0].sk.x, this.views[0].sk.y);
        this.gl.uniform2f(this.programInfo.uniformLocations.sl1L, this.views[0].rotation.sl.x, this.views[0].rotation.sl.y);
        this.gl.uniform1f(this.programInfo.uniformLocations.roll1L, this.views[0].rotation.roll_degrees);
        this.gl.uniform1fv(this.programInfo.uniformLocations.f1L, this.views[0].layers.map(layer => layer.f)); // in px
        this.gl.uniform1fv(this.programInfo.uniformLocations.invZminL, this.views[0].layers.map(layer => layer.invZ.min));
        this.gl.uniform1fv(this.programInfo.uniformLocations.invZmaxL, this.views[0].layers.map(layer => layer.invZ.max));
        this.gl.uniform2fv(this.programInfo.uniformLocations.iResL, this.views[0].layers.map(layer => [layer.width, layer.height]).flat());

        // view R info
        const numLayersR = this.views[1].layers.length;

        // Loop through each layer and bind textures
        for (let i = 0; i < numLayersR; i++) {
            this.gl.activeTexture(this.gl.TEXTURE0 + (4 * i + 2));
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.views[1].layers[i].image.texture);
            this.gl.uniform1i(this.programInfo.uniformLocations.uImageR[i], 4 * i + 2);

            this.gl.activeTexture(this.gl.TEXTURE0 + (4 * i + 3));
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.views[1].layers[i].invZ.texture);
            this.gl.uniform1i(this.programInfo.uniformLocations.uDisparityMapR[i], 4 * i + 3);
        }
        // Pass the actual number of layers to the shader
        this.gl.uniform1i(this.programInfo.uniformLocations.uNumLayersr, numLayersR);

        this.gl.uniform3f(this.programInfo.uniformLocations.uViewPositionR, this.views[1].position.x, this.views[1].position.y, this.views[1].position.z);
        this.gl.uniform2f(this.programInfo.uniformLocations.sk1R, this.views[1].sk.x, this.views[1].sk.y);
        this.gl.uniform2f(this.programInfo.uniformLocations.sl1R, this.views[1].rotation.sl.x, this.views[1].rotation.sl.y);
        this.gl.uniform1f(this.programInfo.uniformLocations.roll1R, this.views[1].rotation.roll_degrees);
        this.gl.uniform1fv(this.programInfo.uniformLocations.f1R, this.views[1].layers.map(layer => layer.f)); // in px
        this.gl.uniform1fv(this.programInfo.uniformLocations.invZminR, this.views[1].layers.map(layer => layer.invZ.min));
        this.gl.uniform1fv(this.programInfo.uniformLocations.invZmaxR, this.views[1].layers.map(layer => layer.invZ.max));
        this.gl.uniform2fv(this.programInfo.uniformLocations.iResR, this.views[1].layers.map(layer => [layer.width, layer.height]).flat());

        // rendering info
        this.gl.uniform2f(this.programInfo.uniformLocations.iResOriginal, this.views[0].width, this.views[0].height); // for window effect only
        this.gl.uniform3f(this.programInfo.uniformLocations.uFacePosition, this.renderCam.pos.x, this.renderCam.pos.y, this.renderCam.pos.z); // normalized to camera space
        this.gl.uniform2f(this.programInfo.uniformLocations.oRes, this.gl.canvas.width, this.gl.canvas.height);
        this.gl.uniform2f(this.programInfo.uniformLocations.sk2, this.renderCam.sk.x, this.renderCam.sk.y);
        this.gl.uniform2f(this.programInfo.uniformLocations.sl2, this.renderCam.sl.x, this.renderCam.sl.y);
        this.gl.uniform1f(this.programInfo.uniformLocations.roll2, this.renderCam.roll);
        this.gl.uniform1f(this.programInfo.uniformLocations.f2, this.renderCam.f); // in px

        const vertexCount = 6;
        const type = this.gl.UNSIGNED_SHORT;
        const offset = 0;

        this.gl.drawElements(this.gl.TRIANGLES, vertexCount, type, offset);
    }

    viewportScale(iRes, oRes) {
        return Math.min(oRes.x, oRes.y) / Math.min(iRes.x, iRes.y);
    }

    // Log all uniforms
    logAllUniforms() {
        const numUniforms = this.gl.getProgramParameter(this.programInfo.program, this.gl.ACTIVE_UNIFORMS);
        const uniforms = {};

        for (let i = 0; i < numUniforms; ++i) {
            const info = this.gl.getActiveUniform(this.programInfo.program, i);
            const location = this.gl.getUniformLocation(this.programInfo.program, info.name);
            const value = this.gl.getUniform(this.programInfo.program, location);
            uniforms[info.name] = value;
        }

        console.log('Uniforms:', uniforms);
    }

    resizeCanvasToContainer() {
        // const parent = this.canvas.parentNode;
        // const rect = parent.getBoundingClientRect();

        // if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
        //     this.canvas.width = rect.width;
        //     this.canvas.height = rect.height;
        // }
        this.canvas.width = this.img.width;
        this.canvas.height = this.img.height;
    }

    render() {
        // assume harmonic for now
        const animTime = this.currentAnimation.duration_sec;
        const ut = Date.now() / 1000 - this.startTime;
        const t = ut; //Math.max(ut-2,0);
        function harm(amp, ph, bias) { return amp * Math.sin(2 * Math.PI * (t / animTime + ph)) + bias };
        const invd = this.currentAnimation.data.invd;
        // update renderCam
        this.renderCam.pos.x = harm(this.currentAnimation.data.position.x.amplitude, this.currentAnimation.data.position.x.phase, this.currentAnimation.data.position.x.bias);
        this.renderCam.pos.y = harm(this.currentAnimation.data.position.y.amplitude, this.currentAnimation.data.position.y.phase, this.currentAnimation.data.position.y.bias);
        this.renderCam.pos.z = harm(this.currentAnimation.data.position.z.amplitude, this.currentAnimation.data.position.z.phase, this.currentAnimation.data.position.z.bias);
        if (this.mouseOver) {
            const smoothMouseX = (0.1 * this.mousePos.x + 0.9 * this.mousePosOld.x) * this.mouseOverAmplitude;
            const smoothMouseY = (0.1 * this.mousePos.y + 0.9 * this.mousePosOld.y) * this.mouseOverAmplitude;
            this.renderCam.pos.x += smoothMouseX;
            this.renderCam.pos.y += smoothMouseY;
            this.mousePosOld = { x: smoothMouseX, y: smoothMouseY };
        }
        this.renderCam.sk.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        this.renderCam.sk.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        const vs = this.viewportScale({ x: this.currentAnimation.data.width_px, y: this.currentAnimation.data.height_px }, { x: this.gl.canvas.width, y: this.gl.canvas.height });
        this.renderCam.f = this.currentAnimation.data.focal_px * vs * (1 - this.renderCam.pos.z * invd); // f2 = f1/adjustAr(iRes,oRes)*max(1.0-C2.z*invd,1.0);



        if (this.views.length < 2) {
            this.drawSceneMN(ut);
        } else {
            this.drawSceneST(ut);
        }

        if (!this.gl.isContextLost()) {
            this.animationFrame = requestAnimationFrame(this.render);
        } else {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    renderOff(transitionTime) {
        if (this.running) { console.log("abort renderOFF !"); return; }
        const elapsedTime = (Date.now() / 1000) - this.startTime;

        //const invd = this.focus * this.views[0].layers[0].invZ.min; // set focus point
        const invd = this.currentAnimation.data.invd;
        // Calculate a fade-out effect based on elapsed time and transition time
        //const progress = Math.min(elapsedTime / transitionTime, 1); // progress goes from 0 to 1

        const { x: xo, y: yo, z: zo } = this.renderCam.pos;
        // Update some properties to create a transition effect
        const xc = this.currentAnimation.data.position.x.bias;
        this.renderCam.pos = { x: xc + (xo - xc) / 1.1, y: yo / 1.1, z: zo / 1.1 }; // Slow down z-axis movement
        this.renderCam.sk.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        this.renderCam.sk.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        const vs = this.viewportScale({ x: this.currentAnimation.data.width_px, y: this.currentAnimation.data.height_px }, { x: this.gl.canvas.width, y: this.gl.canvas.height });
        this.renderCam.f = this.currentAnimation.data.focal_px * vs * (1 - this.renderCam.pos.z * invd); // f2 = f1/adjustAr(iRes,oRes)*max(1.0-C2.z*invd,1.0);


        if (this.views.length < 2) {
            this.drawSceneMN(10);
        } else {
            this.drawSceneST(10);
        }

        if ((elapsedTime < transitionTime) && !this.gl.isContextLost()) {
            // Continue rendering if transitionTime hasn't elapsed
            this.animationFrame = requestAnimationFrame(() => this.renderOff(transitionTime));
        } else {
            // Hide canvas and show image after transition
            this.img.style.display = 'block';
            this.canvas.style.display = 'none';
            cancelAnimationFrame(this.animationFrame);
        }
    }

    async startAnimation() {
        if (this.disableAnim) return;
        if (!this.gl.isContextLost()) {
            if (this.running) return;
            this.running = true;
            // console.log("starting animation for", this.lifUrl.split('/').pop());
            this.img.style.display = 'none';
            this.canvas.style.display = 'block';
            this.startTime = Date.now() / 1000;
            //console.log(this.views);
            this.animationFrame = requestAnimationFrame(this.render);
        } else {
            // console.log("gl context missing for", this.lifUrl.split('/').pop());
            this.canvas.remove();
            this.canvas = document.createElement('canvas');
            this.canvas.style.display = 'none';
            this.container.appendChild(this.canvas);
            this.resizeCanvasToContainer();
            this.canvas.addEventListener('mousemove', function (event) {
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = event.clientX - rect.left - rect.width / 2; // Get mouse X position relative to the canvas
                const mouseY = event.clientY - rect.top - rect.height / 2; // Get mouse Y position relative to the canvas

                // Calculate the position relative to the center, normalized between -0.5 and +0.5
                this.mousePos.x = (mouseX / rect.width);
                this.mousePos.y = (mouseY / rect.width);

                // console.log(`(${relativeX}, ${relativeY}`); // Outputs values between -0.5 and +0.5
            }.bind(this));
            // Device tilt listener for mobile devices
            window.addEventListener('deviceorientation', function (event) {
                // event.beta is the tilt in the x-axis (front-back tilting), normalized between -90 and +90
                // event.gamma is the tilt in the y-axis (left-right tilting), normalized between -90 and +90

                // Normalize beta and gamma to a value between -0.5 and +0.5
                this.mousePos.y = event.beta / 45;  // Normalized value for front-back tilt
                this.mousePos.x = event.gamma / 45;  // Normalized value for left-right tilt

                // console.log(`Tilt X: ${this.tilt.x}, Tilt Y: ${this.tilt.y}`); // Log the tilt values
            }.bind(this));
            this.gl = this.canvas.getContext('webgl');
            await this.initWebGLResources();
            this.startAnimation();
        }
    }

    stopAnimation(transitionTime = 0.5) { // Set a default transition time of 0.5 seconds
        if (this.disableAnim) return;
        cancelAnimationFrame(this.animationFrame);
        this.running = false;
        this.mousePosOld = { x: 0, y: 0 };
        this.startTime = Date.now() / 1000; // Start transition timer
        this.animationFrame = requestAnimationFrame(() => this.renderOff(transitionTime));
    }
}

class monoLdiGenerator {
    constructor(file = null) {
        this.AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';
        this.file = file ? file : null;
        this.width = 0;
        this.height = 0;

        this.endpointUrl = 'https://api.dev.immersity.ai/api/v1';
        this.imUploadUrl;
        this.imDownloadUrl;
        this.outpaintImUploadUrl;
        this.outpaintImDownloadUrl;
        this.dispUploadUrl;
        this.dispDownloadUrl;
        this.lifUploadUrl;
        this.lifDownloadUrl;
        this.accessToken;
        this.lifFile;
        this.maxDimension = 1600;

        this.execPlan = {
            executionPlan: [{
                productId: "1b2e3ca8-1f71-40b6-a43d-567b35d5e05d", // OUTPAINT
                productParams: {
                    inputs: { inputImageUrl: this.imDownloadUrl },
                    outputs: { outputLifUrl: this.outpaintImUploadUrl },
                    params: {
                        inpaintMethod: "lama",
                        outpaint: "0.1"
                    }
                }
            },
            {
                productId: "4d50354b-466d-49e1-a95d-0c7f320849c6", // generate disparity
                productParams: {
                    inputs: { inputImageUrl: this.outpaintImDownloadUrl },
                    outputs: { outputDisparityUrl: this.dispUploadUrl },
                    params: {
                        outputType: 'uint16',
                        dilation: 0
                    }
                }
            },
            {
                productId: "c95bb2e9-95d2-4d2a-ac7c-dd1b0e1c7e7f", // LDL MONO
                productParams: {
                    inputs: {},
                    outputs: {},
                    params: {
                        inpaintMethod: "lama",
                        dilation: "0.005",
                        depthDilationPercent: "0.0",
                        outpaint: "-0.1",
                        inpaintPrompt: "background without foreground object, seamless and natural",
                        inpaintNegativePrompt: "text, subtitles, chair, object, people, face, human, person, animal, banner",
                        outpaintPrompt: "background without foreground object, seamless and natural",
                        outpaintNegativePrompt: "photoframe, frame, album, small text, subtitles, object, person ,animal, banner, text, color block",
                    }
                }
            }
            ]
        };

        //this.init();
    }

    async resizeImage(image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = image.width;
        let height = image.height;

        if (width > height) {
            if (width > this.maxDimension) {
                height = Math.round((height * this.maxDimension) / width);
                width = this.maxDimension;
            }
        } else {
            if (height > this.maxDimension) {
                width = Math.round((width * this.maxDimension) / height);
                height = this.maxDimension;
            }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);

        // Convert canvas to blob and return it along with dimensions
        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, this.file.type, 1);
        });

        return {
            blob: blob,
            width: width,
            height: height
        };
    }

    async convertHeicToJpeg() {
        const convertedBlob = await heic2any({
            blob: this.file,
            toType: "image/jpeg",
            quality: 1
        });
        this.file = new File([convertedBlob], this.file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" });
    }

    async getAccessToken() {
        console.log('Acquiring access token from LeiaLogin...');

        const tokenResponse = await axios.post(this.AWS_LAMBDA_URL, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Access-Control-Allow-Origin': '*'
            },
        });

        console.log('Access token acquired:', tokenResponse.data);
        this.accessToken = tokenResponse.data.access_token;
    }

    async getPutGetUrl(filename) {
        const responsePair = await fetch(this.endpointUrl + '/get-presigned-url-pair?fileName=' + filename + '&mediaType=image%2Fjpeg', {
            method: 'GET',
            headers: {
                authorization: `Bearer ${this.accessToken}`,
                accept: 'application/json'
            },
        });

        const data = await responsePair.json();
        console.log('Put URL for', filename, ':', data.uploadUrl);
        console.log('Get URL for', filename, ':', data.downloadUrl);

        return [data.uploadUrl, data.downloadUrl];
    }

    async uploadToStorage(file, putUrl) {
        try {
            const response = await fetch(putUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type
                },
                body: file
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log('File uploaded successfully');
        } catch (error) {
            console.error('Error uploading file:', error);
        }
    }

    async generateLif() {
        // Start timing the fetch
        console.time('fetchDuration');
        // Show the progress bar
        console.log(this.width, ' - ', this.height, ' - ', this.execPlan.executionPlan[2].productParams.params.inpaintMethod);

        try {
            const response = await fetch(this.endpointUrl + '/process', {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.execPlan)
            });
            // Check if the response status is OK (status 200-299)
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            // Attempt to parse response as JSON
            const data = await response.json();
            console.log('Response data:', data);
        } catch (error) {
            console.error('Error during fetch:', error);
        }

        this.lifFile = await fetch(this.lifDownloadUrl);
        console.timeEnd('fetchDuration');

    }

    async afterLoad() { }

    async init() {

        if (!this.file) return;
        console.log(`Starting Conversion of ${this.file.name}, ${this.file.type}`);

        // Convert HEIC to a more usable format
        if (this.file.type === 'image/heic' || this.file.type === 'image/heif') {
            console.log('Converting HEIC file...');
            await this.convertHeicToJpeg();
        }

        const img = new Image();
        const reader = new FileReader();

        reader.onload = async (readerEvent) => {
            img.src = readerEvent.target.result;

            img.onload = async () => {

                this.width = img.width;
                this.height = img.height;
                if ((img.width > this.maxDimension || img.height > this.maxDimension) && !this.stLifInput) {
                    const resizedObj = await this.resizeImage(img);
                    const resizedBlob = resizedObj.blob;
                    this.width = resizedObj.width;
                    this.height = resizedObj.height;
                    this.file = new File([resizedBlob], this.file.name, { type: this.file.type });
                    console.log(`Image resized to ${this.width} x ${this.height} before upload...`);
                }

                await this.getAccessToken();
                console.log('Authenticated to IAI Cloud 🤗');
                [this.imUploadUrl, this.imDownloadUrl] = await this.getPutGetUrl(this.file.name);
                [this.outpaintImUploadUrl, this.outpaintImDownloadUrl] = await this.getPutGetUrl('outpaintedImage.jpg');
                [this.dispUploadUrl, this.dispDownloadUrl] = await this.getPutGetUrl('disparity.png');
                [this.lifUploadUrl, this.lifDownloadUrl] = await this.getPutGetUrl('lifResult.jpg');
                console.log('Got temporary storage URLs on IAI Cloud 💪');
                await this.uploadToStorage(this.file, this.imUploadUrl);
                console.log('Uploaded Image to IAI Cloud 🚀');
                this.execPlan.executionPlan[0].productParams.inputs.inputImageUrl = this.imDownloadUrl;
                this.execPlan.executionPlan[0].productParams.outputs.outputLifUrl = this.outpaintImUploadUrl;
                this.execPlan.executionPlan[1].productParams.inputs.inputImageUrl = this.outpaintImDownloadUrl;
                this.execPlan.executionPlan[1].productParams.outputs.outputDisparityUrl = this.dispUploadUrl;
                this.execPlan.executionPlan[2].productParams.inputs.inputImageUrl = this.outpaintImDownloadUrl;
                this.execPlan.executionPlan[2].productParams.inputs.inputDisparityUrl = this.dispDownloadUrl;
                this.execPlan.executionPlan[2].productParams.outputs.outputLifUrl = this.lifUploadUrl;
                console.log(this.execPlan);
                console.log('Launching LDI Generation Service... ⏳');
                await this.generateLif();
                this.afterLoad();
            };
        };
        reader.readAsDataURL(this.file);


    }
}