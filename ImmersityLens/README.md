# 2D to 3D Image Converter Chrome Extension

A Chrome extension that automatically adds "2D3D" conversion buttons to images on any website, allowing you to convert 2D images into immersive 3D LIF (Light Field Image) files using Immersity AI technology.

## Features

- 🎯 **Smart Image Detection**: Automatically detects suitable images on any webpage
- 🎨 **AI-Powered 3D Conversion**: Uses Immersity AI to convert 2D images to LIF format
- 🖱️ **Interactive 3D Hover**: Mouse hover reveals immersive 3D depth effects
- ⚡ **Real-time Processing**: Processes images with depth mapping and outpainting
- 💫 **Seamless Integration**: Non-intrusive buttons appear on compatible images
- 🚀 **Professional Quality**: Powered by Leia Inc's LIF technology

## How It Works

This extension leverages cutting-edge AI technology to transform regular 2D images into immersive 3D experiences:

1. **Depth Estimation**: AI analyzes the image to create a depth map
2. **Outpainting**: Extends image edges for better 3D effect
3. **LIF Generation**: Creates a Light Field Image with multiple depth layers
4. **Interactive Display**: WebGL renderer provides smooth 3D hover effects

## Files Structure

```
ImmersityLens/
├── manifest.json       # Extension configuration with API permissions
├── content.js         # Main content script for image processing
├── popup.html         # Extension popup interface
├── popup.js          # Popup functionality
├── libs/             # Required libraries
│   ├── axios.min.js   # HTTP client for API requests
│   ├── heic2any.js    # HEIC image format support
│   └── LIF.js         # LIF generation and viewing library
├── shaders/          # WebGL shaders for 3D rendering
│   ├── vertex.glsl
│   ├── rayCastMonoLDIGlow.glsl
│   └── rayCastStereoLDIGlow.glsl
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
3. Toggle **"Developer mode"** ON (top-right corner)

### Step 2: Load the Extension
1. Click **"Load unpacked"**
2. Navigate to and select the `ImmersityLens` folder
3. The extension will appear in your extensions list

### Step 3: Pin the Extension (Optional)
1. Click the puzzle piece icon (🧩) in Chrome's toolbar
2. Find "2D to 3D Image Converter" and pin it for easy access

## How to Use

### Basic Usage
1. **Navigate to any website** with images (Instagram, news sites, art galleries, etc.)
2. **Look for "2D3D" buttons** that appear on suitable images
3. **Click a "2D3D" button** to start the conversion process
4. **Wait for processing** (typically 10-30 seconds depending on image size)
5. **Hover over the image** to see the immersive 3D effect!

### Extension Controls
- Use the extension popup to **Enable/Disable** the button overlay
- The extension automatically filters out small images and UI elements
- Only images larger than 100x100 pixels get conversion buttons

### What to Expect
- **Processing Time**: 15-45 seconds per image
- **Button States**: 
  - `2D3D` = Ready to convert
  - `Converting...` = Processing in progress
  - `⬇️ LIF` = Conversion complete, click to download
- **3D Effect**: Hover to see depth and parallax motion
- **Download**: Click the `⬇️ LIF` button to save the 3D file

## Technical Details

### AI Pipeline
1. **Image Upload**: Secure upload to Immersity AI cloud
2. **Outpainting**: AI extends image boundaries by 10%
3. **Depth Generation**: Advanced depth estimation algorithms
4. **LIF Assembly**: Creates layered depth image format
5. **WebGL Rendering**: Real-time 3D visualization

### Supported Image Formats
- JPEG, PNG, WebP, HEIC/HEIF
- Minimum size: 100x100 pixels
- Maximum processing size: 1600px (auto-resized)

### Browser Compatibility
- Chrome (Manifest V3)
- Edge Chromium
- Other Chromium-based browsers

### Performance
- **Memory Usage**: ~50MB per active LIF
- **Processing**: Cloud-based (no local GPU required)
- **Network**: ~2-5MB upload/download per image

## API Integration

This extension connects to:
- **Immersity AI API**: For depth estimation and LIF generation
- **AWS Lambda**: For authentication and access tokens
- **Cloud Storage**: For temporary image and result storage

All processing is done securely in the cloud with automatic cleanup.

## Troubleshooting

### Extension Not Working?
1. Check that developer mode is enabled
2. Verify the extension is enabled in `chrome://extensions/`
3. Refresh the webpage after enabling
4. Check browser console for any errors

### No Buttons Appearing?
- Images must be at least 100x100 pixels
- Some sites block content modifications (try different sites)
- UI elements (nav, header, footer) are automatically filtered out
- Try refreshing the page

### Conversion Failed?
- Check your internet connection
- Some images may have CORS restrictions (see CORS section below)
- Very large images (>1600px) are automatically resized
- API rate limits may apply

### CORS (Cross-Origin) Issues?
**CORS-Friendly Sites (✅ Usually work well):**
- Wikipedia & Wikimedia Commons
- Unsplash, Pixabay, Pexels  
- GitHub repositories
- Photography blogs & portfolios
- Most personal websites

**CORS-Restricted Sites (⚠️ May not work):**
- News sites with CDN protection (like AFAR, CNN)
- E-commerce sites with image protection
- Social media with strict policies
- Images from different domains without CORS headers

**What happens with CORS issues?**
- The extension will detect CORS problems automatically
- You'll see a "CORS Error" button instead of conversion
- A helpful popup will guide you to better sites
- The extension tries multiple fallback methods before giving up

### 3D Effect Not Working?
- Ensure the conversion completed successfully (button shows "⬇️ LIF")
- Try hovering slowly over the image
- Some browsers may have WebGL disabled
- Check browser console for WebGL errors

### Download Issues?
- **Modern Browsers**: Uses File System Access API for better download experience
- **Older Browsers**: Falls back to traditional download method
- **File Format**: Downloads as JPEG with embedded LIF data
- **Filename**: Automatically named based on original image
- **Permissions**: May require allowing downloads in browser settings

## Privacy & Security

This extension:
- ✅ Only processes images when you click the "2D3D" button
- ✅ Uses secure HTTPS connections for all API calls
- ✅ Automatically deletes temporary files from cloud storage
- ✅ Does not store or log personal information
- ✅ Only requires permissions for active tab and API domains

## Development

### Making Changes
1. Edit source files in the `ImmersityLens` folder
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes on websites with images

### API Configuration
- Uses production Immersity AI endpoints by default
- Can be switched to development mode by modifying `mode2` in `libs/LIF.js`
- Authentication handled automatically via AWS Lambda

## Advanced Features

### Image Quality Options
The extension automatically optimizes images for best 3D conversion:
- Resizes large images to 1600px max dimension
- Maintains aspect ratio
- Uses JPEG compression for optimal processing

### Hover Sensitivity
3D effects respond to mouse movement with:
- Parallax motion based on cursor position
- Smooth animation transitions
- Automatic start/stop on hover events

## Limitations

- **Processing Time**: Each conversion takes 15-45 seconds
- **Internet Required**: All processing is cloud-based
- **Image Rights**: Only convert images you have permission to process
- **Rate Limits**: API may limit concurrent conversions
- **Browser Memory**: Each LIF uses ~50MB of WebGL memory

## Support

For technical issues:
1. Check the browser console for error messages
2. Verify network connectivity to Immersity AI services
3. Try different websites and image types
4. Report issues with specific websites or image formats

This extension showcases the power of Immersity AI and Leia Inc's LIF technology for creating immersive 3D experiences from any 2D image on the web! 