# WebXR Side-by-Side 3D Video Player - PRD & Execution Plan

## Product Requirements Document

### Overview
A WebXR application for viewing side-by-side (SBS) 3D video content with dynamic focal length and screen distance controls, featuring automatic reconvergence adjustment to maintain proper stereo geometry.

### Core Features

#### 1. Video Playback
- **Format**: Side-by-side (SBS) full-width 3D video
- **Display**: Two planes (left/right) visible only to corresponding eyes using `plane.layers.set()`
- **Audio**: Video sound playback enabled
- **Aspect Ratio**: Each plane shows half the SBS content with aspect ratio = (videoWidth / 2) / videoHeight

#### 2. Screen Geometry
- **Initial Screen Distance**: 100m (default)
- **Focal Length**: Default 1.0 (equivalent to 36mm lens in 35mm format)
- **Screen Width Calculation**: `screenWidth = focal * screenDistance`
- **Plane Positioning**: Overlapping left/right planes form a single virtual screen

#### 3. Reconvergence System
- **Formula**: `reconv = focal * eyeDistance / screenDistance`
- **Left Image Shift**: `-reconv/2` (in normalized UV coordinates)
- **Right Image Shift**: `+reconv/2` (in normalized UV coordinates)
- **Purpose**: Keeps infinity content at infinity regardless of virtual screen position

#### 4. VR Input Methods

##### Gamepad Controller Input
- **Left Controller Stick (Forward/Back)**: Screen distance control
  - Range: 1m to 100m (inverse diopters: 1.0 to 0.01)
  - Control via diopters (1/distance) for linear feel
- **Right Controller Stick (Forward/Back)**: Focal length control
  - Range: 0.5 to 2.0 (log2 space: -1 to 1)
  - Default: 1.0 (36mm equivalent)
- **Right Controller Buttons**:
  - A button: Play/Pause toggle
  - B button: HUD toggle
- **Left Controller Buttons**:
  - X button: Exit VR session
  - Y button: Toggle background gradient

##### Hand Tracking Input
- **Left Hand Gestures**:
  - Pinch + Vertical Drag: Screen distance control (up = farther, down = closer)
  - Thumbs Up: Toggle background gradient
  - Palm Open (hold 1.5s): Exit VR session
- **Right Hand Gestures**:
  - Pinch + Vertical Drag: Focal length control (up = zoom in, down = zoom out)
  - Point Gesture: Play/Pause toggle
  - Thumbs Up: Toggle HUD

### Technical Specifications

#### Reconvergence Implementation
- Use UV offset in fragment shader uniforms
- Left shader: `uv.x = vUv.x * 0.5 + uConvergenceShiftX`
- Right shader: `uv.x = 0.5 + vUv.x * 0.5 + uConvergenceShiftX`
- Convergence shifts calculated as: `reconvShift = -focal * (eyePos - ipd/2) / screenDistance * 0.5`
- Boundary checks prevent sampling outside valid texture regions

#### Eye Distance (IPD)
- **Implemented**: Dynamic IPD from XR camera positions
- Range validation: 35mm to 85mm (IPD_MIN to IPD_MAX)
- Fallback to 63mm default if measurement out of range

#### Hand Tracking
- **Feature**: Optional 'hand-tracking' feature requested in VR session
- **Gestures**: Detected via WebXR Hand Input API (25 joint positions)
- **Detection Functions**:
  - `detectPinch()`: Thumb-index distance < 40mm
  - `detectPointGesture()`: Index extended, other fingers curled
  - `detectThumbsUp()`: Thumb extended upward, others curled
  - `detectPalmOpen()`: All fingers extended, palm facing user

#### Video Source
- **Implemented**: Default video (default_2x1.mp4) + drag-and-drop file selector
- File input and drop zone for user-provided videos

---

## Execution Plan

### Phase 1: Setup & Video Integration ✅
1. ✅ Created `index.html` and `index.js` files
2. ✅ Set up THREE.js importmap (ES modules)
3. ✅ Implemented video element creation with VideoTexture
4. ✅ Added video attributes (muted for non-VR, audio enabled in VR)
5. ✅ Implemented default video loading + drag-and-drop file selector
6. ✅ Audio playback via video element (context-aware)

### Phase 2: Core Stereo Display ✅
1. ✅ Created left/right plane geometry with shader materials
2. ✅ Set up layer-based eye visibility (layer 1 = left, layer 2 = right)
3. ✅ Shared VideoTexture between both eyes
4. ✅ UV mapping in fragment shaders:
   - Left: samples 0.0 to 0.5 with convergence shift
   - Right: samples 0.5 to 1.0 with convergence shift
5. ✅ Dynamic plane positioning based on screenDistance
6. ✅ Added anaglyph mode for non-VR viewing

### Phase 3: Reconvergence System ✅
1. ✅ Tracked `focal`, `screenDistance`, and `diopters` parameters
2. ✅ Calculate screen width: `screenWidth = screenDistance / focal`
3. ✅ Dynamic IPD from XR cameras with validation
4. ✅ Reconvergence calculated per eye: `reconvShift = -focal * (eyePos - ipd/2) / screenDistance * 0.5`
5. ✅ UV shifts applied via shader uniforms (`uConvergenceShiftX/Y`)
6. ✅ Boundary checks in shaders prevent invalid texture sampling
7. ✅ Real-time updates on parameter changes

### Phase 4: Input Systems ✅
#### Gamepad Controller Input ✅
1. ✅ WebXR controller setup (controller0, controller1)
2. ✅ Gamepad axes tracking via session.inputSources
3. ✅ Left stick Y-axis → diopters control (incremental)
4. ✅ Right stick Y-axis → focal control (log2 space, incremental)
5. ✅ Button mappings:
   - Right A: Play/Pause
   - Right B: HUD toggle
   - Left X: Exit VR
   - Left Y: Background toggle
6. ✅ Dead zones (0.1 threshold) for better UX

#### Hand Tracking Input ✅
1. ✅ Requested 'hand-tracking' optional feature in VR session
2. ✅ Implemented gesture detection utilities:
   - `getJointPosition()`: Extract joint world positions
   - `detectPinch()`: Thumb-index distance detection
   - `detectPointGesture()`: Index extended detection
   - `detectThumbsUp()`: Thumb up gesture
   - `detectPalmOpen()`: Open palm facing user
3. ✅ Left hand gestures:
   - Pinch + drag → distance control
   - Thumbs up → background toggle
   - Palm open hold → exit VR
4. ✅ Right hand gestures:
   - Pinch + drag → focal control
   - Point → play/pause
   - Thumbs up → HUD toggle
5. ✅ State tracking prevents double-triggering
6. ✅ Both input methods work simultaneously

### Phase 5: Screen Sizing & Positioning ✅
1. ✅ Plane dimensions calculated from screenDistance and focal
2. ✅ Aspect ratio maintained from video dimensions
3. ✅ Planes positioned at screenDistance with fixed orientation
4. ✅ Window resize handling for anaglyph mode
5. ✅ Dynamic canvas resizing based on video resolution
6. ✅ Initial Y position tracking for vertical reconvergence

### Phase 6: Features & Polish ✅
1. ✅ Anaglyph preview mode for non-VR viewing
2. ✅ HUD overlay showing distance, focal, IPD, reconvergence, status
3. ✅ Video frame rate measurement and display
4. ✅ Gradient background (toggleable)
5. ✅ Video info UI (dimensions, fps, status)
6. ✅ Session start/end handling
7. ✅ Autoplay with fallback for user interaction
8. ✅ Console logging for debugging

---

## Implementation Status

### ✅ Completed Features
- Side-by-side 3D video playback with proper stereo separation
- Dynamic reconvergence system with X/Y axis support
- Dual input methods (gamepad + hand tracking)
- Anaglyph preview mode for non-VR viewing
- Dynamic IPD measurement with validation
- HUD overlay with real-time parameter display
- Video file selector (drag-and-drop + file input)
- Background gradient (toggleable)
- Video frame rate measurement
- Optimized canvas sizing based on video resolution
- Session management (VR enter/exit)

### 📋 Resolved Design Decisions
1. **Video Source**: Default video + drag-and-drop file selector ✅
2. **Video Controls**: Play/pause via controller buttons or hand gestures ✅
3. **IPD Source**: Dynamic from XR cameras with validation ✅
4. **Debug UI**: Toggleable HUD overlay (B button / right thumbs up) ✅
5. **Non-VR Mode**: Anaglyph mode for desktop preview ✅
6. **Controller Sensitivity**: Incremental updates with dead zones ✅
7. **Video Loading**: Status display with autoplay + user interaction fallback ✅
8. **Hand Tracking**: Optional feature, works alongside gamepad ✅

### 🎯 Future Enhancements (Optional)
- Video timeline scrubbing
- Multiple video format support (equirectangular 360°)
- Save/load user preferences
- Network streaming support
- Additional gesture customization
- Performance metrics overlay
