# Task List: Gaussian Splat Viewer for WebXR

Generated from: `0001-prd-gaussian-splat-viewer.md`

## Relevant Files

### Core Application Files
- `index.html` - Main HTML file with UI structure, Three.js import map, and styling
- `index.js` - Main application logic, scene setup, file loading, and WebXR integration
- `README.md` - User documentation and usage instructions

### Gaussian Splat Loaders
- `loaders/SplatLoader.js` - Loader for standard .splat format files
- `loaders/PLYLoader.js` - Loader for .ply point cloud format (may use Three.js PLYLoader as base)
- `loaders/LumaSplatsLoader.js` - Wrapper for Luma AI's LumaSplatsThree loader

### Utilities
- `utils/fileValidator.js` - File type validation and error checking
- `utils/qualityPresets.js` - Quality preset configurations (Low/Medium/High)

### Notes
- Following the pattern established in LDIPlayer for drag-and-drop UI and WebXR integration
- Using Three.js v0.173.0 via CDN import map (no build step required)
- Luma AI loader will be loaded from their CDN: https://unpkg.com/@lumaai/luma-web@latest/dist/library/luma-web.module.js

## Tasks

- [ ] 1.0 Project Setup and Dependencies
  - [ ] 1.1 Create project directory structure (`/loaders`, `/utils`)
  - [ ] 1.2 Create `index.html` with Three.js v0.173.0 import map configuration
  - [ ] 1.3 Add Luma AI library import to import map or as external module
  - [ ] 1.4 Create empty `index.js` module file with basic imports
  - [ ] 1.5 Set up basic project README with overview and tech stack

- [ ] 2.0 Core UI Implementation (HTML/CSS)
  - [ ] 2.1 Create dark-themed UI structure in `index.html` (following LDIPlayer pattern)
  - [ ] 2.2 Add drag-and-drop zone with visual feedback (border highlight on drag-over)
  - [ ] 2.3 Implement URL input field with "Load" button
  - [ ] 2.4 Add quality preset selector (dropdown or radio buttons for Low/Medium/High)
  - [ ] 2.5 Create "Enter VR/AR" button placeholder (will be replaced by VRButton)
  - [ ] 2.6 Add loading indicator/spinner element (hidden by default)
  - [ ] 2.7 Create info display panel for current file status
  - [ ] 2.8 Add error message display container (hidden by default)
  - [ ] 2.9 Make UI responsive for mobile and desktop with CSS media queries

- [ ] 3.0 File Loading System (Drag-and-Drop + URL Input)
  - [ ] 3.1 Create `utils/fileValidator.js` to validate file extensions (.splat, .ply, .glb for Luma)
  - [ ] 3.2 Implement drag-and-drop event handlers (dragover, dragleave, drop)
  - [ ] 3.3 Add visual feedback for drag-over state (border color change)
  - [ ] 3.4 Implement file input click handler for traditional file browsing
  - [ ] 3.5 Create URL loading function with fetch and error handling
  - [ ] 3.6 Add loading state management (show/hide spinner, disable inputs during load)
  - [ ] 3.7 Implement file/blob conversion for drag-and-drop files
  - [ ] 3.8 Add file size validation and warning for files >100MB

- [ ] 4.0 Gaussian Splat Parsing and Integration
  - [ ] 4.1 Research and implement `loaders/SplatLoader.js` for standard .splat format
  - [ ] 4.2 Create `loaders/PLYLoader.js` using Three.js PLYLoader as base
  - [ ] 4.3 Integrate Luma AI's LumaSplatsThree loader in `loaders/LumaSplatsLoader.js`
  - [ ] 4.4 Create unified loader interface that detects file type and routes to appropriate loader
  - [ ] 4.5 Test each loader with sample files (create test file list in README)
  - [ ] 4.6 Add parser error handling for corrupted/invalid splat files
  - [ ] 4.7 Implement progress callbacks for large file loading
  - [ ] 4.8 Add automatic centering and scaling of loaded splat based on bounding box

- [ ] 5.0 Three.js Scene and Rendering Setup
  - [ ] 5.1 Initialize Three.js scene, camera (PerspectiveCamera), and renderer
  - [ ] 5.2 Set up WebGLRenderer with XR-compatible settings (antialias, alpha)
  - [ ] 5.3 Configure camera with appropriate FOV and near/far clipping planes
  - [ ] 5.4 Add basic lighting (ambient + directional) suitable for splat viewing
  - [ ] 5.5 Create render loop with requestAnimationFrame
  - [ ] 5.6 Implement scene.add() logic for loaded splat objects
  - [ ] 5.7 Add background (solid color or gradient appropriate for XR)
  - [ ] 5.8 Configure renderer pixel ratio for retina displays
  - [ ] 5.9 Add window resize handler to maintain aspect ratio

- [ ] 6.0 WebXR Integration and Controls
  - [ ] 6.1 Import VRButton from 'three/addons/webxr/VRButton.js'
  - [ ] 6.2 Enable XR support on renderer (renderer.xr.enabled = true)
  - [ ] 6.3 Replace placeholder button with VRButton.createButton(renderer)
  - [ ] 6.4 Update render loop to use renderer.setAnimationLoop for XR compatibility
  - [ ] 6.5 Test VR mode entry/exit and verify splat persists
  - [ ] 6.6 Add basic XR controller support (optional for MVP, but good to have)
  - [ ] 6.7 Implement camera positioning in XR space (default view distance from splat)
  - [ ] 6.8 Test AR mode if supported (AR mode may require different background handling)

- [ ] 7.0 Quality Presets and Performance Optimization
  - [ ] 7.1 Create `utils/qualityPresets.js` with Low/Medium/High configurations
  - [ ] 7.2 Define quality settings (splat point count reduction, render resolution scale)
  - [ ] 7.3 Implement quality preset selector UI binding in index.js
  - [ ] 7.4 Add logic to apply quality preset to loaded splat (point decimation)
  - [ ] 7.5 Test performance on different devices (mobile, standalone VR, PC VR)
  - [ ] 7.6 Optimize renderer settings per quality level (pixel ratio, shadow quality)
  - [ ] 7.7 Add FPS counter (optional, for debugging) to verify 60fps target
  - [ ] 7.8 Implement automatic quality recommendation based on device detection

- [ ] 8.0 Error Handling and User Feedback
  - [ ] 8.1 Create error display function that shows user-friendly messages
  - [ ] 8.2 Implement retry button logic for failed loads
  - [ ] 8.3 Add specific error messages for: unsupported format, network error, parse error
  - [ ] 8.4 Log detailed technical errors to console for debugging
  - [ ] 8.5 Add WebXR availability check with fallback message for unsupported devices
  - [ ] 8.6 Implement loading timeout (30 seconds) with error message
  - [ ] 8.7 Add file validation errors with helpful suggestions (e.g., "Try .splat or .ply format")
  - [ ] 8.8 Create success notification when splat loads successfully

- [ ] 9.0 Testing and Documentation
  - [ ] 9.1 Test drag-and-drop with .splat files on desktop and mobile
  - [ ] 9.2 Test URL loading with various splat file URLs
  - [ ] 9.3 Test Luma AI capture loading with sample Luma URL
  - [ ] 9.4 Test all three quality presets on different devices
  - [ ] 9.5 Test VR mode on Quest/other VR headsets
  - [ ] 9.6 Test AR mode on compatible mobile devices
  - [ ] 9.7 Document supported file formats and sample URLs in README
  - [ ] 9.8 Add troubleshooting section to README for common errors
  - [ ] 9.9 Create usage examples with screenshots/GIFs (optional but recommended)

---

**Status**: Full task list generated. Ready for implementation.
