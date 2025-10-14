# WebXR SBS 3D Video Player

A WebXR application for viewing side-by-side (SBS) stereoscopic 3D videos with dynamic focal length and screen distance controls, featuring automatic reconvergence adjustment for proper infinity mapping and full immersive VR experience.

## Content Requirements

### IMPORTANT: Expected Video Format
This player expects **full-width side-by-side (SBS) stereo content** with the following properties:

- **Format**: Full-width SBS - NOT half-SBS
- **Layout**: Left eye view in left half (0.0-0.5), right eye view in right half (0.5-1.0)
- **Convergence**: Content must be **non-reconverged** (parallel view/converged at infinity)
  - This means distant objects appear at the same horizontal position in both left and right views
  - The player automatically maps infinity image points to XR space infinity for a fully immersive feel
- **Camera FOV**: For proper object scale and "fullness" sensation, the viewing angle should match the recording camera's field of view
  - **Default**: 36mm equivalent lens (1.0x focal multiplier)
  - Adjustable via controls to match your source content
  - Common settings: 26mm (wide), 36mm (normal), 50mm (portrait)

### Why Parallel View & FOV Matching Matter
When content is converged at infinity and FOV is properly matched:
- Objects at all depths maintain correct parallax relationships
- Distant objects appear naturally at infinity in VR space
- Objects and people have correct proportions and "fullness"
- The 3D effect is comfortable and realistic
- You get a true "window into the world" experience

## Features

### Non-VR Mode (Desktop/Mobile)
- **Anaglyph 3D Display**: View SBS videos in red/cyan anaglyph format (requires red/cyan 3D glasses)
- **Drag & Drop Support**: Easy video file loading via drag-and-drop or file browser
- **Video Information**: Real-time display of video dimensions and frame rate
- **Proper Aspect Ratio**: Maintains correct aspect ratio for individual eye views
- **Silent Preview**: Audio muted in non-VR mode

### VR Mode (WebXR Headsets)
- **True Stereoscopic Display**: Proper left/right eye separation with layer-based rendering
- **Infinity Mapping**: Automatically maps infinity points to XR space infinity for true immersion
- **Dynamic Reconvergence**: Automatic adjustment to maintain correct stereo geometry
  - Formula: `reconv = focal × IPD / screenDistance`
  - Keeps infinity content at infinity regardless of screen position
- **Adjustable Screen Distance**: 1m to 100m range (controlled via diopters for linear feel)
  - Default: 100m for comfortable cinema-like viewing
- **Adjustable Focal Length**: 0.5x to 2x range (18mm to 72mm equivalent) to match source camera FOV
  - Default: 1.0x (36mm equivalent)
  - Critical for proper object scale and proportions
- **IPD Validation**: Automatic detection with 35-85mm range validation
- **Spatial Audio**: Video sound enabled in VR mode
- **Real-time HUD**: Displays all current settings including initial headset height (toggleable)
- **Dual Input Support**:
  - VR Controller Support: Full gamepad integration
  - Hand Tracking: Natural gesture controls (Apple Vision Pro, Meta Quest Pro/3)

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
   - Default Indiana Jones (14s) clip loads automatically

2. **Load Your Own Video**
   - Click the drop zone or drag a video file onto the page
   - Wait for video metadata to load
   - View dimension and frame rate will be displayed

3. **Non-VR Preview**
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
- **Double Pinch-Tap** (< 300ms each, within 500ms): Exit VR session
  - Prevents accidental exits with double-tap requirement

**Right Hand:**
- **Pinch + Drag Left/Right**: Adjust focal length to match source camera FOV
  - Drag right = zoom in / narrower FOV (like 50mm lens)
  - Drag left = zoom out / wider FOV (like 26mm lens)
- **Quick Pinch Tap** (< 300ms): Play/pause video

**Hand Tracking Notes:**
- Hand tracking automatically enabled on supported devices (Apple Vision Pro, Meta Quest Pro, Quest 3)
- Pinch requires thumb and index finger to actually touch (< 15mm apart)
- Both controller and hand input work simultaneously
- Double-tap protection prevents accidental exits
- No distance control via hands - use controller thumbstick for screen distance adjustment

### Understanding the Settings

#### Screen Distance
- **Purpose**: Distance from viewer to the virtual screen plane
- **Range**: 1m to 100m
- **Default**: 100m (comfortable cinema-like viewing distance)
- **Controlled via**: Diopters (inverse distance) for smooth, linear adjustment feel
- **Effect**: Farther = more comfortable for extended viewing, closer = more immediate presence
- **Note**: Thanks to automatic reconvergence, distant objects maintain proper depth regardless of screen distance

#### Focal Length (Camera FOV Matching)
- **Purpose**: Simulates the recording camera's focal length to ensure proper object scale and proportions
- **Range**: 0.5x to 2x multiplier (18mm to 72mm equivalent in 35mm format)
- **Default**: 1.0x (36mm equivalent - standard "normal" lens)
- **Critical for immersion**: Match this to your source camera's FOV for natural-looking objects
  - 26mm (wide angle) - use for wide-angle captures, landscapes
  - 36mm (normal) - default, works well for most content
  - 50mm (portrait) - use for portrait/telephoto captures
- **When properly matched**: Objects and people appear with correct "fullness" and natural proportions
- **Affects screen width**: `screenWidth = screenDistance / focal`

#### Reconvergence (Automatic)
- **Purpose**: Automatically adjusts the horizontal shift of left/right images to maintain proper stereo geometry
- **Formula**: `reconv = focal × IPD / screenDistance`
- **Effect**: Ensures objects at infinity remain fused at infinity in VR space
- **Applied as**: UV texture offset in normalized coordinates
- **Why it matters**: Creates the "window into the world" effect - you're looking through a window, not at a flat surface

#### IPD (Interpupillary Distance)
- **Purpose**: Eye separation distance used for reconvergence calculations
- **Measurement**: Automatically measured from VR camera positions each frame
- **Valid range**: 35mm to 85mm
- **Fallback**: 63mm if measurement is outside valid range
- **Displayed in HUD**: Shows your actual measured IPD

#### InitialY (Headset Height)
- **Purpose**: Initial vertical position of headset when VR session started
- **Measurement**: Automatically captured from XR camera Y position
- **Validation**: Only accepts readings > 0.1m to avoid zero readings on some devices
- **Displayed in HUD**: Shows in meters (e.g., 1.600m for seated height)

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

### Rendering Pipeline & Infinity Mapping

#### Non-VR Mode
1. Video texture loaded from SBS source (full-width format)
2. Custom fragment shader samples left (0.0-0.5) and right (0.5-1.0) halves
3. Combines red channel from left, cyan (green+blue) from right
4. Renders to full-screen plane with correct aspect ratio for anaglyph viewing

#### VR Mode
1. **Dual Plane Setup**: Two separate planes created (left and right)
2. **Layer-based Rendering**: Each plane uses exclusive layer visibility
   - Left plane: layer 1 (left eye only)
   - Right plane: layer 2 (right eye only)
3. **Infinity Mapping via Reconvergence**: UV offsets automatically calculated and applied
   - Content is expected to be converged at infinity (parallel view)
   - Left plane: `offset.x = -reconv/2 × 0.5`
   - Right plane: `offset.x = 0.5 + reconv/2 × 0.5`
   - This mapping ensures infinity points in the image appear at infinity in VR space
4. **Dynamic Positioning**: Planes positioned in world space at configurable distance
   - Screen width calculated as: `screenWidth = screenDistance / focal`
   - Maintains proper aspect ratio from source video
5. **Continuous Updates**: Reconvergence recalculated each frame as parameters change
6. **Result**: True "window into the world" effect with natural depth perception

### Resource Management
- **On VR Entry**: Anaglyph resources removed, VR planes created, audio enabled
- **On VR Exit**: VR planes disposed, anaglyph plane recreated, audio muted
- **Texture Reuse**: Video texture shared between modes for efficiency
- **Automatic Cleanup**: Proper disposal of geometries, materials, and textures

## HUD Information

The real-time HUD displays all critical parameters (toggle with B button on controller):

- **Distance**: Current screen distance in meters (1m to 100m)
- **Focal**: Current focal length multiplier and mm equivalent (e.g., "1.00 (36mm)")
- **IPD**: Measured interpupillary distance in millimeters (auto-detected from headset)
- **Reconv**: Reconvergence shift in millimeters (calculated from focal, IPD, and distance)
- **InitialY**: Initial headset height when VR session started (meters)
- **Status**: Video playback status (Playing/Paused)
- **Controls**: Quick reference for controller and hand inputs

**Note**: All values update in real-time as you adjust parameters

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

The application includes a default video (`default_2x1.mp4`). For best results with your own content:

- **Resolution**: 3840×1080 or higher for 4K per eye
- **Frame Rate**: 24, 30, or 60 fps
- **Format**: SBS full-width
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
