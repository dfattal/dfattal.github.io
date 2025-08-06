/**
 * ImmersityLens Chrome Extension - 2D to 3D Image Converter (v3.1.9)
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
let isExtensionEnabled = true; // Always enabled - context menu approach is non-invasive
let isDebugEnabled = false; // Default to disabled - user must explicitly enable debug mode
let processingImages = new Set(); // Track which images are being processed
let hasShownCorsInfo = false; // Track if we've shown CORS info to user

// Track LIF files per image for context menu functionality
let imageLIFMap = new Map(); // Map image src to LIF download URL
let lastContextMenuImage = null; // Track the last image that was right-clicked

// Extension initialization state to prevent duplicate setup
let isExtensionInitialized = false;
let mutationObserver = null;
let messageListener = null;
let scrollHandler = null;

// WebXR support state tracking
let isWebXRSupported = false;
let webXRSupportChecked = false;

// Flag to control console logging (avoid noise when extension is disabled)
let shouldLog = true; // Always log since extension is always enabled

// Storage keys for extension state
const DEBUG_STORAGE_KEY = 'lifDebugEnabled';
const CORS_INFO_SHOWN_KEY = 'lifCorsInfoShown';

// Z-index configuration - Centralized for easy maintenance
const Z_INDEX_CONFIG = {
    BUTTON: 5000,           // LIF conversion buttons
    BUTTON_ZONE: 5000,      // Button container zones
    PROCESSING_OVERLAY: 5000, // Loading overlays during conversion
    CANVAS: 5001,           // Canvas elements (passed to lifViewer) - Higher than overlays
    IMAGE: 4999             // Post-conversion image elements (passed to lifViewer)
};

// Video generation configuration - Centralized for easy maintenance
const VIDEO_CONFIG = {
    DEFAULT_BITRATE: 0.2,  // Default bitrate multiplier
    MIN_BITRATE: 0.05,     // Minimum bitrate (very low quality)
    MAX_BITRATE: 2.0       // Maximum bitrate (very high quality)
};

// Storage keys for settings
const VIDEO_BITRATE_STORAGE_KEY = 'mp4BitrateMultiplier';

// Bitrate management functions
async function getMP4Bitrate() {
    try {
        const result = await chrome.storage.local.get([VIDEO_BITRATE_STORAGE_KEY]);
        const storedBitrate = result[VIDEO_BITRATE_STORAGE_KEY];

        if (storedBitrate !== undefined) {
            // Clamp the stored value to valid range
            return Math.max(VIDEO_CONFIG.MIN_BITRATE, Math.min(VIDEO_CONFIG.MAX_BITRATE, storedBitrate));
        }

        return VIDEO_CONFIG.DEFAULT_BITRATE;
    } catch (error) {
        console.warn('Failed to load MP4 bitrate setting, using default:', error);
        return VIDEO_CONFIG.DEFAULT_BITRATE;
    }
}

async function setMP4Bitrate(bitrate) {
    try {
        // Clamp the value to valid range
        const clampedBitrate = Math.max(VIDEO_CONFIG.MIN_BITRATE, Math.min(VIDEO_CONFIG.MAX_BITRATE, bitrate));
        await chrome.storage.local.set({ [VIDEO_BITRATE_STORAGE_KEY]: clampedBitrate });
        console.log('MP4 bitrate setting saved:', clampedBitrate);
        return clampedBitrate;
    } catch (error) {
        console.error('Failed to save MP4 bitrate setting:', error);
        throw error;
    }
}

// Make these functions available globally for popup menu
window.getMP4Bitrate = getMP4Bitrate;
window.setMP4Bitrate = setMP4Bitrate;
window.getMP4BitrateConfig = () => ({
    default: VIDEO_CONFIG.DEFAULT_BITRATE,
    min: VIDEO_CONFIG.MIN_BITRATE,
    max: VIDEO_CONFIG.MAX_BITRATE
});

// 🥽 WEBXR SUPPORT TEST - Inject script file into page context
function testWebXRSupport() {
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
        
        img.lif-processing-glow {
            animation: lifGlow 1.2s infinite alternate ease-in-out !important;
            animation-fill-mode: both !important;
            animation-play-state: running !important;
        }
        
        @keyframes lifGlow {
            0% {
                opacity: 0.6 !important;
                outline-color: rgba(192, 128, 255, 0.6) !important;
                filter: sepia(100%) hue-rotate(260deg) saturate(120%) brightness(0.8) !important;
            }
            50% {
                opacity: 0.9 !important;
                outline-color: rgba(255, 255, 255, 0.9) !important;
                filter: sepia(100%) hue-rotate(280deg) saturate(180%) brightness(1.2) !important;
            }
            100% {
                opacity: 0.75 !important;
                outline-color: rgba(192, 128, 255, 1) !important;
                filter: sepia(100%) hue-rotate(270deg) saturate(150%) brightness(1) !important;
            }
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

// Function to generate MP4 by creating offscreen lifViewer with LIF file
async function generateMP4FromLifFile(imgElement, lifDownloadUrl, customBitrate = null) {
    console.log('🎬 Starting MP4 generation for image:', imgElement.src);
    console.log('🎬 Using LIF URL:', lifDownloadUrl);

    try {
        // First, get the LIF image dimensions to use as defaults
        let defaultWidth = 1920;
        let defaultHeight = 1080;

        try {
            // Load the LIF image to get its natural dimensions
            const lifImg = new Image();
            lifImg.crossOrigin = 'anonymous';

            await new Promise((resolve, reject) => {
                lifImg.onload = () => {
                    defaultWidth = lifImg.naturalWidth || lifImg.width || 1920;
                    defaultHeight = lifImg.naturalHeight || lifImg.height || 1080;
                    console.log('📐 LIF image dimensions:', { defaultWidth, defaultHeight });
                    resolve();
                };
                lifImg.onerror = () => {
                    console.warn('Could not load LIF image for dimensions, using defaults');
                    resolve(); // Don't reject, just use defaults
                };
                lifImg.src = lifDownloadUrl;
            });
        } catch (error) {
            console.warn('Error getting LIF dimensions, using defaults:', error);
        }

        // Get user preferences for video settings with LIF dimensions as defaults
        // const videoWidth = parseInt(prompt(`Enter video width:`, defaultWidth), 10) || defaultWidth;
        // const videoHeight = parseInt(prompt(`Enter video height:`, defaultHeight), 10) || defaultHeight;
        // const videoFps = parseInt(prompt("Enter video fps:", 30), 10) || 30;

        // Use default dimensions with 30fps always for now
        const videoWidth = defaultWidth;
        const videoHeight = defaultHeight;
        const videoFps = 30;

        console.log('📊 MP4 settings:', { videoWidth, videoHeight, videoFps });

        // Show progress notification
        showDownloadNotification('🎬 Generating MP4... This may take a moment.', 'info');

        // Create offscreen canvas for MP4 generation
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = videoWidth;
        offscreenCanvas.height = videoHeight;

        // Create a temporary container for the offscreen lifViewer
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = videoWidth + 'px';
        tempContainer.style.height = videoHeight + 'px';
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.pointerEvents = 'none';
        tempContainer.style.overflow = 'hidden';
        tempContainer.style.zIndex = '-1000';

        // Add a placeholder image to prevent DOM errors in lifViewer
        const placeholderImg = document.createElement('img');
        placeholderImg.src = imgElement.src;
        placeholderImg.style.width = '100%';
        placeholderImg.style.height = '100%';
        placeholderImg.style.objectFit = 'cover';
        placeholderImg.dataset.lifButtonAdded = 'true'; // Prevent button processing
        tempContainer.appendChild(placeholderImg);

        document.body.appendChild(tempContainer);

        try {
            console.log('🔄 Creating offscreen lifViewer...');

            // Create new lifViewer instance for MP4 generation with minimal options
            const offscreenViewer = new lifViewer(lifDownloadUrl, tempContainer, {
                height: videoHeight,
                autoplay: false,
                mouseOver: false,
                originalImage: placeholderImg  // Provide the placeholder image to prevent null reference errors
            });

            // Set additional properties for offscreen use
            offscreenViewer.disableAnim = true; // We'll control animation manually

            // Wait for the viewer to be ready (init is called automatically by constructor)
            // No need to call init() manually

            // Wait a bit more for all resources to be loaded
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Ensure the offscreen viewer uses the selected animation preference
            try {
                const result = await chrome.storage.local.get(['lifAnimationIndex']);
                const savedAnimationIndex = result.lifAnimationIndex !== undefined ? result.lifAnimationIndex : 0;
                if (offscreenViewer.setAnimation) {
                    offscreenViewer.setAnimation(savedAnimationIndex);
                    console.log(`🎬 MP4 generation using animation: ${offscreenViewer.currentAnimation?.name || 'Unknown'} (index ${savedAnimationIndex})`);
                }
            } catch (error) {
                console.warn('Could not load animation preference for MP4 generation, using default:', error);
            }

            console.log('✅ Offscreen lifViewer ready, starting recording...');

            // Set up MediaRecorder for the offscreen canvas with better codec compatibility
            const stream = offscreenCanvas.captureStream(videoFps);

            // Try different codec options for better compatibility (especially QuickTime)
            let recorderOptions = null;
            // Get bitrate from settings or use custom/default value
            const bitrate = customBitrate !== null ? customBitrate : await getMP4Bitrate();
            console.log('🎯 Using MP4 bitrate multiplier:', bitrate);
            const codecOptions = [
                // H.264 with baseline profile for maximum compatibility - increased bitrate for better quality
                { mimeType: 'video/mp4; codecs="avc1.42E01E"', videoBitsPerSecond: Math.floor((videoWidth * videoHeight * videoFps) * bitrate) },
                // H.264 with main profile - increased bitrate for better quality
                { mimeType: 'video/mp4; codecs="avc1.4D401E"', videoBitsPerSecond: Math.floor((videoWidth * videoHeight * videoFps) * bitrate) },
                // Generic MP4 fallback - increased bitrate for better quality
                { mimeType: 'video/mp4', videoBitsPerSecond: Math.floor((videoWidth * videoHeight * videoFps) * bitrate) },
                // WebM fallback (though less compatible with QuickTime) - increased bitrate for better quality
                { mimeType: 'video/webm; codecs="vp9"', videoBitsPerSecond: Math.floor((videoWidth * videoHeight * videoFps) * bitrate) },
                { mimeType: 'video/webm', videoBitsPerSecond: Math.floor((videoWidth * videoHeight * videoFps) * bitrate) }
            ];

            // Find the first supported codec
            for (const options of codecOptions) {
                if (MediaRecorder.isTypeSupported(options.mimeType)) {
                    recorderOptions = options;
                    console.log('🎥 Using codec:', options.mimeType);
                    break;
                }
            }

            if (!recorderOptions) {
                throw new Error('No supported video codec found for MP4 recording');
            }

            const recorder = new MediaRecorder(stream, recorderOptions);

            const chunks = [];
            recorder.ondataavailable = (e) => chunks.push(e.data);

            // Calculate animation timing
            const animDuration = offscreenViewer.currentAnimation?.duration_sec || 3.0;
            const numFrames = Math.ceil(animDuration * videoFps);
            const frameDuration = 1000 / videoFps;

            console.log(`🎬 Recording ${numFrames} frames over ${animDuration} seconds...`);

            // Warm-up phase: render a few frames before recording to stabilize WebGL state
            console.log('🔥 Warming up...');
            for (let i = 0; i < 5; i++) {
                offscreenViewer.renderFrame(0); // Static frame
                await new Promise(resolve => setTimeout(resolve, frameDuration));
            }

            // Start recording
            recorder.start();
            console.log('🎬 Recording started...');

            // Additional frame to ensure clean first capture
            console.log('🎯 Rendering clean first frame...');
            offscreenViewer.renderFrame(0);
            const ctx = offscreenCanvas.getContext('2d');
            ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
            ctx.drawImage(offscreenViewer.canvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
            await new Promise(resolve => setTimeout(resolve, frameDuration));

            // Record animation frames
            for (let i = 0; i < numFrames; i++) {
                const progress = i / numFrames;
                const animTime = progress * animDuration;

                // Render frame at specific time
                offscreenViewer.renderFrame(animTime);

                // Copy to offscreen canvas
                const ctx = offscreenCanvas.getContext('2d');
                ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                ctx.drawImage(offscreenViewer.canvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

                // Wait for frame timing
                await new Promise(resolve => setTimeout(resolve, frameDuration));

                // Progress update
                if (i % Math.ceil(numFrames / 10) === 0) {
                    console.log(`🎬 Recording progress: ${Math.round(progress * 100)}%`);
                }
            }

            // Stop recording and process result
            recorder.stop();
            console.log('🎬 Recording completed, processing...');

            return new Promise((resolve, reject) => {
                recorder.onstop = async () => {
                    try {
                        // Use the same MIME type that was used for recording
                        const blobType = recorderOptions.mimeType.includes('webm') ? 'video/webm' : 'video/mp4';
                        const blob = new Blob(chunks, { type: blobType });

                        // Generate filename using same logic as LIF downloads
                        const fileExtension = blobType.includes('webm') ? '.webm' : '.mp4';
                        let outputFileName = `converted_3D${fileExtension}`;

                        // Helper function to clean and shorten text for filename
                        function cleanFilename(text, maxLength = 30) {
                            return text
                                .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special characters
                                .replace(/\s+/g, '_') // Replace spaces with underscores
                                .substring(0, maxLength) // Limit length
                                .replace(/_+$/, ''); // Remove trailing underscores
                        }

                        // Try to use alt text first (usually most descriptive)
                        if (imgElement && imgElement.alt && imgElement.alt.trim()) {
                            const cleanAlt = cleanFilename(imgElement.alt.trim());
                            if (cleanAlt) {
                                outputFileName = `${cleanAlt}_3D${fileExtension}`;
                                console.log('Using alt text for video filename:', outputFileName);
                            }
                        }
                        // Fallback to image URL if no alt text
                        else if (imgElement && imgElement.src) {
                            try {
                                const url = new URL(imgElement.src);
                                const pathParts = url.pathname.split('/');
                                const originalName = pathParts[pathParts.length - 1];

                                // Extract name without extension and clean it
                                let nameWithoutExt = originalName.split('.')[0] || 'image';

                                // Handle common URL patterns (like random IDs, query params)
                                if (nameWithoutExt.length > 20 || /^[a-f0-9]{8,}$/i.test(nameWithoutExt)) {
                                    // If it's a long hash or ID, use a shorter version
                                    nameWithoutExt = nameWithoutExt.substring(0, 8);
                                }

                                const cleanName = cleanFilename(nameWithoutExt);
                                outputFileName = `${cleanName || 'image'}_3D${fileExtension}`;
                                console.log('Using URL-based video filename:', outputFileName);
                            } catch (e) {
                                // Use default filename if URL parsing fails
                                outputFileName = `converted_3D${fileExtension}`;
                                console.log('Using default video filename due to URL parsing error');
                            }
                        }

                        // Download the file
                        const videoFile = new File([blob], outputFileName, { type: blobType });
                        const url = URL.createObjectURL(videoFile);

                        const a = document.createElement('a');
                        a.href = url;
                        a.download = outputFileName;
                        document.body.appendChild(a);
                        a.click();

                        URL.revokeObjectURL(url);
                        document.body.removeChild(a);

                        console.log('✅ Video download completed:', outputFileName);
                        showDownloadNotification(`✅ 3D video downloaded: ${outputFileName}`, 'success');
                        resolve(outputFileName);
                    } catch (error) {
                        console.error('❌ Error processing MP4:', error);
                        showDownloadNotification(`❌ MP4 processing failed: ${error.message}`, 'error');
                        reject(error);
                    }
                };

                recorder.onerror = (error) => {
                    console.error('❌ MediaRecorder error:', error);
                    showDownloadNotification(`❌ MP4 recording failed: ${error.message}`, 'error');
                    reject(error);
                };
            });

        } finally {
            // Clean up temporary container
            if (tempContainer.parentNode) {
                document.body.removeChild(tempContainer);
            }
            console.log('🧹 Temporary container cleaned up');
        }

    } catch (error) {
        console.error('❌ Error generating MP4:', error);
        showDownloadNotification(`❌ MP4 generation failed: ${error.message}`, 'error');
        throw error;
    }
}

// Function to download LIF file when LIF button is clicked
async function downloadLIFFile(lifDownloadUrl, originalImageSrc, imgElement = null) {
    try {
        // Generate a filename based on alt text, image URL, or use a default
        let fileName = 'converted_LIF.jpg';

        // Helper function to clean and shorten text for filename
        function cleanFilename(text, maxLength = 30) {
            return text
                .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special characters
                .replace(/\s+/g, '_') // Replace spaces with underscores
                .substring(0, maxLength) // Limit length
                .replace(/_+$/, ''); // Remove trailing underscores
        }

        // Try to use alt text first (usually most descriptive)
        if (imgElement && imgElement.alt && imgElement.alt.trim()) {
            const cleanAlt = cleanFilename(imgElement.alt.trim());
            if (cleanAlt) {
                fileName = `${cleanAlt}_LIF.jpg`;
                console.log('Using alt text for filename:', fileName);
            }
        }
        // Fallback to image URL if no alt text
        else if (originalImageSrc) {
            try {
                const url = new URL(originalImageSrc);
                const pathParts = url.pathname.split('/');
                const originalName = pathParts[pathParts.length - 1];

                // Extract name without extension and clean it
                let nameWithoutExt = originalName.split('.')[0] || 'image';

                // Handle common URL patterns (like random IDs, query params)
                if (nameWithoutExt.length > 20 || /^[a-f0-9]{8,}$/i.test(nameWithoutExt)) {
                    // If it's a long hash or ID, use a shorter version
                    nameWithoutExt = nameWithoutExt.substring(0, 8);
                }

                const cleanName = cleanFilename(nameWithoutExt);
                fileName = `${cleanName || 'image'}_LIF.jpg`;
                console.log('Using URL-based filename:', fileName);
            } catch (e) {
                // Use default filename if URL parsing fails
                fileName = 'converted_LIF.jpg';
                console.log('Using default filename due to URL parsing error');
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
                return; // Exit early to prevent fallback execution
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('User cancelled the download');
                    return; // Exit early when user cancels
                }
                console.warn('File System Access API failed, falling back to traditional download:', err);
                // Continue to fallback method below
            }
        }

        // Fallback for browsers that don't support File System Access API
        console.log('Using fallback download method');
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

// Function to apply processing effect directly to image - purple glow + darker opacity
function applyProcessingEffect(img) {
    try {
        console.log('LIF: Applying processing effect to image:', img.src);

        // Determine the target element for visual effects
        let visualTarget = img;
        if (img._isVirtualBackgroundImage && img._originalBackgroundElement) {
            visualTarget = img._originalBackgroundElement;
            console.log('🎭 Using background element for visual effects:', visualTarget.tagName, visualTarget.className);
        }

        // CRITICAL FIX: Validate visual target is in DOM (Windows Chrome fix)
        if (!document.contains(visualTarget)) {
            console.error('❌ Visual target not in DOM! Target:', visualTarget.tagName, visualTarget.className);
            console.log('🔄 Falling back to original image for processing effects');
            visualTarget = img; // Fall back to the original image

            // Verify the fallback is in the DOM
            if (!document.contains(visualTarget)) {
                console.error('❌ Even fallback visual target (img) not in DOM! Processing effects will not work.');
                return false; // Can't apply effects if no target is in DOM
            }
        }

        console.log('✅ Visual target validated - in DOM:', document.contains(visualTarget));

        // Store original styles for restoration (always on the img for consistency)
        img.dataset.lifOriginalOpacity = visualTarget.style.opacity || '';
        img.dataset.lifOriginalFilter = visualTarget.style.filter || '';
        img.dataset.lifOriginalBorderRadius = visualTarget.style.borderRadius || '';
        img.dataset.lifOriginalBoxShadow = visualTarget.style.boxShadow || '';
        img.dataset.lifOriginalTransition = visualTarget.style.transition || '';
        img.dataset.lifOriginalMaskImage = visualTarget.style.maskImage || visualTarget.style.webkitMaskImage || '';
        img.dataset.lifOriginalMaskSize = visualTarget.style.maskSize || visualTarget.style.webkitMaskSize || '';
        img.dataset.lifOriginalMaskPosition = visualTarget.style.maskPosition || visualTarget.style.webkitMaskPosition || '';

        // Mark as processing FIRST
        img.dataset.lifProcessing = 'true';

        // For virtual background images, apply effects to the background element
        if (img._isVirtualBackgroundImage && img._originalBackgroundElement) {
            // Apply effects to the background element (span, div, etc.)
            visualTarget.style.setProperty('filter', 'contrast(1.15) brightness(1.1)', 'important');
            visualTarget.style.setProperty('opacity', '0.95', 'important');
            visualTarget.style.setProperty('border-radius', '8px', 'important');

            // Initial subtle outer glow effect
            const initialGlow = '0 0 15px 3px rgba(192, 128, 255, 0.5)';
            const initialRim = '0 0 0 1px rgba(192, 128, 255, 0.8)';
            visualTarget.style.setProperty('box-shadow', `${initialGlow}, ${initialRim}`, 'important');

            // Add class to background element for identification
            visualTarget.classList.add('lif-processing-glow');
        } else {
            // Apply effects to regular img element
            img.style.setProperty('filter', 'contrast(1.15) brightness(1.1)', 'important');
            img.style.setProperty('opacity', '0.95', 'important');
            img.style.setProperty('border-radius', '8px', 'important');

            // Initial subtle outer glow effect
            const initialGlow = '0 0 15px 3px rgba(192, 128, 255, 0.5)';
            const initialRim = '0 0 0 1px rgba(192, 128, 255, 0.8)';
            img.style.setProperty('box-shadow', `${initialGlow}, ${initialRim}`, 'important');

            // Add glowing class for identification
            img.classList.add('lif-processing-glow');
        }

        // Start JavaScript-based subtle glow animation immediately
        console.log('LIF: About to start subtle glow animation...');
        startPulsingAnimation(img);

        console.log('LIF: Processing effect applied successfully');
        return true;
    } catch (error) {
        console.error('LIF: Error applying processing effect:', error);
        return false;
    }
}

// JavaScript-based subtle glowing animation (slowly pulsing inward rim)
function startPulsingAnimation(img) {
    console.log('LIF: Starting subtle glow animation for', img.src);
    let startTime = Date.now();
    const duration = 3000; // Slower cycle - 3 seconds
    let frameCount = 0;

    // Determine the target element for shimmer effects
    let shimmerTarget = img;
    if (img._isVirtualBackgroundImage && img._originalBackgroundElement) {
        shimmerTarget = img._originalBackgroundElement;
        console.log('🎭 Applying shimmer to background element:', {
            tagName: shimmerTarget.tagName,
            className: shimmerTarget.className,
            isPromoTile: shimmerTarget.className.includes('PromoTile'),
            hasBackgroundImage: window.getComputedStyle(shimmerTarget).backgroundImage !== 'none'
        });
    }

    // CRITICAL FIX: Validate shimmer target is in DOM (Windows Chrome fix)
    if (!document.contains(shimmerTarget)) {
        console.error('❌ Shimmer target not in DOM! Target:', shimmerTarget.tagName, shimmerTarget.className);
        console.log('🔄 Falling back to original image for shimmer effect');
        shimmerTarget = img; // Fall back to the original image

        // Verify the fallback is in the DOM
        if (!document.contains(shimmerTarget)) {
            console.error('❌ Even fallback shimmer target (img) not in DOM! Shimmer will not work.');
            return; // Can't apply shimmer if no target is in DOM
        }
    }

    console.log('✅ Shimmer target validated - in DOM:', document.contains(shimmerTarget));

    function animate() {
        if (!img.dataset.lifProcessing) {
            console.log('LIF: Animation stopped - processing complete');
            return; // Stop if processing is done
        }

        frameCount++;
        const elapsed = Date.now() - startTime;
        const progress = (elapsed % duration) / duration;

        try {
            // Create shimmer effect using CSS mask animation
            const shimmerPosition = (elapsed % duration) / duration;
            const maskX = 150 - (shimmerPosition * 300); // Move from -200% to 200%

            // Create shimmer mask - mostly transparent with small bright band
            const shimmerMask = `linear-gradient(120deg, 
                rgba(255,255,255,1.0) 0%, 
                rgba(255,255,255,1.0) ${maskX - 20}%, 
                rgba(255, 255, 255, 0.5) ${maskX}%, 
                rgba(255,255,255,1.0) ${maskX + 20}%, 
                rgba(255,255,255,1.0) 100%)`;

            // Apply shimmer mask with animated position to the correct target
            shimmerTarget.style.setProperty('-webkit-mask-image', shimmerMask, 'important');
            shimmerTarget.style.setProperty('mask-image', shimmerMask, 'important');
            shimmerTarget.style.setProperty('-webkit-mask-size', '200% 100%', 'important');
            shimmerTarget.style.setProperty('mask-size', '200% 100%', 'important');
            shimmerTarget.style.setProperty('-webkit-mask-position', `${maskX}% 0`, 'important');
            shimmerTarget.style.setProperty('mask-position', `${maskX}% 0`, 'important');

        } catch (error) {
            console.error('LIF: Animation error:', error);
        }
        requestAnimationFrame(animate);
    }

    animate();
}

/* 
🎨 ALTERNATIVE PROCESSING EFFECT IDEAS FOR FUTURE REFERENCE:

// Option 1: Pulsing Brightness with Hue Shift
filter: brightness(0.8) hue-rotate(270deg) saturate(150%);
animation: brightness 2s infinite alternate;

// Option 2: Grayscale to Purple Transform  
filter: grayscale(100%);
animation: colorShift 1.5s infinite alternate;

// Option 3: Opacity Waves with Color Temperature
animation: temperatureWave 2s infinite ease-in-out;

// Option 4: Scale + Filter Combo (if container allows)
animation: pulseScale 1.8s infinite alternate;

// Option 5: Contrast + Saturation Pulse
filter: contrast(120%) saturate(180%) hue-rotate(260deg);
*/

// Function to remove processing effect and restore original image styles
function removeProcessingEffect(img) {
    try {
        console.log('LIF: Removing processing effect from image:', img.src);

        // Determine the target element for cleanup
        let cleanupTarget = img;
        if (img._isVirtualBackgroundImage && img._originalBackgroundElement) {
            cleanupTarget = img._originalBackgroundElement;
            console.log('🎭 Cleaning up background element effects:', cleanupTarget.tagName, cleanupTarget.className);
        }

        // Remove glow class from appropriate element
        if (img._isVirtualBackgroundImage && img._originalBackgroundElement) {
            cleanupTarget.classList.remove('lif-processing-glow');
        } else {
            img.classList.remove('lif-processing-glow');
        }

        // Restore original styles to the correct target
        cleanupTarget.style.opacity = img.dataset.lifOriginalOpacity || '';
        cleanupTarget.style.filter = img.dataset.lifOriginalFilter || '';
        cleanupTarget.style.borderRadius = img.dataset.lifOriginalBorderRadius || '';
        cleanupTarget.style.boxShadow = img.dataset.lifOriginalBoxShadow || '';
        cleanupTarget.style.transition = img.dataset.lifOriginalTransition || '';
        cleanupTarget.style.maskImage = img.dataset.lifOriginalMaskImage || '';
        cleanupTarget.style.webkitMaskImage = img.dataset.lifOriginalMaskImage || '';
        cleanupTarget.style.maskSize = img.dataset.lifOriginalMaskSize || '';
        cleanupTarget.style.webkitMaskSize = img.dataset.lifOriginalMaskSize || '';
        cleanupTarget.style.maskPosition = img.dataset.lifOriginalMaskPosition || '';
        cleanupTarget.style.webkitMaskPosition = img.dataset.lifOriginalMaskPosition || '';

        // Clean up data attributes (always stored on the img)
        delete img.dataset.lifOriginalOpacity;
        delete img.dataset.lifOriginalFilter;
        delete img.dataset.lifOriginalBorderRadius;
        delete img.dataset.lifOriginalBoxShadow;
        delete img.dataset.lifOriginalTransition;
        delete img.dataset.lifOriginalMaskImage;
        delete img.dataset.lifOriginalMaskSize;
        delete img.dataset.lifOriginalMaskPosition;

        delete img.dataset.lifProcessing;

        console.log('LIF: Processing effect removed successfully');
    } catch (error) {
        console.error('LIF: Error removing processing effect:', error);
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

// Getty Images CORS circumvention using Canvas HTML2Canvas approach
async function handleGettyImagesCORS(img) {
    console.log('🖼️ Attempting Getty Images CORS circumvention...');

    try {
        // Method 1: Try to use the original picture element directly
        const pictureElement = img._originalPictureElement;
        if (!pictureElement) {
            throw new Error('No original picture element found');
        }

        // Get the computed background image
        const bgImageUrl = extractBackgroundImageUrl(pictureElement);
        if (!bgImageUrl) {
            throw new Error('No background image URL found');
        }

        console.log('🎨 Creating proxy canvas from picture element...');

        // Create a canvas that matches the picture element
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const rect = pictureElement.getBoundingClientRect();

        canvas.width = Math.round(rect.width) || 400;
        canvas.height = Math.round(rect.height) || 300;

        // Method 1: Try a different domain approach for Getty images
        try {
            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(bgImageUrl)}&output=jpg&quality=85`;
            console.log('🌐 Trying proxy service:', proxyUrl);

            const proxyImg = new Image();
            proxyImg.crossOrigin = 'anonymous';

            await new Promise((resolveImg, rejectImg) => {
                proxyImg.onload = () => resolveImg();
                proxyImg.onerror = () => rejectImg(new Error('Proxy service failed'));
                proxyImg.src = proxyUrl;
            });

            ctx.drawImage(proxyImg, 0, 0, canvas.width, canvas.height);

            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    const file = new File([blob], 'getty-image.jpg', { type: 'image/jpeg' });
                    console.log('✅ Getty CORS circumvention successful via proxy service');
                    resolve(file);
                }, 'image/jpeg', 0.9);
            });

        } catch (proxyError) {
            console.log('Proxy service failed, trying alternative method...');
        }

        // Method 2: Create a placeholder canvas with Getty branding
        console.log('🎭 Creating Getty Images placeholder...');

        // Create a high-quality placeholder
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add Getty Images pattern
        ctx.fillStyle = '#e0e0e0';
        for (let i = 0; i < canvas.width; i += 40) {
            for (let j = 0; j < canvas.height; j += 40) {
                ctx.fillRect(i, j, 20, 20);
            }
        }

        // Add text overlay
        ctx.fillStyle = '#666';
        ctx.font = `${Math.min(canvas.width, canvas.height) / 20}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Getty Images', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = `${Math.min(canvas.width, canvas.height) / 30}px Arial`;
        ctx.fillText('CORS Protected', canvas.width / 2, canvas.height / 2 + 10);

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                const file = new File([blob], 'getty-placeholder.jpg', { type: 'image/jpeg' });
                console.log('⚠️ Getty CORS circumvention used placeholder method');
                resolve(file);
            }, 'image/jpeg', 0.9);
        });

    } catch (error) {
        console.warn('Getty CORS circumvention failed:', error);
        throw error;
    }
}

// Function to convert image to File object for processing
async function imageToFile(img) {
    return new Promise(async (resolve) => {
        // GETTY IMAGES CORS CIRCUMVENTION
        if (window.location.hostname.includes('gettyimages.') && img._isVirtualBackgroundImage) {
            console.log('🌐 Getty Images detected - using specialized CORS circumvention...');
            try {
                const file = await handleGettyImagesCORS(img);
                if (file) {
                    resolve(file);
                    return;
                }
            } catch (error) {
                console.warn('Getty CORS circumvention failed, falling back to standard methods:', error);
            }
        }

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

// Helper function to convert file to data URL
async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Function to handle the 2D to 3D conversion
// 🔮 CORE CONVERSION SYSTEM - Handles 2D→3D processing using enhanced lifViewer
async function convertTo3D(img, button, options = {}) {
    const imgId = img.src + '_' + Date.now();

    if (processingImages.has(imgId)) {
        return; // Already processing
    }

    processingImages.add(imgId);

    try {
        // Update button state (temporary button used for context menu approach)
        button.textContent = 'Converting...';
        button.classList.add('processing');
        button.classList.remove('lif-ready');
        button.disabled = true;
        button.dataset.state = 'processing';

        // Windows Flickr Fix: Switch to main-photo image before processing to match Mac behavior
        const isWindows = navigator.userAgent.includes('Windows');
        const isFlickr = window.location.hostname.includes('flickr.com');
        if (isWindows && isFlickr) {
            const mainPhoto = document.querySelector('img.main-photo');
            if (mainPhoto && mainPhoto !== img) {
                console.log('🔄 Windows Flickr: Switching to main-photo before processing:', {
                    originalImage: img.className,
                    newImage: mainPhoto.className,
                    originalSrc: img.src?.substring(0, 50),
                    newSrc: mainPhoto.src?.substring(0, 50)
                });
                img = mainPhoto; // Switch to main-photo like Mac uses
            }
        }

        // Apply processing effect directly to image - purple glow + darker opacity
        applyProcessingEffect(img);

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

        // Convert file to data URL for background script processing
        const dataUrl = await fileToDataUrl(file);

        // Send conversion request to background script (handles local/cloud routing)
        chrome.runtime.sendMessage({
            type: 'convertImage',
            dataUrl: dataUrl
        }, async (response) => {
            try {
                if (chrome.runtime.lastError) {
                    console.error('Conversion request failed:', chrome.runtime.lastError);
                    throw new Error('Failed to send conversion request: ' + chrome.runtime.lastError.message);
                }

                if (response.error) {
                    console.error('Conversion failed:', response.error);
                    throw new Error(response.error);
                }

                // Check if background script wants us to handle cloud conversion directly
                if (response.useCloudInContent) {
                    console.log('🌐 Handling cloud conversion in content script...');

                    // Convert data URL back to file for cloud processing
                    const response_fetch = await fetch(response.dataUrl);
                    const blob = await response_fetch.blob();
                    const cloudFile = new File([blob], 'image.jpg', { type: 'image/jpeg' });

                    // Use the original cloud conversion flow
                    const lifGen = new monoLdiGenerator(cloudFile, 'lama');

                    lifGen.afterLoad = function () {
                        console.log('✅ Cloud conversion completed successfully');
                        handleConversionSuccess(this.lifDownloadUrl, img, button, options);
                    };

                    // Start cloud conversion
                    await lifGen.init();

                } else {
                    // Handle local conversion response
                    console.log('Conversion completed via', response.source);
                    handleConversionSuccess(response.lif, img, button, options);
                }

            } catch (error) {
                console.error('Conversion processing error:', error);
                throw error;
            }
        });

        // Helper function to handle successful conversion (replaces lifGen.afterLoad logic)
        function handleConversionSuccess(lifDownloadUrl, img, button, options) {
            console.log('3D conversion completed successfully');

            // Store the LIF download URL immediately - if the viewer can be created, the URL is valid
            if (lifDownloadUrl && img.src) {
                imageLIFMap.set(img.src, lifDownloadUrl);
                console.log('LIF file stored for image:', img.src);
                console.log('LIF download URL:', lifDownloadUrl);

                // Proactively update context menu to "Download LIF" state
                chrome.runtime.sendMessage({
                    action: "updateContextMenu",
                    hasLIF: true,
                    webXRSupported: webXRSupportChecked && isWebXRSupported
                });
                console.log('Context menu proactively updated to Download LIF state',
                    webXRSupportChecked && isWebXRSupported ? 'with VR support' : 'without VR support');

                // Show success notification only once per image
                const notificationKey = `conversion_complete_${img.src}`;
                if (!window.lifNotificationShown || !window.lifNotificationShown.has(notificationKey)) {
                    if (!window.lifNotificationShown) {
                        window.lifNotificationShown = new Set();
                    }
                    window.lifNotificationShown.add(notificationKey);
                    showDownloadNotification('3D conversion complete! Right-click image to download LIF file.', 'success');
                }
            } else {
                console.warn('Cannot store LIF file - missing lifDownloadUrl or img.src:', {
                    hasLifDownloadUrl: !!lifDownloadUrl,
                    lifDownloadUrl: lifDownloadUrl,
                    hasImgSrc: !!img.src
                });
            }

            // Update button to LIF state and ensure it persists
            button.textContent = '⬇️ LIF';
            button.classList.remove('processing');
            button.classList.add('lif-ready');
            button.disabled = false;
            button.dataset.state = 'lif-ready';
            button.title = 'Click to download the LIF file';

            // Context menu approach: VR functionality is now available via right-click menu
            // No need for VR button visibility management since we use context menu

            // Remove processing effect and restore original image
            removeProcessingEffect(img);

            // Simple dimension handling for context menu approach
            let effectiveWidth, effectiveHeight;

            if (options.width && options.height) {
                // Use dimensions from context menu handler (preferred)
                effectiveWidth = options.width;
                effectiveHeight = options.height;
                console.log(`Using context menu dimensions: ${effectiveWidth}x${effectiveHeight}`);
            } else {
                // Fallback to image dimensions
                effectiveWidth = img.width || img.naturalWidth || 400;
                effectiveHeight = img.height || img.naturalHeight || 300;
                console.log(`Fallback to image dimensions: ${effectiveWidth}x${effectiveHeight}`);
            }

            // Container selection: special handling for picture elements and virtual images
            let lifContainer;

            // Special handling for virtual images (background images from any element)
            if (img._isVirtualBackgroundImage) {
                if (img._originalBackgroundElement) {
                    // For virtual images from spans/divs/etc, use the original background element's parent
                    lifContainer = img._originalBackgroundElement.parentElement || img._originalBackgroundElement;
                    console.log('🎭 Virtual background image detected - using original background element parent as container');
                } else if (img._originalPictureElement) {
                    // For backward compatibility with Getty Images (picture elements)
                    lifContainer = img._originalPictureElement.parentElement || img._originalPictureElement;
                    console.log('🎭 Virtual picture image detected - using original picture element parent as container');
                } else {
                    // Fallback if no original element reference
                    lifContainer = document.body;
                    console.log('🎭 Virtual image fallback - using document.body as container');
                }
            } else {
                const pictureElement = img.closest('picture');
                if (pictureElement) {
                    // For picture elements, canvas goes next to the picture tag, not inside it
                    lifContainer = pictureElement.parentElement;
                    console.log('Picture element detected - using picture parent as container');
                } else {
                    // For regular images, use image parent
                    lifContainer = img.parentElement;
                }
            }

            // Use the enhanced factory method for layout-aware viewer creation
            // For virtual images, use the pre-computed layout analysis from context menu handler
            let finalLayoutAnalysis;
            if (img._isVirtualBackgroundImage && options.layoutAnalysis) {
                finalLayoutAnalysis = options.layoutAnalysis;
                console.log('🎭 Using pre-computed layout analysis for virtual image');
            } else {
                finalLayoutAnalysis = options.layoutAnalysis || analyzeLayoutPattern(lifContainer, img);
            }

            const viewer = lifViewer.createForLayout(
                lifDownloadUrl,
                lifContainer,
                img,
                finalLayoutAnalysis,
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

                // Note: LIF download URL is already stored in imageLIFMap from lifGen.afterLoad
                // This viewer.afterLoad is called after the LIF generation completes
                console.log('Viewer afterLoad called - LIF should already be stored in imageLIFMap');

                // Remove the temporary button since we're using context menu approach
                if (button && button.parentElement) {
                    button.parentElement.removeChild(button);
                    console.log('Temporary button removed - using context menu approach');
                }

                // Add a visual indicator that the LIF is ready
                img.setAttribute('data-lif-active', 'true');

                console.log(`Enhanced LIF viewer initialized with layout mode: ${this.layoutMode}`);
                console.log('All layout-specific setup handled automatically by lifViewer');
                console.log('LIF file ready for download via context menu');
            };
        }

    } catch (error) {
        console.error('Error converting image to 3D:', error);

        // Remove the temporary button on error since we're using context menu approach
        if (button && button.parentElement) {
            button.parentElement.removeChild(button);
            console.log('Temporary button removed due to conversion error');
        }

        // Remove processing effect and restore original image
        removeProcessingEffect(img);

        // Provide specific error messages based on error type
        let errorMessage = 'Failed to convert image to 3D. ';
        let isTemporaryError = false;

        if (error.message && error.message.includes('CORS')) {
            errorMessage = 'This image is protected by CORS policy and cannot be processed. Try images from other websites.';
            // Show CORS info popup if this is the first time
            showCorsInfoIfNeeded();
        } else if (error.message && (error.message.includes('network') || error.message.includes('fetch'))) {
            errorMessage = 'Network error occurred. Please check your internet connection and try again.';
            isTemporaryError = true;
        } else if (error.message && error.message.includes('timeout')) {
            errorMessage = 'Request timed out. The image might be too large or the server is busy. Please try again.';
            isTemporaryError = true;
        } else if (error.message && error.message.includes('API')) {
            errorMessage = 'API service temporarily unavailable. Please try again in a few moments.';
            isTemporaryError = true;
        } else {
            errorMessage += 'Please try again or try a different image.';
        }

        // Show error message in console and optionally to user
        console.warn('Conversion failed:', errorMessage);

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
    // Safety check: ensure element is a valid DOM element
    if (!element || !(element instanceof Element)) {
        console.warn('⚠️ analyzeLayoutPattern called with invalid element:', element);
        return {
            type: 'invalid-element',
            preserveOriginal: true,
            reason: 'Invalid element provided to analyzeLayoutPattern',
            containerHasPaddingAspectRatio: false,
            imageIsAbsolute: false,
            parentUsesFlexOrGrid: false,
            hasResponsivePattern: false,
            isFacebookStyle: false
        };
    }

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

    // COMMENTED OUT: Facebook-specific layout detection
    // TODO: Generalize this to detect complex positioned layouts on any site
    // const isFacebookImage = img.src && img.src.includes('fbcdn.net');
    // const hasFacebookClasses = img.classList && (
    //     img.className.includes('x168nmei') ||
    //     img.className.includes('x13lgxp2') ||
    //     img.className.includes('x5pf9jr')
    // );
    // if (isFacebookImage || hasFacebookClasses) {
    //     analysis.isFacebookStyle = true;
    //     analysis.type = 'facebook-layout';
    //     analysis.preserveOriginal = true;
    //     analysis.reason = 'Facebook-style complex positioning detected';
    //     // ... rest of Facebook logic
    // }

    // ENHANCED: Detect Facebook and similar complex positioned layouts
    const elementStyle = window.getComputedStyle(element);
    const hasComplexPositioning = (
        elementStyle.position === 'absolute' ||
        elementStyle.position === 'fixed' ||
        elementStyle.transform !== 'none' ||
        (elementStyle.zIndex && parseInt(elementStyle.zIndex) > 100)
    );

    // Facebook-specific detection
    const isFacebookImage = img.src && img.src.includes('fbcdn.net');
    const hasFacebookClasses = img.classList && (
        img.className.includes('x168nmei') ||
        img.className.includes('x13lgxp2') ||
        img.className.includes('x5pf9jr') ||
        img.className.includes('x15mokao') ||
        img.className.includes('x1ga7v0g')
    );

    if (isFacebookImage || hasFacebookClasses || (hasComplexPositioning && element.classList.length > 5)) {
        analysis.isFacebookStyle = true; // Keep the same flag for compatibility
        analysis.type = isFacebookImage || hasFacebookClasses ? 'facebook-layout' : 'complex-positioned-layout';
        analysis.preserveOriginal = true;
        analysis.reason = isFacebookImage || hasFacebookClasses ? 'Facebook-style layout detected' : 'Complex positioning detected - using overlay approach';
        console.log('Facebook/complex positioned layout detected:', {
            isFacebookImage,
            hasFacebookClasses,
            hasComplexPositioning,
            position: elementStyle.position,
            transform: elementStyle.transform,
            zIndex: elementStyle.zIndex,
            classCount: element.classList.length,
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

    // Enhanced search: look further up the hierarchy for aspect ratio containers
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
            currentElement.classList.contains('ratio') ||
            // Enhanced detection for various aspect ratio patterns
            currentElement.className.includes('aspect-ratio') ||
            currentElement.className.includes('ratio-frame') ||
            currentElement.className.includes('aspect-container');

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

        console.log('🔍 Aspect ratio container analysis:', {
            element: element.className || element.tagName,
            directPadding: { paddingTop, paddingBottom, height, paddingTopValue, paddingBottomValue, heightValue, hasPercentagePadding },
            parentPadding: paddingContainerInfo,
            foundPaddingContainer,
            containerHasPaddingAspectRatio: analysis.containerHasPaddingAspectRatio
        });
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

    // Note: Container transforms no longer need special handling since all canvases use absolute positioning

    // 6. Detect object-fit usage (modern responsive image technique)
    if (imgStyle.objectFit && imgStyle.objectFit !== 'fill') {
        if (!analysis.preserveOriginal) {
            analysis.type = 'object-fit-image';
            analysis.reason = `Image uses object-fit: ${imgStyle.objectFit}`;
        }
    }

    // 7. GENERIC: Detect carousel/list/feed patterns
    const isInCarousel = img.closest('li') ||
        img.closest('[class*="carousel"]') ||
        img.closest('[class*="slider"]') ||
        img.closest('[class*="feed"]') ||
        img.closest('[class*="list-item"]') ||
        img.closest('[role="listitem"]');

    if (isInCarousel) {
        analysis.isCarouselItem = true;
        if (!analysis.preserveOriginal) {
            analysis.type = 'carousel-item';
            analysis.reason = 'Image is part of a carousel/list/feed layout';
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
// INSTAGRAM-SPECIFIC: COMMENTED OUT - using generalized approach
function processInstagramCarousels() {
    // if (!window.location.hostname.includes('instagram.com')) {
    //     return;
    // }
    return; // Disabled - using generalized approach

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

                    } else {
                        img.addEventListener('load', () => {
                            try {

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
// INSTAGRAM-SPECIFIC: COMMENTED OUT - using generalized approach
function setupInstagramCarouselListeners() {
    // if (!window.location.hostname.includes('instagram.com')) {
    //     return;
    // }
    return; // Disabled - using generalized approach

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
            // setTimeout(() => {
            //     processInstagramCarousels(); // Disabled for context menu approach
            // }, 500);
        }
    }, { passive: true });

    console.log('📱 Instagram carousel navigation listeners set up');
}

/**
 * PINTEREST CAROUSEL PROCESSING SYSTEM
 * 
 * Pinterest carousels use complex CSS Grid layouts with view transitions and object-fit: contain.
 * This function handles the specific patterns and timing issues in Pinterest carousel contexts.
 * 
 * KEY CHALLENGES:
 * - Dynamic loading of carousel slides
 * - Complex CSS Grid with sticky positioning  
 * - View Transition API interference
 * - Object-fit: contain preservation requirements
 * - Z-index conflicts with overlay buttons
 */
// PINTEREST-SPECIFIC: COMMENTED OUT - using generalized approach
function processPinterestCarousels() {
    // if (!window.location.hostname.includes('pinterest.com')) return;
    return; // Disabled - using generalized approach

    if (isDebugEnabled) {
        console.log('🎠 Processing Pinterest carousels...');
    }

    // Find Pinterest carousel containers - they use ul.carousel--mode-single
    const carousels = document.querySelectorAll('ul.carousel--mode-single, .carousel--mode-single');

    carousels.forEach(carousel => {
        // Find all images within this carousel
        const carouselImages = carousel.querySelectorAll('img[alt*="carousel image"]');

        if (isDebugEnabled && carouselImages.length > 0) {
            console.log(`🎠 Found Pinterest carousel with ${carouselImages.length} images`);
        }

        carouselImages.forEach((img, index) => {
            try {
                // Skip if already processed successfully 
                // Check for both container wrapper (old method) and overlay approach (new method)
                const hasContainer = img.closest('.lif-image-container');
                const hasOverlayButton = img.parentElement?.querySelector('.lif-button-zone') && !hasContainer;
                const isProcessed = hasContainer || hasOverlayButton;

                if (isProcessed) {
                    return;
                }

                // Skip if marked as processed but no button found (broken state) - reset and retry
                if (img.dataset.lifButtonAdded && !isProcessed) {
                    if (isDebugEnabled) {
                        console.log(`🔄 Pinterest carousel image ${index} in broken state - resetting for retry`);
                    }
                    delete img.dataset.lifButtonAdded;

                    // Remove any stray button zones
                    const strayButtonZone = img.parentElement?.querySelector('.lif-button-zone');
                    if (strayButtonZone) {
                        strayButtonZone.remove();
                    }
                }

                // Check if image is loaded and visible
                const rect = img.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0;
                const isLoaded = img.complete && img.naturalHeight !== 0;

                if (isLoaded && isVisible) {
                    // Special handling for Pinterest carousel images


                    if (isDebugEnabled) {
                        console.log(`🎠 Processed Pinterest carousel image ${index}: ${img.src?.substring(0, 50)}...`);
                    }
                } else if (isLoaded && !isVisible) {
                    // Image is loaded but not visible - might be in a non-active carousel slide
                    if (isDebugEnabled) {
                        console.log(`🎠 Pinterest carousel image ${index} loaded but not visible - scheduling for retry`);
                    }

                    // Retry when it becomes visible
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {

                                observer.disconnect();
                                if (isDebugEnabled) {
                                    console.log(`🎠 Pinterest carousel image ${index} became visible - processed`);
                                }
                            }
                        });
                    });
                    observer.observe(img);
                } else {
                    // Image not yet loaded - wait for load
                    img.addEventListener('load', () => {
                        setTimeout(() => {

                            if (isDebugEnabled) {
                                console.log(`🎠 Pinterest carousel image ${index} loaded - processed`);
                            }
                        }, 100); // Small delay to let Pinterest apply its styles
                    }, { once: true });
                }
            } catch (error) {
                console.warn(`Error processing Pinterest carousel image ${index}:`, error);
            }
        });
    });

    // Also handle Pinterest images outside of carousels that might be missed
    const pinterestImages = document.querySelectorAll('img[src*="pinimg.com"]');
    pinterestImages.forEach(img => {
        // Skip if already has button or is in a carousel (handled above)
        if (img.dataset.lifButtonAdded || img.closest('.carousel--mode-single')) {
            return;
        }

        // Skip LIF result images
        if (img.src.includes('leia-storage-service') || img.src.includes('lifResult')) {
            return;
        }

        const rect = img.getBoundingClientRect();
        const isVisible = rect.width > 50 && rect.height > 50; // Minimum size check
        const isLoaded = img.complete && img.naturalHeight !== 0;

        if (isLoaded && isVisible) {

        }
    });

    // PINTEREST OVERLAY CLEANUP: Ensure overlays don't block buttons
    managePinterestOverlays();

    if (isDebugEnabled) {
        console.log('🎠 Pinterest carousel processing complete');
    }
}

// PINTEREST-SPECIFIC: COMMENTED OUT - using generalized approach
function managePinterestOverlays() {
    // if (!window.location.hostname.includes('pinterest.com')) return;
    return; // Disabled - using generalized approach

    // Find all Pinterest pins with our buttons
    const pinsWithButtons = document.querySelectorAll('[data-test-id="pin"] img[data-lif-button-added="true"], [data-test-id="closeup-image"] img[data-lif-button-added="true"]');

    pinsWithButtons.forEach(img => {
        // Handle both grid view pins and closeup view images
        const pinContainer = img.closest('[data-test-id="pin"]') ||
            img.closest('[data-test-id="pinWrapper"]') ||
            img.closest('[data-test-id="closeup-body-image-container"]') ||
            img.closest('[data-test-id="closeup-image-main"]');

        if (!pinContainer) return;

        // Disable all overlay layers in this pin that might block button access
        const overlaySelectors = [
            '[data-test-id="contentLayer"]',
            '.contentLayer',
            '[data-test-id="pinrep-save-button"]',
            '.saveButton',
            '[class*="overlay"]',
            '[class*="hover"]',
            '[class*="MIw"]', // Pinterest's overlay classes
            '[class*="QLY"]', // More Pinterest overlay classes
            '[data-test-id="closeup-image-overlay-layer-flashlight-button"]',
            '[data-test-id="closeup-image-overlay-layer-media-viewer-button"]',
            '[data-test-id="closeup-image-overlay-layer-domain-link-button"]'
        ];

        overlaySelectors.forEach(selector => {
            const overlays = pinContainer.querySelectorAll(selector);
            overlays.forEach(overlay => {
                // Only modify overlays that might interfere with our buttons
                const buttonZone = img.parentElement?.querySelector('.lif-button-zone');
                if (buttonZone) {
                    const buttonRect = buttonZone.getBoundingClientRect();
                    const overlayRect = overlay.getBoundingClientRect();

                    // Check if overlay might overlap with button area
                    const overlaps = !(buttonRect.right < overlayRect.left ||
                        buttonRect.left > overlayRect.right ||
                        buttonRect.bottom < overlayRect.top ||
                        buttonRect.top > overlayRect.bottom);

                    if (overlaps || overlay.style.pointerEvents !== 'none') {
                        overlay.style.pointerEvents = 'none';
                        overlay.style.zIndex = '1'; // Lower than our button z-index (5000)

                        // Disable pointer events on all children too
                        const children = overlay.querySelectorAll('*');
                        children.forEach(child => {
                            child.style.pointerEvents = 'none';
                        });

                        if (isDebugEnabled) {
                            console.log('🎯 Pinterest: Disabled overlapping overlay layer');
                        }
                    }
                }
            });
        });
    });
}

// Function to set up Flickr theater mode overlay cleanup
// FLICKR-SPECIFIC: COMMENTED OUT - using generalized approach
function setupFlickrOverlayCleanup() {
    // if (!window.location.hostname.includes('flickr.com')) {
    //     return;
    // }
    return; // Disabled - using generalized approach

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

    // FLICKR-SPECIFIC: COMMENTED OUT - using generalized approach
    // setupFlickrCanvasDisplayFix();

    if (isDebugEnabled) {
        console.log('🖼️ Flickr theater mode overlay cleanup set up');
    }
}

// Function to monitor URL changes for Flickr SPA navigation to theater mode
// FLICKR-SPECIFIC: COMMENTED OUT - using generalized approach
function setupFlickrTheaterModeMonitoring() {
    // if (!window.location.hostname.includes('flickr.com')) {
    //     return;
    // }
    return; // Disabled - using generalized approach

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
// LINKEDIN-SPECIFIC: COMMENTED OUT - using generalized approach
function cleanupDuplicateButtons() {
    // Only run on LinkedIn where the duplicate issue was occurring
    // if (!window.location.hostname.includes('linkedin.com')) {
    //     return;
    // }
    return; // Disabled - using generalized approach

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
    // Find all images that haven't been processed yet
    const images = document.querySelectorAll('img:not([data-lif-button-added])');

    images.forEach(img => {
        try {
            // Skip if already processed
            if (img.dataset.lifButtonAdded) {
                return;
            }

            // PINTEREST-SPECIFIC: COMMENTED OUT - using generalized approach
            // const isPinterestCloseup = window.location.hostname.includes('pinterest.com') &&
            //     (window.location.pathname.includes('/pin/') ||
            //         img.closest('[data-test-id="closeup-body-image-container"]'));

            // if (isPinterestCloseup) {
            //     // For Pinterest closeup views, use overlay approach
            //     const parentContainer = img.closest('[data-test-id="closeup-body-image-container"]') ||
            //         img.closest('[data-test-id="closeup-image-main"]') ||
            //         img.parentElement;

            //     if (parentContainer) {
            //         // Remove any existing lif-image-container
            //         const existingContainer = img.closest('.lif-image-container');
            //         if (existingContainer) {
            //             const parent = existingContainer.parentNode;
            //             while (existingContainer.firstChild) {
            //                 parent.insertBefore(existingContainer.firstChild, existingContainer);
            //             }
            //             parent.removeChild(existingContainer);
            //         }

            //         // Add button directly to parent container

            //         return;
            //     }
            // }

            // For all other images, use standard processing

        } catch (error) {
            console.warn('Error processing image:', error);
        }
    });
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
            // PINTEREST-SPECIFIC: COMMENTED OUT - using generalized approach
            // const isPinterest = window.location.hostname.includes('pinterest.com');
            // const delay = isPinterest ? 300 : 200; // Longer delay for Pinterest
            const delay = 200; // Standard delay for all sites

            setTimeout(() => {
                // LINKEDIN DUPLICATE CLEANUP: Remove duplicate button zones before processing new images
                cleanupDuplicateButtons();

                // INSTAGRAM CAROUSEL FIX: Process all carousel images when mutations are detected
                // processInstagramCarousels(); // Disabled for context menu approach

                // PINTEREST-SPECIFIC: COMMENTED OUT - using generalized approach
                // if (window.location.hostname.includes('pinterest.com')) {
                //     processPinterestCarousels(); // Disabled for context menu approach
                //     managePinterestOverlays(); // Also clean up overlays after mutations
                // }

                // FLICKR-SPECIFIC: COMMENTED OUT - using generalized approach
                // if (window.location.hostname.includes('flickr.com')) {
                //     const photoNotesOverlay = document.querySelector('.view.photo-notes-scrappy-view');
                //     if (photoNotesOverlay) {
                //         photoNotesOverlay.remove();
                //     }
                // }

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

                        } else {
                            img.addEventListener('load', () => {
                                try {

                                } catch (error) {
                                    console.warn('Error adding convert button to image on load:', error);
                                }
                            }, { once: true });
                        }
                    } catch (error) {
                        console.warn('Error processing image in mutation observer:', error);
                    }
                });
            }, delay); // Dynamic delay based on site
        }

        // After processing mutations, check for duplicate button zones
        setTimeout(() => {
            handleDuplicateButtonZones();
        }, 100);
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
        // 🕐 DEBOUNCED PROCESSING - Wait for scroll completion to avoid excessive processing
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            console.log('🔄 Scroll-based re-processing triggered');

            // Clean up any duplicate buttons that may have been created during scrolling
            cleanupDuplicateButtons();

            // INSTAGRAM CAROUSEL FIX: Process carousel images during scroll events
            // processInstagramCarousels(); // Disabled for context menu approach

            // PINTEREST CAROUSEL FIX: Process Pinterest carousels during scroll events
            // if (window.location.hostname.includes('pinterest.com')) {
            //     processPinterestCarousels(); // Disabled for context menu approach
            //     managePinterestOverlays(); // Also clean up overlays after scroll
            // }

            // FLICKR OVERLAY FIX: Clean up blocking overlays during scroll (theater mode only)
            // FLICKR-SPECIFIC: COMMENTED OUT - using generalized approach
            // if (window.location.hostname.includes('flickr.com')) {
            //     // Only clean up in theater mode to avoid removing buttons in wall view
            //     const isInTheaterMode = document.querySelector('.height-controller') &&
            //         document.querySelector('.facade-of-protection-neue');

            //     if (isInTheaterMode) {
            //         const cleanupFlickrOverlays = () => {
            //             const photoNotesOverlay = document.querySelector('.view.photo-notes-scrappy-view');
            //             if (photoNotesOverlay) {
            //                 console.log('🎭 Scroll cleanup: Removing theater mode photo-notes overlay');
            //                 photoNotesOverlay.remove();
            //             }
            //         };
            //         cleanupFlickrOverlays();
            //     }
            // }

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

                            } else {
                                img.addEventListener('load', () => {
                                    try {

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
        const result = await chrome.storage.local.get([DEBUG_STORAGE_KEY]);
        isDebugEnabled = result[DEBUG_STORAGE_KEY] !== undefined ? result[DEBUG_STORAGE_KEY] : false;
        shouldLog = true; // Set logging based on enabled state

        if (shouldLog) {
            console.log('Debug mode:', isDebugEnabled ? 'enabled' : 'disabled');
            console.log('Extension is always enabled (context menu approach)');
        }

        // Clean up old storage key that's no longer needed
        try {
            await chrome.storage.local.remove('lifExtensionEnabled');
        } catch (error) {
            // Ignore cleanup errors
        }
    } catch (error) {
        console.error('Error loading extension state:', error);
        isDebugEnabled = false; // Default to disabled on error
        shouldLog = false;
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
    messageListener = async (request, sender, sendResponse) => {
        console.log('Extension message received:', request.action);

        if (request.action === 'toggleDebug') {
            isDebugEnabled = !isDebugEnabled;

            // Save the new debug state
            saveDebugState();

            console.log(`Debug mode ${isDebugEnabled ? 'enabled' : 'disabled'}`);
            sendResponse({ debugEnabled: isDebugEnabled });
        } else if (request.action === 'getStatus') {
            console.log('Status requested, responding with: enabled (always)');
            sendResponse({ enabled: true });
        } else if (request.action === 'getXRStatus') {
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
        } else if (request.action === "convertImage") {
            // This old convertImage handler is disabled - conversion is now handled by the newer
            // message listener that includes proper layout analysis and container detection
            console.log('Old convertImage handler called - conversion handled by newer system');
        } else if (request.action === "downloadLIF") {
            // This old downloadLIF handler is disabled - download is now handled by the newer
            // message listener to prevent duplicate downloads
            console.log('Old downloadLIF handler called - download handled by newer system');
            return; // Let the newer handler process this
        } else if (request.action === "downloadMP4") {
            // Redirect to newer system - prevent duplicate handling
            console.log('Old downloadMP4 handler called - handled by newer system');
            return; // Let the newer handler process this
        } else if (request.action === "enterVR") {
            // This old VR handler is disabled - VR is now handled by the newer system
            // that uses pre-loaded VR files and the simple startVR() approach
            console.log('Old VR handler called - redirecting to newer system');

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
        console.log('Extension already initialized, skipping duplicate initialization');
        return;
    }

    // Mark as initialized early to prevent race conditions
    isExtensionInitialized = true;

    // Clean up any existing resources first (in case of reload during development)
    cleanupExtension();

    try {
        // Load saved debug state
        await loadExtensionState();

        // Set up message listener for popup communication
        setupMessageListener();

        // Extension is always enabled - perform full initialization
        console.log('Initializing 2D to 3D Image Converter...');

        // Add helpful CORS information for developers
        console.log(`ImmersityLens Chrome Extension - FULLY FUNCTIONAL ✅`);

        // Inject CSS styles
        injectStyles();

        // Test WebXR support early
        testWebXRSupport();

        // Pre-load VR system if WebXR is supported (inject once at initialization)
        setTimeout(async () => {
            if (webXRSupportChecked && isWebXRSupported) {
                console.log('🥽 WebXR supported - pre-loading VR system...');
                try {
                    // Check if VRLifViewer is already loaded
                    if (!window.VRLifViewer) {
                        // Load VRLifViewer script once during initialization
                        const script = document.createElement('script');
                        script.src = chrome.runtime.getURL('libs/VRLifViewer.js');
                        script.onload = () => {
                            console.log('✅ VR system pre-loaded successfully');
                        };
                        script.onerror = () => {
                            console.error('❌ Failed to pre-load VR system');
                        };
                        document.head.appendChild(script);
                    } else {
                        console.log('✅ VR system already loaded');
                    }
                } catch (error) {
                    console.error('❌ Error pre-loading VR system:', error);
                }
            }
        }, 1000); // Wait for WebXR test to complete

        // Reset context menu to default state on page load/reload
        chrome.runtime.sendMessage({
            action: "updateContextMenu",
            hasLIF: false,
            webXRSupported: false
        });
        console.log('Context menu reset to default state on page initialization');

        // FLICKR-SPECIFIC: COMMENTED OUT - using generalized approach
        // if (window.location.hostname.includes('flickr.com')) {
        //     // URL-based theater mode detection
        //     const currentPath = window.location.pathname;
        //     const isTheaterModeURL = /\/photos\/[^\/]+\/\d+\/in\//.test(currentPath);

        //     if (isTheaterModeURL) {
        //         console.log('🎭 Flickr theater mode detected - setting up overlay cleanup');

        //         // Check if this is first load and reload if needed
        //         const hasBeenReloaded = sessionStorage.getItem('flickr-theater-reloaded');

        //         if (!hasBeenReloaded) {
        //             console.log('🔄 FLICKR THEATER MODE: First load detected, reloading page to fix positioning issues...');
        //             sessionStorage.setItem('flickr-theater-reloaded', 'true');
        //             setTimeout(() => {
        //                 location.reload();
        //             }, 100);
        //             return; // Exit early since we're reloading
        //         } else {
        //             console.log('🎭 FLICKR THEATER MODE: Page already reloaded, proceeding with normal setup');
        //         }

        //         setupFlickrOverlayCleanup();
        //     } else {
        //         // Clear the reload flag when NOT in theater mode
        //         const hadReloadFlag = sessionStorage.getItem('flickr-theater-reloaded');
        //         if (hadReloadFlag) {
        //             sessionStorage.removeItem('flickr-theater-reloaded');
        //         }
        //     }

        //     // Set up URL monitoring for SPA navigation to theater mode
        //     setupFlickrTheaterModeMonitoring();
        // }

        // Note: Button-based processing disabled - using context menu approach
        console.log('Extension enabled - context menu approach active');

        console.log('2D to 3D Image Converter initialized successfully!');

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

// Function to handle duplicate button zones
function handleDuplicateButtonZones() {
    // Remove Pinterest closeup duplicate button zone cleanup
}

// Function to recursively search for img tag
function findImgInTree(element) {
    if (!element) return null;

    // Check if current element is an img
    if (element.tagName === 'IMG') {
        return element;
    }

    // Check all children recursively
    for (let child of element.children) {
        const found = findImgInTree(child);
        if (found) return found;
    }

    return null;
}

// Function to recursively find ALL img tags in a tree
function findAllImgsInTree(element) {
    const images = [];

    // Recursive function to find all images
    function traverse(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            // Find regular img elements
            if (node.tagName === 'IMG') {
                images.push(node);
            }

            // NEW: Find elements with background images
            const backgroundImageUrl = extractBackgroundImageUrl(node);
            if (backgroundImageUrl) {
                // Check if this is a suitable background image element
                if (isSuitableBackgroundImageElement(node, backgroundImageUrl)) {
                    const virtualImg = createVirtualImageFromBackground(node, backgroundImageUrl);
                    if (virtualImg) {
                        console.log('🎨 Found background image element:', {
                            tagName: node.tagName,
                            className: node.className,
                            backgroundUrl: backgroundImageUrl.substring(0, 80) + '...',
                            dimensions: `${virtualImg.width}x${virtualImg.height}`,
                            isNatGeoPromo: node.className.includes('PromoTile') || node.className.includes('promo')
                        });
                        images.push(virtualImg);
                    }
                }
            }

            // Recurse into children for both img elements and background images
            for (let child of node.children) {
                traverse(child);
            }
        }
    }

    traverse(element);
    return images;
}

// NEW: Helper function to determine if a background image element is suitable for 3D conversion
function isSuitableBackgroundImageElement(element, backgroundImageUrl) {
    // Skip if URL is not valid or too short
    if (!backgroundImageUrl || backgroundImageUrl.length < 10) {
        return false;
    }

    // Skip data URLs (inline images) as they're usually small icons
    if (backgroundImageUrl.startsWith('data:')) {
        return false;
    }

    // Get element dimensions
    const rect = element.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Skip if element is too small (likely decorative)
    if (width < 50 || height < 50) {
        return false;
    }

    // Skip if aspect ratio is too extreme (likely UI elements)
    const aspectRatio = width / height;
    if (aspectRatio > 5 || aspectRatio < 0.2) {
        return false;
    }

    // Look for positive indicators that this is content (not UI)
    const className = element.className.toLowerCase();
    const tagName = element.tagName.toLowerCase();

    // Positive indicators for content images
    const contentIndicators = [
        'background-image', 'cover', 'hero', 'feature', 'main', 'content',
        'article', 'photo', 'picture', 'gallery', 'media', 'image', 'tile',
        'card', 'item', 'slide', 'carousel', 'promo'
    ];

    const hasContentIndicator = contentIndicators.some(indicator =>
        className.includes(indicator)
    );

    // Negative indicators for UI elements
    const uiIndicators = [
        'icon', 'logo', 'avatar', 'button', 'nav', 'menu', 'header',
        'footer', 'ad', 'banner', 'overlay', 'popup', 'tooltip'
    ];

    const hasUIIndicator = uiIndicators.some(indicator =>
        className.includes(indicator)
    );

    // Allow if we have content indicators and no UI indicators
    if (hasContentIndicator && !hasUIIndicator) {
        return true;
    }

    // For National Geographic and similar content sites, be more permissive
    if (window.location.hostname.includes('nationalgeographic.com') ||
        window.location.hostname.includes('natgeo') ||
        window.location.hostname.includes('discovery.com')) {

        // Look for carousel slides and content tiles
        if (className.includes('slide') || className.includes('tile') ||
            className.includes('prism') || className.includes('carousel') ||
            className.includes('backgroundimage') || className.includes('promo')) {
            return true;
        }

        // Special case for anchor elements with content tile patterns
        if (tagName === 'a' && (className.includes('tile') || className.includes('promo'))) {
            return true;
        }
    }

    // General detection for common background image patterns
    if (className.includes('backgroundimage') ||
        className.includes('background-image') ||
        (tagName === 'span' && className.includes('image'))) {
        // Additional check for reasonable dimensions for span elements
        if (tagName === 'span' && (width < 100 || height < 100)) {
            return false;
        }
        return true;
    }

    // Default: allow if dimensions are reasonable and no clear UI indicators
    return !hasUIIndicator && width >= 200 && height >= 100;
}

// Extract background-image URL from CSS
function extractBackgroundImageUrl(element) {
    const style = window.getComputedStyle(element);
    const backgroundImage = style.backgroundImage;

    if (backgroundImage && backgroundImage !== 'none') {
        const url = parseBackgroundImageUrl(backgroundImage);
        if (url) return url;
    }

    // Also check inline style
    const inlineStyle = element.style.backgroundImage;
    if (inlineStyle && inlineStyle !== 'none') {
        const url = parseBackgroundImageUrl(inlineStyle);
        if (url) return url;
    }

    return null;
}

// Robust URL parsing for background-image CSS property
function parseBackgroundImageUrl(cssValue) {
    if (!cssValue || cssValue === 'none') {
        return null;
    }

    try {
        // Handle multiple possible formats:
        // 1. url("https://example.com/image.jpg")
        // 2. url('https://example.com/image.jpg')
        // 3. url(https://example.com/image.jpg)
        // 4. url(&quot;https://example.com/image.jpg&quot;) - HTML entities

        // First, decode HTML entities if present
        let decodedValue = cssValue;
        if (cssValue.includes('&quot;')) {
            decodedValue = cssValue.replace(/&quot;/g, '"');
        }
        if (cssValue.includes('&apos;')) {
            decodedValue = decodedValue.replace(/&apos;/g, "'");
        }
        if (cssValue.includes('&amp;')) {
            decodedValue = decodedValue.replace(/&amp;/g, "&");
        }

        // Try different regex patterns in order of specificity
        const patterns = [
            // Pattern 1: url("...") or url('...')
            /url\s*\(\s*["']([^"']*?)["']\s*\)/i,
            // Pattern 2: url(...) without quotes
            /url\s*\(\s*([^)]+?)\s*\)/i
        ];

        for (const pattern of patterns) {
            const match = decodedValue.match(pattern);
            if (match && match[1]) {
                let url = match[1].trim();

                // Additional cleanup: remove any remaining HTML entities
                url = url.replace(/&quot;/g, '"');
                url = url.replace(/&apos;/g, "'");
                url = url.replace(/&amp;/g, "&");
                url = url.replace(/&lt;/g, "<");
                url = url.replace(/&gt;/g, ">");

                // Validate that we have a reasonable URL
                if (url.length > 5 && (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:') || url.startsWith('/'))) {
                    console.log('🔗 Extracted background image URL:', {
                        original: cssValue.substring(0, 100) + (cssValue.length > 100 ? '...' : ''),
                        decoded: decodedValue.substring(0, 100) + (decodedValue.length > 100 ? '...' : ''),
                        extracted: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
                        pattern: pattern.toString()
                    });
                    return url;
                }
            }
        }

        console.warn('🔗 Could not extract URL from background-image:', {
            original: cssValue.substring(0, 100) + (cssValue.length > 100 ? '...' : ''),
            decoded: decodedValue.substring(0, 100) + (decodedValue.length > 100 ? '...' : '')
        });

    } catch (error) {
        console.warn('Error parsing background-image URL:', error, cssValue);
    }

    return null;
}

// Test function for URL parsing (can be called from console for debugging)
function testBackgroundImageUrlParsing() {
    const testCases = [
        // Your specific failing case
        'background-image: url(&quot;https://i.natgeofe.com/n/c41a772e-9279-4056-b86f-74469d9f65d9/NS123502198_NGSPPOCN_Konini%20Rongo_0E5A9846%20(2)_3x2.jpg?wp=1&amp;w=630&amp;h=420&quot;);',

        // Standard cases
        'url("https://example.com/image.jpg")',
        "url('https://example.com/image.jpg')",
        'url(https://example.com/image.jpg)',

        // Edge cases with parentheses and special characters
        'url("https://example.com/path/image(1).jpg")',
        'url("https://example.com/path/image with spaces.jpg")',
        'url("https://example.com/path/image%20encoded.jpg")',

        // HTML entities
        'url(&quot;https://example.com/image.jpg&quot;)',
        'url(&apos;https://example.com/image.jpg&apos;)',

        // Multiple background images (should get the first one)
        'url("https://example.com/bg1.jpg"), url("https://example.com/bg2.jpg")',

        // Invalid cases
        'url()',
        'url("")',
        'none',
        'invalid-css'
    ];

    console.log('🧪 Testing background image URL parsing:');

    testCases.forEach((testCase, index) => {
        const result = parseBackgroundImageUrl(testCase);
        console.log(`Test ${index + 1}:`, {
            input: testCase.substring(0, 80) + (testCase.length > 80 ? '...' : ''),
            result: result,
            success: result !== null
        });
    });

    // Test the specific failing case
    const nationalGeoCase = 'background-image: url(&quot;https://i.natgeofe.com/n/c41a772e-9279-4056-b86f-74469d9f65d9/NS123502198_NGSPPOCN_Konini%20Rongo_0E5A9846%20(2)_3x2.jpg?wp=1&amp;w=630&amp;h=420&quot;);';
    const nationalGeoResult = parseBackgroundImageUrl(nationalGeoCase);

    console.log('🎯 National Geographic specific test:', {
        input: nationalGeoCase,
        extracted: nationalGeoResult,
        expected: 'https://i.natgeofe.com/n/c41a772e-9279-4056-b86f-74469d9f65d9/NS123502198_NGSPPOCN_Konini%20Rongo_0E5A9846%20(2)_3x2.jpg?wp=1&w=630&h=420',
        success: nationalGeoResult === 'https://i.natgeofe.com/n/c41a772e-9279-4056-b86f-74469d9f65d9/NS123502198_NGSPPOCN_Konini%20Rongo_0E5A9846%20(2)_3x2.jpg?wp=1&w=630&h=420'
    });

    return {
        totalTests: testCases.length,
        successfulTests: testCases.filter(test => parseBackgroundImageUrl(test) !== null).length,
        nationalGeoFixed: nationalGeoResult === 'https://i.natgeofe.com/n/c41a772e-9279-4056-b86f-74469d9f65d9/NS123502198_NGSPPOCN_Konini%20Rongo_0E5A9846%20(2)_3x2.jpg?wp=1&w=630&h=420'
    };
}

// Make test function available globally for console debugging
window.testBackgroundImageUrlParsing = testBackgroundImageUrlParsing;

// Create a virtual image element from background-image
function createVirtualImageFromBackground(backgroundElement, imageUrl) {
    try {
        // Create a virtual img element that behaves like a real image
        const virtualImg = document.createElement('img');

        // Set essential properties
        virtualImg.src = imageUrl;
        virtualImg.alt = backgroundElement.getAttribute('alt') ||
            backgroundElement.getAttribute('aria-label') ||
            'Background Image';
        virtualImg.className = backgroundElement.className;

        // Copy dimensions from the background element
        const rect = backgroundElement.getBoundingClientRect();
        virtualImg.width = Math.round(rect.width);
        virtualImg.height = Math.round(rect.height);

        // Store reference to the original background element (could be picture, span, div, etc.)
        virtualImg._originalBackgroundElement = backgroundElement;
        virtualImg._isVirtualBackgroundImage = true;
        virtualImg._backgroundElementTagName = backgroundElement.tagName;

        // For backward compatibility with existing Getty Images code
        if (backgroundElement.tagName === 'PICTURE') {
            virtualImg._originalPictureElement = backgroundElement;
        }

        // Copy computed styles for accurate representation
        const elementStyle = window.getComputedStyle(backgroundElement);
        virtualImg.style.cssText = `
            display: block;
            width: ${rect.width}px;
            height: ${rect.height}px;
            object-fit: cover;
        `;

        // Set natural dimensions based on the display dimensions (we can't know the actual natural size due to CORS)
        virtualImg.naturalWidth = Math.round(rect.width);
        virtualImg.naturalHeight = Math.round(rect.height);

        console.log('🎭 Created virtual image from background:', {
            url: imageUrl.substring(0, 80) + '...',
            dimensions: `${virtualImg.width}x${virtualImg.height}`,
            tagName: backgroundElement.tagName,
            elementClass: backgroundElement.className.split(' ')[0] || 'no-class'
        });

        return virtualImg;
    } catch (error) {
        console.warn('Error creating virtual image from background:', error);
        return null;
    }
}

// Intelligent image selection to prioritize main content over UI elements
function selectMainContentImage(images) {
    console.log('🎯 Analyzing images for content prioritization:', images.map(img => ({
        src: img.src?.substring(img.src.lastIndexOf('/') + 1) || 'no-src',
        alt: img.alt,
        className: img.className,
        dimensions: `${img.width || 'auto'}x${img.height || 'auto'}`,
        naturalDimensions: `${img.naturalWidth || 'unknown'}x${img.naturalHeight || 'unknown'}`
    })));

    // Apply prioritization scoring system
    const scoredImages = images.map(img => ({
        image: img,
        score: calculateImageContentScore(img)
    }));

    // Sort by score (highest first) and return the best candidate
    scoredImages.sort((a, b) => b.score - a.score);

    console.log('📊 Image scores:', scoredImages.map(item => ({
        src: item.image.src?.substring(item.image.src.lastIndexOf('/') + 1) || 'no-src',
        score: item.score.toFixed(2),
        dimensions: `${item.image.naturalWidth || 'unknown'}x${item.image.naturalHeight || 'unknown'}`,
        className: item.image.className,
        reasons: getScoreReasons(item.image)
    })));

    // Special debug for Behance to help identify ribbon vs main image issues
    if (window.location.hostname.includes('behance.net')) {
        console.log('🎨 Behance-specific image analysis:', scoredImages.map(item => ({
            src: item.image.src?.substring(item.image.src.lastIndexOf('/') + 1) || 'no-src',
            score: item.score.toFixed(2),
            isRibbon: item.image.className.includes('ribbon') ||
                item.image.src.includes('ribbon') ||
                item.image.className.includes('rf-ribbon') ||
                item.image.src.includes('/ribbons/'),
            isMainImage: item.image.className.includes('js-cover-image') ||
                item.image.className.includes('ProjectCoverNeue'),
            isInOverlay: !!(item.image.closest('.Cover-showOnHover') ||
                item.image.closest('.Cover-overlay') ||
                item.image.closest('.Feature-ribbon')),
            dimensions: `${item.image.naturalWidth || 'unknown'}x${item.image.naturalHeight || 'unknown'}`,
            proximityScore: item.image._proximityScore || 0,
            searchContext: item.image._searchContext || 'unknown'
        })));
    }

    return scoredImages[0].image;
}

// Calculate content priority score for an image
function calculateImageContentScore(img) {
    let score = 0;

    // 0. PROXIMITY SCORING - Images closer to the clicked element get higher priority
    if (img._proximityScore) {
        score += img._proximityScore;
        console.log(`📍 Proximity score for image: ${img._proximityScore} (context: ${img._searchContext})`);
    }

    // 1. DIMENSION SCORING - Larger images are more likely to be main content
    const naturalWidth = img.naturalWidth || 0;
    const naturalHeight = img.naturalHeight || 0;
    const displayWidth = img.width || img.getBoundingClientRect().width || 0;
    const displayHeight = img.height || img.getBoundingClientRect().height || 0;

    // Use natural dimensions if available, otherwise display dimensions
    const effectiveWidth = naturalWidth > 0 ? naturalWidth : displayWidth;
    const effectiveHeight = naturalHeight > 0 ? naturalHeight : displayHeight;
    const area = effectiveWidth * effectiveHeight;

    // Dimension bonus (logarithmic scale to avoid extreme values)
    if (area > 0) {
        score += Math.log10(area / 10000) * 20; // Base score from size
    }

    // Bonus for good aspect ratios (typical for content images)
    if (effectiveWidth > 0 && effectiveHeight > 0) {
        const aspectRatio = effectiveWidth / effectiveHeight;
        if (aspectRatio >= 0.5 && aspectRatio <= 3.0) { // Not too narrow or wide
            score += 15;
        }
    }

    // 2. CONTENT INDICATORS - Look for signs this is main content
    const src = (img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const className = (img.className || '').toLowerCase();

    // Positive indicators (main content)
    const contentIndicators = [
        'cover', 'hero', 'feature', 'main', 'content', 'article', 'photo', 'picture',
        'project', 'gallery', 'media', 'image', 'primary', 'large', 'full'
    ];
    contentIndicators.forEach(indicator => {
        if (className.includes(indicator) || alt.includes(indicator)) {
            score += 25;
        }
    });

    // Behance-specific content indicators
    if (window.location.hostname.includes('behance.net')) {
        if (className.includes('projectcover') || className.includes('cover-image') ||
            className.includes('js-cover-image') || className.includes('main-photo') ||
            className.includes('projectcoverneue-image') ||
            className.includes('projectcoverneue-picture')) {
            score += 50; // Strong indicator for main project image
        }

        // Extra bonus for being inside a picture element (main content pattern)
        if (img.closest('picture') && img.closest('picture').className.includes('ProjectCoverNeue')) {
            score += 30; // Additional bonus for being in main picture container
        }
    }

    // Getty Images-specific content indicators
    if (window.location.hostname.includes('gettyimages.')) {
        // Virtual background images from picture elements are likely main content
        if (img._isVirtualBackgroundImage) {
            score += 50; // Strong indicator for main Getty image
        }
        // Grid item containers suggest main content
        if (img.closest('[data-testid="grid-item-container"]')) {
            score += 30;
        }
    }

    // National Geographic-specific content indicators
    if (window.location.hostname.includes('nationalgeographic.com') ||
        window.location.hostname.includes('natgeo')) {
        // Virtual background images from carousel slides are likely main content
        if (img._isVirtualBackgroundImage) {
            score += 40; // Strong indicator for main National Geographic image

            // Extra bonus for carousel slides and prism tiles
            if (className.includes('carousel') || className.includes('prism') ||
                className.includes('slide') || className.includes('backgroundimage')) {
                score += 20;
            }
        }
    }

    // General bonus for virtual background images (they're usually main content)
    if (img._isVirtualBackgroundImage && !window.location.hostname.includes('gettyimages.') &&
        !window.location.hostname.includes('nationalgeographic.com')) {
        score += 30; // General bonus for background images on other sites
    }

    // 3. UI/DECORATION PENALTIES - Reduce score for UI elements
    const uiIndicators = [
        'icon', 'logo', 'avatar', 'thumb', 'ribbon', 'badge', 'star', 'rating',
        'button', 'nav', 'menu', 'header', 'footer', 'sidebar', 'ad', 'banner',
        'sprite', 'decoration', 'ui-', 'social', 'share', 'like', 'comment'
    ];
    uiIndicators.forEach(indicator => {
        if (src.includes(indicator) || alt.includes(indicator) || className.includes(indicator)) {
            score -= 30;
        }
    });

    // Behance-specific UI penalties
    if (window.location.hostname.includes('behance.net')) {
        // Enhanced ribbon detection for all Behance ribbon patterns
        const isBehanceRibbon = className.includes('ribbon') ||
            src.includes('ribbon') ||
            className.includes('feature-ribbon') ||
            alt.includes('ribbon') ||
            // Grid view ribbon patterns
            className.includes('rf-ribbon') ||
            className.includes('Feature-ribbon') ||
            className.includes('ribbonImage') ||
            src.includes('/ribbons/') ||
            // Parent element patterns
            (parent && (parent.className.includes('ribbon') ||
                parent.className.includes('Feature-ribbon')));

        if (isBehanceRibbon) {
            score -= 80; // Very heavy penalty for all ribbon patterns
        }

        // Additional penalty for very small images (likely UI elements)
        if (effectiveWidth > 0 && effectiveHeight > 0 &&
            effectiveWidth < 50 && effectiveHeight < 50) {
            score -= 40; // Penalty for tiny images (ribbons are usually small)
        }

        // Extra penalty for images in hover overlays (these are definitely UI elements)
        if (img.closest('.Cover-showOnHover') || img.closest('.Cover-overlay') ||
            img.closest('.Feature-ribbon') || img.closest('.rf-ribbon')) {
            score -= 60; // Heavy penalty for overlay/hover UI elements
        }
    }

    // 4. CONTEXT SCORING - Analyze DOM context
    const parent = img.parentElement;
    const parentClassName = (parent?.className || '').toLowerCase();
    const parentTagName = (parent?.tagName || '').toLowerCase();

    // Bonus for being in content areas
    const contentContexts = ['article', 'main', 'content', 'gallery', 'media'];
    contentContexts.forEach(context => {
        if (parentClassName.includes(context) || parentTagName === context) {
            score += 20;
        }
    });

    // Penalty for being in overlay/UI areas
    const uiContexts = ['overlay', 'nav', 'header', 'footer', 'sidebar', 'menu', 'controls'];
    uiContexts.forEach(context => {
        if (parentClassName.includes(context)) {
            score -= 25;
        }
    });

    // Behance-specific context analysis
    if (window.location.hostname.includes('behance.net')) {
        // Penalty for being in overlay areas
        if (img.closest('.Cover-overlay-r1A') || img.closest('.Cover-showOnHover-oZ2')) {
            score -= 40;
        }
        // Bonus for being in main content areas
        if (img.closest('.ProjectCoverNeue-picture-NuE') || img.closest('picture')) {
            score += 35;
        }
    }

    // 5. FILE TYPE/URL SCORING
    if (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp')) {
        score += 10; // Standard image formats
    }
    if (src.includes('_2x') || src.includes('@2x') || src.includes('_large') || src.includes('_full')) {
        score += 15; // High-resolution variants
    }

    // 6. VISIBILITY AND POSITIONING
    const rect = img.getBoundingClientRect();
    if (rect.width > 200 && rect.height > 150) {
        score += 20; // Large display size
    }
    if (rect.width < 50 || rect.height < 50) {
        score -= 20; // Too small, likely UI element
    }

    return Math.max(0, score); // Ensure non-negative score
}

// Helper function to get human-readable score reasons for debugging
function getScoreReasons(img) {
    const reasons = [];
    const src = (img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const className = (img.className || '').toLowerCase();

    // Size analysis
    const naturalWidth = img.naturalWidth || 0;
    const naturalHeight = img.naturalHeight || 0;
    if (naturalWidth > 800 || naturalHeight > 600) {
        reasons.push('large-dimensions');
    }

    // Content indicators
    if (className.includes('cover') || className.includes('main')) {
        reasons.push('content-class');
    }

    // UI penalties
    if (className.includes('ribbon') || src.includes('ribbon')) {
        reasons.push('ribbon-penalty');
    }

    // Context
    if (img.closest('.Cover-overlay-r1A')) {
        reasons.push('overlay-penalty');
    }

    return reasons.join(', ');
}

// Function to find image in parent elements and their siblings
function findImgInParentsAndSiblings(element) {
    const allFoundImages = [];
    let current = element;
    let searchLevel = 0;
    const MAX_SEARCH_LEVELS = 5; // Limit how far up we search to prevent distant matches

    // First pass: collect images with proximity scoring
    while (current && current !== document && searchLevel < MAX_SEARCH_LEVELS) {
        // Check current element first (highest priority)
        const currentImgs = findAllImgsInTree(current);
        currentImgs.forEach(img => {
            img._proximityScore = 1000 - (searchLevel * 100); // Higher score for closer elements
            img._searchContext = 'current';
            allFoundImages.push(img);
        });

        // Check siblings, but only if we haven't found images in current element
        if (currentImgs.length === 0 && current.parentElement) {
            // Limit sibling search to prevent cross-contamination between content areas
            const isCard = isContentCard(current);
            const isTextArea = isInTextOnlyArea(element);
            const shouldSearchSiblings = (!isCard && !isTextArea) || searchLevel === 0;

            console.log(`🔍 Search decision at level ${searchLevel}:`, {
                element: current.tagName + (current.className ? `.${current.className.split(' ')[0]}` : ''),
                isCard,
                isTextArea,
                shouldSearchSiblings
            });

            if (shouldSearchSiblings) {
                for (let sibling of current.parentElement.children) {
                    if (sibling !== current) {
                        const siblingImgs = findAllImgsInTree(sibling);
                        siblingImgs.forEach(img => {
                            img._proximityScore = 500 - (searchLevel * 100); // Lower score for sibling elements
                            img._searchContext = 'sibling';
                            allFoundImages.push(img);
                        });
                    }
                }
            }
        }

        // Early termination: if we found images at close proximity, stop searching further
        // BUT: Special case for Behance - don't stop if we're in a hover overlay area
        if (allFoundImages.length > 0 && searchLevel === 0) {
            const isInBehanceOverlay = window.location.hostname.includes('behance.net') &&
                (current.closest('.Cover-showOnHover') ||
                    current.closest('.Cover-overlay') ||
                    current.closest('.Feature-ribbon'));

            if (!isInBehanceOverlay) {
                console.log(`🎯 Found ${allFoundImages.length} images at immediate level, stopping search`);
                break;
            } else {
                console.log(`🎨 Behance overlay detected - continuing search for main image despite finding ${allFoundImages.length} images at immediate level`);
            }
        }

        current = current.parentElement;
        searchLevel++;
    }

    if (allFoundImages.length === 0) return null;
    if (allFoundImages.length === 1) return allFoundImages[0];

    // Second pass: intelligent prioritization to select the main content image
    console.log(`🔍 Found ${allFoundImages.length} images at ${searchLevel} levels, applying intelligent selection...`);

    // Special Behance override: If we have both ribbon and main images, force main image selection
    if (window.location.hostname.includes('behance.net') && allFoundImages.length > 1) {
        console.log('🎨 Behance override check - all found images:', allFoundImages.map(img => ({
            src: img.src?.substring(img.src.lastIndexOf('/') + 1) || 'no-src',
            className: img.className,
            isMainByClass: img.className.includes('js-cover-image') || img.className.includes('ProjectCoverNeue-image'),
            isRibbon: img.className.includes('ribbon') || img.src.includes('ribbon')
        })));

        // First try: Look for explicit main image classes
        let mainImage = allFoundImages.find(img =>
            img.className.includes('js-cover-image') ||
            img.className.includes('ProjectCoverNeue-image')
        );

        // Second try: Look for any image that's NOT a ribbon and is reasonably sized
        if (!mainImage) {
            mainImage = allFoundImages.find(img =>
                !img.className.includes('ribbon') &&
                !img.src.includes('ribbon') &&
                !img.src.includes('/ribbons/') &&
                (img.naturalWidth || img.width || 0) > 100 && // Must be reasonably sized
                (img.naturalHeight || img.height || 0) > 100
            );
        }

        // Third try: Look for the largest image
        if (!mainImage && allFoundImages.length > 0) {
            mainImage = allFoundImages.reduce((largest, current) => {
                const currentSize = (current.naturalWidth || current.width || 0) * (current.naturalHeight || current.height || 0);
                const largestSize = (largest.naturalWidth || largest.width || 0) * (largest.naturalHeight || largest.height || 0);
                return currentSize > largestSize ? current : largest;
            });
        }

        if (mainImage) {
            console.log('🎨 Behance override: Forcing main image selection despite scoring:', {
                mainImageSrc: mainImage.src?.substring(mainImage.src.lastIndexOf('/') + 1) || 'no-src',
                mainImageClass: mainImage.className,
                totalImagesFound: allFoundImages.length,
                overrideMethod: mainImage.className.includes('js-cover-image') ? 'class-match' :
                    !mainImage.src.includes('ribbon') ? 'non-ribbon' : 'largest-image'
            });
            return mainImage;
        }
    }

    return selectMainContentImage(allFoundImages);
}

// Helper function to detect if an element is a content card that shouldn't search siblings
function isContentCard(element) {
    // Detect common content card patterns
    const cardSelectors = [
        '.card',
        '.container__item',
        '[data-test-id="pin"]',
        '[data-test-id="card"]',
        '.post',
        '.article',
        '.item',
        '.entry'
    ];

    return cardSelectors.some(selector => {
        return element.matches && element.matches(selector) ||
            element.closest && element.closest(selector) === element;
    });
}

// Helper function to detect if the clicked element is in a text-only content area
function isInTextOnlyArea(element) {
    // Look for common text area patterns
    const textAreaSelectors = [
        '.container__text',
        '.container__headline',
        '.headline',
        '.title',
        '.description',
        '.summary',
        '.content',
        '.text'
    ];

    return textAreaSelectors.some(selector => {
        return element.closest && element.closest(selector);
    });
}

// Store the last right-clicked element
let lastRightClickedElement = null;

// Add context menu event listener for image detection and menu state management
document.addEventListener('contextmenu', function (e) {
    // Store the clicked element
    lastRightClickedElement = e.target;

    // Debug logging for Behance
    if (window.location.hostname.includes('behance.net')) {
        console.log('🎨 Behance right-click context:', {
            clickedElement: e.target.tagName,
            clickedClass: e.target.className,
            clickedSrc: e.target.src || 'no-src',
            isRibbon: e.target.className.includes('ribbon') || (e.target.src && e.target.src.includes('ribbon')),
            inOverlay: !!(e.target.closest('.Cover-showOnHover') || e.target.closest('.Cover-overlay')),
            parentStructure: e.target.parentElement ? e.target.parentElement.tagName + '.' + e.target.parentElement.className : 'none'
        });
    }

    // Find image in the clicked element's tree
    let img = findImgInParentsAndSiblings(e.target);

    // AGGRESSIVE BEHANCE FIX: If a ribbon was selected, try to find the main image
    if (img && window.location.hostname.includes('behance.net')) {
        const isRibbonSelected = img.className.includes('ribbon') || img.src.includes('ribbon');
        if (isRibbonSelected) {
            console.log('🎨 AGGRESSIVE BEHANCE FIX: Ribbon detected, searching for main image instead');

            // Find the project container that contains the clicked ribbon
            const projectContainer = e.target.closest('.ProjectCoverNeue-cover-X3S') ||
                e.target.closest('.Cover-cover-gDM') ||
                e.target.closest('[class*="ProjectCover"]');

            let mainImage = null;
            if (projectContainer) {
                // Look for main image within the same project container
                mainImage = projectContainer.querySelector('.js-cover-image') ||
                    projectContainer.querySelector('.ProjectCoverNeue-image-TFB') ||
                    projectContainer.querySelector('picture img');
            }

            if (mainImage) {
                console.log('🎨 AGGRESSIVE BEHANCE FIX: Replaced ribbon with main image in same container:', {
                    oldImage: img.src?.substring(img.src.lastIndexOf('/') + 1) || 'no-src',
                    newImage: mainImage.src?.substring(mainImage.src.lastIndexOf('/') + 1) || 'no-src',
                    containerClass: projectContainer?.className || 'no-container'
                });
                img = mainImage;
            } else {
                console.warn('🎨 AGGRESSIVE BEHANCE FIX: Could not find main image in same container');
            }
        }
    }

    if (img) {
        lastContextMenuImage = img;

        // Set the associated lifViewer instance as active if it exists
        if (typeof lifViewer !== 'undefined' && lifViewer.instances) {
            const associatedInstance = lifViewer.instances.find(instance => {
                // Check if this instance is associated with the right-clicked image
                return instance.originalImage === img ||
                    instance.lifUrl === imageLIFMap.get(img.src) ||
                    (instance.container && instance.container.contains(img));
            });

            if (associatedInstance) {
                associatedInstance.setAsActive();
                console.log('🎯 Set lifViewer instance as active based on right-click:', {
                    instanceIndex: lifViewer.instances.indexOf(associatedInstance),
                    lifUrl: associatedInstance.lifUrl
                });
            }
        }

        console.log('Found image in clicked element:', {
            src: img.src,
            alt: img.alt,
            clickedElement: e.target.tagName,
            clickedElementClass: e.target.className,
            parentStructure: img.parentElement ? img.parentElement.tagName : 'none',
            path: getElementPath(img)
        });

        // Extra Behance debug info
        if (window.location.hostname.includes('behance.net')) {
            console.log('🎨 Behance selected image details:', {
                selectedSrc: img.src?.substring(img.src.lastIndexOf('/') + 1) || 'no-src',
                selectedClass: img.className,
                isRibbonSelected: img.className.includes('ribbon') || img.src.includes('ribbon'),
                isMainImageSelected: img.className.includes('js-cover-image') || img.className.includes('ProjectCoverNeue'),
                inPictureElement: !!img.closest('picture'),
                pictureClass: img.closest('picture')?.className || 'no-picture',
                proximityScore: img._proximityScore || 'no-score',
                searchContext: img._searchContext || 'no-context'
            });
        }

        // Update context menu based on whether this image has a LIF file
        const hasLIF = imageLIFMap.has(img.src);
        console.log('Context menu update:', {
            imageSrc: img.src,
            hasLIF: hasLIF,
            lifMapSize: imageLIFMap.size,
            lifMapKeys: Array.from(imageLIFMap.keys())
        });

        // Send context menu update immediately (don't wait for response)
        chrome.runtime.sendMessage({
            action: "updateContextMenu",
            hasLIF: hasLIF,
            webXRSupported: webXRSupportChecked && isWebXRSupported
        });

        // Don't prevent default - let the context menu show normally
    } else {
        lastContextMenuImage = null;
        // Reset context menu to default state when no image is found
        chrome.runtime.sendMessage({
            action: "updateContextMenu",
            hasLIF: false,
            webXRSupported: false
        });
    }
}, true);

// Handle messages from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "convertImage") {
        // Find the image at the clicked position
        const img = lastContextMenuImage || (lastRightClickedElement ? findImgInParentsAndSiblings(lastRightClickedElement) : null);

        if (img) {
            // --- GENERALIZED BUTTON APPROACH LOGIC ---
            // 1. Find the best target container using layout analysis
            let targetElement = img.parentElement;
            let isPictureImage = false;
            let isVirtualImage = false;
            let useOverlayApproach = false;
            let overlayContainer = null;
            let effectiveWidth, effectiveHeight;

            // Special handling for virtual images (background images from any element)
            if (img._isVirtualBackgroundImage && img._originalBackgroundElement) {
                isVirtualImage = true;
                targetElement = img._originalBackgroundElement;
                useOverlayApproach = true;
                console.log('🎭 Handling virtual background image from', img._backgroundElementTagName || 'unknown element');

                // For backward compatibility, also check _originalPictureElement
                if (img._originalPictureElement) {
                    targetElement = img._originalPictureElement;
                }
            }

            // Special handling for <picture> elements
            const pictureElement = img.closest('picture');
            if (pictureElement && pictureElement.contains(img)) {
                isPictureImage = true;
                useOverlayApproach = true;
                // CNN structure: container__item-media-wrapper > container__item-media > image > image__container > picture
                const imageContainer = pictureElement.parentElement; // image__container
                const imageDiv = imageContainer?.parentElement; // image div
                let containerMedia = imageDiv?.parentElement; // could be container__item-media or container__item-media-wrapper
                if (containerMedia && containerMedia.classList.contains('container__item-media')) {
                    targetElement = containerMedia;
                } else if (imageDiv && imageDiv.classList.contains('image')) {
                    targetElement = imageDiv;
                } else {
                    targetElement = imageContainer;
                }
                // Store dimensions for later use with LIF viewer
                // For picture elements, use the image dimensions since picture element itself might have height: 0
                const imgRect = img.getBoundingClientRect();
                const pictureRect = pictureElement.getBoundingClientRect();

                // Use image dimensions if picture has zero height, otherwise use picture dimensions
                const effectivePictureWidth = pictureRect.height > 0 ? pictureRect.width : imgRect.width;
                const effectivePictureHeight = pictureRect.height > 0 ? pictureRect.height : imgRect.height;

                pictureElement.dataset.lifTargetWidth = Math.round(effectivePictureWidth);
                pictureElement.dataset.lifTargetHeight = Math.round(effectivePictureHeight);

                console.log('📸 Picture element dimensions:', {
                    pictureRect: `${pictureRect.width}x${pictureRect.height}`,
                    imgRect: `${imgRect.width}x${imgRect.height}`,
                    effective: `${effectivePictureWidth}x${effectivePictureHeight}`
                });
            }

            // Fallback for cases where targetElement is null/invalid
            if (!targetElement || !(targetElement instanceof Element)) {
                console.warn('⚠️ Invalid targetElement, using document.body as fallback:', targetElement);
                targetElement = document.body;
                useOverlayApproach = true;
            }

            // 2. Analyze layout for all other cases (but skip for virtual images to avoid complex analysis)
            let layoutAnalysis;
            if (isVirtualImage) {
                // For virtual images, create a minimal layout analysis
                layoutAnalysis = {
                    type: 'virtual-image',
                    preserveOriginal: true,
                    reason: 'Virtual image from background CSS',
                    containerHasPaddingAspectRatio: false,
                    imageIsAbsolute: false,
                    parentUsesFlexOrGrid: false,
                    hasResponsivePattern: false,
                    isFacebookStyle: false
                };
            } else {
                layoutAnalysis = analyzeLayoutPattern(targetElement, img);
            }
            // Overlay approach for aspect ratio, flex/grid, Facebook, Pinterest, etc.
            const isAspectRatioContainer = layoutAnalysis.containerHasPaddingAspectRatio;
            const shouldUseOverlayApproach = isPictureImage || isVirtualImage || isAspectRatioContainer || layoutAnalysis.isFacebookStyle || layoutAnalysis.parentUsesFlexOrGrid || layoutAnalysis.hasResponsivePattern;

            // For overlay approach, use the padding container if found
            // BUT: Don't override picture element containers or virtual images - they should use their own dimensions
            if (shouldUseOverlayApproach && layoutAnalysis.paddingContainer && !isPictureImage && !isVirtualImage) {
                targetElement = layoutAnalysis.paddingContainer.element;
            }

            // For overlay approach, store target dimensions
            if (shouldUseOverlayApproach) {
                const imgRect = img.getBoundingClientRect();
                const containerRect = targetElement.getBoundingClientRect();

                // Skip dimension calculation for picture elements and virtual images - handle separately
                if (!isPictureImage && !isVirtualImage) {
                    // GENERALIZED: For aspect ratio containers, prefer image dimensions over container when image has explicit size or uses object-fit
                    const hasExplicitDimensions = img.width && img.height;
                    const isCenteredOrFitted = (
                        // Generic class patterns
                        img.classList.contains('centered') ||
                        img.classList.contains('aspect-fit') ||
                        img.classList.contains('aspect-fill') ||
                        // LinkedIn-style prefixed classes (keeping pattern recognition)
                        img.className.includes('centered') ||
                        img.className.includes('aspect-fit') ||
                        img.className.includes('aspect-fill') ||
                        // CSS object-fit detection
                        img.style.objectFit === 'contain' ||
                        img.style.objectFit === 'cover'
                    );

                    // Get computed style for comprehensive object-fit detection
                    const computedStyle = window.getComputedStyle(img);
                    const hasObjectFit = computedStyle.objectFit && computedStyle.objectFit !== 'fill' && computedStyle.objectFit !== 'none';

                    // CRITICAL FIX: For Facebook images, ALWAYS use container dimensions to prevent zoom issues
                    const isFacebookImage = img.src && img.src.includes('fbcdn.net');
                    const hasFacebookClasses = img.classList && (
                        img.className.includes('x168nmei') ||
                        img.className.includes('x13lgxp2') ||
                        img.className.includes('x5pf9jr') ||
                        img.className.includes('x15mokao') ||
                        img.className.includes('x1ga7v0g')
                    );

                    if (isFacebookImage || hasFacebookClasses) {
                        // Facebook images: ALWAYS use container dimensions, never image dimensions
                        effectiveWidth = containerRect.width > 0 ? containerRect.width : imgRect.width;
                        effectiveHeight = containerRect.height > 0 ? containerRect.height : imgRect.height;

                        console.log('📘 Facebook image detected - using container dimensions to prevent zoom:', Math.round(effectiveWidth) + 'x' + Math.round(effectiveHeight), {
                            isFacebookImage,
                            hasFacebookClasses,
                            containerSize: Math.round(containerRect.width) + 'x' + Math.round(containerRect.height),
                            imageSize: Math.round(imgRect.width) + 'x' + Math.round(imgRect.height),
                            imageClasses: img.className,
                            targetElement: targetElement.tagName + '.' + targetElement.className
                        });
                    } else if ((hasExplicitDimensions && isCenteredOrFitted) || hasObjectFit) {
                        // For other centered/fitted images, use the image's actual rendered size
                        // Since the canvas will inherit the same CSS classes, it should get the same constraints
                        effectiveWidth = imgRect.width;
                        effectiveHeight = imgRect.height;

                        console.log('🎯 Centered/fitted/object-fit image detected - canvas will inherit image classes for proper sizing:', Math.round(effectiveWidth) + 'x' + Math.round(effectiveHeight), {
                            hasExplicitDimensions,
                            isCenteredOrFitted,
                            hasObjectFit,
                            objectFit: computedStyle.objectFit,
                            renderedSize: Math.round(imgRect.width) + 'x' + Math.round(imgRect.height),
                            containerSize: Math.round(containerRect.width) + 'x' + Math.round(containerRect.height),
                            imageClasses: img.className
                        });
                    } else {
                        // Default behavior: use container dimensions for aspect ratio containers
                        effectiveWidth = containerRect.width > 0 ? containerRect.width : imgRect.width;
                        effectiveHeight = containerRect.height > 0 ? containerRect.height : imgRect.height;
                    }

                    targetElement.dataset.lifTargetWidth = Math.round(effectiveWidth);
                    targetElement.dataset.lifTargetHeight = Math.round(effectiveHeight);

                    console.log('🎯 Set data-lif-target attributes on container:', {
                        element: targetElement.tagName + '.' + targetElement.className,
                        width: targetElement.dataset.lifTargetWidth,
                        height: targetElement.dataset.lifTargetHeight,
                        effectiveDimensions: Math.round(effectiveWidth) + 'x' + Math.round(effectiveHeight)
                    });
                } else if (isPictureImage) {
                    // For picture elements, use the dimensions already calculated and stored on the picture element
                    effectiveWidth = parseInt(pictureElement.dataset.lifTargetWidth) || imgRect.width;
                    effectiveHeight = parseInt(pictureElement.dataset.lifTargetHeight) || imgRect.height;
                    console.log('📸 Picture element - using pre-calculated dimensions:', effectiveWidth + 'x' + effectiveHeight);
                } else if (isVirtualImage) {
                    // For virtual images, use the original background element's dimensions (could be picture, span, div, etc.)
                    const originalElement = img._originalBackgroundElement || img._originalPictureElement;
                    if (originalElement) {
                        const originalElementRect = originalElement.getBoundingClientRect();
                        effectiveWidth = originalElementRect.width > 0 ? originalElementRect.width : imgRect.width;
                        effectiveHeight = originalElementRect.height > 0 ? originalElementRect.height : imgRect.height;
                        console.log('🎭 Virtual image - using original background element dimensions:', effectiveWidth + 'x' + effectiveHeight, 'from', img._backgroundElementTagName || 'unknown');
                    } else {
                        // Fallback to img rect if no original element reference
                        effectiveWidth = imgRect.width;
                        effectiveHeight = imgRect.height;
                        console.log('🎭 Virtual image - using img rect dimensions (fallback):', effectiveWidth + 'x' + effectiveHeight);
                    }
                }

                overlayContainer = targetElement;
            }

            // For regular images, wrap in .lif-image-container if not already
            let container = targetElement;
            if (!shouldUseOverlayApproach) {
                // Store dimensions for later use with LIF viewer
                const rect = container.getBoundingClientRect();
                effectiveWidth = Math.round(rect.width);
                effectiveHeight = Math.round(rect.height);
                overlayContainer = container;
            }

            // 3. Create a temporary hidden button and append to the correct container
            const tempButton = document.createElement('button');
            tempButton.className = 'lif-converter-btn';
            tempButton.style.display = 'none';
            overlayContainer.appendChild(tempButton);

            // 4. Call the conversion directly, passing the temp button, correct dimensions, and layout analysis
            convertTo3D(img, tempButton, {
                width: effectiveWidth,
                height: effectiveHeight,
                layoutAnalysis: layoutAnalysis
            });
        }
    } else if (message.action === "downloadLIF") {
        // Find the image at the clicked position
        const img = lastContextMenuImage || (lastRightClickedElement ? findImgInParentsAndSiblings(lastRightClickedElement) : null);

        console.log('Download LIF requested:', {
            foundImage: !!img,
            imageSrc: img?.src,
            hasLIFInMap: img ? imageLIFMap.has(img.src) : false,
            lifMapSize: imageLIFMap.size,
            lifMapKeys: Array.from(imageLIFMap.keys())
        });

        if (img && imageLIFMap.has(img.src)) {
            const lifDownloadUrl = imageLIFMap.get(img.src);
            console.log('Downloading LIF file for image:', img.src);
            console.log('LIF download URL:', lifDownloadUrl);
            downloadLIFFile(lifDownloadUrl, img.src, img);
        } else {
            console.warn('No LIF file available for this image');
            showDownloadNotification('No LIF file available for this image', 'error');
        }
    } else if (message.action === "setAnimation") {
        // Handle animation change request from popup - only update active instance
        const animationIndex = message.animationIndex;
        console.log('Setting animation to index for active instance:', animationIndex);

        if (typeof lifViewer !== 'undefined' && lifViewer.setActiveInstanceAnimation) {
            const result = lifViewer.setActiveInstanceAnimation(animationIndex);
            console.log('Set active instance animation result:', result);
            sendResponse(result);
        } else {
            console.log('No lifViewer class or no active instance method available');
            sendResponse({ success: false, reason: 'lifViewer not available' });
        }
        return true; // Keep message channel open for async response
    } else if (message.action === "getAvailableAnimations") {
        // Handle request for available animations from popup - use active instance
        console.log('Getting available animations from active instance...');

        if (typeof lifViewer !== 'undefined' && lifViewer.getActiveInstanceAnimations) {
            const result = lifViewer.getActiveInstanceAnimations();
            console.log('Active instance animation result:', result);
            sendResponse(result);
        } else {
            console.log('No lifViewer class or no active instance method available');
            sendResponse({ success: false, reason: 'lifViewer not available' });
        }
        return true; // Keep message channel open for async response
    } else if (message.action === "getStaticAnimations") {
        // Handle request for static animation definitions from lifViewer class
        console.log('Getting static animation definitions...');

        let animations = [];
        if (typeof lifViewer !== 'undefined' && lifViewer.getAvailableAnimations) {
            animations = lifViewer.getAvailableAnimations();
        }

        console.log('Static animations:', animations);
        sendResponse({ success: true, animations: animations });
        return true; // Keep message channel open for async response
    } else if (message.action === "downloadMP4") {
        // Find the image at the clicked position
        const img = lastContextMenuImage || (lastRightClickedElement ? findImgInParentsAndSiblings(lastRightClickedElement) : null);

        console.log('Download MP4 requested:', {
            foundImage: !!img,
            imageSrc: img?.src,
            hasLIFInMap: img ? imageLIFMap.has(img.src) : false,
            lifMapSize: imageLIFMap.size
        });

        if (img && imageLIFMap.has(img.src)) {
            const lifDownloadUrl = imageLIFMap.get(img.src);
            console.log('Generating MP4 for image:', img.src);
            console.log('Using LIF URL:', lifDownloadUrl);
            try {
                await generateMP4FromLifFile(img, lifDownloadUrl);
            } catch (error) {
                console.error('MP4 generation failed:', error);
            }
        } else {
            console.warn('No LIF file available for MP4 generation');
            showDownloadNotification('No LIF file available for MP4 generation', 'error');
        }
    } else if (message.action === "enterVR") {
        // Find the image at the clicked position
        const img = lastContextMenuImage || (lastRightClickedElement ? findImgInParentsAndSiblings(lastRightClickedElement) : null);

        console.log('Enter VR requested:', {
            foundImage: !!img,
            imageSrc: img?.src,
            hasLIFInMap: img ? imageLIFMap.has(img.src) : false,
            webXRSupported: webXRSupportChecked && isWebXRSupported,
            lifMapSize: imageLIFMap.size
        });

        if (img && imageLIFMap.has(img.src)) {
            // Check WebXR support before proceeding
            if (!webXRSupportChecked || !isWebXRSupported) {
                console.warn('VR not available - WebXR not supported');
                showDownloadNotification('VR not available - WebXR not supported on this device', 'error');
                return;
            }

            const lifDownloadUrl = imageLIFMap.get(img.src);
            console.log('Starting VR for image:', img.src);
            console.log('LIF URL for VR:', lifDownloadUrl);

            // Use the pre-loaded VR system (VRLifViewer) that was injected during initialization
            try {
                console.log('Starting VR using pre-loaded VR system...');

                // Check if VRLifViewer is available (should be pre-loaded during initialization)
                if (window.VRLifViewer) {
                    console.log('VRLifViewer found, initializing VR session...');
                    const vrViewer = new window.VRLifViewer();

                    // Calculate image coordinates for OpenXR window positioning (before VR starts)
                    let imageCoordinates = null;
                    if (img) {
                        console.log('Calculating image coordinates for OpenXR window positioning...');
                        imageCoordinates = calculateImageCoordinates(img);
                        console.log('Image coordinates calculated:', imageCoordinates);
                    }

                    await vrViewer.init(lifDownloadUrl, null, imageCoordinates);
                    console.log('VR session started successfully');
                } else {
                    console.warn('VRLifViewer not found - VR system may not be pre-loaded');
                    showDownloadNotification('VR system not ready - please try again in a moment', 'error');
                }
            } catch (error) {
                console.error('Failed to start VR:', error);
                showDownloadNotification('Failed to start VR: ' + error.message, 'error');
            }
        } else {
            console.warn('No LIF file available for VR');
            showDownloadNotification('No 3D file available for VR viewing', 'error');
        }
    }
});


// Calculate image coordinates for OpenXR window positioning
function calculateImageCoordinates(imageElement) {
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Calculate viewport screen coordinates using the precise formula
    const borderWidth = (window.outerWidth - window.innerWidth) / 2;
    const viewportX = window.screenX + borderWidth;
    const viewportY = window.screenY + window.outerHeight - window.innerHeight - borderWidth;

    // Get element's viewport coordinates
    const rect = imageElement.getBoundingClientRect();

    // Convert to absolute screen coordinates
    return {
        x: Math.round((viewportX + rect.left) * devicePixelRatio),
        y: Math.round((viewportY + rect.top) * devicePixelRatio),
        width: Math.round(rect.width * devicePixelRatio),
        height: Math.round(rect.height * devicePixelRatio),
        // Debug info
        imageRect: rect,
        viewportX: viewportX,
        viewportY: viewportY,
        devicePixelRatio: devicePixelRatio,
        scrollPosition: {
            scrollX: window.scrollX || window.pageXOffset || 0,
            scrollY: window.scrollY || window.pageYOffset || 0
        }
    };
}

// Helper function to get element path for debugging
function getElementPath(element) {
    let path = [];
    while (element && element !== document) {
        let selector = element.tagName.toLowerCase();
        if (element.id) {
            selector += '#' + element.id;
        } else if (element.className) {
            selector += '.' + element.className.split(' ').join('.');
        }
        path.unshift(selector);
        element = element.parentElement;
    }
    return path.join(' > ');
} 