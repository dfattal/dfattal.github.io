/**
 * ImmersityLens Chrome Extension - 2D to 3D Image Converter
 * 
 * OVERVIEW:
 * This Chrome extension adds 2D3D buttons to images on web pages, allowing users to convert
 * regular 2D images into immersive 3D LIF (Light Field Image Format) files. The extension
 * handles complex responsive layouts and provides a seamless user experience across different
 * website designs.
 * 
 * ARCHITECTURE:
 * 
 * 1. DUAL PATH SYSTEM:
 *    - Picture Element Path: For <picture> elements with complex responsive design
 *    - Regular Image Path: For standard <img> elements
 * 
 * 2. LAYOUT ANALYSIS ENGINE:
 *    - Detects padding-based aspect ratios (Instagram, Pinterest, Google Images)
 *    - Identifies responsive patterns (%, vw, vh units)
 *    - Recognizes flex/grid layouts
 *    - Preserves existing CSS patterns to avoid breaking page layouts
 * 
 * 3. EVENT HANDLING STRATEGY:
 *    - Picture Elements: Overlay approach with absolute positioning
 *    - Regular Images: Container wrapping with aggressive click isolation
 *    - Multi-layer event prevention to stop click propagation
 * 
 * KEY DESIGN PATTERNS:
 * 
 * PICTURE ELEMENT HANDLING:
 * - Problem: CNN and other sites use <picture> elements with multiple <source> tags
 * - Solution: Overlay buttons on parent containers instead of wrapping picture elements
 * - Benefits: Preserves responsive breakpoint functionality
 * 
 * CLICK PROPAGATION PREVENTION:
 * - Problem: Button clicks were triggering underlying image/link actions
 * - Solution: Button zone with pointer-events management and aggressive event stopping
 * - Implementation: Capturing phase event listeners with multiple prevention methods
 * 
 * LAYOUT PRESERVATION:
 * - Problem: Different sites use various CSS layout patterns that break when modified
 * - Solution: CSS analysis system that detects patterns and applies minimal fixes
 * - Examples: Padding-based aspect ratios, absolute positioning, responsive containers
 * 
 * CORS HANDLING:
 * - Problem: Many images are protected by CORS policy
 * - Solution: Multiple fallback strategies for image conversion
 * - User Education: Popup explaining CORS-friendly vs restricted sites
 * 
 * RESPONSIVE DESIGN:
 * - Problem: Extension must work across mobile and desktop breakpoints
 * - Solution: Dynamic dimension detection and container-aware sizing
 * - Adaptability: Button sizing and positioning based on detected behaviors
 * 
 * LIF INTEGRATION:
 * - Conversion: Uses monoLdiGenerator for 2D to 3D processing
 * - Viewing: lifViewer handles interactive 3D display
 * - Animation: Mouse hover triggers depth animation effects
 * 
 * PERFORMANCE:
 * - Lazy Processing: Only processes images when user interacts
 * - State Management: Tracks processing status to prevent duplicates
 * - Memory Management: Proper cleanup of resources and event listeners
 * 
 * COMPATIBILITY:
 * - Works across major news sites (CNN, etc.)
 * - Handles social media layouts (Instagram-style)
 * - Supports image galleries and portfolios
 * - Mobile responsive design
 * 
 * DEVELOPER NOTES:
 * - Always test on CNN.com for picture element compatibility
 * - Test on Instagram-style layouts for padding-based aspect ratios
 * - Verify click isolation on various link/image combinations
 * - Monitor for CORS issues on different domains
 */

// Global state for the extension
let isExtensionEnabled = false; // Default to disabled - user must explicitly enable
let processingImages = new Set(); // Track which images are being processed
let hasShownCorsInfo = false; // Track if we've shown CORS info to user

// Storage key for extension state
const STORAGE_KEY = 'lifExtensionEnabled';
const CORS_INFO_SHOWN_KEY = 'lifCorsInfoShown';

// Inject CSS styles for the 2D3D buttons
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
            z-index: 999999;
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
            z-index: 9999999;
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
            z-index: 9999;
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
        
        .lif-button-zone {
            position: absolute;
            top: 0;
            right: 0;
            width: 80px;
            height: 50px;
            z-index: 999998;
            pointer-events: none;
        }
        
        .lif-button-zone .lif-converter-btn {
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
                console.log('Using container__item-media as overlay container');
            } else if (imageDiv && imageDiv.classList.contains('image')) {
                overlayContainer = imageDiv;
                console.log('Using image div as overlay container');
            } else {
                overlayContainer = imageContainer;
                console.log('Using image__container as overlay container');
            }

            console.log('Picture element detected in convertTo3D - container set to:', container?.className || 'element');
        }

        if (overlayContainer) {
            overlayContainer.classList.add('processing');
            const overlay = document.createElement('div');
            overlay.className = 'lif-processing-overlay';
            overlay.innerHTML = '<div class="lif-spinner"></div>Converting to 3D...';

            // Debug: Check if we have a picture element
            const currentPictureElement = img.closest('picture');
            console.log('Overlay creation debug:', {
                hasPictureElement: !!currentPictureElement,
                overlayContainer: overlayContainer.className || overlayContainer.tagName,
                pictureElementClass: currentPictureElement?.className || 'none'
            });

            // For picture element overlays, position absolutely to cover the picture
            if (currentPictureElement) {
                // Get dimensions from the image inside the picture, not the picture element itself
                // (picture elements often have height 0)
                const imgRect = img.getBoundingClientRect();
                const containerRect = overlayContainer.getBoundingClientRect();

                // Calculate relative position using the image's position
                const relativeTop = imgRect.top - containerRect.top;
                const relativeLeft = imgRect.left - containerRect.left;

                // Use custom positioning for picture elements to ensure proper centering
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
                    z-index: 999998;
                `;

                console.log(`Positioning overlay at ${relativeLeft},${relativeTop} with size ${imgRect.width}x${imgRect.height} (using img dimensions instead of picture)`);

                // Ensure the overlay container can contain absolutely positioned elements
                const containerStyle = window.getComputedStyle(overlayContainer);
                if (containerStyle.position === 'static') {
                    overlayContainer.style.position = 'relative';
                }
            } else {
                // For non-picture elements, use the default CSS positioning (fills container)
                overlay.style.zIndex = '999998';
                console.log('Using default overlay positioning for non-picture element');
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

            // Remove processing overlay - check both container and overlayContainer
            const overlay = container?.querySelector('.lif-processing-overlay');
            if (overlay) {
                overlay.remove();
            }
            if (container) {
                container.classList.remove('processing');
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

            // Also check for picture element overlay
            const pictureParent = img.closest('picture')?.parentElement;
            if (pictureParent) {
                const pictureOverlay = pictureParent.querySelector('.lif-processing-overlay');
                if (pictureOverlay) {
                    pictureOverlay.remove();
                }
                pictureParent.classList.remove('processing');
            }

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
            }
            // Check for picture element dimensions (overlay approach)
            else if (img.closest('picture')?.dataset.lifTargetWidth && img.closest('picture')?.dataset.lifTargetHeight) {
                const pictureElement = img.closest('picture');
                effectiveWidth = parseInt(pictureElement.dataset.lifTargetWidth);
                effectiveHeight = parseInt(pictureElement.dataset.lifTargetHeight);
            }
            else if (isAbsolutelyPositioned && containerRect && containerRect.width > 0 && containerRect.height > 0) {
                // For padding-based layouts (absolute positioned containers), use container dimensions
                effectiveWidth = Math.round(containerRect.width);
                effectiveHeight = Math.round(containerRect.height);
            } else {
                // For standard layouts, use image dimensions
                const originalWidth = img.width || img.naturalWidth;
                const originalHeight = img.height || img.naturalHeight;

                effectiveWidth = originalWidth;
                effectiveHeight = originalHeight;

                if (originalWidth === 0 || originalHeight === 0) {
                    // Fallback to container if image dimensions are problematic
                    if (containerRect && containerRect.width > 0 && containerRect.height > 0) {
                        effectiveWidth = Math.round(containerRect.width);
                        effectiveHeight = Math.round(containerRect.height);
                    } else {
                        // Last resort: use natural dimensions or reasonable defaults
                        effectiveWidth = img.naturalWidth || 400;
                        effectiveHeight = img.naturalHeight || 300;
                    }
                }
            }

            console.log(`Creating LIF viewer for image: ${effectiveWidth}x${effectiveHeight}`);

            // For picture elements with overlay approach, use the picture's parent as the container
            let lifContainer = container;
            if (img.closest('picture') && img.closest('picture').dataset.lifTargetWidth) {
                lifContainer = img.closest('picture').parentElement;
                console.log('Using picture parent as LIF container for overlay approach');
            }

            const viewer = new lifViewer(this.lifDownloadUrl, lifContainer || img.parentElement, effectiveHeight, true, true);

            // Store viewer reference on button for later use
            button.lifViewer = viewer;

            viewer.afterLoad = function () {
                console.log('LIF viewer loaded successfully!');

                // Ensure button state is still correct after viewer loads
                setTimeout(() => {
                    if (button.dataset.state === 'lif-ready') {
                        button.textContent = '⬇️ LIF';
                        button.classList.remove('processing');
                        button.classList.add('lif-ready');
                        console.log('Button state reconfirmed as LIF');
                    }
                }, 100);

                console.log(`LIF viewer sizing: ${effectiveWidth}x${effectiveHeight}`);

                // Ensure the container maintains the proper dimensions - but preserve layout type
                if (container) {
                    // Check if this is a padding-based layout by looking at the container's current positioning
                    const containerStyle = window.getComputedStyle(container);
                    const isAbsolutelyPositioned = containerStyle.position === 'absolute';

                    if (isAbsolutelyPositioned) {
                        // For padding-based layouts, preserve absolute positioning
                        console.log('Preserving absolute positioning for padding-based layout');
                        container.style.cssText = `
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            overflow: hidden;
                        `;
                    } else {
                        // For normal layouts, use explicit dimensions
                        console.log('Using explicit dimensions for standard layout');
                        container.style.cssText = `
                            position: relative;
                            display: inline-block;
                            width: ${effectiveWidth}px;
                            height: ${effectiveHeight}px;
                            overflow: hidden;
                        `;
                    }
                }

                // Hide the original image first
                img.style.display = 'none';

                // Set up the LIF viewer image and canvas with correct dimensions and positioning
                this.img.style.cssText = `
                    width: ${effectiveWidth}px !important;
                    height: ${effectiveHeight}px !important;
                    max-width: none !important;
                    max-height: none !important;
                    object-fit: cover;
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 1;
                    display: none;
                `;

                this.canvas.style.cssText = `
                    width: ${effectiveWidth}px !important;
                    height: ${effectiveHeight}px !important;
                    max-width: none !important;
                    max-height: none !important;
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 2;
                    display: block;
                    pointer-events: auto;
                    cursor: pointer;
                `;

                // Force canvas dimensions to match exactly
                this.canvas.width = effectiveWidth;
                this.canvas.height = effectiveHeight;

                // Immediately show the LIF animation canvas
                this.img.style.display = 'none';
                this.canvas.style.display = 'block';

                console.log(`Canvas is now visible with dimensions: ${this.canvas.width}x${this.canvas.height}`);
                console.log(`Canvas style:`, this.canvas.style.cssText);

                // For picture elements with overlay approach, hide the original button zone
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
                            zone.style.zIndex = '9999999';
                            zone.style.pointerEvents = 'auto';
                        }
                    });
                }

                // Override LIF.js automatic resizing for padding-based layouts AND picture elements
                // Note: We detect ALL picture elements because LIF.js tends to use intrinsic image dimensions
                // (e.g., 8484x5656) instead of display dimensions (e.g., 305x171) for canvas sizing
                const isPictureElement = img.closest('picture'); // Detect any picture element, not just ones with stored dimensions
                if (isAbsolutelyPositioned || isPictureElement) {
                    // Store the correct dimensions
                    const correctWidth = effectiveWidth;
                    const correctHeight = effectiveHeight;

                    // Override canvas dimensions immediately and repeatedly
                    const forceCorrectDimensions = () => {
                        if (this.canvas.width !== correctWidth || this.canvas.height !== correctHeight) {
                            this.canvas.width = correctWidth;
                            this.canvas.height = correctHeight;
                            this.canvas.style.width = `${correctWidth}px`;
                            this.canvas.style.height = `${correctHeight}px`;
                        }
                    };

                    // Apply immediately
                    forceCorrectDimensions();

                    // Apply again after short delays to override LIF.js resizing
                    setTimeout(forceCorrectDimensions, 50);
                    setTimeout(forceCorrectDimensions, 100);
                    setTimeout(forceCorrectDimensions, 200);
                    setTimeout(forceCorrectDimensions, 500);

                    // Set up observer to catch any future resizing attempts
                    const observer = new MutationObserver(() => {
                        forceCorrectDimensions();
                    });

                    observer.observe(this.canvas, {
                        attributes: true,
                        attributeFilter: ['width', 'height', 'style']
                    });
                }

                // Set up hover effects for enhanced interaction - ensure they work properly
                const canvasElement = this.canvas;
                const lifViewerInstance = this;

                // Clear any existing event listeners to avoid conflicts
                canvasElement.onmouseenter = null;
                canvasElement.onmouseleave = null;

                // Create a robust event handling system for both picture and non-picture elements
                let isAnimating = false;
                let animationTimeoutId = null;

                const startAnimationSafe = () => {
                    if (!isAnimating && lifViewerInstance.startAnimation) {
                        console.log('Starting LIF animation');
                        isAnimating = true;
                        lifViewerInstance.startAnimation();

                        // Clear any pending stop timeout
                        if (animationTimeoutId) {
                            clearTimeout(animationTimeoutId);
                            animationTimeoutId = null;
                        }
                    }
                };

                const stopAnimationSafe = () => {
                    // Use a small delay to prevent flickering when moving mouse quickly
                    if (animationTimeoutId) {
                        clearTimeout(animationTimeoutId);
                    }

                    animationTimeoutId = setTimeout(() => {
                        if (isAnimating && lifViewerInstance.stopAnimation) {
                            console.log('Stopping LIF animation');
                            isAnimating = false;
                            lifViewerInstance.stopAnimation();
                        }
                        animationTimeoutId = null;
                    }, 100); // Small delay to prevent rapid on/off
                };

                // For picture elements, we need more robust event handling
                const pictureElementForEvents = img.closest('picture'); // Simplified detection - just check if it's in a picture element

                if (pictureElementForEvents) {
                    console.log('Setting up enhanced picture element mouse events');

                    // Debug: Check the elements we're attaching events to
                    console.log('Picture element debug:', {
                        canvas: canvasElement,
                        staticImg: this.img,
                        canvasVisible: canvasElement.style.display,
                        staticImgVisible: this.img.style.display,
                        canvasZIndex: canvasElement.style.zIndex,
                        staticImgZIndex: this.img.style.zIndex
                    });

                    // Ensure the static image has proper styling for event capture
                    this.img.style.pointerEvents = 'auto';
                    this.img.style.position = 'absolute';

                    // Add events to the canvas
                    canvasElement.addEventListener('mouseenter', function (e) {
                        console.log('Picture: Mouse entered canvas');
                        startAnimationSafe();
                    }, { passive: true });
                    canvasElement.addEventListener('mouseleave', function (e) {
                        console.log('Picture: Mouse left canvas');
                        stopAnimationSafe();
                    }, { passive: true });

                    // Also add events to the static LIF image (this.img) so animation can restart when hovering over static image
                    this.img.addEventListener('mouseenter', function (e) {
                        console.log('Picture: Mouse entered static LIF image');
                        startAnimationSafe();
                    }, { passive: true });
                    this.img.addEventListener('mouseleave', function (e) {
                        console.log('Picture: Mouse left static LIF image');
                        stopAnimationSafe();
                    }, { passive: true });

                    // Also add events to the parent containers for better coverage
                    const pictureElement = img.closest('picture');
                    if (pictureElement) {
                        pictureElement.addEventListener('mouseenter', function (e) {
                            console.log('Picture: Mouse entered picture element');
                            startAnimationSafe();
                        }, { passive: true });
                        pictureElement.addEventListener('mouseleave', function (e) {
                            console.log('Picture: Mouse left picture element');
                            stopAnimationSafe();
                        }, { passive: true });
                    }

                    // Add mousemove events for more responsive interaction
                    canvasElement.addEventListener('mousemove', function (e) {
                        // Ensure animation is running when mouse is moving over canvas
                        if (!isAnimating) {
                            console.log('Picture: Mouse moved over canvas - starting animation');
                            startAnimationSafe();
                        }

                        if (lifViewerInstance.handleMouseMove) {
                            lifViewerInstance.handleMouseMove(e);
                        }
                    }, { passive: true });

                    // Also add mousemove to the static image
                    this.img.addEventListener('mousemove', function (e) {
                        // Ensure animation is running when mouse is moving over static image
                        if (!isAnimating) {
                            console.log('Picture: Mouse moved over static image - restarting animation');
                            startAnimationSafe();
                        }

                        if (lifViewerInstance.handleMouseMove) {
                            lifViewerInstance.handleMouseMove(e);
                        }
                    }, { passive: true });

                    console.log('Enhanced picture element mouse events configured');

                    // Additional debugging after a short delay
                    setTimeout(() => {
                        console.log('Picture element state after setup:', {
                            canvasDisplay: canvasElement.style.display,
                            staticImgDisplay: this.img.style.display,
                            canvasInDOM: document.contains(canvasElement),
                            staticImgInDOM: document.contains(this.img),
                            isAnimating: isAnimating
                        });

                        // Add visual debugging - temporarily highlight elements when hovered
                        const addVisualDebug = (element, name) => {
                            if (element && document.contains(element)) {
                                element.addEventListener('mouseenter', function () {
                                    console.log(`Visual debug: Mouse entered ${name}`);
                                    this.style.outline = '3px solid red';
                                }, { passive: true });
                                element.addEventListener('mouseleave', function () {
                                    console.log(`Visual debug: Mouse left ${name}`);
                                    this.style.outline = '';
                                }, { passive: true });
                            }
                        };

                        // Add visual debugging to picture elements
                        addVisualDebug(canvasElement, 'canvas');
                        addVisualDebug(this.img, 'static image');

                        const pictureElement = img.closest('picture');
                        if (pictureElement) {
                            addVisualDebug(pictureElement, 'picture element');
                        }

                        console.log('Visual debugging enabled - elements will have red outline on hover');
                    }, 1000);
                } else {
                    console.log('Setting up standard mouse events with state management');

                    // Standard event handling for non-picture elements with same state management
                    canvasElement.addEventListener('mouseenter', function (e) {
                        console.log('Mouse entered LIF canvas - starting animation');
                        e.stopPropagation();
                        startAnimationSafe();
                    }, { passive: true });

                    canvasElement.addEventListener('mouseleave', function (e) {
                        console.log('Mouse left LIF canvas - stopping animation');
                        e.stopPropagation();
                        stopAnimationSafe();
                    }, { passive: true });

                    // Also add events to the static LIF image for non-picture elements
                    this.img.addEventListener('mouseenter', function (e) {
                        console.log('Mouse entered static LIF image - starting animation');
                        startAnimationSafe();
                    }, { passive: true });

                    this.img.addEventListener('mouseleave', function (e) {
                        console.log('Mouse left static LIF image - stopping animation');
                        stopAnimationSafe();
                    }, { passive: true });

                    // Also handle mouse movement for more responsive interaction
                    canvasElement.addEventListener('mousemove', function (e) {
                        if (!isAnimating) {
                            startAnimationSafe();
                        }
                        if (lifViewerInstance.handleMouseMove) {
                            lifViewerInstance.handleMouseMove(e);
                        }
                    }, { passive: true });

                    // Also add mousemove to the static image for non-picture elements
                    this.img.addEventListener('mousemove', function (e) {
                        if (!isAnimating) {
                            console.log('Mouse moved over static LIF image - restarting animation');
                            startAnimationSafe();
                        }
                        if (lifViewerInstance.handleMouseMove) {
                            lifViewerInstance.handleMouseMove(e);
                        }
                    }, { passive: true });
                }

                // Add a visual indicator that the LIF is ready
                if (lifContainer) {
                    lifContainer.setAttribute('data-lif-active', 'true');
                }

                // Fallback: ensure canvas is definitely visible and properly configured
                setTimeout(() => {
                    if (this.canvas && this.canvas.style.display !== 'block') {
                        console.log('Fallback: forcing canvas visibility');
                        this.canvas.style.display = 'block';
                        this.canvas.style.position = 'absolute';
                        this.canvas.style.top = '0';
                        this.canvas.style.left = '0';
                        this.canvas.style.zIndex = '10';
                        this.canvas.style.pointerEvents = 'auto';
                    }

                    // Verify the canvas is in the DOM
                    if (!this.canvas.parentElement) {
                        console.warn('Canvas not in DOM, re-adding to container');
                        if (lifContainer) {
                            lifContainer.appendChild(this.canvas);
                        }
                    }

                    console.log('Final canvas state:', {
                        display: this.canvas.style.display,
                        width: this.canvas.width,
                        height: this.canvas.height,
                        parentElement: this.canvas.parentElement?.tagName,
                        inDOM: document.contains(this.canvas),
                        pointerEvents: this.canvas.style.pointerEvents,
                        isPictureElement: pictureElementForEvents
                    });
                }, 150); // Slightly longer delay to ensure everything is set up

                console.log(`LIF viewer initialized with dimensions: ${effectiveWidth}x${effectiveHeight}`);
                console.log('Container:', lifContainer);
                console.log('Canvas parent:', this.canvas.parentElement);
                console.log('Canvas event listeners set up for mouse interaction');
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

        // Remove processing overlay - check both container and overlayContainer
        const overlay = container?.querySelector('.lif-processing-overlay');
        if (overlay) {
            overlay.remove();
        }
        if (container) {
            container.classList.remove('processing');
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

        // Also check for picture element overlay
        const pictureParent = img.closest('picture')?.parentElement;
        if (pictureParent) {
            const pictureOverlay = pictureParent.querySelector('.lif-processing-overlay');
            if (pictureOverlay) {
                pictureOverlay.remove();
            }
            pictureParent.classList.remove('processing');
        }

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
        hasResponsivePattern: false
    };

    // 1. Detect padding-based aspect ratio (Instagram, Pinterest, Google, etc.)
    const paddingBottom = computedStyle.paddingBottom;
    const paddingTop = computedStyle.paddingTop;
    const height = computedStyle.height;

    // Parse numeric values from CSS (handles both px and % values)
    const paddingBottomValue = parseFloat(paddingBottom) || 0;
    const paddingTopValue = parseFloat(paddingTop) || 0;
    const heightValue = parseFloat(height) || 0;

    // Check for percentage-based padding (like Google's 94.118%)
    const hasPercentagePadding = paddingBottom.includes('%') || paddingTop.includes('%');
    const hasPaddingValue = paddingBottomValue > 0 || paddingTopValue > 0;
    const hasZeroHeight = heightValue === 0 || height === '0px' || height === 'auto';

    if ((hasPaddingValue || hasPercentagePadding) && hasZeroHeight) {
        analysis.type = 'padding-aspect-ratio';
        analysis.preserveOriginal = true;
        analysis.reason = `Container uses padding-based sizing (padding-top: ${paddingTop}, padding-bottom: ${paddingBottom}, height: ${height})`;
        analysis.containerHasPaddingAspectRatio = true;

        console.log('Padding-based aspect ratio detected:', {
            paddingTop,
            paddingBottom,
            height,
            paddingTopValue,
            paddingBottomValue,
            heightValue,
            hasPercentagePadding
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
function addConvertButton(img) {
    // Get both rendered and intrinsic dimensions
    const renderedWidth = img.width || 0;
    const renderedHeight = img.height || 0;
    const intrinsicWidth = img.naturalWidth || 0;
    const intrinsicHeight = img.naturalHeight || 0;

    console.log(`Image dimensions - Rendered: ${renderedWidth}x${renderedHeight}, Intrinsic: ${intrinsicWidth}x${intrinsicHeight}`);

    // Use intrinsic dimensions if rendered size is 0x0 or too small
    const effectiveWidth = renderedWidth > 0 ? renderedWidth : intrinsicWidth;
    const effectiveHeight = renderedHeight > 0 ? renderedHeight : intrinsicHeight;

    // Skip if image is too small (using effective dimensions)
    if (effectiveWidth < 100 || effectiveHeight < 100) {
        return;
    }

    // Skip if already has a button
    if (img.dataset.lifButtonAdded) {
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
        // CNN structure: container__item-media > image > image__container > picture
        const imageContainer = pictureElement.parentElement; // image__container
        const imageDiv = imageContainer?.parentElement; // image div
        const containerMedia = imageDiv?.parentElement; // container__item-media

        // Use the highest level container that has proper spacing, fallback to lower levels
        if (containerMedia && containerMedia.classList.contains('container__item-media')) {
            targetElement = containerMedia;
        } else if (imageDiv && imageDiv.classList.contains('image')) {
            targetElement = imageDiv;
        } else {
            targetElement = imageContainer;
        }

        // Get the actual current dimensions of the picture element
        const pictureRect = pictureElement.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        // For picture elements, we don't want to wrap anything - just add overlay positioning
        if (pictureRect.width > 0 && pictureRect.height > 0) {
            // Make sure the target container can contain positioned elements
            const parentStyle = window.getComputedStyle(targetElement);
            if (parentStyle.position === 'static') {
                targetElement.style.position = 'relative';
            }

            // Store dimensions for later use with LIF viewer
            pictureElement.dataset.lifTargetWidth = Math.round(pictureRect.width);
            pictureElement.dataset.lifTargetHeight = Math.round(pictureRect.height);
        }
    }

    // Create container only for non-picture images or if overlay approach fails
    let imageContainer = targetElement;
    let layoutAnalysis = null;

    if (!isPictureImage || !useOverlayApproach) {
        if (!imageContainer.classList.contains('lif-image-container')) {
            // Analyze the original container's layout before we modify anything
            layoutAnalysis = analyzeLayoutPattern(imageContainer, img);

            console.log('Layout analysis for container:', layoutAnalysis);

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

        console.log('Container analysis:', {
            containerSize: `${containerRect.width}x${containerRect.height}`,
            parentSize: parentRect ? `${parentRect.width}x${parentRect.height}` : 'none',
            needsSizeFix,
            hasImageRenderingIssues,
            parentHasValidSize,
            layoutType: layoutAnalysis?.type || 'new-container',
            preserveOriginal: layoutAnalysis?.preserveOriginal || false
        });

        // Respect layout analysis - avoid fixes that would disrupt existing patterns
        if (layoutAnalysis?.preserveOriginal) {
            console.log(`Preserving original layout: ${layoutAnalysis.reason}`);

            // For padding-based aspect ratios (like Instagram), don't apply size fixes to containers
            if (layoutAnalysis.containerHasPaddingAspectRatio) {
                console.log('Detected padding-based aspect ratio - preserving container layout');

                // Ensure our wrapper container fills the padding-created space
                imageContainer.style.position = 'absolute';
                imageContainer.style.top = '0';
                imageContainer.style.left = '0';
                imageContainer.style.width = '100%';
                imageContainer.style.height = '100%';
                imageContainer.style.overflow = 'hidden';

                // Handle different types of padding-based layouts
                if (layoutAnalysis.imageIsAbsolute) {
                    console.log('Image is absolutely positioned in padding-based container (Google/Pinterest style)');
                    // Ensure the image maintains its absolute positioning and covers the container
                    img.style.position = 'absolute';
                    img.style.top = '0';
                    img.style.left = '0';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    img.style.display = 'block';
                } else if (hasImageRenderingIssues) {
                    console.log('Fixing image display within padding-based container (Instagram style)');

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

                    console.log('Post-fix dimensions check:', {
                        containerSize: `${containerRect.width}x${containerRect.height}`,
                        imageSize: `${imgRect.width}x${imgRect.height}`
                    });

                    if (imgRect.width === 0 || imgRect.height === 0) {
                        console.log('Image still 0x0 after padding-based fixes, applying fallback');
                        img.style.position = 'absolute';
                        img.style.top = '0';
                        img.style.left = '0';
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.display = 'block';
                        console.log('Applied fallback positioning for padding-based layout');
                    }
                }, 100);
            }

            // For responsive containers, minimal intervention
            else if (layoutAnalysis.hasResponsivePattern) {
                console.log('Responsive pattern detected - minimal intervention');
                // Only fix if absolutely necessary and in a way that preserves responsiveness
                if (needsSizeFix && effectiveWidth > 0 && effectiveHeight > 0) {
                    // Use max-width instead of width to preserve responsiveness
                    imageContainer.style.maxWidth = `${effectiveWidth}px`;
                    imageContainer.style.maxHeight = `${effectiveHeight}px`;
                }
            }

            // For flex/grid children, even more minimal intervention
            else if (layoutAnalysis.parentUsesFlexOrGrid) {
                console.log('Flex/Grid layout detected - minimal intervention');
                // Just ensure relative positioning for button placement
                imageContainer.style.position = 'relative';
            }
        }

        // Only apply aggressive fixes if no special layout patterns detected
        else if (needsSizeFix && (effectiveWidth > 0 && effectiveHeight > 0)) {
            console.log('No special layout detected - applying standard size fix:', effectiveWidth, 'x', effectiveHeight);

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
            console.log('Image has rendering issues, applying conservative fixes');

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

            console.log(`Setting conservative image display size to: ${displayWidth}x${displayHeight}`);

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
        // For picture elements using overlay approach, ensure we have a proper container reference
        console.log('Picture element using overlay approach - setting up container reference');
        imageContainer = targetElement; // This is the picture parent container
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
        console.log('Detected existing hover/zoom behavior on image, applying enhanced protection');
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
        button.style.zIndex = '9999999';
    });

    button.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
    });

    // Add button to protective zone, then add zone to appropriate container
    buttonZone.appendChild(button);

    if (isPictureImage && useOverlayApproach) {
        // For picture elements, add to the parent container (positioned absolutely)
        buttonZone.style.position = 'absolute';
        buttonZone.style.top = '0';
        buttonZone.style.right = '0';
        buttonZone.style.zIndex = '99999999'; // Much higher z-index to ensure it's on top
        buttonZone.style.pointerEvents = 'auto'; // Allow pointer events so button can receive clicks

        // Use appropriate sizing - larger if hover behaviors detected, standard otherwise
        if (hasImageHoverBehaviors) {
            buttonZone.style.width = '100px';
            buttonZone.style.height = '60px';
        } else {
            buttonZone.style.width = '80px';
            buttonZone.style.height = '50px';
        }

        targetElement.appendChild(buttonZone);
        console.log('Using absolute positioning for picture element button');
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
        console.log('Using default positioning for regular image button');
    }

    // Mark image as processed
    img.dataset.lifButtonAdded = 'true';

    console.log('Added 2D3D button to image:', img.src.substring(0, 50) + '...');
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
function processImages() {
    if (!isExtensionEnabled) return;

    const images = document.querySelectorAll('img');
    images.forEach(img => {
        // Wait for image to load before adding button
        if (img.complete) {
            addConvertButton(img);
        } else {
            img.addEventListener('load', () => addConvertButton(img), { once: true });
        }
    });

    // Show any hidden buttons if re-enabling
    document.querySelectorAll('.lif-converter-btn').forEach(btn => {
        btn.style.display = '';
    });
}

// Function to handle new images added dynamically
function observeNewImages() {
    const observer = new MutationObserver((mutations) => {
        if (!isExtensionEnabled) return;

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Skip if this is a LIF-related element being added
                    if (node.classList && (
                        node.classList.contains('lif-processing-overlay') ||
                        node.tagName === 'CANVAS' ||
                        node.classList.contains('lif-converter-btn') ||
                        node.classList.contains('lif-button-zone')
                    )) {
                        return;
                    }

                    // Skip if this node is being added to a LIF-active container
                    if (node.closest && node.closest('[data-lif-active="true"]')) {
                        return;
                    }

                    // Check if the added node is an image
                    if (node.tagName === 'IMG') {
                        // Additional checks for the specific image before processing
                        if (node.src && (
                            node.src.includes('leia-storage-service') ||
                            node.src.includes('immersity') ||
                            node.src.includes('lifResult')
                        )) {
                            return;
                        }

                        // Check if this image is part of a picture element that's already processed
                        const pictureParent = node.closest('picture');
                        if (pictureParent && pictureParent.dataset.lifTargetWidth) {
                            return;
                        }

                        if (node.complete) {
                            addConvertButton(node);
                        } else {
                            node.addEventListener('load', () => addConvertButton(node), { once: true });
                        }
                    }

                    // Check for images within the added node
                    const images = node.querySelectorAll && node.querySelectorAll('img');
                    if (images) {
                        images.forEach(img => {
                            // Same filtering as above
                            if (img.src && (
                                img.src.includes('leia-storage-service') ||
                                img.src.includes('immersity') ||
                                img.src.includes('lifResult')
                            )) {
                                return;
                            }

                            const pictureParent = img.closest('picture');
                            if (pictureParent && pictureParent.dataset.lifTargetWidth) {
                                return;
                            }

                            if (img.complete) {
                                addConvertButton(img);
                            } else {
                                img.addEventListener('load', () => addConvertButton(img), { once: true });
                            }
                        });
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Function to load extension state from storage
async function loadExtensionState() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        isExtensionEnabled = result[STORAGE_KEY] !== undefined ? result[STORAGE_KEY] : false;
        console.log('Loaded extension state:', isExtensionEnabled ? 'enabled' : 'disabled');
    } catch (error) {
        console.error('Error loading extension state:', error);
        isExtensionEnabled = false; // Default to disabled on error
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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleExtension') {
        const wasEnabled = isExtensionEnabled;
        isExtensionEnabled = !isExtensionEnabled;

        // Save the new state
        saveExtensionState();

        if (isExtensionEnabled) {
            // Extension was enabled
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
    } else if (request.action === 'getStatus') {
        sendResponse({ enabled: isExtensionEnabled });
    }
});

// Initialize the extension
async function initialize() {
    console.log('Initializing 2D to 3D Image Converter...');

    // Add helpful CORS information for developers
    console.log(`
🎭 ImmersityLens Chrome Extension Tips:

📍 CORS-Friendly Sites (usually work well):
   • Wikipedia, Wikimedia Commons
   • Unsplash, Pixabay, Pexels
   • GitHub repositories
   • Most photography blogs
   • Social media sites (when images are directly accessible)

⚠️  CORS-Restricted Sites (may not work):
   • News sites with CDN protection (like AFAR)
   • E-commerce sites with image protection
   • Sites with strict referrer policies
   • Images served from different domains with no CORS headers

💡 Best Results: Try the extension on image gallery sites, Wikipedia articles, or photography portfolios!
    `);

    // Load saved state first
    await loadExtensionState();

    // Inject CSS styles
    injectStyles();

    // Only start processing images if extension is enabled
    if (isExtensionEnabled) {
        processImages();
        console.log('Extension enabled - processing images');
    } else {
        console.log('Extension disabled - not processing images');
    }

    // Start observing new images regardless of state (for when user re-enables)
    observeNewImages();

    console.log('2D to 3D Image Converter initialized successfully!');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
} 