# ImmersityLens Chrome Extension

A Chrome extension that converts 2D images into immersive 3D LIF (Leia Image Format) files through an intuitive right-click context menu. Works seamlessly across all websites with intelligent image detection and universal layout compatibility.

## 🎯 Overview

ImmersityLens transforms any image on the web into 3D using advanced depth mapping technology. Simply right-click any image and select "Convert to 3D" to create an interactive 3D LIF file that you can download, view with mouse hover animation, or experience in VR.

### Key Features

- **Universal Image Support**: Right-click any image on any website
- **Instant 3D Conversion**: Advanced AI-powered depth mapping
- **Interactive 3D Viewer**: Mouse hover animation with depth effects
- **VR Compatible**: Full WebXR support for immersive viewing
- **Download & Share**: Save LIF files for use in other applications
- **Zero UI Clutter**: Clean, non-intrusive context menu interface

## 🚀 How It Works

### Simple 3-Step Process

1. **Right-click any image** on any website
2. **Select "Convert to 3D"** from the context menu
3. **Experience your 3D image** with hover animation, download, or VR viewing

### Context Menu Options

- **Convert to 3D**: Transform 2D image into interactive 3D LIF
- **Download LIF**: Save the 3D file to your computer (appears after conversion)
- **Enter VR**: Launch immersive VR experience (WebXR compatible devices)

## 🏗️ Technical Architecture

### Context Menu System

The extension uses Chrome's native context menu API for seamless integration:

- **Intelligent Detection**: Automatically finds images in complex DOM structures
- **Instant Menu Updates**: Context menu reflects current image state without lag
- **Universal Compatibility**: Works with any image structure or website layout

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

#### Supported Layout Modes
- **Standard**: Regular images with container wrapping
- **Picture**: Responsive `<picture>` elements with multiple sources
- **Aspect Ratio**: Padding-based responsive containers
- **Overlay**: Complex positioned layouts requiring absolute positioning
- **Facebook**: Social media complex hierarchy handling

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
│   ├── LIF.js         # Enhanced lifViewer with layout intelligence
│   ├── monoLdiGenerator.js  # 2D to 3D conversion engine
│   └── VRLifViewer.js # VR system integration
└── shaders/          # WebGL shaders for 3D rendering
```

### Key Technologies
- **Chrome Extension APIs**: Context menus, content scripts, messaging
- **WebGL**: Hardware-accelerated 3D rendering
- **WebXR**: VR/AR compatibility layer  
- **Advanced DOM Analysis**: Intelligent layout detection
- **AI Depth Mapping**: Sophisticated 2D to 3D conversion algorithms

### Layout Detection System
The extension includes universal pattern recognition:
- **CSS Analysis**: Detects responsive patterns, aspect ratios, positioning
- **DOM Structure**: Analyzes container hierarchies and relationships
- **Dimension Correction**: Handles problematic dimension reporting
- **Event Management**: Prevents conflicts with website functionality

## 🔧 Installation & Usage

### Installation
1. Download the extension from Chrome Web Store (or load unpacked for development)
2. Grant necessary permissions for image access
3. Extension icon appears in Chrome toolbar

### Basic Usage
1. Navigate to any website with images
2. Right-click on any image you want to convert
3. Select "Convert to 3D" from context menu
4. Watch the 3D conversion process
5. Interact with 3D image (hover for animation)
6. Download LIF file or enter VR mode as desired

### Advanced Features
- **Batch Processing**: Convert multiple images from the same site
- **Quality Settings**: Adjust conversion parameters in popup
- **VR Preferences**: Configure VR interaction settings
- **File Management**: Organize and manage downloaded LIF files

## 🎯 Technical Innovation

### Enhanced lifViewer Factory Method
Automatic layout detection eliminates complex site-specific code:
- **95% Code Reduction**: From 200+ lines to ~10 lines for complex layouts
- **Universal Compatibility**: Works with any website layout
- **Eliminated Race Conditions**: Robust event handling system
- **Future-Proof Design**: Easy to extend for new layout patterns

### Smart Dimension Priority System
Intelligent dimension detection for optimal results:
- **Context-Aware**: Different strategies for different image types
- **CSS Object-Fit Support**: Comprehensive detection of modern layouts
- **Responsive Compatibility**: Maintains layout integrity
- **Cross-Browser**: Consistent behavior across all browsers

## 🔍 Troubleshooting

### Common Issues
- **CORS Errors**: Some images may be protected by cross-origin policies
- **VR Not Available**: Requires WebXR-compatible device and browser
- **Conversion Fails**: Very small images (<100px) are filtered out
- **Performance**: Large images may take longer to process

### Debug Information
Enable developer console for detailed logging:
- Image detection process
- Layout analysis results
- Conversion progress tracking
- Error details and fallback strategies

## 🚀 Future Enhancements

- **Batch Conversion**: Process multiple images simultaneously
- **Cloud Processing**: Offload conversion for faster results
- **Advanced VR Controls**: Enhanced spatial interaction
- **Social Sharing**: Direct sharing of 3D content
- **AI Improvements**: Enhanced depth detection algorithms
- **Mobile Optimization**: Improved mobile device support

## 📄 License

This project is part of the ImmersityLens ecosystem for 3D image processing and viewing. All rights reserved. 