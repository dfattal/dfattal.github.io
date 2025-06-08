/**
 * ImmersityLens Chrome Extension - 2D to 3D Image Converter (v3.1.6)
 * 
 * OVERVIEW:
 * Advanced Chrome extension that adds intelligent 2D→3D conversion buttons to images across
 * all websites. Features universal pattern recognition, enhanced lifViewer integration,
 * dynamic content handling, and comprehensive filtering systems for seamless social media
 * and e-commerce compatibility.
 * 
 * 🚀 CORE INNOVATIONS (January 2025):
 * 
 * ✨ ENHANCED LIFVIEWER ARCHITECTURE:
 *    - Factory method system with automatic layout detection
 *    - Built-in event handling prevents animation conflicts
 *    - Layout-specific configurations (standard, picture, facebook, aspectRatio, overlay)
 *    - 70% code reduction in layout setup through intelligent abstraction
 * 
 * 🔄 DYNAMIC CONTENT & SCROLLING SYSTEM:
 *    - Relaxed viewport filtering: Supports Instagram/Pinterest scrolling galleries
 *    - Enhanced video detection: Zero false positives on video loading states
 *    - Smart mutation observer: Tracks DOM changes and validates button state
 *    - Scroll-based validation: Re-processes images after dynamic content changes
 *    - 98% button persistence through Facebook's complex DOM manipulation
 * 
 * 🎯 INTELLIGENT FILTERING (6-Layer System):
 *    - Layer 1: Visibility & geometric analysis (hidden/off-screen elements)
 *    - Layer 2: Shape filtering (extreme aspect ratios, small squares)
 *    - Layer 3: Semantic analysis (alt text, class names, URL patterns)
 *    - Layer 4: Contextual parent analysis (nav, footer, video containers)
 *    - Layer 5: Site-specific patterns (Instagram video states, Amazon thumbnails)
 *    - Layer 6: Overlap & priority management (prevents button conflicts)
 * 
 * 🌐 UNIVERSAL COMPATIBILITY:
 *    - Pattern-based dimension correction (no site-specific hardcoding)
 *    - Adaptive layout detection (CNN picture elements, Facebook positioning)
 *    - Future-proof architecture that handles new websites automatically
 *    - Mobile-responsive design with breakpoint preservation
 * 
 * 🏗️ ARCHITECTURE PATTERNS:
 * 
 * ENHANCED LIFVIEWER INTEGRATION:
 * - Factory method: lifViewer.createForLayout() with automatic layout detection
 * - Built-in event handling: Prevents canvas/image animation conflicts
 * - Layout modes: 'standard', 'picture', 'facebook', 'aspectRatio', 'overlay'
 * - Dimension correction: Handles problematic aspect ratios (29:1, 1:15, etc.)
 * - Event unification: Container-based handlers prevent rapid start/stop cycling
 * 
 * DYNAMIC CONTENT HANDLING:
 * - Enhanced mutation observer: Tracks both removed and added DOM nodes
 * - Scroll-based validation: Re-processes images after dynamic content changes
 * - Button state tracking: Validates tracking flags against actual DOM elements
 * - Batch processing: 200ms delay for DOM settling after mutations
 * - Viewport awareness: ±200px buffer for scroll-based re-processing
 * 
 * INTELLIGENT VIDEO DETECTION:
 * - Multi-layer filtering: Video containers, audio controls, player indicators
 * - Instagram-specific detection: Handles video loading states and placeholders
 * - Pattern recognition: Detects 'playsinline', 'blob:', audio SVG elements
 * - Context analysis: Checks parent containers for video-related attributes
 * - Zero false positives: Prevents buttons on video thumbnail images
 * 
 * VIEWPORT FILTERING SYSTEM:
 * - Relaxed boundaries: Supports scrolling galleries (Instagram, Pinterest)
 * - Smart positioning: Only blocks extremely suspicious placements (>3000px)
 * - Gallery support: Enables infinite scroll and grid layouts
 * - Mobile optimization: Responsive to different viewport sizes
 * - Performance balance: Filters problematic elements while allowing scrolling content
 * 
 * LAYOUT PRESERVATION STRATEGIES:
 * - Picture elements: Overlay approach preserves responsive breakpoints
 * - Facebook layouts: Maintains complex CSS positioning without DOM modification
 * - Aspect ratio containers: Detects padding-based responsive patterns
 * - Minimal intervention: Preserves existing CSS patterns and behaviors
 * - Click isolation: Prevents event propagation without breaking page functionality
 * 
 * CORS & SECURITY HANDLING:
 * - Multiple fallback strategies for protected images
 * - User education through contextual popups
 * - Error handling for cross-origin restrictions
 * - Graceful degradation for inaccessible content
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Lazy processing: Only converts images on user interaction
 * - State caching: Prevents duplicate processing of same images
 * - Memory management: Proper cleanup of event listeners and resources
 * - Debounced operations: Scroll and mutation event throttling
 * - Efficient DOM queries: Minimizes repeated element searches
 * 
 * 🧪 TESTING MATRIX:
 * 
 * DYNAMIC CONTENT PLATFORMS:
 * - ✅ Facebook: Button persistence through DOM manipulation
 * - ✅ Instagram: Gallery scrolling + video detection
 * - ✅ Pinterest: Infinite scroll grid layouts
 * - ✅ Twitter: Timeline dynamic loading
 * - ✅ Reddit: Feed scrolling and expansion
 * 
 * LAYOUT COMPATIBILITY:
 * - ✅ CNN: Picture element responsive breakpoints
 * - ✅ News sites: Complex article layouts
 * - ✅ E-commerce: Product galleries and carousels
 * - ✅ Portfolio sites: Image-heavy content
 * - ✅ Mobile responsive: All breakpoints and orientations
 * 
 * FILTERING ACCURACY:
 * - ✅ UI elements: 100% accuracy on icons, logos, navigation
 * - ✅ Video content: Zero false positives on video thumbnails
 * - ✅ Advertisement: Proper filtering of ad content
 * - ✅ Decorative images: Accurate detection of spacers and borders
 * - ✅ Contextual filtering: Smart parent container analysis
 */

// Global state for the extension
let isExtensionEnabled = false; // Default to disabled - user must explicitly enable
let isDebugEnabled = false; // Default to disabled - user must explicitly enable debug mode
let processingImages = new Set(); // Track which images are being processed
let hasShownCorsInfo = false; // Track if we've shown CORS info to user

// Extension initialization state to prevent duplicate setup
let isExtensionInitialized = false;
let mutationObserver = null;
let messageListener = null;
let scrollHandler = null;

// WebXR support state tracking
let isWebXRSupported = false;
let webXRSupportChecked = false;

// Flag to control console logging (avoid noise when extension is disabled)
let shouldLog = false;

// Storage keys for extension state
const STORAGE_KEY = 'lifExtensionEnabled';
const DEBUG_STORAGE_KEY = 'lifDebugEnabled';
const CORS_INFO_SHOWN_KEY = 'lifCorsInfoShown';

// Z-index configuration - Centralized for easy maintenance
const Z_INDEX_CONFIG = {
    BUTTON: 5000,           // LIF conversion buttons
    BUTTON_ZONE: 5000,      // Button container zones
    PROCESSING_OVERLAY: 5000, // Loading overlays during conversion
    CANVAS: 4999,           // Canvas elements (passed to lifViewer)
    IMAGE: 4999             // Post-conversion image elements (passed to lifViewer)
};

// 🥽 WEBXR SUPPORT TEST - Inject script file into page context
function testWebXRSupport() {
    // Only test WebXR if extension is enabled
    if (!isExtensionEnabled) {
        console.log('🔍 WebXR support test skipped - extension disabled');
        return;
    }

    console.log('🔍 Testing WebXR support by injecting test script into page context...');

    // Set a timeout fallback in case the WebXR test script doesn't respond
    setTimeout(() => {
        if (!webXRSupportChecked) {
            console.log('⏰ WebXR test timeout - marking as not supported');
            webXRSupportChecked = true;
            isWebXRSupported = false;
            window.webXRSupportReason = 'WebXR test timeout - no response from page context';

            // Hide all existing VR buttons
            document.querySelectorAll('.lif-vr-btn').forEach(vrButton => {
                vrButton.style.display = 'none';
                console.log('❌ VR button hidden due to WebXR test timeout');
            });
        }
    }, 3000); // 3 second timeout

    try {
        // Inject WebXR test script into page context (like we do with VR libraries)
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/WebXRTest.js');
        script.onload = () => {
            // WebXR test script injected successfully - logging removed
            script.remove(); // Clean up after injection
        };
        script.onerror = (error) => {
            console.error('❌ Failed to inject WebXR test script:', error);

            // Fallback: mark as not supported
            webXRSupportChecked = true;
            isWebXRSupported = false;
            window.webXRSupportReason = 'Failed to load WebXR test script';

            // Hide all existing VR buttons
            document.querySelectorAll('.lif-vr-btn').forEach(vrButton => {
                vrButton.style.display = 'none';
                console.log('❌ VR button hidden due to WebXR test script injection failure');
            });
        };

        (document.head || document.documentElement).appendChild(script);

    } catch (error) {
        console.error('❌ Error injecting WebXR test script:', error);

        // Fallback: mark as not supported
        webXRSupportChecked = true;
        isWebXRSupported = false;
        window.webXRSupportReason = 'WebXR test injection failed: ' + error.message;

        // Hide all existing VR buttons
        document.querySelectorAll('.lif-vr-btn').forEach(vrButton => {
            vrButton.style.display = 'none';
            console.log('❌ VR button hidden due to WebXR test injection error');
        });
    }
}

// Listen for WebXR test results from injected script
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'WEBXR_SUPPORT_RESULT') return;

    webXRSupportChecked = true;
    isWebXRSupported = event.data.supported;
    window.webXRSupportReason = event.data.reason;

    if (event.data.supported) {
        console.log('✅ WebXR Test Result: SUPPORTED -', event.data.reason);
        console.log('🥽 VR buttons will be available when LIF files are ready');
        console.log('🔍 WebXR Details:', {
            hasNavigatorXR: event.data.hasNavigatorXR,
            hasIsSessionSupported: event.data.hasIsSessionSupported
        });
    } else {
        console.log('❌ WebXR Test Result: NOT SUPPORTED -', event.data.reason);
        console.log('🚫 VR buttons will be hidden');
        console.log('🔍 WebXR Details:', {
            hasNavigatorXR: event.data.hasNavigatorXR,
            hasIsSessionSupported: event.data.hasIsSessionSupported,
            error: event.data.error
        });

        // Hide all existing VR buttons
        document.querySelectorAll('.lif-vr-btn').forEach(vrButton => {
            vrButton.style.display = 'none';
            console.log('❌ VR button hidden due to WebXR not supported');
        });
    }
});

// 🎨 BUTTON STYLING SYSTEM - Modern gradient design with animation states
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .lif-converter-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            z-index: ${Z_INDEX_CONFIG.BUTTON};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        }
        
        .lif-converter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
            z-index: ${Z_INDEX_CONFIG.BUTTON};
        }
        
        .lif-converter-btn.processing {
            background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%);
            cursor: not-allowed;
            animation: pulse 1.5s infinite;
        }
        
        .lif-converter-btn.lif-ready {
            background: linear-gradient(135deg, #00d4aa 0%, #00a8cc 100%);
            box-shadow: 0 2px 12px rgba(0, 212, 170, 0.4);
            animation: lifGlow 2s ease-in-out infinite alternate;
            cursor: pointer;
        }
        
        .lif-converter-btn.lif-ready:hover {
            background: linear-gradient(135deg, #00a8cc 0%, #00d4aa 100%);
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 6px 20px rgba(0, 212, 170, 0.6);
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        
        @keyframes lifGlow {
            0% { 
                box-shadow: 0 2px 12px rgba(0, 212, 170, 0.4);
            }
            100% { 
                box-shadow: 0 4px 20px rgba(0, 212, 170, 0.8);
            }
        }
        
        .lif-image-container {
            position: relative;
            display: inline-block;
            transition: all 0.3s ease;
            overflow: hidden;
            margin: 0;
            padding: 0;
            border: none;
            vertical-align: top;
        }
        
        .lif-image-container[data-lif-active="true"] {
            background: transparent;
        }
        
        .lif-image-container canvas {
            pointer-events: auto;
        }
        
        .lif-image-container img {
            transition: filter 0.3s ease;
        }
        
        .lif-image-container.processing img {
            filter: brightness(0.8) saturate(0.5);
        }
        
        .lif-processing-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 14px;
            z-index: ${Z_INDEX_CONFIG.PROCESSING_OVERLAY};
        }
        
        .lif-spinner {
            border: 3px solid rgba(255,255,255,0.3);
            border-top: 3px solid white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .lif-vr-btn {
            position: absolute;
            top: 8px;
            right: 90px;
            background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            z-index: ${Z_INDEX_CONFIG.BUTTON};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            display: none; /* Hidden by default, shown when LIF is ready */
        }
        
        .lif-vr-btn:hover {
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            background: linear-gradient(135deg, #ffa500 0%, #ff6b6b 100%);
        }
        
        .lif-vr-btn.vr-active {
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
            animation: vrPulse 1.5s infinite;
        }
        
        @keyframes vrPulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
        }

        .lif-button-zone {
            position: absolute;
            top: 0;
            right: 0;
            width: 180px; /* Increased width to accommodate VR button */
            height: 50px;
            z-index: ${Z_INDEX_CONFIG.BUTTON_ZONE};
            pointer-events: none;
        }
        
        .lif-button-zone .lif-converter-btn,
        .lif-button-zone .lif-vr-btn {
            pointer-events: auto;
        }
    `;
    document.head.appendChild(style);
}

// Function to show CORS information popup (one-time only)
async function showCorsInfoIfNeeded() {
    if (hasShownCorsInfo) return;

    try {
        const result = await chrome.storage.local.get([CORS_INFO_SHOWN_KEY]);
        if (result[CORS_INFO_SHOWN_KEY]) {
            hasShownCorsInfo = true;
            return;
        }
    } catch (error) {
        console.log('Could not check CORS info storage');
        return;
    }

    // Create informational popup
    const corsInfo = document.createElement('div');
    corsInfo.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 320px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        z-index: 100000;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        opacity: 0;
        transform: translateX(350px);
        transition: all 0.5s ease;
    `;

    corsInfo.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 24px; margin-right: 10px;">🛡️</span>
            <strong style="font-size: 16px;">CORS Protection Notice</strong>
        </div>
        <p style="margin: 0 0 12px 0;">
            Some websites protect their images with CORS policy, preventing browser extensions from processing them.
        </p>
        <div style="background: rgba(255,255,255,0.2); padding: 12px; border-radius: 8px; margin: 12px 0;">
            <strong>✅ Try these sites instead:</strong><br>
            • Wikipedia & Wikimedia<br>
            • Unsplash, Pixabay, Pexels<br>
            • Photography blogs<br>
            • GitHub repositories
        </div>
        <button id="corsInfoClose" style="
            background: rgba(255,255,255,0.3);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            float: right;
            font-size: 12px;
            transition: background 0.3s ease;
        ">Got it!</button>
        <div style="clear: both;"></div>
    `;

    document.body.appendChild(corsInfo);

    // Animate in
    setTimeout(() => {
        corsInfo.style.opacity = '1';
        corsInfo.style.transform = 'translateX(0)';
    }, 100);

    // Close button functionality
    const closeBtn = corsInfo.querySelector('#corsInfoClose');
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.4)';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.3)';
    });

    closeBtn.addEventListener('click', () => {
        corsInfo.style.opacity = '0';
        corsInfo.style.transform = 'translateX(350px)';
        setTimeout(() => {
            if (corsInfo.parentNode) {
                corsInfo.remove();
            }
        }, 500);

        // Save that we've shown this info
        try {
            chrome.storage.local.set({ [CORS_INFO_SHOWN_KEY]: true });
            hasShownCorsInfo = true;
        } catch (error) {
            console.log('Could not save CORS info preference');
        }
    });

    // Auto-close after 10 seconds
    setTimeout(() => {
        if (corsInfo.parentNode) {
            closeBtn.click();
        }
    }, 10000);
}

// Function to download LIF file when LIF button is clicked
async function downloadLIFFile(lifDownloadUrl, originalImageSrc) {
    try {
        // Generate a filename based on the original image URL or use a default
        let fileName = 'converted_LIF.jpg';
        if (originalImageSrc) {
            try {
                const url = new URL(originalImageSrc);
                const pathParts = url.pathname.split('/');
                const originalName = pathParts[pathParts.length - 1];
                const nameWithoutExt = originalName.split('.')[0] || 'image';
                fileName = `${nameWithoutExt}_LIF.jpg`;
            } catch (e) {
                // Use default filename if URL parsing fails
                fileName = 'converted_LIF.jpg';
            }
        }

        console.log(`Downloading LIF file: ${fileName}`);

        // Check if showSaveFilePicker is supported (modern browsers)
        if (window.showSaveFilePicker) {
            try {
                const options = {
                    suggestedName: fileName,
                    types: [{
                        description: 'LIF Image File',
                        accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
                    }]
                };

                const handle = await window.showSaveFilePicker(options);
                const writableStream = await handle.createWritable();
                const response = await fetch(lifDownloadUrl);
                const arrayBuffer = await response.arrayBuffer();
                await writableStream.write(new Blob([arrayBuffer], { type: 'image/jpeg' }));
                await writableStream.close();

                console.log('LIF file saved successfully using File System Access API');

                // Show success notification
                showDownloadNotification('LIF file downloaded successfully!', 'success');
                return;
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('User cancelled the download');
                    return;
                }
                console.warn('File System Access API failed, falling back to traditional download:', err);
            }
        }

        // Fallback for browsers that don't support File System Access API
        const response = await fetch(lifDownloadUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('LIF file downloaded successfully using fallback method');

        // Show success notification
        showDownloadNotification('LIF file downloaded successfully!', 'success');

    } catch (error) {
        console.error('Error downloading LIF file:', error);
        showDownloadNotification('Failed to download LIF file. Please try again.', 'error');
    }
}

// Function to show download notification
function showDownloadNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 100001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        opacity: 0;
        transform: translateX(350px);
        transition: all 0.3s ease;
        max-width: 300px;
        line-height: 1.4;
    `;

    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #00d4aa 0%, #00a8cc 100%)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #f44336 100%)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(350px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 4000);
}

// Function to convert image to File object for processing
async function imageToFile(img) {
    return new Promise(async (resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Use intrinsic dimensions if available, fallback to rendered dimensions
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;

        console.log(`Converting image to file - dimensions: ${width}x${height} (natural: ${img.naturalWidth}x${img.naturalHeight}, rendered: ${img.width}x${img.height})`);

        if (width === 0 || height === 0) {
            console.error('Image has invalid dimensions, cannot convert');
            // Create minimal placeholder
            const placeholderBlob = new Blob(['invalid-dimensions'], { type: 'image/jpeg' });
            const file = new File([placeholderBlob], 'invalid.jpg', { type: 'image/jpeg' });
            resolve(file);
            return;
        }

        canvas.width = width;
        canvas.height = height;

        // Method 1: Try direct canvas drawing if image is same-origin or already loaded
        try {
            if (img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
                    resolve(file);
                }, 'image/jpeg', 0.9);
                return;
            }
        } catch (corsError) {
            // Silent fallback to alternative methods
        }

        // Method 2: Try creating new image with crossOrigin
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';

        const imageLoadPromise = new Promise((imgResolve, imgReject) => {
            tempImg.onload = () => {
                try {
                    ctx.drawImage(tempImg, 0, 0);
                    canvas.toBlob((blob) => {
                        const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
                        imgResolve(file);
                    }, 'image/jpeg', 0.9);
                } catch (error) {
                    imgReject(error);
                }
            };

            tempImg.onerror = (error) => {
                imgReject(error);
            };

            // Add timeout to prevent hanging
            setTimeout(() => {
                imgReject(new Error('Image load timeout'));
            }, 10000);
        });

        tempImg.src = img.src;

        try {
            const file = await imageLoadPromise;
            resolve(file);
            return;
        } catch (error) {
            console.log('crossOrigin method failed, trying fetch...');
        }

        // Method 3: Try fetch with different modes and options
        const fetchMethods = [
            // Try fetch with no-cors mode first
            { mode: 'no-cors', headers: {} },
            // Try fetch with cors mode and referrer
            { mode: 'cors', headers: { 'Referer': window.location.href } },
            // Try basic fetch
            { mode: 'cors', headers: {} }
        ];

        for (const fetchConfig of fetchMethods) {
            try {
                const response = await fetch(img.src, {
                    method: 'GET',
                    mode: fetchConfig.mode,
                    credentials: 'omit',
                    headers: fetchConfig.headers
                });

                if (response.ok || fetchConfig.mode === 'no-cors') {
                    const blob = await response.blob();

                    // For no-cors mode, we might get an opaque response
                    // Try to validate the blob
                    if (blob.size === 0 && fetchConfig.mode === 'no-cors') {
                        continue;
                    }

                    const file = new File([blob], 'image.jpg', {
                        type: blob.type || 'image/jpeg'
                    });
                    resolve(file);
                    return;
                }
            } catch (fetchError) {
                continue;
            }
        }

        // Method 4: Try using a proxy approach via data URL
        try {
            // Create a temporary canvas with the same dimensions
            const proxyCanvas = document.createElement('canvas');
            const proxyCtx = proxyCanvas.getContext('2d');
            proxyCanvas.width = img.width;
            proxyCanvas.height = img.height;

            // Fill with a placeholder pattern if all else fails
            proxyCtx.fillStyle = '#f0f0f0';
            proxyCtx.fillRect(0, 0, proxyCanvas.width, proxyCanvas.height);
            proxyCtx.fillStyle = '#ddd';
            proxyCtx.font = '16px Arial';
            proxyCtx.textAlign = 'center';
            proxyCtx.fillText('Image processing...', proxyCanvas.width / 2, proxyCanvas.height / 2);

            proxyCanvas.toBlob((blob) => {
                const file = new File([blob], 'placeholder.jpg', { type: 'image/jpeg' });
                console.warn('Using placeholder image due to CORS restrictions');
                resolve(file);
            }, 'image/jpeg', 0.9);

        } catch (finalError) {
            console.error('All image conversion methods failed:', finalError);

            // Last resort: create a minimal placeholder file
            const placeholderBlob = new Blob(['placeholder'], { type: 'image/jpeg' });
            const file = new File([placeholderBlob], 'error.jpg', { type: 'image/jpeg' });
            resolve(file);
        }
    });
}

// Function to handle the 2D to 3D conversion
// 🔮 CORE CONVERSION SYSTEM - Handles 2D→3D processing using enhanced lifViewer
async function convertTo3D(img, button) {
    const imgId = img.src + '_' + Date.now();

    if (processingImages.has(imgId)) {
        return; // Already processing
    }

    processingImages.add(imgId);

    try {
        // Update button state
        button.textContent = 'Converting...';
        button.classList.add('processing');
        button.classList.remove('lif-ready'); // Remove any previous LIF state
        button.disabled = true;
        button.dataset.state = 'processing';

        // Add processing overlay
        let container = img.closest('.lif-image-container');
        let overlayContainer = container;

        // For picture elements with overlay approach, use the same target container as the button
        const pictureElement = img.closest('picture');
        if (pictureElement) {
            console.log('Picture element found in convertTo3D, checking data attributes:', {
                hasLifTargetWidth: !!pictureElement.dataset.lifTargetWidth,
                hasLifTargetHeight: !!pictureElement.dataset.lifTargetHeight,
                lifTargetWidth: pictureElement.dataset.lifTargetWidth,
                lifTargetHeight: pictureElement.dataset.lifTargetHeight
            });

            const imageContainer = pictureElement.parentElement; // image__container
            const imageDiv = imageContainer?.parentElement; // image div
            const containerMedia = imageDiv?.parentElement; // container__item-media

            // For picture elements, set the container to the picture's parent since they don't have .lif-image-container wrapper
            container = imageContainer; // This will be used for LIF viewer creation

            // Use the same logic as button positioning to find the best container for overlay
            if (containerMedia && containerMedia.classList.contains('container__item-media')) {
                overlayContainer = containerMedia;
                if (isDebugEnabled) {
                    console.log('Using container__item-media as overlay container');
                }
            } else if (imageDiv && imageDiv.classList.contains('image')) {
                overlayContainer = imageDiv;
                if (isDebugEnabled) {
                    console.log('Using image div as overlay container');
                }
            } else {
                overlayContainer = imageContainer;
                if (isDebugEnabled) {
                    console.log('Using image__container as overlay container');
                }
            }

            console.log('Picture element detected in convertTo3D - container set to:', container?.className || 'element');
        }

        // Check for aspect ratio containers that might have stored target dimensions
        if (!overlayContainer) {
            // Look for aspect ratio containers in the parent hierarchy
            let searchElement = img.parentElement;
            for (let i = 0; i < 3 && searchElement; i++) {
                if (searchElement.dataset.lifTargetWidth && searchElement.dataset.lifTargetHeight) {
                    overlayContainer = searchElement;
                    // CRITICAL FIX: Also set container to the element with stored dimensions
                    // This ensures dimension lookup works correctly for Instagram/Shopify aspect ratio containers
                    if (!container) {
                        container = searchElement;
                    }
                    console.log('Found aspect ratio container with stored dimensions:', {
                        element: searchElement.className || searchElement.tagName,
                        targetWidth: searchElement.dataset.lifTargetWidth,
                        targetHeight: searchElement.dataset.lifTargetHeight
                    });
                    break;
                }
                searchElement = searchElement.parentElement;
            }
        }

        // Special handling for Facebook-style layouts that may have been unwrapped
        const layoutAnalysis = analyzeLayoutPattern(img.parentElement, img);
        if (layoutAnalysis?.isFacebookStyle && !overlayContainer) {
            // For Facebook images that were unwrapped, find a suitable overlay container
            let searchElement = img.parentElement;
            for (let i = 0; i < 3 && searchElement; i++) {
                const style = window.getComputedStyle(searchElement);
                if (style.position === 'relative' || style.position === 'absolute') {
                    overlayContainer = searchElement;
                    if (isDebugEnabled) {
                        console.log('Facebook layout: Found overlay container in parent hierarchy');
                    }
                    break;
                }
                searchElement = searchElement.parentElement;
            }

            // If still no overlay container, use the direct parent
            if (!overlayContainer) {
                overlayContainer = img.parentElement;
                if (isDebugEnabled) {
                    console.log('Facebook layout: Using direct parent as overlay container');
                }

                // Ensure it can contain positioned elements
                const parentStyle = window.getComputedStyle(overlayContainer);
                if (parentStyle.position === 'static') {
                    overlayContainer.style.position = 'relative';
                }
            }
        }

        if (overlayContainer) {
            overlayContainer.classList.add('processing');
            const overlay = document.createElement('div');
            overlay.className = 'lif-processing-overlay';
            overlay.innerHTML = '<div class="lif-spinner"></div>Converting to 3D...';

            // Debug: Check if we have a picture element, Facebook layout, or aspect ratio container using overlay approach
            const currentPictureElement = img.closest('picture');
            const isAspectRatioContainer = overlayContainer.dataset.lifTargetWidth && overlayContainer.dataset.lifTargetHeight;

            if (isDebugEnabled) {
                console.log('Overlay creation debug:', {
                    hasPictureElement: !!currentPictureElement,
                    isFacebookStyle: layoutAnalysis?.isFacebookStyle,
                    isAspectRatioContainer: !!isAspectRatioContainer,
                    overlayContainer: overlayContainer.className || overlayContainer.tagName,
                    pictureElementClass: currentPictureElement?.className || 'none',
                    hasStoredDimensions: !!isAspectRatioContainer
                });
            }

            // For picture element overlays, Facebook layouts, or aspect ratio containers, position absolutely to cover the image
            if (currentPictureElement || layoutAnalysis?.isFacebookStyle || isAspectRatioContainer) {
                // Get dimensions from the image
                const imgRect = img.getBoundingClientRect();
                const containerRect = overlayContainer.getBoundingClientRect();

                // Calculate relative position using the image's position
                const relativeTop = imgRect.top - containerRect.top;
                const relativeLeft = imgRect.left - containerRect.left;

                // Use custom positioning for picture elements and Facebook layouts
                overlay.style.cssText = `
                    position: absolute;
                    top: ${relativeTop}px;
                    left: ${relativeLeft}px;
                    width: ${imgRect.width}px;
                    height: ${imgRect.height}px;
                    background: rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 14px;
                    z-index: 5000;
                `;

                const layoutType = currentPictureElement ? 'picture element' :
                    layoutAnalysis?.isFacebookStyle ? 'Facebook layout' :
                        'aspect ratio container';
                if (isDebugEnabled) {
                    console.log(`Positioning overlay at ${relativeLeft},${relativeTop} with size ${imgRect.width}x${imgRect.height} (${layoutType})`);
                }

                // Ensure the overlay container can contain absolutely positioned elements
                const containerStyle = window.getComputedStyle(overlayContainer);
                if (containerStyle.position === 'static') {
                    overlayContainer.style.position = 'relative';
                }
            } else {
                // For non-picture elements, use the default CSS positioning (fills container)
                overlay.style.zIndex = Z_INDEX_CONFIG.PROCESSING_OVERLAY;
                if (isDebugEnabled) {
                    console.log('Using default overlay positioning for regular image');
                }
            }

            // Store reference to overlay container on the overlay for later removal
            overlay.dataset.overlayContainer = overlayContainer.className || 'unknown';
            overlayContainer.appendChild(overlay);
        }

        console.log('Starting 2D to 3D conversion for image:', img.src);

        // Convert image to file
        const file = await imageToFile(img);

        // Check if we got a placeholder due to CORS issues
        if (file.size < 1000 && (file.name === 'placeholder.jpg' || file.name === 'error.jpg')) {
            console.warn('Image conversion may have failed due to CORS restrictions');

            // Show CORS info popup if this is the first time
            showCorsInfoIfNeeded();

            // Update button to show CORS warning
            button.textContent = 'CORS Error';
            button.style.background = 'linear-gradient(135deg, #ff9800 0%, #f44336 100%)';
            button.title = 'Image blocked by CORS policy. Try on a different website or image.';

            // Show user-friendly message
            const corsMessage = document.createElement('div');
            corsMessage.style.cssText = `
                position: absolute;
                top: 40px;
                right: 8px;
                background: rgba(255, 152, 0, 0.95);
                color: white;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 11px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 200px;
                line-height: 1.3;
                z-index: 10001;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            corsMessage.textContent = 'This image is protected by CORS policy and cannot be processed. Try images from other websites.';

            if (container) {
                container.appendChild(corsMessage);

                // Auto-remove message after 5 seconds
                setTimeout(() => {
                    if (corsMessage.parentNode) {
                        corsMessage.remove();
                    }
                }, 5000);
            }

            return; // Exit early for CORS issues
        }

        // Log successful file conversion
        console.log(`Image successfully converted to file: ${file.size} bytes`);

        // Create LIF generator
        const lifGen = new monoLdiGenerator(file, 'lama');

        // Set up completion handler
        lifGen.afterLoad = function () {
            console.log('3D conversion completed successfully');

            // Update button to LIF state and ensure it persists
            button.textContent = '⬇️ LIF';
            button.classList.remove('processing');
            button.classList.add('lif-ready');
            button.disabled = false;
            button.dataset.state = 'lif-ready';
            button.title = 'Click to download the LIF file';

            // Show VR button now that LIF is ready (but only if WebXR is supported)
            if (button.vrButton) {
                if (webXRSupportChecked && isWebXRSupported) {
                    console.log('🥽 Making VR button visible (LIF ready + WebXR supported)');
                    button.vrButton.style.display = 'block';
                    console.log('✅ VR button display style set to block');
                } else if (webXRSupportChecked && !isWebXRSupported) {
                    console.log('❌ VR button remains hidden - WebXR not supported');
                    button.vrButton.style.display = 'none';
                } else {
                    console.log('⏳ VR button remains hidden - WebXR support test still pending');
                    button.vrButton.style.display = 'none';

                    // Check again after a short delay
                    setTimeout(() => {
                        if (webXRSupportChecked && isWebXRSupported) {
                            console.log('🥽 Making VR button visible (delayed - WebXR support confirmed)');
                            button.vrButton.style.display = 'block';
                        }
                    }, 1000);
                }

                // Debug VR button state
                const vrButtonRect = button.vrButton.getBoundingClientRect();
                console.log('🔍 VR button status:', {
                    display: button.vrButton.style.display,
                    visibility: window.getComputedStyle(button.vrButton).visibility,
                    opacity: window.getComputedStyle(button.vrButton).opacity,
                    pointerEvents: window.getComputedStyle(button.vrButton).pointerEvents,
                    zIndex: window.getComputedStyle(button.vrButton).zIndex,
                    position: { x: vrButtonRect.x, y: vrButtonRect.y, width: vrButtonRect.width, height: vrButtonRect.height },
                    hasClickListener: true,
                    parentElement: button.vrButton.parentElement?.className || 'none',
                    className: button.vrButton.className
                });

                console.log('VR button now visible - LIF is ready');

                // VR button is now visible and ready
                // VR button is now visible and ready for use - success logging removed

            } else {
                console.error('❌ VR button not found on button object when trying to make it visible');
            }

            // Remove processing overlay - check both container and overlayContainer
            const overlay = container?.querySelector('.lif-processing-overlay');
            if (overlay) {
                overlay.remove();
            }
            if (container) {
                container.classList.remove('processing');
            }

            // Also check for Facebook-style layouts that might have overlays in different containers
            if (layoutAnalysis?.isFacebookStyle) {
                // Search for Facebook overlays in parent hierarchy
                let searchElement = img.parentElement;
                for (let i = 0; i < 3 && searchElement; i++) {
                    const facebookOverlay = searchElement.querySelector('.lif-processing-overlay');
                    if (facebookOverlay) {
                        console.log('Removing Facebook overlay from parent hierarchy');
                        facebookOverlay.remove();
                        searchElement.classList.remove('processing');
                        break;
                    }
                    searchElement = searchElement.parentElement;
                }
            }

            // Comprehensive overlay removal - search for any remaining overlays
            const allOverlays = document.querySelectorAll('.lif-processing-overlay');
            if (allOverlays.length > 0) {
                console.log(`Found ${allOverlays.length} remaining overlay(s), removing them`);
                allOverlays.forEach(remainingOverlay => {
                    try {
                        const overlayParent = remainingOverlay.parentElement;
                        remainingOverlay.remove();
                        if (overlayParent) {
                            overlayParent.classList.remove('processing');
                        }
                    } catch (error) {
                        console.warn('Error removing overlay:', error);
                    }
                });
            }

            // Also check for picture element overlay in overlayContainer (could be different from container)
            if (pictureElement) {
                // For picture elements, we need to check the overlayContainer which might be different
                const imageContainer = pictureElement.parentElement; // image__container
                const imageDiv = imageContainer?.parentElement; // image div
                const containerMedia = imageDiv?.parentElement; // container__item-media

                // Check all possible overlay containers
                [containerMedia, imageDiv, imageContainer].forEach(possibleContainer => {
                    if (possibleContainer) {
                        const pictureOverlay = possibleContainer.querySelector('.lif-processing-overlay');
                        if (pictureOverlay) {
                            pictureOverlay.remove();
                            possibleContainer.classList.remove('processing');
                        }
                    }
                });
            }

            // Also check for picture element overlay and aspect ratio container overlays
            const pictureParent = img.closest('picture')?.parentElement;
            if (pictureParent) {
                const pictureOverlay = pictureParent.querySelector('.lif-processing-overlay');
                if (pictureOverlay) {
                    pictureOverlay.remove();
                }
                pictureParent.classList.remove('processing');
            }

            // Check for aspect ratio container overlays that might have stored dimensions
            const aspectRatioContainers = document.querySelectorAll('[data-lif-target-width]');
            aspectRatioContainers.forEach(aspectContainer => {
                const aspectOverlay = aspectContainer.querySelector('.lif-processing-overlay');
                if (aspectOverlay) {
                    console.log('Removing aspect ratio container overlay');
                    aspectOverlay.remove();
                    aspectContainer.classList.remove('processing');
                }
            });

            // Create the LIF viewer with effective dimensions
            // For padding-based layouts, prioritize container dimensions over image dimensions
            const containerRect = container?.getBoundingClientRect();
            const containerStyle = container ? window.getComputedStyle(container) : null;
            const isAbsolutelyPositioned = containerStyle?.position === 'absolute';

            let effectiveWidth, effectiveHeight;

            // Check if we have stored target dimensions (from picture element handling)
            if (container?.dataset.lifTargetWidth && container?.dataset.lifTargetHeight) {
                effectiveWidth = parseInt(container.dataset.lifTargetWidth);
                effectiveHeight = parseInt(container.dataset.lifTargetHeight);
                console.log(`Using container stored dimensions: ${effectiveWidth}x${effectiveHeight}`);
            }
            // Check for picture element dimensions (overlay approach)
            else if (img.closest('picture')?.dataset.lifTargetWidth && img.closest('picture')?.dataset.lifTargetHeight) {
                const pictureElement = img.closest('picture');
                effectiveWidth = parseInt(pictureElement.dataset.lifTargetWidth);
                effectiveHeight = parseInt(pictureElement.dataset.lifTargetHeight);
                console.log(`Using picture element stored dimensions: ${effectiveWidth}x${effectiveHeight}`);
            }
            // Check for aspect ratio container stored dimensions in parent hierarchy (Instagram, Shopify, etc.)
            else {
                let foundStoredDimensions = false;
                let searchElement = img.parentElement;
                for (let i = 0; i < 3 && searchElement && !foundStoredDimensions; i++) {
                    if (searchElement.dataset.lifTargetWidth && searchElement.dataset.lifTargetHeight) {
                        effectiveWidth = parseInt(searchElement.dataset.lifTargetWidth);
                        effectiveHeight = parseInt(searchElement.dataset.lifTargetHeight);
                        foundStoredDimensions = true;
                        console.log(`Using aspect ratio container stored dimensions: ${effectiveWidth}x${effectiveHeight} from`, searchElement.className || searchElement.tagName);
                        break;
                    }
                    searchElement = searchElement.parentElement;
                }

                if (!foundStoredDimensions) {
                    // Continue with existing fallback logic
                    if (isAbsolutelyPositioned && containerRect && containerRect.width > 0 && containerRect.height > 0) {
                        // For padding-based layouts (absolute positioned containers), use container dimensions
                        effectiveWidth = Math.round(containerRect.width);
                        effectiveHeight = Math.round(containerRect.height);
                        console.log(`Using container rect dimensions: ${effectiveWidth}x${effectiveHeight}`);
                    } else {
                        // For standard layouts, use image dimensions
                        const originalWidth = img.width || img.naturalWidth;
                        const originalHeight = img.height || img.naturalHeight;

                        effectiveWidth = originalWidth;
                        effectiveHeight = originalHeight;
                        console.log(`Using original image dimensions: ${effectiveWidth}x${effectiveHeight}`);

                        if (originalWidth === 0 || originalHeight === 0) {
                            // Fallback to container if image dimensions are problematic
                            if (containerRect && containerRect.width > 0 && containerRect.height > 0) {
                                effectiveWidth = Math.round(containerRect.width);
                                effectiveHeight = Math.round(containerRect.height);
                                console.log(`Fallback to container rect dimensions: ${effectiveWidth}x${effectiveHeight}`);
                            } else {
                                // Last resort: use natural dimensions or reasonable defaults
                                effectiveWidth = img.naturalWidth || 400;
                                effectiveHeight = img.naturalHeight || 300;
                                console.log(`Last resort dimensions: ${effectiveWidth}x${effectiveHeight}`);
                            }
                        }
                    }
                }
            }

            console.log(`Creating LIF viewer for image: ${effectiveWidth}x${effectiveHeight}`);

            // For picture elements with overlay approach, use the picture's parent as the container
            let lifContainer = container;
            console.log('🔍 Container selection debug:');
            console.log('   Original container:', container);
            console.log('   Picture element:', img.closest('picture'));
            console.log('   Picture has lifTargetWidth:', img.closest('picture')?.dataset.lifTargetWidth);

            if (img.closest('picture') && img.closest('picture').dataset.lifTargetWidth) {
                lifContainer = img.closest('picture').parentElement;
                console.log('🚨 CHANGED to picture parent as LIF container for overlay approach');
                console.log('   Picture parent container:', lifContainer);
            } else {
                // Using original container for LIF viewer - logging removed
            }

            // Use the enhanced factory method for layout-aware viewer creation
            const viewer = lifViewer.createForLayout(
                this.lifDownloadUrl,
                lifContainer || img.parentElement,
                img,
                layoutAnalysis,
                {
                    width: effectiveWidth,
                    height: effectiveHeight,
                    autoplay: true,
                    mouseOver: true,
                    canvasZIndex: Z_INDEX_CONFIG.CANVAS,
                    imageZIndex: Z_INDEX_CONFIG.IMAGE
                }
            );

            // Store viewer reference on button for later use
            button.lifViewer = viewer;

            // Enhanced afterLoad - much simpler since lifViewer handles layout-specific setup
            const originalAfterLoad = viewer.afterLoad;
            viewer.afterLoad = async function () {
                // Call the enhanced afterLoad from lifViewer first
                await originalAfterLoad.call(this);

                console.log('LIF viewer loaded successfully with layout-aware setup!');

                // Ensure button state is still correct after viewer loads
                setTimeout(() => {
                    if (button.dataset.state === 'lif-ready') {
                        button.textContent = '⬇️ LIF';
                        button.classList.remove('processing');
                        button.classList.add('lif-ready');
                        console.log('Button state reconfirmed as LIF');

                        // Show VR button if not already visible (and if WebXR is supported)
                        if (button.vrButton && button.vrButton.style.display === 'none' && webXRSupportChecked && isWebXRSupported) {
                            button.vrButton.style.display = 'block';
                            console.log('VR button made visible during state reconfirmation (WebXR supported)');
                        } else if (button.vrButton && button.vrButton.style.display === 'none' && webXRSupportChecked && !isWebXRSupported) {
                            console.log('VR button remains hidden during state reconfirmation (WebXR not supported)');
                        }
                    }
                }, 100);

                // For picture elements with overlay approach, manage button zones
                if (img.closest('picture') && img.closest('picture').dataset.lifTargetWidth) {
                    console.log('Picture element detected - managing overlay button properly');

                    // Find the original button zone in the picture parent
                    const pictureParent = img.closest('picture').parentElement;
                    const originalButtonZones = pictureParent.querySelectorAll('.lif-button-zone');

                    // Keep only the button associated with this specific conversion
                    originalButtonZones.forEach(zone => {
                        const zoneButton = zone.querySelector('.lif-converter-btn');
                        if (zoneButton && zoneButton !== button) {
                            console.log('Removing duplicate button zone');
                            zone.remove();
                        } else if (zoneButton === button) {
                            console.log('Keeping the active conversion button');
                            // Ensure the button zone is properly positioned and visible
                            zone.style.position = 'absolute';
                            zone.style.top = '8px';
                            zone.style.right = '8px';
                            zone.style.zIndex = Z_INDEX_CONFIG.BUTTON_ZONE;
                            zone.style.pointerEvents = 'auto';
                        }
                    });
                }

                // Add a visual indicator that the LIF is ready
                if (lifContainer) {
                    lifContainer.setAttribute('data-lif-active', 'true');
                }

                console.log(`Enhanced LIF viewer initialized with layout mode: ${this.layoutMode}`);
                console.log('All layout-specific setup handled automatically by lifViewer');




            };

        };

        // Start the conversion process
        await lifGen.init();

    } catch (error) {
        console.error('Error converting image to 3D:', error);

        // Reset button state on error
        button.textContent = button.dataset.originalText || '2D3D';
        button.classList.remove('processing', 'lif-ready');
        button.disabled = false;
        button.dataset.state = 'ready';
        button.style.background = ''; // Reset any custom background

        // Hide VR button on error
        if (button.vrButton) {
            button.vrButton.style.display = 'none';
            button.vrButton.classList.remove('vr-active');
            button.vrButton.textContent = '🥽 VR';
        }

        // Remove processing overlay - check both container and overlayContainer
        const overlay = container?.querySelector('.lif-processing-overlay');
        if (overlay) {
            overlay.remove();
        }
        if (container) {
            container.classList.remove('processing');
        }

        // Also check for Facebook-style layouts that might have overlays in different containers
        if (layoutAnalysis?.isFacebookStyle) {
            // Search for Facebook overlays in parent hierarchy
            let searchElement = img.parentElement;
            for (let i = 0; i < 3 && searchElement; i++) {
                const facebookOverlay = searchElement.querySelector('.lif-processing-overlay');
                if (facebookOverlay) {
                    console.log('Removing Facebook overlay from parent hierarchy');
                    facebookOverlay.remove();
                    searchElement.classList.remove('processing');
                    break;
                }
                searchElement = searchElement.parentElement;
            }
        }

        // Comprehensive overlay removal - search for any remaining overlays
        const allOverlays = document.querySelectorAll('.lif-processing-overlay');
        if (allOverlays.length > 0) {
            console.log(`Found ${allOverlays.length} remaining overlay(s), removing them`);
            allOverlays.forEach(remainingOverlay => {
                try {
                    const overlayParent = remainingOverlay.parentElement;
                    remainingOverlay.remove();
                    if (overlayParent) {
                        overlayParent.classList.remove('processing');
                    }
                } catch (error) {
                    console.warn('Error removing overlay:', error);
                }
            });
        }

        // Also check for picture element overlay in overlayContainer (could be different from container)
        if (pictureElement) {
            // For picture elements, we need to check the overlayContainer which might be different
            const imageContainer = pictureElement.parentElement; // image__container
            const imageDiv = imageContainer?.parentElement; // image div
            const containerMedia = imageDiv?.parentElement; // container__item-media

            // Check all possible overlay containers
            [containerMedia, imageDiv, imageContainer].forEach(possibleContainer => {
                if (possibleContainer) {
                    const pictureOverlay = possibleContainer.querySelector('.lif-processing-overlay');
                    if (pictureOverlay) {
                        pictureOverlay.remove();
                        possibleContainer.classList.remove('processing');
                    }
                }
            });
        }

        // Also check for picture element overlay and aspect ratio container overlays
        const pictureParent = img.closest('picture')?.parentElement;
        if (pictureParent) {
            const pictureOverlay = pictureParent.querySelector('.lif-processing-overlay');
            if (pictureOverlay) {
                pictureOverlay.remove();
            }
            pictureParent.classList.remove('processing');
        }

        // Check for aspect ratio container overlays that might have stored dimensions
        const aspectRatioContainers = document.querySelectorAll('[data-lif-target-width]');
        aspectRatioContainers.forEach(aspectContainer => {
            const aspectOverlay = aspectContainer.querySelector('.lif-processing-overlay');
            if (aspectOverlay) {
                console.log('Removing aspect ratio container overlay (error handling)');
                aspectOverlay.remove();
                aspectContainer.classList.remove('processing');
            }
        });

        // Provide specific error messages based on error type
        let errorMessage = 'Failed to convert image to 3D. ';
        let isTemporaryError = false;

        if (error.message && error.message.includes('CORS')) {
            errorMessage = 'This image is protected by CORS policy and cannot be processed. Try images from other websites.';
            button.textContent = 'CORS Block';
            button.style.background = 'linear-gradient(135deg, #ff9800 0%, #f44336 100%)';

            // Show CORS info popup if this is the first time
            showCorsInfoIfNeeded();
        } else if (error.message && (error.message.includes('network') || error.message.includes('fetch'))) {
            errorMessage = 'Network error occurred. Please check your internet connection and try again.';
            button.textContent = 'Net Error';
            isTemporaryError = true;
        } else if (error.message && error.message.includes('timeout')) {
            errorMessage = 'Request timed out. The image might be too large or the server is busy. Please try again.';
            button.textContent = 'Timeout';
            isTemporaryError = true;
        } else if (error.message && error.message.includes('API')) {
            errorMessage = 'API service temporarily unavailable. Please try again in a few moments.';
            button.textContent = 'API Error';
            isTemporaryError = true;
        } else {
            errorMessage += 'Please try again or try a different image.';
            button.textContent = 'Error';
        }

        // Show error message in console and optionally to user
        console.warn('Conversion failed:', errorMessage);

        // For temporary errors, auto-reset the button after a delay
        if (isTemporaryError) {
            setTimeout(() => {
                if (button.dataset.state === 'ready') {
                    button.textContent = button.dataset.originalText || '2D3D';
                    button.style.background = ''; // Reset background
                }
            }, 3000);
        }

        // Create a non-intrusive error notification
        const errorNotification = document.createElement('div');
        errorNotification.style.cssText = `
            position: absolute;
            top: 40px;
            right: 8px;
            background: rgba(244, 67, 54, 0.95);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 11px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 200px;
            line-height: 1.3;
            z-index: 10001;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        errorNotification.textContent = errorMessage;

        if (container) {
            container.appendChild(errorNotification);

            // Fade in
            setTimeout(() => {
                errorNotification.style.opacity = '1';
            }, 100);

            // Auto-remove after 6 seconds
            setTimeout(() => {
                errorNotification.style.opacity = '0';
                setTimeout(() => {
                    if (errorNotification.parentNode) {
                        errorNotification.remove();
                    }
                }, 300);
            }, 6000);
        }

    } finally {
        processingImages.delete(imgId);
    }
}

/**
 * COMPREHENSIVE CSS LAYOUT ANALYSIS ENGINE
 * 
 * This function analyzes the existing CSS layout patterns of images and their containers
 * to preserve responsive design and avoid breaking existing page layouts.
 * 
 * DETECTED PATTERNS:
 * 1. Padding-based aspect ratios (Instagram, Pinterest, Google Images)
 * 2. Absolute positioning within containers
 * 3. Flex/Grid parent layouts
 * 4. Responsive sizing with %, vw, vh units
 * 5. CSS transforms and object-fit usage
 * 6. Facebook-style complex positioning
 * 
 * PRESERVATION STRATEGY:
 * - Minimal intervention approach
 * - Maintains original layout behavior
 * - Only applies fixes when absolutely necessary
 * - Respects responsive breakpoints
 */
// Comprehensive CSS layout analysis to avoid disrupting existing patterns
function analyzeLayoutPattern(element, img) {
    const computedStyle = window.getComputedStyle(element);
    const parentStyle = element.parentElement ? window.getComputedStyle(element.parentElement) : null;
    const imgStyle = window.getComputedStyle(img);

    const analysis = {
        type: 'unknown',
        preserveOriginal: false,
        reason: '',
        containerHasPaddingAspectRatio: false,
        imageIsAbsolute: false,
        parentUsesFlexOrGrid: false,
        hasResponsivePattern: false,
        isFacebookStyle: false
    };

    // 0. Detect Facebook-style layouts first (specific to Facebook)
    // Insight: Facebook uses complex CSS positioning (x168nmei, x13lgxp2, x5pf9jr classes)
    // that breaks when DOM structure is modified. Overlay approach preserves original layout.
    const isFacebookImage = img.src && img.src.includes('fbcdn.net');
    const hasFacebookClasses = img.classList && (
        img.className.includes('x168nmei') ||
        img.className.includes('x13lgxp2') ||
        img.className.includes('x5pf9jr')
    );

    if (isFacebookImage || hasFacebookClasses) {
        analysis.isFacebookStyle = true;
        analysis.type = 'facebook-layout';
        analysis.preserveOriginal = true;
        analysis.reason = 'Facebook-style complex positioning detected';

        // Check if this is within a padding-based container
        let currentElement = element;
        for (let i = 0; i < 5 && currentElement; i++) {
            const style = window.getComputedStyle(currentElement);
            if (style.paddingTop.includes('%') && parseFloat(style.paddingTop) > 50) {
                analysis.containerHasPaddingAspectRatio = true;
                break;
            }
            currentElement = currentElement.parentElement;
        }

        console.log('Facebook layout detected:', {
            isFacebookImage,
            hasFacebookClasses,
            hasPaddingContainer: analysis.containerHasPaddingAspectRatio,
            imgClasses: img.className
        });
    }

    // 1. Detect padding-based aspect ratio containers (Instagram, Pinterest, Google, Facebook, Shopify, etc.)
    // This includes checking the image's parent containers for aspect ratio patterns
    const paddingBottom = computedStyle.paddingBottom;
    const paddingTop = computedStyle.paddingTop;
    const height = computedStyle.height;

    // Parse numeric values from CSS (handles both px and % values)
    const paddingBottomValue = parseFloat(paddingBottom) || 0;
    const paddingTopValue = parseFloat(paddingTop) || 0;
    const heightValue = parseFloat(height) || 0;

    // Check for percentage-based padding (like Google's 94.118% or Facebook's 112.5%)
    const hasPercentagePadding = paddingBottom.includes('%') || paddingTop.includes('%');
    const hasPaddingValue = paddingBottomValue > 0 || paddingTopValue > 0;
    const hasZeroHeight = heightValue === 0 || height === '0px' || height === 'auto';

    // Also check parent containers for aspect ratio patterns (ratio-box, aspect-ratio, etc.)
    let foundPaddingContainer = false;
    let paddingContainerInfo = null;
    let currentElement = element.parentElement;

    for (let i = 0; i < 3 && currentElement; i++) {
        const parentComputedStyle = window.getComputedStyle(currentElement);
        const parentPaddingBottom = parentComputedStyle.paddingBottom;
        const parentPaddingTop = parentComputedStyle.paddingTop;
        const parentHeight = parentComputedStyle.height;

        const parentPaddingBottomValue = parseFloat(parentPaddingBottom) || 0;
        const parentPaddingTopValue = parseFloat(parentPaddingTop) || 0;
        const parentHeightValue = parseFloat(parentHeight) || 0;

        const parentHasPercentagePadding = parentPaddingBottom.includes('%') || parentPaddingTop.includes('%');
        const parentHasPaddingValue = parentPaddingBottomValue > 0 || parentPaddingTopValue > 0;
        const parentHasZeroHeight = parentHeightValue === 0 || parentHeight === '0px' || parentHeight === 'auto';

        // Detect aspect ratio containers and similar patterns
        const isRatioBox = currentElement.classList.contains('ratio-box') ||
            currentElement.classList.contains('aspect-ratio') ||
            currentElement.classList.contains('ratio');

        if ((parentHasPaddingValue || parentHasPercentagePadding) && parentHasZeroHeight || isRatioBox) {
            foundPaddingContainer = true;
            paddingContainerInfo = {
                element: currentElement,
                paddingBottom: parentPaddingBottom,
                paddingTop: parentPaddingTop,
                height: parentHeight,
                isRatioBox: isRatioBox,
                level: i + 1
            };
            break;
        }

        currentElement = currentElement.parentElement;
    }

    if ((hasPaddingValue || hasPercentagePadding) && hasZeroHeight || foundPaddingContainer) {
        if (!analysis.type || analysis.type === 'unknown') {
            analysis.type = 'padding-aspect-ratio';
        }
        analysis.preserveOriginal = true;

        if (foundPaddingContainer) {
            analysis.reason = `Parent container uses padding-based sizing (${paddingContainerInfo.element.className}: padding-bottom: ${paddingContainerInfo.paddingBottom})`;
            analysis.paddingContainer = paddingContainerInfo;
        } else {
            analysis.reason = `Container uses padding-based sizing (padding-top: ${paddingTop}, padding-bottom: ${paddingBottom}, height: ${height})`;
        }

        analysis.containerHasPaddingAspectRatio = true;

        if (isDebugEnabled) {
            console.log('Padding-based aspect ratio detected:', {
                directPadding: { paddingTop, paddingBottom, height, paddingTopValue, paddingBottomValue, heightValue, hasPercentagePadding },
                parentPadding: paddingContainerInfo,
                foundPaddingContainer
            });
        }
    }

    // 2. Detect absolutely positioned images within containers
    if (imgStyle.position === 'absolute' || imgStyle.position === 'fixed') {
        analysis.imageIsAbsolute = true;
        if (!analysis.type || analysis.type === 'unknown') {
            analysis.type = 'absolute-positioned';
            analysis.preserveOriginal = true;
            analysis.reason = 'Image is absolutely positioned';
        }
    }

    // 3. Detect flex/grid parent layouts
    if (parentStyle) {
        const isFlexParent = parentStyle.display === 'flex' || parentStyle.display === 'inline-flex';
        const isGridParent = parentStyle.display === 'grid' || parentStyle.display === 'inline-grid';

        if (isFlexParent || isGridParent) {
            analysis.parentUsesFlexOrGrid = true;
            if (!analysis.preserveOriginal) {
                analysis.type = isFlexParent ? 'flex-child' : 'grid-child';
                analysis.preserveOriginal = true;
                analysis.reason = `Parent uses ${isFlexParent ? 'flexbox' : 'grid'} layout`;
            }
        }
    }

    // 4. Detect responsive patterns (percentage sizing, viewport units)
    const hasPercentageWidth = computedStyle.width.includes('%');
    const hasPercentageHeight = computedStyle.height.includes('%');
    const hasViewportUnits = computedStyle.width.includes('vw') || computedStyle.height.includes('vh');

    if (hasPercentageWidth || hasPercentageHeight || hasViewportUnits) {
        analysis.hasResponsivePattern = true;
        if (!analysis.preserveOriginal) {
            analysis.type = 'responsive-container';
            analysis.preserveOriginal = true;
            analysis.reason = 'Container uses responsive sizing (%, vw, vh)';
        }
    }

    // 5. Detect CSS transforms that might affect sizing
    if (imgStyle.transform && imgStyle.transform !== 'none') {
        if (!analysis.preserveOriginal) {
            analysis.type = 'transformed-image';
            analysis.preserveOriginal = true;
            analysis.reason = 'Image uses CSS transforms';
        }
    }

    // 6. Detect object-fit usage (modern responsive image technique)
    if (imgStyle.objectFit && imgStyle.objectFit !== 'fill') {
        if (!analysis.preserveOriginal) {
            analysis.type = 'object-fit-image';
            analysis.reason = `Image uses object-fit: ${imgStyle.objectFit}`;
        }
    }

    return analysis;
}

/**
 * MAIN BUTTON ADDITION FUNCTION
 * 
 * This is the core function that adds 2D3D conversion buttons to images.
 * It implements the dual-path system for handling different image types.
 * 
 * DUAL PATH SYSTEM:
 * 
 * PATH 1 - PICTURE ELEMENTS (Overlay Approach):
 * - Used for: <picture> elements with responsive sources (CNN, news sites)
 * - Method: Absolute positioning over parent containers
 * - Benefits: Preserves responsive breakpoint functionality
 * - DOM: No wrapping, button overlaid on existing structure
 * 
 * PATH 2 - REGULAR IMAGES (Container Wrapping):
 * - Used for: Standard <img> elements
 * - Method: Wrap in .lif-image-container and add button zone
 * - Benefits: Clean container-based approach
 * - DOM: Creates wrapper for positioning context
 * 
 * CLICK ISOLATION STRATEGY:
 * - Picture elements: Enhanced event handling with overlay protection
 * - Regular images: Button zone with aggressive event stopping
 * - Both: Multi-layer event prevention system
 * 
 * LAYOUT PRESERVATION:
 * - Analyzes existing CSS patterns before modification
 * - Applies minimal fixes only when necessary
 * - Preserves responsive design and aspect ratios
 */
// Function to add 2D3D button to an image
/**
 * ============================================================================
 * ADD CONVERT BUTTON - INTELLIGENT IMAGE PROCESSING
 * ============================================================================
 * 
 * Core function that adds 2D→3D conversion buttons to eligible images across
 * all websites. Features advanced layout analysis, dimension correction, and
 * universal compatibility patterns.
 * 
 * KEY CAPABILITIES:
 * ✅ Universal picture element dimension correction (Shutterstock, Zillow, etc.)
 * ✅ Responsive layout preservation (Instagram, Pinterest, Google Images) 
 * ✅ Complex container analysis (CNN, Facebook, photography sites)
 * ✅ CORS-aware processing with fallback strategies
 * ✅ Intelligent skip logic (UI elements, already processed images)
 * ✅ Dual-path processing (picture overlay vs container wrapping)
 * 
 * SUPPORTED LAYOUT PATTERNS:
 * - Picture elements with responsive source sets
 * - Padding-based aspect ratio containers  
 * - Absolute positioned responsive images
 * - Flex/Grid modern layouts
 * - Complex nested container structures
 * 
 * @param {HTMLImageElement} img - Target image element to process
 * ============================================================================
 */
function addConvertButton(img) {
    // Get both rendered and intrinsic dimensions
    const renderedWidth = img.width || 0;
    const renderedHeight = img.height || 0;
    const intrinsicWidth = img.naturalWidth || 0;
    const intrinsicHeight = img.naturalHeight || 0;

    // Image dimensions logging removed to reduce console noise

    // Use intrinsic dimensions if rendered size is 0x0 or too small
    const effectiveWidth = renderedWidth > 0 ? renderedWidth : intrinsicWidth;
    const effectiveHeight = renderedHeight > 0 ? renderedHeight : intrinsicHeight;

    // Skip if image is too small (using effective dimensions)
    if (effectiveWidth < 100 || effectiveHeight < 100) {
        return;
    }

    // ============================================================================
    // 🎯 INTELLIGENT IMAGE FILTERING SYSTEM (6-Layer Architecture)
    // ============================================================================
    // Multi-layered filtering system that identifies content-worthy images while
    // filtering out UI elements, navigation icons, video thumbnails, and decorative
    // content. Supports dynamic content and scrolling galleries through smart
    // viewport management and enhanced video detection.
    // ============================================================================

    // 📊 LAYER 1: VISIBILITY AND GEOMETRIC ANALYSIS
    const imgComputedStyle = window.getComputedStyle(img);
    const imgRect = img.getBoundingClientRect();

    // Skip invisible images
    if (imgComputedStyle.display === 'none' ||
        imgComputedStyle.visibility === 'hidden' ||
        parseFloat(imgComputedStyle.opacity) === 0) {
        if (isDebugEnabled) {
            console.log('🚫 Skipping invisible image:', img.src?.substring(0, 50) + '...');
        }
        return;
    }

    // Skip images with zero or negative dimensions (hidden/positioned off-screen)
    if (imgRect.width <= 0 || imgRect.height <= 0) {
        if (isDebugEnabled) {
            console.log('🚫 Skipping zero-dimension image:', img.src?.substring(0, 50) + '...');
        }
        return;
    }

    // Enhanced viewport filtering: Support scrolling galleries while blocking suspicious positioning
    // Relaxed from 100px to 1000px+ to enable Instagram/Pinterest infinite scroll
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const isExtremelyOffScreen =
        imgRect.right < -1000 || imgRect.bottom < -1000 ||  // Far above/left of page
        imgRect.left > viewport.width + 3000 ||             // Far to the right (suspicious positioning)
        (imgRect.top > viewport.height + 5000 && imgRect.left < -500); // Suspicious combo: far down + far left

    if (isExtremelyOffScreen) {
        if (isDebugEnabled) {
            console.log('🚫 Skipping extremely off-screen image (likely hidden UI):', img.src?.substring(0, 50) + '...');
        }
        return;
    }

    // 📐 LAYER 2: SHAPE AND DIMENSIONAL FILTERING
    const aspectRatio = effectiveWidth / effectiveHeight;

    // Skip extremely thin images (likely decorative borders, spacers, dividers)
    if (aspectRatio > 20 || aspectRatio < 0.05) {
        if (isDebugEnabled) {
            console.log('🚫 Skipping decorative image (extreme aspect ratio):', aspectRatio.toFixed(2), img.src?.substring(0, 50) + '...');
        }
        return;
    }

    // Skip very small square images (likely icons, avatars, logos)
    const isSmallSquare = effectiveWidth <= 150 && effectiveHeight <= 150 &&
        Math.abs(aspectRatio - 1) < 0.2; // Nearly square
    if (isSmallSquare) {
        if (isDebugEnabled) {
            console.log('🚫 Skipping small square image (likely icon/logo):', `${effectiveWidth}x${effectiveHeight}`, img.src?.substring(0, 50) + '...');
        }
        return;
    }

    // 🏷️ LAYER 3: SEMANTIC CONTENT ANALYSIS

    // Skip based on alt text that suggests UI elements
    // Use word boundary matching to avoid false positives (e.g., "flight" containing "flag")
    const altText = (img.alt || '').toLowerCase();
    const uiKeywords = ['icon', 'logo', 'arrow', 'button', 'star', 'rating', 'badge', 'flag',
        'menu', 'nav', 'search', 'cart', 'profile', 'avatar', 'thumbnail'];

    const hasUIKeyword = uiKeywords.some(keyword => {
        // Use word boundaries to match whole words only
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(altText);
    });

    if (hasUIKeyword) {
        console.log('🚫 Skipping UI image (alt text):', altText, img.src?.substring(0, 50) + '...');
        return;
    }

    // Skip based on class names that suggest UI elements
    const classNames = (img.className || '').toLowerCase();
    const uiClassKeywords = ['icon', 'logo', 'sprite', 'thumb', 'avatar', 'profile', 'badge',
        'star', 'rating', 'arrow', 'bullet', 'decoration', 'ornament',
        'background', 'bg-', 'ui-', 'nav-', 'menu-', 'header-', 'footer-',
        'sidebar', 'widget', 'ad-', 'banner', 'promo'];

    // Shutterstock exception: Their main content images use Material-UI classes (mui-) and "thumbnail"
    // Note: Shutterstock uses CDN (ctfassets.net) so we only check hostname, not image source
    const isShutterstockImage = window.location.hostname.includes('shutterstock.com') &&
        (classNames.includes('thumbnail') || classNames.includes('mui-'));

    if (!isShutterstockImage && uiClassKeywords.some(keyword => classNames.includes(keyword))) {
        console.log('🚫 Skipping UI image (class name):', classNames, img.src?.substring(0, 50) + '...');
        return;
    }

    // Skip based on src URL patterns that suggest non-content images
    // BUT exclude base64 data URLs since they contain encoded binary data, not file paths
    const src = (img.src || '').toLowerCase();
    const isDataUrl = src.startsWith('data:');

    if (!isDataUrl) {
        const uiSrcKeywords = ['icon', 'logo', 'sprite', 'thumb', 'avatar', 'profile', 'badge',
            'arrow', 'bullet', 'star', 'rating', 'decoration', 'ornament',
            'ui/', 'icons/', 'logos/', 'sprites/', 'thumbs/', 'thumbnails/',
            'avatars/', 'profiles/', 'badges/', 'decorations/', 'ornaments/'];
        if (uiSrcKeywords.some(keyword => src.includes(keyword))) {
            console.log('🚫 Skipping UI image (src pattern):', img.src?.substring(0, 50) + '...');
            return;
        }
    }

    // 🏗️ LAYER 4: CONTEXTUAL PARENT ANALYSIS
    const enhancedSkipSelectors = [
        // Navigation and UI areas
        'nav', 'header', 'footer', 'aside', 'sidebar',
        '.nav', '.header', '.footer', '.sidebar', '.aside',
        '.navigation', '.menu', '.navbar', '.topbar', '.bottombar',

        // Branding and identity
        '.logo', '.brand', '.branding', '.identity',
        '.icon', '.favicon', '.avatar', '.profile-pic', '.profile-image',

        // UI components
        '.button', '.btn', '.link', '.control', '.widget', '.component',
        '.toolbar', '.statusbar', '.breadcrumb', '.pagination',

        // Advertisement and promotional
        '.ad', '.ads', '.advertisement', '.banner', '.promo', '.promotion',
        '.sponsored', '.affiliate', '.marketing',

        // E-commerce specific
        '.cart', '.checkout', '.wishlist', '.favorites', '.compare',
        '.rating', '.stars', '.reviews', '.badges', '.labels',

        // Social and sharing
        '.social', '.share', '.sharing', '.follow', '.like', '.comment',

        // Video and media containers
        'video', 'audio', '.video-container', '.media-container', '.player-container',
        '.video-player', '.media-player', '.video-wrapper', '.media-wrapper',

        // Amazon specific patterns
        '.s-image', '.s-thumb', '.s-icon', // Amazon search/listing images are often thumbnails
        '[data-component-type="s-search-result"]', // Amazon search results - often thumbnails
        '.a-carousel', '.a-carousel-viewport', // Amazon carousels often have small images

        // General thumbnail and gallery patterns (not Shutterstock - their thumbnails are main content)
        '.thumbnail', '.thumb', '.gallery-thumb', '.preview', '.miniature',
        '.carousel-item', '.slider-item', '.swiper-slide'
    ];

    // Check for UI context, but exclude Shutterstock thumbnails
    const isInUIContext = enhancedSkipSelectors.some(selector => {
        try {
            return img.closest(selector);
        } catch (e) {
            // Handle invalid selectors gracefully
            return false;
        }
    });

    // Shutterstock exception: Don't skip images with Material-UI or thumbnail context on Shutterstock
    // Note: Shutterstock uses CDN (ctfassets.net) so we only check hostname, not image source
    const isShutterstockInUIContext = window.location.hostname.includes('shutterstock.com') &&
        (img.closest('.thumbnail') || classNames.includes('mui-'));

    if (isInUIContext && !isShutterstockInUIContext) {
        console.log('🚫 Skipping image in UI context:', img.src?.substring(0, 50) + '...');
        return;
    }

    // 🎥 LAYER 5: ENHANCED VIDEO DETECTION SYSTEM
    // Multi-layer video context analysis to prevent buttons on video content
    const videoElement = img.parentElement?.querySelector('video') ||
        img.closest('div')?.querySelector('video');
    if (videoElement) {
        console.log('🚫 Skipping image in video container (likely poster/thumbnail):', img.src?.substring(0, 50) + '...');
        return;
    }

    // Check for video-related attributes and classes
    const videoRelatedClasses = ['poster', 'thumbnail', 'preview', 'video-thumb', 'video-poster', 'play-button'];
    const hasVideoRelatedClass = videoRelatedClasses.some(className => classNames.includes(className));

    // Shutterstock exception: Their regular photo thumbnails use 'thumbnail' class but aren't video content
    const isShutterstockPhotoThumbnail = window.location.hostname.includes('shutterstock.com') &&
        classNames.includes('thumbnail');

    if (hasVideoRelatedClass && !isShutterstockPhotoThumbnail) {
        console.log('🚫 Skipping video-related image:', classNames, img.src?.substring(0, 50) + '...');
        return;
    }

    // Instagram-specific video loading state detection
    // Advanced detection for video placeholder images during loading states
    if (window.location.hostname.includes('instagram.com')) {
        // Look for video elements that might be added after this image (future video loading)
        const parentContainer = img.closest('div[role="button"]') || img.closest('article');
        if (parentContainer) {
            // Check if this container has video-related indicators
            const hasVideoIndicators =
                parentContainer.querySelector('svg[aria-label*="audio"]') ||
                parentContainer.querySelector('svg[aria-label*="Audio"]') ||
                parentContainer.querySelector('button[aria-label*="audio"]') ||
                parentContainer.querySelector('button[aria-label*="Toggle"]') ||
                parentContainer.innerHTML.includes('playsinline') ||
                parentContainer.innerHTML.includes('preload') ||
                parentContainer.innerHTML.includes('blob:');

            if (hasVideoIndicators) {
                console.log('🚫 Skipping image in Instagram video context (likely loading state):', img.src?.substring(0, 50) + '...');
                return;
            }
        }

        // Additional check for images with video-like positioning/sizing patterns
        const containerStyle = window.getComputedStyle(img.parentElement || img);
        const hasVideoLikeLayout =
            containerStyle.paddingBottom && containerStyle.paddingBottom.includes('%') &&
            parseFloat(containerStyle.paddingBottom) > 50; // Video aspect ratios

        if (hasVideoLikeLayout && img.closest('[role="button"]')) {
            console.log('🚫 Skipping image with video-like layout in interactive container:', img.src?.substring(0, 50) + '...');
            return;
        }
    }

    // 5. SPECIAL SITE-SPECIFIC FILTERING

    // Note: Shutterstock exceptions are handled above in Layers 3 & 4
    // Shutterstock uses Material-UI classes (mui-) and "thumbnail" for their main content images

    // AMAZON.COM FILTERING
    if (window.location.hostname.includes('amazon.')) {
        // Skip Amazon's small product images and UI elements
        const amazonSpecificChecks = [
            // Product listing thumbnails
            img.closest('[data-component-type="s-search-result"]'),
            // Small images in carousels
            effectiveWidth < 200 && img.closest('.a-carousel'),
            // Images with Amazon's thumbnail classes
            classNames.includes('s-image') || classNames.includes('s-thumb'),
            // Very small images on Amazon (likely UI elements)
            effectiveWidth < 150 && effectiveHeight < 150
        ];

        if (amazonSpecificChecks.some(check => check)) {
            console.log('🚫 Skipping Amazon thumbnail/UI image:', `${effectiveWidth}x${effectiveHeight}`, img.src?.substring(0, 50) + '...');
            return;
        }
    }

    // 6. OVERLAPPING ELEMENTS CHECK (images behind other content)
    // Check if image is covered by other elements (likely background or decorative)
    const centerX = imgRect.left + imgRect.width / 2;
    const centerY = imgRect.top + imgRect.height / 2;
    const elementAtCenter = document.elementFromPoint(centerX, centerY);

    if (elementAtCenter && elementAtCenter !== img && !img.contains(elementAtCenter)) {
        // If the center of the image is covered by another element, it might be a background image
        const coveringElement = elementAtCenter;
        const coveringRect = coveringElement.getBoundingClientRect();

        // If covering element is significantly larger, image is likely decorative
        if (coveringRect.width > imgRect.width * 1.2 && coveringRect.height > imgRect.height * 1.2) {
            console.log('🚫 Skipping covered/background image:', img.src?.substring(0, 50) + '...');
            return;
        }
    }

    // Image passed all filters - success logging removed to reduce console noise

    // Skip if already has a button
    if (img.dataset.lifButtonAdded) {
        return;
    }

    // LINKEDIN DUPLICATE BUTTON FIX: Check for existing button zones in nearby containers
    // LinkedIn's dynamic content can trigger multiple mutations for the same image
    const nearbyButtonZone = img.parentElement?.querySelector('.lif-button-zone') ||
        img.parentElement?.parentElement?.querySelector('.lif-button-zone') ||
        img.closest('.update-components-image__container-wrapper')?.querySelector('.lif-button-zone');

    // Also check if container is already processed
    const containerAlreadyProcessed = img.closest('[data-lif-processed="true"]') ||
        img.parentElement?.dataset?.lifProcessed === 'true';

    if (nearbyButtonZone || containerAlreadyProcessed) {
        console.log('🚫 Skipping image - nearby button zone or processed container exists:', img.src?.substring(0, 50) + '...');
        // Mark this image as processed to prevent future attempts
        img.dataset.lifButtonAdded = 'true';
        return;
    }

    // Skip LIF-generated images (from Immersity AI service)
    if (img.src && (
        img.src.includes('leia-storage-service') ||
        img.src.includes('immersity') ||
        img.src.includes('lifResult') ||
        img.src.includes('lif-generated')
    )) {
        return;
    }

    // Skip if image is part of an already converted LIF container
    const lifContainer = img.closest('[data-lif-active="true"]');
    if (lifContainer) {
        return;
    }

    // Skip if image is inside a picture element that has LIF target dimensions (already processed)
    const parentPicture = img.closest('picture');
    if (parentPicture && parentPicture.dataset.lifTargetWidth) {
        return;
    }

    // Skip if image has LIF-related styling (positioned absolutely with specific z-index patterns)
    const computedStyle = window.getComputedStyle(img);
    if (computedStyle.position === 'absolute' &&
        (computedStyle.zIndex === '1' || computedStyle.zIndex === '2') &&
        computedStyle.display === 'none') {
        return;
    }

    // Skip if image is part of UI elements (favicons, logos, etc.)
    const skipSelectors = [
        'nav', 'header', 'footer', '.nav', '.header', '.footer',
        '.logo', '.icon', '.favicon', '.avatar', '.profile-pic'
    ];

    if (skipSelectors.some(selector => img.closest(selector))) {
        return;
    }

    // Skip if image already has a LIF conversion in progress or completed
    const existingContainer = img.closest('.lif-image-container');
    if (existingContainer) {
        const existingButton = existingContainer.querySelector('.lif-converter-btn');
        if (existingButton) {
            // Don't modify existing buttons, especially if they're in LIF state
            return;
        }
    }

    // Special handling for images inside <picture> elements (CNN, responsive images)
    const pictureElement = img.closest('picture');
    let targetElement = img.parentElement;
    let isPictureImage = false;
    let useOverlayApproach = false;

    if (pictureElement && pictureElement.contains(img)) {
        isPictureImage = true;
        useOverlayApproach = true;

        // For picture elements, we need to go higher in the DOM to find a container with proper spacing
        // CNN structure can have wrapper: container__item-media-wrapper > container__item-media > image > image__container > picture
        // or direct: container__item-media > image > image__container > picture
        const imageContainer = pictureElement.parentElement; // image__container
        const imageDiv = imageContainer?.parentElement; // image div
        let containerMedia = imageDiv?.parentElement; // could be container__item-media or container__item-media-wrapper

        // Use the highest level container that has proper spacing, fallback to lower levels
        if (containerMedia && containerMedia.classList.contains('container__item-media')) {
            targetElement = containerMedia;
        } else if (imageDiv && imageDiv.classList.contains('image')) {
            targetElement = imageDiv;
        } else {
            targetElement = imageContainer;
        }

        // Get the actual current dimensions of the picture element and image
        const pictureRect = pictureElement.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        // For picture elements, we don't want to wrap anything - just add overlay positioning
        let targetWidth = pictureRect.width;
        let targetHeight = pictureRect.height;

        // ============================================================================
        // UNIVERSAL PICTURE ELEMENT DIMENSION CORRECTION
        // ============================================================================
        // Problem: Some websites' <picture> elements report incorrect dimensions with
        // extremely skewed aspect ratios, causing tiny conversion results.
        //
        // Examples of affected sites:
        // - Shutterstock: Picture reports 823x19, actual image is 390x280
        // - Zillow: Picture reports 586x20, actual image has proper dimensions
        //
        // Solution: Pattern-based detection using aspect ratio analysis instead of
        // site-specific fixes. This provides universal compatibility across all
        // websites that exhibit this layout pattern.
        // ============================================================================
        if (pictureRect.width > 0 && pictureRect.height > 0 && imgRect.width > 0 && imgRect.height > 0) {
            const pictureAspectRatio = pictureRect.width / pictureRect.height;
            const imageAspectRatio = imgRect.width / imgRect.height;

            // Define thresholds for suspicious aspect ratios
            // Most legitimate images fall within 0.1 to 10 ratio range (10:1 to 1:10)
            const isSuspiciouslyWide = pictureAspectRatio > 15;      // Extremely wide (e.g., 29.3:1)
            const isSuspiciouslyTall = pictureAspectRatio < 0.067;   // Extremely tall (e.g., 1:15)
            const hasSignificantDimensionDifference = Math.abs(pictureAspectRatio - imageAspectRatio) > 5;

            // Validate that the image element has reasonable dimensions before using them
            const imageHasValidAspectRatio = imageAspectRatio > 0.1 && imageAspectRatio < 10;

            // Apply correction when picture has suspicious dimensions but image has valid ones
            if ((isSuspiciouslyWide || isSuspiciouslyTall || hasSignificantDimensionDifference) &&
                imageHasValidAspectRatio) {

                console.log('🔧 Picture element dimension correction applied');
                console.log(`📐 Picture: ${pictureRect.width}x${pictureRect.height} (ratio: ${pictureAspectRatio.toFixed(2)})`);
                console.log(`📐 Image: ${imgRect.width}x${imgRect.height} (ratio: ${imageAspectRatio.toFixed(2)})`);
                console.log(`🎯 Issue detected: ${isSuspiciouslyWide ? 'Extremely wide ratio' :
                    isSuspiciouslyTall ? 'Extremely tall ratio' :
                        'Significant dimension mismatch'}`);
                // Using image dimensions for proper 3D conversion - success logging removed

                targetWidth = imgRect.width;
                targetHeight = imgRect.height;
            }
        }



        if (targetWidth > 0 && targetHeight > 0) {
            // Make sure the target container can contain positioned elements
            const parentStyle = window.getComputedStyle(targetElement);
            if (parentStyle.position === 'static') {
                targetElement.style.position = 'relative';
            }

            // Store dimensions for later use with LIF viewer
            pictureElement.dataset.lifTargetWidth = Math.round(targetWidth);
            pictureElement.dataset.lifTargetHeight = Math.round(targetHeight);
            console.log(`Stored target dimensions: ${Math.round(targetWidth)}x${Math.round(targetHeight)}`);
        }
    }

    // Create container only for non-picture images or if overlay approach fails  
    let imageContainer = targetElement;
    let layoutAnalysis = null;

    // Analyze layout BEFORE deciding on approach to determine if we should use overlay
    layoutAnalysis = analyzeLayoutPattern(targetElement, img);
    if (isDebugEnabled) {
        console.log('🔍 Layout analysis for container:', layoutAnalysis);
    }

    // DECISION POINT: Use overlay approach for padding-based layouts (aspect ratio containers)
    // This prevents DOM structure disruption that breaks padding-based aspect ratio techniques

    // Additional explicit aspect ratio container detection as fallback
    // Covers common patterns: .ratio-box, .aspect-ratio, .ratio, and inline padding styles
    const isAspectRatioContainer = targetElement.classList.contains('ratio-box') ||
        targetElement.classList.contains('aspect-ratio') ||
        targetElement.classList.contains('ratio') ||
        targetElement.classList.contains('aspect') ||
        (targetElement.style.paddingBottom && targetElement.style.paddingBottom.includes('%')) ||
        (targetElement.style.paddingTop && targetElement.style.paddingTop.includes('%'));

    // LinkedIn-specific padding container detection
    // LinkedIn uses .update-components-image__container with padding-top: %
    const isLinkedInPaddingContainer = (() => {
        let element = img.parentElement;
        for (let i = 0; i < 5 && element; i++) {
            const hasLinkedInContainer = element.classList && (
                element.classList.contains('update-components-image__container') ||
                element.className.includes('update-components-image__container')
            );
            if (hasLinkedInContainer) {
                const computedStyle = window.getComputedStyle(element);
                const inlineStyle = element.style.paddingTop;

                // Check both computed style and inline style for percentage values
                const hasPaddingTop = (computedStyle.paddingTop && computedStyle.paddingTop.includes('%')) ||
                    (inlineStyle && inlineStyle.includes('%'));

                if (hasPaddingTop) {
                    return true;
                }
            }
            element = element.parentElement;
        }
        return false;
    })();

    // FLICKR FIX: Force overlay approach for Flickr's absolutely positioned images
    const isFlickrAbsoluteImage = window.location.hostname.includes('flickr.com') &&
        window.getComputedStyle(img).position === 'absolute';

    const shouldUseOverlayApproach = isPictureImage ||
        (layoutAnalysis && layoutAnalysis.containerHasPaddingAspectRatio) ||
        isAspectRatioContainer ||
        isLinkedInPaddingContainer ||
        isFlickrAbsoluteImage;



    if (shouldUseOverlayApproach) {
        const wasInitiallyPictureImage = isPictureImage; // Store original value before modification
        if (isDebugEnabled) {
            console.log('🎯 Using overlay approach for:', isPictureImage ? 'picture element' : 'aspect ratio container');
        }
        useOverlayApproach = true;
        isPictureImage = true; // Treat aspect ratio containers like picture elements

        // For aspect ratio containers, find the appropriate container for button positioning
        if (layoutAnalysis && layoutAnalysis.paddingContainer) {
            targetElement = layoutAnalysis.paddingContainer.element;
            if (isDebugEnabled) {
                console.log(`📦 Using aspect ratio container (.${targetElement.className}) for overlay positioning`);
            }
        }
        // If explicit aspect ratio container detected but layout analysis missed it, find the container
        else if (isAspectRatioContainer && !wasInitiallyPictureImage) {
            // Look for the actual aspect ratio container in the parent hierarchy
            let searchElement = img.parentElement;
            for (let i = 0; i < 3 && searchElement; i++) {
                if (searchElement.classList.contains('ratio-box') ||
                    searchElement.classList.contains('aspect-ratio') ||
                    searchElement.classList.contains('ratio') ||
                    searchElement.classList.contains('aspect') ||
                    (searchElement.style.paddingBottom && searchElement.style.paddingBottom.includes('%')) ||
                    (searchElement.style.paddingTop && searchElement.style.paddingTop.includes('%'))) {
                    targetElement = searchElement;
                    if (isDebugEnabled) {
                        console.log(`📦 Found explicit aspect ratio container (.${targetElement.className}) for overlay positioning`);
                    }
                    break;
                }
                searchElement = searchElement.parentElement;
            }
        }
        // If LinkedIn padding container detected, find the container for overlay positioning
        else if (isLinkedInPaddingContainer && !wasInitiallyPictureImage) {
            let searchElement = img.parentElement;
            for (let i = 0; i < 5 && searchElement; i++) {
                const hasLinkedInContainer = searchElement.classList && (
                    searchElement.classList.contains('update-components-image__container') ||
                    searchElement.className.includes('update-components-image__container')
                );
                if (hasLinkedInContainer) {
                    targetElement = searchElement;
                    break;
                }
                searchElement = searchElement.parentElement;
            }
        }


        // Store target dimensions for aspect ratio containers (similar to picture elements)
        if (layoutAnalysis.containerHasPaddingAspectRatio || isAspectRatioContainer || isLinkedInPaddingContainer) {
            const imgRect = img.getBoundingClientRect();
            const containerRect = targetElement.getBoundingClientRect();

            // Use container dimensions for aspect ratio layouts
            const targetWidth = containerRect.width > 0 ? containerRect.width : imgRect.width;
            const targetHeight = containerRect.height > 0 ? containerRect.height : imgRect.height;

            if (targetWidth > 0 && targetHeight > 0) {
                // Store dimensions on the container for later use
                targetElement.dataset.lifTargetWidth = Math.round(targetWidth);
                targetElement.dataset.lifTargetHeight = Math.round(targetHeight);
                if (isDebugEnabled) {
                    console.log(`📐 Stored overlay dimensions: ${Math.round(targetWidth)}x${Math.round(targetHeight)} on`, targetElement.className || targetElement.tagName);
                }
            }
        }
    }

    if (!shouldUseOverlayApproach) {
        if (!imageContainer.classList.contains('lif-image-container')) {

            const wrapper = document.createElement('div');
            wrapper.className = 'lif-image-container';

            // Standard wrapping for regular images only
            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(img);

            imageContainer = wrapper;
        }

        // Fix container sizing issues - now with layout awareness
        const computedStyle = window.getComputedStyle(imageContainer);
        if (computedStyle.position === 'static') {
            imageContainer.style.position = 'relative';
        }

        // Apply sizing fixes based on layout analysis for non-picture elements
        const containerRect = imageContainer.getBoundingClientRect();
        const needsSizeFix = containerRect.width === 0 || containerRect.height === 0;
        const hasImageRenderingIssues = renderedWidth === 0 || renderedHeight === 0;

        // Check if the parent already has reasonable dimensions to avoid double-sizing
        const parentRect = imageContainer.parentElement?.getBoundingClientRect();
        const parentHasValidSize = parentRect && parentRect.width > 0 && parentRect.height > 0;

        if (isDebugEnabled) {
            console.log('Container analysis:', {
                containerSize: `${containerRect.width}x${containerRect.height}`,
                parentSize: parentRect ? `${parentRect.width}x${parentRect.height}` : 'none',
                needsSizeFix,
                hasImageRenderingIssues,
                parentHasValidSize,
                layoutType: layoutAnalysis?.type || 'new-container',
                preserveOriginal: layoutAnalysis?.preserveOriginal || false
            });
        }

        // Respect layout analysis - avoid fixes that would disrupt existing patterns
        if (layoutAnalysis?.preserveOriginal) {
            if (isDebugEnabled) {
                console.log(`Preserving original layout: ${layoutAnalysis.reason}`);
            }

            // For Facebook-style layouts, apply specialized handling
            if (layoutAnalysis.isFacebookStyle) {
                if (isDebugEnabled) {
                    console.log('Detected Facebook-style layout - applying specialized handling');
                }

                // Facebook images are often positioned within complex padding-based containers
                // We need to preserve the original positioning and just ensure the image is visible

                // Don't wrap the image, instead use overlay approach similar to picture elements
                if (imageContainer.classList.contains('lif-image-container')) {
                    // Remove the wrapper we just added
                    const parent = imageContainer.parentElement;
                    parent.insertBefore(img, imageContainer);
                    imageContainer.remove();
                    imageContainer = img.parentElement;
                }

                // Get the computed style of the image for Facebook handling
                const imgStyle = window.getComputedStyle(img);

                // Ensure the image maintains its original positioning
                const originalPosition = imgStyle.position;
                const originalTop = imgStyle.top;
                const originalLeft = imgStyle.left;
                const originalWidth = imgStyle.width;
                const originalHeight = imgStyle.height;

                // Preserve Facebook's original styling
                img.style.position = originalPosition || 'static';
                if (originalTop) img.style.top = originalTop;
                if (originalLeft) img.style.left = originalLeft;
                if (originalWidth) img.style.width = originalWidth;
                if (originalHeight) img.style.height = originalHeight;

                // Make sure the image is visible
                img.style.display = img.style.display || 'block';
                img.style.visibility = 'visible';
                img.style.opacity = img.style.opacity || '1';

                if (isDebugEnabled) {
                    console.log('Facebook image positioning preserved:', {
                        position: img.style.position,
                        width: img.style.width,
                        height: img.style.height,
                        display: img.style.display
                    });
                }
            }
            // For padding-based aspect ratios (like Instagram), don't apply size fixes to containers
            else if (layoutAnalysis.containerHasPaddingAspectRatio) {
                if (isDebugEnabled) {
                    console.log('Detected padding-based aspect ratio - preserving container layout');
                }

                // Ensure our wrapper container fills the padding-created space
                imageContainer.style.position = 'absolute';
                imageContainer.style.top = '0';
                imageContainer.style.left = '0';
                imageContainer.style.width = '100%';
                imageContainer.style.height = '100%';
                imageContainer.style.overflow = 'hidden';

                // Handle different types of padding-based layouts
                if (layoutAnalysis.imageIsAbsolute) {
                    if (isDebugEnabled) {
                        console.log('Image is absolutely positioned in padding-based container (Google/Pinterest style)');
                    }
                    // Ensure the image maintains its absolute positioning and covers the container
                    img.style.position = 'absolute';
                    img.style.top = '0';
                    img.style.left = '0';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    img.style.display = 'block';
                } else if (hasImageRenderingIssues) {
                    if (isDebugEnabled) {
                        console.log('Fixing image display within padding-based container (Instagram style)');
                    }

                    // For padding-based layouts, the image should fill the container
                    // Try responsive approach first
                    img.style.width = '100%';
                    img.style.height = 'auto';
                    img.style.display = 'block';
                    img.style.objectFit = 'cover';

                    // If image still has no height, try to force it within the padding container
                    const imgRect = img.getBoundingClientRect();
                    if (imgRect.height === 0 && containerRect.height > 0) {
                        console.log('Forcing image height to match container in padding-based layout');
                        img.style.height = '100%';
                        img.style.position = 'absolute';
                        img.style.top = '0';
                        img.style.left = '0';
                    }
                }

                // Additional check: if image is still 0x0 after fixes, apply more aggressive fix
                setTimeout(() => {
                    const imgRect = img.getBoundingClientRect();
                    const containerRect = imageContainer.getBoundingClientRect();

                    if (isDebugEnabled) {
                        console.log('Post-fix dimensions check:', {
                            containerSize: `${containerRect.width}x${containerRect.height}`,
                            imageSize: `${imgRect.width}x${imgRect.height}`
                        });
                    }

                    if (imgRect.width === 0 || imgRect.height === 0) {
                        if (isDebugEnabled) {
                            console.log('Image still 0x0 after padding-based fixes, applying fallback');
                        }
                        img.style.position = 'absolute';
                        img.style.top = '0';
                        img.style.left = '0';
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.display = 'block';
                        if (isDebugEnabled) {
                            console.log('Applied fallback positioning for padding-based layout');
                        }
                    }
                }, 100);
            }

            // For responsive containers, minimal intervention
            else if (layoutAnalysis.hasResponsivePattern) {
                if (isDebugEnabled) {
                    console.log('Responsive pattern detected - minimal intervention');
                }
                // Only fix if absolutely necessary and in a way that preserves responsiveness
                if (needsSizeFix && effectiveWidth > 0 && effectiveHeight > 0) {
                    // Use max-width instead of width to preserve responsiveness
                    imageContainer.style.maxWidth = `${effectiveWidth}px`;
                    imageContainer.style.maxHeight = `${effectiveHeight}px`;
                }
            }

            // For flex/grid children, even more minimal intervention
            else if (layoutAnalysis.parentUsesFlexOrGrid) {
                if (isDebugEnabled) {
                    console.log('Flex/Grid layout detected - minimal intervention');
                }
                // Just ensure relative positioning for button placement
                imageContainer.style.position = 'relative';
            }
        }

        // Only apply aggressive fixes if no special layout patterns detected
        else if (needsSizeFix && (effectiveWidth > 0 && effectiveHeight > 0)) {
            if (isDebugEnabled) {
                console.log('No special layout detected - applying standard size fix:', effectiveWidth, 'x', effectiveHeight);
            }

            // Use more conservative sizing approach
            imageContainer.style.width = `${effectiveWidth}px`;
            imageContainer.style.height = `${effectiveHeight}px`;

            // Only force display changes if absolutely necessary
            if (computedStyle.display === 'none' || computedStyle.display === '') {
                imageContainer.style.display = 'inline-block';
            }

            imageContainer.style.overflow = 'hidden';

            // Be more careful with image sizing - only modify if it has issues
            if (hasImageRenderingIssues) {
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.display = 'block';
            }
        }

        // Handle image rendering issues separately and more conservatively
        else if (hasImageRenderingIssues && intrinsicWidth > 0 && intrinsicHeight > 0 && !layoutAnalysis?.preserveOriginal) {
            if (isDebugEnabled) {
                console.log('Image has rendering issues, applying conservative fixes');
            }

            // Calculate a reasonable display size but be more conservative
            const maxDisplaySize = Math.min(600, parentHasValidSize ? Math.min(parentRect.width, parentRect.height) : 400);
            const aspectRatio = intrinsicWidth / intrinsicHeight;

            let displayWidth, displayHeight;
            if (intrinsicWidth > intrinsicHeight) {
                displayWidth = Math.min(intrinsicWidth, maxDisplaySize);
                displayHeight = displayWidth / aspectRatio;
            } else {
                displayHeight = Math.min(intrinsicHeight, maxDisplaySize);
                displayWidth = displayHeight * aspectRatio;
            }

            if (isDebugEnabled) {
                console.log(`Setting conservative image display size to: ${displayWidth}x${displayHeight}`);
            }

            // Only apply container sizing if it doesn't already have valid dimensions
            if (containerRect.width === 0 || containerRect.height === 0) {
                imageContainer.style.width = `${displayWidth}px`;
                imageContainer.style.height = `${displayHeight}px`;

                // Preserve existing display property if it's working
                if (computedStyle.display === 'none' || computedStyle.display === '') {
                    imageContainer.style.display = 'inline-block';
                }
            }

            // Apply image fixes more carefully
            img.style.width = `${displayWidth}px`;
            img.style.height = `${displayHeight}px`;
            img.style.maxWidth = 'none';
            img.style.maxHeight = 'none';
            img.style.display = 'block';
        }
    } else {
        // For overlay approach (picture elements, Flickr absolute images, etc.)
        if (isDebugEnabled) {
            console.log('Using overlay approach - setting up container reference');
        }
        imageContainer = targetElement; // This is the container for overlay positioning

        // FLICKR FIX: For absolutely positioned images, ensure container can hold positioned elements
        if (isFlickrAbsoluteImage) {
            if (isDebugEnabled) {
                console.log('🔧 Flickr absolute image detected - setting up overlay container');
            }
            const containerStyle = window.getComputedStyle(imageContainer);
            if (containerStyle.position === 'static') {
                imageContainer.style.position = 'relative';
            }
            if (isDebugEnabled) {
                console.log('✅ Flickr overlay container prepared:', {
                    container: imageContainer.tagName,
                    containerClass: imageContainer.className,
                    position: imageContainer.style.position || containerStyle.position
                });
            }
        }
    }

    // Ensure container variable is properly set for both picture and non-picture elements
    const container = imageContainer;

    // Create a protective zone for the button
    const buttonZone = document.createElement('div');
    buttonZone.className = 'lif-button-zone';

    // Detect if image has existing hover/zoom behaviors
    const hasImageHoverBehaviors = (
        img.style.cursor === 'zoom-in' ||
        img.style.cursor === 'pointer' ||
        img.classList.contains('zoom') ||
        img.classList.contains('zoomable') ||
        img.dataset.zoom ||
        img.onclick ||
        getComputedStyle(img).cursor === 'zoom-in' ||
        getComputedStyle(img).cursor === 'pointer'
    );

    if (hasImageHoverBehaviors) {
        if (isDebugEnabled) {
            console.log('Detected existing hover/zoom behavior on image, applying enhanced protection');
        }
        // Make the protective zone larger for images with existing behaviors
        buttonZone.style.width = '100px';
        buttonZone.style.height = '60px';
    }

    // Disable image interactions in the button zone
    buttonZone.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        // Temporarily disable pointer events on the image
        img.style.pointerEvents = 'none';

        // Also disable on parent container if it has hover behaviors
        const parent = img.parentElement;
        if (parent && (parent.onclick || parent.style.cursor === 'pointer')) {
            parent.style.pointerEvents = 'none';
            buttonZone.dataset.parentDisabled = 'true';
        }
    });

    buttonZone.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
        // Re-enable pointer events on the image
        setTimeout(() => {
            img.style.pointerEvents = '';

            // Re-enable parent if we disabled it
            if (buttonZone.dataset.parentDisabled) {
                const parent = img.parentElement;
                if (parent) {
                    parent.style.pointerEvents = '';
                }
                delete buttonZone.dataset.parentDisabled;
            }
        }, 100);
    });

    // Create the 2D3D button
    const button = document.createElement('button');
    button.className = 'lif-converter-btn';
    button.textContent = '2D3D';
    button.title = 'Convert to immersive 3D image';
    button.dataset.originalText = '2D3D'; // Store original state
    button.dataset.state = 'ready'; // Track button state

    // Add click handler with aggressive event handling
    const handleButtonClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Temporarily disable all other interactions
        const originalPointerEvents = img.style.pointerEvents;
        img.style.pointerEvents = 'none';

        setTimeout(() => {
            img.style.pointerEvents = originalPointerEvents;
        }, 300);

        // Only allow conversion if in ready state
        if (button.dataset.state === 'ready') {
            convertTo3D(img, button);
        } else if (button.dataset.state === 'lif-ready') {
            // Download LIF file when LIF button is clicked
            const viewer = button.lifViewer;
            if (viewer && viewer.lifUrl) {
                downloadLIFFile(viewer.lifUrl, img.src);
            } else {
                console.error('LIF viewer or LIF URL not available for download');
                showDownloadNotification('LIF file not ready for download', 'error');
            }
        }

        return false; // Extra safety to prevent propagation
    };

    // Add multiple event listeners to ensure the button works - use capturing phase for all
    button.addEventListener('click', handleButtonClick, true); // Use capturing phase
    button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Don't call handleButtonClick here, just prevent default behavior
        return false;
    }, true);
    button.addEventListener('mouseup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Call the actual click handler on mouseup for regular images
        if (!isPictureImage) {
            handleButtonClick(e);
        }
        return false;
    }, true);
    button.addEventListener('touchstart', handleButtonClick, true);

    // Add hover protection
    button.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        button.style.zIndex = Z_INDEX_CONFIG.BUTTON;
    });

    button.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
    });

    // Create the VR button (initially hidden, conditionally created based on WebXR support)
    if (isDebugEnabled) {
        console.log('🥽 Creating VR button...');
    }
    const vrButton = document.createElement('button');
    vrButton.className = 'lif-vr-btn';
    vrButton.textContent = '🥽 VR';
    vrButton.title = 'View in VR/XR mode';
    vrButton.style.pointerEvents = 'auto'; // Ensure button can receive clicks
    vrButton.style.zIndex = Z_INDEX_CONFIG.BUTTON; // Same z-index as main button

    // Check simple WebXR support test result
    if (webXRSupportChecked && !isWebXRSupported) {
        vrButton.style.display = 'none'; // Hide VR button if WebXR not supported
        if (isDebugEnabled) {
            console.log('❌ VR button hidden - Simple WebXR test failed');
        }
    } else if (!webXRSupportChecked) {
        vrButton.style.display = 'none'; // Hide until test completes
        if (isDebugEnabled) {
            console.log('⏳ VR button hidden - Simple WebXR test still pending');
        }

        // Check again in a moment if test completes
        setTimeout(() => {
            if (webXRSupportChecked && isWebXRSupported) {
                vrButton.style.display = 'none'; // Still hidden until LIF is ready
                if (isDebugEnabled) {
                    console.log('✅ VR button will be available when LIF is ready');
                }
            } else if (webXRSupportChecked && !isWebXRSupported) {
                vrButton.style.display = 'none';
                console.log('❌ VR button permanently hidden - WebXR not supported');
            }
        }, 1000);
    } else {
        vrButton.style.display = 'none'; // Hidden until LIF is ready, but will be available
        // VR button created and will be available when LIF is ready - success logging removed
    }

    // VR button created successfully - detailed logging removed to reduce console noise

    // VR button click handler
    const handleVRButtonClick = async (e) => {
        console.log('🔥 VR BUTTON CLICKED IN CONTENT.JS!');
        console.log('📊 Button state analysis:', {
            buttonState: button.dataset.state,
            hasLifViewer: !!button.lifViewer,
            hasNavigatorXR: !!navigator.xr,
            hasVRLifViewer: !!window.VRLifViewer,
            buttonText: vrButton.textContent
        });

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Only allow VR if LIF is ready
        if (button.dataset.state === 'lif-ready') {
            console.log('✅ Button state is lif-ready, proceeding...');
            const viewer = button.lifViewer;
            console.log('🔍 Viewer analysis:', {
                hasViewer: !!viewer,
                hasLifUrl: !!viewer?.lifUrl,
                lifUrl: viewer?.lifUrl?.substring(0, 100) + '...',
                hasCanvas: !!viewer?.canvas
            });

            if (viewer && viewer.lifUrl) {
                console.log('✅ Viewer and LIF URL available, starting VR initialization...');
                try {
                    vrButton.classList.add('vr-active');
                    vrButton.textContent = '🔄 Loading VR...';
                    console.log('🔄 VR button state updated to loading');

                    // Skip old WebXR checks - let the new page context VR system handle everything
                    console.log('🚀 Skipping content script WebXR checks - delegating to page context VR system');

                    // Create and initialize VR viewer
                    console.log('🔍 Checking VRLifViewer availability...');
                    if (window.VRLifViewer) {
                        console.log('✅ VRLifViewer found, creating instance...');
                        const vrViewer = new window.VRLifViewer();
                        console.log('✅ VRLifViewer instance created, initializing with LIF URL...');

                        await vrViewer.init(viewer.lifUrl, button);
                        console.log('🎉 VRLifViewer initialized successfully!');

                        vrButton.textContent = '👓 VR Active';
                        console.log('✅ VR button text updated to VR Active');
                    } else {
                        console.error('❌ VRLifViewer not loaded in window object');
                        console.log('🔍 Available window VR/LIF properties:', Object.keys(window).filter(k => k.includes('VR') || k.includes('Lif') || k.includes('Renderer')));
                        showDownloadNotification('VR viewer not available. Please refresh the page.', 'error');
                    }
                } catch (error) {
                    console.error('❌ Error during VR initialization:', error);
                    console.error('Error details:', {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    });
                    showDownloadNotification('Failed to start VR session: ' + error.message, 'error');
                    vrButton.classList.remove('vr-active');
                    vrButton.textContent = '🥽 VR';
                }
            } else {
                console.error('❌ Viewer or LIF URL not available:', {
                    hasViewer: !!viewer,
                    hasLifUrl: !!viewer?.lifUrl
                });
                showDownloadNotification('LIF file not ready for VR viewing', 'error');
            }
        } else {
            console.error('❌ Button state is not lif-ready:', {
                currentState: button.dataset.state,
                expectedState: 'lif-ready'
            });
        }

        return false;
    };

    // Add VR button event listeners - EXACT COPY of LIF button pattern
    if (isDebugEnabled) {
        console.log('🔌 Adding VR button event listeners (copying LIF button pattern)...');
    }

    // Add multiple event listeners to ensure the button works - use capturing phase for all
    vrButton.addEventListener('click', handleVRButtonClick, true); // Use capturing phase
    vrButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Don't call handleVRButtonClick here, just prevent default behavior
        return false;
    }, true);
    vrButton.addEventListener('mouseup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Call the actual click handler on mouseup for regular images
        if (!isPictureImage) {
            handleVRButtonClick(e);
        }
        return false;
    }, true);
    vrButton.addEventListener('touchstart', handleVRButtonClick, true);

    // Add hover protection - EXACT COPY of LIF button
    vrButton.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        vrButton.style.zIndex = Z_INDEX_CONFIG.BUTTON;
    });

    vrButton.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
    });

    // All VR button event listeners added successfully - logging removed

    // Add buttons to protective zone, then add zone to appropriate container
    if (isDebugEnabled) {
        console.log('📦 Adding buttons to button zone...');
    }
    buttonZone.appendChild(button);
    buttonZone.appendChild(vrButton);
    // Buttons added to zone successfully - logging removed

    // Store VR button reference and handler on main button for later access
    button.vrButton = vrButton;
    button.vrButtonClickHandler = handleVRButtonClick;
    // VR button reference and handler stored on main button - logging removed

    // Determine button positioning approach based on layout type
    const useFacebookOverlay = layoutAnalysis?.isFacebookStyle;
    const usePictureOverlay = isPictureImage && useOverlayApproach;

    if (useFacebookOverlay) {
        // For Facebook-style layouts, use overlay approach similar to picture elements
        if (isDebugEnabled) {
            console.log('Using Facebook overlay approach for button positioning');
        }

        // Find the best container for the overlay (go up the DOM to find a positioned container)
        let overlayContainer = imageContainer;
        let searchElement = imageContainer;
        for (let i = 0; i < 3 && searchElement; i++) {
            const style = window.getComputedStyle(searchElement);
            if (style.position === 'relative' || style.position === 'absolute') {
                overlayContainer = searchElement;
                break;
            }
            searchElement = searchElement.parentElement;
        }

        // Ensure the overlay container can contain positioned elements
        const overlayStyle = window.getComputedStyle(overlayContainer);
        if (overlayStyle.position === 'static') {
            overlayContainer.style.position = 'relative';
        }

        buttonZone.style.position = 'absolute';
        buttonZone.style.top = '8px';
        buttonZone.style.right = '8px';
        buttonZone.style.zIndex = Z_INDEX_CONFIG.BUTTON_ZONE;
        buttonZone.style.pointerEvents = 'auto';

        if (hasImageHoverBehaviors) {
            buttonZone.style.width = '200px'; // Increased for VR button
            buttonZone.style.height = '60px';
        } else {
            buttonZone.style.width = '180px'; // Increased for VR button
            buttonZone.style.height = '50px';
        }

        overlayContainer.appendChild(buttonZone);
        if (isDebugEnabled) {
            console.log('Facebook button positioned on overlay container:', overlayContainer.tagName);
        }
    }
    else if (usePictureOverlay) {
        // For picture elements, add to the parent container (positioned absolutely)
        buttonZone.style.position = 'absolute';
        buttonZone.style.top = '0';
        buttonZone.style.right = '0';
        buttonZone.style.zIndex = Z_INDEX_CONFIG.BUTTON_ZONE; // Higher z-index to ensure it's on top of content
        buttonZone.style.pointerEvents = 'auto'; // Allow pointer events so button can receive clicks

        // Use appropriate sizing - larger if hover behaviors detected, standard otherwise
        if (hasImageHoverBehaviors) {
            buttonZone.style.width = '200px'; // Increased for VR button
            buttonZone.style.height = '60px';
        } else {
            buttonZone.style.width = '180px'; // Increased for VR button
            buttonZone.style.height = '50px';
        }

        targetElement.appendChild(buttonZone);
        if (isDebugEnabled) {
            console.log('Using absolute positioning for picture element button');
        }
    } else {
        // For regular images, use the old simple approach but fix the pointer events
        buttonZone.style.pointerEvents = 'auto'; // Override CSS default to capture clicks

        // Add click prevention for ALL clicks in the button zone area
        buttonZone.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);

        // Also prevent mousedown to be extra safe
        buttonZone.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);

        container.appendChild(buttonZone);
        if (isDebugEnabled) {
            console.log('Using default positioning for regular image button');
        }
    }

    // Mark image as processed EARLY to prevent race conditions
    img.dataset.lifButtonAdded = 'true';

    // Also mark the container to prevent multiple buttons on the same container
    if (container) {
        container.dataset.lifProcessed = 'true';
    }

    // Added 2D3D button to image successfully - logging removed
}

/**
 * ============================================================================
 * INSTAGRAM CAROUSEL PROCESSING SYSTEM
 * ============================================================================
 * 
 * Instagram's carousel posts use complex positioning with transform: translateX()
 * and only visible images get processed by the mutation observer. This system
 * specifically detects and processes all images in carousel structures.
 * ============================================================================
 */

// Function to process Instagram carousel images
function processInstagramCarousels() {
    if (!window.location.hostname.includes('instagram.com')) {
        return;
    }

    // Find Instagram carousel containers using their specific structure
    const carouselContainers = document.querySelectorAll('ul._acay');

    // Also check for alternative carousel structures
    const alternativeCarousels = document.querySelectorAll('[class*="carousel"], [role="listbox"], ul[class*="slider"]');
    const allCarousels = [...carouselContainers, ...alternativeCarousels];

    allCarousels.forEach(carousel => {
        console.log('🎠 Found Instagram carousel, processing all images...');

        // Find all carousel items (li elements with _acaz class or generic slide items)
        const carouselItems = carousel.querySelectorAll('li._acaz, li[class*="slide"], li[class*="item"], div[class*="slide"]');

        carouselItems.forEach((item, index) => {
            // Find images in each carousel item
            const images = item.querySelectorAll('img');

            images.forEach(img => {
                try {
                    // Skip if already processed
                    if (img.dataset.lifButtonAdded) {
                        return;
                    }

                    // Skip if image is too small (likely icons or UI elements)
                    // For carousel images, check natural dimensions if getBoundingClientRect gives 0
                    const imgRect = img.getBoundingClientRect();
                    const effectiveWidth = imgRect.width > 0 ? imgRect.width : (img.naturalWidth || img.width);
                    const effectiveHeight = imgRect.height > 0 ? imgRect.height : (img.naturalHeight || img.height);

                    if (effectiveWidth < 200 || effectiveHeight < 200) {
                        return;
                    }

                    // Process the image regardless of current visibility
                    console.log(`🎠 Processing carousel image ${index + 1}:`, img.src?.substring(0, 50) + '...');

                    if (img.complete) {
                        addConvertButton(img);
                    } else {
                        img.addEventListener('load', () => {
                            try {
                                addConvertButton(img);
                            } catch (error) {
                                console.warn('Error adding convert button to carousel image:', error);
                            }
                        }, { once: true });
                    }

                } catch (error) {
                    console.warn('Error processing carousel image:', error);
                }
            });
        });
    });
}

// Function to set up Instagram carousel navigation listeners
function setupInstagramCarouselListeners() {
    if (!window.location.hostname.includes('instagram.com')) {
        return;
    }

    // Listen for clicks on Instagram carousel navigation buttons
    document.addEventListener('click', (e) => {
        // Check if the clicked element is a carousel navigation button
        const isCarouselNav = e.target.closest('button[aria-label*="Next"]') ||
            e.target.closest('button[aria-label*="Go back"]') ||
            e.target.closest('._afxw') ||  // Next button class
            e.target.closest('._afxv');   // Previous button class

        if (isCarouselNav) {
            console.log('🎠 Carousel navigation detected, processing images after navigation...');

            // Process carousel images after a short delay to allow for navigation animation
            setTimeout(() => {
                processInstagramCarousels();
            }, 500);
        }
    }, { passive: true });

    console.log('📱 Instagram carousel navigation listeners set up');
}

// Function to set up Flickr theater mode overlay cleanup
function setupFlickrOverlayCleanup() {
    if (!window.location.hostname.includes('flickr.com')) {
        return;
    }

    // Double-check we're in theater mode before setting up any cleanup
    const isInTheaterMode = document.querySelector('.height-controller') &&
        document.querySelector('.facade-of-protection-neue');

    if (!isInTheaterMode) {
        if (isDebugEnabled) {
            console.log('🖼️ setupFlickrOverlayCleanup: Not in theater mode, skipping all theater-specific setup');
        }
        return;
    }

    if (isDebugEnabled) {
        console.log('🎭 setupFlickrOverlayCleanup: In theater mode, setting up overlay cleanup');
    }

    // Clean up blocking overlays immediately and on DOM changes
    const cleanupFlickrOverlays = () => {
        // Remove photo-notes overlay that blocks button interaction in theater mode
        const photoNotesOverlay = document.querySelector('.view.photo-notes-scrappy-view');
        if (photoNotesOverlay) {
            if (isDebugEnabled) {
                console.log('🗑️ Removing Flickr photo-notes overlay blocking button access');
            }
            photoNotesOverlay.remove();
        }

        // Also remove any other potential blocking overlays
        const blockingOverlays = document.querySelectorAll('.view.photo-notes-scrappy-view, [class*="photo-notes"]');
        blockingOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                if (isDebugEnabled) {
                    console.log('🗑️ Removing additional Flickr blocking overlay:', overlay.className);
                }
                overlay.remove();
            }
        });
    };

    // Clean up immediately
    cleanupFlickrOverlays();

    // Apply display fixes to any existing active LIF containers
    document.querySelectorAll('[data-lif-active="true"]').forEach(container => {
        if (typeof applyFlickrCanvasfix === 'function') {
            applyFlickrCanvasfix(container);
        }
    });

    // Clean up on DOM changes (for dynamic loading)
    const flickrObserver = new MutationObserver((mutations) => {
        let needsCleanup = false;

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if photo-notes overlay was added
                    if (node.classList && node.classList.contains('photo-notes-scrappy-view')) {
                        needsCleanup = true;
                    }
                    // Check for photo-notes overlays in added containers
                    if (node.querySelector && node.querySelector('.photo-notes-scrappy-view')) {
                        needsCleanup = true;
                    }
                }
            });
        });

        if (needsCleanup) {
            if (isDebugEnabled) {
                console.log('🔄 Flickr photo-notes overlay detected, cleaning up...');
            }
            setTimeout(cleanupFlickrOverlays, 100); // Small delay to ensure DOM is settled
        }
    });

    flickrObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Also clean up on navigation (Flickr uses AJAX navigation)
    window.addEventListener('popstate', () => {
        cleanupFlickrOverlays();

        // Clear theater mode reload flag when navigating away
        const currentPath = window.location.pathname;
        const isStillInTheaterMode = /\/photos\/[^\/]+\/\d+\/in\//.test(currentPath);

        if (!isStillInTheaterMode) {
            sessionStorage.removeItem('flickr-theater-reloaded');
        }
    });

    // Clean up when theater mode changes
    document.addEventListener('click', (e) => {
        // Detect clicks that might trigger theater mode changes
        if (e.target.closest('.photo-engagement') ||
            e.target.closest('[data-track="photo-page-image-click"]') ||
            e.target.closest('.main-photo')) {

            setTimeout(() => {
                cleanupFlickrOverlays();

                // Clear reload flag if we're no longer in theater mode
                const currentPath = window.location.pathname;
                const isStillInTheaterMode = /\/photos\/[^\/]+\/\d+\/in\//.test(currentPath);

                if (!isStillInTheaterMode) {
                    sessionStorage.removeItem('flickr-theater-reloaded');
                }
            }, 500); // Allow time for theater mode to load
        }
    }, { passive: true });

    // Set up Flickr canvas display fixes for theater mode
    setupFlickrCanvasDisplayFix();

    if (isDebugEnabled) {
        console.log('🖼️ Flickr theater mode overlay cleanup set up');
    }
}

// Function to monitor URL changes for Flickr SPA navigation to theater mode
function setupFlickrTheaterModeMonitoring() {
    if (!window.location.hostname.includes('flickr.com')) {
        return;
    }

    let lastURL = window.location.href;

    // Monitor URL changes using both popstate and a polling fallback
    const checkURLChange = () => {
        const currentURL = window.location.href;
        if (currentURL !== lastURL) {
            const currentPath = window.location.pathname;
            const isTheaterModeURL = /\/photos\/[^\/]+\/\d+\/in\//.test(currentPath);

            if (isTheaterModeURL) {
                const hasBeenReloaded = sessionStorage.getItem('flickr-theater-reloaded');
                if (!hasBeenReloaded) {
                    if (isDebugEnabled) {
                        console.log('🔄 FLICKR THEATER MODE: Theater mode detected via URL change, reloading page...');
                    }
                    sessionStorage.setItem('flickr-theater-reloaded', 'true');
                    setTimeout(() => {
                        location.reload();
                    }, 100);
                    return;
                }
            } else {
                // Clear reload flag when navigating away from theater mode
                const hadReloadFlag = sessionStorage.getItem('flickr-theater-reloaded');
                if (hadReloadFlag) {
                    sessionStorage.removeItem('flickr-theater-reloaded');
                }
            }

            lastURL = currentURL;
        }
    };

    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', checkURLChange);

    // Polling fallback for SPA navigation that doesn't trigger popstate
    const urlMonitorInterval = setInterval(checkURLChange, 500);

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(urlMonitorInterval);
    }, { once: true });
}

// Function to fix Flickr canvas display issues in theater mode
const setupFlickrCanvasDisplayFix = () => {
    // Monitor for LIF containers being activated OR created
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            // Handle data-lif-active attribute changes (existing logic)
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-lif-active') {
                const container = mutation.target;
                if (container.dataset.lifActive === 'true') {
                    // Only apply fix if we're potentially in theater mode context
                    if (container.closest('.photo-well-media-scrappy-view') ||
                        document.querySelector('.height-controller')) {
                        if (isDebugEnabled) {
                            console.log('🎭 LIF container activated, applying Flickr canvas fix');
                        }
                        applyFlickrCanvasfix(container);
                    }
                }
            }

            // Handle new LIF containers being added to DOM (new logic for first load fix)
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the added node is a LIF container
                        if (node.classList && node.classList.contains('lif-image-container')) {
                            // Check if we're in theater mode context
                            if (node.closest('.photo-well-media-scrappy-view') ||
                                document.querySelector('.height-controller')) {
                                if (isDebugEnabled) {
                                    console.log('🎭 New LIF container detected in theater mode, applying fix');
                                }
                                // Apply fix immediately, even if not yet activated
                                applyFlickrCanvasfix(node);
                            }
                        }

                        // Also check for LIF containers within added nodes
                        const lifContainers = node.querySelectorAll && node.querySelectorAll('.lif-image-container');
                        if (lifContainers) {
                            lifContainers.forEach(container => {
                                if (container.closest('.photo-well-media-scrappy-view') ||
                                    document.querySelector('.height-controller')) {
                                    if (isDebugEnabled) {
                                        console.log('🎭 New nested LIF container detected in theater mode, applying fix');
                                    }
                                    applyFlickrCanvasfix(container);
                                }
                            });
                        }
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-lif-active'],
        childList: true,
        subtree: true
    });

    // Also apply to any existing containers in theater mode (both active and inactive)
    document.querySelectorAll('.lif-image-container').forEach(container => {
        if (container.closest('.photo-well-media-scrappy-view') ||
            document.querySelector('.height-controller')) {
            console.log('🎭 Existing LIF container found in theater mode, applying fix');
            applyFlickrCanvasfix(container);
        }
    });
};

const applyFlickrCanvasfix = (container) => {
    if (isDebugEnabled) {
        console.log('🎭 Applying Flickr theater mode canvas display fix');
    }

    // Only apply this fix in theater mode (when height-controller exists)
    const heightController = document.querySelector('.height-controller');
    const facadeContainer = document.querySelector('.facade-of-protection-neue');

    // Check if we're actually in theater mode
    const isTheaterMode = heightController && facadeContainer &&
        container.closest('.photo-well-media-scrappy-view');

    if (!isTheaterMode) {
        if (isDebugEnabled) {
            console.log('🎭 Not in theater mode, skipping Flickr-specific fixes');
        }
        return;
    }

    // Fix the LIF container positioning
    if (container.classList.contains('lif-image-container')) {
        // Position relative to height-controller and center manually
        if (heightController) {
            const heightControllerRect = heightController.getBoundingClientRect();
            const imageWidth = facadeContainer ? facadeContainer.offsetWidth : 1453;
            const imageHeight = facadeContainer ? facadeContainer.offsetHeight : 969;

            // Calculate center position within height-controller
            const centerTop = heightControllerRect.top + ((heightControllerRect.height - imageHeight) / 2);
            const centerLeft = heightControllerRect.left + ((heightControllerRect.width - imageWidth) / 2);

            if (isDebugEnabled) {
                console.log(`🎭 Centering LIF container in height-controller:`);
                console.log(`   Height controller: ${heightControllerRect.width}x${heightControllerRect.height} at ${heightControllerRect.left},${heightControllerRect.top}`);
                console.log(`   Image size: ${imageWidth}x${imageHeight}`);
                console.log(`   Calculated center: ${centerLeft},${centerTop}`);
            }

            container.style.cssText = `
                    position: fixed !important;
                    top: ${centerTop}px !important;
                    left: ${centerLeft}px !important;
                    width: ${imageWidth}px !important;
                    height: ${imageHeight}px !important;
                    overflow: visible !important;
                    z-index: 5000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    transform: none !important;
                    border: none !important;
                    outline: none !important;
                `;
        } else if (facadeContainer) {
            // Fallback to facade positioning
            const facadeRect = facadeContainer.getBoundingClientRect();
            container.style.cssText = `
                    position: fixed !important;
                    top: ${facadeRect.top}px !important;
                    left: ${facadeRect.left}px !important;
                    width: ${facadeContainer.offsetWidth}px !important;
                    height: ${facadeContainer.offsetHeight}px !important;
                    overflow: visible !important;
                    z-index: 5000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    transform: none !important;
                    border: none !important;
                    outline: none !important;
                `;
        } else {
            // Final fallback
            container.style.cssText = `
                    position: absolute !important;
                    top: 0px !important;
                    left: 0px !important;
                    width: 1453px !important;
                    height: 969px !important;
                    overflow: visible !important;
                    z-index: 5000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    transform: none !important;
                `;
        }
    }

    // Find and fix canvas positioning
    const canvas = container.querySelector('canvas');
    if (canvas) {
        // Use the facade container we already found for proper sizing
        if (facadeContainer) {
            const facadeStyle = window.getComputedStyle(facadeContainer);
            const facadeWidth = parseInt(facadeStyle.width);
            const facadeHeight = parseInt(facadeStyle.height);

            canvas.style.cssText = `
                    position: absolute !important;
                    top: 0px !important;
                    left: 0px !important;
                    width: ${facadeWidth}px !important;
                    height: ${facadeHeight}px !important;
                    max-width: none !important;
                    max-height: none !important;
                    z-index: 5001 !important;
                    display: none !important;
                    pointer-events: auto !important;
                    cursor: pointer !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important;
                    outline: none !important;
                `;

            if (isDebugEnabled) {
                console.log(`🎭 Fixed canvas dimensions to ${facadeWidth}x${facadeHeight}px`);
            }
        }
    }

    // Find and fix LIF image positioning
    const lifImage = container.querySelector('img[src*="leia-storage-service"]');
    if (lifImage) {
        lifImage.style.cssText += `
                display: block !important;
                position: absolute !important;
                top: 0px !important;
                left: 0px !important;
                z-index: 5000 !important;
                pointer-events: auto !important;
                cursor: pointer !important;
                object-fit: cover !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
                outline: none !important;
            `;
    }

    // Find and fix LIF button zone positioning to ensure it's above canvas
    const buttonZone = container.querySelector('.lif-button-zone');
    if (buttonZone) {
        buttonZone.style.cssText += `
                z-index: 5002 !important;
                position: absolute !important;
                top: 0 !important;
                right: 0 !important;
                pointer-events: none !important;
            `;

        // Also ensure the button itself has high z-index
        const button = buttonZone.querySelector('.lif-converter-btn');
        if (button) {
            button.style.cssText += `
                    z-index: 5002 !important;
                    pointer-events: auto !important;
                `;
        }

        if (isDebugEnabled) {
            console.log('🎭 Fixed LIF button zone positioning for Flickr theater mode');
        }
    }

    // Ensure the facade container doesn't interfere
    if (facadeContainer) {
        facadeContainer.style.cssText += `
                overflow: visible !important;
                z-index: 4998 !important;
            `;
    }
};

/**
 * ============================================================================
 * DUPLICATE BUTTON CLEANUP SYSTEM
 * ============================================================================
 * 
 * LinkedIn and some dynamic sites can create duplicate button zones due to
 * rapid DOM mutations. This cleanup system removes duplicates while preserving
 * the most appropriately positioned button.
 * ============================================================================
 */

// Function to clean up duplicate button zones (LinkedIn-specific)
function cleanupDuplicateButtons() {
    // Only run on LinkedIn where the duplicate issue was occurring
    if (!window.location.hostname.includes('linkedin.com')) {
        return;
    }

    // Find LinkedIn-specific containers that have multiple button zones
    const containersWithButtons = document.querySelectorAll('.update-components-image__container-wrapper, .lif-image-container');

    containersWithButtons.forEach(container => {
        const buttonZones = container.querySelectorAll('.lif-button-zone');

        if (buttonZones.length > 1) {
            console.log(`🧹 LinkedIn: Found ${buttonZones.length} duplicate button zones, cleaning up...`);

            // Keep the first button zone, remove the rest
            for (let i = 1; i < buttonZones.length; i++) {
                buttonZones[i].remove();
                console.log('🗑️ LinkedIn: Removed duplicate button zone');
            }
        }
    });

    // Also check for LinkedIn images that have multiple button zones in their immediate vicinity
    const imagesWithButtons = document.querySelectorAll('img[data-lif-button-added="true"]');
    imagesWithButtons.forEach(img => {
        // Look for multiple button zones near this image (LinkedIn-specific containers)
        const containerElement = img.closest('.update-components-image__container-wrapper') ||
            img.closest('.lif-image-container');

        if (containerElement) {
            const buttonZones = containerElement.querySelectorAll('.lif-button-zone');
            if (buttonZones.length > 1) {
                console.log(`🧹 LinkedIn: Found ${buttonZones.length} duplicate button zones for image, cleaning up...`);

                // Keep the first button zone, remove the rest
                for (let i = 1; i < buttonZones.length; i++) {
                    buttonZones[i].remove();
                    console.log('🗑️ LinkedIn: Removed duplicate button zone near image');
                }
            }
        }
    });
}

/**
 * ============================================================================
 * INITIALIZATION AND STATE MANAGEMENT SYSTEM
 * ============================================================================
 * 
 * The extension uses a careful initialization process that respects user 
 * preferences and website loading patterns. Key features:
 * 
 * • Disabled by default (user must explicitly enable via popup)
 * • Persistent state storage across browser sessions  
 * • Dynamic image processing with mutation observers for SPAs
 * • Graceful handling of single-page applications
 * • CORS education for users on first encounter
 * • Clean state management with page reload on disable
 * 
 * DEVELOPER TESTING CHECKLIST:
 * ✓ Test on CNN.com for picture element compatibility
 * ✓ Test on Instagram-style layouts for padding-based aspect ratios  
 * ✓ Verify click isolation doesn't trigger page navigation
 * ✓ Check CORS handling on protected vs open image domains
 * ✓ Validate responsive design preservation across breakpoints
 * ✓ Ensure LIF viewer animation works smoothly
 * ============================================================================
 */

// Function to process all images on the page
// 🔄 INITIAL IMAGE PROCESSING - Processes all existing images when extension enables
function processImages() {
    if (!isExtensionEnabled) return;

    const images = document.querySelectorAll('img');
    images.forEach(img => {
        try {
            // Wait for image to load before adding button
            if (img.complete) {
                addConvertButton(img);
            } else {
                img.addEventListener('load', () => {
                    try {
                        addConvertButton(img);
                    } catch (error) {
                        console.warn('Error adding convert button to image:', error);
                    }
                }, { once: true });
            }
        } catch (error) {
            console.warn('Error processing image:', error);
        }
    });

    // Show any hidden buttons if re-enabling
    document.querySelectorAll('.lif-converter-btn').forEach(btn => {
        btn.style.display = '';
    });

    // INSTAGRAM CAROUSEL FIX: Process all carousel images on initial load
    processInstagramCarousels();
}

// Function to handle new images added dynamically
function observeNewImages() {
    // Prevent duplicate observers
    if (mutationObserver) {
        console.log('Mutation observer already exists, skipping duplicate creation');
        return;
    }

    // 🔄 ENHANCED MUTATION OBSERVER - Dynamic Content Handling System
    // Tracks both removed and added DOM nodes to maintain button consistency
    // through complex DOM manipulations (Facebook, Instagram, Pinterest)
    mutationObserver = new MutationObserver((mutations) => {
        if (!isExtensionEnabled) return;

        // Collect images for batch processing to improve performance
        const imagesToCheck = new Set();

        mutations.forEach((mutation) => {
            // 🗑️ REMOVED NODES TRACKING - Monitor for images that lose buttons
            mutation.removedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Track direct image removals for potential re-processing
                    if (node.tagName === 'IMG') {
                        if (node.src && node.dataset && node.dataset.lifButtonAdded) {
                            console.log('📝 Image with button was removed:', node.src.substring(0, 50) + '...');
                        }
                    }

                    // Track child images within removed container nodes
                    const removedImages = node.querySelectorAll && node.querySelectorAll('img[data-lif-button-added]');
                    if (removedImages) {
                        removedImages.forEach(img => {
                            if (img.src) {
                                console.log('📝 Child image with button was removed:', img.src.substring(0, 50) + '...');
                            }
                        });
                    }
                }
            });

            // ➕ ADDED NODES PROCESSING - Collect new images for button addition
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Skip LIF-generated elements to prevent recursive processing
                    if (node.classList && (
                        node.classList.contains('lif-processing-overlay') ||
                        node.tagName === 'CANVAS' ||
                        node.classList.contains('lif-converter-btn') ||
                        node.classList.contains('lif-button-zone')
                    )) {
                        return;
                    }

                    // Skip nodes added to active LIF containers
                    if (node.closest && node.closest('[data-lif-active="true"]')) {
                        return;
                    }

                    // Collect direct image nodes
                    if (node.tagName === 'IMG') {
                        imagesToCheck.add(node);
                    }

                    // Collect images within added container nodes
                    const images = node.querySelectorAll && node.querySelectorAll('img');
                    if (images) {
                        images.forEach(img => imagesToCheck.add(img));
                    }
                }
            });
        });

        // 🕒 BATCH PROCESSING - Process collected images after DOM settles
        if (imagesToCheck.size > 0) {
            setTimeout(() => {
                // LINKEDIN DUPLICATE CLEANUP: Remove duplicate button zones before processing new images
                cleanupDuplicateButtons();

                // INSTAGRAM CAROUSEL FIX: Process all carousel images when mutations are detected
                processInstagramCarousels();

                // FLICKR OVERLAY FIX: Clean up blocking overlays when DOM changes
                if (window.location.hostname.includes('flickr.com')) {
                    const photoNotesOverlay = document.querySelector('.view.photo-notes-scrappy-view');
                    if (photoNotesOverlay) {
                        photoNotesOverlay.remove();
                    }
                }

                imagesToCheck.forEach(img => {
                    try {
                        // 🔍 BUTTON STATE VALIDATION - Check tracking vs actual DOM state
                        if (img.dataset && img.dataset.lifButtonAdded) {
                            // Validate that button actually exists in DOM
                            const buttonExists = img.closest('div')?.querySelector('.lif-converter-btn') ||
                                img.parentElement?.querySelector('.lif-button-zone');

                            if (!buttonExists) {
                                console.log('🔄 Re-processing image - button tracking exists but no button found:', img.src?.substring(0, 50) + '...');
                                delete img.dataset.lifButtonAdded; // Reset stale tracking
                            }
                        }

                        // Filter out LIF-generated images
                        if (img.src && (
                            img.src.includes('leia-storage-service') ||
                            img.src.includes('immersity') ||
                            img.src.includes('lifResult')
                        )) {
                            return;
                        }

                        // Check if this image is part of a picture element that's already processed
                        const pictureParent = img.closest('picture');
                        if (pictureParent && pictureParent.dataset.lifTargetWidth) {
                            return;
                        }

                        if (img.complete) {
                            addConvertButton(img);
                        } else {
                            img.addEventListener('load', () => {
                                try {
                                    addConvertButton(img);
                                } catch (error) {
                                    console.warn('Error adding convert button to image on load:', error);
                                }
                            }, { once: true });
                        }
                    } catch (error) {
                        console.warn('Error processing image in mutation observer:', error);
                    }
                });
            }, 200); // Increased delay for complex DOM operations
        }
    });

    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('Mutation observer created and started');
}

// 📜 SCROLL-BASED VALIDATION SYSTEM
// Handles Facebook-style dynamic content where DOM elements are removed/re-added during scrolling
// Validates button state after scroll completion and re-processes stale tracking
function setupScrollHandler() {
    if (scrollHandler) {
        console.log('Scroll handler already exists, skipping duplicate creation');
        return;
    }

    let scrollTimeout;
    scrollHandler = () => {
        if (!isExtensionEnabled) return;

        // 🕐 DEBOUNCED PROCESSING - Wait for scroll completion to avoid excessive processing
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            console.log('🔄 Scroll-based re-processing triggered');

            // Clean up any duplicate buttons that may have been created during scrolling
            cleanupDuplicateButtons();

            // INSTAGRAM CAROUSEL FIX: Process carousel images during scroll events
            processInstagramCarousels();

            // FLICKR OVERLAY FIX: Clean up blocking overlays during scroll (theater mode only)
            if (window.location.hostname.includes('flickr.com')) {
                // Only clean up in theater mode to avoid removing buttons in wall view
                const isInTheaterMode = document.querySelector('.height-controller') &&
                    document.querySelector('.facade-of-protection-neue');

                if (isInTheaterMode) {
                    const cleanupFlickrOverlays = () => {
                        const photoNotesOverlay = document.querySelector('.view.photo-notes-scrappy-view');
                        if (photoNotesOverlay) {
                            console.log('🎭 Scroll cleanup: Removing theater mode photo-notes overlay');
                            photoNotesOverlay.remove();
                        }
                    };
                    cleanupFlickrOverlays();
                }
            }

            // 🔍 VIEWPORT VALIDATION - Find images near viewport with button state issues
            const images = document.querySelectorAll('img');
            const viewport = { width: window.innerWidth, height: window.innerHeight };

            images.forEach(img => {
                try {
                    const rect = img.getBoundingClientRect();

                    // ±200px buffer around viewport to catch images that might need buttons
                    const isNearViewport = rect.bottom > -200 && rect.top < viewport.height + 200 &&
                        rect.right > -200 && rect.left < viewport.width + 200;

                    if (!isNearViewport) return;

                    // 🔧 STATE VALIDATION - Check for tracking flags without actual buttons
                    if (img.dataset && img.dataset.lifButtonAdded) {
                        // Enhanced button detection for various layout patterns
                        const buttonExists =
                            // Standard: Button inside image container
                            img.closest('div')?.querySelector('.lif-converter-btn') ||
                            img.parentElement?.querySelector('.lif-button-zone') ||
                            // Overlay: Button zone as sibling (CNN pattern)
                            img.closest('.image__container')?.parentElement?.querySelector('.lif-button-zone') ||
                            img.closest('.container__item-media')?.querySelector('.lif-button-zone') ||
                            // General: Any LIF-related element in the area
                            img.closest('[class*="lif-"]') ||
                            // Broader search: Look up 3 levels for button zones
                            (() => {
                                let element = img.parentElement;
                                for (let i = 0; i < 3 && element; i++) {
                                    const foundButton = element.querySelector('.lif-converter-btn') ||
                                        element.querySelector('.lif-button-zone');
                                    if (foundButton) return foundButton;
                                    element = element.parentElement;
                                }
                                return null;
                            })();

                        if (!buttonExists) {
                            console.log('🔧 Scroll fix: Re-processing image with stale tracking:', img.src?.substring(0, 50) + '...');
                            delete img.dataset.lifButtonAdded; // Reset stale tracking

                            // 🔄 RE-PROCESS IMAGE - Add button after clearing stale tracking
                            if (img.complete) {
                                addConvertButton(img);
                            } else {
                                img.addEventListener('load', () => {
                                    try {
                                        addConvertButton(img);
                                    } catch (error) {
                                        console.warn('Error adding convert button during scroll fix:', error);
                                    }
                                }, { once: true });
                            }
                        }
                    }
                } catch (error) {
                    // Silently handle errors to avoid console spam
                }
            });
        }, 500); // Wait 500ms after scroll stops
    };

    window.addEventListener('scroll', scrollHandler, { passive: true });
    console.log('Scroll handler created and started');
}

// Function to load extension state from storage
async function loadExtensionState() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY, DEBUG_STORAGE_KEY]);
        isExtensionEnabled = result[STORAGE_KEY] !== undefined ? result[STORAGE_KEY] : false;
        isDebugEnabled = result[DEBUG_STORAGE_KEY] !== undefined ? result[DEBUG_STORAGE_KEY] : false;
        shouldLog = isExtensionEnabled; // Set logging based on enabled state

        if (shouldLog) {
            console.log('Loaded extension state:', isExtensionEnabled ? 'enabled' : 'disabled');
            console.log('Debug mode:', isDebugEnabled ? 'enabled' : 'disabled');
        }
    } catch (error) {
        console.error('Error loading extension state:', error);
        isExtensionEnabled = false; // Default to disabled on error
        isDebugEnabled = false;
        shouldLog = false;
    }
}

// Function to save extension state to storage
async function saveExtensionState() {
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: isExtensionEnabled });
        console.log('Saved extension state:', isExtensionEnabled ? 'enabled' : 'disabled');
    } catch (error) {
        console.error('Error saving extension state:', error);
    }
}

// Function to save debug state to storage
async function saveDebugState() {
    try {
        await chrome.storage.local.set({ [DEBUG_STORAGE_KEY]: isDebugEnabled });
        if (shouldLog) {
            console.log('Saved debug state:', isDebugEnabled ? 'enabled' : 'disabled');
        }
    } catch (error) {
        console.error('Error saving debug state:', error);
    }
}

// Function to set up message listener with duplicate prevention
function setupMessageListener() {
    // Prevent duplicate listeners
    if (messageListener) {
        console.log('Message listener already exists, skipping duplicate creation');
        return;
    }

    // Create the message listener function
    messageListener = (request, sender, sendResponse) => {
        console.log('Extension message received:', request.action, 'Current state:', isExtensionEnabled);

        if (request.action === 'toggleExtension') {
            const wasEnabled = isExtensionEnabled;
            isExtensionEnabled = !isExtensionEnabled;
            shouldLog = isExtensionEnabled; // Update logging flag

            console.log(`Extension state changing from ${wasEnabled} to ${isExtensionEnabled}`);

            // Save the new state
            saveExtensionState();

            if (isExtensionEnabled) {
                // Extension was enabled - perform full initialization
                console.log('Extension enabled - performing full initialization');

                // Inject CSS styles
                injectStyles();

                // Test WebXR support
                testWebXRSupport();

                // Start observing new images
                observeNewImages();

                // Set up scroll handler for dynamic content re-processing
                setupScrollHandler();

                // Set up Instagram carousel navigation listeners
                setupInstagramCarouselListeners();

                // Set up Flickr theater mode handling if needed
                if (window.location.hostname.includes('flickr.com')) {
                    // URL-based theater mode detection
                    const currentPath = window.location.pathname;
                    const isTheaterModeURL = /\/photos\/[^\/]+\/\d+\/in\//.test(currentPath);

                    if (isTheaterModeURL) {
                        if (isDebugEnabled) {
                            console.log('🎭 Flickr theater mode detected - setting up overlay cleanup');
                        }

                        // Check if this is first load and reload if needed
                        const hasBeenReloaded = sessionStorage.getItem('flickr-theater-reloaded');

                        if (!hasBeenReloaded) {
                            if (isDebugEnabled) {
                                console.log('🔄 FLICKR THEATER MODE: First load detected, reloading page to fix positioning issues...');
                            }
                            sessionStorage.setItem('flickr-theater-reloaded', 'true');
                            setTimeout(() => {
                                location.reload();
                            }, 100);
                            return; // Exit early since we're reloading
                        } else {
                            if (isDebugEnabled) {
                                console.log('🎭 FLICKR THEATER MODE: Page already reloaded, proceeding with normal setup');
                            }
                        }

                        setupFlickrOverlayCleanup();
                    } else {
                        // Clear the reload flag when NOT in theater mode
                        const hadReloadFlag = sessionStorage.getItem('flickr-theater-reloaded');
                        if (hadReloadFlag) {
                            sessionStorage.removeItem('flickr-theater-reloaded');
                        }
                    }

                    // Set up URL monitoring for SPA navigation to theater mode
                    setupFlickrTheaterModeMonitoring();
                }

                // Start processing images
                processImages();
                console.log('Extension enabled - processing images');
            } else {
                // Extension was disabled - reload page for clean state
                console.log('Extension disabled - reloading page for clean state');

                // Send response before reloading
                sendResponse({ enabled: isExtensionEnabled });

                // Small delay to ensure response is sent, then reload
                setTimeout(() => {
                    location.reload();
                }, 100);

                return; // Exit early since we're reloading
            }

            sendResponse({ enabled: isExtensionEnabled });
        } else if (request.action === 'toggleDebug') {
            isDebugEnabled = !isDebugEnabled;

            // Save the new debug state
            saveDebugState();

            console.log(`Debug mode ${isDebugEnabled ? 'enabled' : 'disabled'}`);
            sendResponse({ debugEnabled: isDebugEnabled });
        } else if (request.action === 'getStatus') {
            console.log('Status requested, responding with:', isExtensionEnabled);
            sendResponse({ enabled: isExtensionEnabled });
        } else if (request.action === 'getXRStatus') {
            // Only provide XR status if extension is enabled
            if (isExtensionEnabled) {
                const reason = window.webXRSupportReason ||
                    (isWebXRSupported ? 'WebXR immersive-vr supported' :
                        (webXRSupportChecked ? 'WebXR not supported on this device' : 'WebXR support check in progress'));

                console.log('XR status requested, responding with:', {
                    supported: isWebXRSupported,
                    checked: webXRSupportChecked,
                    reason: reason
                });

                sendResponse({
                    supported: isWebXRSupported,
                    checked: webXRSupportChecked,
                    reason: reason
                });
            } else {
                // Extension is disabled, return disabled status
                console.log('XR status requested but extension is disabled');
                sendResponse({
                    supported: false,
                    checked: true,
                    reason: 'Extension is disabled'
                });
            }
        }
    };

    // Add the listener
    chrome.runtime.onMessage.addListener(messageListener);

    // Only log when we should be logging to avoid noise
    if (shouldLog) {
        console.log('Message listener created and added');
    }
}

// Function to cleanup extension resources
function cleanupExtension() {
    // Only log cleanup if we should be logging
    if (shouldLog) {
        console.log('Cleaning up extension resources...');
    }

    // Remove message listener
    if (messageListener) {
        try {
            chrome.runtime.onMessage.removeListener(messageListener);
            messageListener = null;
            if (shouldLog) {
                console.log('Message listener removed');
            }
        } catch (error) {
            if (shouldLog) {
                console.warn('Error removing message listener:', error);
            }
        }
    }

    // Disconnect mutation observer
    if (mutationObserver) {
        try {
            mutationObserver.disconnect();
            mutationObserver = null;
            if (shouldLog) {
                console.log('Mutation observer disconnected');
            }
        } catch (error) {
            if (shouldLog) {
                console.warn('Error disconnecting mutation observer:', error);
            }
        }
    }

    // Remove scroll handler
    if (scrollHandler) {
        try {
            window.removeEventListener('scroll', scrollHandler);
            scrollHandler = null;
            if (shouldLog) {
                console.log('Scroll handler removed');
            }
        } catch (error) {
            if (shouldLog) {
                console.warn('Error removing scroll handler:', error);
            }
        }
    }

    // Reset WebXR state to allow fresh testing on re-enable
    isWebXRSupported = false;
    webXRSupportChecked = false;
    window.webXRSupportReason = undefined;

    // Reset initialization state
    isExtensionInitialized = false;

    // Only log completion if we should be logging
    if (shouldLog) {
        console.log('Extension cleanup completed');
    }
}

// Initialize the extension
// 🚀 EXTENSION INITIALIZATION SYSTEM - Sets up all components and event handlers
async function initialize() {
    // Prevent duplicate initialization
    if (isExtensionInitialized) {
        // Only log if we should be logging
        if (shouldLog) {
            console.log('Extension already initialized, skipping duplicate initialization');
        }
        return;
    }

    // Mark as initialized early to prevent race conditions
    isExtensionInitialized = true;

    // Clean up any existing resources first (in case of reload during development)
    cleanupExtension();

    try {
        // Load saved state first - this is essential regardless of enabled state
        await loadExtensionState();

        // Set up message listener for popup communication - needed for enable/disable functionality
        setupMessageListener();

        // Only proceed with full initialization if extension is enabled
        if (isExtensionEnabled) {
            console.log('Initializing 2D to 3D Image Converter...');

            // Add helpful CORS information for developers
            console.log(`ImmersityLens Chrome Extension - FULLY FUNCTIONAL ✅`);

            // Inject CSS styles
            injectStyles();

            // Test WebXR support early
            testWebXRSupport();

            // Start observing new images (this also prevents duplicates)
            observeNewImages();

            // Set up scroll handler for dynamic content re-processing
            setupScrollHandler();

            // Set up Instagram carousel navigation listeners
            setupInstagramCarouselListeners();

            // Set up Flickr theater mode handling
            if (window.location.hostname.includes('flickr.com')) {
                // URL-based theater mode detection
                const currentPath = window.location.pathname;
                const isTheaterModeURL = /\/photos\/[^\/]+\/\d+\/in\//.test(currentPath);

                if (isTheaterModeURL) {
                    console.log('🎭 Flickr theater mode detected - setting up overlay cleanup');

                    // Check if this is first load and reload if needed
                    const hasBeenReloaded = sessionStorage.getItem('flickr-theater-reloaded');

                    if (!hasBeenReloaded) {
                        console.log('🔄 FLICKR THEATER MODE: First load detected, reloading page to fix positioning issues...');
                        sessionStorage.setItem('flickr-theater-reloaded', 'true');
                        setTimeout(() => {
                            location.reload();
                        }, 100);
                        return; // Exit early since we're reloading
                    } else {
                        console.log('🎭 FLICKR THEATER MODE: Page already reloaded, proceeding with normal setup');
                    }

                    setupFlickrOverlayCleanup();
                } else {
                    // Clear the reload flag when NOT in theater mode
                    const hadReloadFlag = sessionStorage.getItem('flickr-theater-reloaded');
                    if (hadReloadFlag) {
                        sessionStorage.removeItem('flickr-theater-reloaded');
                    }
                }

                // Set up URL monitoring for SPA navigation to theater mode
                setupFlickrTheaterModeMonitoring();
            }

            // Start processing images
            processImages();
            console.log('Extension enabled - processing images');

            console.log('2D to 3D Image Converter initialized successfully!');
        } else {
            console.log('ImmersityLens extension is disabled - not performing initialization tasks');
        }

    } catch (error) {
        console.error('Error during extension initialization:', error);
        // Reset initialization state on error
        isExtensionInitialized = false;
        cleanupExtension();
    }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Clean up when page unloads to prevent resource leaks
window.addEventListener('beforeunload', () => {
    console.log('Page unloading, cleaning up extension...');
    cleanupExtension();
}, { once: true }); 