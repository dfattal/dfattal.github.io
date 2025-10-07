# WebXR SBS 3D Video Player

A WebXR application for viewing side-by-side (SBS) stereoscopic 3D videos with dynamic focal length and screen distance controls, featuring automatic reconvergence adjustment.

## Features

### Non-VR Mode (Desktop/Mobile)
- **Anaglyph 3D Display**: View SBS videos in red/cyan anaglyph format (requires red/cyan 3D glasses)
- **Drag & Drop Support**: Easy video file loading via drag-and-drop or file browser
- **Video Information**: Real-time display of video dimensions and frame rate
- **Proper Aspect Ratio**: Maintains correct aspect ratio for individual eye views
- **Silent Preview**: Audio muted in non-VR mode

### VR Mode (WebXR Headsets)
- **True Stereoscopic Display**: Proper left/right eye separation with layer-based rendering
- **Dynamic Reconvergence**: Automatic adjustment to maintain correct stereo geometry
  - Formula: `reconv = focal * IPD / screenDistance`
  - Keeps infinity content at infinity regardless of screen position
- **Adjustable Screen Distance**: 1m to 100m range (controlled via diopters for linear feel)
- **Adjustable Focal Length**: 0.5x to 2x range (18mm to 72mm equivalent in 35mm format)
  - Default: 1.0 (36mm equivalent)
- **IPD Validation**: Automatic detection with 35-85mm range validation
- **Spatial Audio**: Video sound enabled in VR mode
- **Real-time HUD**: Displays current settings and controls (toggleable)
- **Dual Input Support**:
  - VR Controller Support: Full gamepad integration
  - Hand Tracking: Natural gesture controls (Apple Vision Pro, Meta Quest Pro, etc.)

## Requirements

### Browser Support
- **VR Mode**: Chrome/Edge with WebXR support, Firefox Reality, Oculus Browser, or any WebXR-compatible browser
- **Non-VR Mode**: Any modern browser with WebGL support

### Hardware
- **VR Mode**: WebXR-compatible headset (Meta Quest, Vision Pro, etc.)
- **Non-VR Mode**: Red/cyan anaglyph 3D glasses (optional, for 3D viewing)

### Video Format
- **Required**: Side-by-side (SBS) full-width format
- **Important**: Videos should be **non-reconverged** (parallel view)
- **Supported formats**: Any HTML5 video format (MP4, WebM, etc.)
- **Recommended**: H.264 or VP9 codec for best compatibility

## Usage

### Getting Started

1. **Open the Application**
   - Navigate to `index.html` in a WebXR-compatible browser
   - Default Indiana Jones clip loads automatically

2. **Load Your Own Video**
   - Click the drop zone or drag a video file onto the page
   - Wait for video metadata to load
   - View dimension and frame rate will be displayed

3. **Non-VR Viewing**
   - Put on red/cyan anaglyph glasses
   - Video displays in 3D anaglyph format
   - Click to play if autoplay is prevented by browser

4. **Enter VR Mode**
   - Click "Enter VR" button
   - Put on your VR headset
   - Audio will automatically enable

### VR Controls

The application supports both gamepad controllers and hand tracking. Use whichever input method you prefer!

#### Gamepad Controller Controls

**Left Controller:**
- **Thumbstick Forward/Back**: Adjust screen distance
  - Forward = screen moves farther away
  - Back = screen moves closer
  - Range: 1m to 100m
- **X Button**: Exit VR session
- **Y Button**: Toggle background gradient

**Right Controller:**
- **Thumbstick Forward/Back**: Adjust focal length
  - Forward = zoom in (increase focal length)
  - Back = zoom out (decrease focal length)
  - Range: 0.5x to 2x (18mm to 72mm equivalent)
- **A Button**: Play/pause video
- **B Button**: Toggle HUD on/off

#### Hand Tracking Controls

**Left Hand:**
- **Pinch + Drag Vertically**: Adjust screen distance
  - Drag up/forward = screen moves farther away
  - Drag down/back = screen moves closer
- **Thumbs Up**: Toggle background gradient
- **Palm Open (hold 1.5s)**: Exit VR session

**Right Hand:**
- **Pinch + Drag Vertically**: Adjust focal length
  - Drag up = zoom in (increase focal length)
  - Drag down = zoom out (decrease focal length)
- **Point Gesture** (index finger extended): Play/pause video
- **Thumbs Up**: Toggle HUD on/off

**Hand Tracking Notes:**
- Hand tracking is automatically enabled on supported devices (Apple Vision Pro, Meta Quest Pro, Quest 3, etc.)
- Both controller and hand input work simultaneously - use whichever is most comfortable
- Hand gestures are detected using WebXR Hand Input API

### Understanding the Settings

#### Screen Distance
- Distance from viewer to virtual screen
- Controlled via inverse (diopters) for smooth, linear adjustment
- Default: 100m (cinema-like experience)

#### Focal Length
- Simulates the camera focal length used during video recording
- Expressed as fraction of image width
- Default: 1.0 (36mm equivalent in 35mm format)
- Affects screen width: `screenWidth = focal × screenDistance`

#### Reconvergence
- Automatically adjusts the horizontal shift of left/right images
- Ensures objects at infinity remain fused at infinity
- Calculated as: `reconv = focal × IPD / screenDistance`
- Applied as UV texture offset in normalized coordinates

#### IPD (Interpupillary Distance)
- Automatically measured from VR camera positions
- Valid range: 35mm to 85mm
- Falls back to 63mm if measurement is outside range

## Technical Details

### Architecture

#### File Structure
```
StereoPlayer/
├── index.html          # Main HTML with UI
├── index.js            # Application logic
├── README.md           # This file
└── PLAN.md            # Development plan and PRD
```

#### Key Technologies
- **THREE.js**: 3D rendering engine
- **WebXR Device API**: VR/AR device access
- **WebXR Hand Input API**: Hand tracking and gesture detection
- **Custom Shaders**: Anaglyph rendering and stereo separation with reconvergence

### Rendering Pipeline

#### Non-VR Mode
1. Video texture loaded from SBS source
2. Custom fragment shader samples left (0.0-0.5) and right (0.5-1.0) halves
3. Combines red channel from left, cyan (green+blue) from right
4. Renders to full-screen plane with correct aspect ratio

#### VR Mode
1. Two separate planes created (left and right)
2. Each plane uses layer-based visibility (layer 1 = left eye, layer 2 = right eye)
3. UV offsets applied for reconvergence:
   - Left: `offset.x = -reconv/2 × 0.5`
   - Right: `offset.x = 0.5 + reconv/2 × 0.5`
4. Planes positioned in world space at configurable distance
5. Proper stereo rendering via WebXR

### Resource Management
- **On VR Entry**: Anaglyph resources removed, VR planes created, audio enabled
- **On VR Exit**: VR planes disposed, anaglyph plane recreated, audio muted
- **Texture Reuse**: Video texture shared between modes for efficiency
- **Automatic Cleanup**: Proper disposal of geometries, materials, and textures

## HUD Information

When HUD is enabled in VR mode, the following information is displayed:

- **Distance**: Current screen distance in meters
- **Focal**: Current focal length (raw value and mm equivalent)
- **IPD**: Measured interpupillary distance in millimeters
- **Reconv**: Reconvergence shift in millimeters
- **Status**: Video playback status (Playing/Paused)
- **Controls**: Quick reference for controller inputs

## Troubleshooting

### Video Won't Play
- **Autoplay Blocked**: Click anywhere on the page to trigger playback
- **Format Issues**: Ensure video is in HTML5-compatible format (MP4 recommended)
- **CORS Errors**: Video must be from same origin or have proper CORS headers

### No Sound in VR
- **Check Volume**: Ensure headset volume is turned up
- **Browser Permissions**: Check that browser has audio permission
- **Video Codec**: Some codecs may not support audio playback

### Aspect Ratio Wrong
- **Console Open**: Close developer console (causes resize events)
- **Window Resize**: Application auto-adjusts on resize
- **Video Not Loaded**: Wait for video metadata to fully load

### Stereo Looks Wrong in VR
- **Check Video Format**: Must be full-width SBS (not half-width)
- **Reconvergence**: Videos should be non-reconverged (parallel view)
- **IPD Issues**: Check console for IPD warnings (should be 35-85mm)

### Controllers/Hand Tracking Not Working
- **Controllers**:
  - Check connection: Ensure controllers are paired and tracking
  - Browser support: Verify browser supports WebXR gamepad API
  - Console logs: Check for controller detection messages
- **Hand Tracking**:
  - Device support: Verify your headset supports hand tracking (Vision Pro, Quest Pro, Quest 3)
  - Enable hand tracking: Check headset settings to ensure hand tracking is enabled
  - Lighting: Ensure adequate lighting for hand detection
  - Console logs: Check for hand tracking initialization messages
  - Fallback: Use gamepad controllers if hand tracking is unavailable

### Performance Issues
- **Video Resolution**: Lower resolution videos perform better
- **Codec**: H.264 generally performs better than VP9
- **Close Apps**: Close other applications to free up resources

## Example Videos

The application includes a default video (`indiana_relative_g04_b3_tc07_inf_2x1.mp4`). For best results with your own content:

- **Resolution**: 3840×1080 or higher for 4K per eye
- **Frame Rate**: 24, 30, or 60 fps
- **Format**: SBS full-width (2:1 aspect ratio)
- **Encoding**: Non-reconverged (parallel view)
- **Audio**: Stereo or mono

## Development

### Running Locally
```bash
# Serve files with a local HTTP server
python -m http.server 8000
# or
npx serve
```

Then navigate to `http://localhost:8000/index.html`

### Testing
- **Desktop**: Test anaglyph mode with red/cyan glasses
- **VR**: Use WebXR emulator extension or actual VR headset
- **Console**: Monitor for errors and performance metrics

## License

This project is part of the dfattal.github.io repository.

## Credits

- **THREE.js**: https://threejs.org/
- **WebXR Device API**: https://www.w3.org/TR/webxr/
- **WebXR Hand Input**: https://immersive-web.github.io/webxr-hand-input/

## Version History

- **v1.1**: Added hand tracking support with natural gesture controls
  - WebXR Hand Input API integration
  - Dual input support (gamepad + hands)
  - Gesture detection for all controls
  - Background gradient toggle
- **v1.0**: Initial release with full VR and anaglyph support
  - SBS playback, reconvergence, dynamic controls, file upload

---

**Note**: For technical details on the reconvergence algorithm and implementation, see `PLAN.md`.
