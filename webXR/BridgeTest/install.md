# WebXR-OpenXR Bridge Installation Guide

This guide will help you install and set up the WebXR-OpenXR Bridge so that WebXR applications can interact with OpenXR runtime settings.

## Prerequisites

- You need to have the SRHydra OpenXR Runtime installed.
- You need to use Google Chrome or another Chromium-based browser.

## Installation Steps

### 1. Install the Chrome Extension

There are two ways to install the extension:

#### Option 1: Install from Chrome Web Store (Recommended)

1. Go to [Chrome Web Store](https://chrome.google.com/webstore/detail/webxr-openxr-bridge/kbhoohhidfimoheieoibjlecmkcodipm)
2. Click "Add to Chrome"
3. Confirm by clicking "Add extension" in the popup

#### Option 2: Install from Local Files (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle switch in the top-right corner
3. Click "Load unpacked"
4. Navigate to the `WebXRBridge/Extension` folder within your SRHydra installation directory
5. Select the folder and click "Open"

### 2. Verify the Native Messaging Host

The native messaging host should have been automatically installed with the SRHydra OpenXR Runtime. To verify it's working correctly:

1. Open Chrome and navigate to any website
2. Open Chrome DevTools (F12 or Ctrl+Shift+I)
3. Go to the Console tab
4. Type the following code and press Enter:

```javascript
window.webxrOpenXRBridge.getIPDScale().then(scale => console.log('Current IPD Scale:', scale)).catch(err => console.error('Error:', err));
```

If the native messaging host is working correctly, you should see the current IPD scale value printed in the console.

## Troubleshooting

If you encounter issues with the WebXR-OpenXR Bridge:

1. **Extension not working**:
   - Make sure the extension is enabled in Chrome's extension page.
   - Try restarting Chrome.

2. **Cannot connect to native messaging host**:
   - Verify that SRHydra OpenXR Runtime is installed correctly.
   - Check the log file at:
     - Windows: `%LOCALAPPDATA%\OpenXR\openxr-bridge.log`
     - macOS/Linux: `~/.local/share/openxr/openxr-bridge.log`

3. **Permission issues**:
   - Ensure Chrome has the necessary permissions to access the native messaging host.
   - On some systems, you might need to run Chrome with administrator privileges.

## For Developers

If you're developing a WebXR application and want to use the WebXR-OpenXR Bridge API, include this in your JavaScript code:

```javascript
// Check if the WebXR-OpenXR Bridge API is available
if (window.webxrOpenXRBridge) {
  // Get current IPD scale
  window.webxrOpenXRBridge.getIPDScale()
    .then(scale => console.log('Current IPD Scale:', scale))
    .catch(err => console.error('Error:', err));
  
  // Set IPD scale (example)
  window.webxrOpenXRBridge.setIPDScale(1.2)
    .then(() => console.log('IPD Scale set successfully'))
    .catch(err => console.error('Error setting IPD Scale:', err));
}
```

For more information about the API, see the [API documentation](API.md).

## Support

If you need further assistance, please contact SRHydra support. 