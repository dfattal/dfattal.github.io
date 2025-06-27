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
        // this.AWS_LAMBDA_URL = 'https://dqrluvhhkamlne6cpc6g6waaay0whxpb.lambda-url.us-east-1.on.aws/?mode=' + mode2;
        this.AWS_LAMBDA_URL = 'https://gf6coowgaocqp5nfny5tn6ft4q0nxsvy.lambda-url.us-east-1.on.aws/?mode=' + mode2;
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
        // Use a unique timer name to avoid conflicts between multiple conversions
        const timerName = `fetchDuration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Start timing the fetch
        console.time(timerName);
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
            // End timer even if there's an error
            try {
                console.timeEnd(timerName);
            } catch (timerError) {
                console.warn('Timer was not started or already ended');
            }
            return;
        }

        try {
            this.lifFile = await fetch(this.lifDownloadUrl);
            console.timeEnd(timerName);
        } catch (timerError) {
            console.warn('Timer was not started or already ended');
        }

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

// Shared animation definitions - single source of truth
const ANIMATION_DEFINITIONS = [
    { name: "Zoom In", index: 0, type: "harmonic", duration: 4.0 },
    { name: "Ken Burns", index: 1, type: "harmonic", duration: 4.0 },
    { name: "Panning Hor", index: 2, type: "harmonic", duration: 4.0 },
    { name: "Panning Vert", index: 3, type: "harmonic", duration: 4.0 },
    { name: "Tracking Hor", index: 4, type: "harmonic", duration: 4.0 },
    { name: "Tracking Vert", index: 5, type: "harmonic", duration: 4.0 },
    { name: "Static", index: 6, type: "harmonic", duration: 4.0 }
];

class lifViewer {
    static instances = [];
    static activeInstance = null; // Track the currently active/focused instance

    constructor(lifUrl, container, heightOrOptions = 300, autoplay = false, mouseOver = true) {
        lifViewer.instances.push(this);

        // Set this instance as active (most recently created)
        lifViewer.activeInstance = this;

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

        // Theater mode detection for enhanced z-index handling
        this.isTheaterMode = this.detectTheaterModeContext();

        // Boost z-index for theater mode scenarios
        if (this.isTheaterMode) {
            this.canvasZIndex = Math.max(this.canvasZIndex, 999999);
            this.imageZIndex = Math.max(this.imageZIndex, 999998);
            console.log('🎭 Theater mode detected - boosting z-index:', {
                canvasZIndex: this.canvasZIndex,
                imageZIndex: this.imageZIndex
            });
        }

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
        this.renderOffAnimationFrame = null; // Track renderOff animation frame separately
        this.isRenderingOff = false; // Track if renderOff animation is in progress
        this.render = this.render.bind(this);

        // Feathering and background color properties
        this.feathering = 0.1;
        this.background = [0.1, 0.1, 0.1, 1.0];  // RGBA background color

        // Relaxation/transition time for renderOff animation (in seconds)
        this.relaxationTime = options.relaxationTime !== undefined ? options.relaxationTime : 0.5;
    }

    /**
     * Get layout-specific configuration based on detected layout mode
     */
    getLayoutConfiguration() {
        const configs = {
            standard: {
                containerSizing: 'explicit',
                canvasPositioning: 'absolute', // SIMPLIFIED: Always use absolute positioning
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
        // Only create the canvas for LIF rendering
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl');
        this.canvas.style.display = 'none';
        this.canvas.dataset.lifLayoutMode = this.layoutMode;

        // Windows Debug: Check WebGL context creation
        console.log('🎮 Windows Debug - WebGL context creation:', {
            canvasCreated: !!this.canvas,
            webglContext: !!this.gl,
            webglError: this.gl ? null : 'WebGL context creation failed',
            canvasTagName: this.canvas.tagName,
            userAgent: navigator.userAgent.includes('Windows') ? 'Windows detected' : 'Non-Windows'
        });

        // Inherit CSS classes from the original image for proper styling constraints
        if (this.originalImage && this.originalImage.className) {
            this.canvas.className = this.originalImage.className;
            console.log('🎨 Canvas inheriting image classes:', this.originalImage.className);
        }
    }

    /**
     * Apply layout-specific styling during creation
     */
    setupLayoutSpecificStyling() {
        // SIMPLIFIED: Always use absolute positioning for canvas over image
        const dimensions = this.getEffectiveDimensions();
        let positioningStyle = 'top: 0; left: 0;';

        // Special handling for virtual images - calculate position relative to container
        if (this.originalImage && this.originalImage._isVirtualBackgroundImage) {
            const originalElement = this.originalImage._originalBackgroundElement || this.originalImage._originalPictureElement;

            if (originalElement) {
                const containerRect = this.container.getBoundingClientRect();
                const elementRect = originalElement.getBoundingClientRect();

                // Calculate offset of original element relative to container
                let offsetTop = elementRect.top - containerRect.top;
                let offsetLeft = elementRect.left - containerRect.left;

                // For background images, also calculate cropping/positioning offset
                if (this.originalImage._originalBackgroundElement) {
                    const backgroundOffset = this.calculateBackgroundImageOffset(originalElement);
                    if (backgroundOffset) {
                        offsetTop += backgroundOffset.top;
                        offsetLeft += backgroundOffset.left;
                        console.log('🎨 Applied background positioning offset:', backgroundOffset);
                    }
                }

                positioningStyle = `top: ${offsetTop}px; left: ${offsetLeft}px;`;
                console.log('🎭 Virtual image: positioning canvas relative to container at offset:', { top: offsetTop, left: offsetLeft });
            }
        }
        // Handle centered image positioning (LinkedIn-style)
        else if (this.centeredImageInfo) {
            positioningStyle = `top: ${this.centeredImageInfo.offsetY}px; left: ${this.centeredImageInfo.offsetX}px;`;
            console.log('🎯 Applying centered image positioning:', positioningStyle);
        } else {
            // Check for Windows Flickr special case
            const isWindows = navigator.userAgent.includes('Windows');
            const isFlickr = window.location.hostname.includes('flickr.com');

            if (isWindows && isFlickr && this.container === this.originalImage?.parentElement) {
                // WINDOWS FLICKR: Use same positioning logic as Mac (with offset calculation)
                const nestedOffset = this.calculateNestedContainerOffset();
                if (nestedOffset) {
                    positioningStyle = `top: ${nestedOffset.top}px; left: ${nestedOffset.left}px;`;
                    console.log('🪟 Windows Flickr: Using Mac-like positioning with offset:', positioningStyle);
                } else {
                    positioningStyle = `top: 0px; left: 0px;`;
                    console.log('🪟 Windows Flickr: Fallback positioning:', positioningStyle);
                }
            } else if (this.container === document.body && this.originalImage) {
                // Check for document.body fallback positioning
                const imageRect = this.originalImage.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

                positioningStyle = `top: ${imageRect.top + scrollTop}px; left: ${imageRect.left + scrollLeft}px;`;
                console.log('📍 Applying document.body positioning over image:', positioningStyle);
            } else {
                // Check for nested positioning containers (Flickr facade pattern, etc.)
                const nestedOffset = this.calculateNestedContainerOffset();
                if (nestedOffset) {
                    positioningStyle = `top: ${nestedOffset.top}px; left: ${nestedOffset.left}px;`;
                    console.log('🏗️ Applying nested container positioning:', positioningStyle);
                }
            }
        }

        // Check if canvas has inherited CSS classes that should handle sizing
        const hasInheritedClasses = this.canvas.className && this.canvas.className.trim().length > 0;

        if (hasInheritedClasses) {
            // Let inherited CSS classes handle width/height, only set positioning and display properties
            this.canvas.style.cssText = `
                max-width: none !important;
                max-height: none !important;
                position: absolute !important;
                ${positioningStyle}
                z-index: ${this.canvasZIndex} !important;
                display: none !important;
                pointer-events: auto !important;
                cursor: pointer !important;
                object-fit: none !important;
                object-position: initial !important;
            `;
            console.log('🎨 Canvas has inherited classes - letting CSS handle sizing');
        } else {
            // No inherited classes, use explicit dimensions
            this.canvas.style.cssText = `
                width: ${dimensions.width}px !important;
                height: ${dimensions.height}px !important;
                max-width: none !important;
                max-height: none !important;
                position: absolute !important;
                ${positioningStyle}
                z-index: ${this.canvasZIndex} !important;
                display: none !important;
                pointer-events: auto !important;
                cursor: pointer !important;
                object-fit: none !important;
                object-position: initial !important;
            `;
        }
    }

    /**
 * Calculate offset and dimensions for background image positioning
 * Handles background-position, background-size, and aspect ratio cropping
 */
    calculateBackgroundImageOffset(backgroundElement) {
        try {
            const computedStyle = window.getComputedStyle(backgroundElement);
            const backgroundPosition = computedStyle.backgroundPosition || 'center center';
            const backgroundSize = computedStyle.backgroundSize || 'auto';

            // Get element dimensions
            const elementRect = backgroundElement.getBoundingClientRect();
            const containerWidth = elementRect.width;
            const containerHeight = elementRect.height;
            const containerAspectRatio = containerWidth / containerHeight;

            // Try to get the original image's aspect ratio from the virtual image
            let imageAspectRatio = null;
            if (this.originalImage && this.originalImage.naturalWidth && this.originalImage.naturalHeight) {
                imageAspectRatio = this.originalImage.naturalWidth / this.originalImage.naturalHeight;
            } else {
                // Fallback: assume a common image aspect ratio if we can't determine it
                imageAspectRatio = 4 / 3; // Default assumption
                console.log('🎨 Using fallback aspect ratio (4:3) for background image calculation');
            }

            // Calculate how the background image would be displayed
            let displayWidth, displayHeight, offsetX = 0, offsetY = 0;

            // Handle background-size
            if (backgroundSize === 'cover' || backgroundSize === 'auto' || !backgroundSize) {
                // 'cover' or default behavior: image is scaled to cover the entire container
                // The image may be cropped to maintain aspect ratio

                if (imageAspectRatio > containerAspectRatio) {
                    // Image is wider than container - image height matches container, width is cropped
                    displayHeight = containerHeight;
                    displayWidth = displayHeight * imageAspectRatio;
                } else {
                    // Image is taller than container - image width matches container, height is cropped
                    displayWidth = containerWidth;
                    displayHeight = displayWidth / imageAspectRatio;
                }
            } else if (backgroundSize === 'contain') {
                // 'contain': entire image is visible, may have letterboxing
                if (imageAspectRatio > containerAspectRatio) {
                    displayWidth = containerWidth;
                    displayHeight = displayWidth / imageAspectRatio;
                } else {
                    displayHeight = containerHeight;
                    displayWidth = displayHeight * imageAspectRatio;
                }
            } else {
                // Explicit size values (px, %, etc.) - not handling these complex cases for now
                displayWidth = containerWidth;
                displayHeight = containerHeight;
            }

            // Calculate the offset of the displayed image within the container
            const cropOffsetX = (displayWidth - containerWidth) / 2;
            const cropOffsetY = (displayHeight - containerHeight) / 2;

            // Parse background-position
            const positionParts = backgroundPosition.trim().split(/\s+/);
            let xPosition = 'center';
            let yPosition = 'center';

            if (positionParts.length >= 2) {
                xPosition = positionParts[0];
                yPosition = positionParts[1];
            } else if (positionParts.length === 1) {
                xPosition = positionParts[0];
                // If only one value is provided, the second value defaults to 'center'
                yPosition = 'center';
            }

            // Handle x-position
            if (xPosition === 'left' || xPosition === '0%') {
                offsetX = -cropOffsetX;
            } else if (xPosition === 'center' || xPosition === '50%') {
                offsetX = 0; // No offset for center
            } else if (xPosition === 'right' || xPosition === '100%') {
                offsetX = cropOffsetX;
            } else if (xPosition.includes('%')) {
                const percentage = parseFloat(xPosition);
                // For percentage values: 0% = left edge, 50% = center, 100% = right edge
                offsetX = -cropOffsetX + (cropOffsetX * 2 * percentage / 100);
            } else if (xPosition.includes('px')) {
                offsetX = parseFloat(xPosition) - cropOffsetX;
            }

            // Handle y-position
            if (yPosition === 'top' || yPosition === '0%') {
                offsetY = -cropOffsetY;
            } else if (yPosition === 'center' || yPosition === '50%') {
                offsetY = 0; // No offset for center
            } else if (yPosition === 'bottom' || yPosition === '100%') {
                offsetY = cropOffsetY;
            } else if (yPosition.includes('%')) {
                const percentage = parseFloat(yPosition);
                // For percentage values: 0% = top edge, 50% = center, 100% = bottom edge
                offsetY = -cropOffsetY + (cropOffsetY * 2 * percentage / 100);
            } else if (yPosition.includes('px')) {
                offsetY = parseFloat(yPosition) - cropOffsetY;
            }

            console.log('🎨 Background image layout analysis:', {
                backgroundPosition,
                backgroundSize,
                containerSize: `${containerWidth}x${containerHeight}`,
                imageAspectRatio,
                containerAspectRatio,
                displaySize: `${Math.round(displayWidth)}x${Math.round(displayHeight)}`,
                cropOffset: { x: Math.round(cropOffsetX), y: Math.round(cropOffsetY) },
                parsedPosition: { x: xPosition, y: yPosition },
                calculatedOffset: { top: Math.round(offsetY), left: Math.round(offsetX) }
            });

            // Only return offset if it's significant (avoid tiny adjustments)
            if (Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) {
                return {
                    top: Math.round(offsetY),
                    left: Math.round(offsetX),
                    // Also store additional info for potential future use
                    displaySize: { width: Math.round(displayWidth), height: Math.round(displayHeight) },
                    cropOffset: { x: Math.round(cropOffsetX), y: Math.round(cropOffsetY) }
                };
            }

            return null;
        } catch (error) {
            console.warn('Error calculating background image offset:', error);
            return null;
        }
    }

    /**
     * Calculate positioning offset for nested containers
     * Detects patterns like Flickr's facade-of-protection, theater mode containers, etc.
     */
    calculateNestedContainerOffset() {
        if (!this.originalImage || !this.container) {
            return null;
        }

        // Special handling for virtual images - skip nested container calculations
        if (this.originalImage._isVirtualBackgroundImage) {
            console.log('🎭 Virtual image detected - skipping nested container offset calculation');
            return null;
        }

        // GENERIC: Skip nested container detection for carousel/list/grid items
        // Images in carousels/lists/grids are typically positioned correctly relative to their immediate container
        const specialLayoutContainer = this.originalImage.closest('li') ||
            this.originalImage.closest('[class*="carousel"]') ||
            this.originalImage.closest('[class*="slider"]') ||
            this.originalImage.closest('[class*="feed"]') ||
            this.originalImage.closest('[class*="list-item"]') ||
            this.originalImage.closest('[class*="masonry"]') ||
            this.originalImage.closest('[class*="grid"]') ||
            this.originalImage.closest('[data-testid*="grid"]') ||
            this.originalImage.closest('[data-testid*="masonry"]') ||
            this.originalImage.closest('[data-masonryposition]') ||
            this.originalImage.closest('[role="listitem"]');

        if (specialLayoutContainer) {
            console.log('🎠 Special layout container detected:', {
                layoutElement: specialLayoutContainer.className || specialLayoutContainer.tagName,
                containerElement: this.container.className || this.container.tagName,
                layoutType: specialLayoutContainer.closest('[class*="masonry"], [data-testid*="masonry"], [data-masonryposition]') ? 'masonry' :
                    specialLayoutContainer.closest('[class*="grid"], [data-testid*="grid"]') ? 'grid' :
                        specialLayoutContainer.closest('[class*="carousel"], [class*="slider"]') ? 'carousel' :
                            specialLayoutContainer.closest('[class*="feed"], [class*="list"]') ? 'feed/list' : 'other'
            });

            // For special layout containers, always skip nested container offset calculation
            // The image should be positioned relative to its immediate container (usually an <a> tag)
            console.log('🎠 Skipping nested container offset calculation for special layout item');
            return null;
        }

        // Get the original image's position relative to our container
        const containerRect = this.container.getBoundingClientRect();
        const imageRect = this.originalImage.getBoundingClientRect();

        // Validate rectangles (Windows Chrome fix)
        if (!containerRect || !imageRect ||
            typeof containerRect.top === 'undefined' || typeof imageRect.top === 'undefined') {
            console.warn('⚠️ Invalid getBoundingClientRect in calculateNestedContainerOffset - using fallback');
            return null;
        }

        // Calculate the offset of the image relative to the container
        const imageOffsetTop = imageRect.top - containerRect.top;
        const imageOffsetLeft = imageRect.left - containerRect.left;

        // If the image is significantly offset from the container's origin,
        // it's likely positioned within a nested container
        const hasSignificantOffset = Math.abs(imageOffsetTop) > 5 || Math.abs(imageOffsetLeft) > 5;

        if (hasSignificantOffset) {
            // Look for common nested container patterns
            const nestedContainer = this.findNestedPositioningContainer();

            if (nestedContainer) {
                const nestedRect = nestedContainer.getBoundingClientRect();

                // Validate nested container rectangle (Windows Chrome fix)
                if (!nestedRect || typeof nestedRect.top === 'undefined') {
                    console.warn('⚠️ Invalid getBoundingClientRect for nested container - using image offset');
                    return {
                        top: imageOffsetTop,
                        left: imageOffsetLeft
                    };
                }

                const nestedOffsetTop = nestedRect.top - containerRect.top;
                const nestedOffsetLeft = nestedRect.left - containerRect.left;

                console.log('🏗️ Nested container detected:', {
                    containerType: nestedContainer.className || nestedContainer.tagName,
                    imageOffset: { top: imageOffsetTop, left: imageOffsetLeft },
                    nestedOffset: { top: nestedOffsetTop, left: nestedOffsetLeft },
                    usingNestedOffset: true
                });

                return {
                    top: nestedOffsetTop,
                    left: nestedOffsetLeft
                };
            } else {
                // No specific nested container found, use image offset directly
                console.log('🏗️ Image offset detected (no nested container):', {
                    imageOffset: { top: imageOffsetTop, left: imageOffsetLeft },
                    usingImageOffset: true
                });

                return {
                    top: imageOffsetTop,
                    left: imageOffsetLeft
                };
            }
        }

        return null;
    }

    /**
     * Find nested positioning containers using common patterns
     */
    findNestedPositioningContainer() {
        // Common nested container selectors (ordered by specificity)
        const nestedContainerSelectors = [
            // Flickr patterns
            '.facade-of-protection-neue',
            '.facade-of-protection',

            // Theater/modal patterns
            '.theater-container',
            '.modal-content',
            '.lightbox-content',

            // Media viewer patterns
            '.media-viewer',
            '.photo-viewer',
            '.image-viewer',

            // Generic positioned containers
            '[style*="position: absolute"]',
            '[style*="position: relative"]',

            // Containers with explicit dimensions
            '[style*="width:"][style*="height:"]'
        ];

        for (const selector of nestedContainerSelectors) {
            try {
                const nestedContainer = this.container.querySelector(selector);
                if (nestedContainer && this.isValidNestedContainer(nestedContainer)) {
                    return nestedContainer;
                }
            } catch (e) {
                // Skip invalid selectors
                continue;
            }
        }

        return null;
    }

    /**
     * Validate that a potential nested container is actually positioning the image
     */
    isValidNestedContainer(container) {
        if (!container || !this.originalImage) {
            return false;
        }

        // Check if the image is a descendant of or sibling to this container
        const isDescendant = container.contains(this.originalImage);
        const isNextSibling = container.nextElementSibling === this.originalImage;
        const isPreviousSibling = container.previousElementSibling === this.originalImage;

        if (!isDescendant && !isNextSibling && !isPreviousSibling) {
            return false;
        }

        // Check if container has positioning styles
        const computedStyle = window.getComputedStyle(container);
        const hasPositioning = computedStyle.position !== 'static';
        const hasDimensions = computedStyle.width !== 'auto' || computedStyle.height !== 'auto';

        // Check if container has explicit dimensions in style attribute (common pattern)
        const hasInlineStyles = container.style.width || container.style.height;

        return hasPositioning || hasDimensions || hasInlineStyles;
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

        // Special handling for virtual images (Getty Images background images)
        if (originalImage._isVirtualBackgroundImage) {
            layoutMode = 'overlay';
            console.log('🎭 Virtual background image detected - using overlay mode');
        } else if (originalImage.closest('picture')) {
            layoutMode = 'picture';
        } else if (layoutAnalysis?.isFacebookStyle) {
            layoutMode = 'facebook';
        } else if (layoutAnalysis?.containerHasPaddingAspectRatio) {
            layoutMode = 'aspectRatio';
        } else if (layoutAnalysis?.preserveOriginal) {
            // COMMENTED OUT: Site-specific layout mode overrides
            // TODO: Find a way to detect when standard mode is better than overlay
            // if (window.location.hostname.includes('deviantart.com')) {
            //     layoutMode = 'standard';
            //     console.log('🎨 DeviantArt detected - forcing standard layout mode despite preserveOriginal flag');
            // } else if (window.location.hostname.includes('redbubble.com')) {
            //     layoutMode = 'standard';
            //     console.log('🛍️ RedBubble detected - forcing standard layout mode despite preserveOriginal flag');
            // } else {
            //     layoutMode = 'overlay';
            // }

            // GENERALIZED: Use overlay mode for preserveOriginal layouts
            layoutMode = 'overlay';
        }

        // Dimension handling for different image types
        let targetDimensions = {
            width: originalImage.width || originalImage.naturalWidth,
            height: originalImage.height || originalImage.naturalHeight
        };

        // Special dimension handling for virtual images (background images from any element)
        if (originalImage._isVirtualBackgroundImage) {
            const originalElement = originalImage._originalBackgroundElement || originalImage._originalPictureElement;
            if (originalElement) {
                const elementRect = originalElement.getBoundingClientRect();

                // For background images, we need to account for CSS positioning and cropping
                if (originalImage._originalBackgroundElement) {
                    // Calculate the actual display size of the background image
                    const backgroundLayout = lifViewer.calculateBackgroundImageLayout(originalElement, originalImage);
                    if (backgroundLayout && backgroundLayout.displaySize) {
                        targetDimensions = {
                            width: backgroundLayout.displaySize.width,
                            height: backgroundLayout.displaySize.height
                        };
                        console.log('🎨 Virtual background image dimensions from calculated layout:', targetDimensions);
                    } else {
                        // Fallback to element size
                        targetDimensions = {
                            width: elementRect.width,
                            height: elementRect.height
                        };
                        console.log('🎭 Virtual background image dimensions from element (fallback):', targetDimensions);
                    }
                } else {
                    // For picture elements, use the original approach
                    targetDimensions = {
                        width: elementRect.width,
                        height: elementRect.height
                    };
                    console.log('🎭 Virtual picture image dimensions from element:', targetDimensions);
                }
            }
        }

        let centeredImageInfo = null;
        // if (window.location.hostname.includes('linkedin.com') &&
        //     (originalImage.classList.contains('ivm-view-attr__img--centered') ||
        //         originalImage.classList.contains('ivm-view-attr__img--aspect-fit') ||
        //         originalImage.classList.contains('ivm-view-attr__img--aspect-fill'))) {
        //     centeredImageInfo = lifViewer.calculateLinkedInCenteredImageDimensions(originalImage, container);
        //     if (centeredImageInfo) {
        //         console.log('🎯 LinkedIn centered image detected:', centeredImageInfo);
        //         targetDimensions = {
        //             width: centeredImageInfo.width,
        //             height: centeredImageInfo.height
        //         };
        //         if (layoutAnalysis?.containerHasPaddingAspectRatio) {
        //             layoutMode = 'aspectRatio';
        //             console.log('🎯 Forcing aspectRatio layout mode for LinkedIn centering');
        //         }
        //     }
        // }

        // GENERALIZED: Detect centered/fitted images using CSS and class patterns
        const isCenteredOrFitted = (
            // Generic class patterns
            originalImage.classList.contains('centered') ||
            originalImage.classList.contains('aspect-fit') ||
            originalImage.classList.contains('aspect-fill') ||
            // Site-specific prefixed classes (keeping pattern recognition)
            originalImage.className.includes('centered') ||
            originalImage.className.includes('aspect-fit') ||
            originalImage.className.includes('aspect-fill') ||
            // CSS object-fit detection
            originalImage.style.objectFit === 'contain' ||
            originalImage.style.objectFit === 'cover'
        );

        // Get computed style for comprehensive object-fit detection
        const computedStyle = window.getComputedStyle(originalImage);
        const hasObjectFit = computedStyle.objectFit && computedStyle.objectFit !== 'fill' && computedStyle.objectFit !== 'none';

        if (isCenteredOrFitted && layoutAnalysis?.containerHasPaddingAspectRatio && layoutMode !== 'overlay') {
            // Use image dimensions for fitted images in aspect ratio containers
            // BUT: Don't override virtual image overlay mode
            if (originalImage.width && originalImage.height) {
                targetDimensions = {
                    width: originalImage.width,
                    height: originalImage.height
                };
                layoutMode = 'aspectRatio';
                console.log('🎯 Centered/fitted image in aspect ratio container - using image dimensions');
            }
        } else if (hasObjectFit || (isCenteredOrFitted && (originalImage.naturalWidth || originalImage.width))) {
            // Use aspectRatio mode for any object-fit image or centered/fitted image with dimensions
            // BUT: Don't override picture element layout mode or virtual image overlay mode - they have their own dimension handling
            if (layoutMode !== 'picture' && layoutMode !== 'overlay') {
                const hasExplicitDimensions = originalImage.width && originalImage.height;

                if (hasExplicitDimensions && isCenteredOrFitted) {
                    // Prioritize HTML attributes for explicitly sized centered/fitted images (LinkedIn case)
                    targetDimensions = {
                        width: originalImage.width || originalImage.naturalWidth || targetDimensions.width,
                        height: originalImage.height || originalImage.naturalHeight || targetDimensions.height
                    };
                } else {
                    // For object-fit images without explicit dimensions, use natural size (DeviantArt case)
                    targetDimensions = {
                        width: originalImage.naturalWidth || originalImage.width || targetDimensions.width,
                        height: originalImage.naturalHeight || originalImage.height || targetDimensions.height
                    };
                }

                layoutMode = 'aspectRatio';
                console.log('🎯 Object-fit or centered/fitted image detected - using aspectRatio mode with image dimensions:', {
                    hasObjectFit,
                    objectFit: computedStyle.objectFit,
                    isCenteredOrFitted,
                    hasExplicitDimensions,
                    naturalSize: originalImage.naturalWidth + 'x' + originalImage.naturalHeight,
                    attributeSize: originalImage.width + 'x' + originalImage.height,
                    targetDimensions,
                    priorityUsed: hasExplicitDimensions && isCenteredOrFitted ? 'HTML attributes' : 'Natural dimensions'
                });
            } else {
                console.log('🎯 Object-fit detected but preserving picture layout mode for proper dimension handling');
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
     * Calculate background image layout (size and position) for virtual images
     * Static method that can be called before lifViewer instantiation
     */
    static calculateBackgroundImageLayout(backgroundElement, virtualImage) {
        try {
            const computedStyle = window.getComputedStyle(backgroundElement);
            const backgroundPosition = computedStyle.backgroundPosition || 'center center';
            const backgroundSize = computedStyle.backgroundSize || 'auto';

            // Get element dimensions
            const elementRect = backgroundElement.getBoundingClientRect();
            const containerWidth = elementRect.width;
            const containerHeight = elementRect.height;
            const containerAspectRatio = containerWidth / containerHeight;

            // Try to get the original image's aspect ratio from the virtual image
            let imageAspectRatio = null;
            if (virtualImage && virtualImage.naturalWidth && virtualImage.naturalHeight) {
                imageAspectRatio = virtualImage.naturalWidth / virtualImage.naturalHeight;
            } else {
                // Fallback: assume a common image aspect ratio if we can't determine it
                imageAspectRatio = 4 / 3; // Default assumption
                console.log('🎨 Using fallback aspect ratio (4:3) for background layout calculation');
            }

            // Calculate how the background image would be displayed
            let displayWidth, displayHeight;

            // Handle background-size
            if (backgroundSize === 'cover' || backgroundSize === 'auto' || !backgroundSize) {
                // 'cover' or default behavior: image is scaled to cover the entire container
                if (imageAspectRatio > containerAspectRatio) {
                    // Image is wider than container - image height matches container, width extends beyond
                    displayHeight = containerHeight;
                    displayWidth = displayHeight * imageAspectRatio;
                } else {
                    // Image is taller than container - image width matches container, height extends beyond
                    displayWidth = containerWidth;
                    displayHeight = displayWidth / imageAspectRatio;
                }
            } else if (backgroundSize === 'contain') {
                // 'contain': entire image is visible, may have letterboxing
                if (imageAspectRatio > containerAspectRatio) {
                    displayWidth = containerWidth;
                    displayHeight = displayWidth / imageAspectRatio;
                } else {
                    displayHeight = containerHeight;
                    displayWidth = displayHeight * imageAspectRatio;
                }
            } else {
                // Explicit size values (px, %, etc.) - use container size for now
                displayWidth = containerWidth;
                displayHeight = containerHeight;
            }

            console.log('🎨 Background image layout calculation:', {
                backgroundSize,
                containerSize: `${containerWidth}x${containerHeight}`,
                imageAspectRatio,
                containerAspectRatio,
                displaySize: `${Math.round(displayWidth)}x${Math.round(displayHeight)}`
            });

            return {
                displaySize: {
                    width: Math.round(displayWidth),
                    height: Math.round(displayHeight)
                },
                containerSize: {
                    width: containerWidth,
                    height: containerHeight
                },
                imageAspectRatio,
                containerAspectRatio
            };
        } catch (error) {
            console.warn('Error calculating background image layout:', error);
            return null;
        }
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

            // Check if image uses aspect-fill (object-fit: cover) behavior
            const isAspectFill = image.classList.contains('ivm-view-attr__img--aspect-fill');

            let renderedWidth, renderedHeight;

            if (isAspectFill) {
                // For aspect-fill: use the image's HTML width/height attributes or natural dimensions
                // This matches how LinkedIn displays the image
                renderedWidth = image.width || naturalWidth;
                renderedHeight = image.height || naturalHeight;
                console.log('🎯 LinkedIn aspect-fill detected, using image dimensions:', renderedWidth + 'x' + renderedHeight);
            } else {
                // Calculate how LinkedIn's object-fit: contain would size the image
                if (naturalAspectRatio > containerAspectRatio) {
                    // Image is wider - fit to container width
                    renderedWidth = containerWidth;
                    renderedHeight = containerWidth / naturalAspectRatio;
                } else {
                    // Image is taller - fit to container height  
                    renderedHeight = containerHeight;
                    renderedWidth = containerHeight * naturalAspectRatio;
                }
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
            // If this.img exists (legacy), use it; otherwise, use a temp Image
            let img = this.img;
            if (!img) {
                img = new window.Image();
                img.src = this.lifUrl;
            }
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image failed to load'));
        });
    }

    async afterLoad() {
        // Enhanced afterLoad with layout-specific setup
        console.log(`LIF viewer loaded with layout mode: ${this.layoutMode}`);

        // Apply container styling if we have layout configuration
        if (this.layoutMode !== 'standard') {
            this.setupContainer();
        }

        // Do NOT hide the original image
        // if (this.originalImage) {
        //     this.originalImage.style.display = 'none';
        // }

        // Set up layout-specific event handling
        this.setupEventHandlers();

        // Sync canvas dimensions with actual LIF image dimensions
        await this.syncCanvasWithLIFResult();

        // Force correct dimensions one final time for layout-aware modes
        if (this.layoutConfig.preventResizing) {
            const dimensions = this.getEffectiveDimensions();
            this.canvas.width = dimensions.width;
            this.canvas.height = dimensions.height;
        }

        // Show canvas immediately for autoplay
        if (this.autoplay) {
            // Do NOT hide the original image
            this.canvas.style.display = 'block';
            this.canvas.style.opacity = '1';
        } else {
            // Canvas hidden until activated
            this.canvas.style.display = 'none';
            this.canvas.style.opacity = '0';
        }

        // CRITICAL FIX: Check if mouse is already over the image area when viewer is created
        // This prevents the "black frame" issue when mouse is hovering during conversion
        this.checkInitialMousePosition();

        // Windows Debug: Log comprehensive canvas state
        console.log(`🎬 Canvas ready - comprehensive debug info:`, {
            canvasDimensions: { width: this.canvas.width, height: this.canvas.height },
            canvasStyle: {
                display: this.canvas.style.display,
                position: this.canvas.style.position,
                top: this.canvas.style.top,
                left: this.canvas.style.left,
                width: this.canvas.style.width,
                height: this.canvas.style.height,
                zIndex: this.canvas.style.zIndex
            },
            containerInfo: {
                tagName: this.container.tagName,
                className: this.container.className,
                id: this.container.id
            },
            originalImageInfo: {
                src: this.originalImage.src,
                width: this.originalImage.width,
                height: this.originalImage.height,
                className: this.originalImage.className
            },
            layoutMode: this.layoutMode,
            inDOM: document.contains(this.canvas),
            containerInDOM: document.contains(this.container)
        });
    }

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
                let img = this.originalImage;
                if (img && img.complete && (img.naturalWidth > 0 || img.width > 0)) {
                    const lifWidth = img.naturalWidth || img.width;
                    const lifHeight = img.naturalHeight || img.height;
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
                        // Complex layouts: For images with inherited CSS classes, use the original image's rendered size
                        // This ensures canvas attributes match what the user actually sees
                        const originalImageRect = this.originalImage.getBoundingClientRect();
                        const useRenderedSize = originalImageRect.width > 0 && originalImageRect.height > 0;

                        if (useRenderedSize) {
                            // Use the original image's actual rendered size for both internal and display
                            this.canvas.width = Math.round(originalImageRect.width);
                            this.canvas.height = Math.round(originalImageRect.height);
                            // Remove explicit style dimensions to let CSS classes handle sizing
                            this.canvas.style.width = '';
                            this.canvas.style.height = '';
                            console.log(`✅ Complex layout sync - Using original image rendered size: ${this.canvas.width}x${this.canvas.height} (CSS classes will handle display sizing)`);
                        } else {
                            // Fallback to previous behavior if rendered size is not available
                            this.canvas.width = lifWidth;
                            this.canvas.height = lifHeight;
                            if (targetDimensions) {
                                this.canvas.style.width = `${targetDimensions.width}px`;
                                this.canvas.style.height = `${targetDimensions.height}px`;
                            } else {
                                this.canvas.style.width = `${lifWidth}px`;
                                this.canvas.style.height = `${lifHeight}px`;
                            }
                            console.log(`✅ Complex layout sync - Fallback: Internal: ${this.canvas.width}x${this.canvas.height}, Display: ${this.canvas.style.width}x${this.canvas.style.height}`);
                        }
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
        let lastEventTime = 0;
        let lastEventType = null;
        const EVENT_DEBOUNCE_MS = 200; // Prevent rapid events within 200ms

        const startAnimation = () => {
            const now = Date.now();
            if (now - lastEventTime < EVENT_DEBOUNCE_MS && lastEventType === 'start') {
                return;
            }
            lastEventTime = now;
            lastEventType = 'start';
            // Set this instance as active when user interacts with it
            this.setAsActive();

            if (animationTimeoutId) {
                clearTimeout(animationTimeoutId);
                animationTimeoutId = null;
            }
            // Enhanced logic for renderOff scenarios: always try to start if animation isn't running or renderOff is active
            if (!this.running || this.isRenderingOff) {
                this.startAnimation(); // Use the proper method for smooth transitions
            }
        };
        const stopAnimation = () => {
            // CRITICAL: Don't stop animation during renderOff transition
            if (this.isRenderingOff) {
                return;
            }

            const now = Date.now();
            if (now - lastEventTime < EVENT_DEBOUNCE_MS && lastEventType === 'stop') {
                return;
            }
            lastEventTime = now;
            lastEventType = 'stop';

            if (this.running) {
                animationTimeoutId = setTimeout(() => {
                    // Double-check renderOff state before stopping
                    if (!this.isRenderingOff && this.running) {
                        this.stopAnimation(); // Use the proper method for smooth renderOff transition
                    }
                    animationTimeoutId = null;
                }, 100);
            }
        };
        this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
        this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });
        this.originalImage.addEventListener('mouseenter', startAnimation, { passive: true });
        this.originalImage.addEventListener('mouseleave', stopAnimation, { passive: true });

        // Detect and handle overlay elements that might interfere with mouse events
        this.setupOverlayEventPropagation(startAnimation, stopAnimation);

        // Canvas always receives events
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.style.display = 'none'; // Start hidden, will show on animation start
        console.log('✅ Unified event handlers configured (display mode with smooth transitions)');
    }

    setupOverlayEventHandlers() {
        let animationTimeoutId = null;
        const startAnimation = () => {
            // Set this instance as active when user interacts with it
            this.setAsActive();

            if (animationTimeoutId) {
                clearTimeout(animationTimeoutId);
                animationTimeoutId = null;
            }
            // Enhanced logic for renderOff scenarios: always try to start if animation isn't running or renderOff is active
            if (!this.running || this.isRenderingOff) {
                this.startAnimation(); // Use the proper method for smooth transitions
            }
        };
        const stopAnimation = () => {
            // Don't stop animation during renderOff transition
            if (this.isRenderingOff) {
                return;
            }

            if (this.running) {
                animationTimeoutId = setTimeout(() => {
                    // Double-check renderOff state before stopping
                    if (!this.isRenderingOff && this.running) {
                        this.stopAnimation(); // Use the proper method for smooth renderOff transition
                    }
                    animationTimeoutId = null;
                }, 100);
            }
        };
        this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
        this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });
        this.originalImage.addEventListener('mouseenter', startAnimation, { passive: true });
        this.originalImage.addEventListener('mouseleave', stopAnimation, { passive: true });

        // Detect and handle overlay elements that might interfere with mouse events
        this.setupOverlayEventPropagation(startAnimation, stopAnimation);

        // GENERIC: Add container-level fallback for carousel/interactive element interference
        // Only enable for actual carousels, not theater/lightbox modes
        const hasCarouselInterference = this.originalImage.closest('[class*="carousel"]') ||
            this.originalImage.closest('[class*="slider"]') ||
            this.originalImage.closest('[class*="swiper"]');

        // VIRTUAL BACKGROUND IMAGES: Add direct mouseenter/mouseleave to background element for maximum reliability
        if (this.originalImage._isVirtualBackgroundImage && this.originalImage._originalBackgroundElement) {
            const backgroundElement = this.originalImage._originalBackgroundElement;


            backgroundElement.addEventListener('mouseenter', () => {
                console.log('🎭 Direct background element mouseenter - starting animation');
                startAnimation();
            }, { passive: true });

            backgroundElement.addEventListener('mouseleave', () => {
                console.log('🎭 Direct background element mouseleave - stopping animation');
                stopAnimation();
            }, { passive: true });
        }

        if (this.container && hasCarouselInterference) {
            let containerMouseState = false;
            const containerMouseMove = (e) => {
                // Skip carousel interference during renderOff to prevent conflicts
                if (this.isRenderingOff) {
                    return;
                }

                const nowOverImage = this.isMouseOverImageArea(e);

                if (nowOverImage) {
                    if (!containerMouseState || !this.running) {
                        containerMouseState = true;
                        startAnimation();
                    }
                } else if (!nowOverImage && containerMouseState) {
                    containerMouseState = false;
                    stopAnimation();
                }

                // CRITICAL: Forward mouse coordinates to lifViewer for 3D effect
                if (nowOverImage && this.canvas && this.mousePos) {
                    this.updateMousePosition(e);
                }
            };

            this.container.addEventListener('mousemove', containerMouseMove, { passive: true });
            this.container.addEventListener('mouseleave', () => {
                // Skip carousel interference during renderOff to prevent conflicts
                if (this.isRenderingOff) {
                    return;
                }
                containerMouseState = false;
                stopAnimation();
            }, { passive: true });

            // Additional mouseenter handler on container for more reliable detection during renderOff
            this.container.addEventListener('mouseenter', () => {
                // Reset state and check immediately if mouse is over image area
                const syntheticEvent = { clientX: 0, clientY: 0 }; // Will be overridden by actual mousemove
                console.log('🎠 Container mouse enter - will check on next mousemove');
            }, { passive: true });
        }

        // Canvas always receives events
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.style.display = 'none'; // Start hidden, will show on animation start
        console.log('✅ Overlay event handlers configured (display mode with smooth transitions)');
    }

    setupStandardEventHandlers() {
        // Basic event handling for standard layouts
        // Only add if not already present to avoid conflicts
        if (!this.canvas.hasAttribute('data-lif-events-added')) {
            let animationTimeoutId = null;

            const startAnimation = () => {
                // Set this instance as active when user interacts with it
                this.setAsActive();

                if (animationTimeoutId) {
                    clearTimeout(animationTimeoutId);
                    animationTimeoutId = null;
                }

                // Enhanced logic for renderOff scenarios: always try to start if animation isn't running or renderOff is active
                if (!this.running || this.isRenderingOff) {
                    this.startAnimation();
                }
            };

            const stopAnimation = () => {
                // Don't stop animation during renderOff transition
                if (this.isRenderingOff) {
                    return;
                }

                // Use lifViewer's internal state instead of local state
                if (this.running) {
                    // Small delay to prevent rapid toggling
                    animationTimeoutId = setTimeout(() => {
                        // Double-check state before stopping
                        if (!this.isRenderingOff && this.running) {
                            this.stopAnimation();
                        }
                        animationTimeoutId = null;
                    }, 100);
                }
            };

            // COMMENTED OUT: Flickr-specific z-index and overlay fixes
            // TODO: Generalize overlay interference detection
            // if (window.location.hostname.includes('flickr.com')) {
            //     console.log('🔧 Applying Flickr z-index boost for canvas events');
            //     this.canvas.style.zIndex = '999999';
            //     this.originalImage.style.zIndex = '999998';
            //     const flickrOverlays = this.container.parentElement?.querySelectorAll('.overlay, a.overlay, .interaction-view, .photo-list-photo-interaction');
            //     if (flickrOverlays) {
            //         flickrOverlays.forEach(overlay => {
            //             console.log('🔧 Disabling pointer events on Flickr overlay:', overlay.className);
            //             overlay.style.pointerEvents = 'none';
            //         });
            //     }
            // }

            // GENERALIZED: Apply high z-index to ensure canvas events work
            this.canvas.style.zIndex = this.canvasZIndex || '999999';
            this.originalImage.style.zIndex = this.imageZIndex || '999998';

            this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
            this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });

            // Also add events to static image for comprehensive coverage
            this.originalImage.addEventListener('mouseenter', startAnimation, { passive: true });
            this.originalImage.addEventListener('mouseleave', stopAnimation, { passive: true });

            // Detect and handle overlay elements that might interfere with mouse events
            this.setupOverlayEventPropagation(startAnimation, stopAnimation);

            this.canvas.setAttribute('data-lif-events-added', 'true');
            console.log('Standard event handlers configured');
        }
    }

    /**
     * Setup event propagation for overlay elements that might cover the image
     * This handles cases where clickable overlays (like <a> tags) prevent mouse events from reaching the image
     */
    setupOverlayEventPropagation(startAnimation, stopAnimation) {
        if (!this.originalImage || !this.container) return;

        console.log('🔄 Setting up Universal Event Propagation System...');

        // Universal system: Find ALL potential interfering elements
        const interferingElements = this.findAllInterferingElements();

        if (interferingElements.length > 0) {
            console.log(`📡 Found ${interferingElements.length} potentially interfering elements, setting up event propagation`);

            interferingElements.forEach((element, index) => {
                this.setupElementEventPropagation(element, startAnimation, stopAnimation, index);
            });
        }

        // Additional systematic approach: Setup global document-level event listener
        // to catch events that might be captured before reaching our elements
        this.setupGlobalEventFallback(startAnimation, stopAnimation);
    }

    /**
     * Systematic approach: Find ALL elements that could potentially interfere with canvas mouse events
     */
    findAllInterferingElements() {
        const interferingElements = new Set(); // Use Set to avoid duplicates

        if (!this.originalImage) return Array.from(interferingElements);

        try {
            const imageRect = this.originalImage.getBoundingClientRect();

            console.log('🔍 Scanning for interfering elements...');

            // Method 1: Use document.elementsFromPoint at multiple points across the image
            this.scanElementsAtImagePoints(imageRect, interferingElements);

            // Method 2: Search DOM tree for potential overlays
            this.searchDOMForOverlays(interferingElements);

            // Method 3: Specific theater mode detection (Flickr, lightboxes, etc.)
            this.detectTheaterModeElements(interferingElements);

            // Method 4: Search for tall navigation elements that might cover image areas
            this.detectTallNavigationElements(interferingElements);

            console.log(`📊 Found ${interferingElements.size} total interfering elements`);

        } catch (error) {
            console.warn('⚠️ Error in findAllInterferingElements:', error);
        }

        return Array.from(interferingElements);
    }

    /**
     * Scan for elements at multiple points across the image area
     */
    scanElementsAtImagePoints(imageRect, interferingElements) {
        if (!imageRect || imageRect.width === 0 || imageRect.height === 0) return;

        // Test points: corners, center, and edge midpoints
        const testPoints = [
            { x: imageRect.left + imageRect.width * 0.5, y: imageRect.top + imageRect.height * 0.5 }, // center
            { x: imageRect.left + imageRect.width * 0.25, y: imageRect.top + imageRect.height * 0.25 }, // top-left quad
            { x: imageRect.left + imageRect.width * 0.75, y: imageRect.top + imageRect.height * 0.25 }, // top-right quad
            { x: imageRect.left + imageRect.width * 0.25, y: imageRect.top + imageRect.height * 0.75 }, // bottom-left quad
            { x: imageRect.left + imageRect.width * 0.75, y: imageRect.top + imageRect.height * 0.75 }, // bottom-right quad
        ];

        testPoints.forEach((point, index) => {
            try {
                const elementsAtPoint = document.elementsFromPoint(point.x, point.y);
                let foundImageInStack = false;

                for (const element of elementsAtPoint) {
                    // Stop scanning when we reach our image (elements below won't interfere)
                    if (element === this.originalImage || element === this.canvas) {
                        foundImageInStack = true;
                        break;
                    }

                    // Check if this element could interfere with mouse events
                    if (this.isElementPotentiallyInterfering(element)) {
                        interferingElements.add(element);
                        console.log(`📍 Point ${index + 1}: Found interfering element:`, element.tagName, element.className || '[no class]');
                    }
                }

                if (!foundImageInStack) {
                    console.warn(`📍 Point ${index + 1}: Image not found in element stack at (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
                }
            } catch (error) {
                console.warn(`📍 Point ${index + 1}: Error scanning elements:`, error);
            }
        });
    }

    /**
     * Search DOM tree for potential overlay elements
     */
    searchDOMForOverlays(interferingElements) {
        // Search parent hierarchy
        let currentElement = this.originalImage.parentElement;
        let searchDepth = 0;
        const maxSearchDepth = 6;

        while (currentElement && searchDepth < maxSearchDepth) {
            if (this.isElementPotentiallyInterfering(currentElement)) {
                const coversImage = this.doesElementCoverImage(currentElement);
                const isAnchor = currentElement.tagName === 'A';

                if (coversImage || (isAnchor && this.isAnchorLikelyInterferingWithMouse(currentElement))) {
                    interferingElements.add(currentElement);
                    console.log(`🏗️ Parent hierarchy: Found interfering element:`, currentElement.tagName, currentElement.className || '[no class]');
                }
            }
            currentElement = currentElement.parentElement;
            searchDepth++;
        }

        // Search sibling elements
        if (this.container && this.container.parentElement) {
            const siblings = Array.from(this.container.parentElement.children);
            siblings.forEach(sibling => {
                if (sibling !== this.container && this.isElementPotentiallyInterfering(sibling)) {
                    const coversImage = this.doesElementCoverImage(sibling);
                    const isAnchor = sibling.tagName === 'A';

                    if (coversImage || (isAnchor && this.isAnchorLikelyInterferingWithMouse(sibling))) {
                        interferingElements.add(sibling);
                        console.log(`👥 Siblings: Found interfering element:`, sibling.tagName, sibling.className || '[no class]');
                    }
                }
            });
        }
    }

    /**
     * Check if an element could potentially interfere with mouse events
     */
    isElementPotentiallyInterfering(element) {
        if (!element || element === this.originalImage || element === this.canvas || element === this.container) {
            return false;
        }

        // Check for clickable elements
        const isClickable = element.tagName === 'A' ||
            element.tagName === 'BUTTON' ||
            element.hasAttribute('onclick') ||
            element.hasAttribute('href') ||
            element.style.cursor === 'pointer' ||
            element.hasAttribute('data-track') ||
            element.hasAttribute('tabindex') ||
            element.getAttribute('role') === 'button';

        // Check for overlay-like elements
        const isOverlayLike = element.classList.contains('overlay') ||
            element.classList.contains('navigation') ||
            element.classList.contains('nav') ||
            element.classList.contains('navigate') ||
            element.classList.contains('link') ||
            element.classList.contains('button') ||
            element.classList.contains('photo-notes') ||
            element.classList.contains('zoom') ||
            element.hasAttribute('data-link-type');

        // Check for theater mode navigation patterns
        const isTheaterNav = this.isTheaterModeNavigationElement(element);

        return isClickable || isOverlayLike || isTheaterNav;
    }

    /**
     * Setup event propagation for a specific element
     */
    setupElementEventPropagation(element, startAnimation, stopAnimation, index) {
        if (!element || element._lifEventPropagationSetup) return; // Prevent duplicate setup

        console.log(`🎯 Setting up event propagation for element ${index + 1}:`, element.tagName, element.className || '[no class]');

        // Track mouse state for this specific element
        let isMouseOverImageViaThisElement = false;

        const propagateMouseEnter = (e) => {
            if (this.isMouseOverImageArea(e)) {
                isMouseOverImageViaThisElement = true;
                startAnimation();
                console.log(`🎯 Element ${index + 1}: Propagated mouse enter`);
            }
        };

        const propagateMouseLeave = (e) => {
            if (isMouseOverImageViaThisElement) {
                isMouseOverImageViaThisElement = false;
                stopAnimation();
                console.log(`🎯 Element ${index + 1}: Propagated mouse leave`);
            }
        };

        const propagateMouseMove = (e) => {
            const nowOverImage = this.isMouseOverImageArea(e);

            if (nowOverImage && !isMouseOverImageViaThisElement) {
                isMouseOverImageViaThisElement = true;
                startAnimation();
                console.log(`🎯 Element ${index + 1}: Propagated mouse enter via move`);
            } else if (!nowOverImage && isMouseOverImageViaThisElement) {
                isMouseOverImageViaThisElement = false;
                stopAnimation();
                console.log(`🎯 Element ${index + 1}: Propagated mouse leave via move`);
            }

            // Always forward mouse coordinates for 3D effect when over image
            if (nowOverImage && this.canvas && this.mousePos) {
                this.updateMousePosition(e);
            }
        };

        // Add event listeners
        element.addEventListener('mouseenter', propagateMouseEnter, { passive: true });
        element.addEventListener('mouseleave', propagateMouseLeave, { passive: true });
        element.addEventListener('mousemove', propagateMouseMove, { passive: true });

        // Mark element as setup and store handlers for cleanup
        element._lifEventPropagationSetup = true;
        if (!element._lifEventHandlers) {
            element._lifEventHandlers = [];
        }
        element._lifEventHandlers.push(
            { type: 'mouseenter', handler: propagateMouseEnter },
            { type: 'mouseleave', handler: propagateMouseLeave },
            { type: 'mousemove', handler: propagateMouseMove }
        );
    }

    /**
     * Setup global document-level event fallback for edge cases
     */
    setupGlobalEventFallback(startAnimation, stopAnimation) {
        if (this._globalEventFallbackSetup) return; // Prevent duplicate setup

        let globalMouseOverImage = false;

        const globalMouseMoveHandler = (e) => {
            if (!this.originalImage) return;

            // Skip global fallback during renderOff to prevent conflicts
            if (this.isRenderingOff) {
                return;
            }

            const nowOverImage = this.isMouseOverImageArea(e);

            if (nowOverImage && !globalMouseOverImage) {
                globalMouseOverImage = true;
                startAnimation();
            } else if (!nowOverImage && globalMouseOverImage) {
                globalMouseOverImage = false;
                stopAnimation();
            }

            // Update mouse position for 3D effect
            if (nowOverImage && this.canvas && this.mousePos) {
                this.updateMousePosition(e);
            }
        };

        // Use throttled global mouse move listener to avoid performance issues
        let globalMoveThrottleId = null;
        const throttledGlobalMove = (e) => {
            if (globalMoveThrottleId) return;
            globalMoveThrottleId = requestAnimationFrame(() => {
                globalMouseMoveHandler(e);
                globalMoveThrottleId = null;
            });
        };

        document.addEventListener('mousemove', throttledGlobalMove, { passive: true });

        this._globalEventFallbackSetup = true;
        this._globalEventHandlers = [{ type: 'mousemove', handler: throttledGlobalMove }];
    }

    /**
 * Find overlay elements that might be covering the image
 */
    findOverlayElements() {
        const overlays = [];

        // Method 1: Check parent elements (current approach)
        let currentElement = this.originalImage.parentElement;
        let searchDepth = 0;
        const maxSearchDepth = 5; // Limit search to avoid performance issues

        while (currentElement && searchDepth < maxSearchDepth) {
            // Look for clickable overlays (links, buttons, etc.)
            if (currentElement.tagName === 'A' ||
                currentElement.tagName === 'BUTTON' ||
                currentElement.classList.contains('overlay') ||
                currentElement.classList.contains('link') ||
                currentElement.hasAttribute('data-link-type') ||
                currentElement.style.cursor === 'pointer' ||
                currentElement.hasAttribute('href') ||
                // GENERIC: Carousel and interactive element patterns
                (currentElement.className && (
                    currentElement.className.includes('carousel') ||
                    currentElement.className.includes('slider') ||
                    currentElement.className.includes('list-item') ||
                    currentElement.className.includes('feed') ||
                    // Generic clickable patterns (short class names often indicate interactive elements)
                    (currentElement.className.split(' ').some(cls =>
                        cls.length <= 10 && /^[a-z0-9_-]+$/i.test(cls) &&
                        (cls.includes('x') || cls.includes('_') || cls.includes('-'))
                    ))
                ))) {

                // For anchor links, be more permissive since they often capture events
                // even without significant visual overlap
                const isAnchorLink = currentElement.tagName === 'A';
                const coversImage = this.doesElementCoverImage(currentElement);

                if (coversImage || (isAnchorLink && this.isAnchorLikelyInterferingWithMouse(currentElement))) {
                    overlays.push(currentElement);
                    console.log('🔗 Found overlay element:', currentElement.tagName, currentElement.className || '[no class]',
                        isAnchorLink ? '(anchor - permissive detection)' : '(covers image)');
                }
            }

            currentElement = currentElement.parentElement;
            searchDepth++;
        }

        // Method 2: Check for elements at the same level that might be positioned over the image
        if (this.container) {
            const containerChildren = Array.from(this.container.parentElement?.children || []);
            containerChildren.forEach(child => {
                if (child !== this.container &&
                    (child.tagName === 'A' || child.classList.contains('overlay') || child.hasAttribute('data-link-type'))) {

                    const isAnchorLink = child.tagName === 'A';
                    const coversImage = this.doesElementCoverImage(child);

                    if (coversImage || (isAnchorLink && this.isAnchorLikelyInterferingWithMouse(child))) {
                        if (!overlays.includes(child)) {
                            overlays.push(child);
                            console.log('🔗 Found sibling overlay element:', child.tagName, child.className || '[no class]',
                                isAnchorLink ? '(anchor - permissive detection)' : '(covers image)');
                        }
                    }
                }
            });

            // Also check one level up for anchor elements (common in card layouts)
            const grandParentChildren = Array.from(this.container.parentElement?.parentElement?.children || []);
            grandParentChildren.forEach(child => {
                if (child.tagName === 'A' && this.isAnchorLikelyInterferingWithMouse(child)) {
                    if (!overlays.includes(child)) {
                        overlays.push(child);
                        console.log('🔗 Found parent-level anchor overlay:', child.className || '[no class]');
                    }
                }
            });
        }

        // Method 2.5: Enhanced theater mode detection for navigation elements
        // Specifically targets photo viewer/theater mode layouts like Flickr, Lightbox, etc.
        this.detectTheaterModeNavigation(overlays);

        // Method 3: Use document.elementsFromPoint as fallback
        if (overlays.length === 0 && this.originalImage) {
            try {
                const imageRect = this.originalImage.getBoundingClientRect();
                const centerX = imageRect.left + imageRect.width / 2;
                const centerY = imageRect.top + imageRect.height / 2;

                const elementsAtCenter = document.elementsFromPoint(centerX, centerY);

                // Find clickable elements that are above the image in the stack
                for (const element of elementsAtCenter) {
                    if (element === this.originalImage) break; // Stop when we reach the image itself

                    if ((element.tagName === 'A' ||
                        element.tagName === 'BUTTON' ||
                        element.hasAttribute('data-link-type') ||
                        element.style.cursor === 'pointer') &&
                        !overlays.includes(element)) {
                        overlays.push(element);
                    }
                }
            } catch (error) {
                console.warn('Error using elementsFromPoint:', error);
            }
        }

        return overlays;
    }

    /**
     * Detect theater mode elements specifically for the universal interference system
     */
    detectTheaterModeElements(interferingElements) {
        if (!this.container || !this.originalImage) return;

        // Theater mode navigation patterns to detect
        const theaterNavSelectors = [
            // Flickr-specific navigation
            '.navigate-target.navigate-prev',
            '.navigate-target.navigate-next',
            'a.navigate-prev',
            'a.navigate-next',

            // Generic photo navigation patterns
            '.photo-nav-prev',
            '.photo-nav-next',
            '.prev-photo',
            '.next-photo',
            '.lightbox-prev',
            '.lightbox-next',
            '.gallery-prev',
            '.gallery-next',
            '.viewer-prev',
            '.viewer-next',

            // Photo notes and overlays
            '.photo-notes',
            '.photo-notes-scrappy-view',
            '.vr-overlay-view',
            '.zoom-view',

            // Theater mode specific overlays
            '.theater-overlay',
            '.photo-overlay',
            '.image-overlay'
        ];

        // Search from document level for theater mode elements
        theaterNavSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    // Check if this element might interfere with our image
                    if (this.isElementNearImage(element)) {
                        interferingElements.add(element);
                        console.log(`🎭 Theater mode: Found interfering element:`, element.tagName, element.className || '[no class]');
                    }
                });
            } catch (error) {
                console.warn(`⚠️ Error searching for selector ${selector}:`, error);
            }
        });

        // Search within image container's parent for navigation elements
        if (this.container && this.container.parentElement) {
            const containerParent = this.container.parentElement;
            const navElements = containerParent.querySelectorAll('a[class*="navigate"], a[class*="nav"], [class*="photo-notes"]');

            navElements.forEach(element => {
                if (this.isTheaterModeNavigationElement(element)) {
                    interferingElements.add(element);
                    console.log(`🎭 Container navigation: Found interfering element:`, element.tagName, element.className || '[no class]');
                }
            });
        }
    }

    /**
     * Enhanced method to detect tall navigation elements for the universal interference system
     */
    detectTallNavigationElements(interferingElements) {
        if (!this.originalImage) return;

        try {
            const imageRect = this.originalImage.getBoundingClientRect();

            // Search for tall elements that might be navigation
            const potentialNavElements = document.querySelectorAll('a, button, [role="button"]');

            potentialNavElements.forEach(element => {
                try {
                    const elementRect = element.getBoundingClientRect();

                    // Validate the bounding rect
                    if (!elementRect || typeof elementRect.width === 'undefined') {
                        console.warn('⚠️ Invalid getBoundingClientRect for element in detectTallNavigationElements');
                        return;
                    }

                    // Check if it's a tall element that might cover part of the image
                    const isTall = elementRect.height > Math.min(200, imageRect.height * 0.5);
                    const isWide = elementRect.width > Math.min(100, imageRect.width * 0.3);

                    if (isTall || isWide) {
                        // Check if it overlaps or is adjacent to the image
                        const overlapsOrAdjacent = this.isElementAdjacentToImage(elementRect, imageRect) ||
                            this.doesElementOverlapImage(elementRect, imageRect);

                        if (overlapsOrAdjacent) {
                            interferingElements.add(element);
                            console.log(`📏 Tall/Wide navigation: Found interfering element:`, element.tagName, element.className || '[no class]',
                                `${(elementRect.width || 0).toFixed(0)}x${(elementRect.height || 0).toFixed(0)}`);
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Error checking element dimensions:`, error);
                }
            });
        } catch (error) {
            console.warn(`⚠️ Error in detectTallNavigationElements:`, error);
        }
    }

    /**
     * Check if an element overlaps with the image
     */
    doesElementOverlapImage(elementRect, imageRect) {
        // Validate rectangles
        if (!elementRect || !imageRect ||
            typeof elementRect.left === 'undefined' || typeof elementRect.right === 'undefined' ||
            typeof imageRect.left === 'undefined' || typeof imageRect.right === 'undefined') {
            console.warn('⚠️ Invalid rectangles in doesElementOverlapImage');
            return false;
        }

        try {
            return !(elementRect.right < imageRect.left ||
                elementRect.left > imageRect.right ||
                elementRect.bottom < imageRect.top ||
                elementRect.top > imageRect.bottom);
        } catch (error) {
            console.warn('⚠️ Error in doesElementOverlapImage:', error);
            return false;
        }
    }

    /**
     * Check if an element is near the image (for theater mode detection)
     */
    isElementNearImage(element, threshold = 50) {
        if (!element || !this.originalImage) return false;

        try {
            const elementRect = element.getBoundingClientRect();
            const imageRect = this.originalImage.getBoundingClientRect();

            // Validate that getBoundingClientRect returned valid rectangles
            if (!elementRect || !imageRect ||
                typeof elementRect.left === 'undefined' ||
                typeof imageRect.left === 'undefined') {
                console.warn('⚠️ Invalid bounding rectangles for element near image check');
                return false;
            }

            // Check if element is within threshold distance of image
            const horizontalDistance = Math.max(0,
                Math.max(elementRect.left - imageRect.right, imageRect.left - elementRect.right));
            const verticalDistance = Math.max(0,
                Math.max(elementRect.top - imageRect.bottom, imageRect.top - elementRect.bottom));

            return horizontalDistance <= threshold && verticalDistance <= threshold;
        } catch (error) {
            console.warn('⚠️ Error in isElementNearImage:', error);
            return false;
        }
    }

    /**
     * Detect theater mode navigation elements that might interfere with canvas interaction
     * This specifically handles photo viewer layouts like Flickr, Lightbox, modal galleries, etc.
     */
    detectTheaterModeNavigation(overlays) {
        if (!this.container || !this.originalImage) return;

        // Theater mode navigation patterns to detect
        const theaterNavSelectors = [
            // Flickr-specific navigation
            '.navigate-target.navigate-prev',
            '.navigate-target.navigate-next',
            'a.navigate-prev',
            'a.navigate-next',

            // Generic photo navigation patterns
            '.photo-nav-prev',
            '.photo-nav-next',
            '.prev-photo',
            '.next-photo',
            '.lightbox-prev',
            '.lightbox-next',
            '.gallery-prev',
            '.gallery-next',
            '.viewer-prev',
            '.viewer-next',

            // Generic navigation by aria labels
            '[aria-label*="prev" i][aria-label*="photo" i]',
            '[aria-label*="next" i][aria-label*="photo" i]',
            '[aria-label*="prev" i][aria-label*="image" i]',
            '[aria-label*="next" i][aria-label*="image" i]',

            // Common navigation button patterns
            'button[class*="prev"]',
            'button[class*="next"]',
            'a[class*="prev"]',
            'a[class*="next"]'
        ];

        // Search in multiple scopes to catch different layout structures
        const searchScopes = [
            this.container,
            this.container.parentElement,
            this.container.parentElement?.parentElement,
            // Also search the document for positioned overlays
            document
        ].filter(Boolean);

        searchScopes.forEach((scope, scopeIndex) => {
            theaterNavSelectors.forEach(selector => {
                try {
                    const elements = scope.querySelectorAll(selector);
                    elements.forEach(element => {
                        // Skip if already found
                        if (overlays.includes(element)) return;

                        // Additional validation for theater mode elements
                        if (this.isTheaterModeNavigationElement(element)) {
                            overlays.push(element);
                            console.log('🎭 Found theater mode navigation:', {
                                selector,
                                className: element.className,
                                tagName: element.tagName,
                                scope: scopeIndex === 0 ? 'container' :
                                    scopeIndex === 1 ? 'parent' :
                                        scopeIndex === 2 ? 'grandparent' : 'document',
                                dimensions: this.getElementDimensions(element)
                            });
                        }
                    });
                } catch (error) {
                    // Skip invalid selectors
                    console.warn('Invalid theater nav selector:', selector, error);
                }
            });
        });

        // Special case: Height-based detection for tall navigation elements
        // This catches Flickr-style navigation that spans the full height
        this.detectTallNavigationElements(overlays);
    }

    /**
     * Validate that an element is actually a theater mode navigation element
     */
    isTheaterModeNavigationElement(element) {
        if (!element || !this.originalImage) return false;

        try {
            // Must be a clickable element (anchor or button)
            if (element.tagName !== 'A' && element.tagName !== 'BUTTON') return false;

            // Must have href or be a button with navigation indicators
            const hasNavigation = element.hasAttribute('href') ||
                element.tagName === 'BUTTON' ||
                element.hasAttribute('data-track') ||
                element.hasAttribute('data-action');

            if (!hasNavigation) return false;

            // Check positioning relative to image
            const elementRect = element.getBoundingClientRect();
            const imageRect = this.originalImage.getBoundingClientRect();

            // Validate that both rectangles are valid
            if (!elementRect || !imageRect ||
                typeof elementRect.width === 'undefined' || typeof imageRect.width === 'undefined') {
                console.warn('⚠️ Invalid getBoundingClientRect in isTheaterModeNavigationElement');
                return false;
            }

            // Element should be reasonably sized (not tiny icons)
            const hasReasonableSize = elementRect.width >= 20 && elementRect.height >= 20;

            // Element should be positioned near or overlapping the image area
            const isNearImage = this.isElementNearImageWithRects(element, elementRect, imageRect);

            // Check for navigation-specific class patterns
            const hasNavClasses = element.className && (
                element.className.includes('nav') ||
                element.className.includes('prev') ||
                element.className.includes('next') ||
                element.className.includes('navigate')
            );

            // Check for navigation-specific content
            const hasNavContent = element.textContent && (
                element.textContent.includes('←') ||
                element.textContent.includes('→') ||
                element.textContent.includes('‹') ||
                element.textContent.includes('›') ||
                /prev|next/i.test(element.textContent)
            );

            return hasReasonableSize && isNearImage && (hasNavClasses || hasNavContent);

        } catch (error) {
            console.warn('Error validating theater navigation element:', error);
            return false;
        }
    }

    /**
     * Check if element is positioned near the image (within reasonable proximity)
     */
    isElementNearImageWithRects(element, elementRect, imageRect) {
        // Validate inputs
        if (!element || !elementRect || !imageRect) {
            console.warn('⚠️ Invalid parameters for isElementNearImageWithRects');
            return false;
        }

        // Validate that rectangles have required properties
        if (typeof elementRect.left === 'undefined' || typeof elementRect.right === 'undefined' ||
            typeof elementRect.top === 'undefined' || typeof elementRect.bottom === 'undefined' ||
            typeof imageRect.left === 'undefined' || typeof imageRect.right === 'undefined' ||
            typeof imageRect.top === 'undefined' || typeof imageRect.bottom === 'undefined') {
            console.warn('⚠️ Invalid rectangle properties for isElementNearImageWithRects');
            return false;
        }

        // Define "near" as within the image bounds or reasonable proximity
        const proximityThreshold = 100; // pixels

        try {
            // Check if element overlaps image area
            const hasOverlap = !(elementRect.right < imageRect.left ||
                elementRect.left > imageRect.right ||
                elementRect.bottom < imageRect.top ||
                elementRect.top > imageRect.bottom);

            if (hasOverlap) return true;

            // Check if element is within proximity threshold
            const minDistance = Math.min(
                Math.abs(elementRect.right - imageRect.left),    // Element to left of image
                Math.abs(elementRect.left - imageRect.right),    // Element to right of image
                Math.abs(elementRect.bottom - imageRect.top),    // Element above image
                Math.abs(elementRect.top - imageRect.bottom)     // Element below image
            );

            return minDistance <= proximityThreshold;
        } catch (error) {
            console.warn('⚠️ Error in isElementNearImageWithRects:', error);
            return false;
        }
    }

    /**
     * Detect tall navigation elements that span significant height (like Flickr navigation)
     */
    detectTallNavigationElements(overlays) {
        if (!this.container || !this.originalImage) return;

        try {
            const imageRect = this.originalImage.getBoundingClientRect();

            // Validate imageRect (Windows Chrome fix)
            if (!imageRect || typeof imageRect.width === 'undefined') {
                console.warn('⚠️ Invalid image rect in detectTallNavigationElements');
                return;
            }

            const containerRect = this.container.getBoundingClientRect();

            // Validate containerRect (Windows Chrome fix)
            if (!containerRect || typeof containerRect.width === 'undefined') {
                console.warn('⚠️ Invalid container rect in detectTallNavigationElements');
                return;
            }

            // Look for anchor elements in the container's parent that are unusually tall
            const parentElement = this.container.parentElement;
            if (!parentElement) return;

            const anchorElements = parentElement.querySelectorAll('a');

            anchorElements.forEach(anchor => {
                // Skip if already found (handle both Set and Array)
                if (overlays.has ? overlays.has(anchor) : overlays.includes(anchor)) return;

                const anchorRect = anchor.getBoundingClientRect();

                // Validate the anchor rectangle
                if (!anchorRect || typeof anchorRect.width === 'undefined') {
                    console.warn('⚠️ Invalid getBoundingClientRect for anchor in detectTallNavigationElements');
                    return;
                }

                // Detect "tall navigation" pattern:
                // 1. Height is significantly larger than width (suggesting vertical navigation bar)
                // 2. Height covers significant portion of container/image height
                // 3. Element is positioned adjacent to or overlapping the image

                const isTall = anchorRect.height >= Math.max(200, imageRect.height * 0.5);
                const isNarrowOrWide = anchorRect.width <= 150 || anchorRect.width >= imageRect.width * 0.8;
                const coversImageHeight = anchorRect.height >= imageRect.height * 0.7;

                // Check positioning: should be to the left or right of image, or overlapping
                const isLeftSide = anchorRect.right <= imageRect.left + 50;
                const isRightSide = anchorRect.left >= imageRect.right - 50;
                const overlapsHorizontally = !(anchorRect.right < imageRect.left || anchorRect.left > imageRect.right);

                const isPositionedForNavigation = isLeftSide || isRightSide || overlapsHorizontally;

                if (isTall && isNarrowOrWide && coversImageHeight && isPositionedForNavigation) {
                    // Add to collection (handle both Set and Array)
                    if (overlays.add) {
                        overlays.add(anchor);
                    } else {
                        overlays.push(anchor);
                    }
                    console.log('🎭 Found tall navigation element:', {
                        className: anchor.className,
                        dimensions: this.getElementDimensions(anchor),
                        position: isLeftSide ? 'left' : isRightSide ? 'right' : 'overlapping',
                        href: anchor.href?.substring(0, 50) + '...'
                    });
                }
            });

        } catch (error) {
            console.warn('Error detecting tall navigation elements:', error);
        }
    }

    /**
     * Helper method to get element dimensions for debugging
     */
    getElementDimensions(element) {
        try {
            if (!element) {
                return { width: 0, height: 0, top: 0, left: 0 };
            }

            const rect = element.getBoundingClientRect();

            // Validate that getBoundingClientRect returned a valid object
            if (!rect || typeof rect.width === 'undefined') {
                console.warn('⚠️ Invalid getBoundingClientRect result for element:', element);
                return { width: 0, height: 0, top: 0, left: 0 };
            }

            return {
                width: Math.round(rect.width || 0),
                height: Math.round(rect.height || 0),
                top: Math.round(rect.top || 0),
                left: Math.round(rect.left || 0)
            };
        } catch (error) {
            console.warn('⚠️ Error getting element dimensions:', error);
            return { width: 0, height: 0, top: 0, left: 0 };
        }
    }

    /**
     * Check if an anchor link is likely interfering with mouse events
     * Even if it doesn't physically cover the image significantly
     */
    isAnchorLikelyInterferingWithMouse(anchorElement) {
        if (!anchorElement || anchorElement.tagName !== 'A') return false;

        try {
            const anchorRect = anchorElement.getBoundingClientRect();
            const imageRect = this.originalImage.getBoundingClientRect();

            // Validate rectangles
            if (!anchorRect || !imageRect ||
                typeof anchorRect.width === 'undefined' || typeof imageRect.width === 'undefined') {
                console.warn('⚠️ Invalid getBoundingClientRect in isAnchorLikelyInterferingWithMouse');
                return false;
            }

            // Enhanced theater mode navigation detection
            const isTheaterNavigation = this.isTheaterModeNavigationAnchor(anchorElement, anchorRect, imageRect);
            if (isTheaterNavigation) {
                console.log('🎭 Theater navigation anchor interfering:', {
                    className: anchorElement.className,
                    dimensions: this.getElementDimensions(anchorElement),
                    href: anchorElement.href?.substring(0, 50) + '...'
                });
                return true;
            }

            // Check if anchor is positioned in a way that could interfere
            // 1. Anchor is in the same general area as the image
            const anchorCenterX = anchorRect.left + anchorRect.width / 2;
            const anchorCenterY = anchorRect.top + anchorRect.height / 2;

            const horizontalOverlap = anchorCenterX >= imageRect.left && anchorCenterX <= imageRect.right;
            const verticalOverlap = anchorCenterY >= imageRect.top && anchorCenterY <= imageRect.bottom;

            // 2. Or anchor completely contains the image (common in card layouts)
            const containsImage = anchorRect.left <= imageRect.left &&
                anchorRect.right >= imageRect.right &&
                anchorRect.top <= imageRect.top &&
                anchorRect.bottom >= imageRect.bottom;

            // 3. Or there's ANY overlap (be more permissive for anchors)
            const hasAnyOverlap = !(anchorRect.right < imageRect.left ||
                anchorRect.left > imageRect.right ||
                anchorRect.bottom < imageRect.top ||
                anchorRect.top > imageRect.bottom);

            const isInterfering = horizontalOverlap || verticalOverlap || containsImage || hasAnyOverlap;

            if (isInterfering) {
                console.log('🎯 Anchor likely interfering:', {
                    className: anchorElement.className,
                    horizontalOverlap,
                    verticalOverlap,
                    containsImage,
                    hasAnyOverlap,
                    anchorRect: { width: anchorRect.width, height: anchorRect.height },
                    imageRect: { width: imageRect.width, height: imageRect.height }
                });
            }

            return isInterfering;
        } catch (error) {
            console.warn('Error checking anchor interference:', error);
            return true; // When in doubt, assume it might interfere
        }
    }

    /**
     * Specific check for theater mode navigation anchors (like Flickr prev/next)
     */
    isTheaterModeNavigationAnchor(anchorElement, anchorRect, imageRect) {
        // Validate inputs
        if (!anchorElement || !anchorRect || !imageRect) {
            console.warn('⚠️ Invalid parameters for isTheaterModeNavigationAnchor');
            return false;
        }

        // Validate rectangle properties
        if (typeof anchorRect.width === 'undefined' || typeof anchorRect.height === 'undefined' ||
            typeof imageRect.width === 'undefined' || typeof imageRect.height === 'undefined') {
            console.warn('⚠️ Invalid rectangle properties in isTheaterModeNavigationAnchor');
            return false;
        }

        try {
            // Theater mode navigation indicators
            const className = anchorElement.className || '';
            const hasTheaterClasses = className.includes('navigate-target') ||
                className.includes('navigate-prev') ||
                className.includes('navigate-next') ||
                className.includes('lightbox') ||
                className.includes('theater') ||
                className.includes('viewer');

            // Check for data attributes commonly used in theater mode
            const hasTheaterData = anchorElement.hasAttribute('data-track') ||
                anchorElement.hasAttribute('data-action') ||
                anchorElement.hasAttribute('data-direction');

            // Check if this is a tall navigation element (Flickr pattern)
            const isTallNavigation = anchorRect.height >= Math.max(200, imageRect.height * 0.5) &&
                (anchorRect.width <= 150 || anchorRect.height / anchorRect.width > 2);

            // Check positioning for theater navigation (should be adjacent to or overlapping image)
            const isAdjacentToImage = this.isElementAdjacentToImage(anchorRect, imageRect);

            // Text content check for navigation indicators
            const textContent = anchorElement.textContent || '';
            const hasNavText = textContent.includes('←') || textContent.includes('→') ||
                /prev|next/i.test(textContent) ||
                textContent.trim() === '' && anchorElement.querySelector('[class*="hide-text"]');

            // Consider it theater navigation if it has the right characteristics
            return (hasTheaterClasses || hasTheaterData || isTallNavigation) &&
                (isAdjacentToImage || hasNavText);

        } catch (error) {
            console.warn('Error checking theater navigation anchor:', error);
            return false;
        }
    }

    /**
     * Check if element is positioned adjacent to the image (theater mode pattern)
     */
    isElementAdjacentToImage(elementRect, imageRect) {
        // Validate rectangles
        if (!elementRect || !imageRect ||
            typeof elementRect.left === 'undefined' || typeof elementRect.right === 'undefined' ||
            typeof elementRect.top === 'undefined' || typeof elementRect.bottom === 'undefined' ||
            typeof imageRect.left === 'undefined' || typeof imageRect.right === 'undefined' ||
            typeof imageRect.top === 'undefined' || typeof imageRect.bottom === 'undefined') {
            console.warn('⚠️ Invalid rectangles in isElementAdjacentToImage');
            return false;
        }

        try {
            const tolerance = 20; // pixels tolerance for "adjacent"

            // Left side of image
            const isLeftAdjacent = Math.abs(elementRect.right - imageRect.left) <= tolerance &&
                elementRect.top <= imageRect.bottom + tolerance &&
                elementRect.bottom >= imageRect.top - tolerance;

            // Right side of image  
            const isRightAdjacent = Math.abs(elementRect.left - imageRect.right) <= tolerance &&
                elementRect.top <= imageRect.bottom + tolerance &&
                elementRect.bottom >= imageRect.top - tolerance;

            // Above image
            const isTopAdjacent = Math.abs(elementRect.bottom - imageRect.top) <= tolerance &&
                elementRect.left <= imageRect.right + tolerance &&
                elementRect.right >= imageRect.left - tolerance;

            // Below image
            const isBottomAdjacent = Math.abs(elementRect.top - imageRect.bottom) <= tolerance &&
                elementRect.left <= imageRect.right + tolerance &&
                elementRect.right >= imageRect.left - tolerance;

            // Overlapping with image
            const isOverlapping = !(elementRect.right < imageRect.left ||
                elementRect.left > imageRect.right ||
                elementRect.bottom < imageRect.top ||
                elementRect.top > imageRect.bottom);

            return isLeftAdjacent || isRightAdjacent || isTopAdjacent || isBottomAdjacent || isOverlapping;
        } catch (error) {
            console.warn('⚠️ Error in isElementAdjacentToImage:', error);
            return false;
        }
    }

    /**
     * Detect if we're in a theater mode context (photo viewer, lightbox, etc.)
     */
    detectTheaterModeContext() {
        if (!this.container || !this.originalImage) return false;

        try {
            // Method 1: Check for theater mode class indicators in the DOM hierarchy
            let currentElement = this.container;
            let searchDepth = 0;
            const maxSearchDepth = 6;

            while (currentElement && searchDepth < maxSearchDepth) {
                const className = currentElement.className || '';

                // Theater mode class patterns
                if (className.includes('theater') ||
                    className.includes('lightbox') ||
                    className.includes('modal') ||
                    className.includes('overlay') ||
                    className.includes('viewer') ||
                    className.includes('photo-well') ||
                    className.includes('media-viewer') ||
                    className.includes('fullscreen') ||
                    className.includes('photo-page')) {
                    console.log('🎭 Theater mode detected via class:', className);
                    return true;
                }

                currentElement = currentElement.parentElement;
                searchDepth++;
            }

            // Method 2: Check for facade/protection patterns (Flickr)
            const facadeElement = this.container.querySelector('.facade-of-protection-neue, .facade-of-protection');
            if (facadeElement) {
                console.log('🎭 Theater mode detected via facade pattern');
                return true;
            }

            // Method 3: Check URL patterns
            const url = window.location.href;
            if (url.includes('lightbox') ||
                url.includes('theater') ||
                url.includes('/photo/') ||
                url.includes('/photos/') && url.includes('/in/')) {
                console.log('🎭 Theater mode detected via URL pattern');
                return true;
            }

            // Method 4: Check for navigation elements that suggest theater mode
            const parentElement = this.container.parentElement;
            if (parentElement) {
                const hasTheaterNavigation = parentElement.querySelector('.navigate-target, .photo-nav, .lightbox-nav');
                if (hasTheaterNavigation) {
                    console.log('🎭 Theater mode detected via navigation elements');
                    return true;
                }
            }

            // Method 5: Check container positioning and dimensions
            const containerRect = this.container.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Theater mode often uses containers that take up significant viewport space
            const isLargeContainer = (containerRect.width / viewportWidth) > 0.6 &&
                (containerRect.height / viewportHeight) > 0.5;

            // And are often centered or positioned in specific ways
            const isCentered = Math.abs(containerRect.left + containerRect.width / 2 - viewportWidth / 2) < 100;

            if (isLargeContainer && isCentered) {
                console.log('🎭 Theater mode detected via container dimensions/positioning');
                return true;
            }

            return false;

        } catch (error) {
            console.warn('Error detecting theater mode context:', error);
            return false;
        }
    }

    /**
     * Check if an element covers the image area
     */
    doesElementCoverImage(element) {
        if (!element || !this.originalImage) return false;

        try {
            const elementRect = element.getBoundingClientRect();
            const imageRect = this.originalImage.getBoundingClientRect();

            // Validate rectangles
            if (!elementRect || !imageRect ||
                typeof elementRect.width === 'undefined' || typeof imageRect.width === 'undefined') {
                console.warn('⚠️ Invalid getBoundingClientRect in doesElementCoverImage');
                return false;
            }

            // Check if the element overlaps significantly with the image
            const overlapLeft = Math.max(elementRect.left, imageRect.left);
            const overlapRight = Math.min(elementRect.right, imageRect.right);
            const overlapTop = Math.max(elementRect.top, imageRect.top);
            const overlapBottom = Math.min(elementRect.bottom, imageRect.bottom);

            const overlapWidth = Math.max(0, overlapRight - overlapLeft);
            const overlapHeight = Math.max(0, overlapBottom - overlapTop);
            const overlapArea = overlapWidth * overlapHeight;

            const imageArea = imageRect.width * imageRect.height;
            const overlapPercentage = overlapArea / imageArea;

            // Consider it a covering overlay if it overlaps more than 50% of the image
            return overlapPercentage > 0.5;
        } catch (error) {
            console.warn('Error checking element overlap:', error);
            return false;
        }
    }

    /**
 * Update mouse position for 3D effect tracking
 * This is called when overlay elements are capturing mouse events
 */
    updateMousePosition(event) {
        if (!this.canvas || !this.mousePos) return;

        try {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left - rect.width / 2;
            const mouseY = event.clientY - rect.top - rect.height / 2;

            // Calculate the position relative to the center, normalized between -0.5 and +0.5
            this.mousePos.x = (mouseX / rect.width);
            this.mousePos.y = (mouseY / rect.width);

            // Optional: Add debug logging to verify mouse tracking is working (disabled for performance)
            // console.log(`🎯 Updated mouse position: (${this.mousePos.x.toFixed(3)}, ${this.mousePos.y.toFixed(3)})`);
        } catch (error) {
            console.warn('Error updating mouse position:', error);
        }
    }

    /**
     * Check if mouse position is over the image area
     */
    isMouseOverImageArea(event) {
        if (!this.originalImage) return false;

        try {
            // For virtual images, use the original background or picture element's bounds
            let targetElement = this.originalImage;
            if (this.originalImage._isVirtualBackgroundImage) {
                // Priority: background element first, then picture element as fallback
                if (this.originalImage._originalBackgroundElement) {
                    targetElement = this.originalImage._originalBackgroundElement;
                } else if (this.originalImage._originalPictureElement) {
                    targetElement = this.originalImage._originalPictureElement;
                }
            }

            const imageRect = targetElement.getBoundingClientRect();
            const mouseX = event.clientX;
            const mouseY = event.clientY;

            return mouseX >= imageRect.left &&
                mouseX <= imageRect.right &&
                mouseY >= imageRect.top &&
                mouseY <= imageRect.bottom;
        } catch (error) {
            console.warn('Error checking mouse position:', error);
            return false;
        }
    }

    /**
 * Check if mouse is currently over the image area during initialization
 * This fixes the "black frame" issue when mouse is already hovering during 3D conversion
 */
    checkInitialMousePosition() {
        if (!this.originalImage) return;

        try {
            // Get current mouse position relative to viewport
            // We'll use a different approach since we don't have the actual mouse event

            // Add a small delay to ensure DOM is fully settled
            setTimeout(() => {
                // Create a synthetic mouse event check by testing if the image area is under the cursor
                // For virtual images, use the original background or picture element's bounds
                let targetElement = this.originalImage;
                if (this.originalImage._isVirtualBackgroundImage) {
                    // Priority: background element first, then picture element as fallback
                    if (this.originalImage._originalBackgroundElement) {
                        targetElement = this.originalImage._originalBackgroundElement;
                    } else if (this.originalImage._originalPictureElement) {
                        targetElement = this.originalImage._originalPictureElement;
                    }
                }
                const imageRect = targetElement.getBoundingClientRect();

                // Check if the image is visible and has valid dimensions
                if (imageRect.width > 0 && imageRect.height > 0) {
                    // Use elementsFromPoint to check what's under the center of the image
                    // This is a heuristic - if mouse was over image during conversion, it's likely still there
                    const centerX = imageRect.left + imageRect.width / 2;
                    const centerY = imageRect.top + imageRect.height / 2;

                    const elementsAtCenter = document.elementsFromPoint(centerX, centerY);

                    // Check if our canvas or original image is in the elements stack
                    const isCanvasOrImageAtCenter = elementsAtCenter.some(el =>
                        el === this.canvas || el === this.originalImage
                    );

                    // Alternative approach: Check if cursor is over image by testing hover state
                    const isImageHovered = this.originalImage.matches(':hover');

                    if (isImageHovered || isCanvasOrImageAtCenter) {
                        console.log('🎯 Mouse detected over image area during initialization - starting animation');
                        this.setAsActive();
                        // Only start animation if WebGL is ready, otherwise the render loop will wait
                        this.startAnimation();
                    }
                }
            }, 100); // Small delay to ensure everything is properly initialized

        } catch (error) {
            console.warn('Error checking initial mouse position:', error);
        }
    }

    /**
     * Check if WebGL resources are fully initialized and ready for rendering
     * This prevents black frames when rendering starts before shaders/textures are loaded
     */
    isWebGLReady() {
        try {
            // Check if basic WebGL context is available
            if (!this.gl || this.gl.isContextLost()) {
                console.log('🔍 WebGL context not ready or lost');
                return false;
            }

            // Check if shader program is created and linked
            if (!this.programInfo || !this.programInfo.program) {
                console.log('🔍 Shader program not ready');
                return false;
            }

            // Verify shader program is properly linked
            if (!this.gl.getProgramParameter(this.programInfo.program, this.gl.LINK_STATUS)) {
                console.log('🔍 Shader program not properly linked');
                return false;
            }

            // Check if views data is loaded (required for textures)
            if (!this.views || this.views.length === 0) {
                console.log('🔍 Views data not loaded');
                return false;
            }

            // Check if textures are created for the first view's layers
            if (!this.views[0].layers || this.views[0].layers.length === 0) {
                console.log('🔍 No layers found in views data');
                return false;
            }

            // Verify that at least the first layer has its textures loaded
            const firstLayer = this.views[0].layers[0];
            if (!firstLayer.image || !firstLayer.image.texture) {
                console.log('🔍 Image texture not ready for first layer');
                return false;
            }

            if (!firstLayer.invZ || !firstLayer.invZ.texture) {
                console.log('🔍 InvZ texture not ready for first layer');
                return false;
            }

            // Check if buffers are created
            if (!this.buffers || !this.buffers.position || !this.buffers.textureCoord || !this.buffers.indices) {
                console.log('🔍 WebGL buffers not ready');
                return false;
            }

            // All checks passed - WebGL is ready for rendering
            return true;

        } catch (error) {
            console.warn('Error checking WebGL readiness:', error);
            return false;
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

        // Windows Debug: Check container and canvas before DOM insertion
        console.log('🔗 Windows Debug - Before DOM insertion:', {
            containerExists: !!this.container,
            containerInDOM: this.container ? document.contains(this.container) : false,
            containerTagName: this.container ? this.container.tagName : 'none',
            canvasExists: !!this.canvas,
            canvasParent: this.canvas ? this.canvas.parentNode : 'none',
            canvasDimensions: this.canvas ? { width: this.canvas.width, height: this.canvas.height } : 'none'
        });

        // CRITICAL FIX: Ensure container is in DOM before proceeding
        // WINDOWS CHROME FIX: Skip validation for Flickr on Windows - use container as-is
        const isWindows = navigator.userAgent.includes('Windows');
        const isFlickr = window.location.hostname.includes('flickr.com');

        if (isWindows && isFlickr) {
            // WINDOWS FLICKR: Skip DOM validation, but find the CORRECT image/container like Mac

            // CRITICAL: Find the main-photo image (not zoom images) like Mac uses
            let macLikeImage = this.originalImage;
            let macLikeContainer = this.container;

            // Look for the main-photo image that Mac would use
            const mainPhoto = document.querySelector('img.main-photo');
            if (mainPhoto && mainPhoto !== this.originalImage) {
                macLikeImage = mainPhoto;
                macLikeContainer = mainPhoto.parentElement;
                console.log('🔄 Windows Flickr: Switching to main-photo image like Mac:', {
                    originalImage: this.originalImage.className,
                    newImage: macLikeImage.className,
                    originalContainer: this.container.className,
                    newContainer: macLikeContainer.className
                });

                // Update references to match Mac
                this.originalImage = macLikeImage;
                this.container = macLikeContainer;
            }

            console.log('🪟 Windows Flickr: Using Mac-like image/container:', {
                imageClass: this.originalImage.className,
                containerClass: this.container.className,
                containerTag: this.container.tagName
            });

            // Set dimensions to match the main-photo image like Mac (use DISPLAY size, not natural size)
            const width = this.originalImage.width || this.originalImage.naturalWidth;
            const height = this.originalImage.height || this.originalImage.naturalHeight;

            if (width && height) {
                this.targetDimensions = {
                    width: Math.round(width),
                    height: Math.round(height)
                };
                console.log('🎯 Windows Flickr: Setting dimensions to match main-photo DISPLAY size:', this.targetDimensions);
            }
        } else if (!document.contains(this.container)) {
            // Normal validation for non-Windows or non-Flickr
            console.error('❌ Container not in DOM! Attempting to find valid container...');
            console.log('Invalid container details:', {
                tagName: this.container.tagName,
                className: this.container.className,
                id: this.container.id
            });

            // Try to find a valid parent container that IS in the DOM
            let validContainer = null;

            // Strategy 1: For Flickr, try theater containers first (Mac works fine with these)
            if (window.location.hostname.includes('flickr.com')) {
                // Try theater containers first (works on Mac)
                const theaterContainer = document.querySelector('.height-controller.enable-zoom') ||
                    document.querySelector('.facade-of-protection-neue') ||
                    document.querySelector('[class*="zoom-photo-container"]');
                if (theaterContainer && document.contains(theaterContainer)) {
                    validContainer = theaterContainer;
                    console.log('✅ Found Flickr theater container:', validContainer.tagName, validContainer.className);
                }
            }

            // Strategy 2: Look for container's closest ancestor that's in the DOM
            if (!validContainer) {
                let currentElement = this.container;
                while (currentElement && currentElement.parentElement) {
                    if (document.contains(currentElement.parentElement)) {
                        validContainer = currentElement.parentElement;
                        console.log('✅ Found valid parent container in DOM:', validContainer.tagName, validContainer.className);
                        break;
                    }
                    currentElement = currentElement.parentElement;
                }
            }

            // Strategy 3: Use original image's closest positioned parent
            if (!validContainer && this.originalImage && document.contains(this.originalImage)) {
                let imgParent = this.originalImage.parentElement;
                while (imgParent && imgParent !== document.body) {
                    if (document.contains(imgParent)) {
                        const style = window.getComputedStyle(imgParent);
                        if (style.position !== 'static' || imgParent.offsetWidth > 0) {
                            validContainer = imgParent;
                            console.log('✅ Using positioned image ancestor as container:', validContainer.tagName, validContainer.className);
                            break;
                        }
                    }
                    imgParent = imgParent.parentElement;
                }

                // Fallback to immediate parent
                if (!validContainer) {
                    validContainer = this.originalImage.parentElement;
                    console.log('✅ Using original image parent as fallback container:', validContainer.tagName, validContainer.className);
                }
            }

            // Strategy 4: Last resort - use document.body
            if (!validContainer) {
                validContainer = document.body;
                console.log('⚠️ Using document.body as last resort container');
            }

            // Replace the invalid container with the valid one
            if (validContainer && validContainer !== this.container) {
                console.log('🔄 Replacing invalid container with valid container');

                // CRITICAL: If we're using document.body, we need to position the canvas at the image location
                const isUsingBodyFallback = validContainer === document.body;

                this.container = validContainer;

                // For document.body fallback, calculate the canvas position to match the image
                if (isUsingBodyFallback && this.originalImage) {
                    const imageRect = this.originalImage.getBoundingClientRect();
                    console.log('📍 Positioning canvas over image for body fallback:', {
                        imageRect: {
                            left: imageRect.left,
                            top: imageRect.top,
                            width: imageRect.width,
                            height: imageRect.height
                        },
                        scrollY: window.scrollY,
                        scrollX: window.scrollX
                    });

                    // Override target dimensions to match the visible image size
                    this.targetDimensions = {
                        width: Math.round(imageRect.width),
                        height: Math.round(imageRect.height)
                    };

                    console.log('🎯 Updated target dimensions for body fallback:', this.targetDimensions);
                }

                // Re-run container setup with the new valid container
                this.setupContainer();
            }
        }

        this.container.appendChild(this.canvas);

        // Windows Debug: Check after DOM insertion
        console.log('🔗 Windows Debug - After DOM insertion:', {
            canvasInDOM: document.contains(this.canvas),
            canvasParent: this.canvas.parentNode ? this.canvas.parentNode.tagName : 'none',
            canvasNextSibling: this.canvas.nextElementSibling ? this.canvas.nextElementSibling.tagName : 'none',
            canvasPrevSibling: this.canvas.previousElementSibling ? this.canvas.previousElementSibling.tagName : 'none'
        });
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
        console.log("stereo_render_data", this.lifInfo.stereo_render_data);

        if (this.lifInfo.animations) this.animations = this.lifInfo.animations;
        // for now hardcode animations[0];
        const zAmp = 0.5 / this.views[0].invZ.min;
        //const invd = this.focus * this.views[0].layers[0].invZ.min; // set focus point
        const invd = this.lifInfo.stereo_render_data.inv_convergence_distance; // only used for tracking shots
        const xc = this.views.length > 1 ? -0.5 : 0;
        this.animations[0] = {
            type: "harmonic",
            name: "Zoom In",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: 0, // focus at infinity
                position: {
                    x: { amplitude: 0.0, phase: 0.0, bias: xc },
                    y: { amplitude: 0.0, phase: 0.0, bias: 0 },
                    z: { amplitude: zAmp / 2, phase: -0.25, bias: zAmp / 2 }
                }
            }
        }
        this.animations[1] = {
            type: "harmonic",
            name: "Ken Burns",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: invd, // focus used for tracking shots
                position: {
                    x: { amplitude: 0.0, phase: 0.0, bias: xc },
                    y: { amplitude: 0.0, phase: 0.0, bias: 0 },
                    z: { amplitude: -zAmp / 2, phase: -0.25, bias: -zAmp / 2 }
                }
            }
        }
        this.animations[2] = {
            type: "harmonic",
            name: "Panning Hor",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: 0, // focus used for tracking shots
                position: {
                    x: { amplitude: zAmp / 2, phase: 0.0, bias: xc },
                    y: { amplitude: 0.0, phase: 0.0, bias: 0 },
                    z: { amplitude: 0, phase: 0, bias: 0 }
                }
            }
        }
        this.animations[3] = {
            type: "harmonic",
            name: "Panning Vert",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: 0, // focus used for tracking shots
                position: {
                    x: { amplitude: 0.0, phase: 0.0, bias: xc },
                    y: { amplitude: zAmp / 2, phase: 0.0, bias: 0 },
                    z: { amplitude: 0, phase: 0, bias: 0 }
                }
            }
        }
        this.animations[4] = {
            type: "harmonic",
            name: "Tracking Hor",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: invd, // focus used for tracking shots
                position: {
                    x: { amplitude: zAmp / 2, phase: 0.0, bias: xc },
                    y: { amplitude: 0.0, phase: 0.0, bias: 0 },
                    z: { amplitude: 0, phase: 0, bias: 0 }
                }
            }
        }
        this.animations[5] = {
            type: "harmonic",
            name: "Tracking Vert",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: invd, // focus used for tracking shots
                position: {
                    x: { amplitude: 0.0, phase: 0.0, bias: xc },
                    y: { amplitude: zAmp / 2, phase: 0.0, bias: 0 },
                    z: { amplitude: 0, phase: 0, bias: 0 }
                }
            }
        }
        this.animations[6] = {
            type: "harmonic",
            name: "Static",
            duration_sec: 4.0,
            data: {
                focal_px: this.views[0].f,
                width_px: this.views[0].width,
                height_px: this.views[0].height,
                invd: 0, // focus used for tracking shots
                position: {
                    x: { amplitude: 0.0, phase: 0.0, bias: xc },
                    y: { amplitude: 0, phase: 0.0, bias: 0 },
                    z: { amplitude: 0, phase: 0, bias: 0 }
                }
            }
        }
        // Load saved animation preference from storage, default to animation 0 (Zoom In)
        try {
            const result = await chrome.storage.local.get(['lifAnimationIndex']);
            const savedAnimationIndex = result.lifAnimationIndex !== undefined ? result.lifAnimationIndex : 0;
            this.currentAnimation = this.animations[savedAnimationIndex] || this.animations[0];
            console.log(`Loaded animation preference: ${this.currentAnimation.name} (index ${savedAnimationIndex})`);
        } catch (error) {
            console.warn('Could not load animation preference, using default:', error);
            this.currentAnimation = this.animations[0];
        }

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
                oRes: this.gl.getUniformLocation(shaderProgram, 'oRes'),

                // Feathering and background uniforms
                feathering: this.gl.getUniformLocation(shaderProgram, 'feathering'),
                background: this.gl.getUniformLocation(shaderProgram, 'background')
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
                oRes: this.gl.getUniformLocation(shaderProgram, 'oRes'),

                // Feathering and background uniforms
                feathering: this.gl.getUniformLocation(shaderProgram, 'feathering'),
                background: this.gl.getUniformLocation(shaderProgram, 'background')
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

        // Feathering and background uniforms
        this.gl.uniform1f(this.programInfo.uniformLocations.feathering, this.feathering);
        this.gl.uniform4fv(this.programInfo.uniformLocations.background, this.background);

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

        // Feathering and background uniforms
        this.gl.uniform1f(this.programInfo.uniformLocations.feathering, this.feathering);
        this.gl.uniform4fv(this.programInfo.uniformLocations.background, this.background);

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
            this.canvas.width = this.originalImage.width;
            this.canvas.height = this.originalImage.height;

            console.log(`Canvas resized using fallback: ${this.originalImage.width}x${this.originalImage.height}`);
        }
    }

    render() {
        // Safety check: ensure currentAnimation is initialized before rendering
        if (!this.currentAnimation || !this.currentAnimation.duration_sec) {
            // If animation data isn't ready yet, schedule another frame and return
            if (!this.gl.isContextLost()) {
                this.animationFrame = requestAnimationFrame(this.render);
            }
            return;
        }

        // CRITICAL FIX: Check if WebGL resources are fully initialized before rendering
        // This prevents the black frame issue when animation starts before shaders/textures are ready
        if (!this.isWebGLReady()) {
            // Clear the canvas to prevent black frame artifacts
            if (this.gl && !this.gl.isContextLost()) {
                this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
                this.gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent clear
                this.gl.clear(this.gl.COLOR_BUFFER_BIT);

                // WebGL resources not ready yet, schedule another frame and return
                this.animationFrame = requestAnimationFrame(this.render);
            }
            return;
        }

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
        this.renderCam.sl.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
        this.renderCam.sl.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
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
        // Note: this.running should already be false when called from stopAnimation()

        // Safety check: ensure currentAnimation is initialized
        if (!this.currentAnimation || !this.currentAnimation.data) {
            // If animation data isn't ready, just hide canvas and return
            this.canvas.style.display = 'none';
            this.isRenderingOff = false;
            cancelAnimationFrame(this.renderOffAnimationFrame);
            return;
        }

        // Check if WebGL resources are ready before rendering transition
        if (!this.isWebGLReady()) {
            // WebGL not ready - just hide canvas immediately
            this.canvas.style.display = 'none';
            this.isRenderingOff = false;
            cancelAnimationFrame(this.renderOffAnimationFrame);
            return;
        }

        const elapsedTime = (Date.now() / 1000) - this.startTime;
        const progress = Math.min(elapsedTime / transitionTime, 1); // progress goes from 0 to 1

        const invd = this.currentAnimation.data.invd;

        // Exponential decay factor - adjust this value to control smoothness
        // Higher values = faster decay, lower values = slower/smoother decay
        const decayConstant = 3.0; // Was effectively ~10 before (too fast)

        // Calculate exponential decay: factor decreases smoothly from 1 to 0
        const decayFactor = Math.exp(-decayConstant * progress);

        // Target positions should be (0, 0, xc)
        // xc = 0 for mono LIF (this.views.length == 1)
        // xc = -0.5 for stereo LIF (this.views.length > 1)
        const targetX = 0;
        const targetY = 0;
        const targetZ = this.views.length > 1 ? -0.5 : 0;

        // Use the captured starting position when mouse left the screen
        // If not available (shouldn't happen), fall back to current animation position
        let startX, startY, startZ;
        if (this.renderOffStartPos) {
            startX = this.renderOffStartPos.x;
            startY = this.renderOffStartPos.y;
            startZ = this.renderOffStartPos.z;
        } else {
            // Fallback: calculate current animation position
            const animTime = this.currentAnimation.duration_sec;
            const t = elapsedTime;
            function harm(amp, ph, bias) { return amp * Math.sin(2 * Math.PI * (t / animTime + ph)) + bias };
            startX = harm(this.currentAnimation.data.position.x.amplitude, this.currentAnimation.data.position.x.phase, this.currentAnimation.data.position.x.bias);
            startY = harm(this.currentAnimation.data.position.y.amplitude, this.currentAnimation.data.position.y.phase, this.currentAnimation.data.position.y.bias);
            startZ = harm(this.currentAnimation.data.position.z.amplitude, this.currentAnimation.data.position.z.phase, this.currentAnimation.data.position.z.bias);
        }

        // Smoothly interpolate from starting position to target (origin) position
        this.renderCam.pos.x = startX * decayFactor + targetX * (1 - decayFactor);
        this.renderCam.pos.y = startY * decayFactor + targetY * (1 - decayFactor);
        this.renderCam.pos.z = startZ * decayFactor + targetZ * (1 - decayFactor);

        // Update camera parameters
        this.renderCam.sl.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd);
        this.renderCam.sl.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd);
        const vs = this.viewportScale({ x: this.currentAnimation.data.width_px, y: this.currentAnimation.data.height_px }, { x: this.gl.canvas.width, y: this.gl.canvas.height });
        this.renderCam.f = this.currentAnimation.data.focal_px * vs * (1 - this.renderCam.pos.z * invd);

        if (this.views.length < 2) {
            this.drawSceneMN(10);
        } else {
            this.drawSceneST(10);
        }

        if ((progress < 1) && !this.gl.isContextLost() && this.isRenderingOff) {
            // Continue rendering if transition hasn't completed and renderOff hasn't been canceled
            this.renderOffAnimationFrame = requestAnimationFrame(() => this.renderOff(transitionTime));
        } else {
            // Only hide the canvas when transition is complete
            this.canvas.style.display = 'none';

            // Clean up the captured starting position and renderOff state
            this.renderOffStartPos = null;
            this.isRenderingOff = false;
            cancelAnimationFrame(this.renderOffAnimationFrame);
        }
    }

    async startAnimation() {
        if (this.disableAnim) return;
        if (!this.gl.isContextLost()) {
            if (this.running) return;

            // Cancel any ongoing renderOff animation
            if (this.isRenderingOff) {
                this.isRenderingOff = false;
                cancelAnimationFrame(this.renderOffAnimationFrame);
                this.renderOffAnimationFrame = null;
                this.renderOffStartPos = null; // Clean up renderOff state
            }

            this.running = true;
            // Only show the canvas
            this.canvas.style.display = 'block';

            // CRITICAL FIX: Recalculate positioning for special cases
            const isWindows = navigator.userAgent.includes('Windows');
            const isFlickr = window.location.hostname.includes('flickr.com');

            if (isWindows && isFlickr && this.container === this.originalImage?.parentElement && this.originalImage) {
                // WINDOWS FLICKR FIX: Use same positioning and sizing as Mac

                // Use target dimensions (already calculated to match main-photo)
                const width = this.targetDimensions?.width || this.originalImage.naturalWidth || this.originalImage.width;
                const height = this.targetDimensions?.height || this.originalImage.naturalHeight || this.originalImage.height;

                if (width && height) {
                    this.canvas.style.position = 'absolute';
                    this.canvas.style.width = `${width}px`;
                    this.canvas.style.height = `${height}px`;

                    // CRITICAL: Also set WebGL internal dimensions to match display size
                    this.canvas.width = width;
                    this.canvas.height = height;

                    // Use the same offset calculation as Mac
                    const nestedOffset = this.calculateNestedContainerOffset();
                    if (nestedOffset) {
                        this.canvas.style.top = `${nestedOffset.top}px`;
                        this.canvas.style.left = `${nestedOffset.left}px`;
                        console.log('🪟 WINDOWS FLICKR: Applied Mac-like positioning with offset:', {
                            top: this.canvas.style.top,
                            left: this.canvas.style.left,
                            width: this.canvas.style.width,
                            height: this.canvas.style.height,
                            webglWidth: this.canvas.width,
                            webglHeight: this.canvas.height,
                            offset: nestedOffset
                        });
                    } else {
                        this.canvas.style.top = '0px';
                        this.canvas.style.left = '0px';
                        console.log('🪟 WINDOWS FLICKR: Applied fallback positioning:', {
                            top: this.canvas.style.top,
                            left: this.canvas.style.left,
                            width: this.canvas.style.width,
                            height: this.canvas.style.height,
                            webglWidth: this.canvas.width,
                            webglHeight: this.canvas.height
                        });
                    }
                }
            } else if (this.container === document.body && this.originalImage) {
                // DOCUMENT.BODY FALLBACK: Position canvas over image with absolute positioning
                const imageRect = this.originalImage.getBoundingClientRect();
                if (imageRect && typeof imageRect.width !== 'undefined') {
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

                    this.canvas.style.position = 'absolute';
                    this.canvas.style.top = `${imageRect.top + scrollTop}px`;
                    this.canvas.style.left = `${imageRect.left + scrollLeft}px`;
                    this.canvas.style.width = `${imageRect.width}px`;
                    this.canvas.style.height = `${imageRect.height}px`;

                    console.log('📍 DOCUMENT.BODY: Applied runtime positioning:', {
                        top: this.canvas.style.top,
                        left: this.canvas.style.left,
                        width: this.canvas.style.width,
                        height: this.canvas.style.height,
                        imageRect: {
                            top: imageRect.top,
                            left: imageRect.left,
                            width: imageRect.width,
                            height: imageRect.height
                        },
                        scroll: { top: scrollTop, left: scrollLeft }
                    });
                }
            }

            console.log('🚀 Animation started - display states changed:');
            console.log('📊 Windows Debug - Full canvas state after showing:', {
                display: this.canvas.style.display,
                position: this.canvas.style.position,
                zIndex: this.canvas.style.zIndex,
                top: this.canvas.style.top,
                left: this.canvas.style.left,
                width: this.canvas.style.width,
                height: this.canvas.style.height,
                opacity: this.canvas.style.opacity,
                visibility: this.canvas.style.visibility,
                transform: this.canvas.style.transform,
                internalDimensions: { width: this.canvas.width, height: this.canvas.height },
                boundingRect: this.canvas.getBoundingClientRect ?
                    (() => {
                        try {
                            const rect = this.canvas.getBoundingClientRect();
                            return rect && typeof rect.width !== 'undefined' ?
                                { width: rect.width, height: rect.height, top: rect.top, left: rect.left } :
                                'invalid';
                        } catch (e) {
                            return 'error: ' + e.message;
                        }
                    })() : 'method not available',
                isVisible: this.canvas.offsetWidth > 0 && this.canvas.offsetHeight > 0,
                parentNode: this.canvas.parentNode ? this.canvas.parentNode.tagName : 'no parent'
            });
            // Enhanced architecture handles positioning automatically
            this.startTime = Date.now() / 1000;
            this.animationFrame = requestAnimationFrame(this.render);
        } else {
            // ... existing fallback logic ...
        }
    }

    stopAnimation(transitionTime = null) { // Use instance property if not specified
        if (this.disableAnim) return;
        cancelAnimationFrame(this.animationFrame);
        this.running = false;
        this.mousePosOld = { x: 0, y: 0 };

        // Use provided transitionTime or fall back to instance property
        const actualTransitionTime = transitionTime !== null ? transitionTime : this.relaxationTime;

        // Capture the current camera position when mouse leaves
        this.renderOffStartPos = {
            x: this.renderCam.pos.x,
            y: this.renderCam.pos.y,
            z: this.renderCam.pos.z
        };

        // Set renderOff state and start renderOff animation
        this.isRenderingOff = true;
        this.startTime = Date.now() / 1000; // Start transition timer
        this.renderOffAnimationFrame = requestAnimationFrame(() => this.renderOff(actualTransitionTime));
    }

    /**
     * Set the relaxation time for the renderOff animation
     * @param {number} time - Transition time in seconds (e.g., 0.5 for half a second)
     */
    setRelaxationTime(time) {
        this.relaxationTime = Math.max(0.1, Math.min(5.0, time)); // Clamp between 0.1 and 5.0 seconds
    }

    /**
 * Set the current animation by index
 * @param {number} animationIndex - Index of the animation to use (0 = Zoom In, 1 = Ken Burns, .., 6 = Static)
 */
    setAnimation(animationIndex) {
        if (this.animations && animationIndex >= 0 && animationIndex < this.animations.length) {
            this.currentAnimation = this.animations[animationIndex];
            console.log(`Animation changed to: ${this.currentAnimation.name} (index ${animationIndex})`);

            // Reset mouse position to center (0,0) for clean animation restart
            this.mousePos = { x: 0, y: 0 };
            this.mousePosOld = { x: 0, y: 0 };

            // Start playing the animation immediately, same as after fresh conversion
            this.startAnimation();

            return true;
        } else {
            console.warn(`Invalid animation index: ${animationIndex}. Available animations: ${this.animations ? this.animations.length : 0}`);
            return false;
        }
    }

    /**
     * Get available animation names
     * @returns {string[]} Array of animation names
     */
    getAnimationNames() {
        return this.animations ? this.animations.map(anim => anim.name) : [];
    }

    /**
 * Static method to get animation metadata (names, types, etc.) without needing an instance
 * This can be called before any lifViewer is instantiated
 * @returns {Object[]} Array of animation objects with name, index, type, and duration
 */
    static getAvailableAnimations() {
        // Return shared animation definitions
        return [...ANIMATION_DEFINITIONS]; // Return a copy to prevent mutation
    }

    /**
 * Static method to get animation names from any active instance (legacy method)
 * @returns {Object[]} Array of animation objects with name and index
 */
    static getAvailableAnimationsFromInstance() {
        // Find the first instance with animations loaded
        const instanceWithAnimations = lifViewer.instances.find(instance =>
            instance.animations && instance.animations.length > 0
        );

        if (instanceWithAnimations) {
            return instanceWithAnimations.animations.map((anim, index) => ({
                name: anim.name,
                index: index,
                type: anim.type,
                duration: anim.duration_sec
            }));
        }

        // Fallback to static method
        return lifViewer.getAvailableAnimations();
    }

    /**
     * Static method to get animations from the currently active instance
     * @returns {Object[]} Array of animation objects from active instance
     */
    static getActiveInstanceAnimations() {
        if (lifViewer.activeInstance && lifViewer.activeInstance.animations && lifViewer.activeInstance.animations.length > 0) {
            return {
                success: true,
                animations: lifViewer.activeInstance.animations.map((anim, index) => ({
                    name: anim.name,
                    index: index,
                    type: anim.type,
                    duration: anim.duration_sec
                })),
                currentAnimation: lifViewer.activeInstance.animations.indexOf(lifViewer.activeInstance.currentAnimation),
                instanceId: lifViewer.instances.indexOf(lifViewer.activeInstance)
            };
        }

        return { success: false, reason: 'No active instance with animations' };
    }

    /**
     * Static method to set animation on the currently active instance only
     * @param {number} animationIndex - Index of animation to set
     * @returns {Object} Result of the operation
     */
    static setActiveInstanceAnimation(animationIndex) {
        if (lifViewer.activeInstance && lifViewer.activeInstance.setAnimation) {
            const success = lifViewer.activeInstance.setAnimation(animationIndex);
            return {
                success: success,
                instanceId: lifViewer.instances.indexOf(lifViewer.activeInstance),
                animationName: success ? lifViewer.activeInstance.currentAnimation.name : null
            };
        }

        return { success: false, reason: 'No active instance available' };
    }

    /**
     * Set this instance as the active one
     */
    setAsActive() {
        lifViewer.activeInstance = this;
        console.log(`Instance set as active: ${this.lifUrl} (${lifViewer.instances.indexOf(this)})`);
    }

    /**
     * Get the current relaxation time
     * @returns {number} Current relaxation time in seconds
     */
    getRelaxationTime() {
        return this.relaxationTime;
    }

    // Helper method to render a single frame at a specific time (used for MP4 generation)
    renderFrame(timeInSeconds) {
        // Safety check: ensure currentAnimation is initialized
        if (!this.currentAnimation || !this.currentAnimation.data) {
            return;
        }

        const animTime = this.currentAnimation.duration_sec;
        const t = timeInSeconds;

        function harm(amp, ph, bias) {
            return amp * Math.sin(2 * Math.PI * (t / animTime + ph)) + bias;
        }

        const invd = this.currentAnimation.data.invd;

        // Update renderCam for this specific time
        this.renderCam.pos.x = harm(
            this.currentAnimation.data.position.x.amplitude,
            this.currentAnimation.data.position.x.phase,
            this.currentAnimation.data.position.x.bias
        );
        this.renderCam.pos.y = harm(
            this.currentAnimation.data.position.y.amplitude,
            this.currentAnimation.data.position.y.phase,
            this.currentAnimation.data.position.y.bias
        );
        this.renderCam.pos.z = harm(
            this.currentAnimation.data.position.z.amplitude,
            this.currentAnimation.data.position.z.phase,
            this.currentAnimation.data.position.z.bias
        );

        // No mouse input during recording
        this.renderCam.sk.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd);
        this.renderCam.sk.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd);

        const vs = this.viewportScale(
            { x: this.currentAnimation.data.width_px, y: this.currentAnimation.data.height_px },
            { x: this.gl.canvas.width, y: this.gl.canvas.height }
        );
        this.renderCam.f = this.currentAnimation.data.focal_px * vs * (1 - this.renderCam.pos.z * invd);

        // Render the frame - use fixed time 1.1 to avoid glow animation (which happens for t in 0..1)
        if (this.views.length < 2) {
            this.drawSceneMN(1.1);
        } else {
            this.drawSceneST(1.1);
        }
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