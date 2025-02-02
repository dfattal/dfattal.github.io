# Renderers.js Module Documentation

This module provides a set of reusable WebGL renderer classes for different input/output modes. The module exports four renderer classes, each designed to handle one of the following scenarios:

- **MN2MNRenderer**: Mono input → Mono output  
- **ST2MNRenderer**: Stereo input → Mono output  
- **MN2STRenderer**: Mono input → Stereo output  
- **ST2STRenderer**: Stereo input → Stereo output

All these classes extend the common **BaseRenderer** class, which provides shared functionality such as shader creation, program linking, common buffer setup, and attribute binding.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
    - [Importing the Module](#importing-the-module)
    - [BaseRenderer and Default Shaders](#baserenderer-and-default-shaders)
    - [Renderer Classes](#renderer-classes)
        - [MN2MNRenderer](#mn2mnrenderer)
        - [ST2MNRenderer](#st2mnrenderer)
        - [MN2STRenderer](#mn2strenderer)
        - [ST2STRenderer](#st2strenderer)
- [API Reference](#api-reference)
- [License](#license)

## Overview

The module is designed to allow you to easily set up and reuse WebGL renderers for various stereo and mono rendering scenarios. Each renderer class encapsulates:
- Creation of the WebGL shader program.
- Retrieval of attribute and uniform locations.
- Setup of common vertex, texture coordinate, and index buffers.
- A `drawScene()` method to bind textures, set uniforms, and issue the draw call.

Additionally, the **BaseRenderer** class contains a static async factory method to load a fragment shader from a given URL (with cache busting) and use a default vertex shader if none is provided.

## Installation

Place the `Renderer.js` file in your project (for example, in a `src/` or `lib/` folder). Ensure your project supports ES modules (or use a bundler like Webpack).

## Usage

### Importing the Module

In your application code, import the renderer classes as follows:

```js
import {
    MN2MNRenderer,
    ST2MNRenderer,
    MN2STRenderer,
    ST2STRenderer
} from "./Renderer.js";
```

### BaseRenderer and Default Shaders

The BaseRenderer class automatically uses a default vertex shader if one isn’t provided. Additionally, you can use its static async factory method to load a fragment shader from a URL with cache busting:

```js
import { BaseRenderer } from "./Renderer.js";

(async function() {
    const canvas = document.getElementById("glCanvas");
    const gl = canvas.getContext("webgl");
    if (!gl) {
        console.error("WebGL not supported!");
        return;
    }
    // Load default fragment shader from URL:
    const fragmentShaderUrl = "path/to/defaultFragmentShader.glsl";
    const renderer = await BaseRenderer.createInstance(gl, fragmentShaderUrl);
    // Use the renderer instance as needed...
})();
```

### Renderer Classes

#### MN2MNRenderer
- **Description**: For mono input and mono output. This renderer uses uniforms such as `uNumLayers`, `invZmin`, `uViewPosition`, etc. and binds textures from a single view.
- **Usage Example**:

```js
const renderer = new MN2MNRenderer(gl, vertexShaderSource, fragmentShaderSource);
const views = [{
    position: { x: 0, y: 0, z: 0 },
    sk: { x: 0, y: 0 },
    rotation: { sl: { x: 0, y: 0 }, roll_degrees: 0 },
    layers: [
        {
            f: 700,
            invZ: { min: 0.5, max: 2.0, texture: someTexture1 },
            image: { texture: someTexture2 },
            width: 800,
            height: 600
        }
    ]
}];
const renderCam = {
    pos: { x: 0, y: 0, z: 0 },
    sk: { x: 0, y: 0 },
    sl: { x: 0, y: 0 },
    roll: 0,
    f: 600
};
function renderLoop() {
    renderer.drawScene(views, renderCam);
    requestAnimationFrame(renderLoop);
}
renderLoop();
```

#### ST2MNRenderer
- **Description**: For stereo input (left & right views) and mono output. The renderer binds textures and uniforms from both left and right views, but produces a mono output.
- **Usage Example**:

```js
const renderer = new ST2MNRenderer(gl, vertexShaderSource, fragmentShaderSource);
const views = [
    { // Left view
        position: { x: 0, y: 0, z: 0 },
        sk: { x: 0, y: 0 },
        rotation: { sl: { x: 0, y: 0 }, roll_degrees: 0 },
        layers: [ /* ... left view layers ... */ ]
    },
    { // Right view
        position: { x: 0, y: 0, z: 0 },
        sk: { x: 0, y: 0 },
        rotation: { sl: { x: 0, y: 0 }, roll_degrees: 0 },
        layers: [ /* ... right view layers ... */ ]
    }
];
const renderCam = { pos: { x: 0, y: 0, z: 0 }, sk: { x: 0, y: 0 }, sl: { x: 0, y: 0 }, roll: 0, f: 50 };
function renderLoop() {
    renderer.drawScene(views, renderCam);
    requestAnimationFrame(renderLoop);
}
renderLoop();
```

#### MN2STRenderer
- **Description**: For mono input and stereo output. This renderer uses a mono input view and then produces separate stereo outputs using two sets of rendering camera parameters (left and right).
- **Usage Example**:

```js
const renderer = new MN2STRenderer(gl, vertexShaderSource, fragmentShaderSource);
const views = [{
    position: { x: 0, y: 0, z: 0 },
    sk: { x: 0, y: 0 },
    rotation: { sl: { x: 0, y: 0 }, roll_degrees: 0 },
    layers: [ /* mono input layers */ ]
}];
const renderCamL = { pos: { x: 0, y: 0, z: 0 }, sk: { x: 0, y: 0 }, sl: { x: 0, y: 0 }, roll: 0, f: 50 };
const renderCamR = { pos: { x: 0, y: 0, z: 0 }, sk: { x: 0, y: 0 }, sl: { x: 0, y: 0 }, roll: 0, f: 50 };
function renderLoop() {
    renderer.drawScene(views, renderCamL, renderCamR);
    requestAnimationFrame(renderLoop);
}
renderLoop();
```

#### ST2STRenderer
- **Description**: For stereo input and stereo output. This renderer expects two input views (left and right) and renders with separate stereo camera parameters.
- **Usage Example**:

```js
const renderer = new ST2STRenderer(gl, vertexShaderSource, fragmentShaderSource);
const views = [
    { // Left view
        position: { x: 0, y: 0, z: 0 },
        sk: { x: 0, y: 0 },
        rotation: { sl: { x: 0, y: 0 }, roll_degrees: 0 },
        layers: [ /* left view layers */ ]
    },
    { // Right view
        position: { x: 0, y: 0, z: 0 },
        sk: { x: 0, y: 0 },
        rotation: { sl: { x: 0, y: 0 }, roll_degrees: 0 },
        layers: [ /* right view layers */ ]
    }
];
const renderCamL = { pos: { x: 0, y: 0, z: 0 }, sk: { x: 0, y: 0 }, sl: { x: 0, y: 0 }, roll: 0, f: 50 };
const renderCamR = { pos: { x: 0, y: 0, z: 0 }, sk: { x: 0, y: 0 }, sl: { x: 0, y: 0 }, roll: 0, f: 50 };
function renderLoop() {
    renderer.drawScene(views, renderCamL, renderCamR);
    requestAnimationFrame(renderLoop);
}
renderLoop();
```

## API Reference

### BaseRenderer
- **Constructor**:
    ```js
    new BaseRenderer(gl, vertexShaderSource, fragmentShaderSource)
    ```
    If `vertexShaderSource` is omitted, a default basic vertex shader is used.
- **Static Methods**:
    - `createShader(gl, type, source)`
    - `createProgram(gl, vsSource, fsSource)`
    - `createBuffer(gl, target, data, usage)`
    - `setupCommonBuffers(gl)`
    - `createInstance(gl, fragmentShaderUrl, vertexShaderSource?)` (async factory method)
- **Instance Methods**:
    - `bindAttributes()`
    - `drawScene()` (abstract; implemented by subclasses)

### Renderer Subclasses

Each subclass implements its own `drawScene()` method. The parameters typically are:
- For mono renderers: `(views, renderCam)`
- For stereo renderers: `(views, renderCamL, renderCamR)`

## License

MIT License

Copyright (c) [2025] [LEIA INC]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.