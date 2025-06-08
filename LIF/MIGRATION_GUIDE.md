# lifViewer Modernization Migration Guide

## Overview

The `lifViewer` class has been modernized to use the new `LifLoader` and `Renderers` modules, resulting in a more maintainable, modular, and efficient codebase.

## Key Changes

### Architecture Improvements

1. **Modular Design**: Uses separate modules for LIF parsing (`LifLoader`) and rendering (`MN2MNRenderer`/`ST2MNRenderer`)
2. **Code Reduction**: Reduced from ~1400 lines to ~400 lines
3. **Better Error Handling**: Improved context loss recovery and graceful fallbacks
4. **Modern ES6**: Uses ES6 modules with proper imports/exports

### API Compatibility

✅ **The public API remains the same** - existing code should work without changes:

```javascript
// This continues to work exactly the same
const viewer = new lifViewer(
    'path/to/lif.lif',  // lifUrl
    containerElement,    // container
    300,                // height
    false,              // autoplay
    true                // mouseOver
);
```

## What's Improved

### 1. Simplified LIF Loading

**Old approach:**
```javascript
// lifViewer had built-in parseBinary, parseLif53, replaceKeys, etc.
// ~200 lines of parsing logic embedded in the class
```

**New approach:**
```javascript
// Clean separation of concerns
this.lifLoader = new LifLoader();
const result = await this.lifLoader.load(file);
this.views = result.views;
this.stereo_render_data = result.stereo_render_data;
```

### 2. Automatic Renderer Selection

**Old approach:**
```javascript
// Manual setup with setupWebGLMN() or setupWebGLST()
// Different drawSceneMN() and drawSceneST() methods
// ~400 lines of WebGL setup code
```

**New approach:**
```javascript
// Automatic selection based on content
if (this.views.length === 1) {
    this.renderer = await MN2MNRenderer.createInstance(gl, shaderPath, views);
} else {
    this.renderer = await ST2MNRenderer.createInstance(gl, shaderPath, views);
}

// Single drawScene() method for all cases
this.renderer.drawScene(time);
```

### 3. Better Resource Management

**New features:**
- Proper `dispose()` method for cleanup
- Context loss recovery
- Automatic texture size limiting
- Memory leak prevention

## Migration Steps

### For Existing Projects

1. **Update imports** (if using modules):
```javascript
// Old
import { lifViewer } from './LIF.js';

// New  
import { lifViewer } from './lifViewer-modern.js';
```

2. **Add new dependencies**:
```javascript
// Make sure these files are available:
import { LifLoader } from './LifLoader.js';
import { MN2MNRenderer, ST2MNRenderer } from '../VIZ/Renderers.js';
```

3. **No code changes needed** - the API is backward compatible!

### For New Projects

Use the modernized version from the start:

```javascript
import { lifViewer } from './LIF/lifViewer-modern.js';

const viewer = new lifViewer(
    'path/to/file.lif',
    document.getElementById('container'),
    400,     // height
    true,    // autoplay
    true     // mouseOver
);

// Optional: proper cleanup
window.addEventListener('beforeunload', () => {
    viewer.dispose();
});
```

## New Capabilities

### 1. Better Debugging

```javascript
// Debug mode for development
const renderer = await MN2MNRenderer.createInstance(
    gl, shaderPath, views, 
    true,  // debug = true shows debug images
    1024   // limitSize for performance
);
```

### 2. Resource Disposal

```javascript
// Proper cleanup
viewer.dispose();
```

### 3. Global Animation Control

```javascript
// Control all instances at once
lifViewer.disableAllAnimations();
lifViewer.enableAllAnimations();
```

## Performance Improvements

1. **Texture Size Limiting**: Automatic downscaling for better performance
2. **Context Recovery**: Handles WebGL context loss gracefully  
3. **Memory Management**: Proper cleanup prevents memory leaks
4. **Shader Caching**: Renderers cache compiled shaders

## Development Benefits

### 1. Easier Testing
- Separated concerns make unit testing possible
- `LifLoader` can be tested independently
- `Renderers` can be tested independently

### 2. Better Maintainability
- Single responsibility principle
- Clear module boundaries
- Reduced complexity in each module

### 3. Enhanced Debugging
- Better error messages
- Debug texture output
- Cleaner stack traces

## Troubleshooting

### Common Issues

1. **Import Errors**:
```javascript
// Make sure paths are correct
import { LifLoader } from './LifLoader.js';  // Note the .js extension
```

2. **Shader Path Issues**:
```javascript
// Ensure shader files are accessible
const shaderPath = '../Shaders/rayCastMonoLDIGlow.glsl';
```

3. **WebGL Context Issues**:
```javascript
// The new version handles context loss better
// But ensure your container element is properly sized
```

## Migration Checklist

- [ ] Update import paths
- [ ] Ensure LifLoader.js and Renderers.js are available
- [ ] Test with both mono and stereo LIF files
- [ ] Verify mouse interaction works
- [ ] Test animation start/stop functionality
- [ ] Add proper disposal if needed
- [ ] Update any custom shader paths

## Backward Compatibility

The modernized `lifViewer` maintains full backward compatibility with the original API. Existing code should work without any changes. The improvements are internal and transparent to the user.

## Future Considerations

The modular architecture opens up possibilities for:
- Custom renderers for specific use cases
- Alternative LIF loaders for different formats
- Plugin architecture for additional features
- Better integration with modern frameworks

## Questions?

If you encounter any issues during migration, check:
1. Console for import/loading errors
2. Network tab for shader/resource loading issues  
3. WebGL context validity
4. Container element dimensions

The modernized version provides better error messages to help diagnose issues. 