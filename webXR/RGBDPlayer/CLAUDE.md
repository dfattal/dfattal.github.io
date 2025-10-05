# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WebXR application for viewing RGBD videos (RGB + Depth/Disparity) with real-time view synthesis for stereoscopic 3D playback. The core technology is a custom GLSL shader that performs ray casting against depth maps to synthesize novel viewpoints.

### Key Technologies
- **THREE.js v0.173.0**: 3D rendering engine (loaded via CDN importmap)
- **WebXR**: VR headset integration
- **GLSL**: Custom view synthesis shader (ray casting mono LDI algorithm)
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
- `rayCastMonoLDI.glsl` - View synthesis shader (also embedded in index.js)
- `default_rgbd.mp4` - Default RGBD video (6.8MB)
- `PLAN.md` - Product requirements and execution plan

## Architecture

### Video Format
RGBD videos are **side-by-side format**:
- **Left half**: RGB color image
- **Right half**: Depth/disparity map (grayscale, 0-255)

Video texture coordinates:
- RGB sampling: `vec2(uv.x * 0.5, uv.y)` (left half)
- Depth sampling: `vec2(0.5 + uv.x * 0.5, uv.y)` (right half)

### Rendering Pipeline

#### Non-VR Mode
- Single full-screen plane with shader material
- Shader outputs anaglyph (red/cyan) 3D image
- UI overlay visible

#### VR Mode
- Two overlapping planes, one per eye using Three.js layers (layer 1 = left eye, layer 2 = right eye)
- Each plane gets independent shader material instance with different uniforms
- Shader performs ray casting to synthesize correct viewpoint for each eye
- HUD overlay in VR showing real-time parameters
- UI overlay hidden

### View Synthesis Shader (rayCastMonoLDI.glsl)

The shader implements a **ray casting algorithm** against depth maps:

1. **Ray marching**: Steps through inverse depth values (invZ) from `invZmin` to `invZmax`
2. **Depth comparison**: At each step, compares ray depth to sampled disparity from depth map
3. **Surface detection**: When ray intersects surface (ray depth > sampled depth), refines position
4. **Color sampling**: Samples RGB from corresponding texture coordinates

Key uniforms:
- `invZmin[4]`: Controls depth effect intensity (adjustable via triggers)
- `f1[4]`: Focal length per layer in pixels
- `f2`: Focal length for output view in pixels
- `uViewPosition`, `uFacePosition`: Camera positions in normalized space
- `sk1/sk2, sl1/sl2, roll1/roll2`: Camera intrinsic parameters (skew, slant, roll)
- `oRes`: Output viewport resolution
- `iRes[4]`: Input texture resolution per layer
- `feathering`: Edge transition smoothing (0.01)

The shader supports **multi-layer LDI** (Layered Depth Images) with up to 4 layers for handling occlusions.

### VR Controller Mapping

**Left Controller**:
- Thumbstick Y-axis: Screen distance (1m - 100m)
- Trigger: Decrease `invZmin` (less depth)
- Grip/Squeeze: Toggle HUD

**Right Controller**:
- Thumbstick Y-axis: Focal length (0.5x - 2x, log scale)
- Trigger: Increase `invZmin` (more depth)
- A button (index 3): Exit VR session
- B button (index 4): Play/pause video

### Key Parameters

- `screenDistance`: Distance from viewer to virtual screen (default 10m, adjustable 1-100m)
- `focal`: Focal length as fraction of image width (default 1.0 = 36mm equiv, range 0.5-2.0)
- `diopters`: 1/screenDistance
- `invZmin`: Depth effect control (default 0.05, range 0-0.1)
- `ipd`: Interpupillary distance, measured from XR cameras (default 0.063m, clamped 0.035-0.085m)

### Screen Sizing
- `screenWidth = focal * screenDistance`
- `screenHeight = screenWidth / aspect` where `aspect = (videoWidth/2) / videoHeight`
- Planes positioned at (0, 1.6, -screenDistance) in world space

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
- Shows: Distance, Focal (mm), IPD (mm), invZmin, Status (Playing/Paused), Controls
- Positioned at top-left of each plane
- Togglable via grip button

## Common Tasks

### Adding New Controls
1. Add uniform to shader material in `createViewSynthesisMaterial()`
2. Implement input handling in `handleControllerInput()`
3. Update shader uniforms in `updateStereoPlanes()`
4. Update HUD display in `updateHUD()`

### Modifying Shader
The shader is defined **twice**: embedded in `index.js` as `rayCastMonoLDIGlsl` constant AND in standalone `rayCastMonoLDI.glsl`. The embedded version is the one actually used. Keep them in sync or remove the standalone file.

### Video Loading
- Default video loaded in `init()`: `loadVideoSource('default_rgbd.mp4')`
- Drag-and-drop and file input handled by `setupFileHandling()`
- Video metadata extracted on `loadedmetadata` event
- Creates `THREE.VideoTexture` with sRGB encoding

### IPD Tracking
- `updateIPD()` measures IPD from WebXR camera positions each frame
- Clamped to physiologically realistic range (35-85mm)
- Falls back to 63mm default if measurement out of range

## Important Notes

- **No build process**: Direct ES6 module loading from CDN
- **WebGL context**: Uses `THREE.sRGBEncoding` (deprecated in newer Three.js but still works)
- **Performance**: Ray casting shader runs at 40 steps, may impact performance on high-res videos
- **Browser compatibility**: Requires WebXR Device API support for VR mode
- **Video codec**: H.264 MP4 recommended for broad compatibility
