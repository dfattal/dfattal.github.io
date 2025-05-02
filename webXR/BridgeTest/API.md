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

  // Add similar methods for other settings
}

// Usage
const xrSettings = new OpenXRSettings();
if (xrSettings.isAvailable()) {
  xrSettings.getIPDScale().then(scale => {
    // Update UI with current scale
  });
}
```

## Limitations

- The API only works with OpenXR runtimes that support the corresponding IPC calls
- Changes to settings take effect immediately, but may require a session restart for some settings
- If no active OpenXR session is found, operations will fail with an appropriate error 