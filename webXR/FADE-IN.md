# WebXR Fade-In Animation Fix

## Problem
The original fade-in animation for VR planes was causing visibility issues on Apple Vision Pro. The animation used `requestAnimationFrame()` in a separate loop while WebXR uses `renderer.setAnimationLoop()`, creating timing conflicts and rendering issues.

## Root Cause
- **Mixed Animation Loops**: Separate `requestAnimationFrame()` conflicted with WebXR's `setAnimationLoop()`
- **Frame Rate Synchronization**: Different timing mechanisms caused inconsistent animation
- **Vision Pro Rendering**: Device-specific rendering characteristics affected opacity transitions

## Solution
Integrated the fade-in animation directly into the main WebXR render loop using synchronized timing:

### Key Changes:
1. **Unified Timing**: Both Vision Pro and other devices use the same fade-in mechanism
2. **WebXR-Synchronized**: Animation integrated into main render loop using `performance.now()`
3. **State Management**: Fade timing stored in plane `userData` for proper lifecycle management

### Implementation:
```javascript
// In createPlanesVR():
planeLeft.userData.fadeStartTime = null;
planeRight.userData.fadeStartTime = null;

// In renderFrame():
const currentTime = performance.now();
const fadeDuration = 1000; // 1 second fade-in

// Initialize fade start time when planes become visible
if (planeLeft.visible && planeLeft.userData.fadeStartTime === null) {
    planeLeft.userData.fadeStartTime = currentTime + 200; // 200ms delay
    planeRight.userData.fadeStartTime = currentTime + 200;
}

// Update opacity during fade-in
if (planeLeft.userData.fadeStartTime !== null && currentTime >= planeLeft.userData.fadeStartTime) {
    const elapsed = currentTime - planeLeft.userData.fadeStartTime;
    const progress = Math.min(elapsed / fadeDuration, 1.0);
    
    if (planeLeft.material && planeLeft.material.uniforms) {
        planeLeft.material.uniforms.uOpacity.value = progress;
    }
    if (planeRight.material && planeRight.material.uniforms) {
        planeRight.material.uniforms.uOpacity.value = progress;
    }
}
```

## Benefits
- **No Animation Loop Conflicts**: Single timing mechanism
- **Consistent Performance**: Frame rate independent animation
- **Vision Pro Compatible**: Handles device-specific rendering characteristics
- **Smooth Transitions**: Eliminates stuttering from mixed animation systems

## Related Fix
This works in conjunction with the Vision Pro visibility fix that forces `is3D = 0` for proper VR rendering mode.

## Date
December 2024
