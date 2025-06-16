# ImmersityLens Chrome Extension

A Chrome extension that converts 2D images into immersive 3D LIF (Leia Image Format) files through an intuitive right-click context menu. Works seamlessly across all websites with intelligent image detection and universal layout compatibility.

## 🎯 Overview

ImmersityLens transforms any image on the web into 3D using advanced depth mapping technology. Simply right-click any image and select "Convert to 3D" to create an interactive 3D LIF file that you can download, export as MP4 animation, view with mouse hover animation, or experience in VR.

### Key Features

- **Universal Image Support**: Right-click any image on any website
- **Instant 3D Conversion**: Advanced AI-powered depth mapping
- **Interactive 3D Viewer**: Mouse hover animation with depth effects
- **MP4 Animation Export**: Download 3D animations as high-quality MP4 videos
- **VR Compatible**: Full WebXR support for immersive viewing
- **Download & Share**: Save LIF files for use in other applications
- **Zero UI Clutter**: Clean, non-intrusive context menu interface

## 🚀 How It Works

### Simple 3-Step Process

1. **Right-click any image** on any website
2. **Select "Convert to 3D"** from the context menu
3. **Experience your 3D image** with hover animation, download LIF/MP4, or VR viewing

### Context Menu Options

After conversion, right-click the 3D image to access:
- **Download LIF**: Save the 3D image file for viewing in compatible applications
- **Download MP4**: Export the 3D animation as a high-quality MP4 video (NEW!)
- **Enter VR**: Launch immersive VR experience (WebXR compatible devices)

## 🎬 MP4 Animation Export (NEW!)

### Features
- **High-Quality Output**: Configurable bitrate for crisp, professional videos
- **Smooth Animation**: 30fps output with optimized rendering pipeline
- **Auto-Sizing**: Automatically uses source image dimensions
- **Compatible Format**: H.264 MP4 files that work everywhere
- **Optimized Rendering**: Special time handling to avoid shader artifacts

### Technical Details
- **Format**: MP4 (H.264 codec with baseline profile for maximum compatibility)
- **Frame Rate**: 30fps (fixed for consistent quality)
- **Bitrate**: 0.2 × (width × height × fps) for optimal quality/size balance
- **Duration**: Matches the 3D animation cycle (typically 4 seconds)
- **Resolution**: Uses original image dimensions (e.g., 1920×1080)

### Quality Settings
The MP4 export uses high-quality encoding:
- **1080p**: ~12.4 Mbps bitrate for crisp detail
- **720p**: ~5.5 Mbps bitrate for smaller file sizes
- **4K**: ~49.8 Mbps bitrate for maximum quality

## 🏗️ Technical Architecture

### Context Menu System

The extension uses Chrome's native context menu API for seamless integration:

- **Dynamic Menu States**: Context menu adapts based on image conversion status
- **Intelligent Detection**: Automatically finds images in complex DOM structures
- **Instant Menu Updates**: Context menu reflects current image state without lag
- **Universal Compatibility**: Works with any image structure or website layout

### Advanced Animation System

#### Enhanced lifViewer with Animation Pipeline
- **Harmonic Motion**: Smooth sine-wave based camera movement for natural 3D parallax
- **Mouse Interaction**: Responsive mouse tracking with smoothing algorithms
- **Focus System**: Configurable convergence distance for depth perception
- **Render Optimization**: Separate pipelines for real-time viewing vs MP4 export

#### MP4 Generation Pipeline
```javascript
// High-quality MP4 export process
1. Create offscreen lifViewer instance
2. WebGL warm-up phase (5 frames for state stabilization)
3. Start MediaRecorder with optimized codec settings
4. Render clean first frame to eliminate artifacts
5. Generate animation frames at precise timing intervals
6. Export with automatic filename generation
```

### Advanced Image Processing

#### Smart Image Detection
The extension employs sophisticated algorithms to locate images in complex DOM hierarchies:

- **Recursive Tree Search**: Finds images at any nesting level
- **Parent/Sibling Analysis**: Handles carousel and gallery structures
- **Multi-layer Filtering**: Eliminates UI elements, icons, and non-content images

#### Layout Intelligence
Automatically detects and adapts to different website layouts:

- **Picture Elements**: CNN, BBC, news sites with responsive sources
- **Aspect Ratio Containers**: Instagram, Pinterest, Shopify layouts
- **Complex Positioning**: Facebook, LinkedIn social media layouts
- **Standard Images**: Regular websites and e-commerce platforms

### Enhanced lifViewer Integration

The extension includes an enhanced lifViewer with automatic layout detection:

```javascript
// Automatic layout detection and configuration
const viewer = lifViewer.createForLayout(lifUrl, container, {
    image: imageElement,
    dimensions: { width: targetWidth, height: targetHeight }
});
```

#### Animation Configuration
- **Default Motion**: Gentle Z-axis boomerang effect for natural depth perception
- **Static Values**: Independent of view data for consistent cross-platform behavior
- **Focus Integration**: Uses LIF stereo render data when available
- **Mouse Smoothing**: Advanced interpolation for responsive interaction

## 🌐 Universal Website Compatibility

### Tested Platforms

#### Social Media
- **Instagram**: Full carousel support, story images, profile content
- **Facebook**: Timeline images, photo albums, shared content
- **LinkedIn**: Profile images, article content, post media
- **Pinterest**: Pin images, board content, search results
- **Twitter**: Tweet images, profile photos, media attachments

#### E-commerce & Shopping
- **Amazon**: Product images, search results, detail pages
- **Shopify Sites**: Product galleries, collection pages
- **General E-commerce**: Universal product image support

#### News & Media
- **CNN**: Article images, breaking news content
- **BBC**: News photos, feature articles
- **General News Sites**: Universal news image support

#### Photography & Arts
- **Flickr**: Photo streams, albums, theater mode
- **DeviantArt**: Artwork galleries, user submissions
- **Photography Portfolios**: Professional photography sites

#### Search & Discovery
- **Google Images**: Search result images
- **Image Search Engines**: Universal search result support

### Intelligent Filtering System

The extension includes a sophisticated 6-layer filtering system:

1. **Visibility Analysis**: Skips hidden, invisible, or off-screen images
2. **Shape Recognition**: Filters decorative elements with extreme aspect ratios
3. **Semantic Analysis**: Identifies UI elements by alt text, classes, and URLs
4. **Contextual Filtering**: Recognizes navigation, header, footer, and UI areas
5. **Site-Specific Intelligence**: Optimized handling for major platforms
6. **Overlap Detection**: Avoids background or covered images

## 🎮 VR Experience

### WebXR Integration
- **Automatic Detection**: Checks for WebXR support on device
- **Pre-loaded System**: VR components loaded once for optimal performance
- **Cross-Platform**: Works with VR headsets, AR devices, and mobile VR
- **Immersive Controls**: Full spatial interaction in VR environment

### Supported Devices
- **VR Headsets**: Oculus, HTC Vive, Windows Mixed Reality
- **Mobile VR**: Smartphone-based VR viewers
- **AR Devices**: ARCore/ARKit compatible devices
- **Desktop**: Mouse/keyboard navigation for non-VR devices

## ⚡ Performance & Reliability

### On-Demand Processing
- **No Background Scanning**: Only processes images when requested
- **Efficient Resource Usage**: Minimal memory footprint
- **Fast Context Menu**: Instant menu updates without lag
- **Smart Caching**: Optimized for repeat interactions

### MP4 Export Optimization
- **Offscreen Rendering**: Dedicated WebGL context for video generation
- **Memory Management**: Automatic cleanup of temporary resources
- **Codec Compatibility**: Multiple fallback options for maximum device support
- **Quality Balance**: Optimized bitrate for excellent quality with reasonable file sizes

### Error Handling
- **CORS Protection**: Graceful handling of cross-origin images
- **Network Resilience**: Retry logic for connection issues
- **Dimension Validation**: Automatic correction for problematic layouts
- **Fallback Systems**: Multiple detection strategies for reliability

## 🛠️ Development & Architecture

### Core Components
```
ImmersityLens/
├── content.js          # Main extension logic & context menu handling
├── background.js       # Chrome extension background service
├── popup.js           # Extension popup interface
├── popup.html         # Extension settings & status UI
├── manifest.json      # Extension configuration
├── libs/              # Core processing libraries
│   ├── LIF.js         # Enhanced lifViewer with animation & MP4 export
│   ├── monoLdiGenerator.js  # 2D to 3D conversion engine
│   └── VRPageSystem.js # VR system integration
└── shaders/          # WebGL shaders for 3D rendering
```

### Key Technologies
- **Chrome Extension APIs**: Context menus, content scripts, messaging
- **WebGL**: Hardware-accelerated 3D rendering
- **MediaRecorder API**: High-quality MP4 video generation
- **WebXR**: VR/AR compatibility layer  
- **Advanced DOM Analysis**: Intelligent layout detection
- **AI Depth Mapping**: Sophisticated 2D to 3D conversion algorithms

### Animation System Architecture
- **Harmonic Motion Engine**: Mathematical sine-wave based camera animation
- **Mouse Interaction Layer**: Real-time tracking with smoothing algorithms
- **Dual Render Pipeline**: Separate paths for real-time display vs MP4 export
- **Frame Timing Control**: Precise timing control for consistent video output

## 🔧 Installation & Usage

### Installation
1. Download the extension from Chrome Web Store
2. Grant necessary permissions for image access
3. Extension icon appears in Chrome toolbar
4. Requires active Immersity AI subscription for conversion features

### Basic Usage
1. Navigate to any website with images
2. Right-click on any image you want to convert
3. Select "Convert to 3D" from context menu
4. Watch the 3D conversion process with purple glow animation
5. Interact with 3D image (hover for animation)
6. Right-click converted image for download options:
   - **Download LIF**: 3D image file
   - **Download MP4**: Animated video export (NEW!)
   - **Enter VR**: Immersive VR experience

### MP4 Export Workflow
1. Convert any image to 3D using the extension
2. Right-click the converted 3D image
3. Select "Download MP4" from the context menu
4. Extension automatically:
   - Uses source image dimensions
   - Renders at 30fps with high quality
   - Exports as H.264 MP4 for universal compatibility
   - Downloads with descriptive filename

## 🎯 Technical Innovation

### Enhanced Animation Pipeline
- **Artifact-Free Rendering**: Special time handling (t=1.1) eliminates shader glow effects during MP4 export
- **Dual Time Systems**: Animation motion uses variable time, rendering effects use fixed time
- **WebGL State Management**: Proper warm-up phase prevents first-frame color tone issues
- **Quality Optimization**: 5x increased bitrate for crisp, professional video output

### Smart File Management
- **Intelligent Naming**: Uses image alt text or URL for descriptive filenames
- **Format Detection**: Automatic codec selection based on browser support
- **Dimension Inheritance**: MP4 uses source image resolution automatically
- **Progress Tracking**: Real-time conversion progress with detailed logging

## 🔍 Troubleshooting

### Common Issues
- **CORS Errors**: Some images may be protected by cross-origin policies
- **VR Not Available**: Requires WebXR-compatible device and browser
- **Conversion Fails**: Very small images (<100px) are filtered out
- **Performance**: Large images may take longer to process
- **MP4 Export**: Requires modern browser with MediaRecorder API support

### Debug Information
Enable developer console for detailed logging:
- Image detection process
- Layout analysis results
- Conversion progress tracking
- MP4 generation pipeline status
- Error details and fallback strategies

## 🚀 Recent Updates (v3.2.1)

### New Features
- **MP4 Animation Export**: High-quality video download functionality
- **Enhanced Quality**: Optimized bitrate settings for crisp output
- **Improved First Frame**: Fixed color tone issues in MP4 exports
- **Automatic Dimensions**: Uses source image resolution automatically

### Technical Improvements
- **Simplified Animation System**: Streamlined single "Default" animation
- **Mouse Drift Fix**: Resolved accumulation issues in mouse interaction
- **WebGL Optimization**: Improved state management and rendering pipeline
- **Better Error Handling**: More robust conversion process

## 📄 License

This project is part of the ImmersityLens ecosystem for 3D image processing and viewing. All rights reserved. 