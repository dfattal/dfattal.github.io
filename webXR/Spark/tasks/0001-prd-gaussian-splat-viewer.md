# Product Requirements Document: WebXR Gaussian Splat Viewer

## Introduction/Overview

This document outlines the requirements for building a WebXR Gaussian Splat viewer using Spark (based on Three.js). The viewer will enable users to easily load and view 3D Gaussian Splat captures in both traditional 2D browser mode and immersive VR/AR (WebXR) environments.

**Problem Statement:** Users currently lack an easy, accessible way to view Gaussian Splat 3D captures in immersive environments. This viewer will provide a simple drag-and-drop or URL-based interface for loading and experiencing these captures in WebXR.

**Goal:** Create an intuitive, performant WebXR application that allows users to load Gaussian Splat files (including Luma AI captures) and view them in both 2D and immersive XR modes with minimal friction.

## Goals

1. Enable users to load Gaussian Splat files via drag-and-drop or URL input
2. Support Luma AI captures using the official LumaSplatsThree loader
3. Provide seamless transition between 2D preview and immersive XR viewing
4. Ensure consistent performance across different XR devices through quality presets
5. Achieve a high successful load rate (>95%) for supported file formats
6. Deliver an intuitive user experience suitable for both technical and non-technical users

## User Stories

1. **As a 3D capture creator**, I want to drag and drop my Gaussian Splat file into the viewer so that I can quickly preview it in VR without complex setup.

2. **As a VR enthusiast**, I want to load a splat from a URL so that I can easily share and view 3D captures from the web.

3. **As a Luma AI user**, I want to view my Luma captures in WebXR so that I can experience them in an immersive environment.

4. **As a user with a lower-end XR device**, I want to adjust quality settings so that the viewer runs smoothly on my hardware.

5. **As a developer**, I want to preview splats in 2D mode before entering XR so that I can verify the file loaded correctly.

6. **As a user experiencing loading issues**, I want clear error messages with retry options so that I can troubleshoot and successfully load my content.

## Functional Requirements

### Core Loading Features

1. The system must support drag-and-drop file upload for Gaussian Splat files directly into the browser window.

2. The system must provide a "Load from URL" input field that accepts direct links to splat files.

3. The system must support the following file formats:
   - `.splat` (standard Gaussian Splat format)
   - `.ply` (point cloud format commonly used for Gaussian Splats)
   - Luma AI captures via their URL format

4. The system must integrate the LumaSplatsThree loader from Luma AI's web library (https://lumalabs.ai/luma-web-library) for Luma AI captures.

5. The system must validate file types before attempting to load and provide appropriate feedback.

### Viewing & Display

6. The system must render loaded Gaussian Splats in both 2D browser mode and WebXR mode.

7. The system must maintain the loaded splat content when transitioning between 2D and XR modes (session persistence).

8. The system must center the loaded splat in the scene with appropriate default scaling for comfortable viewing.

9. The system must provide three quality presets: Low, Medium, and High, to accommodate different device capabilities.

10. The quality preset selector must be accessible in the UI before entering XR mode.

### WebXR Integration

11. The system must be built using Spark framework (https://sparkjs.dev/) leveraging Three.js for WebXR support.

12. The system must provide an "Enter VR/AR" button consistent with WebXR standards.

13. The system must support both VR and AR modes where the device allows.

14. The system must follow WebXR best practices for immersive experiences as demonstrated in Spark examples.

### User Interface

15. The system must provide a clean, minimal UI similar to the Spark editor example (https://sparkjs.dev/examples/#editor).

16. The UI must include:
    - Drag-and-drop zone with visual feedback
    - URL input field with "Load" button
    - Quality preset selector (Low/Medium/High)
    - "Enter VR/AR" button
    - Current file/status indicator

17. The UI must be responsive and work on both desktop and mobile browsers.

### Error Handling

18. The system must display clear, user-friendly error messages when:
    - File format is not supported
    - File fails to load
    - Network error occurs (for URL loading)
    - WebXR is not available on the device

19. Error messages must include a "Retry" option that allows users to attempt loading again.

20. The system must log technical error details to the browser console for debugging purposes while showing simplified messages to users.

### Performance

21. The system must optimize rendering performance based on the selected quality preset:
    - **Low**: Reduced splat count/resolution for mobile XR devices
    - **Medium**: Balanced quality for standalone XR headsets
    - **High**: Maximum quality for PC VR setups

22. The system must display a loading indicator during file processing.

23. The system must render at a minimum of 60 FPS in XR mode on target devices when using appropriate quality settings.

## Non-Goals (Out of Scope)

1. **Multi-splat loading**: Loading and displaying multiple splat files simultaneously is not included in this MVP. This may be considered for future iterations.

2. **Splat editing**: The viewer will not provide tools to edit, modify, or author Gaussian Splats.

3. **File conversion**: The system will not convert between different splat file formats.

4. **Social features**: No sharing, commenting, or collaborative viewing features.

5. **Backend storage**: No server-side storage of uploaded files. All processing happens client-side.

6. **Custom environments**: No ability to add custom backgrounds, lighting, or environmental effects beyond defaults.

7. **Advanced XR interactions**: No support for grabbing, scaling, or rotating splats in XR (view-only for MVP).

## Design Considerations

### UI/UX Design

- Follow the clean, minimal aesthetic of the Spark editor example
- Use a dark theme consistent with other Spark examples
- Provide clear visual feedback for drag-and-drop zones (highlight on hover/drag)
- Loading states should use subtle animations to indicate progress
- Error states should use non-intrusive notifications that don't block the UI

### Reference Examples

- **WebXR Integration**: https://sparkjs.dev/examples/#webxr
- **File Loading UI Pattern**: https://sparkjs.dev/examples/#editor
- **Luma AI Integration**: https://lumalabs.ai/luma-web-library

### Accessibility

- All interactive elements must be keyboard accessible
- Provide appropriate ARIA labels for screen readers
- Ensure sufficient color contrast for text and UI elements

## Technical Considerations

### Dependencies

- **Spark Framework**: Primary framework for WebXR functionality
- **Three.js**: 3D rendering engine (included with Spark)
- **LumaSplatsThree**: Luma AI's official Three.js loader for their captures
- Standard Gaussian Splat loaders for `.splat` and `.ply` formats

### Architecture

- Client-side only application (no backend required)
- Files loaded directly in browser memory
- Progressive enhancement: works in 2D even without XR support

### Browser Compatibility

- Target modern browsers with WebXR support (Chrome, Edge, Firefox)
- Graceful degradation for browsers without WebXR (2D viewing only)
- Mobile browser support for AR experiences

### Performance Optimization

- Implement quality presets that adjust:
  - Splat point count/density
  - Rendering resolution
  - Texture quality (if applicable)
- Use Web Workers for file parsing if needed to prevent UI blocking
- Implement efficient memory management for large splat files

### Known Technical Constraints

- WebXR availability depends on user's browser and device
- File size limitations based on browser memory constraints
- Network speed affects URL-based loading performance

## Success Metrics

### Primary Metric

**Successful Load Rate**: Percentage of splat files that successfully load and render without errors. Target: >95%

### Supporting Metrics

- Time to first render (from file selection to visible splat)
- Frame rate consistency in XR mode
- Error rate by file format
- Browser/device compatibility coverage

### Monitoring

- Implement client-side analytics to track:
  - Load success/failure events
  - File formats used
  - Quality preset selections
  - Error types and frequencies
  - Browser/device combinations

## Open Questions

1. **File size limits**: What is the maximum reasonable file size we should support? Should we warn users about large files?

2. **Default quality preset**: Which quality preset should be selected by default? Should it auto-detect based on device type?

3. **Camera positioning**: What should the default camera position be relative to loaded splats? Should we auto-calculate based on splat bounds?

4. **Luma AI authentication**: Do Luma AI captures require authentication/API keys, or are public URLs freely accessible?

5. **Sample content**: Should we provide sample splat files or Luma URLs for users to test the viewer immediately?

6. **Mobile XR priority**: Should we prioritize mobile AR (phone-based) or standalone VR headsets (Quest, etc.) if optimization trade-offs are needed?

7. **Splat origin/orientation**: How should we handle splats with different coordinate systems or orientations? Should we provide manual orientation controls?

---

**Document Version**: 1.0
**Created**: 2025-10-20
**Status**: Ready for Development
