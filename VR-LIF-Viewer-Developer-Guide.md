# VR Viewing Session for LIF Files - Developer Reference

## Overview

This guide explains the ImmersityLens Chrome Extension VR system for viewing Leia Image Format (LIF) files. The system supports both mono and stereo LIF files with automatic detection of VR headsets vs 3D displays, providing optimized rendering for each display type. It integrates with the Chrome WebXROpenXRBridge extension for enhanced VR features.

## Architecture Overview

The VR system consists of five main components:

1. **Content Script** (`content.js`) - Detects LIF files and manages extension lifecycle
2. **VR Page System** (`VRPageSystem.js`) - Page-context VR implementation with embedded LIF loader and renderers
3. **Display Detection** - Automatic detection of VR headsets vs 3D displays using FOV analysis
4. **Dual-Mode Rendering** - Optimized texture sizing and focus handling for each display type
5. **Chrome Extension Integration** - Advanced VR features via `window.WebXROpenXRBridge`

## Key Concepts

### LIF File Structure
- Contains one or more views (mono or stereo)
- Each view has RGB image data and depth (inverse Z) maps
- May contain multiple layers for advanced rendering
- Includes camera metadata (position, focal length, skew, etc.)

### Display Type Detection
The system automatically detects display type using FOV analysis:

**VR Headset Detection:**
- Symmetric frustums (mirrored left/right FOVs)
- Small denominators in 3D position calculations (< 0.0001)
- Mirror FOV patterns between eyes

**3D Display Detection:**
- Asymmetric frustums with different boundaries
- Cameras positioned to view physical display surface
- Calculable 3D position using frustum intersection

### Dual-Mode Rendering Pipeline

**VR Mode (`is3D = 0`):**
1. High-resolution textures (up to 1920px max)
2. Dynamic convergence based on `focus * inv_z_map.min`
3. Viewport scaling of 1.2 for content optimization
4. Symmetric plane positioning using IPD calculations

**3D Display Mode (`is3D = 1`):**
1. Reduced resolution textures (`viewport.width/2`)
2. No convergence distance applied (`invd = 0`)
3. Viewport scaling of 1.0 for direct mapping
4. Asymmetric plane positioning using frustum intersection

## Implementation Architecture

### 1. Content Script Integration

```javascript
// content.js - LIF Detection and VR Injection
class VRLifViewer2 {
    async injectVRSystem() {
        // Inject VRPageSystem.js as separate script file (CSP-safe)
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/VRPageSystem.js');
        script.type = 'module';
        document.head.appendChild(script);
    }

    async startVR(lifUrl) {
        // Send VR command to page context
        window.postMessage({
            type: 'VR_LIF_COMMAND_START_VR',
            lifUrl: lifUrl
        }, '*');
    }
}
```

### 2. VR Page System Core

```javascript
// VRPageSystem.js - Page Context Implementation
class PageContextVRSystem {
  constructor() {
        this.is3D = 1; // Default to 3D display mode
        this.viewportScale = 1.2; // Default viewport scale
        this.focus = 0.01; // Focus distance constant
        this.MAX_TEX_SIZE_VR = 1920; // Maximum texture size for VR
        this.xrCanvasInitialized = false;
    }

    async createLifVRScene(lifData) {
        // Load LIF data using embedded LifLoader
        const loader = new LifLoader();
        await loader.loadFromData(lifData);
        this.lifView = loader.views[0];

        // Create dual offscreen renderers for each eye
        await this.createDualRenderers();
        
        // Create VR display planes
        await this.createVRDisplayPlanes();
    }

    render(time, frame) {
        const xrCam = this.renderer.xr.getCamera(this.camera);
        
        if (xrCam.isArrayCamera && xrCam.cameras.length === 2) {
            const leftCam = xrCam.cameras[0];
            const rightCam = xrCam.cameras[1];

            // Initialize display detection and canvas sizing
            if (!this.xrCanvasInitialized) {
                this.detectDisplayTypeAndInitialize(leftCam, rightCam);
            }

            // Render based on detected display type
            this.renderDualEye(leftCam, rightCam);
        }
    }
}
```

### 3. Display Detection Algorithm

```javascript
detectDisplayTypeAndInitialize(leftCam, rightCam) {
    // Analyze FOV characteristics
    const leftFov = this.computeFovTanAngles(leftCam);
    const rightFov = this.computeFovTanAngles(rightCam);
    
    const denomX = (rightFov.tanRight - rightFov.tanLeft - leftFov.tanRight + leftFov.tanLeft);
    const isMirror = Math.abs(leftFov.tanLeft) === Math.abs(rightFov.tanRight) && 
                    Math.abs(leftFov.tanRight) === Math.abs(rightFov.tanLeft);
    
    if (Math.abs(denomX) < 0.0001 || isMirror) {
        // VR HEADSET DETECTED
        this.is3D = 0;
        this.initializeVRMode(leftCam, rightCam);
    } else {
        // 3D DISPLAY DETECTED  
        this.is3D = 1;
        this.initialize3DMode(leftCam, rightCam);
    }
}

initializeVRMode(leftCam, rightCam) {
    this.log("RENDERING for VR");
    
    // High-resolution textures with aspect ratio preservation
    const aspectRatio = this.lifView.height_px / this.lifView.width_px;
    let width = this.lifView.width_px * this.viewportScale;
    let height = this.lifView.height_px * this.viewportScale;
    
    if (width > this.MAX_TEX_SIZE_VR) {
        width = this.MAX_TEX_SIZE_VR;
        height = width * aspectRatio;
    } else if (height > this.MAX_TEX_SIZE_VR) {
        height = this.MAX_TEX_SIZE_VR;
        width = height / aspectRatio;
    }
    
    this.lifCanvasL.width = width;
    this.lifCanvasL.height = height;
    this.lifCanvasR.width = width;
    this.lifCanvasR.height = height;
    
    // Set focus distance for depth perception
    this.lifRendererL.invd = this.focus * this.lifView.inv_z_map.min;
    this.lifRendererR.invd = this.focus * this.lifView.inv_z_map.min;
}

initialize3DMode(leftCam, rightCam) {
    this.log("RENDERING for 3D");
    
    // Reduced resolution based on viewport
    this.lifCanvasL.width = leftCam.viewport.width / 2;
    this.lifCanvasL.height = leftCam.viewport.height / 2;
    this.lifCanvasR.width = rightCam.viewport.width / 2;
    this.lifCanvasR.height = rightCam.viewport.height / 2;
    this.viewportScale = 1;
    
    // No convergence distance for 3D displays
    // (invd remains at default 0)
}
```

### 4. Convergence Plane Calculation

```javascript
locateConvergencePlane(leftCam, rightCam) {
    const leftFov = this.computeFovTanAngles(leftCam);
    const rightFov = this.computeFovTanAngles(rightCam);
    
    // Extract camera positions and FOV angles
    const x0 = leftCam.position.x, y0 = leftCam.position.y, z0 = leftCam.position.z;
    const x1 = rightCam.position.x, y1 = rightCam.position.y, z1 = rightCam.position.z;
    const u0 = leftFov.tanUp, d0 = -leftFov.tanDown;
    const r0 = leftFov.tanRight, l0 = -leftFov.tanLeft;
    const u1 = rightFov.tanUp, d1 = -rightFov.tanDown;
    const r1 = rightFov.tanRight, l1 = -rightFov.tanLeft;

    const denomX = (r1 - l1 - r0 + l0);
    const isMirror = Math.abs(l0) === Math.abs(r1) && Math.abs(r0) === Math.abs(l1);

    if (Math.abs(denomX) < 0.0001 || isMirror) {
      // VR MODE: Symmetric calculation
        const DISTANCE = 0.063 / this.lifView.inv_z_map.min / this.focus;
        const width = this.viewportScale * DISTANCE / this.lifView.focal_px * this.lifView.width_px;
        const height = this.viewportScale * DISTANCE / this.lifView.focal_px * this.lifView.height_px;
        
      const centerPos = leftCam.position.clone().add(rightCam.position).multiplyScalar(0.5);
        const position = new THREE.Vector3(0, 0, -DISTANCE)
            .applyQuaternion(leftCam.quaternion).add(centerPos);

        // Remove roll for stability
      const euler = new THREE.Euler().setFromQuaternion(leftCam.quaternion, 'YXZ');
        euler.z = 0;
        const quaternion = new THREE.Quaternion().setFromEuler(euler);

        return { position, quaternion, width, height };
    } else {
        // 3D DISPLAY MODE: Asymmetric calculation using frustum intersection
      const zd = (2 * (x1 - x0) + z1 * (r1 - l1) - z0 * (r0 - l0)) / denomX;
      const xd = x0 - (r0 - l0) * (zd - z0) / 2;
      const yd = y0 - (u0 - d0) * (zd - z0) / 2;

      const width = Math.abs((z0 - zd) * (l0 + r0));
      const height = Math.abs((z0 - zd) * (u0 + d0));

      return {
        position: new THREE.Vector3(xd, yd, zd),
        quaternion: leftCam.quaternion.clone(),
            width, height
        };
    }
}
```

### 5. Dual-Eye Rendering

```javascript
renderDualEye(leftCam, rightCam) {
    // Calculate camera positions in convergence plane's local coordinate system
    const localLeftCamPos = new THREE.Vector3().copy(leftCam.position)
        .sub(this.convergencePlane.position);
    localLeftCamPos.applyQuaternion(this.convergencePlane.quaternion.clone().invert());
    
    const localRightCamPos = new THREE.Vector3().copy(rightCam.position)
          .sub(this.convergencePlane.position);
    localRightCamPos.applyQuaternion(this.convergencePlane.quaternion.clone().invert());
    
    // Capture initial positions for head tracking
    if (this.initialY === undefined) {
        this.initialY = (localLeftCamPos.y + localRightCamPos.y) / 2;
        this.initialZ = (localLeftCamPos.z + localRightCamPos.z) / 2;
        this.IPD = localLeftCamPos.distanceTo(localRightCamPos);
    }
    
    // Render left eye
    this.updateEyeRenderer(this.lifRendererL, localLeftCamPos);
    this.lifRendererL.drawScene(currentTime);
    this.lifTextureL.needsUpdate = true;
    
    // Render right eye
    this.updateEyeRenderer(this.lifRendererR, localRightCamPos);
    this.lifRendererR.drawScene(currentTime);
    this.lifTextureR.needsUpdate = true;
}

updateEyeRenderer(renderer, localCamPos) {
    // Normalize position by IPD
    renderer.renderCam.pos.x = localCamPos.x / this.IPD;
    renderer.renderCam.pos.y = (this.initialY - localCamPos.y) / this.IPD;
    renderer.renderCam.pos.z = (this.initialZ - localCamPos.z) / this.IPD;
    
    // Apply skew correction
    renderer.renderCam.sk.x = -renderer.renderCam.pos.x * renderer.invd / 
      (1 - renderer.renderCam.pos.z * renderer.invd);
    renderer.renderCam.sk.y = -renderer.renderCam.pos.y * renderer.invd / 
      (1 - renderer.renderCam.pos.z * renderer.invd);

    // Set focal length with mode-specific scaling
    renderer.renderCam.f = renderer.views[0].f * renderer.viewportScale() * 
        Math.max(1 - renderer.renderCam.pos.z * renderer.invd, 0) / this.viewportScale;
}
```

## Chrome Extension Integration

### 1. Manifest Configuration

```json
{
  "manifest_version": 3,
  "name": "ImmersityLens",
  "version": "2.0.1",
  "permissions": ["activeTab"],
  "web_accessible_resources": [{
    "resources": [
      "libs/VRPageSystem.js",
      "shaders/*.glsl"
    ],
    "matches": ["<all_urls>"]
  }],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }]
}
```

### 2. WebXROpenXRBridge Integration

```javascript
// Enhanced VR features when Chrome extension is available
if (window.WebXROpenXRBridge) {
    setTimeout(() => {
        try {
            // Set display-centric projection for better 3D display compatibility
  window.WebXROpenXRBridge.setProjectionMethod(1);
  
            // Reset settings with default scale
            setTimeout(() => {
  window.WebXROpenXRBridge.resetSettings(1.0);
  
                // Trigger convergence plane recalculation
                setTimeout(() => {
                    this.resetConvergencePlane(leftCam, rightCam);
                }, 500);
            }, 500);
        } catch (error) {
            console.error("WebXROpenXRBridge error:", error);
        }
    }, 1000);
}
```

## Embedded Shader System

The VR system includes complete embedded shaders to avoid CSP issues:

### Mono Shader Features
- Advanced raycasting with binary search refinement
- Multi-layer LDI support (up to 4 layers)
- Edge feathering and quality optimization
- GL ES compatibility for mobile VR

### Stereo Shader Features  
- Dual camera input with multiview weighting
- Stereo-specific depth handling
- Cross-eye rendering prevention
- Advanced blending for seamless stereo

```javascript
getEmbeddedMonoShader() {
    return `#version 100
precision mediump float;
// ... 332 lines of production mono shader code
`;
}

getEmbeddedStereoShader() {
    return `#version 100  
precision mediump float;
// ... 403 lines of production stereo shader code
`;
}
```

## Performance Optimization

### Display-Specific Optimizations

**VR Mode:**
- Maximum texture resolution: 1920px
- Dynamic viewport scaling: 1.2x
- Focus-based convergence calculation
- Full shader features enabled

**3D Display Mode:**
- Reduced texture resolution: viewport/2
- Direct viewport scaling: 1.0x
- No convergence calculation
- Optimized rendering pipeline

### Memory Management
```javascript
cleanup() {
    // Dispose WebGL contexts
    if (this.lifRendererL) {
        this.lifRendererL.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    
    // Clear textures and meshes
    if (this.lifTextureL) this.lifTextureL.dispose();
    if (this.lifMeshL) {
        this.lifMeshL.material.dispose();
        this.lifMeshL.geometry.dispose();
    }
    
    // Reset state variables
    this.xrCanvasInitialized = false;
    this.is3D = 1;
    this.viewportScale = 1.2;
}
```

## Troubleshooting

### Display Detection Issues
```javascript
// Debug FOV analysis
console.log("FOV Analysis:", {
    isSymmetric: Math.abs(leftFov.tanUp) === Math.abs(leftFov.tanDown),
    isEqual: Math.abs(leftFov.tanUp - rightFov.tanUp) < 0.0001,
    isMirror: Math.abs(leftFov.tanLeft) === Math.abs(rightFov.tanRight),
    denomX: (rightFov.tanRight - rightFov.tanLeft - leftFov.tanRight + leftFov.tanLeft)
});
```

### Common Issues

1. **Incorrect Display Type Detection**
   - Check FOV symmetry analysis
   - Verify camera projection matrices
   - Test denominator calculations

2. **Performance Issues**
   - Monitor texture resolution settings
   - Check for proper display mode initialization
   - Verify cleanup on session end

3. **Rendering Problems**
   - Validate convergence plane calculations
   - Check texture update flags
   - Verify layer assignments (layer 1/2)

## Development Workflow

### 1. Testing Setup
```bash
# Package extension for testing
cd ImmersityLens
./package-for-store.sh
```

### 2. Chrome Extension Loading
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select ImmersityLens folder
4. Test with LIF files on supported websites

### 3. VR Testing
1. Ensure WebXR-compatible browser
2. Connect VR headset or use 3D display
3. Load LIF file in supported format
4. Click VR button when it appears
5. Verify proper display type detection

## API Reference

### VRPageSystem Class

#### Constructor
```javascript
new PageContextVRSystem()
```

#### Key Methods
- `init()` - Initialize Three.js and WebXR
- `loadAndStartVR(lifUrl)` - Load LIF and start VR session
- `createLifVRScene(lifData)` - Create VR scene from LIF data
- `locateConvergencePlane(leftCam, rightCam)` - Calculate display geometry
- `render(time, frame)` - Main render loop
- `cleanup()` - Resource disposal

#### Properties
- `is3D` - Display type flag (0: VR, 1: 3D display)
- `viewportScale` - Rendering scale factor
- `focus` - VR convergence focus distance
- `MAX_TEX_SIZE_VR` - Maximum texture resolution

### Message API
```javascript
// Start VR session
window.postMessage({
    type: 'VR_LIF_COMMAND_START_VR',
    lifUrl: 'blob:...'
}, '*');

// Exit VR session
window.postMessage({
    type: 'VR_LIF_COMMAND_EXIT_VR'
}, '*');
```

## Browser Compatibility

- **Chrome/Edge**: Full support with WebXR flags enabled
- **Firefox**: WebXR support varies by version
- **Safari**: Limited WebXR support

## Extension Packaging

Use the provided script to create store-ready packages:

```bash
./package-for-store.sh
```

This creates a `immersitylens-v{version}.zip` file ready for Chrome Web Store submission.

## Best Practices

1. **Resource Management**
   - Always dispose WebGL contexts on cleanup
   - Use proper texture disposal
   - Reset state variables on session end

2. **Performance**
   - Monitor texture resolution for target hardware
   - Use appropriate viewport scaling
   - Enable display-specific optimizations

3. **User Experience**
   - Provide clear VR session feedback
   - Handle session failures gracefully
   - Support both headset and display types

4. **Security**
   - Use CSP-safe script injection
   - Validate LIF file formats
   - Handle cross-origin resources properly 