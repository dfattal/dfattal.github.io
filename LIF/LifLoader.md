# LifLoader Module Documentation

## Overview

The `LifLoader` module is an ES module that provides a class for loading and parsing LIF (Leia Image Format) files. LIF files are essentially JPEG images augmented with metadata containing multiple views, depth maps, camera data, and layer information. This module handles all the low-level parsing and processing needed to extract a properly formatted `views` array and `stereo_render_data` structure.

## Module Structure

The module exports the `LifLoader` class from `LifLoader.js`, which includes:

- **Binary Parsing:**  
  Uses helper classes (`BinaryStream`, `Field`, and `Metadata`) to read and interpret binary data.

- **Metadata Extraction:**  
  Retrieves the JSON metadata from the LIF file.

- **Key Replacement:**  
  Standardizes key names for easier access to the data.

- **View Processing:**  
  For each view, creates blob URLs for images, depth maps, and masks, handling legacy fields and additional layer data for occlusion correction.

## How to Use

### Setup

1. **Project Structure:**  
   Ensure your project includes `LifLoader.js` and a main script (e.g., `main.js`).

2. **ES Module Environment:**  
   The module uses ES module syntax, so your project should support it (e.g., via a modern browser or a bundler like Webpack).

### main.js Example

Below is an example `main.js` snippet that demonstrates how to import and use the `LifLoader` class:

```js
// main.js

import { LifLoader } from './LifLoader.js';

document.addEventListener('DOMContentLoaded', () => {
  const filePicker = document.getElementById('filePicker');
  
  filePicker.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const loader = new LifLoader();
        const { views, stereo_render_data } = await loader.load(file);
        console.log('Views:', views);
        console.log('Stereo Render Data:', stereo_render_data);
        // Pass the views and stereo_render_data to your rendering pipeline.
      } catch (error) {
        console.error('Error loading LIF:', error);
      }
    }
  });
});