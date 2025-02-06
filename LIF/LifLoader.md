# LifLoader Module Documentation

## Overview

The `LifLoader` module provides functionality to parse and extract metadata, images, and depth maps from **Leia Image Format (LIF)** files. The LIF format is an extension of standard JPEGs that stores multiple views, depth maps, and camera intrinsics for rendering **stereo or multi-view** images.

This module is a crucial part of the **Leia WebGL rendering pipeline**, allowing WebGL renderers to synthesize **multi-view imagery** for glasses-free 3D displays.

---

## Class: `LifLoader`

### Constructor
```javascript
constructor()
```
Initializes an empty `LifLoader` instance. The instance will store loaded metadata and extracted images.

### Methods

#### `async load(file: File): Promise<Object>`
Loads and processes a LIF file, extracting metadata, images, and stereo rendering data.

**Parameters:**
- `file` (`File`): A LIF file to be loaded.

**Returns:**
- An object containing:
  - `views` (`Array`): Extracted views from the LIF file.
  - `stereo_render_data` (`Object`): Suggested stereo rendering parameters.

**Usage:**
```javascript
const loader = new LifLoader();
await loader.load(file);
console.log(loader.views, loader.stereo_render_data);
```

#### `getViews(): Array`
Returns the loaded views extracted from the LIF file.

**Throws:**
- `Error` if `load()` has not been called.

#### `getStereoRenderData(): Object`
Returns stereo rendering parameters for WebGL-based stereo synthesis.

**Throws:**
- `Error` if `load()` has not been called.

#### `getAnimations(): Object`
Returns animation data from the LIF file if present.

**Throws:**
- `Error` if `load()` has not been called.

---

## Internal Methods

### `_parseBinary(arrayBuffer: ArrayBuffer): Metadata`
Parses the LIF binary file format, extracting metadata fields and image data.

### `replaceKeys(obj: Object, oldKeys: Array, newKeys: Array): Object`
Replaces deprecated JSON keys with their updated names.

### `async _processViews(result: Object, metadata: Metadata, arrayBuffer: ArrayBuffer): Promise<Array>`
Processes view data, converting image and depth maps into WebGL-compatible formats.

### `async getImageDimensions(url: string): Promise<{width: number, height: number}>`
Loads an image and extracts its dimensions.

---

## Usage Example

```javascript
const filePicker = document.getElementById('filePicker');
const loader = new LifLoader();

filePicker.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        await loader.load(file);
        console.log('Views:', loader.getViews());
    }
});
```

---

## Dependencies
- **BinaryStream**: Reads binary data from the LIF file.
- **Metadata & Field**: Structures for parsing metadata from LIF files.

---

## Notes
- Supports **LIF 5.3** format, including multiple views and preset camera motion paths.
- Integrates with **WebGL Renderers** (see `Renderers.js`).

