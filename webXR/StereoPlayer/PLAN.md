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

#### 4. VR Controller Input
- **Left Controller Stick (Forward/Back)**: Screen distance control
  - Range: 1m to 100m (inverse diopters: 1.0 to 0.01)
  - Control via diopters (1/distance) for linear feel
- **Right Controller Stick (Forward/Back)**: Focal length control
  - Range: 0.5 to 2.0
  - Default: 1.0 (36mm equivalent)

### Technical Specifications

#### Reconvergence Implementation
- Use UV offset in texture mapping
- Left texture: `offset.x = baseOffset - (reconv/2)`
- Right texture: `offset.x = baseOffset + (reconv/2)`
- Where base offsets are 0.0 (left) and 0.5 (right) for the SBS split

#### Eye Distance (IPD)
- **TBD**: Use actual IPD from XR camera positions or fixed value (e.g., 0.063m)?

#### Video Source
- **TBD**: Hardcoded path, URL parameter, or file selector?

---

## Execution Plan

### Phase 1: Setup & Video Integration
1. Create new `index.html` and `index.js` files (or specify target files)
2. Copy THREE.js importmap setup from `index_old.html`
3. Replace texture loading with video element creation
4. Create `<video>` element with proper attributes (crossorigin, loop, etc.)
5. Use `THREE.VideoTexture` instead of `THREE.TextureLoader`
6. Implement audio playback via video element

### Phase 2: Core Stereo Display
1. Create left/right plane geometry (1x1 base)
2. Set up layer-based eye visibility (layer 1 = left, layer 2 = right)
3. Clone video texture for each eye
4. Apply UV mapping for SBS split:
   - Left: offset (0, 0), repeat (0.5, 1)
   - Right: offset (0.5, 0), repeat (0.5, 1)
5. Position planes based on screen distance and focal length

### Phase 3: Reconvergence System
1. Track current `focal` and `screenDistance` parameters
2. Calculate screen width: `screenWidth = focal * screenDistance`
3. Get actual IPD from XR cameras: `eyeDistance = leftCam.position.distanceTo(rightCam.position)`
4. Compute reconvergence: `reconv = focal * eyeDistance / screenDistance`
5. Apply UV shifts:
   - Left texture: `offset.x = 0 - reconv/2`
   - Right texture: `offset.x = 0.5 + reconv/2`
6. Update shifts whenever focal or screenDistance changes

### Phase 4: Controller Input
1. Set up WebXR controller connection
2. Track controller gamepad axes
3. Left stick Y-axis → distance control (diopters):
   - Map stick [-1, 1] to diopters [0.01, 1.0]
   - `screenDistance = 1 / diopters`
4. Right stick Y-axis → focal control:
   - Map stick [-1, 1] to focal [0.5, 2.0]
5. Apply smoothing/dead zones for better UX
6. Update screen geometry and reconvergence on parameter change

### Phase 5: Screen Sizing & Positioning
1. Calculate plane dimensions:
   - Height from screen distance and desired field coverage
   - Width from `focal * height` or direct formula
2. Position planes at `screenDistance` from viewer
3. Ensure planes face viewer (copy camera orientation)
4. Handle window/VR session resize events

### Phase 6: Testing & Polish
1. Test with various video aspect ratios
2. Verify reconvergence math (check infinity objects remain fused)
3. Test controller responsiveness
4. Ensure smooth playback performance
5. Add optional debug HUD showing current focal/distance values

---

## Open Questions

1. **Video Source**: What video file should be used? Hardcoded path, URL parameter, or user selection?
2. **Video Controls**: Should video loop automatically? Play/pause controls needed?
3. **IPD Source**: Use dynamic IPD from XR cameras or fixed value (e.g., 63mm)?
4. **Debug UI**: Keep HUD overlay showing focal/distance values, or remove it?
5. **File Structure**: Create new files in `StereoPlayer/` directory or modify existing ones?
6. **Video Format**: Any specific codec/format requirements (H.264, VP9, etc.)?
7. **Initial Video State**: Auto-play on load or wait for user interaction?
8. **Non-VR Mode**: Should there be a 2D preview mode, or VR-only?
9. **Controller Sensitivity**: Linear or exponential mapping for controls?
10. **Video Loading**: Show loading indicator or handle errors gracefully?
