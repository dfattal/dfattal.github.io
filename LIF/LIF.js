
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