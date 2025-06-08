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
        if (obj.image && obj.image.blob_id !== undefined) {
            if (obj.image.blob_id == -1 /*source image*/) {
                const rgb = new Blob([arrayBuffer], { type: 'image/jpeg' });
                obj.image.url = handleBlob(rgb);
            } else {
                const rgb = lifMeta.getFieldByType(obj.image.blob_id).toBlob();
                obj.image.url = handleBlob(rgb);
            }
        }

        // handle invZ
        if (obj.inv_z_map && obj.inv_z_map.blob_id !== undefined) {
            const invZmap = lifMeta.getFieldByType(obj.inv_z_map.blob_id).toBlob();
            obj.inv_z_map.url = handleBlob(invZmap);
        }

        //handle mask
        if (obj.mask && obj.mask.blob_id !== undefined) {
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
                if (view.layered_depth_image_data) {
                    view.layers_top_to_bottom = view.layered_depth_image_data.layers_top_to_bottom;
                    outpaint_width_px = view.layered_depth_image_data.outpainting_added_width_px;
                    outpaint_height_px = view.layered_depth_image_data.outpainting_added_height_px;
                    camera_data = view.camera_data;
                    delete view.camera_data;
                }
            }

            if (view.layers_top_to_bottom) {
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
    }
    return result;
}

// Fix global variables for Chrome extension context
let mode2 = "prod"; // Default to production mode for Chrome extension

console.log(mode2);

class monoLdiGenerator {
    constructor(file = null, inpainting = 'lama') {
        this.AWS_LAMBDA_URL = 'https://dqrluvhhkamlne6cpc6g6waaay0whxpb.lambda-url.us-east-1.on.aws/?mode=' + mode2;
        this.file = file ? file : null;
        this.width = 0;
        this.height = 0;
        this.inpainting = inpainting;
        this.endpointUrl = 'https://' + (mode2 == 'dev' ? 'api.dev.immersity.ai' : 'api.immersity.ai') + '/api/v1';
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
                        inpaintMethod: this.inpainting,
                        outpaint: "0.1"
                    }
                }
            },
            // {
            //     productId: "b109355d-12a9-41fe-bd36-94bde1634da0", // Gateway
            //     productParams: {
            //         url: "http://3.95.133.35:8080/v1/depth-map-refined", // Apple Depth Pro
            //         method: "POST",
            //         body: {
            //             inputs: {"inputImageUrl": this.outpaintImDownloadUrl},
            //             outputs: {"outputDisparityUrl": this.dispUploadUrl},
            //             params: {
            //                 outputFormat: "disparity",
            //                 outputType: "uint16",
            //                 dilation: 0
            //             }
            //         }
            //     }
            // },
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
                        inpaintMethod: this.inpainting,
                        dilation: "0.005",
                        depthDilationPercent: "0.0",
                        outpaint: "-0.1",
                        inpaintPrompt: "inpaint, blend background",
                        inpaintNegativePrompt: "extra person, human, man, woman, kid, extra object",
                        outpaintPrompt: "outpaint, blend background",
                        outpaintNegativePrompt: "extra person, human, man, woman, kid, extra object",
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
            method: 'POST',
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

class lifViewer {
    static instances = [];

    constructor(lifUrl, container, heightOrOptions = 300, autoplay = false, mouseOver = true) {
        lifViewer.instances.push(this);

        // Enhanced constructor - support both old API and new options object
        let options = {};
        let height = 300;

        if (typeof heightOrOptions === 'object' && heightOrOptions !== null) {
            // New API: constructor(lifUrl, container, options)
            options = heightOrOptions;
            height = options.height || 300;
            autoplay = options.autoplay !== undefined ? options.autoplay : false;
            mouseOver = options.mouseOver !== undefined ? options.mouseOver : true;
        } else {
            // Old API: constructor(lifUrl, container, height, autoplay, mouseOver)
            height = heightOrOptions || 300;
            options = {
                height,
                autoplay,
                mouseOver
            };
        }

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

        // Enhanced layout-aware properties
        this.layoutMode = options.layoutMode || 'standard';
        this.preserveResponsive = options.preserveResponsive || false;
        this.targetDimensions = options.targetDimensions || null;
        this.originalImage = options.originalImage || null;
        this.layoutAnalysis = options.layoutAnalysis || null;
        this.centeredImageInfo = options.centeredImageInfo || null;
        this.height = height;

        // Z-index configuration properties for maintainability
        this.canvasZIndex = options.canvasZIndex || 4999;
        this.imageZIndex = options.imageZIndex || 4999;

        // Get layout-specific configuration
        this.layoutConfig = this.getLayoutConfiguration();

        // Create elements with layout awareness
        this.createElements();
        this.setupLayoutSpecificStyling();

        // Add debugging info
        console.log(`LIF viewer created for: ${lifUrl} (layout: ${this.layoutMode})`);
        console.log(`Initial height: ${height}`);

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

    /**
     * Get layout-specific configuration based on detected layout mode
     */
    getLayoutConfiguration() {
        const configs = {
            standard: {
                containerSizing: 'explicit',
                canvasPositioning: 'relative',
                eventHandling: 'standard',
                preserveOriginalDimensions: false,
                preventResizing: false
            },
            picture: {
                containerSizing: 'preserve',
                canvasPositioning: 'absolute',
                eventHandling: 'unified',
                preserveOriginalDimensions: true,
                preventResizing: true
            },
            aspectRatio: {
                containerSizing: 'preserve',
                canvasPositioning: 'absolute',
                eventHandling: 'overlay',
                preserveOriginalDimensions: true,
                preventResizing: true
            },
            facebook: {
                containerSizing: 'preserve',
                canvasPositioning: 'absolute',
                eventHandling: 'overlay',
                preserveOriginalDimensions: true,
                preventResizing: true,
                complexPositioning: true
            },
            overlay: {
                containerSizing: 'preserve',
                canvasPositioning: 'absolute',
                eventHandling: 'overlay',
                preserveOriginalDimensions: true,
                preventResizing: true
            }
        };

        return configs[this.layoutMode] || configs.standard;
    }

    /**
     * Create canvas and image elements with layout awareness
     */
    createElements() {
        this.img = document.createElement('img');
        this.img.src = this.lifUrl;
        this.img.height = this.height;

        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl');
        this.canvas.style.display = 'none';

        // Add layout-specific data attributes for debugging
        this.canvas.dataset.lifLayoutMode = this.layoutMode;
        this.img.dataset.lifLayoutMode = this.layoutMode;
    }

    /**
     * Apply layout-specific styling during creation
     */
    setupLayoutSpecificStyling() {
        const config = this.layoutConfig;

        if (config.canvasPositioning === 'absolute') {
            // For picture elements, aspect ratio containers, etc.
            const dimensions = this.getEffectiveDimensions();

            // LINKEDIN CENTERING FIX: Apply centered positioning if available
            let positioningStyle = 'top: 0; left: 0;';
            if (this.centeredImageInfo) {
                positioningStyle = `top: ${this.centeredImageInfo.offsetY}px; left: ${this.centeredImageInfo.offsetX}px;`;
                console.log('🎯 Applying LinkedIn centering:', positioningStyle);
            }

            this.canvas.style.cssText = `
                width: ${dimensions.width}px !important;
                height: ${dimensions.height}px !important;
                max-width: none !important;
                max-height: none !important;
                position: absolute;
                ${positioningStyle}
                z-index: ${this.canvasZIndex};
                display: none;
                pointer-events: auto;
                cursor: pointer;
            `;

            this.img.style.cssText = `
                width: ${dimensions.width}px !important;
                height: ${dimensions.height}px !important;
                max-width: none !important;
                max-height: none !important;
                object-fit: cover;
                position: absolute;
                ${positioningStyle}
                z-index: ${this.imageZIndex};
                display: none;
                pointer-events: auto;
                cursor: pointer;
            `;


        }
    }

    /**
     * Get effective dimensions based on layout mode and original image
     */
    getEffectiveDimensions() {
        if (this.targetDimensions) {
            return this.targetDimensions;
        }

        if (this.originalImage) {
            return {
                width: this.originalImage.width || this.originalImage.naturalWidth,
                height: this.originalImage.height || this.originalImage.naturalHeight
            };
        }

        return { width: 400, height: 300 }; // fallback
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

    /**
     * Static factory method for creating layout-aware viewers
     */
    static createForLayout(lifUrl, container, originalImage, layoutAnalysis, options = {}) {
        // Determine layout mode from analysis
        let layoutMode = 'standard';

        if (originalImage.closest('picture')) {
            layoutMode = 'picture';
        } else if (layoutAnalysis?.isFacebookStyle) {
            layoutMode = 'facebook';
        } else if (layoutAnalysis?.containerHasPaddingAspectRatio) {
            layoutMode = 'aspectRatio';
        } else if (layoutAnalysis?.preserveOriginal) {
            // DEVIANTART FIX: DeviantArt should use standard mode despite preserveOriginal flag
            // DeviantArt has simple container structures that work best with standard layout
            if (window.location.hostname.includes('deviantart.com')) {
                layoutMode = 'standard';
                console.log('🎨 DeviantArt detected - forcing standard layout mode despite preserveOriginal flag');
            } else {
                layoutMode = 'overlay';
            }
        }

        // LINKEDIN CENTERING FIX: Detect centered/aspect-fit images
        let targetDimensions = {
            width: originalImage.width || originalImage.naturalWidth,
            height: originalImage.height || originalImage.naturalHeight
        };

        let centeredImageInfo = null;
        if (window.location.hostname.includes('linkedin.com') &&
            (originalImage.classList.contains('ivm-view-attr__img--centered') ||
                originalImage.classList.contains('ivm-view-attr__img--aspect-fit'))) {

            centeredImageInfo = lifViewer.calculateLinkedInCenteredImageDimensions(originalImage, container);
            if (centeredImageInfo) {
                console.log('🎯 LinkedIn centered image detected:', centeredImageInfo);
                targetDimensions = {
                    width: centeredImageInfo.width,
                    height: centeredImageInfo.height
                };

                // Force aspectRatio layout mode for centered LinkedIn images
                // to ensure proper absolute positioning
                if (layoutAnalysis?.containerHasPaddingAspectRatio) {
                    layoutMode = 'aspectRatio';
                    console.log('🎯 Forcing aspectRatio layout mode for LinkedIn centering');
                }
            }
        }

        // Apply dimension corrections for picture elements
        if (layoutMode === 'picture') {
            const pictureElement = originalImage.closest('picture');
            if (pictureElement) {
                const pictureRect = pictureElement.getBoundingClientRect();
                const imgRect = originalImage.getBoundingClientRect();
                const pictureAspectRatio = pictureRect.width / pictureRect.height;
                const imageAspectRatio = imgRect.width / imgRect.height;

                const isSuspiciouslyWide = pictureAspectRatio > 15;
                const hasSignificantDifference = Math.abs(pictureAspectRatio - imageAspectRatio) > 5;

                if ((isSuspiciouslyWide || hasSignificantDifference) &&
                    imageAspectRatio > 0.1 && imageAspectRatio < 10) {
                    targetDimensions.width = imgRect.width;
                    targetDimensions.height = imgRect.height;
                    console.log('Applied dimension correction for picture element');
                }
            }
        }

        console.log(`Creating lifViewer with layout mode: ${layoutMode}, dimensions: ${targetDimensions.width}x${targetDimensions.height}`);

        return new lifViewer(lifUrl, container, {
            ...options,
            layoutMode,
            targetDimensions,
            originalImage,
            layoutAnalysis,
            centeredImageInfo,
            autoplay: options.autoplay !== undefined ? options.autoplay : true,
            mouseOver: options.mouseOver !== undefined ? options.mouseOver : true
        });
    }

    /**
     * Calculate actual rendered dimensions and position for LinkedIn centered images
     */
    static calculateLinkedInCenteredImageDimensions(image, container) {
        try {
            const imageRect = image.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Get the image's natural dimensions
            const naturalWidth = image.naturalWidth;
            const naturalHeight = image.naturalHeight;
            const naturalAspectRatio = naturalWidth / naturalHeight;

            // Get container dimensions
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height;
            const containerAspectRatio = containerWidth / containerHeight;

            // Calculate how LinkedIn's object-fit: contain would size the image
            let renderedWidth, renderedHeight;

            if (naturalAspectRatio > containerAspectRatio) {
                // Image is wider - fit to container width
                renderedWidth = containerWidth;
                renderedHeight = containerWidth / naturalAspectRatio;
            } else {
                // Image is taller - fit to container height  
                renderedHeight = containerHeight;
                renderedWidth = containerHeight * naturalAspectRatio;
            }

            // Calculate centering offsets
            const offsetX = (containerWidth - renderedWidth) / 2;
            const offsetY = (containerHeight - renderedHeight) / 2;

            return {
                width: Math.round(renderedWidth),
                height: Math.round(renderedHeight),
                offsetX: Math.round(offsetX),
                offsetY: Math.round(offsetY),
                containerWidth: Math.round(containerWidth),
                containerHeight: Math.round(containerHeight)
            };

        } catch (error) {
            console.warn('Error calculating LinkedIn centered image dimensions:', error);
            return null;
        }
    }

    // Helper to await the image load
    async loadImage() {
        return new Promise((resolve, reject) => {
            this.img.onload = () => resolve();
            this.img.onerror = () => reject(new Error('Image failed to load'));
        });
    }

    async afterLoad() {
        // Enhanced afterLoad with layout-specific setup
        console.log(`LIF viewer loaded with layout mode: ${this.layoutMode}`);

        // Apply container styling if we have layout configuration
        if (this.layoutMode !== 'standard') {
            this.setupContainer();
        }

        // Hide original image if provided
        if (this.originalImage) {
            this.originalImage.style.display = 'none';
        }

        // Set up layout-specific event handling
        this.setupEventHandlers();

        // CRITICAL FIX: Sync canvas dimensions with actual LIF image dimensions
        // This ensures the canvas matches the LIF result image exactly
        await this.syncCanvasWithLIFResult();

        // Force correct dimensions one final time for layout-aware modes
        if (this.layoutConfig.preventResizing) {
            const dimensions = this.getEffectiveDimensions();
            this.canvas.width = dimensions.width;
            this.canvas.height = dimensions.height;
        }

        // Show canvas immediately for autoplay
        if (this.autoplay) {
            this.img.style.display = 'none';
            this.canvas.style.display = 'block';
        } else {
            // Ensure image is visible when not autoplaying
            this.img.style.display = 'block';
            this.canvas.style.display = 'none';
        }

        console.log(`Canvas ready with dimensions: ${this.canvas.width}x${this.canvas.height}`);
    };

    /**
     * Sync canvas dimensions with the actual LIF result image
     * This fixes dimension mismatches on sites like LinkedIn where containers have different aspect ratios
     */
    async syncCanvasWithLIFResult() {
        return new Promise((resolve) => {
            const maxAttempts = 10;
            let attempts = 0;

            const trySync = () => {
                attempts++;

                // Wait for the LIF image to load
                if (this.img && this.img.complete && this.img.naturalWidth > 0) {
                    const lifWidth = this.img.naturalWidth;
                    const lifHeight = this.img.naturalHeight;
                    const targetDimensions = this.getEffectiveDimensions();

                    console.log(`🔧 Syncing canvas (${this.layoutMode} mode): LIF=${lifWidth}x${lifHeight}, Target=${targetDimensions.width}x${targetDimensions.height} (attempt ${attempts})`);

                    // CRITICAL FIX: For standard layouts (Flickr), use target dimensions for both canvas internal and display
                    // For complex layouts (LinkedIn), use LIF result for internal, target for display
                    if (this.layoutMode === 'standard') {
                        // Standard layouts: Canvas internal dimensions should match target/container dimensions
                        this.canvas.width = targetDimensions.width;
                        this.canvas.height = targetDimensions.height;
                        this.canvas.style.width = `${targetDimensions.width}px`;
                        this.canvas.style.height = `${targetDimensions.height}px`;

                        console.log(`✅ Standard layout sync - Internal: ${this.canvas.width}x${this.canvas.height}, Display: ${this.canvas.style.width}x${this.canvas.style.height}`);
                    } else {
                        // Complex layouts: Use LIF result for internal dimensions, target for display
                        this.canvas.width = lifWidth;
                        this.canvas.height = lifHeight;

                        if (targetDimensions) {
                            this.canvas.style.width = `${targetDimensions.width}px`;
                            this.canvas.style.height = `${targetDimensions.height}px`;
                        } else {
                            this.canvas.style.width = `${lifWidth}px`;
                            this.canvas.style.height = `${lifHeight}px`;
                        }

                        console.log(`✅ Complex layout sync - Internal: ${this.canvas.width}x${this.canvas.height}, Display: ${this.canvas.style.width}x${this.canvas.style.height}`);
                    }

                    resolve();
                } else if (attempts < maxAttempts) {
                    // Wait and try again
                    setTimeout(trySync, 100);
                } else {
                    console.warn(`⚠️ Could not sync canvas with LIF result after ${maxAttempts} attempts`);

                    // Fallback for standard layouts: use target dimensions even if LIF image didn't load
                    if (this.layoutMode === 'standard') {
                        const targetDimensions = this.getEffectiveDimensions();
                        this.canvas.width = targetDimensions.width;
                        this.canvas.height = targetDimensions.height;
                        this.canvas.style.width = `${targetDimensions.width}px`;
                        this.canvas.style.height = `${targetDimensions.height}px`;
                        console.log(`🔄 Fallback standard layout dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
                    }

                    resolve();
                }
            };

            trySync();
        });
    }

    /**
     * Layout-aware container styling
     */
    setupContainer() {
        const config = this.layoutConfig;
        const dimensions = this.getEffectiveDimensions();

        if (config.containerSizing === 'preserve') {
            // Preserve existing container styling for responsive layouts
            const containerStyle = window.getComputedStyle(this.container);
            this.container.style.position = containerStyle.position === 'static' ? 'relative' : containerStyle.position;
            this.container.style.overflow = 'hidden';

            // CRITICAL FIX: For picture elements, ensure container has explicit dimensions
            // to prevent collapse when original image is hidden and content is absolutely positioned
            if (this.layoutMode === 'picture') {
                this.container.style.width = `${dimensions.width}px`;
                this.container.style.height = `${dimensions.height}px`;
                console.log(`Picture container dimensions set: ${dimensions.width}x${dimensions.height}px`);
            }

            console.log(`Preserved container styling for ${this.layoutMode} layout`);
        } else if (config.containerSizing === 'explicit') {
            // Standard explicit sizing
            this.container.style.cssText = `
                position: relative;
                display: inline-block;
                width: ${dimensions.width}px;
                height: ${dimensions.height}px;
                overflow: hidden;
            `;
        }
    }

    /**
     * Layout-aware event handling setup
     */
    setupEventHandlers() {
        const config = this.layoutConfig;

        if (config.eventHandling === 'unified') {
            // For picture elements - unified events on both canvas and static image
            this.setupUnifiedEventHandlers();
        } else if (config.eventHandling === 'overlay') {
            // For aspect ratio containers and overlays
            this.setupOverlayEventHandlers();
        } else {
            // Standard event handling - don't override existing events
            this.setupStandardEventHandlers();
        }
    }

    setupUnifiedEventHandlers() {
        let animationTimeoutId = null;

        const startAnimation = () => {
            if (animationTimeoutId) {
                clearTimeout(animationTimeoutId);
                animationTimeoutId = null;
            }

            if (!this.running) {
                this.startAnimation();
            }
        };

        const stopAnimation = () => {
            if (this.running) {
                // Small delay to prevent rapid toggling
                animationTimeoutId = setTimeout(() => {
                    if (this.running) {
                        this.stopAnimation();
                    }
                    animationTimeoutId = null;
                }, 100);
            }
        };

        this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
        this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });

        // Also add events to static image for comprehensive coverage
        this.img.addEventListener('mouseenter', startAnimation, { passive: true });
        this.img.addEventListener('mouseleave', stopAnimation, { passive: true });

        console.log('✅ Unified event handlers configured');
    }

    setupOverlayEventHandlers() {
        // Standard overlay events for aspect ratio containers
        let animationTimeoutId = null;

        const startAnimation = () => {
            if (animationTimeoutId) {
                clearTimeout(animationTimeoutId);
                animationTimeoutId = null;
            }

            if (!this.running) {
                console.log('Starting animation (overlay)');
                this.startAnimation();
            }
        };

        const stopAnimation = () => {
            if (this.running) {
                console.log('Stopping animation (overlay)');

                // Small delay to prevent rapid toggling
                animationTimeoutId = setTimeout(() => {
                    if (this.running) {
                        this.stopAnimation();
                    }
                    animationTimeoutId = null;
                }, 100);
            }
        };

        this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
        this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });

        // Also add events to static image for comprehensive coverage
        this.img.addEventListener('mouseenter', startAnimation, { passive: true });
        this.img.addEventListener('mouseleave', stopAnimation, { passive: true });

        console.log('Overlay event handlers configured');
    }

    setupStandardEventHandlers() {
        // Basic event handling for standard layouts
        // Only add if not already present to avoid conflicts
        if (!this.canvas.hasAttribute('data-lif-events-added')) {
            let animationTimeoutId = null;

            const startAnimation = () => {
                if (animationTimeoutId) {
                    clearTimeout(animationTimeoutId);
                    animationTimeoutId = null;
                }

                // Use lifViewer's internal state instead of local state
                if (!this.running) {
                    console.log('Starting animation (standard)');
                    this.startAnimation();
                }
            };

            const stopAnimation = () => {
                // Use lifViewer's internal state instead of local state
                if (this.running) {
                    console.log('Stopping animation (standard)');

                    // Small delay to prevent rapid toggling
                    animationTimeoutId = setTimeout(() => {
                        // Double-check state before stopping
                        if (this.running) {
                            this.stopAnimation();
                        }
                        animationTimeoutId = null;
                    }, 100);
                }
            };

            // FLICKR FIX: Boost canvas z-index and disable overlay pointer events
            // Similar to Shutterstock fix pattern
            if (window.location.hostname.includes('flickr.com')) {
                console.log('🔧 Applying Flickr z-index boost for canvas events');
                this.canvas.style.zIndex = '999999';  // Higher than typical overlays
                this.img.style.zIndex = '999998';     // Slightly lower than canvas

                // AGGRESSIVE FIX: Disable Flickr overlays that might be intercepting events
                const flickrOverlays = this.container.parentElement?.querySelectorAll('.overlay, a.overlay, .interaction-view, .photo-list-photo-interaction');
                if (flickrOverlays) {
                    flickrOverlays.forEach(overlay => {
                        console.log('🔧 Disabling pointer events on Flickr overlay:', overlay.className);
                        overlay.style.pointerEvents = 'none';
                    });
                }
            }

            this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
            this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });

            // Also add events to static image for comprehensive coverage
            this.img.addEventListener('mouseenter', startAnimation, { passive: true });
            this.img.addEventListener('mouseleave', stopAnimation, { passive: true });

            // FLICKR FIX: Add container-level events as fallback for overlay interference
            // If Flickr's overlay still blocks events, container events will catch them
            if (window.location.hostname.includes('flickr.com') && this.container) {
                console.log('🔧 Adding Flickr container-level event fallback');

                this.container.addEventListener('mouseenter', (e) => {
                    // Only trigger if mouse is over our canvas area
                    const canvasRect = this.canvas.getBoundingClientRect();
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;

                    if (mouseX >= canvasRect.left && mouseX <= canvasRect.right &&
                        mouseY >= canvasRect.top && mouseY <= canvasRect.bottom) {
                        console.log('🎯 Flickr container mouseenter detected over canvas area');
                        startAnimation();
                    }
                }, { passive: true });

                this.container.addEventListener('mouseleave', () => {
                    console.log('🎯 Flickr container mouseleave detected');
                    stopAnimation();
                }, { passive: true });
            }

            this.canvas.setAttribute('data-lif-events-added', 'true');
            console.log('Standard event handlers configured');
        }
    }

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

        // Fix shader paths for Chrome extension
        const extensionUrl = chrome.runtime.getURL('');
        this.fragmentShaderUrl = this.views.length < 2 ?
            extensionUrl + "shaders/rayCastMonoLDIGlow.glsl" :
            extensionUrl + "shaders/rayCastStereoLDIGlow.glsl";
        this.vertexShaderUrl = extensionUrl + "shaders/vertex.glsl";

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
        // Mouse position tracking - for picture elements, also add to container since canvas may be hidden
        const mouseMoveHandler = function (event) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left - rect.width / 2; // Get mouse X position relative to the canvas
            const mouseY = event.clientY - rect.top - rect.height / 2; // Get mouse Y position relative to the canvas

            // Calculate the position relative to the center, normalized between -0.5 and +0.5
            this.mousePos.x = (mouseX / rect.width);
            this.mousePos.y = (mouseY / rect.width);

            // console.log(`(${relativeX}, ${relativeY}`); // Outputs values between -0.5 and +0.5
        }.bind(this);

        this.canvas.addEventListener('mousemove', mouseMoveHandler);

        // For picture layout mode, also add mousemove to container since canvas starts hidden
        if (this.layoutMode === 'picture') {
            this.container.addEventListener('mousemove', mouseMoveHandler);
        }
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
        const config = this.layoutConfig;

        if (config.preventResizing) {
            // For picture elements and aspect ratio containers, 
            // prevent automatic resizing and use target dimensions
            const dimensions = this.getEffectiveDimensions();
            this.canvas.width = dimensions.width;
            this.canvas.height = dimensions.height;

            console.log(`Layout-aware canvas sizing (${this.layoutMode}): ${dimensions.width}x${dimensions.height}`);

            // LINKEDIN CENTERING FIX: Log centered positioning for debugging
            if (this.centeredImageInfo) {
                console.log(`🎯 LinkedIn centering applied: ${dimensions.width}x${dimensions.height} at offset (${this.centeredImageInfo.offsetX}, ${this.centeredImageInfo.offsetY})`);
            }
            return;
        }

        // CRITICAL FIX: For standard layouts, don't resize if canvas already has correct dimensions
        // This prevents overriding the syncCanvasWithLIFResult() method
        if (this.layoutMode === 'standard') {
            const targetDimensions = this.getEffectiveDimensions();

            // Check if canvas already has the correct target dimensions
            if (this.canvas.width === targetDimensions.width &&
                this.canvas.height === targetDimensions.height) {
                console.log(`Standard layout: Canvas already has correct dimensions ${this.canvas.width}x${this.canvas.height}, skipping resize`);
                return;
            }

            // If dimensions don't match, use target dimensions directly (don't trust originalImg attributes)
            this.canvas.width = targetDimensions.width;
            this.canvas.height = targetDimensions.height;
            console.log(`Standard layout: Applied target dimensions ${targetDimensions.width}x${targetDimensions.height}`);
            return;
        }

        // Standard resizing behavior for normal layouts
        const parent = this.container;
        const originalImg = parent.querySelector('img[data-lif-button-added="true"]');

        if (originalImg) {
            // CRITICAL FIX: Use computed dimensions instead of width/height attributes
            // Fixes Flickr issue where width="100%" height="100%" returns 100x100 instead of actual size
            const imgRect = originalImg.getBoundingClientRect();
            let displayedWidth = Math.round(imgRect.width);
            let displayedHeight = Math.round(imgRect.height);

            // Fallback to attributes if getBoundingClientRect returns zero
            if (displayedWidth <= 0 || displayedHeight <= 0) {
                displayedWidth = originalImg.width || originalImg.naturalWidth;
                displayedHeight = originalImg.height || originalImg.naturalHeight;
                console.log(`🔄 Fallback to image attributes: ${displayedWidth}x${displayedHeight}`);
            }

            this.canvas.width = displayedWidth;
            this.canvas.height = displayedHeight;

            console.log(`Standard canvas resizing (computed): ${displayedWidth}x${displayedHeight}`);
        } else {
            // Fallback to current behavior
            this.canvas.width = this.img.width;
            this.canvas.height = this.img.height;

            console.log(`Canvas resized using fallback: ${this.img.width}x${this.img.height}`);
        }
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

            console.log('🔄 Animation ended - display states changed:');
            console.log('📊 Canvas state:', {
                display: this.canvas.style.display,
                position: this.canvas.style.position,
                zIndex: this.canvas.style.zIndex
            });
            console.log('📊 LIF image state:', {
                display: this.img.style.display,
                position: this.img.style.position,
                zIndex: this.img.style.zIndex,
                width: this.img.style.width,
                height: this.img.style.height,
                pointerEvents: this.img.style.pointerEvents
            });

            console.log('✅ Animation ended - layout-aware positioning handled by enhanced architecture');

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

            console.log('🚀 Animation started - display states changed:');
            console.log('📊 Canvas state:', {
                display: this.canvas.style.display,
                position: this.canvas.style.position,
                zIndex: this.canvas.style.zIndex
            });
            console.log('📊 LIF image state:', {
                display: this.img.style.display,
                position: this.img.style.position,
                zIndex: this.img.style.zIndex
            });

            // Enhanced architecture handles positioning automatically
            this.startTime = Date.now() / 1000;
            //console.log(this.views);
            this.animationFrame = requestAnimationFrame(this.render);
        } else {
            // console.log("gl context missing for", this.lifUrl.split('/').pop());
            this.canvas.remove();
            this.canvas = document.createElement('canvas');
            this.canvas.style.display = 'none';
            this.container.appendChild(this.canvas);

            // Ensure proper sizing during canvas recreation
            this.resizeCanvasToContainer();

            // Apply the same styling as the afterLoad function to maintain consistency
            const originalImg = this.container.querySelector('img[data-lif-button-added="true"]');
            if (originalImg) {
                const originalWidth = originalImg.width || originalImg.naturalWidth;
                const originalHeight = originalImg.height || originalImg.naturalHeight;

                this.canvas.style.cssText = `
                    width: ${originalWidth}px !important;
                    height: ${originalHeight}px !important;
                    max-width: ${originalWidth}px !important;
                    max-height: ${originalHeight}px !important;
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 2;
                    display: none;
                `;
            }

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
            // window.addEventListener('deviceorientation', function (event) {
            //     // event.beta is the tilt in the x-axis (front-back tilting), normalized between -90 and +90
            //     // event.gamma is the tilt in the y-axis (left-right tilting), normalized between -90 and +90

            //     // Normalize beta and gamma to a value between -0.5 and +0.5
            //     this.mousePos.y = event.beta / 45;  // Normalized value for front-back tilt
            //     this.mousePos.x = event.gamma / 45;  // Normalized value for left-right tilt

            //     // console.log(`Tilt X: ${this.tilt.x}, Tilt Y: ${this.tilt.y}`); // Log the tilt values
            // });
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

// LifLoader class wrapper for VR compatibility
class LifLoader {
    constructor() {
        this.views = null;
        this.stereo_render_data = null;
    }

    async load(file) {
        try {
            // Use the existing parseLif5 function from LIF.js
            const result = await parseLif5(file);

            this.views = result.views;
            this.stereo_render_data = result.stereo_render_data;

            return {
                views: this.views,
                stereo_render_data: this.stereo_render_data
            };
        } catch (error) {
            console.error('LifLoader error:', error);
            throw error;
        }
    }
}

// Make LifLoader available globally for VR extension
window.LifLoader = LifLoader;