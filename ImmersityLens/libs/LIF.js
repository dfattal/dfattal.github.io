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
        // this.AWS_LAMBDA_URL = 'https://gf6coowgaocqp5nfny5tn6ft4q0nxsvy.lambda-url.us-east-1.on.aws/?mode=' + mode2;
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
    }

    /**
     * Apply layout-specific styling during creation
     */
    setupLayoutSpecificStyling() {
        // SIMPLIFIED: Always use absolute positioning for canvas over image
        const dimensions = this.getEffectiveDimensions();
        let positioningStyle = 'top: 0; left: 0;';

        // Handle centered image positioning (LinkedIn-style)
        if (this.centeredImageInfo) {
            positioningStyle = `top: ${this.centeredImageInfo.offsetY}px; left: ${this.centeredImageInfo.offsetX}px;`;
            console.log('🎯 Applying centered image positioning:', positioningStyle);
        } else {
            // Check for nested positioning containers (Flickr facade pattern, etc.)
            const nestedOffset = this.calculateNestedContainerOffset();
            if (nestedOffset) {
                positioningStyle = `top: ${nestedOffset.top}px; left: ${nestedOffset.left}px;`;
                console.log('🏗️ Applying nested container positioning:', positioningStyle);
            }
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
    }

    /**
     * Calculate positioning offset for nested containers
     * Detects patterns like Flickr's facade-of-protection, theater mode containers, etc.
     */
    calculateNestedContainerOffset() {
        if (!this.originalImage || !this.container) {
            return null;
        }

        // Get the original image's position relative to our container
        const containerRect = this.container.getBoundingClientRect();
        const imageRect = this.originalImage.getBoundingClientRect();

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

        if (originalImage.closest('picture')) {
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

        // COMMENTED OUT: LinkedIn-specific centering fix
        // TODO: Generalize this to detect centered/fitted images on any site
        let targetDimensions = {
            width: originalImage.width || originalImage.naturalWidth,
            height: originalImage.height || originalImage.naturalHeight
        };

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

        if (isCenteredOrFitted && layoutAnalysis?.containerHasPaddingAspectRatio) {
            // Use image dimensions for fitted images in aspect ratio containers
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
            // BUT: Don't override picture element layout mode - picture elements have their own dimension handling
            if (layoutMode !== 'picture') {
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

        console.log(`Canvas ready with dimensions: ${this.canvas.width}x${this.canvas.height}`);
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
                this.startAnimation(); // Use the proper method for smooth transitions
            }
        };
        const stopAnimation = () => {
            if (this.running) {
                animationTimeoutId = setTimeout(() => {
                    this.stopAnimation(); // Use the proper method for smooth renderOff transition
                    animationTimeoutId = null;
                }, 100);
            }
        };
        this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
        this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });
        this.originalImage.addEventListener('mouseenter', startAnimation, { passive: true });
        this.originalImage.addEventListener('mouseleave', stopAnimation, { passive: true });
        // Canvas always receives events
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.style.display = 'none'; // Start hidden, will show on animation start
        console.log('✅ Unified event handlers configured (display mode with smooth transitions)');
    }

    setupOverlayEventHandlers() {
        let animationTimeoutId = null;
        const startAnimation = () => {
            if (animationTimeoutId) {
                clearTimeout(animationTimeoutId);
                animationTimeoutId = null;
            }
            if (!this.running) {
                this.startAnimation(); // Use the proper method for smooth transitions
            }
        };
        const stopAnimation = () => {
            if (this.running) {
                animationTimeoutId = setTimeout(() => {
                    this.stopAnimation(); // Use the proper method for smooth renderOff transition
                    animationTimeoutId = null;
                }, 100);
            }
        };
        this.canvas.addEventListener('mouseenter', startAnimation, { passive: true });
        this.canvas.addEventListener('mouseleave', stopAnimation, { passive: true });
        this.originalImage.addEventListener('mouseenter', startAnimation, { passive: true });
        this.originalImage.addEventListener('mouseleave', stopAnimation, { passive: true });
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

            // COMMENTED OUT: Flickr-specific container event fallback
            // TODO: Generalize overlay interference detection and fallback
            // if (window.location.hostname.includes('flickr.com') && this.container) {
            //     console.log('🔧 Adding Flickr container-level event fallback');
            //     this.container.addEventListener('mouseenter', (e) => {
            //         const canvasRect = this.canvas.getBoundingClientRect();
            //         const mouseX = e.clientX;
            //         const mouseY = e.clientY;
            //         if (mouseX >= canvasRect.left && mouseX <= canvasRect.right &&
            //             mouseY >= canvasRect.top && mouseY <= canvasRect.bottom) {
            //             console.log('🎯 Flickr container mouseenter detected over canvas area');
            //             startAnimation();
            //         }
            //     }, { passive: true });
            //     this.container.addEventListener('mouseleave', () => {
            //         console.log('🎯 Flickr container mouseleave detected');
            //         stopAnimation();
            //     }, { passive: true });
            // }

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
        // Note: this.running should already be false when called from stopAnimation()

        // Safety check: ensure currentAnimation is initialized
        if (!this.currentAnimation || !this.currentAnimation.data) {
            // If animation data isn't ready, just hide canvas and return
            this.canvas.style.display = 'none';
            cancelAnimationFrame(this.animationFrame);
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
        this.renderCam.sk.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd);
        this.renderCam.sk.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd);
        const vs = this.viewportScale({ x: this.currentAnimation.data.width_px, y: this.currentAnimation.data.height_px }, { x: this.gl.canvas.width, y: this.gl.canvas.height });
        this.renderCam.f = this.currentAnimation.data.focal_px * vs * (1 - this.renderCam.pos.z * invd);

        if (this.views.length < 2) {
            this.drawSceneMN(10);
        } else {
            this.drawSceneST(10);
        }

        if ((progress < 1) && !this.gl.isContextLost()) {
            // Continue rendering if transition hasn't completed
            this.animationFrame = requestAnimationFrame(() => this.renderOff(transitionTime));
        } else {
            // Only hide the canvas when transition is complete
            this.canvas.style.display = 'none';

            // Clean up the captured starting position
            this.renderOffStartPos = null;

            console.log('🔄 Animation ended - display states changed:');
            console.log('📊 Canvas state:', {
                display: this.canvas.style.display,
                position: this.canvas.style.position,
                zIndex: this.canvas.style.zIndex
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
            // Only show the canvas
            this.canvas.style.display = 'block';
            console.log('🚀 Animation started - display states changed:');
            console.log('📊 Canvas state:', {
                display: this.canvas.style.display,
                position: this.canvas.style.position,
                zIndex: this.canvas.style.zIndex
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

        this.startTime = Date.now() / 1000; // Start transition timer
        this.animationFrame = requestAnimationFrame(() => this.renderOff(actualTransitionTime));
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
     * @param {number} animationIndex - Index of the animation to use (0 = Zoom In, 1 = Ken Burns)
     */
    setAnimation(animationIndex) {
        if (this.animations && animationIndex >= 0 && animationIndex < this.animations.length) {
            this.currentAnimation = this.animations[animationIndex];
            console.log(`Animation changed to: ${this.currentAnimation.name} (index ${animationIndex})`);
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
     * Static method to get animation names from any active instance
     * @returns {Object[]} Array of animation objects with name and index
     */
    static getAvailableAnimations() {
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

        // Fallback: return default animation structure if no instances are loaded
        return [
            { name: "Zoom In", index: 0, type: "harmonic", duration: 4.0 },
            { name: "Ken Burns", index: 1, type: "harmonic", duration: 4.0 }
        ];
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