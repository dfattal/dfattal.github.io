# WebXR-OpenXR Bridge API Documentation

This document describes the JavaScript API for interacting with OpenXR runtime settings from WebXR applications.

## Overview

The WebXR-OpenXR Bridge provides a JavaScript API that allows WebXR applications to read and modify OpenXR runtime settings. This enables custom IPD adjustments, scene scaling, and projection modifications directly from web applications.

The API is exposed as `window.WebXROpenXRBridge` and is available on any webpage after the extension is installed.

## API Methods

All methods return Promises that resolve with the requested data or reject with an error.

### Getting Values

#### `getIPDScale()`

Returns the current IPD scale value.

```javascript
window.WebXROpenXRBridge.getIPDScale()
  .then(scale => console.log('Current IPD Scale:', scale))
  .catch(err => console.error('Error:', err));
```

#### `getSceneScale()`

Returns the current scene scale value.

```javascript
window.WebXROpenXRBridge.getSceneScale()
  .then(scale => console.log('Current Scene Scale:', scale))
  .catch(err => console.error('Error:', err));
```

#### `getParallaxStrength()`

Returns the current parallax strength value.

```javascript
window.WebXROpenXRBridge.getParallaxStrength()
  .then(strength => console.log('Current Parallax Strength:', strength))
  .catch(err => console.error('Error:', err));
```

#### `getSessionProjection()`

Returns the current session projection settings.

```javascript
window.WebXROpenXRBridge.getSessionProjection()
  .then(projection => console.log('Current Projection:', projection))
  .catch(err => console.error('Error:', err));
```

The returned projection object has the following structure:
```javascript
{
  type: 0, // Projection type (integer)
  fov: 90  // Field of view in degrees
}
```

#### `getSessionConvergenceOffset()`

Returns the current session convergence offset value.

```javascript
window.WebXROpenXRBridge.getSessionConvergenceOffset()
  .then(offset => console.log('Current Convergence Offset:', offset))
  .catch(err => console.error('Error:', err));
```

#### `getSessionPerspectiveFactor()`

Returns the current session perspective factor value.

```javascript
window.WebXROpenXRBridge.getSessionPerspectiveFactor()
  .then(factor => console.log('Current Perspective Factor:', factor))
  .catch(err => console.error('Error:', err));
```

### Setting Values

#### `setIPDScale(scale)`

Sets the IPD scale value. The scale parameter should be a float value.

```javascript
window.WebXROpenXRBridge.setIPDScale(1.2)
  .then(() => console.log('IPD Scale set successfully'))
  .catch(err => console.error('Error setting IPD Scale:', err));
```

#### `setSceneScale(scale)`

Sets the scene scale value. The scale parameter should be a float value.

```javascript
window.WebXROpenXRBridge.setSceneScale(2.0)
  .then(() => console.log('Scene Scale set successfully'))
  .catch(err => console.error('Error setting Scene Scale:', err));
```

## Window Events

The WebXR-OpenXR Bridge provides real-time notifications for window changes, including both window moves and resizes. This allows WebXR applications to respond immediately to window position and size changes.

### `onWindowChange(callback)`

Registers a callback function to receive window change notifications. The callback will be called whenever the OpenXR window is moved or resized.

```javascript
const listener = window.WebXROpenXRBridge.onWindowChange((windowRect) => {
  console.log('Window changed:', windowRect);
  // Handle window change...
});
```

#### Parameters
- `callback` (Function): A function that will be called with window change data

#### Returns
- Object with `remove()` method to unregister the listener

#### Window Rect Object
The callback receives a `windowRect` object with the following properties:

```javascript
{
  x: 100,        // Window X position (pixels)
  y: 50,         // Window Y position (pixels) 
  width: 1920,   // Window width (pixels)
  height: 1080   // Window height (pixels)
}
```

### Event Types

The window change events capture both:
- **Move events**: When the window position changes
- **Resize events**: When the window size changes  
- **Combined events**: When both position and size change simultaneously

### Usage Examples

#### Basic Event Handling
```javascript
// Register a window change listener
const windowListener = window.WebXROpenXRBridge.onWindowChange((windowRect) => {
  console.log(`Window: pos=(${windowRect.x},${windowRect.y}) size=${windowRect.width}×${windowRect.height}`);
  
  // Update your application's viewport or layout
  updateViewport(windowRect);
});

// Later, remove the listener when no longer needed
windowListener.remove();
```

#### Advanced Event Processing
```javascript
let lastWindowRect = null;

const windowListener = window.WebXROpenXRBridge.onWindowChange((windowRect) => {
  if (lastWindowRect) {
    // Determine what changed
    const positionChanged = (lastWindowRect.x !== windowRect.x || lastWindowRect.y !== windowRect.y);
    const sizeChanged = (lastWindowRect.width !== windowRect.width || lastWindowRect.height !== windowRect.height);
    
    if (positionChanged && sizeChanged) {
      console.log('Window moved and resized');
      handleMoveAndResize(windowRect);
    } else if (positionChanged) {
      console.log('Window moved');
      handleMove(windowRect);
    } else if (sizeChanged) {
      console.log('Window resized'); 
      handleResize(windowRect);
    }
  }
  
  lastWindowRect = { ...windowRect };
});
```

#### Multiple Listeners
```javascript
// You can register multiple listeners for different purposes
const uiListener = window.WebXROpenXRBridge.onWindowChange(updateUI);
const analyticsListener = window.WebXROpenXRBridge.onWindowChange(trackWindowChanges);
const layoutListener = window.WebXROpenXRBridge.onWindowChange(adjustLayout);

// Remove specific listeners as needed
uiListener.remove();
```

### Best Practices for Window Events

1. **Check for API availability:**
   ```javascript
   if (window.WebXROpenXRBridge && window.WebXROpenXRBridge.onWindowChange) {
     // Register window change listener
   } else {
     console.warn('Window change events not available');
   }
   ```

2. **Clean up listeners:**
   Always remove listeners when they're no longer needed to prevent memory leaks.

3. **Throttle expensive operations:**
   Window events can fire frequently during drags, so consider throttling expensive operations:
   ```javascript
   let updateTimeout;
   const windowListener = window.WebXROpenXRBridge.onWindowChange((windowRect) => {
     clearTimeout(updateTimeout);
     updateTimeout = setTimeout(() => {
       expensiveLayoutUpdate(windowRect);
     }, 100); // Throttle to 100ms
   });
   ```

4. **Handle initial state:**
   The first event provides the initial window state, so handle it appropriately:
   ```javascript
   let isFirstEvent = true;
   const windowListener = window.WebXROpenXRBridge.onWindowChange((windowRect) => {
     if (isFirstEvent) {
       console.log('Initial window state:', windowRect);
       isFirstEvent = false;
     } else {
       console.log('Window change:', windowRect);
     }
   });
   ```

## Error Handling

All API methods return Promises that may reject with an error. Errors can occur for the following reasons:

1. The native messaging host is not available
2. The requested method is not supported
3. The parameters are invalid
4. The OpenXR runtime is not running or accessible
5. No active OpenXR session was found
6. The request timed out (after 5-10 seconds)

Example of proper error handling:

```javascript
window.WebXROpenXRBridge.getIPDScale()
  .then(scale => {
    console.log('Current IPD Scale:', scale);
    // Do something with the scale value
  })
  .catch(err => {
    console.error('Error getting IPD Scale:', err);
    // Handle the error appropriately
    // For example, show a user-friendly error message
  });
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

5. **Add timeouts:**
   Consider adding your own timeouts for requests that might take too long.
   ```javascript
   const timeoutPromise = new Promise((_, reject) => {
     setTimeout(() => reject(new Error('Request timed out')), 5000);
   });
   
   Promise.race([
     window.WebXROpenXRBridge.getIPDScale(),
     timeoutPromise
   ]).then(scale => {
     // Handle the scale value
   });
   ```

## Example Integration

```javascript
class OpenXRSettings {
  constructor() {
    this.available = !!window.WebXROpenXRBridge;
    this.windowListener = null;
  }

  isAvailable() {
    return this.available;
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

  // Window Event Methods
  startWindowEventListening(callback) {
    if (!this.available || !window.WebXROpenXRBridge.onWindowChange) {
      console.warn('Window events not available');
      return false;
    }

    // Remove existing listener if any
    this.stopWindowEventListening();

    // Register new listener
    this.windowListener = window.WebXROpenXRBridge.onWindowChange(callback);
    return true;
  }

  stopWindowEventListening() {
    if (this.windowListener) {
      this.windowListener.remove();
      this.windowListener = null;
    }
  }

  // Cleanup method
  destroy() {
    this.stopWindowEventListening();
  }

  // Add similar methods for other settings
}

// Usage
const xrSettings = new OpenXRSettings();
if (xrSettings.isAvailable()) {
  xrSettings.getIPDScale().then(scale => {
    // Update UI with current scale
  });

  // Window event handling
  xrSettings.startWindowEventListening((windowRect) => {
    console.log('OpenXR window changed:', windowRect);
    
    // Update your application layout based on window changes
    updateApplicationLayout(windowRect);
    
    // Example: Adjust canvas size if your WebXR app uses a 2D canvas overlay
    adjustCanvasOverlay(windowRect);
  });
}

// Clean up when done
// xrSettings.destroy();
```

## Limitations

- The API only works with OpenXR runtimes that support the corresponding IPC calls
- Changes to settings take effect immediately, but may require a session restart for some settings
- If no active OpenXR session is found, operations will fail with an appropriate error
- **Window events**: Require a compatible OpenXR runtime with window message support; events are only fired when the OpenXR window is actually moved or resized by the user or system
- **Event frequency**: Window events can fire rapidly during window dragging operations, so consider throttling expensive callbacks
- **Browser compatibility**: Window events require modern browsers with native messaging support and the WebXR-OpenXR Bridge extension installed 