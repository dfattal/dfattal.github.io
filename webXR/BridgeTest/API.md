# WebXR-OpenXR Bridge API Documentation

This document describes the JavaScript API for interacting with OpenXR runtime settings from WebXR applications.

## Overview

The WebXR-OpenXR Bridge provides a JavaScript API to control OpenXR runtime settings from web applications. **All methods return Promises** and can be used with async/await for clean, sequential operations.

⚡ **True Async Behavior**: SET operations now wait for **actual confirmation** from the OpenXR runtime that settings have been applied, not just that the message was sent.

The API is exposed as `window.WebXROpenXRBridge` and is available on any webpage after the extension is installed.

## Method Summary

| Category | Method | GET | SET | Description |
|----------|--------|-----|-----|-------------|
| **Visual Settings** | `IPDScale` | ✅ | ✅ | Interpupillary distance scale (stereo separation) |
| | `SceneScale` | ✅ | ✅ | Overall scene scale/zoom level |
| | `ProjectionMethod` | ✅ | ✅ | Projection rendering method (Camera/Display centric) |
| | `ParallaxStrength` | ✅ | ✅ | Parallax/lookaround effect strength |
| | `Convergence` | ✅ | ✅ | Convergence offset for depth perception |
| | `PerspectiveFactor` | ✅ | ✅ | Perspective distortion factor |
| **Control Settings** | `ControlMode` | ✅ | ✅ | Camera/view control method (First Person/Fly) |
| **Pose Control** | `HeadPose` | ✅ | ✅ | Head/camera position and orientation |
| | `LeftHandPose` | ✅ | ✅ | Left hand position and orientation |
| | `RightHandPose` | ✅ | ✅ | Right hand position and orientation |
| **Window Management** | `FullScreen` | ✅ | ✅ | Fullscreen state of OpenXR window |
| | `WindowRect` | ✅ | ✅ | Window position and size |
| **Session Management** | `isAnySessionActive()` | ✅ | ❌ | Check if any VR session is active |
| | `getActiveSessionInfo()` | ✅ | ❌ | Get active session details |
| | `forceCloseActiveSession()` | ❌ | ✅ | Force close active VR session |
| **System Control** | `resetSettings()` | ❌ | ✅ | Reset all settings to defaults |

## API Reference

### Visual Settings

#### `getIPDScale()` / `setIPDScale(value)`
Controls the interpupillary distance scale (stereo separation).
```javascript
// Get current IPD scale
const ipdScale = await WebXROpenXRBridge.getIPDScale();
// Returns: number (default: 1.0)

// Set IPD scale (async - waits for actual application)
await WebXROpenXRBridge.setIPDScale(1.2);
// Parameters: value (number) - Scale factor (0.1 to 3.0 recommended)
```

#### `getSceneScale()` / `setSceneScale(value)`
Controls the overall scene scale/zoom level.
```javascript
// Get current scene scale
const sceneScale = await WebXROpenXRBridge.getSceneScale();
// Returns: number (default: 1.0)

// Set scene scale (async - waits for actual application)
await WebXROpenXRBridge.setSceneScale(1.5);
// Parameters: value (number) - Scale factor (0.1 to 5.0 recommended)
```

#### `getProjectionMethod()` / `setProjectionMethod(method)`
Controls the projection rendering method.
```javascript
// Get current projection method
const method = await WebXROpenXRBridge.getProjectionMethod();
// Returns: number (0 = Camera Centric, 1 = Display Centric)

// Set projection method (async - waits for actual application)
await WebXROpenXRBridge.setProjectionMethod(1);
// Parameters: method (number) - 0 for Camera Centric, 1 for Display Centric
```

#### `getParallaxStrength()` / `setParallaxStrength(value)`
Controls the parallax/lookaround effect strength.
```javascript
// Get current parallax strength
const parallax = await WebXROpenXRBridge.getParallaxStrength();
// Returns: number (default: 1.0)

// Set parallax strength (async - waits for actual application)
await WebXROpenXRBridge.setParallaxStrength(0.8);
// Parameters: value (number) - Strength factor (0.0 to 2.0 recommended)
```

#### `getConvergence()` / `setConvergence(value)`
Controls the convergence offset for depth perception.
```javascript
// Get current convergence offset
const convergence = await WebXROpenXRBridge.getConvergence();
// Returns: number (default: 0.5)

// Set convergence offset (async - waits for actual application)
await WebXROpenXRBridge.setConvergence(0.3);
// Parameters: value (number) - Offset value (0.0 to 1.0 recommended)
```

#### `getPerspectiveFactor()` / `setPerspectiveFactor(value)`
Controls the perspective distortion factor.
```javascript
// Get current perspective factor
const perspective = await WebXROpenXRBridge.getPerspectiveFactor();
// Returns: number (default: 1.0)

// Set perspective factor (async - waits for actual application)
await WebXROpenXRBridge.setPerspectiveFactor(1.1);
// Parameters: value (number) - Factor value (0.5 to 2.0 recommended)
```

### Control Settings

#### `getControlMode()` / `setControlMode(mode)`
Controls the camera/view control method.
```javascript
// Get current control mode
const controlMode = await WebXROpenXRBridge.getControlMode();
// Returns: number (0 = First Person, 1 = Fly)

// Set control mode (async - waits for actual application)
await WebXROpenXRBridge.setControlMode(1);
// Parameters: mode (number) - 0 for First Person, 1 for Fly mode
```

### Pose Control

#### `getHeadPose()` / `setHeadPose(pose)`
Controls the head/camera position and orientation.
```javascript
// Get current head pose
const headPose = await WebXROpenXRBridge.getHeadPose();
// Returns: { position: {x, y, z}, orientation: {x, y, z, w} }

// Set head pose (async - waits for actual application)
await WebXROpenXRBridge.setHeadPose({
    position: { x: 0, y: 1.75, z: 0 },    // Position in meters (OpenXR coordinates)
    orientation: { x: 0, y: 0, z: 0, w: 1 } // Quaternion rotation
});
// Parameters: pose (object) - Position (x,y,z) and orientation quaternion (x,y,z,w)
```

#### `getLeftHandPose()` / `setLeftHandPose(pose)`
Controls the left hand position and orientation.
```javascript
// Get current left hand pose
const leftHandPose = await WebXROpenXRBridge.getLeftHandPose();
// Returns: { position: {x, y, z}, orientation: {x, y, z, w} }

// Set left hand pose (async - waits for actual application)
await WebXROpenXRBridge.setLeftHandPose({
    position: { x: -0.3, y: 1.4, z: -0.4 },
    orientation: { x: 0, y: 0.2164, z: 0, w: 0.9763 }
});
// Parameters: pose (object) - Position (x,y,z) and orientation quaternion (x,y,z,w)
```

#### `getRightHandPose()` / `setRightHandPose(pose)`
Controls the right hand position and orientation.
```javascript
// Get current right hand pose
const rightHandPose = await WebXROpenXRBridge.getRightHandPose();
// Returns: { position: {x, y, z}, orientation: {x, y, z, w} }

// Set right hand pose (async - waits for actual application)
await WebXROpenXRBridge.setRightHandPose({
    position: { x: 0.3, y: 1.4, z: -0.4 },
    orientation: { x: 0, y: -0.2164, z: 0, w: 0.9763 }
});
// Parameters: pose (object) - Position (x,y,z) and orientation quaternion (x,y,z,w)
```

### Window Management

#### `getFullScreen()` / `setFullScreen(state)`
Controls the fullscreen state of the OpenXR window.
```javascript
// Check if in fullscreen
const isFullscreen = await WebXROpenXRBridge.getFullScreen();
// Returns: number (0 = windowed, 1 = fullscreen)

// Set fullscreen state (async - waits for actual application)
await WebXROpenXRBridge.setFullScreen(1); // Enter fullscreen
await WebXROpenXRBridge.setFullScreen(0); // Exit fullscreen
// Parameters: state (number) - 0 for windowed, 1 for fullscreen
```

#### `getWindowRect()` / `setWindowRect(rect)`
Controls the window position and size.
```javascript
// Get current window position and size
const windowRect = await WebXROpenXRBridge.getWindowRect();
// Returns: { x: number, y: number, width: number, height: number }

// Set window position and size (async - waits for actual application)
await WebXROpenXRBridge.setWindowRect({
    x: 100,      // X position in pixels
    y: 100,      // Y position in pixels
    width: 800,  // Width in pixels
    height: 600  // Height in pixels
});
// Parameters: rect (object) - Window rectangle {x, y, width, height}
```

## Events

The bridge automatically sends events for certain state changes, eliminating the need for polling.

### Window Rect Change Event

The bridge automatically sends window rect updates when the OpenXR runtime window is resized, moved, or changes fullscreen state.

**Event Structure:**
```javascript
{
  type: "webxr-openxr-bridge-response",
  setting: "WindowRect",
  success: true,
  data: {
    x: number,      // Window X position in pixels
    y: number,      // Window Y position in pixels  
    width: number,  // Window width in pixels
    height: number  // Window height in pixels
  }
}
```

**Usage:**
```javascript
// Listen for automatic window rect updates
window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data) return;
    
    // Check for automatic window rect updates
    if (event.data.type === 'webxr-openxr-bridge-response' && 
        event.data.setting === 'WindowRect' && 
        event.data.success && 
        event.data.data) {
        
        const rect = event.data.data;
        console.log(`🔄 Window moved/resized: ${rect.x},${rect.y} ${rect.width}x${rect.height}`);
        
        // Update your UI immediately
        updateWindowDisplay(rect);
    }
});

function updateWindowDisplay(windowRect) {
    // Update your application's window rect display
    document.getElementById('windowInfo').textContent = 
        `Position: (${windowRect.x}, ${windowRect.y}) Size: ${windowRect.width}x${windowRect.height}`;
}
```

**Triggers automatically on:**
- ✅ Manual window resizing (dragging edges/corners)
- ✅ Window dragging/moving
- ✅ Entering/exiting fullscreen mode
- ✅ Programmatic window changes via `setWindowRect()`
- ✅ System-level window management (minimize/maximize/restore)

**Benefits:**
- **Real-time updates** - No polling delays or missed changes
- **Perfect timing** - Events fire immediately when window changes
- **Efficient** - No unnecessary API calls every second
- **Complete coverage** - Catches all window state changes

### Setting Confirmation Events

When using SET operations, the bridge sends confirmation events when settings are actually applied in the runtime.

**Event Structure:**
```javascript
{
  type: "webxr-openxr-bridge-response",
  setting: string,     // The setting that was changed (e.g., "IPDScale", "ProjectionMethod")
  success: boolean,    // Whether the operation succeeded
  requestId?: number,  // Request ID if provided in original call
  tabId?: number,      // Tab ID if provided in original call
  data?: any,          // Setting value for GET operations
  error?: string       // Error message if success is false
}
```

**Example:**
```javascript
// These events are automatically handled by the API Promise resolution
// But you can also listen for them directly:
window.addEventListener('message', function(event) {
    if (event.data?.type === 'webxr-openxr-bridge-response' && 
        event.data?.setting === 'IPDScale' && 
        event.data?.success) {
        console.log('IPD Scale was successfully applied!');
    }
});
```

### Session Management

#### `isAnySessionActive()`
Checks if any VR session is currently active system-wide.
```javascript
// Check if any VR session is active system-wide
const isActive = await WebXROpenXRBridge.isAnySessionActive();
// Returns: boolean - true if any session is active, false otherwise
```

#### `getActiveSessionInfo()`
Gets detailed information about the currently active VR session.
```javascript
// Get detailed session information
const sessionInfo = await WebXROpenXRBridge.getActiveSessionInfo();
// Returns: { isActive: boolean, tabId: number, startTime: number }
//   - isActive: Whether a session is currently active
//   - tabId: Unique identifier for the session/application
//   - startTime: Session start timestamp (milliseconds since epoch)
```

#### `forceCloseActiveSession()`
Forces closure of any active VR session system-wide.
```javascript
// Force close any active VR session (async - waits for actual application)
await WebXROpenXRBridge.forceCloseActiveSession();
// Returns: Promise<void> - Resolves when session is closed
```

### System Control

#### `resetSettings()`
Resets all OpenXR settings to their default values.
```javascript
// Reset all settings to defaults (async - waits for actual application)
await WebXROpenXRBridge.resetSettings();
// Returns: Promise<void> - Resolves when all settings are reset
```

## 🚀 True Async Behavior

### Before (Message-based timing):
```javascript
// OLD: Promise resolved when message was SENT, not applied
await WebXROpenXRBridge.setProjectionMethod(1);
console.log("Message sent!"); // ❌ Setting might not be applied yet
// Visual change happens 1-3 frames later
```

### After (Confirmation-based timing):
```javascript
// NEW: Promise resolves when setting is ACTUALLY APPLIED
await WebXROpenXRBridge.setProjectionMethod(1);
console.log("Setting applied!"); // ✅ Setting is definitely applied
// Visual change is already visible
```

## Usage Patterns

### Sequential Operations with Perfect Timing
```javascript
async function setupVRSession() {
    try {
        console.log("🔄 Starting VR setup...");
        
        // Each step waits for actual completion
        await WebXROpenXRBridge.setProjectionMethod(1);
        console.log("✅ Projection method applied");
        
        await WebXROpenXRBridge.setIPDScale(1.2);
        console.log("✅ IPD scale applied");
        
        await WebXROpenXRBridge.setSceneScale(1.0);
        console.log("✅ Scene scale applied");
        
        // No artificial delays needed!
        const resetSuccess = resetConvergencePlane(leftCam, rightCam);
        console.log(`✅ Convergence reset: ${resetSuccess ? "SUCCESS" : "FAILED"}`);
        
        console.log("🎉 VR session fully configured!");
        
    } catch (error) {
        console.error("❌ VR setup failed:", error);
    }
}
```

### Parallel Operations (when order doesn't matter)
```javascript
async function configureVRSettings() {
    try {
        console.log("🔄 Applying VR settings in parallel...");
        
        // Execute multiple settings in parallel for faster setup
        await Promise.all([
            WebXROpenXRBridge.setIPDScale(1.2),
            WebXROpenXRBridge.setSceneScale(1.0),
            WebXROpenXRBridge.setParallaxStrength(0.8),
            WebXROpenXRBridge.setConvergence(0.3)
        ]);
        
        console.log("✅ All VR settings applied simultaneously!");
        
    } catch (error) {
        console.error("❌ Failed to configure VR settings:", error);
    }
}

### Error Handling and Retries
```javascript
async function setProjectionMethodWithRetry(method, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await WebXROpenXRBridge.setProjectionMethod(method);
            console.log(`✅ Projection method applied on attempt ${attempt}`);
            return;
        } catch (error) {
            console.warn(`⚠️ Attempt ${attempt} failed:`, error);
            if (attempt === maxRetries) {
                throw new Error(`Failed to set projection method after ${maxRetries} attempts`);
            }
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}
```

### Real-world Example: Your Original Code
```javascript
// BEFORE: Clumsy nested timeouts
if (!displaySwitch) {
    displaySwitch = true;
    setTimeout(() => {
        window.WebXROpenXRBridge.setProjectionMethod(1);
        setTimeout(() => {
            window.WebXROpenXRBridge.resetSettings(1.0);
            setTimeout(() => {
                const resetSuccess = resetConvergencePlane(leftCam, rightCam);
            }, 500);
        }, 500);
    }, 1000);
}

// AFTER: Clean async flow
if (!displaySwitch) {
    displaySwitch = true;
    
    async function setupProjection() {
        try {
            // Optional: wait for user interaction to settle
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Each step waits for actual completion - no guessing!
            await WebXROpenXRBridge.setProjectionMethod(1);
            console.log("✅ Projection method applied and visible");
            
            await WebXROpenXRBridge.resetSettings();
            console.log("✅ Settings reset and applied");
            
            // Now safe to proceed immediately
            const resetSuccess = resetConvergencePlane(leftCam, rightCam);
            console.log(`✅ Convergence reset: ${resetSuccess ? "SUCCESS" : "FAILED"}`);
            
        } catch (error) {
            console.error("❌ Setup failed:", error);
        }
    }
    
    setupProjection();
}
```

## Error Handling

All methods can throw errors in the following cases:
- Extension not installed or not available
- OpenXR runtime not running
- Invalid parameter values
- **Built-in communication timeout (10 seconds)** ⚡ 
- **Built-in confirmation timeout (5 seconds for SET operations)** ⚡ 
- Runtime internal errors

**No custom timeouts needed** - the API handles all timeout scenarios automatically. Simply wrap API calls in try-catch blocks:

```javascript
// Clean, simple error handling - no timeouts needed
async function applyVRSettings() {
  try {
    await WebXROpenXRBridge.setIPDScale(1.2);
    await WebXROpenXRBridge.setProjectionMethod(1);
    console.log("✅ All settings applied successfully!");
  } catch (error) {
    console.error("❌ Setting failed:", error.message);
    // Error could be: timeout, runtime not available, invalid value, etc.
  }
}
```

## Extension Detection

```javascript
function checkExtensionAvailability() {
    if (typeof WebXROpenXRBridge === 'undefined') {
        console.error('WebXR-OpenXR Bridge extension not available');
        return false;
    }
    return true;
}

// Use before making API calls
if (checkExtensionAvailability()) {
    await WebXROpenXRBridge.setIPDScale(1.2);
}
```

## Best Practices

1. **Check for API availability:**
   Always check if the API is available before using it:
   ```javascript
   if (window.WebXROpenXRBridge) {
     // API is available, use it
   } else {
     // API is not available, show a message to the user
   }
   ```

2. **Handle errors gracefully:**
   Always catch errors and provide feedback to the user.

3. **Respect user settings:**
   Only change settings when necessary and with user consent.

4. **Restore defaults:**
   Provide an option to restore default settings.

5. **Use event-driven updates for window rect:**
   Instead of polling `getWindowRect()` repeatedly, listen for automatic events:
   ```javascript
   // ❌ DON'T: Poll for window rect changes
   setInterval(async () => {
     const rect = await WebXROpenXRBridge.getWindowRect();
     updateUI(rect);
   }, 1000);
   
   // ✅ DO: Listen for automatic events
   window.addEventListener('message', (event) => {
     if (event.data?.type === 'webxr-openxr-bridge-response' && 
         event.data?.setting === 'WindowRect' && 
         event.data?.success) {
       updateUI(event.data.data);
     }
   });
   
   // Get initial state once
   const initialRect = await WebXROpenXRBridge.getWindowRect();
   updateUI(initialRect);
   ```

6. **No custom timeouts needed:**
   The API now has built-in timeout protection - no need to add your own:
   ```javascript
   // ❌ DON'T: Add custom timeouts (no longer needed)
   const timeoutPromise = new Promise((_, reject) => {
     setTimeout(() => reject(new Error('Request timed out')), 5000);
   });
   Promise.race([
     WebXROpenXRBridge.setIPDScale(1.2),
     timeoutPromise
   ]);
   
   // ✅ DO: Just use the API directly - it has built-in protection
   try {
     await WebXROpenXRBridge.setIPDScale(1.2);
     console.log("Setting applied successfully!");
   } catch (error) {
     console.error("Setting failed or timed out:", error);
   }
   ```

## Example Integration

```javascript
class OpenXRSettings {
  constructor() {
    this.available = !!window.WebXROpenXRBridge;
    this.setupEventListeners();
  }

  isAvailable() {
    return this.available;
  }

  setupEventListeners() {
    if (!this.available) return;
    
    // Listen for automatic window rect updates
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'webxr-openxr-bridge-response' && 
          event.data?.setting === 'WindowRect' && 
          event.data?.success) {
        this.onWindowRectChanged?.(event.data.data);
      }
    });
  }

  // Callback for window rect changes - override this
  onWindowRectChanged(rect) {
    console.log('Window rect changed:', rect);
  }

  async getIPDScale() {
    if (!this.available) return null;
    try {
      return await window.WebXROpenXRBridge.getIPDScale();
    } catch (err) {
      console.error('Error getting IPD Scale:', err);
      return null;
    }
  }

  async setIPDScale(scale) {
    if (!this.available) return false;
    try {
      await window.WebXROpenXRBridge.setIPDScale(scale);
      return true;
    } catch (err) {
      console.error('Error setting IPD Scale:', err);
      return false;
    }
  }
  
  async getSceneScale() {
    if (!this.available) return null;
    try {
      return await window.WebXROpenXRBridge.getSceneScale();
    } catch (err) {
      console.error('Error getting Scene Scale:', err);
      return null;
    }
  }

  async setSceneScale(scale) {
    if (!this.available) return false;
    try {
      await window.WebXROpenXRBridge.setSceneScale(scale);
      return true;
    } catch (err) {
      console.error('Error setting Scene Scale:', err);
      return false;
    }
  }

  async getWindowRect() {
    if (!this.available) return null;
    try {
      return await window.WebXROpenXRBridge.getWindowRect();
    } catch (err) {
      console.error('Error getting Window Rect:', err);
      return null;
    }
  }

  async setWindowRect(rect) {
    if (!this.available) return false;
    try {
      await window.WebXROpenXRBridge.setWindowRect(rect);
      return true;
    } catch (err) {
      console.error('Error setting Window Rect:', err);
      return false;
    }
  }

  // Add similar methods for other settings
}

// Usage
const xrSettings = new OpenXRSettings();

// Override the window rect change callback
xrSettings.onWindowRectChanged = (rect) => {
  console.log(`🔄 OpenXR window: ${rect.x},${rect.y} ${rect.width}x${rect.height}`);
  document.getElementById('windowStatus').textContent = 
    `OpenXR Window: (${rect.x}, ${rect.y}) ${rect.width}×${rect.height}`;
};

if (xrSettings.isAvailable()) {
  // Get initial values
  xrSettings.getIPDScale().then(scale => {
    // Update UI with current scale
  });
  
  // Get initial window rect (events will handle updates)
  xrSettings.getWindowRect().then(rect => {
    xrSettings.onWindowRectChanged(rect);
  });
}
```

## Limitations

- The API only works with OpenXR runtimes that support the corresponding IPC calls
- Changes to settings take effect immediately, but may require a session restart for some settings
- If no active OpenXR session is found, operations will fail with an appropriate error 

## Performance Notes

- **GET operations**: Immediate response (no confirmation needed)
- **SET operations**: Wait for actual application (1-3 frame delay typically)
- **Parallel SET operations**: All complete when the slowest one finishes
- **Built-in timeout protection**: Operations automatically fail after 5 seconds if no confirmation
- **No artificial delays needed**: Promises resolve when settings are actually applied
- **No custom timeouts needed**: All timeout scenarios are handled internally 