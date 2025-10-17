# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ImmersityLens is a Chrome extension that converts 2D images into immersive 3D LIF (Leia Image Format) files through a context menu interface. The extension works universally across all websites, using intelligent image detection, advanced depth mapping, and WebGL-based 3D rendering with VR support.

## Architecture

### Extension Structure

The extension uses Chrome's Manifest V3 architecture with three main components:

1. **Content Script** (`content.js`) - Runs on all web pages, handles image detection, context menu integration, and 3D conversion workflow
2. **Background Service Worker** (`background.js`) - Manages context menu state, native messaging for local conversion, and extension lifecycle
3. **Popup Interface** (`popup.js`, `popup.html`) - Extension settings and status display

### Core Libraries

Located in `libs/`:
- **LIF.js** - Enhanced lifViewer for 3D rendering, animation, and MP4 export (231KB, highly complex)
- **VRLifViewer.js** - WebXR VR viewing system
- **VRPageSystem.js** - VR environment and controls
- **VRRenderers.js** - Custom Three.js renderers for VR
- **axios.min.js** - HTTP client for API communication

### WebGL Shaders

Located in `shaders/`:
- Ray casting shaders for mono/stereo LDI rendering
- Fragment/vertex shaders for 3D depth effects
- Special effect shaders (glow, color pop)

## Development Commands

### Testing the Extension

```bash
# Load the extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the ImmersityLens directory

# View extension logs
# Open DevTools on any webpage and check the Console for ImmersityLens messages

# View background service worker logs
# Go to chrome://extensions/ → click "service worker" link under IAI-Lens
```

### Packaging for Distribution

```bash
# macOS/Linux
./package-for-store.sh

# Windows
package-for-store.bat

# Creates: immersitylens-v{VERSION}.zip
```

### Local Native Messaging Setup

For local image conversion (bypasses cloud API):

```bash
# Run the installation script
./install_local_host.sh

# Verify installation
# Extension popup should show "Local Available: Yes"
```

See `QUICK_INSTALL_GUIDE.md` for detailed setup instructions.

## Key Technical Concepts

### Context Menu System

The extension uses Chrome's context menu API with dynamic menu state updates:

- **"Convert to 3D"** - Always visible on images, initiates conversion
- **"Download LIF"** - Appears after conversion, downloads 3D file
- **"Download MP4"** - Appears after conversion, exports animation as video
- **"Enter VR"** - Appears after conversion (if WebXR supported)

Menu visibility is updated instantly via `chrome.contextMenus.update()` based on image state stored in `data-lif-*` attributes.

### Image Detection Algorithm

Multi-layer detection strategy in `content.js`:

1. **Direct detection** - Check if clicked element is an `<img>`
2. **Recursive tree search** - Find images in clicked element's children
3. **Parent/sibling search** - Search up DOM tree and across siblings (max 10 levels)

This handles complex layouts like Instagram carousels, Facebook galleries, and Pinterest grids.

### Intelligent Filtering System

6-layer filtering prevents conversion of UI elements:

1. **Visibility analysis** - Skip hidden/off-screen images
2. **Shape recognition** - Filter extreme aspect ratios (>20:1 or <0.05:1)
3. **Semantic analysis** - Check alt text, classes, URLs for UI keywords
4. **Contextual filtering** - Exclude nav, header, footer, ad containers
5. **Site-specific logic** - Platform optimizations (Instagram videos, Amazon thumbnails)
6. **Overlap detection** - Avoid covered/background images

### Layout Detection & Adaptation

The enhanced lifViewer automatically detects and adapts to layout patterns:

```javascript
// Factory method with automatic layout detection
const viewer = lifViewer.createForLayout(lifUrl, container, {
    image: imageElement,
    dimensions: { width: targetWidth, height: targetHeight }
});
```

**Layout modes:**
- `standard` - Basic image replacement
- `picture` - CNN-style responsive breakpoints (overlay approach)
- `facebook` - Complex absolute positioning patterns
- `aspectRatio` - Padding-based responsive containers (Instagram, Shopify)
- `overlay` - Nested positioning contexts (Flickr theater mode)

### Dimension Priority System

Different strategies based on image context:

1. **Explicit HTML dimensions** - For LinkedIn-style centered/fitted images
2. **Natural dimensions** - For DeviantArt-style object-fit images
3. **Bounding rect** - Standard case for most websites

Includes validation to correct suspicious aspect ratios (>15:1 or <0.067:1).

### WebGL Rendering & Animation

The lifViewer (in `libs/LIF.js`) provides:

- **Harmonic motion engine** - Sine-wave camera animation for depth parallax
- **Mouse interaction** - Real-time tracking with smoothing
- **Dual render pipelines** - Separate paths for display vs MP4 export
- **Frame timing control** - Precise timing for consistent video output
- **WebGL readiness checks** - Race condition protection during initialization

Key animation parameters:
- `relaxationTime` - Transition speed when mouse leaves (default: 0.5s)
- `feathering` - Edge softening (default: 0.1)
- `background` - RGBA background color (default: dark gray)

### MP4 Export System

High-quality video generation pipeline:

1. Create offscreen lifViewer instance
2. WebGL warm-up (5 frames for state stabilization)
3. Start MediaRecorder with optimized codec settings
4. Render clean first frame (t=1.1 to eliminate artifacts)
5. Generate animation frames at 30fps
6. Export with automatic filename generation

Bitrate calculation: `0.2 × (width × height × 30)`

## Platform-Specific Behaviors

### Facebook Canvas Zoom Fix

Facebook images use padding-based aspect ratio containers. When image dimensions don't match container dimensions, the extension:

1. Detects `data-lif-target-*` attributes on containers
2. Forces canvas sizing to target dimensions (not image dimensions)
3. Overrides CSS classes with `!important` to prevent inheritance issues

See TECHNICAL_NOTES.md lines 529-632 for detailed analysis.

### Behance Grid Ribbon Detection

Behance grid walls have small ribbon/bookmark images that appear on hover. The extension:

1. Detects ribbon patterns (classes, URLs)
2. Applies heavy scoring penalty (-80 points)
3. Forces main image selection via context-aware container search
4. Uses `ProjectCoverNeue` containers to find correct project image

See TECHNICAL_NOTES.md lines 653-809 for complete implementation.

### Flickr Theater Mode

Theater mode has nested positioning with the image inside a `.facade-of-protection-neue` container. The extension:

1. Detects height discrepancies between container and image
2. Adjusts canvas height to match image (prevents overflow)
3. Preserves width from context menu dimensions

### Instagram Carousel Support

Instagram uses `ul._acay` carousel containers with hidden slides. The extension:

1. Processes all carousel items (including off-screen)
2. Uses natural dimensions for hidden images
3. Marks carousel images with `data-is-carousel-image="true"`

## Common Patterns

### Adding a New Layout Mode

1. Add layout detection in `content.js` `analyzeLayoutPattern()`
2. Add layout configuration in `LIF.js` `LAYOUT_CONFIGS`
3. Add styling logic in `LIF.js` `setupLayoutSpecificStyling()`
4. Test across target platforms

### Debugging Image Selection

Enable debug logging by checking console for:
- `🔍 ImmersityLens:` - General debug messages
- `🎨 Behance override:` - Platform-specific selection
- `📏 Using container target dimensions:` - Dimension calculation
- `✅ Facebook target dimensions:` - Layout detection

Use utility functions in console:
```javascript
// Inspect image properties
ImmersityLensDebug.inspectImage(imageElement)

// Inspect container properties
ImmersityLensDebug.inspectContainer(containerElement)
```

### Handling CORS-Protected Images

Three-tier fallback strategy:
1. Try direct canvas processing
2. Try `crossOrigin = 'anonymous'`
3. Show user-friendly error message

Never fail silently - always inform user of CORS restrictions.

## Code Architecture Principles

### Universal Compatibility

Avoid site-specific hardcoding. Instead:
- Use pattern recognition (class patterns, URL patterns)
- Implement generic algorithms (aspect ratio detection, nested containers)
- Provide fallback strategies for edge cases

### Layout Preservation

Minimize DOM modifications:
- Use overlay approach for picture elements (preserves breakpoints)
- Use absolute positioning for complex layouts (preserves CSS)
- Only modify `display` property of original image (hide, don't remove)

### Performance Optimization

- **On-demand processing** - Only convert images when user requests
- **State caching** - Store conversion state in `data-lif-*` attributes
- **Debounced operations** - 200ms delay for mutation observers
- **Efficient queries** - Minimize repeated DOM searches

### Error Handling

Always handle failures gracefully:
- WebGL context loss
- Network failures for API calls
- CORS restrictions
- Invalid dimensions
- Missing required data

Show user-friendly error messages via temporary popups (z-index: 100000+).

## Important Files

### Documentation
- `README.md` - User-facing features and usage guide
- `TECHNICAL_NOTES.md` - Comprehensive technical deep-dive (68KB!)
- `QUICK_INSTALL_GUIDE.md` - Local messaging setup
- `CHROME_STORE_GUIDE.md` - Chrome Web Store submission guide

### Configuration
- `manifest.json` - Extension manifest (permissions, content scripts, etc.)
- `localConv/host.js` - Native messaging host for local conversion

### Testing
- `test-context-menu.html` - Context menu testing page
- `test-mp4-feature.html` - MP4 export testing page

## API Integration

### Immersity AI Cloud API

Endpoints (configured in `content.js`):
- Production: `https://api.immersity.ai/`
- Development: `https://api.dev.immersity.ai/`
- Lambda: `https://*.lambda-url.us-east-1.on.aws/`
- S3 Storage: `https://leia-storage-service-production.s3.us-east-1.amazonaws.com/`

Authentication via API key stored in `chrome.storage.local`.

### Native Messaging Protocol

For local conversion, the extension uses Chrome Native Messaging:

- **Host ID:** `com.leia.lif_converter`
- **Chunking Protocol:** Handles >1MB images/LIF files (800KB chunks)
- **Session Management:** Unique session IDs prevent chunk collision
- **File-based persistence:** Chunks stored in temp files, survives process restarts

See TECHNICAL_NOTES.md lines 1372-1508 for complete protocol details.

## WebGL Context Management

### Race Condition Protection

The lifViewer includes comprehensive WebGL readiness checks:

```javascript
isWebGLReady() {
    // Check context, shader programs, textures, buffers
    // Return false if any component not ready
    // Prevents black frames during initialization
}
```

Called before every render to ensure all resources are initialized.

### RenderOff Animation System

When mouse leaves the image, the viewer transitions smoothly back to center:

- `isRenderingOff` flag prevents event system conflicts
- All competing event systems check this flag
- Enhanced debouncing (200ms) prevents rapid start/stop cycles
- Immediate restart capability when mouse re-enters during transition

See TECHNICAL_NOTES.md lines 1124-1252 for complete implementation.

## Z-Index Configuration

Centralized z-index system in `content.js`:

```javascript
const Z_INDEX_CONFIG = {
    PROCESSING_OVERLAY: 5000,  // Loading overlays
    CANVAS: 4999,              // 3D canvas elements
    IMAGE: 4999                // Post-conversion images
};
```

Temporary popups (errors, CORS warnings) use 100000+ for top-level visibility.

## Version History

Current version: **4.1.19** (August 2025)

Recent major changes:
- MP4 animation export with high-quality encoding
- Enhanced WebGL race condition protection
- RenderOff animation restart capability
- Context-aware Behance image selection
- Universal nested container positioning
- Flickr theater mode canvas height fix

Check git log for detailed commit history.

## Resources

- Chrome Extension API: https://developer.chrome.com/docs/extensions/
- WebGL Fundamentals: https://webglfundamentals.org/
- Chrome Native Messaging: https://developer.chrome.com/docs/apps/nativeMessaging/
- WebXR Device API: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API
