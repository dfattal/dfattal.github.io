
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
        result.outpaintWidth = view.layered_depth_image_data.outpainting_added_width_px;
    }
    return result;
}
