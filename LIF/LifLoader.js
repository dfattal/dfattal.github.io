// LifLoader.js

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

export class LifLoader {
  async load(file) {
    const arrayBuffer = await file.arrayBuffer();
    const metadata = await this.parseBinary(arrayBuffer);
    const lifJson = metadata.getJsonMeta();

    // Replace keys for consistency.
    let result = this.replaceKeys(
      lifJson,
      ['albedo', 'disparity', 'inv_z_dist', 'max_disparity', 'min_disparity', 'inv_z_dist_min', 'inv_z_dist_max'],
      ['image', 'inv_z_map', 'inv_z_map', 'max', 'min', 'max', 'min']
    );

    await this.processViews(result, metadata, arrayBuffer);

    return {
      views: this.replaceKeys(
        result.views,
        ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom', 'frustum_skew', 'rotation_slant', 'render_data'],
        ['width', 'height', 'f', 'invZ', 'layers', 'sk', 'sl', 'stereo_render_data']
      ),
      stereo_render_data: result.stereo_render_data
    };
  }

  async parseBinary(arrayBuffer) {
    const fullSize = arrayBuffer.byteLength;
    const stream = new BinaryStream(arrayBuffer);
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
        const updatedKey = (index !== -1) ? newKeys[index] : key;
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

  async processViews(result, metadata, arrayBuffer) {
    if (!result.views) return;

    const makeUrls = (obj) => {
      if (obj.image) {
        if (obj.image.blob_id === -1) {
          const rgbBlob = new Blob([arrayBuffer], { type: 'image/jpeg' });
          obj.image.url = this.handleBlob(rgbBlob);
        } else {
          const rgbBlob = metadata.getFieldByType(obj.image.blob_id).toBlob();
          obj.image.url = this.handleBlob(rgbBlob);
        }
      }
      if (obj.inv_z_map) {
        const invZBlob = metadata.getFieldByType(obj.inv_z_map.blob_id).toBlob();
        obj.inv_z_map.url = this.handleBlob(invZBlob);
      }
      if (obj.mask) {
        const maskBlob = metadata.getFieldByType(obj.mask.blob_id).toBlob();
        obj.mask.url = this.handleBlob(maskBlob);
      }
    };

    for (const view of result.views) {
      makeUrls(view);

      // Legacy handling for LIF versions prior to 5.3.
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
  }
}