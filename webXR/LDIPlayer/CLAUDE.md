# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WebXR application for viewing LDI (Layered Depth Image) videos with 2 layers and real-time view synthesis for stereoscopic 3D playback. The core technology is a custom GLSL shader that performs ray casting against depth maps to synthesize novel viewpoints, with threshold-based alpha compositing for layer separation.

### Key Technologies
- **THREE.js v0.173.0**: 3D rendering engine (loaded via CDN importmap)
- **WebXR**: VR headset integration
- **GLSL**: Custom view synthesis shader (ray casting 2-layer LDI algorithm)
- **No build system**: Pure ES6 modules, runs directly in browser

## Development

### Running the Application
```bash
# Serve locally (use any static server)
python3 -m http.server 8000
# or
npx serve
```

Open `http://localhost:8000/index.html` in a WebXR-compatible browser.

### File Structure
- `index.html` - Main HTML with UI panels and video element
- `index.js` - Application logic, Three.js scene setup, WebXR integration
- `rayCastMonoLDI_fragment.glsl` - View synthesis shader (loaded at runtime)
- `default-LDI.mp4` - Default 2-layer LDI video
- `default-LDI.json` - Companion JSON with frame rate and per-frame thresholds

## Architecture

### Video Format
LDI videos are **quad layout format**:
- **Top-left quadrant**: Layer 0 RGB color image
- **Top-right quadrant**: Layer 0 disparity map (grayscale, 0-255)
- **Bottom-left quadrant**: Layer 1 RGB color image
- **Bottom-right quadrant**: Layer 1 disparity map (grayscale, 0-255)

### Texture Coordinate System (IMPORTANT)
**WebGL/OpenGL uses bottom-left origin** for texture coordinates, which differs from typical video file formats:
- In **video files**: origin (0,0) is at **top-left**, Y increases downward
- In **WebGL textures**: origin (0,0) is at **bottom-left**, Y increases upward

This means the video file layout is **vertically flipped** in texture space:

**Video File Layout (as viewed in video player):**
```
┌──────────┬──────────┐
│ Layer 0  │ Layer 0  │  ← Top half (y: 0.0-0.5 in file)
│   RGB    │  Disparity│
├──────────┼──────────┤
│ Layer 1  │ Layer 1  │  ← Bottom half (y: 0.5-1.0 in file)
│   RGB    │ Disparity │
└──────────┴──────────┘
```

**WebGL Texture Space (what shader sees):**
```
┌──────────┬──────────┐
│ Layer 0  │ Layer 0  │  ← Upper half (y: 0.5-1.0 in texture)
│   RGB    │  Disparity│
├──────────┼──────────┤
│ Layer 1  │ Layer 1  │  ← Lower half (y: 0.0-0.5 in texture)
│   RGB    │ Disparity │
└──────────┴──────────┘
```

**Correct texture sampling coordinates:**
- Layer 0 RGB: `vec2(uv.x * 0.5, uv.y * 0.5 + 0.5)` (top-left → upper-left in texture)
- Layer 0 Disparity: `vec2(0.5 + uv.x * 0.5, uv.y * 0.5 + 0.5)` (top-right → upper-right in texture)
- Layer 1 RGB: `vec2(uv.x * 0.5, uv.y * 0.5)` (bottom-left → lower-left in texture)
- Layer 1 Disparity: `vec2(0.5 + uv.x * 0.5, uv.y * 0.5)` (bottom-right → lower-right in texture)

### Companion JSON Format
Each LDI video requires a companion JSON file with the same base name (e.g., `video.mp4` → `video.json`):
```json
{
  "frame_rate": 23.976,
  "thresholds": [0.678, 0.678, ...]
}
```
- `frame_rate`: Video frame rate (number)
- `thresholds`: Array of threshold values, one per frame (number[])
- Threshold controls layer 0 alpha: pixels with disparity < threshold are transparent (alpha=0), otherwise opaque (alpha=1)

### Rendering Pipeline

#### Non-VR Mode
- Single full-screen plane displaying layer 0 RGB (top-left quadrant only)
- No view synthesis in non-VR mode - just displays the base layer
- UI overlay visible

#### VR Mode
- Two overlapping planes, one per eye using Three.js layers (layer 1 = left eye, layer 2 = right eye)
- Each plane gets independent shader material instance with different uniforms
- Shader performs ray casting to synthesize correct viewpoint for each eye
- 2-layer compositing with threshold-based alpha
- HUD overlay in VR showing real-time parameters (distance, focal, IPD, layer depths, threshold, frame)
- UI overlay hidden

### View Synthesis Shader (rayCastMonoLDI_fragment.glsl)

The shader implements a **2-layer ray casting algorithm** with threshold-based compositing:

1. **Ray marching**: Steps through inverse depth values (invZ) from `invZmin` to `invZmax`
2. **Depth comparison**: At each step, compares ray depth to sampled disparity from depth map
3. **Surface detection**: When ray intersects surface (ray depth > sampled depth), refines position
4. **Color sampling**: Samples RGB from corresponding texture coordinates
5. **Layer 0 alpha**: Apply threshold-based alpha (disparity >= threshold ? 1.0 : 0.0)
6. **Layer compositing**: Composite layer 1 behind layer 0 using premultiplied alpha blending

Key uniforms:
- `uRGBD`: Single texture containing quad layout (TL=L0 RGB, TR=L0 disp, BL=L1 RGB, BR=L1 disp)
- `uThreshold`: Per-frame threshold for layer 0 transparency (updated each frame from JSON)
- `invZmin[4]`: Controls depth effect intensity per layer (layer 0 and layer 1 independently adjustable)
- `invZmax[4]`: Maximum inverse depth per layer
- `f1[4]`: Focal length per layer in pixels
- `f2`: Focal length for output view in pixels
- `uViewPosition`, `uFacePosition`: Camera positions in normalized space
- `sk1/sk2, sl1/sl2, roll1/roll2`: Camera intrinsic parameters (skew, slant, roll)
- `oRes`: Output viewport resolution
- `iRes[4]`: Input texture resolution per layer (each layer is half video dimensions)
- `feathering`: Edge transition smoothing (0.05)
- `uNumLayers`: Set to 2 for LDI mode

The shader performs **2-layer LDI compositing** where layer 0 (front) has threshold-controlled transparency, revealing layer 1 (back) where needed.

### VR Controller Mapping

**Left Controller**:
- Thumbstick Y-axis: Layer 0 `invZmin` (depth effect)
- Trigger: Decrease screen distance (move screen closer)
- Grip/Squeeze: Decrease layer 1 `invZmin`
- X button: Exit VR session

**Right Controller**:
- Thumbstick Y-axis: Focal length (0.5x - 2x, log scale)
- Trigger: Increase screen distance (move screen farther)
- Grip/Squeeze: Increase layer 1 `invZmin`
- A button: Play/pause video
- B button: Toggle HUD

**Hand Tracking (if enabled)**:
- Left hand pinch-drag horizontal: Control layer 0 invZmin
- Left hand double pinch-tap: Exit VR
- Right hand pinch-drag horizontal: Control focal length
- Right hand pinch-tap: Play/pause

### Key Parameters

- `screenDistance`: Distance from viewer to virtual screen (default 100m, adjustable 1-100m)
- `focal`: Focal length as fraction of image width (default 0.78 = 28mm equiv, range 0.5-2.0)
- `diopters`: 1/screenDistance
- `invZmin`: Layer 0 depth effect control (default 0.05, range 0.01-0.1)
- `invZminLayer2`: Layer 1 depth effect control (default 0.05, range 0.01-0.1)
- `ipd`: Interpupillary distance, measured from XR cameras (default 0.063m, clamped 0.035-0.085m)
- `currentThreshold`: Current frame's threshold value (from JSON, updated each frame)
- `feathering`: Edge transition smoothing (default 0.05)

### Screen Sizing
- `screenWidth = viewportScale * screenDistance / focal`
- `screenHeight = screenWidth / aspect` where `aspect = layerWidth / layerHeight`
- Each layer dimensions: `layerWidth = videoWidth / 2`, `layerHeight = videoHeight / 2`
- Planes positioned at (0, initialY, -screenDistance) in world space
- `initialY` is measured from XR camera when first entering VR (user's eye height)

### Stereo Calculations (updateStereoPlanes)

For each eye:
1. Extract camera position from WebXR camera array
2. Normalize face position: `facePosX = cam.x / ipd`, `facePosY = (1.6 - cam.y) / ipd`, `facePosZ = -cam.z / ipd`
3. Calculate inverse diopter: `invd = ipd / screenDistance`
4. Calculate skew: `sk2.x = -facePosX * invd / (1.0 - facePosZ * invd)`
5. Calculate effective focal: `f2 = screenDistance * (1.0 - facePosZ * invd)`
6. Pass to shader uniforms

### HUD System
- 512x256 canvas texture overlay
- Shows: Distance, Focal (mm), IPD (mm), Layer 0 invZmin, Layer 1 invZmin, Frame index, Current threshold, InitialY, Status (Playing/Paused), Controls
- Positioned at top-left of each plane
- Togglable via B button (right controller)

## Common Tasks

### Adding New Controls
1. Add uniform to shader material in `createViewSynthesisMaterial()`
2. Implement input handling in `handleControllerInput()`
3. Update shader uniforms in `updateStereoPlanes()`
4. Update HUD display in `updateHUD()`

### Modifying Shader
The shader is loaded at runtime from `rayCastMonoLDI_fragment.glsl` via `loadShader()` function. After modifying the shader, refresh the browser to reload.

### Video Loading
- Default video loaded in `init()`: `loadVideoSource('default-LDI.mp4')`
- Companion JSON automatically loaded: `loadThresholdsJSON('default-LDI.mp4')` → `default-LDI.json`
- Drag-and-drop and file input handled by `setupFileHandling()`
- Video metadata extracted on `loadedmetadata` event
- JSON validation: checks structure, frame rate, threshold count vs video duration
- Error handling: displays error and prevents playback if JSON invalid/missing
- Creates `THREE.VideoTexture` with sRGB encoding
- Frame tracking: `getCurrentFrameIndex()` computes current frame from `video.currentTime * frame_rate`
- Threshold update: `updateThresholdForCurrentFrame()` called each animation frame

### IPD Tracking
- `updateIPD()` measures IPD from WebXR camera positions each frame
- Clamped to physiologically realistic range (35-85mm)
- Falls back to 63mm default if measurement out of range

## Important Notes

- **No build process**: Direct ES6 module loading from CDN
- **WebGL context**: Uses `THREE.sRGBEncoding` (deprecated in newer Three.js but still works)
- **Performance**: Ray casting shader runs at 40 steps per layer, may impact performance on high-res videos
- **Browser compatibility**: Requires WebXR Device API support for VR mode
- **Video codec**: H.264 MP4 recommended for broad compatibility
- **LDI format**: Quad layout with 2 layers (top-left/right = layer 0, bottom-left/right = layer 1)
- **JSON requirement**: Companion JSON file with matching base name is mandatory for playback
- **Threshold format**: JSON must have `frame_rate` (number) and `thresholds` (number array)
- **Layer aspect**: Each layer is half the video dimensions (width/2 × height/2)
