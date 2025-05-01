# Renderers Module Documentation

## Overview

The `Renderers` module provides WebGL-based rendering for **Leia Image Format (LIF)** files. It processes **multi-view, depth-aware images** and renders them using custom WebGL shaders. The module supports both **mono and stereo rendering**, making it compatible with Leia's **glasses-free 3D displays**.

This module works in conjunction with the `LifLoader` module to extract and display **LIF images** in a WebGL canvas.

---

## Base Class: `BaseRenderer`

### Constructor

```javascript
constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null)
```

Initializes a renderer with WebGL context, shader programs, and extracted **LIF views**.

**Parameters:**

- `gl` (`WebGLRenderingContext`): The WebGL context for rendering.
- `fragmentShaderSource` (`string`): GLSL fragment shader source code.
- `views` (`Object`): Extracted views from a LIF file.
- `debug` (`boolean`, optional): Enables debug rendering.
- `limitSize` (`number|null`, optional): Maximum size in pixels for image textures. When set, images will be downsampled while preserving aspect ratio. Use smaller values for better performance, especially in VR.

### Image Size Limiting

When the `limitSize` parameter is set to a numeric value, all loaded images will be automatically downsampled to have their maximum dimension (width or height) not exceed this limit. This feature helps:

- Improve rendering performance, especially on mobile devices or in VR
- Reduce GPU memory usage
- Prevent WebGL texture size limitations on some devices

The aspect ratio of all images is preserved during downsampling.

Recommended values:
- For non-VR desktop: 2560-3840
- For VR: 1024-1920
- For mobile: 1024-2048

### Methods

#### `async _processViews(views: Object)`

Processes and standardizes views by replacing deprecated keys and loading textures.

#### `replaceKeys(obj: Object, oldKeys: Array, newKeys: Array): Object`

Recursively replaces outdated keys in LIF metadata.

#### `static async createInstance(gl, fragmentShaderUrl, views, debug = false, limitSize = null): Promise<BaseRenderer>`

Asynchronously loads the fragment shader and creates a new renderer instance.

#### `drawScene()`

Abstract method for rendering a scene. Must be implemented in derived classes.

#### `debugTexture(imgData)`

Displays a texture in an HTML image element for debugging purposes.

---

## Derived Classes

### `MN2MNRenderer`

**Mono-to-Mono Renderer** – Processes and renders a single LIF view using WebGL.

#### Constructor

```javascript
constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null)
```

#### `drawScene()`

Renders a **mono image** using depth-based synthesis.

---

### `ST2MNRenderer`

**Stereo-to-Mono Renderer** – Converts stereo LIF data into a **single monoscopic** view.

#### Constructor

```javascript
constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null)
```

#### `drawScene()`

Renders a **stereo image** into a monoscopic output.

---

### `MN2STRenderer`

**Mono-to-Stereo Renderer** – Converts a single LIF view into a **stereo 3D image**.

#### Constructor

```javascript
constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null)
```

#### `drawScene()`

Generates **stereo output** from a **mono depth** source.

---

### `ST2STRenderer`

**Stereo-to-Stereo Renderer** – Processes **stereo LIF views** and renders stereo output.

#### Constructor

```javascript
constructor(gl, fragmentShaderSource, views, debug = false, limitSize = null)
```

#### `drawScene()`

Maintains **stereo input-output** rendering.

---

## WebGL Utilities

### `static createProgram(gl, vsSource, fsSource): WebGLProgram`

Creates a **WebGL shader program** from vertex and fragment shaders.

### `static createShader(gl, type, source): WebGLShader`

Compiles a shader from GLSL source code.

### `static setupCommonBuffers(gl): Object`

Creates WebGL buffers for rendering a **full-screen quad**.

### `static createBuffer(gl, target, data, usage = gl.STATIC_DRAW): WebGLBuffer`

Creates and initializes a **WebGL buffer**.

---

## Usage Example

```javascript
const gl = document.getElementById('glCanvas').getContext('webgl');
const loader = new LifLoader();
await loader.load(file);
const views = loader.views;

// Create a renderer with image size limiting for better performance
const renderer = await MN2MNRenderer.createInstance(gl, '../Shaders/rayCastMonoLDI.glsl', views, false, 2048);
requestAnimationFrame(() => renderer.drawScene());
```

---

## Dependencies

- `LifLoader.js`: Parses LIF files to extract **views, images, and depth maps**.
- `WebGL Shaders`: GLSL fragment shaders for rendering.

---

## Performance Considerations

- For optimal performance, especially in VR, use the `limitSize` parameter to downsample large images
- Different target devices may require different `limitSize` values
- Supports **multi-layered depth maps** for **de-occlusion handling**
- Optimized for **Leia's 3D display technology**