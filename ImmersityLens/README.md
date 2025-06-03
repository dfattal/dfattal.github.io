# Image Color Inverter Chrome Extension

A Chrome extension that automatically inverts the colors of all images on any website, creating a negative effect.

## Features

- 🎨 **Instant Color Inversion**: Toggle color inversion for all images with one click
- 🖼️ **Comprehensive Coverage**: Works with both regular `<img>` tags and CSS background images
- ⚡ **Dynamic Detection**: Automatically applies inversion to newly loaded images
- 🎯 **Smooth Transitions**: Includes smooth CSS transitions for a pleasant user experience
- 💾 **Per-Tab State**: Each tab maintains its own inversion state independently

## Files Structure

```
ImmersityLens/
├── manifest.json       # Extension configuration
├── content.js         # Main content script for image processing
├── popup.html         # Extension popup interface
├── popup.js          # Popup functionality
├── icons/            # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md         # This file
```

## How to Install in Chrome Dev Mode

### Step 1: Enable Developer Mode
1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Toggle **"Developer mode"** in the top-right corner

### Step 2: Load the Extension
1. Click **"Load unpacked"** button
2. Navigate to and select the `ImmersityLens` folder
3. The extension should now appear in your extensions list

### Step 3: Pin the Extension (Optional)
1. Click the puzzle piece icon (🧩) in Chrome's toolbar
2. Find "Image Color Inverter" and click the pin icon to keep it visible

## How to Use

### Method 1: Using the Popup
1. Navigate to any website with images
2. Click the **Image Color Inverter** extension icon in the toolbar
3. Click **"Enable Inversion"** to invert all images
4. Click **"Disable Inversion"** to return images to normal

### Method 2: Quick Toggle
- The extension popup shows the current status
- Green status = Inversion disabled
- Red status = Inversion active

## Technical Details

### How it Works
- Uses CSS `filter: invert(1)` for efficient color inversion
- Monitors DOM changes to catch dynamically loaded images
- Applies smooth transitions for better user experience
- Maintains state independently for each browser tab

### Browser Compatibility
- Chrome (Manifest V3)
- Edge Chromium
- Other Chromium-based browsers

### Performance
- Lightweight and efficient
- No impact on page loading speed
- Minimal memory footprint

## Troubleshooting

### Extension Not Working?
1. Refresh the page after enabling the extension
2. Check if the extension is enabled in `chrome://extensions/`
3. Try reloading the extension if needed

### Images Not Inverting?
- Some images may be loaded via JavaScript after page load
- Try toggling the extension off and on again
- Check browser console for any errors

### Permission Issues?
- The extension only needs `activeTab` permission
- No sensitive data is accessed or stored

## Development

### Making Changes
1. Edit the source files in the `ImmersityLens` folder
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes

### Adding Features
- Modify `content.js` for image processing logic
- Update `popup.html` and `popup.js` for UI changes
- Adjust `manifest.json` for permissions or configuration

## Privacy

This extension:
- ✅ Works entirely locally in your browser
- ✅ Does not collect or transmit any data
- ✅ Does not require server connections
- ✅ Only accesses the current active tab when activated

## Support

For issues or feature requests, please check the source code in the `ImmersityLens` folder and modify as needed for your specific use case. 