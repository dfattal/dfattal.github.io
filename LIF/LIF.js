
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

async function parseLif53(file) {
    const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
    const lifMeta = await parseBinary(arrayBuffer);
    const lifJson = lifMeta.getJsonMeta();
    console.log(lifJson);
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
    constructor(lifUrl,container,height = 300) {
        this.MAX_LAYERS = 4;
        this.lifUrl = lifUrl;
        this.container = container;
        
        this.img = document.createElement('img');
        this.img.src = lifUrl;
        this.img.height = height;
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl');
        this.canvas.style.display = 'none';
        
        this.init();

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

    async init() {
        this.img.onload = function () {
            this.container.appendChild(this.img);
            this.container.appendChild(this.canvas);
            this.resizeCanvasToContainer();
        }.bind(this);
        this.container.addEventListener('mouseenter', () => this.startAnimation());
        this.container.addEventListener('mouseleave', () => this.stopAnimation());
        const response = await fetch(this.lifUrl);
        const blob = await response.blob();
        const file = new File([blob], 'lifImage.jpg', { type: 'image/jpeg' });
        this.lifInfo = await parseLif53(file);
        this.views = replaceKeys(this.lifInfo.views,
            ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom', 'frustum_skew', 'rotation_slant'],
            ['width', 'height', 'f', 'invZ', 'layers', 'sk', 'sl']
        );
        await this.parseObjAndCreateTextures(this.views);
        this.fragmentShaderUrl = this.views.length < 2 ? "../Shaders/rayCastMonoLDIGlow.glsl" : "../Shaders/rayCastStereoLDIGlow.glsl";
        this.vertexShaderUrl = "../Shaders/vertex.glsl";

        // Setup Shader
        if (this.views.length < 2) {
            await this.setupWebGLMN();
        } else {
            await this.setupWebGLST();
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

    create4ChannelImage(dispImage, maskImage) {

        const width = dispImage.width;
        const height = dispImage.height;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        // Pass { willReadFrequently: true } to optimize for frequent read operations
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Draw the disp image
        ctx.drawImage(dispImage, 0, 0, width, height);
        const dispData = ctx.getImageData(0, 0, width, height).data;

        // Draw the mask image
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(maskImage, 0, 0, width, height);
        const maskData = ctx.getImageData(0, 0, width, height).data;

        // Create a new image data object for the 4-channel image
        const combinedData = ctx.createImageData(width, height);
        for (let i = 0; i < dispData.length / 4; i++) {
            combinedData.data[i * 4] = dispData[i * 4];
            combinedData.data[i * 4 + 1] = dispData[i * 4 + 1];
            combinedData.data[i * 4 + 2] = dispData[i * 4 + 2];
            combinedData.data[i * 4 + 3] = maskData[i * 4]; // Use the red channel of the mask image for the alpha channel
        }

        return combinedData;
    }

    async parseObjAndCreateTextures(obj) {
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (key === 'image') {
                    try {
                        const img = await this.loadImage2(obj[key].url);
                        obj[key]['texture'] = this.createTexture(img);
                        console.log()
                    } catch (error) {
                        console.error('Error loading image:', error);
                    }
                } else if (key === 'invZ' && obj.hasOwnProperty('mask')) {
                    try {
                        const maskImg = await this.loadImage2(obj['mask'].url);
                        const invzImg = await this.loadImage2(obj['invZ'].url);
                        const maskedInvz = this.create4ChannelImage(invzImg, maskImg);
                        obj['invZ']['texture'] = this.createTexture(maskedInvz);
                    } catch (error) {
                        console.error('Error loading mask or invz image:', error);
                    }
                } else if (key === 'invZ') { // no mask
                    try {
                        const invzImg = await this.loadImage2(obj['invZ'].url);
                        obj['invZ']['texture'] = this.createTexture(invzImg);
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
        const parent = this.canvas.parentNode;
        const rect = parent.getBoundingClientRect();

        if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
    }

    render() {
        const animTime = 4;
        const invd = this.focus * this.views[0].layers[0].invZ.min; // set focus point
        const ut = Date.now() / 1000 - this.startTime;
        const t = ut; //Math.max(ut-2,0);
        const st = Math.sin(2 * Math.PI * t / animTime);
        const ct = Math.cos(2 * Math.PI * t / animTime);
        // update renderCam
        this.renderCam.pos = { x: this.views.length<2 ? 0 : -0.5, y: 0, z: 3 * st };
        this.renderCam.sk.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        this.renderCam.sk.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        const vs = this.viewportScale({ x: this.views[0].width, y: this.views[0].height }, { x: this.gl.canvas.width, y: this.gl.canvas.height });
        this.renderCam.f = this.views[0].f * vs * (1 - this.renderCam.pos.z * invd); // f2 = f1/adjustAr(iRes,oRes)*max(1.0-C2.z*invd,1.0);

        if (this.views.length < 2) {
            this.drawSceneMN(ut);
        } else {
            this.drawSceneST(ut);
        }

        this.animationFrame = requestAnimationFrame(this.render);
    }

    renderOff(transitionTime) {
        const elapsedTime = (Date.now() / 1000) - this.startTime;

        const invd = this.focus * this.views[0].layers[0].invZ.min; // set focus point
        // Calculate a fade-out effect based on elapsed time and transition time
        //const progress = Math.min(elapsedTime / transitionTime, 1); // progress goes from 0 to 1

        const { x: xo, y: yo, z: zo } = this.renderCam.pos;
        // Update some properties to create a transition effect
        const xc = this.views.length<2 ? 0 : -0.5;
        this.renderCam.pos = { x: xc + (xo-xc) / 1.1, y: yo / 1.1, z: zo / 1.1 }; // Slow down z-axis movement
        this.renderCam.sk.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        this.renderCam.sk.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        const vs = this.viewportScale({ x: this.views[0].width, y: this.views[0].height }, { x: this.gl.canvas.width, y: this.gl.canvas.height });
        this.renderCam.f = this.views[0].f * vs * (1 - this.renderCam.pos.z * invd); // f2 = f1/adjustAr(iRes,oRes)*max(1.0-C2.z*invd,1.0);


        if (this.views.length < 2) {
            this.drawSceneMN(10);
        } else {
            this.drawSceneST(10);
        }

        if (elapsedTime < transitionTime) {
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
        if (this.container.classList.contains('delete-hover')) return;
        this.img.style.display = 'none';
        this.canvas.style.display = 'block';
        this.startTime = Date.now() / 1000;
        //console.log(this.views);
        this.animationFrame = requestAnimationFrame(this.render);
    }

    stopAnimation(transitionTime = 0.5) { // Set a default transition time of 0.5 seconds
        if (this.container.classList.contains('delete-hover')) return;
        cancelAnimationFrame(this.animationFrame);
        this.startTime = Date.now() / 1000; // Start transition timer
        this.animationFrame = requestAnimationFrame(() => this.renderOff(transitionTime));
    }
}