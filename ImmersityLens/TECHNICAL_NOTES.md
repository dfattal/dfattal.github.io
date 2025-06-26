# ImmersityLens Technical Notes

## Architecture Overview

ImmersityLens uses a context menu-based approach for converting 2D images into immersive 3D LIF files. The extension employs intelligent image detection, universal layout compatibility, and advanced processing algorithms to work seamlessly across all websites.

## Context Menu System

### Core Design Philosophy

The extension moved from an automatic button-based system to an on-demand context menu approach to provide:
- **Clean User Experience**: No UI clutter on websites
- **Performance**: Only processes images when requested
- **Universal Compatibility**: Works with any website structure
- **Reliability**: Single conversion per request, no race conditions

### Context Menu Implementation

#### Pre-Created Menu Items
```javascript
// Background service worker creates menu items once
chrome.contextMenus.create({
    id: "convertTo3D",
    title: "Convert to 3D",
    visible: true,
    contexts: ["image"]
});

chrome.contextMenus.create({
    id: "downloadLIF",
    title: "Download LIF",
    visible: false,
    contexts: ["image"]
});

chrome.contextMenus.create({
    id: "enterVR",
    title: "Enter VR",
    visible: false,
    contexts: ["image"]
});
```

#### Instant Menu Updates
```javascript
// Fast visibility toggling eliminates "one step behind" lag
chrome.contextMenus.update("downloadLIF", { visible: hasLIF });
chrome.contextMenus.update("enterVR", { visible: hasLIF && isWebXRSupported });
```

### Image Detection Algorithm

#### Multi-Layer Detection Strategy
The extension uses a hierarchical approach to find images in complex DOM structures:

```javascript
function findImageInContext(clickedElement) {
    // 1. Direct image detection
    if (clickedElement.tagName === 'IMG') {
        return clickedElement;
    }
    
    // 2. Recursive tree search
    const imgInTree = findImgInTree(clickedElement);
    if (imgInTree) return imgInTree;
    
    // 3. Parent and sibling search
    return findImgInParentsAndSiblings(clickedElement);
}
```

#### Recursive Tree Search
```javascript
function findImgInTree(element) {
    if (!element || !element.children) return null;
    
    // Check current element
    if (element.tagName === 'IMG') return element;
    
    // Recursively check children
    for (let child of element.children) {
        const found = findImgInTree(child);
        if (found) return found;
    }
    
    return null;
}
```

#### Parent/Sibling Analysis
```javascript
function findImgInParentsAndSiblings(element) {
    let current = element;
    let levels = 0;
    const maxLevels = 10; // Prevent infinite loops
    
    while (current && current !== document && levels < maxLevels) {
        // Check current element and its subtree
        const img = findImgInTree(current);
        if (img) return img;
        
        // Check siblings
        if (current.parentElement) {
            for (let sibling of current.parentElement.children) {
                if (sibling !== current) {
                    const siblingImg = findImgInTree(sibling);
                    if (siblingImg) return siblingImg;
                }
            }
        }
        
        current = current.parentElement;
        levels++;
    }
    
    return null;
}
```

## Intelligent Image Filtering

### 6-Layer Filtering System

The extension employs sophisticated filtering to identify content-worthy images and eliminate UI elements:

#### Layer 1: Visibility & Layout Filtering
```javascript
function isVisibleImage(img) {
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);
    
    // Skip invisible images
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        parseFloat(style.opacity) === 0) {
        return false;
    }
    
    // Skip zero-dimension images
    if (rect.width <= 0 || rect.height <= 0) {
        return false;
    }
    
    // Skip extremely off-screen images (performance optimization)
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const isExtremelyOffScreen = 
        rect.right < -1000 || rect.bottom < -1000 ||
        rect.left > viewport.width + 3000 ||
        (rect.top > viewport.height + 5000 && rect.left < -500);
    
    return !isExtremelyOffScreen;
}
```

#### Layer 2: Shape & Geometric Analysis
```javascript
function isContentImage(img, rect) {
    const aspectRatio = rect.width / rect.height;
    
    // Skip decorative elements (extreme aspect ratios)
    if (aspectRatio > 20 || aspectRatio < 0.05) {
        return false;
    }
    
    // Skip small square images (likely icons/logos)
    const isSmallSquare = rect.width <= 150 && rect.height <= 150 && 
                          Math.abs(aspectRatio - 1) < 0.2;
    
    return !isSmallSquare;
}
```

#### Layer 3: Semantic Content Analysis
```javascript
function hasUIIndicators(img) {
    // Alt text analysis
    const altText = (img.alt || '').toLowerCase();
    const uiKeywords = ['icon', 'logo', 'avatar', 'rating', 'thumbnail', 'badge', 'star'];
    
    if (uiKeywords.some(keyword => altText.includes(keyword))) {
        return true;
    }
    
    // Class name analysis
    const className = (img.className || '').toLowerCase();
    const uiClasses = ['nav-', 'menu-', 'thumb', 'sprite', 'ui-', 'footer-'];
    
    if (uiClasses.some(uiClass => className.includes(uiClass))) {
        return true;
    }
    
    // URL pattern analysis
    const src = (img.src || '').toLowerCase();
    const uiPaths = ['/icons/', '/logos/', '/sprites/', '/thumbs/', '/avatars/'];
    
    return uiPaths.some(path => src.includes(path));
}
```

#### Layer 4: Contextual Parent Analysis
```javascript
const UI_SELECTORS = [
    // Navigation and UI areas
    'nav', 'header', 'footer', 'aside', 'sidebar',
    '.navigation', '.menu', '.navbar', '.topbar',
    
    // E-commerce UI elements
    '.cart', '.checkout', '.wishlist', '.rating', '.stars',
    
    // Social media components
    '.social', '.share', '.follow', '.like', '.comment',
    
    // Advertisement areas
    '.ad', '.banner', '.sponsored', '.promotion'
];

function isInUIContext(img) {
    return UI_SELECTORS.some(selector => img.closest(selector) !== null);
}
```

#### Layer 5: Site-Specific Intelligence
```javascript
function applySiteSpecificFiltering(img) {
    const hostname = window.location.hostname;
    
    // Amazon-specific filtering
    if (hostname.includes('amazon.')) {
        const isAmazonThumbnail = 
            img.closest('[data-component-type="s-search-result"]') ||
            img.closest('.a-carousel') ||
            img.classList.contains('s-image') ||
            img.classList.contains('s-thumb');
            
        if (isAmazonThumbnail) {
            const rect = img.getBoundingClientRect();
            return rect.width >= 200 && rect.height >= 200; // Only larger images
        }
    }
    
    // Instagram-specific video filtering
    if (hostname.includes('instagram.com')) {
        const parentContainer = img.closest('div[role="button"]') || img.closest('article');
        if (parentContainer) {
            const hasVideoIndicators = 
                parentContainer.querySelector('svg[aria-label*="audio"]') ||
                parentContainer.querySelector('button[aria-label*="Toggle"]') ||
                parentContainer.innerHTML.includes('playsinline') ||
                parentContainer.innerHTML.includes('blob:');
                
            return !hasVideoIndicators;
        }
    }
    
    return true;
}
```

#### Layer 6: Overlapping Elements Detection
```javascript
function isBackgroundImage(img) {
    const rect = img.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const topElement = document.elementFromPoint(centerX, centerY);
    
    // If the topmost element isn't the image, it might be covered
    if (topElement !== img) {
        const topRect = topElement.getBoundingClientRect();
        const sizeDifference = (topRect.width * topRect.height) / (rect.width * rect.height);
        
        // If covering element is significantly larger, image is likely background
        return sizeDifference > 2;
    }
    
    return false;
}
```

## Layout Detection & Analysis

### Universal Layout Patterns

The extension detects and adapts to different website layout patterns:

#### Pattern Recognition System
```javascript
function analyzeLayoutPattern(container, img) {
    const analysis = {
        type: 'unknown',
        containerHasPaddingAspectRatio: false,
        isFacebookStyle: false,
        isPictureElement: false,
        hasObjectFit: false,
        paddingContainer: null
    };
    
    // Picture element detection
    const pictureElement = img.closest('picture');
    if (pictureElement) {
        analysis.type = 'picture';
        analysis.isPictureElement = true;
        return analysis;
    }
    
    // Aspect ratio container detection
    analysis.paddingContainer = findAspectRatioContainer(container);
    if (analysis.paddingContainer) {
        analysis.containerHasPaddingAspectRatio = true;
        analysis.type = 'aspectRatio';
    }
    
    // Facebook-style complex positioning
    if (detectFacebookStyle(container)) {
        analysis.isFacebookStyle = true;
        analysis.type = 'facebook';
    }
    
    // CSS object-fit detection
    const computedStyle = window.getComputedStyle(img);
    analysis.hasObjectFit = computedStyle.objectFit && 
                           computedStyle.objectFit !== 'fill' && 
                           computedStyle.objectFit !== 'none';
    
    return analysis;
}
```

#### Aspect Ratio Container Detection
```javascript
function findAspectRatioContainer(startElement) {
    let currentElement = startElement;
    let levels = 0;
    const maxLevels = 3; // Conservative search range
    
    while (currentElement && levels < maxLevels) {
        // Check explicit aspect ratio classes
        const isAspectRatioContainer = 
            currentElement.classList?.contains('ratio-box') ||
            currentElement.classList?.contains('aspect-ratio') ||
            currentElement.classList?.contains('ratio') ||
            currentElement.classList?.contains('aspect');
        
        if (isAspectRatioContainer) {
            return { element: currentElement, method: 'class' };
        }
        
        // Check inline padding styles
        const inlinePadding = currentElement.style.paddingTop || currentElement.style.paddingBottom;
        if (inlinePadding && inlinePadding.includes('%')) {
            return { element: currentElement, method: 'inline' };
        }
        
        // Check computed padding styles
        const computedStyle = window.getComputedStyle(currentElement);
        const computedPadding = computedStyle.paddingTop || computedStyle.paddingBottom;
        if (computedPadding && computedPadding.includes('%')) {
            return { element: currentElement, method: 'computed' };
        }
        
        currentElement = currentElement.parentElement;
        levels++;
    }
    
    return null;
}
```

### Smart Dimension Priority System

Different dimension detection strategies based on image context:

```javascript
function calculateEffectiveDimensions(img, layoutAnalysis) {
    const imgRect = img.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(img);
    
    // Detect centered/fitted images
    const isCenteredOrFitted = detectCenteredFittedImage(img, computedStyle);
    
    // Detect explicit HTML dimensions
    const hasExplicitDimensions = img.width && img.height;
    
    // Object-fit detection
    const hasObjectFit = computedStyle.objectFit && 
                        computedStyle.objectFit !== 'fill' && 
                        computedStyle.objectFit !== 'none';
    
    let effectiveWidth, effectiveHeight;
    
    if (hasExplicitDimensions && isCenteredOrFitted) {
        // LinkedIn case: Prioritize HTML attributes for explicitly sized images
        effectiveWidth = img.width || img.naturalWidth || imgRect.width;
        effectiveHeight = img.height || img.naturalHeight || imgRect.height;
    } else if (hasObjectFit || isCenteredOrFitted) {
        // DeviantArt case: Use natural dimensions for object-fit images
        effectiveWidth = img.naturalWidth || img.width || imgRect.width;
        effectiveHeight = img.naturalHeight || img.height || imgRect.height;
    } else {
        // Standard case: Use bounding rect dimensions
        effectiveWidth = imgRect.width;
        effectiveHeight = imgRect.height;
    }
    
    return { width: effectiveWidth, height: effectiveHeight };
}
```

#### Centered/Fitted Image Detection
```javascript
function detectCenteredFittedImage(img, computedStyle) {
    const className = (img.className || '').toLowerCase();
    
    // Class-based detection
    const centeredClasses = [
        'centered', 'center', 'aspect-fit', 'aspect-fill', 'object-fit',
        'img-centered', 'image-center', 'fitted', 'responsive-img'
    ];
    
    const hasCenteredClass = centeredClasses.some(cls => 
        className.includes(cls) || className.includes(`-${cls}`) || className.includes(`_${cls}`)
    );
    
    // CSS object-fit detection
    const hasObjectFit = computedStyle.objectFit && 
                        computedStyle.objectFit !== 'fill' && 
                        computedStyle.objectFit !== 'none';
    
    return hasCenteredClass || hasObjectFit;
}
```

## Enhanced lifViewer Integration

### Factory Method Architecture

The extension includes an enhanced lifViewer with automatic layout detection:

```javascript
// Enhanced lifViewer with layout intelligence
const viewer = lifViewer.createForLayout(lifUrl, container, {
    image: imageElement,
    dimensions: { width: targetWidth, height: targetHeight },
    layout: detectedLayout, // Auto-detected if not specified
    mouseOver: true,
    autoplay: false
});
```

### Layout Mode Detection
```javascript
function detectLayoutMode(container, image, options) {
    const layoutAnalysis = options.layoutAnalysis || {};
    
    // Picture element mode
    const pictureElement = image.closest('picture');
    if (pictureElement) {
        return 'picture';
    }
    
    // Facebook complex positioning mode
    if (layoutAnalysis.isFacebookStyle) {
        return 'facebook';
    }
    
    // Aspect ratio container mode
    if (layoutAnalysis.containerHasPaddingAspectRatio) {
        return 'aspectRatio';
    }
    
    // Object-fit or centered/fitted mode
    const computedStyle = window.getComputedStyle(image);
    const hasObjectFit = computedStyle.objectFit && 
                        computedStyle.objectFit !== 'fill' && 
                        computedStyle.objectFit !== 'none';
    
    if (hasObjectFit || detectCenteredFittedImage(image, computedStyle)) {
        return 'aspectRatio';
    }
    
    // Overlay mode for complex positioning
    if (requiresOverlayPositioning(container, image)) {
        return 'overlay';
    }
    
    // Standard mode fallback
    return 'standard';
}
```

### Layout Configuration System
```javascript
const LAYOUT_CONFIGS = {
    standard: {
        containerSizing: true,
        canvasPositioning: 'relative',
        eventHandling: 'standard',
        preventResizing: false
    },
    picture: {
        containerSizing: false,
        canvasPositioning: 'absolute',
        eventHandling: 'container',
        preventResizing: true
    },
    facebook: {
        containerSizing: false,
        canvasPositioning: 'absolute',
        eventHandling: 'unified',
        preventResizing: true
    },
    aspectRatio: {
        containerSizing: false,
        canvasPositioning: 'absolute',
        eventHandling: 'container',
        preventResizing: true
    },
    overlay: {
        containerSizing: false,
        canvasPositioning: 'absolute',
        eventHandling: 'unified',
        preventResizing: true
    }
};
```

### Configurable Parameters

The lifViewer includes several configurable parameters for customizing user experience:

#### Relaxation Time
Controls the transition speed when mouse leaves the 3D canvas:
```javascript
// Configure during initialization
const viewer = new lifViewer(lifUrl, container, {
    relaxationTime: 0.8  // Slower transition (default: 0.5 seconds)
});

// Or modify dynamically
viewer.setRelaxationTime(1.2);  // Very slow, dramatic transition
```

#### Feathering and Background Color
Customize 3D rendering appearance:
```javascript
// Set in lifViewer constructor
this.feathering = 0.1;                    // Edge softening (default: 0.1)
this.background = [0.1, 0.1, 0.1, 1.0];  // RGBA background (default: dark gray)
```

## Platform-Specific Optimizations

### Instagram Carousel Support
```javascript
function processInstagramCarousels() {
    if (!window.location.hostname.includes('instagram.com')) return;
    
    const carouselContainers = document.querySelectorAll('ul._acay');
    
    carouselContainers.forEach(carousel => {
        const carouselItems = carousel.querySelectorAll('li._acaz');
        
        carouselItems.forEach(item => {
            const images = item.querySelectorAll('img');
            
            images.forEach(img => {
                // Use natural dimensions for hidden carousel images
                const rect = img.getBoundingClientRect();
                const effectiveWidth = rect.width > 0 ? rect.width : 
                                      (img.naturalWidth || img.width);
                const effectiveHeight = rect.height > 0 ? rect.height : 
                                       (img.naturalHeight || img.height);
                
                if (effectiveWidth >= 200 && effectiveHeight >= 200) {
                    // Mark as carousel image for special handling
                    img.dataset.isCarouselImage = 'true';
                }
            });
        });
    });
}
```

### Flickr Theater Mode
```javascript
function setupFlickrTheaterMode() {
    if (!window.location.hostname.includes('flickr.com')) return;
    
    // Monitor for theater mode activation
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-lif-active') {
                const container = mutation.target;
                if (container.dataset.lifActive === 'true') {
                    applyFlickrTheaterModeFix(container);
                }
            }
        });
    });
    
    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-lif-active'],
        subtree: true
    });
}

function applyFlickrTheaterModeFix(container) {
    const heightController = document.querySelector('.height-controller');
    
    if (heightController) {
        const heightControllerRect = heightController.getBoundingClientRect();
        const facadeContainer = document.querySelector('.facade-of-protection-neue');
        
        // Calculate center position
        const imageWidth = facadeContainer ? facadeContainer.offsetWidth : 1453;
        const imageHeight = facadeContainer ? facadeContainer.offsetHeight : 969;
        
        const centerTop = heightControllerRect.top + 
                         ((heightControllerRect.height - imageHeight) / 2);
        const centerLeft = heightControllerRect.left + 
                          ((heightControllerRect.width - imageWidth) / 2);
        
        // Apply fixed positioning
        container.style.cssText = `
            position: fixed !important;
            top: ${centerTop}px !important;
            left: ${centerLeft}px !important;
            width: ${imageWidth}px !important;
            height: ${imageHeight}px !important;
            z-index: 5001 !important;
        `;
    }
}
```

## VR System Integration

### WebXR Detection & Initialization
```javascript
let webXRSupportChecked = false;
let isWebXRSupported = false;

async function checkWebXRSupport() {
    if (webXRSupportChecked) return isWebXRSupported;
    
    webXRSupportChecked = true;
    
    if ('xr' in navigator) {
        try {
            isWebXRSupported = await navigator.xr.isSessionSupported('immersive-vr');
            
            if (isWebXRSupported) {
                // Pre-load VR system
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('libs/VRLifViewer.js');
                script.onload = () => {
                    console.log('VR system pre-loaded');
                };
                document.head.appendChild(script);
            }
        } catch (error) {
            console.log('WebXR not supported:', error);
            isWebXRSupported = false;
        }
    }
    
    return isWebXRSupported;
}
```

### VR Experience Launch
```javascript
function enterVRMode(lifUrl, dimensions) {
    if (!isWebXRSupported) {
        console.warn('WebXR not supported on this device');
        return;
    }
    
    // Use pre-loaded VR system
    if (typeof VRLifViewer !== 'undefined') {
        const vrViewer = new VRLifViewer(lifUrl, dimensions);
        vrViewer.startVR();
    } else {
        console.error('VR system not loaded');
    }
}
```

## Error Handling & Reliability

### WebGL Initialization Race Condition Protection

The extension includes comprehensive protection against WebGL initialization race conditions that could cause black frames when animations start before shaders and textures are ready.

#### Problem: Black Frame Issue
When users right-click to convert images to 3D, if the mouse remains over the image area during conversion, the lifViewer would attempt to start animations before WebGL resources were fully initialized. This resulted in:

- **Black frames** appearing instead of 3D content
- **Incomplete rendering** due to uninitialized shaders
- **Poor user experience** requiring mouse movement to trigger proper display

#### Root Cause Analysis
The issue occurred due to a race condition in the initialization sequence:

1. `lifViewer` created with mouse already over image area
2. `startAnimation()` called before `initWebGLResources()` completed
3. `render()` method executing with incomplete shader programs or textures
4. WebGL drawing calls failing silently, producing black output

#### Solution: Comprehensive WebGL Readiness Check

The fix implements a multi-layer protection system:

```javascript
// 1. WebGL Readiness Validation
isWebGLReady() {
    // Check WebGL context availability
    if (!this.gl || this.gl.isContextLost()) return false;
    
    // Verify shader program compilation and linking
    if (!this.programInfo?.program || 
        !this.gl.getProgramParameter(this.programInfo.program, this.gl.LINK_STATUS)) {
        return false;
    }
    
    // Ensure texture loading completion
    if (!this.views?.[0]?.layers?.[0]?.image?.texture || 
        !this.views[0].layers[0].invZ?.texture) {
        return false;
    }
    
    // Validate buffer creation
    if (!this.buffers?.position || !this.buffers.textureCoord || 
        !this.buffers.indices) {
        return false;
    }
    
    return true;
}

// 2. Protected Render Loop
render() {
    // Animation data check
    if (!this.currentAnimation?.duration_sec) {
        this.animationFrame = requestAnimationFrame(this.render);
        return;
    }
    
    // WebGL readiness check (CRITICAL FIX)
    if (!this.isWebGLReady()) {
        // Clear canvas with transparent background
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent, not black
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        // Continue checking until ready
        this.animationFrame = requestAnimationFrame(this.render);
        return;
    }
    
    // Normal rendering continues...
}
```

#### Implementation Benefits

**Seamless User Experience:**
- **No black frames**: Canvas remains transparent until 3D content is ready
- **Automatic progression**: Smooth transition from transparent to 3D content
- **No user intervention**: Works regardless of mouse position during conversion

**Robust Error Prevention:**
- **Shader validation**: Ensures programs are compiled and linked before use
- **Texture verification**: Confirms all required textures are loaded
- **Buffer validation**: Verifies WebGL buffers are properly created
- **Context protection**: Handles WebGL context loss gracefully

**Performance Optimized:**
- **Early exit strategy**: Quick checks prevent expensive WebGL calls
- **Resource conservation**: No unnecessary rendering during initialization
- **Memory safety**: Prevents crashes from accessing uninitialized resources

#### Edge Case Handling

The system handles several challenging scenarios:

```javascript
// Transition animation protection
renderOff(transitionTime) {
    if (!this.currentAnimation?.data) {
        this.canvas.style.display = 'none';
        return;
    }
    
    // Check WebGL readiness before transition rendering
    if (!this.isWebGLReady()) {
        this.canvas.style.display = 'none';
        this.isRenderingOff = false;
        return;
    }
    
    // Safe transition rendering...
}
```

**Protected Scenarios:**
- **Fast mouse movements**: Multiple start/stop cycles during initialization
- **Slow network loading**: Extended texture loading times
- **Shader compilation delays**: Complex shader programs taking time to link
- **WebGL context loss**: Browser resource management scenarios

#### Debugging Integration

The WebGL readiness check includes comprehensive logging for development:

```javascript
isWebGLReady() {
    if (!this.gl || this.gl.isContextLost()) {
        console.log('🔍 WebGL context not ready or lost');
        return false;
    }
    
    if (!this.programInfo?.program) {
        console.log('🔍 Shader program not ready');
        return false;
    }
    
    if (!this.views?.[0]?.layers?.[0]?.image?.texture) {
        console.log('🔍 Image texture not ready for first layer');
        return false;
    }
    
    // Additional checks with logging...
}
```

This protection system ensures reliable 3D rendering across all supported platforms and usage patterns, eliminating the black frame issue entirely while maintaining optimal performance.

### CORS Protection
```javascript
function handleCORSProtectedImage(img, targetDimensions) {
    try {
        // Method 1: Direct canvas processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = targetDimensions.width;
        canvas.height = targetDimensions.height;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        return canvas.toDataURL('image/jpeg', 0.9);
    } catch (corsError) {
        console.log('CORS protection detected, using alternative method');
        
        try {
            // Method 2: crossOrigin anonymous
            const crossOriginImg = new Image();
            crossOriginImg.crossOrigin = 'anonymous';
            crossOriginImg.src = img.src;
            
            return new Promise((resolve, reject) => {
                crossOriginImg.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    canvas.width = targetDimensions.width;
                    canvas.height = targetDimensions.height;
                    
                    ctx.drawImage(crossOriginImg, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.9));
                };
                
                crossOriginImg.onerror = reject;
            });
        } catch (fallbackError) {
            // Method 3: Provide user-friendly error message
            console.warn('Image is CORS-protected and cannot be processed');
            throw new Error('This image is protected by CORS policy and cannot be converted');
        }
    }
}
```

### Dimension Validation
```javascript
function validateAndCorrectDimensions(container, image, proposedDimensions) {
    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    
    // Check for suspicious aspect ratios (picture element issues)
    const containerAspect = containerRect.width / containerRect.height;
    const imageAspect = imageRect.width / imageRect.height;
    
    const isSuspiciouslyWide = containerAspect > 15;
    const isSuspiciouslyTall = containerAspect < 0.067;
    const hasSignificantDifference = Math.abs(containerAspect - imageAspect) > 5;
    
    if ((isSuspiciouslyWide || isSuspiciouslyTall || hasSignificantDifference) && 
        imageAspect > 0.1 && imageAspect < 10) {
        // Use image dimensions instead of container dimensions
        return {
            width: imageRect.width,
            height: imageRect.height,
            corrected: true,
            reason: 'suspicious_container_aspect_ratio'
        };
    }
    
    // Validate minimum dimensions
    if (proposedDimensions.width < 100 || proposedDimensions.height < 100) {
        return {
            width: Math.max(proposedDimensions.width, 100),
            height: Math.max(proposedDimensions.height, 100),
            corrected: true,
            reason: 'minimum_size_requirement'
        };
    }
    
    return {
        ...proposedDimensions,
        corrected: false
    };
}
```

## Performance Optimizations

### Configurable Video Quality

MP4 generation bitrate is configurable for balancing quality vs file size:

```javascript
// Video configuration constants
const VIDEO_CONFIG = {
    DEFAULT_BITRATE: 0.2,  // Default bitrate multiplier
    MIN_BITRATE: 0.05,     // Minimum bitrate (very low quality)
    MAX_BITRATE: 2.0       // Maximum bitrate (very high quality)
};

// Global API for external control (popup menu integration)
await window.setMP4Bitrate(0.8);        // Higher quality setting
const currentBitrate = await window.getMP4Bitrate();
const config = window.getMP4BitrateConfig(); // Get min/max/default values

// Generate MP4 with custom bitrate
await generateMP4FromLifFile(img, lifUrl, 1.5); // Override for specific video
```

**Quality Reference:**
- `0.05`: Very low quality (smallest files)
- `0.2`: Default quality (balanced)
- `0.5`: Good quality
- `1.0`: High quality
- `2.0`: Maximum quality (largest files)

### Z-Index Configuration System

The extension uses a centralized z-index configuration system for consistent layering and easy maintenance:

```javascript
const Z_INDEX_CONFIG = {
    PROCESSING_OVERLAY: 5000,    // Loading overlays during conversion
    CANVAS: 4999,                // Canvas elements (passed to lifViewer)
    IMAGE: 4999                  // Post-conversion image elements (passed to lifViewer)
};
```

#### Layer Hierarchy
1. **Temporary Popups**: 100000+ (CORS info, notifications, errors)
2. **Processing Overlays**: 5000 (conversion status indicators)
3. **Canvas & Images**: 4999 (3D content)
4. **Site Content**: 1-1000 (normal website elements)

#### Configuration Benefits
- **Centralized Control**: Change z-index values in one place
- **Easy Maintenance**: No hunting through code for hardcoded values
- **Consistent Layering**: All elements use the same configuration source
- **Future-Proof**: Easy to adjust for new website compatibility issues

## Nested Container Positioning System

### Universal Nested Container Detection

The extension automatically detects and handles nested positioning containers (like Flickr's facade pattern) without site-specific code:

```javascript
calculateNestedContainerOffset() {
    // Get image position relative to container
    const containerRect = this.container.getBoundingClientRect();
    const imageRect = this.originalImage.getBoundingClientRect();
    
    const imageOffsetTop = imageRect.top - containerRect.top;
    const imageOffsetLeft = imageRect.left - containerRect.left;
    
    // Detect significant offset indicating nested positioning
    const hasSignificantOffset = Math.abs(imageOffsetTop) > 5 || Math.abs(imageOffsetLeft) > 5;
    
    if (hasSignificantOffset) {
        const nestedContainer = this.findNestedPositioningContainer();
        
        if (nestedContainer) {
            // Use nested container position
            const nestedRect = nestedContainer.getBoundingClientRect();
            return {
                top: nestedRect.top - containerRect.top,
                left: nestedRect.left - containerRect.left
            };
        } else {
            // Use image position directly
            return {
                top: imageOffsetTop,
                left: imageOffsetLeft
            };
        }
    }
    
    return null;
}
```

### Nested Container Pattern Recognition

The system recognizes common nested container patterns:

#### Flickr Theater Mode
```html
<div class="photo-well-media-scrappy-view"> <!-- Outer container -->
    <span class="facade-of-protection-neue" style="width:747px;height:498px;"> <!-- Nested container -->
        <!-- Theater mode elements -->
    </span>
    <img class="main-photo"> <!-- Image positioned relative to facade -->
    <canvas> <!-- Canvas positioned to match facade offset -->
</div>
```

#### Generic Modal/Lightbox Patterns
```html
<div class="modal-wrapper"> <!-- Outer container -->
    <div class="modal-content" style="position: relative;"> <!-- Nested container -->
        <img> <!-- Image within modal -->
        <canvas> <!-- Canvas positioned to match modal content -->
    </div>
</div>
```

### Pattern Detection Selectors

The system searches for nested containers using these selectors (in order of priority):

```javascript
const nestedContainerSelectors = [
    // Flickr patterns
    '.facade-of-protection-neue',
    '.facade-of-protection',
    
    // Theater/modal patterns
    '.theater-container',
    '.modal-content',
    '.lightbox-content',
    
    // Media viewer patterns
    '.media-viewer',
    '.photo-viewer',
    '.image-viewer',
    
    // Generic positioned containers
    '[style*="position: absolute"]',
    '[style*="position: relative"]',
    
    // Containers with explicit dimensions
    '[style*="width:"][style*="height:"]'
];
```

### Validation Criteria

A container is considered valid for nested positioning if it:

1. **Contains or is adjacent to the image**
2. **Has positioning styles** (`position: absolute/relative`)
3. **Has explicit dimensions** (width/height in CSS or inline styles)
4. **Is structurally related** to the image element

### Benefits

- **Universal Compatibility**: Works with any nested container pattern
- **No Site-Specific Code**: Automatically adapts to new layouts
- **Fallback Strategy**: Uses image position if no nested container found
- **Performance Optimized**: Only calculates when significant offset detected
- **Maintains Existing Behavior**: Doesn't affect standard layouts

### Efficient Resource Management
```javascript
class ProcessingOverlayManager {
    constructor() {
        this.activeOverlays = new Map();
        this.cleanupTimeout = null;
    }
    
    showOverlay(container, dimensions) {
        const overlayId = this.generateOverlayId(container);
        
        if (this.activeOverlays.has(overlayId)) {
            return this.activeOverlays.get(overlayId);
        }
        
        const overlay = this.createOverlay(dimensions);
        container.appendChild(overlay);
        
        this.activeOverlays.set(overlayId, {
            element: overlay,
            container: container,
            timestamp: Date.now()
        });
        
        this.scheduleCleanup();
        return overlay;
    }
    
    hideOverlay(container) {
        const overlayId = this.generateOverlayId(container);
        const overlayData = this.activeOverlays.get(overlayId);
        
        if (overlayData) {
            overlayData.element.remove();
            this.activeOverlays.delete(overlayId);
        }
    }
    
    scheduleCleanup() {
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = setTimeout(() => {
            this.cleanupStaleOverlays();
        }, 30000); // Clean up after 30 seconds
    }
    
    cleanupStaleOverlays() {
        const now = Date.now();
        const maxAge = 60000; // 1 minute
        
        for (const [id, overlayData] of this.activeOverlays) {
            if (now - overlayData.timestamp > maxAge) {
                overlayData.element.remove();
                this.activeOverlays.delete(id);
            }
        }
    }
}
```

### Memory Management
```javascript
function cleanupAfterConversion(container, viewer) {
    // Remove event listeners
    const eventContainer = container || viewer.container;
    if (eventContainer) {
        eventContainer.removeEventListener('mouseenter', viewer.startHandler);
        eventContainer.removeEventListener('mouseleave', viewer.stopHandler);
    }
    
    // Clean up WebGL resources
    if (viewer.gl && !viewer.gl.isContextLost()) {
        viewer.gl.deleteProgram(viewer.program);
        viewer.gl.deleteBuffer(viewer.vertexBuffer);
        viewer.gl.deleteTexture(viewer.texture);
    }
    
    // Remove DOM elements
    const lifContainers = container.querySelectorAll('[data-lif-container]');
    lifContainers.forEach(lifContainer => {
        lifContainer.remove();
    });
    
    // Clear data attributes
    if (container.dataset) {
        delete container.dataset.lifActive;
        delete container.dataset.lifUrl;
        delete container.dataset.lifTargetWidth;
        delete container.dataset.lifTargetHeight;
    }
}
```

## Debugging & Development

### Comprehensive Logging System
```javascript
const DEBUG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

class Logger {
    constructor(level = DEBUG_LEVELS.INFO) {
        this.level = level;
    }
    
    error(message, ...args) {
        if (this.level >= DEBUG_LEVELS.ERROR) {
            console.error(`🚫 ImmersityLens: ${message}`, ...args);
        }
    }
    
    warn(message, ...args) {
        if (this.level >= DEBUG_LEVELS.WARN) {
            console.warn(`⚠️ ImmersityLens: ${message}`, ...args);
        }
    }
    
    info(message, ...args) {
        if (this.level >= DEBUG_LEVELS.INFO) {
            console.log(`ℹ️ ImmersityLens: ${message}`, ...args);
        }
    }
    
    debug(message, ...args) {
        if (this.level >= DEBUG_LEVELS.DEBUG) {
            console.log(`🔍 ImmersityLens: ${message}`, ...args);
        }
    }
    
    layoutAnalysis(analysis, container) {
        this.debug('Layout analysis results:', {
            type: analysis.type,
            containerHasPaddingAspectRatio: analysis.containerHasPaddingAspectRatio,
            isFacebookStyle: analysis.isFacebookStyle,
            isPictureElement: analysis.isPictureElement,
            hasObjectFit: analysis.hasObjectFit,
            container: container?.tagName,
            className: container?.className
        });
    }
    
    dimensionCalculation(img, dimensions, corrected) {
        this.debug('Dimension calculation:', {
            image: img.src?.substring(0, 50) + '...',
            natural: `${img.naturalWidth}x${img.naturalHeight}`,
            rect: `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}`,
            effective: `${dimensions.width}x${dimensions.height}`,
            corrected: corrected
        });
    }
}

const logger = new Logger(DEBUG_LEVELS.INFO);
```

### Development Utilities
```javascript
// Console utility functions for debugging
function inspectImage(img) {
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);
    
    console.table({
        'Source': img.src?.substring(0, 80) + '...',
        'Natural': `${img.naturalWidth} x ${img.naturalHeight}`,
        'HTML': `${img.width} x ${img.height}`,
        'Rect': `${Math.round(rect.width)} x ${Math.round(rect.height)}`,
        'Object-Fit': style.objectFit,
        'Position': style.position,
        'Display': style.display,
        'Visibility': style.visibility,
        'Opacity': style.opacity
    });
}

function inspectContainer(container) {
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    
    console.table({
        'Tag': container.tagName,
        'Classes': container.className,
        'Dimensions': `${Math.round(rect.width)} x ${Math.round(rect.height)}`,
        'Position': style.position,
        'Padding-Top': style.paddingTop,
        'Padding-Bottom': style.paddingBottom,
        'Aspect Ratio': (rect.width / rect.height).toFixed(2)
    });
}

// Global debugging functions
window.ImmersityLensDebug = {
    inspectImage,
    inspectContainer,
    logger,
    DEBUG_LEVELS
};
```

## Future Architecture Considerations

### Extensibility Framework
```javascript
// Plugin system for new layout types
class LayoutPlugin {
    constructor(name, detector, handler) {
        this.name = name;
        this.detector = detector;
        this.handler = handler;
    }
    
    detect(container, image) {
        return this.detector(container, image);
    }
    
    handle(container, image, options) {
        return this.handler(container, image, options);
    }
}

class LayoutPluginRegistry {
    constructor() {
        this.plugins = new Map();
    }
    
    register(plugin) {
        this.plugins.set(plugin.name, plugin);
    }
    
    detectLayout(container, image) {
        for (const [name, plugin] of this.plugins) {
            if (plugin.detect(container, image)) {
                return name;
            }
        }
        return 'standard';
    }
    
    handleLayout(layoutType, container, image, options) {
        const plugin = this.plugins.get(layoutType);
        if (plugin) {
            return plugin.handle(container, image, options);
        }
        throw new Error(`Unknown layout type: ${layoutType}`);
    }
}
```

### Performance Monitoring
```javascript
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
    }
    
    startTiming(label) {
        this.metrics.set(label, { start: performance.now() });
    }
    
    endTiming(label) {
        const metric = this.metrics.get(label);
        if (metric) {
            metric.end = performance.now();
            metric.duration = metric.end - metric.start;
            return metric.duration;
        }
        return null;
    }
    
    getReport() {
        const report = {};
        for (const [label, metric] of this.metrics) {
            if (metric.duration !== undefined) {
                report[label] = `${metric.duration.toFixed(2)}ms`;
            }
        }
        return report;
    }
}
```

This technical documentation reflects the current context menu-based architecture and provides comprehensive guidance for development, debugging, and future enhancements.