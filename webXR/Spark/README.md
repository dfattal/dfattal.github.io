# WebXR Gaussian Splat Viewer

A web-based Gaussian Splat viewer for WebXR built with Three.js and Spark framework.

## Overview

This viewer enables users to load and view 3D Gaussian Splat captures in both traditional 2D browser mode and immersive VR/AR environments. Simply drag-and-drop a splat file or load from a URL to experience your 3D captures in WebXR.

## Features

- **Multiple Format Support**: Load `.splat`, `.ply`, and Luma AI captures
- **Drag-and-Drop**: Easy file loading via drag-and-drop interface
- **URL Loading**: Load splats directly from URLs
- **Quality Presets**: Choose from Low, Medium, or High quality settings for optimal performance
- **WebXR Ready**: Seamless VR/AR viewing with session persistence
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Three.js v0.173.0**: 3D rendering engine
- **WebXR**: Immersive VR/AR support
- **Luma AI Web Library**: Support for Luma AI captures
- **Pure ES Modules**: No build step required

## Usage

### Loading a Splat File

1. **Drag and Drop**: Drag a `.splat` or `.ply` file onto the drop zone
2. **Browse Files**: Click the drop zone to open a file browser
3. **Load from URL**: Enter a URL to a splat file and click "Load"

### Quality Presets

- **Low**: Optimized for mobile XR devices
- **Medium**: Balanced quality for standalone VR headsets (default)
- **High**: Maximum quality for PC VR setups

### Entering VR/AR Mode

1. Load a splat file using any of the methods above
2. Click the "Enter VR" or "Enter AR" button at the bottom of the screen
3. The loaded splat will persist when switching between 2D and XR modes

## Supported File Formats

- `.splat` - Standard Gaussian Splat format
- `.ply` - Point cloud format commonly used for Gaussian Splats
- Luma AI captures - Via their official loader

## Browser Compatibility

This viewer requires a modern browser with WebXR support:

- Chrome/Edge (recommended for VR)
- Firefox
- Mobile browsers for AR experiences

## Sample Files

### Test URLs

You can test the viewer with these sample Gaussian Splat files:

**PLY Format:**
- Use any PLY point cloud file for testing

**Luma AI Captures:**
- Visit https://lumalabs.ai/ and grab a capture URL
- Example format: `https://lumalabs.ai/capture/[capture-id]`

**Note:** To test locally, you'll need sample `.splat` or `.ply` files. You can:
1. Create your own captures using Luma AI or other Gaussian Splatting tools
2. Download sample files from Gaussian Splatting research repositories
3. Convert existing 3D models to PLY format

## Development

This is a pure ES module application with no build step required. Simply serve the files with a local web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000
```

Then open `http://localhost:8000` in your browser.

## Project Structure

```
/
├── index.html              # Main HTML file with UI and styles
├── index.js                # Main application logic
├── loaders/               # Gaussian Splat loaders
│   ├── SplatLoader.js     # Standard .splat format loader
│   ├── PLYLoader.js       # PLY format loader
│   └── LumaSplatsLoader.js # Luma AI loader wrapper
├── utils/                 # Utilities
│   ├── fileValidator.js   # File validation
│   └── qualityPresets.js  # Quality configuration
└── README.md              # This file
```

## Troubleshooting

### Splat file won't load
- Ensure the file is in a supported format (`.splat`, `.ply`)
- Check browser console for detailed error messages
- Try a different quality preset if performance is an issue

### WebXR not available
- Ensure you're using a WebXR-compatible browser
- For VR: Connect your VR headset and ensure it's detected
- For AR: Use a mobile device with AR support

### Performance issues
- Try switching to a lower quality preset
- Close other browser tabs to free up memory
- Ensure your device meets WebXR performance requirements

## License

_(License information to be added)_

## Credits

Built with:
- [Three.js](https://threejs.org/)
- [Luma AI Web Library](https://lumalabs.ai/luma-web-library)
- Inspired by the Spark framework examples

---

**Status**: In Development
