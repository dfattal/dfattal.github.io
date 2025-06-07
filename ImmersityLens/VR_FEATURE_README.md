# VR Feature for ImmersityLens Chrome Extension

## Overview

The ImmersityLens Chrome Extension now includes advanced VR/XR viewing capabilities for converted LIF files. After converting a 2D image to 3D using the main "2D3D" button, users can view the result in virtual reality with automatic display type detection and optimized rendering.

## Key Features

- **Automatic Display Detection**: Automatically detects VR headsets vs 3D displays using FOV analysis
- **Dual-Mode Rendering**: Optimized texture sizing and focus handling for each display type
- **Advanced WebXR Integration**: Works with Chrome's WebXR implementation
- **Seamless Integration**: VR button appears automatically after LIF conversion
- **Embedded Shader System**: Complete LIF rendering system embedded for CSP compliance
- **Chrome Extension Bridge**: Enhanced features via WebXROpenXRBridge when available

## Browser Requirements

- **Chrome**: Version 79+ with WebXR enabled (`chrome://flags/#webxr`)
- **Edge**: Version 79+ with WebXR enabled
- **Firefox**: Version 98+ with WebXR enabled (limited support)

## Hardware Compatibility

### VR Headsets (VR Mode)
- Oculus Quest/Quest 2/Quest 3
- HTC Vive series
- Valve Index
- Windows Mixed Reality headsets
- Pico 4/4 Enterprise

### 3D Displays (3D Display Mode)
- Looking Glass Portrait/15.6"
- Leia Lume Pad series
- Other autostereoscopic displays

## Usage Instructions

### Quick Start
1. **Convert Image**: Click the "2D3D" button on any image
2. **Wait for Conversion**: The button will show "⬇️ LIF" when ready
3. **Enter VR**: Click the "👓 VR" button that appears
4. **Enjoy**: Experience your image in immersive 3D/VR

### Display Detection
The system automatically:
- **Detects VR Headsets**: Uses symmetric FOV analysis to identify VR mode
- **Detects 3D Displays**: Uses asymmetric FOV analysis for 3D display mode
- **Optimizes Rendering**: Applies appropriate texture sizing and focus settings

## Technical Implementation

### Display Type Detection

**VR Mode Detection (is3D = 0):**
- Symmetric frustums (mirrored left/right FOVs)
- Small denominators in 3D calculations (< 0.0001)
- Mirror FOV patterns between eyes
- Results in: High-res textures (1920px max), viewport scale 1.2x, dynamic convergence

**3D Display Mode Detection (is3D = 1):**
- Asymmetric frustums with different boundaries
- Calculable 3D position using frustum intersection
- Non-zero denominators in calculations
- Results in: Reduced textures (viewport/2), viewport scale 1.0x, no convergence

### Rendering Optimization

**VR Mode Rendering:**
```javascript
// High-resolution textures
canvas.width = Math.min(1920, lifView.width_px * 1.2);
// Dynamic convergence based on depth
renderer.invd = focus * lifView.inv_z_map.min;
// Advanced focal length calculation
renderer.renderCam.f = f * viewportScale * depthCompensation / 1.2;
```

**3D Display Mode Rendering:**
```javascript
// Viewport-based resolution
canvas.width = camera.viewport.width / 2;
// No convergence distance
renderer.invd = 0;
// Direct focal length mapping
renderer.renderCam.f = f * viewportScale;
```

## Chrome Extension Integration

### Content Security Policy (CSP) Compliance
- VR system injected as separate script file using `chrome.runtime.getURL()`
- Complete LIF loader and renderers embedded in `VRPageSystem.js`
- All shaders embedded directly (332 lines mono, 403 lines stereo)
- Message passing between content script and page context

### WebXROpenXRBridge Enhancement
When the Chrome WebXROpenXRBridge extension is available:
```javascript
if (window.WebXROpenXRBridge) {
    // Enhanced projection method for better 3D display compatibility
    window.WebXROpenXRBridge.setProjectionMethod(1);
    // Optimized settings reset
    window.WebXROpenXRBridge.resetSettings(1.0);
}
```

## Troubleshooting

### VR Button Not Appearing
- Ensure the LIF conversion completed successfully
- Check browser WebXR support (`navigator.xr`)
- Verify extension permissions in `chrome://extensions/`

### Display Detection Issues
- Check console for FOV analysis logs
- Verify camera projection matrices are valid
- Test with different hardware if available

### Performance Issues
- Monitor texture resolution in browser dev tools
- Check if proper display mode was detected
- Verify WebGL context creation success

### Black Screen in VR
- Ensure textures are updating (`needsUpdate = true`)
- Verify layer assignments (left eye: layer 1, right eye: layer 2)
- Check convergence plane calculation results

## File Structure

```
ImmersityLens/
├── manifest.json                 # Extension manifest with VR resources
├── content.js                    # LIF detection and VR injection
├── libs/
│   ├── VRPageSystem.js          # Complete VR system with embedded components
│   ├── VRLifViewer2.js          # Content script VR interface
│   └── ...                      # Other extension libraries
└── shaders/                     # External shader files (fallback)
    ├── rayCastMonoLDI.glsl
    ├── rayCastStereoLDI.glsl
    └── ...
```

## Version History

### v2.0.1 (Current)
- ✅ Automatic VR headset vs 3D display detection
- ✅ Dual-mode texture sizing and focus handling
- ✅ CSP-compliant VR system injection
- ✅ Embedded LIF loader and renderers
- ✅ Complete shader system (332 + 403 lines)
- ✅ WebXROpenXRBridge integration
- ✅ Advanced convergence plane calculation

### v2.0.0 
- ✅ Initial VR viewing capability
- ✅ Basic Three.js WebXR integration
- ✅ LIF loading and rendering

## Development Notes

### Building and Testing
```bash
# Package for Chrome Web Store
cd ImmersityLens
./package-for-store.sh

# Load unpacked extension for testing
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select ImmersityLens folder
```

### Extension Architecture
The VR feature uses a dual-context architecture:
1. **Content Script Context**: Detects LIF files, manages UI
2. **Page Context**: Handles WebXR, Three.js, and VR rendering
3. **Message Passing**: Coordinates between contexts safely

## Roadmap

### Planned Features
- [ ] Controller interaction support
- [ ] Hand tracking integration
- [ ] Multi-user VR sessions
- [ ] Advanced depth adjustment controls
- [ ] Video LIF support in VR

### Performance Improvements
- [ ] Adaptive quality settings
- [ ] Frame rate optimization
- [ ] Memory usage reduction
- [ ] Batch processing for multiple LIFs

## Support

For issues or questions:
1. Check browser WebXR compatibility
2. Verify extension permissions
3. Test with different LIF files
4. Check console for error messages

The VR feature enhances the existing 2D-to-3D conversion workflow by providing an immersive viewing experience for the generated LIF files with automatic optimization for your specific display hardware. 