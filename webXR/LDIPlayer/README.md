# WebXR RGBD Video Player

A WebXR application for viewing RGBD videos (RGB color on the left, depth/disparity map on the right) using a real-time view synthesis shader to create a stereoscopic 3D effect with proper infinity mapping for full immersive VR.

## Content Requirements

### IMPORTANT: Expected Video Format
This player expects **full-width side-by-side stereo RGBD content** with the following properties:

- **Left half**: RGB color image
- **Right half**: Depth/disparity map
- **Convergence**: Content must be converged at infinity (parallel cameras)
  - This means distant objects appear at the same horizontal position in both left and right views
  - The player automatically maps infinity image points to XR space infinity for a fully immersive feel
- **Camera FOV**: For proper object scale and "fullness" sensation, the viewing angle should match the recording camera's field of view
  - **Default**: 36mm equivalent lens (1.0x focal multiplier)
  - Adjustable via controls to match your source content
  - Common settings: 26mm (wide), 36mm (normal), 50mm (portrait)

### Why FOV Matching Matters
When the virtual focal length matches the recording camera's FOV:
- Objects, persons, and scenes appear with correct proportions
- Depth perception feels natural and immersive
- You get a sensation of "fullness" - objects have proper volume and presence
- The 3D effect is comfortable and realistic

## Features

### Non-VR Mode (Desktop/Mobile)
- **RGB Channel Display**: View the RGB part of the RGBD input video
- **Drag & Drop Support**: Easy video file loading
- **Video Information**: Real-time display of video dimensions and frame rate

### VR Mode (WebXR Headsets)
- **Real-time View Synthesis**: Custom shader generates left and right eye views from RGBD source
- **Infinity Mapping**: Automatically maps infinity points to XR space infinity for true immersion
- **Adjustable Depth Effect (`invZmin`)**: Control the overall depth/3D intensity (0.01 to 0.1)
- **Adjustable Screen Distance**: 1m to 100m range for comfortable viewing
- **Adjustable Focal Length**: 0.5x to 2x range (18mm to 72mm equivalent) to match source camera FOV
- **Transparent Gradients**: Optional feature to make high-gradient regions transparent
- **Spatial Audio**: Video sound enabled in VR mode
- **Real-time HUD**: Displays all current settings and initial headset height
- **Dual Input Support**: Both VR controllers and hand tracking (Apple Vision Pro, Meta Quest Pro/3)

## Requirements

### Browser Support
- **VR Mode**: A WebXR-compatible browser (e.g., Chrome, Edge, Oculus Browser).
- **Non-VR Mode**: Any modern browser with WebGL support.

### Hardware
- **VR Mode**: A WebXR-compatible headset (e.g., Meta Quest, Vision Pro).
- **Non-VR Mode**: Red/cyan anaglyph 3D glasses for 3D viewing.

### Video Format
- **Required**: RGBD video format (left half: RGB color, right half: depth/disparity map).
- **Supported formats**: Any HTML5 video format (MP4, WebM, etc.).

## Usage

### Getting Started
1. **Open the Application**: Navigate to `index.html` in a compatible browser.
2. **Load Your Video**: Drag and drop an RGBD video file onto the page.
3. **Non-VR Viewing**: Put on red/cyan glasses to see the anaglyph 3D effect.
4. **Enter VR Mode**: Click "Enter VR" and put on your headset.

### VR Controls

The application supports both VR controllers and hand tracking. Use whichever input method you prefer!

#### VR Controller Controls

**Left Controller:**
- **Thumbstick Up/Down**: Adjust depth effect (invZmin)
  - Up = increase depth effect (stronger 3D)
  - Down = decrease depth effect (flatter)
  - Range: 0.01 to 0.1
- **Trigger**: Increase screen distance (hold to move farther)
- **Grip**: Decrease edge feathering (sharper edges)
- **X Button**: Exit VR session
- **Y Button**: Toggle transparent gradients

**Right Controller:**
- **Thumbstick Up/Down**: Adjust focal length to match source camera FOV
  - Up = zoom in / narrower FOV (like 50mm lens)
  - Down = zoom out / wider FOV (like 26mm lens)
  - Range: 0.5x to 2x (18mm to 72mm equivalent)
  - Default: 1.0x (36mm equivalent)
- **Trigger**: Decrease screen distance (hold to move closer)
- **Grip**: Increase edge feathering (softer edges)
- **A Button**: Play/pause video
- **B Button**: Toggle HUD on/off

#### Hand Tracking Controls

**Left Hand:**
- **Pinch + Drag Left/Right**: Adjust depth effect (invZmin)
  - Drag right = increase depth effect
  - Drag left = decrease depth effect
- **Double Pinch-Tap** (< 300ms each, within 500ms): Exit VR session

**Right Hand:**
- **Pinch + Drag Left/Right**: Adjust focal length to match source camera FOV
  - Drag right = zoom in / narrower FOV
  - Drag left = zoom out / wider FOV
- **Pinch + Drag Up** (≥ 20cm): Enable transparent gradients
- **Pinch + Drag Down** (≥ 20cm): Disable transparent gradients
- **Quick Pinch Tap** (< 300ms): Play/pause video

**Hand Tracking Notes:**
- Hand tracking automatically enabled on supported devices (Apple Vision Pro, Meta Quest Pro, Quest 3)
- Pinch requires thumb and index finger to actually touch (< 15mm apart)
- Both controller and hand input work simultaneously
- Double-tap protection prevents accidental exits

### Understanding the Settings

#### `invZmin` (Depth Effect)
- **Purpose**: Controls the intensity of the 3D effect by scaling disparity from the depth map
- **Range**: 0.01 to 0.1
- **Effect**: Higher values = more pronounced 3D depth, lower values = flatter image
- **Usage**: Adjust based on your content and comfort preference

#### Focal Length (Camera FOV Matching)
- **Purpose**: Simulates the recording camera's focal length to ensure proper object scale and proportions
- **Range**: 0.5x to 2x multiplier (18mm to 72mm equivalent in 35mm format)
- **Default**: 1.0x (36mm equivalent - standard "normal" lens)
- **Critical for immersion**: Match this to your source camera's FOV for natural-looking objects
  - 26mm (wide angle) - use for wide-angle captures, landscapes
  - 36mm (normal) - default, works well for most content
  - 50mm (portrait) - use for portrait/telephoto captures
- **When properly matched**: Objects and people appear with correct "fullness" and natural proportions

#### Screen Distance
- **Purpose**: Distance from viewer to the virtual screen plane
- **Range**: 1m to 100m
- **Default**: 100m (far away for comfortable viewing)
- **Effect**: Farther = more comfortable for extended viewing, closer = more "in your face"
- **Note**: Thanks to infinity mapping, distant objects maintain proper depth regardless of screen distance

#### Transparent Gradients
- **Purpose**: Makes high-gradient regions (large depth changes) transparent to reduce artifacts
- **Use when**: You see halos or artifacts around object edges
- **Toggle**: Y button (controller) or pinch-drag up/down (hand tracking)

#### Edge Feathering
- **Purpose**: Smooths transitions at depth discontinuities
- **Range**: 0.0 to 0.1
- **Effect**: Higher = softer edges, lower = sharper but potentially more artifacts
- **Control**: Grip buttons on controllers

## Technical Details

### Architecture
- **`index.html`**: Main HTML file with the UI.
- **`index.js`**: Application logic, including the view synthesis shader.
- **`PLAN.md`**: Development plan and PRD.

### Key Technologies
- **THREE.js**: 3D rendering engine
- **WebXR Device API**: VR/AR device access
- **WebXR Hand Input API**: Hand tracking and gesture detection
- **GLSL**: Custom view synthesis shader for real-time depth-based rendering

### Rendering Pipeline & Infinity Mapping

#### Non-VR Mode
1. Only the RGB part of the input video is displayed
2. Basic playback controls available

#### VR Mode
1. **Dual Plane Setup**: Two overlapping planes created, one for each eye (layer-based rendering)
2. **View Synthesis Shader**: Custom GLSL shader generates proper stereoscopic views
   - Left eye: Renders original RGB image
   - Right eye: Synthesizes new view by shifting pixels based on depth map
   - Shift amount controlled by `invZmin` parameter
3. **Infinity Mapping** (Critical Feature):
   - Content is expected to be converged at infinity (parallel cameras)
   - The shader automatically maps infinity points from the image to XR space infinity
   - This creates a true "window into the world" effect
   - Objects at different depths maintain correct parallax relative to infinity
4. **Dynamic Reconvergence**: Screen can be moved closer/farther while maintaining proper depth relationships
5. **Result**: Comfortable, immersive stereoscopic 3D with natural depth perception

## HUD Information

The real-time HUD displays all critical parameters:

- **Distance**: Current screen distance in meters
- **Focal**: Current focal length multiplier (and mm equivalent in 35mm format)
- **IPD**: Measured interpupillary distance (automatically detected from headset)
- **invZmin**: Current depth effect intensity
- **Feathering**: Current edge feathering amount
- **InitialY**: Initial headset height when VR session started (meters)
- **Transparent Gradients**: ON/OFF status
- **Status**: Video playback status (Playing/Paused)
- **Controls**: Quick reference for controller/hand inputs

**Note**: Press B button (controller) to toggle HUD visibility
