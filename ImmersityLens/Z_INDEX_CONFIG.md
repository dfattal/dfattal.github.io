# Z-Index Configuration System

This document describes the centralized z-index configuration system for easy maintenance.

## Configuration Variables

### content.js - Global Configuration
```javascript
const Z_INDEX_CONFIG = {
    BUTTON: 5000,           // LIF conversion buttons
    BUTTON_ZONE: 5000,      // Button container zones  
    PROCESSING_OVERLAY: 5000, // Loading overlays during conversion
    CANVAS: 4999,           // Canvas elements (passed to lifViewer)
    IMAGE: 4999             // Post-conversion image elements (passed to lifViewer)
};
```

### LIF.js - lifViewer Properties
```javascript
// In lifViewer constructor:
this.canvasZIndex = options.canvasZIndex || 4999;
this.imageZIndex = options.imageZIndex || 4999;
```

## Layer Hierarchy (Top to Bottom)

1. **Temporary Popups**: 100000+ (CORS info, notifications, errors)
2. **LIF Buttons & Overlays**: 5000 (interactive elements)
3. **Canvas & Images**: 4999 (3D content, behind buttons)
4. **Site Content**: 1-1000 (normal website elements)

## Usage Examples

### Changing Button Z-Index
```javascript
// In content.js, modify:
const Z_INDEX_CONFIG = {
    BUTTON: 6000,  // New value
    // ... rest unchanged
};
```

### Changing Canvas/Image Z-Index  
```javascript
// In content.js, modify:
const Z_INDEX_CONFIG = {
    CANVAS: 5500,  // New value
    IMAGE: 5500,   // New value  
    // ... rest unchanged
};
```

### Passing Custom Z-Index to lifViewer
```javascript
const viewer = lifViewer.createForLayout(lifUrl, container, img, analysis, {
    canvasZIndex: 3000,  // Custom value
    imageZIndex: 3000,   // Custom value
    // ... other options
});
```

## Files Modified

- `content.js`: Global configuration, CSS templates, JavaScript assignments
- `libs/LIF.js`: lifViewer constructor properties, style templates
- All z-index values now use configuration variables instead of hardcoded numbers

## Benefits

- **Centralized Control**: Change z-index values in one place
- **Easy Maintenance**: No hunting through code for hardcoded values
- **Consistent Layering**: All elements use the same configuration source
- **Future-Proof**: Easy to adjust for new website compatibility issues 