# VR Viewing Session for LIF Files - Developer Reference

## Overview

This guide explains how to create a VR viewing session for Leia Image Format (LIF) files using Three.js, the LIF loading library, and custom WebGL renderers. The system supports both mono and stereo LIF files and can leverage the Chrome WebXROpenXRBridge extension for enhanced VR features.

## Architecture Overview

The VR viewing system consists of four main components:

1. **LIF Loader** (`LifLoader.js`) - Parses and extracts image/depth data from LIF files
2. **Renderers** (`Renderers.js`) - WebGL-based renderers for different view configurations
3. **Three.js WebXR Integration** - Handles VR session management and stereoscopic rendering
4. **Chrome Extension Integration** - Optional advanced VR features via `window.WebXROpenXRBridge`

## Key Concepts

### LIF File Structure
- Contains one or more views (mono or stereo)
- Each view has RGB image data and depth (inverse Z) maps
- May contain multiple layers for advanced rendering
- Includes camera metadata (position, focal length, skew, etc.)

### Rendering Pipeline
1. Load LIF file and extract views
2. Create offscreen WebGL contexts for each eye
3. Render LIF content to textures using custom shaders
4. Display textures on Three.js planes positioned in VR space
5. Update rendering based on head tracking

## Implementation Guide

### 1. HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>VR LIF Viewer</title>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.173.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.173.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <input type="file" id="filePicker" accept="image/*">
  <canvas id="glCanvas"></canvas>
  <script type="module" src="vr-lif-viewer.js"></script>
</body>
</html>
```

### 2. Core VR Implementation

```javascript
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { LifLoader } from './LifLoader.js';
import { MN2MNRenderer, ST2MNRenderer } from './Renderers.js';

class VRLifViewer {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.views = null;
    this.stereoRenderData = null;
    this.leftEyeRenderer = null;
    this.rightEyeRenderer = null;
    this.planeLeft = null;
    this.planeRight = null;
    this.texLeft = null;
    this.texRight = null;
    this.convergencePlane = null;
    this.isVRActive = false;
    this.is3D = false; // Flag to track display type (VR vs 3D display)
    this.focus = 0.01; // Focus parameter for VR depth calculation
    this.viewportScale = 1.2; // Viewport scaling factor
  }

  async init() {
    // Setup Three.js scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.scene.add(this.camera);

    // Setup WebGL renderer with XR support
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // Add VR button
    const vrButton = VRButton.createButton(this.renderer);
    document.body.appendChild(vrButton);

    // Setup XR session event handlers
    this.renderer.xr.addEventListener('sessionstart', () => this.onXRSessionStart());
    this.renderer.xr.addEventListener('sessionend', () => this.onXRSessionEnd());

    // Setup file picker
    document.getElementById('filePicker').addEventListener('change', (e) => this.loadLIF(e));
  }

  async loadLIF(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Load LIF file
      const loader = new LifLoader();
      await loader.load(file);
      
      this.views = loader.views;
      this.stereoRenderData = loader.stereo_render_data;

      // Create offscreen renderers
      await this.createOffscreenRenderers();

      // Start animation loop
      this.animate();
    } catch (error) {
      console.error('Error loading LIF:', error);
    }
  }

  async createOffscreenRenderers() {
    // Create offscreen canvases for left and right eye
    const canvasL = document.createElement('canvas');
    const canvasR = document.createElement('canvas');
    
    // Set canvas dimensions based on view size (limit to 1920px for performance)
    const maxSize = 1920;
    const aspectRatio = this.views[0].height_px / this.views[0].width_px;
    canvasL.width = Math.min(maxSize, this.views[0].width_px);
    canvasL.height = Math.round(canvasL.width * aspectRatio);
    canvasR.width = canvasL.width;
    canvasR.height = canvasL.height;

    // Get WebGL contexts
    const glL = canvasL.getContext('webgl');
    const glR = canvasR.getContext('webgl');

    // Create renderers based on view count (mono or stereo)
    if (this.views.length === 1) {
      // Mono LIF - use MN2MNRenderer for both eyes
      this.leftEyeRenderer = await MN2MNRenderer.createInstance(
        glL, 'shaders/rayCastMonoLDI.glsl', this.views, false, maxSize
      );
      this.rightEyeRenderer = await MN2MNRenderer.createInstance(
        glR, 'shaders/rayCastMonoLDI.glsl', this.views, false, maxSize
      );
    } else {
      // Stereo LIF - use ST2MNRenderer
      this.leftEyeRenderer = await ST2MNRenderer.createInstance(
        glL, 'shaders/rayCastStereoLDI.glsl', this.views, false, maxSize
      );
      this.rightEyeRenderer = await ST2MNRenderer.createInstance(
        glR, 'shaders/rayCastStereoLDI.glsl', this.views, false, maxSize
      );
    }

    // Set convergence distance if available
    if (this.stereoRenderData) {
      this.leftEyeRenderer.invd = this.stereoRenderData.inv_convergence_distance;
      this.rightEyeRenderer.invd = this.stereoRenderData.inv_convergence_distance;
    } else {
      // Default convergence for VR mode will be set dynamically based on display type
      this.leftEyeRenderer.invd = 0;
      this.rightEyeRenderer.invd = 0;
    }

    // Create Three.js textures from canvases
    this.texLeft = new THREE.CanvasTexture(canvasL);
    this.texRight = new THREE.CanvasTexture(canvasR);
  }

  onXRSessionStart() {
    this.isVRActive = true;
    
    // Create VR planes if not already created
    if (!this.planeLeft || !this.planeRight) {
      this.createVRPlanes();
    }

    // Setup controllers
    this.setupVRControllers();

    // Initialize convergence plane
    const xrCam = this.renderer.xr.getCamera(this.camera);
    if (xrCam.isArrayCamera && xrCam.cameras.length === 2) {
      this.convergencePlane = this.calculateConvergencePlane(
        xrCam.cameras[0], xrCam.cameras[1]
      );
      this.updatePlanePositions();
    }

    // Chrome extension integration
    if (window.WebXROpenXRBridge) {
      setTimeout(() => {
        window.WebXROpenXRBridge.setProjectionMethod(1); // Display-centric projection
        console.log('WebXROpenXRBridge: Set display-centric projection');
      }, 1000);
    }
  }

  onXRSessionEnd() {
    this.isVRActive = false;
  }

  createVRPlanes() {
    // Create shader material for left eye
    const materialLeft = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.texLeft },
        uOpacity: { value: 1.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec4 texColor = texture2D(uTexture, vUv);
          gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity);
        }
      `,
      transparent: true
    });

    // Create shader material for right eye (similar to left)
    const materialRight = materialLeft.clone();
    materialRight.uniforms.uTexture.value = this.texRight;

    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(1, 1);

    // Create meshes
    this.planeLeft = new THREE.Mesh(geometry, materialLeft);
    this.planeLeft.layers.set(1); // Only visible to left eye
    this.scene.add(this.planeLeft);

    this.planeRight = new THREE.Mesh(geometry, materialRight);
    this.planeRight.layers.set(2); // Only visible to right eye
    this.scene.add(this.planeRight);
  }

  calculateConvergencePlane(leftCam, rightCam) {
    // Get camera frustum data from projection matrices
    const leftFov = this.computeFovTanAngles(leftCam);
    const rightFov = this.computeFovTanAngles(rightCam);
    
    // Analyze frustum characteristics to determine display type
    const isSymmetric = Math.abs(leftFov.tanUp) === Math.abs(leftFov.tanDown) &&
        Math.abs(leftFov.tanLeft) === Math.abs(leftFov.tanRight);
    const isEqual = Math.abs(leftFov.tanUp - rightFov.tanUp) < 0.0001 &&
        Math.abs(leftFov.tanDown - rightFov.tanDown) < 0.0001 &&
        Math.abs(leftFov.tanLeft - rightFov.tanLeft) < 0.0001 &&
        Math.abs(leftFov.tanRight - rightFov.tanRight) < 0.0001;
    const isMirror = Math.abs(leftFov.tanLeft) === Math.abs(rightFov.tanRight) && 
        Math.abs(leftFov.tanRight) === Math.abs(rightFov.tanLeft) && 
        Math.abs(leftFov.tanUp) === Math.abs(rightFov.tanUp) && 
        Math.abs(leftFov.tanDown) === Math.abs(rightFov.tanDown);

    // Extract FOV angles
    const u0 = leftFov.tanUp, d0 = -leftFov.tanDown;
    const r0 = leftFov.tanRight, l0 = -leftFov.tanLeft;
    const u1 = rightFov.tanUp, d1 = -rightFov.tanDown;
    const r1 = rightFov.tanRight, l1 = -rightFov.tanLeft;

    // Calculate denominators for 3D display position calculation
    const denomX = (r1 - l1 - r0 + l0);
    const denomY = (u1 - d1 - u0 + d0);

    // Determine if this is VR (symmetric/mirrored frustums) or 3D display (asymmetric)
    if (Math.abs(denomX) < 0.0001 || isMirror) {
      // VR MODE: Symmetric calculation
      console.log("Detected VR headset - using symmetric calculation");
      this.is3D = false;
      
      const IPD = 0.063; // Standard interpupillary distance
      const focus = 0.01; // Focus parameter for depth calculation
      const viewportScale = 1.2; // Scale factor for viewport
      
      // Calculate distance based on LIF depth data
      const distance = IPD / this.views[0].inv_z_map.min / focus;
      
      // Calculate plane dimensions based on LIF content
      const width = viewportScale * distance / this.views[0].focal_px * this.views[0].width_px;
      const height = viewportScale * distance / this.views[0].focal_px * this.views[0].height_px;
      
      // Position plane in front of cameras
      const centerPos = leftCam.position.clone().add(rightCam.position).multiplyScalar(0.5);
      const position = new THREE.Vector3(0, 0, -distance)
        .applyQuaternion(leftCam.quaternion)
        .add(centerPos);

      // Remove roll from quaternion for stability
      const euler = new THREE.Euler().setFromQuaternion(leftCam.quaternion, 'YXZ');
      euler.z = 0; // Remove roll
      const noRollQuat = new THREE.Quaternion().setFromEuler(euler);

      return { position, quaternion: noRollQuat, width, height };
      
    } else {
      // 3D DISPLAY MODE: Asymmetric calculation
      console.log("Detected 3D display - using asymmetric calculation");
      this.is3D = true;
      
      // Get camera positions
      const x0 = leftCam.position.x, y0 = leftCam.position.y, z0 = leftCam.position.z;
      const x1 = rightCam.position.x, y1 = rightCam.position.y, z1 = rightCam.position.z;

      // Calculate physical display position using frustum intersection
      const zd = (2 * (x1 - x0) + z1 * (r1 - l1) - z0 * (r0 - l0)) / denomX;
      const xd = x0 - (r0 - l0) * (zd - z0) / 2;
      const yd = y0 - (u0 - d0) * (zd - z0) / 2;

      // Calculate physical display dimensions
      const width = Math.abs((z0 - zd) * (l0 + r0));
      const height = Math.abs((z0 - zd) * (u0 + d0));

      return {
        position: new THREE.Vector3(xd, yd, zd),
        quaternion: leftCam.quaternion.clone(),
        width, 
        height
      };
    }
  }

  computeFovTanAngles(camera) {
    // Extract FOV data from WebXR camera projection matrix
    const projMatrix = camera.projectionMatrix;
    const m00 = projMatrix.elements[0];
    const m05 = projMatrix.elements[5];
    const m08 = projMatrix.elements[8];
    const m09 = projMatrix.elements[9];

    // Calculate frustum boundaries
    const left = (1 - m08) / m00;
    const right = (1 + m08) / m00;
    const bottom = (1 - m09) / m05;
    const top = (1 + m09) / m05;

    return {
      tanUp: top,
      tanDown: -bottom,
      tanLeft: -left,
      tanRight: right
    };
  }

  updatePlanePositions() {
    if (!this.convergencePlane) return;

    // Update both planes to convergence position
    this.planeLeft.position.copy(this.convergencePlane.position);
    this.planeLeft.quaternion.copy(this.convergencePlane.quaternion);
    this.planeLeft.scale.set(this.convergencePlane.width, this.convergencePlane.height, 1);

    this.planeRight.position.copy(this.convergencePlane.position);
    this.planeRight.quaternion.copy(this.convergencePlane.quaternion);
    this.planeRight.scale.set(this.convergencePlane.width, this.convergencePlane.height, 1);
  }

  setupVRControllers() {
    // Controller setup would go here
    // See full implementation for controller tracking details
  }

  animate() {
    this.renderer.setAnimationLoop(() => this.render());
  }

  render() {
    if (this.isVRActive && this.leftEyeRenderer && this.rightEyeRenderer) {
      const xrCam = this.renderer.xr.getCamera(this.camera);
      
      if (xrCam.isArrayCamera && xrCam.cameras.length === 2) {
        const leftCam = xrCam.cameras[0];
        const rightCam = xrCam.cameras[1];

        // Enable layers for each eye
        leftCam.layers.enable(1);
        rightCam.layers.enable(2);

        // Update renderer settings based on display type
        if (this.is3D) {
          // 3D Display Mode: Use reduced resolution and simple scaling
          this.leftEyeRenderer.gl.canvas.width = leftCam.viewport?.width / 2 || 960;
          this.leftEyeRenderer.gl.canvas.height = leftCam.viewport?.height / 2 || 540;
          this.rightEyeRenderer.gl.canvas.width = rightCam.viewport?.width / 2 || 960;
          this.rightEyeRenderer.gl.canvas.height = rightCam.viewport?.height / 2 || 540;
          this.viewportScale = 1.0;
        } else {
          // VR Mode: Use optimized resolution and set convergence
          const maxSize = 1920;
          const aspectRatio = this.views[0].height_px / this.views[0].width_px;
          let width = this.views[0].width_px * this.viewportScale;
          let height = this.views[0].height_px * this.viewportScale;
          
          if (width > maxSize) {
            width = maxSize;
            height = width * aspectRatio;
          } else if (height > maxSize) {
            height = maxSize;
            width = height / aspectRatio;
          }
          
          this.leftEyeRenderer.gl.canvas.width = width;
          this.leftEyeRenderer.gl.canvas.height = height;
          this.rightEyeRenderer.gl.canvas.width = width;
          this.rightEyeRenderer.gl.canvas.height = height;
          
          // Set convergence for VR mode
          this.leftEyeRenderer.invd = this.focus * this.views[0].inv_z_map.min;
          this.rightEyeRenderer.invd = this.focus * this.views[0].inv_z_map.min;
        }

        // Calculate camera positions relative to convergence plane
        const localLeftPos = leftCam.position.clone()
          .sub(this.convergencePlane.position);
        const localRightPos = rightCam.position.clone()
          .sub(this.convergencePlane.position);

        // Update renderer camera positions
        this.updateRendererCamera(this.leftEyeRenderer, localLeftPos);
        this.updateRendererCamera(this.rightEyeRenderer, localRightPos);

        // Render LIF content to textures
        this.leftEyeRenderer.drawScene();
        this.texLeft.needsUpdate = true;

        this.rightEyeRenderer.drawScene();
        this.texRight.needsUpdate = true;
      }
    }

    // Render Three.js scene
    this.renderer.render(this.scene, this.camera);
  }

  updateRendererCamera(renderer, localPos) {
    // Normalize position by IPD (interpupillary distance)
    const IPD = 0.063; // Default 63mm
    renderer.renderCam.pos.x = localPos.x / IPD;
    renderer.renderCam.pos.y = localPos.y / IPD;
    renderer.renderCam.pos.z = localPos.z / IPD;

    // Update skew based on position
    renderer.renderCam.sk.x = -renderer.renderCam.pos.x * renderer.invd / 
      (1 - renderer.renderCam.pos.z * renderer.invd);
    renderer.renderCam.sk.y = -renderer.renderCam.pos.y * renderer.invd / 
      (1 - renderer.renderCam.pos.z * renderer.invd);

    // Update focal length with viewport scaling
    const viewportScaling = this.is3D ? 1.0 : this.viewportScale;
    renderer.renderCam.f = renderer.views[0].f * renderer.viewportScale() * 
      Math.max(1 - renderer.renderCam.pos.z * renderer.invd, 0) / viewportScaling;
  }
}

// Initialize viewer
const viewer = new VRLifViewer();
viewer.init();
```

### 3. Chrome Extension Integration

The WebXROpenXRBridge extension provides advanced VR features:

```javascript
// Check if extension is available
if (window.WebXROpenXRBridge) {
  // Set projection method (0: viewer-centric, 1: display-centric)
  window.WebXROpenXRBridge.setProjectionMethod(1);
  
  // Reset settings with optional scale factor
  window.WebXROpenXRBridge.resetSettings(1.0);
  
  // Extension provides optimized rendering for supported headsets
}
```

## Key Implementation Details

### 1. Display Type Detection
The system automatically detects whether it's running on a VR headset or 3D display by analyzing camera frustums:

**VR Detection Criteria:**
- Symmetric frustums (left/right FOVs are mirrored)
- Equal vertical FOVs between eyes
- Near-zero denominator in 3D display calculations

**3D Display Detection Criteria:**
- Asymmetric frustums (different left/right boundaries)
- Cameras positioned to view a physical display surface
- Non-zero denominators allowing 3D position calculation

### 2. Convergence Plane Calculation

**For VR Headsets:**
```javascript
// Calculate distance based on IPD and LIF depth data
const distance = IPD / views[0].inv_z_map.min / focus;

// Scale plane to match LIF content dimensions
const width = viewportScale * distance / views[0].focal_px * views[0].width_px;
const height = viewportScale * distance / views[0].focal_px * views[0].height_px;
```

**For 3D Displays:**
```javascript
// Calculate physical display position using frustum intersection
const zd = (2 * (x1 - x0) + z1 * (r1 - l1) - z0 * (r0 - l0)) / denomX;
const xd = x0 - (r0 - l0) * (zd - z0) / 2;

// Calculate physical display dimensions
const width = Math.abs((z0 - zd) * (l0 + r0));
```

### 3. Adaptive Rendering Settings
- **VR Mode**: High resolution (up to 1920px), dynamic convergence
- **3D Display Mode**: Reduced resolution (viewport/2), fixed scaling
- Automatic texture size optimization based on detected hardware

### 4. Layer Management
- Left eye content only visible to left camera (layer 1)
- Right eye content only visible to right camera (layer 2)
- Prevents cross-talk between eyes

### 5. Performance Optimization
- Adaptive resolution based on display type
- Efficient shader-based rendering
- Dynamic convergence adjustment for VR
- Resource cleanup on session end

## Shader Requirements

The system requires custom GLSL shaders for LIF rendering:

- `rayCastMonoLDI.glsl` - For mono LIF files
- `rayCastStereoLDI.glsl` - For stereo LIF files

These shaders handle:
- Depth-based pixel displacement
- Multi-layer compositing
- View-dependent rendering

## Troubleshooting

### Common Issues

1. **Black screen in VR**
   - Check texture updates (`texture.needsUpdate = true`)
   - Verify layer assignments (left eye: layer 1, right eye: layer 2)
   - Ensure shaders compiled successfully
   - Verify convergence plane calculation didn't return NaN values

2. **Performance issues**
   - Check if proper display type was detected (VR vs 3D display)
   - Verify texture resolution is appropriate for hardware
   - Monitor GPU memory usage
   - Check if too many render calls per frame

3. **Incorrect convergence/positioning**
   - Verify camera projection matrices are valid
   - Check frustum analysis results (symmetric vs asymmetric)
   - Ensure IPD calculations are reasonable (around 0.063m)
   - Validate convergence plane position isn't behind cameras

4. **Display type misdetection**
   - Log FOV analysis results (isSymmetric, isEqual, isMirror)
   - Check denominator values in convergence calculation
   - Verify camera positions are different between left/right
   - Test with different focus values if VR detection fails

## Best Practices

1. **Resource Management**
   - Dispose textures and contexts when done
   - Release blob URLs after loading
   - Clear WebGL contexts on session end

2. **Error Handling**
   - Validate LIF file format
   - Check WebGL context creation
   - Handle XR session failures gracefully

3. **User Experience**
   - Provide loading indicators
   - Fade in content smoothly
   - Support controller interactions

## References

- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [Three.js WebXR Documentation](https://threejs.org/docs/#manual/en/introduction/How-to-create-VR-content)
- [Leia LIF Format Specification](https://www.leiainc.com/) 