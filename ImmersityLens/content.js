// Global state for the extension
let isExtensionEnabled = true; // Default value, will be overridden by stored state
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
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .lif-converter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
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

        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        // Method 1: Try direct canvas drawing if image is same-origin or already loaded
        try {
            if (img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
                    console.log('✓ Image converted using direct canvas drawing');
                    resolve(file);
                }, 'image/jpeg', 0.9);
                return;
            }
        } catch (corsError) {
            console.log('Direct canvas drawing failed due to CORS, trying alternatives...');
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
                        console.log('✓ Image converted using crossOrigin anonymous');
                        imgResolve(file);
                    }, 'image/jpeg', 0.9);
                } catch (error) {
                    console.log('crossOrigin anonymous failed:', error);
                    imgReject(error);
                }
            };

            tempImg.onerror = (error) => {
                console.log('crossOrigin image load failed:', error);
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
                console.log(`Trying fetch with mode: ${fetchConfig.mode}`);
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
                        console.log('Got empty blob from no-cors fetch, trying next method...');
                        continue;
                    }

                    const file = new File([blob], 'image.jpg', {
                        type: blob.type || 'image/jpeg'
                    });
                    console.log(`✓ Image converted using fetch (${fetchConfig.mode}), size: ${blob.size} bytes`);
                    resolve(file);
                    return;
                }
            } catch (fetchError) {
                console.log(`Fetch failed with mode ${fetchConfig.mode}:`, fetchError);
                continue;
            }
        }

        // Method 4: Try using a proxy approach via data URL
        try {
            console.log('Trying to create data URL from existing image...');

            // Create a temporary canvas with the same dimensions
            const proxyCanvas = document.createElement('canvas');
            const proxyCtx = proxyCanvas.getContext('2d');
            proxyCanvas.width = img.width;
            proxyCanvas.height = img.height;

            // Try to get the image data from the original image's computed style
            // This is a last-ditch effort for some edge cases
            const computedStyle = window.getComputedStyle(img);
            const backgroundImage = computedStyle.backgroundImage;

            if (backgroundImage && backgroundImage !== 'none') {
                console.log('Trying background image extraction...');
                // This is a complex fallback - in most cases we won't reach here
            }

            // Fill with a placeholder pattern if all else fails
            proxyCtx.fillStyle = '#f0f0f0';
            proxyCtx.fillRect(0, 0, proxyCanvas.width, proxyCanvas.height);
            proxyCtx.fillStyle = '#ddd';
            proxyCtx.font = '16px Arial';
            proxyCtx.textAlign = 'center';
            proxyCtx.fillText('Image processing...', proxyCanvas.width / 2, proxyCanvas.height / 2);

            proxyCanvas.toBlob((blob) => {
                const file = new File([blob], 'placeholder.jpg', { type: 'image/jpeg' });
                console.log('⚠️ Using placeholder image due to CORS restrictions');
                resolve(file);
            }, 'image/jpeg', 0.9);

        } catch (finalError) {
            console.error('All image conversion methods failed:', finalError);

            // Last resort: create a minimal placeholder file
            const placeholderBlob = new Blob(['placeholder'], { type: 'image/jpeg' });
            const file = new File([placeholderBlob], 'error.jpg', { type: 'image/jpeg' });
            console.log('❌ Using minimal placeholder due to complete conversion failure');
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
        const container = img.closest('.lif-image-container');
        if (container) {
            container.classList.add('processing');
            const overlay = document.createElement('div');
            overlay.className = 'lif-processing-overlay';
            overlay.innerHTML = '<div class="lif-spinner"></div>Converting to 3D...';
            container.appendChild(overlay);
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
        console.log(`✓ Image successfully converted to file: ${file.size} bytes`);

        // Create LIF generator
        const lifGen = new monoLdiGenerator(file, 'lama');

        // Set up completion handler
        lifGen.afterLoad = function () {
            console.log('LIF conversion completed!', this.lifDownloadUrl);

            // Update button to LIF state and ensure it persists
            console.log('Updating button to LIF state...');
            button.textContent = '⬇️ LIF';
            button.classList.remove('processing');
            button.classList.add('lif-ready');
            button.disabled = false;
            button.dataset.state = 'lif-ready';
            button.title = 'Click to download the LIF file';

            // Remove processing overlay
            const overlay = container?.querySelector('.lif-processing-overlay');
            if (overlay) {
                overlay.remove();
            }
            if (container) {
                container.classList.remove('processing');
            }

            // Create the LIF viewer with exact original image dimensions
            const originalWidth = img.width || img.naturalWidth;
            const originalHeight = img.height || img.naturalHeight;

            console.log(`Creating LIF viewer for image: ${originalWidth}x${originalHeight}`);

            const viewer = new lifViewer(this.lifDownloadUrl, container || img.parentElement, originalHeight, true, true);

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

                // Get the original image dimensions for proper sizing
                const originalWidth = img.width || img.naturalWidth;
                const originalHeight = img.height || img.naturalHeight;

                console.log(`Original image size: ${originalWidth}x${originalHeight}`);

                // Ensure the container maintains the original image dimensions
                if (container) {
                    container.style.cssText = `
                        position: relative;
                        display: inline-block;
                        width: ${originalWidth}px;
                        height: ${originalHeight}px;
                        overflow: hidden;
                    `;
                }

                // Hide the original image first
                img.style.display = 'none';

                // Set up the LIF viewer image and canvas with correct dimensions and positioning
                this.img.style.cssText = `
                    width: ${originalWidth}px !important;
                    height: ${originalHeight}px !important;
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
                    width: ${originalWidth}px !important;
                    height: ${originalHeight}px !important;
                    max-width: none !important;
                    max-height: none !important;
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 2;
                    display: block;
                `;

                // Force canvas dimensions to match exactly
                this.canvas.width = originalWidth;
                this.canvas.height = originalHeight;

                // Immediately show the LIF animation canvas
                this.img.style.display = 'none';
                this.canvas.style.display = 'block';

                console.log(`Canvas is now visible with dimensions: ${this.canvas.width}x${this.canvas.height}`);
                console.log(`Canvas style:`, this.canvas.style.cssText);

                // Fallback: ensure canvas is definitely visible after a short delay
                setTimeout(() => {
                    if (this.canvas && this.canvas.style.display !== 'block') {
                        console.log('Fallback: forcing canvas visibility');
                        this.canvas.style.display = 'block';
                        this.canvas.style.position = 'absolute';
                        this.canvas.style.top = '0';
                        this.canvas.style.left = '0';
                        this.canvas.style.zIndex = '10';
                    }

                    // Verify the canvas is in the DOM
                    if (!this.canvas.parentElement) {
                        console.warn('Canvas not in DOM, re-adding to container');
                        if (container) {
                            container.appendChild(this.canvas);
                        }
                    }

                    console.log('Final canvas state:', {
                        display: this.canvas.style.display,
                        width: this.canvas.width,
                        height: this.canvas.height,
                        parentElement: this.canvas.parentElement?.tagName,
                        inDOM: document.contains(this.canvas)
                    });
                }, 100);

                // Set up hover effects for enhanced interaction
                this.container.addEventListener('mouseenter', () => {
                    console.log('Mouse entered LIF container - starting animation');
                    this.startAnimation();
                });

                this.container.addEventListener('mouseleave', () => {
                    console.log('Mouse left LIF container - stopping animation');
                    this.stopAnimation();
                });

                // Add a visual indicator that the LIF is ready
                if (container) {
                    container.setAttribute('data-lif-active', 'true');
                }

                console.log(`LIF viewer initialized with dimensions: ${originalWidth}x${originalHeight}`);
                console.log('Container:', container);
                console.log('Canvas parent:', this.canvas.parentElement);
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

        // Remove processing overlay
        const container = img.closest('.lif-image-container');
        const overlay = container?.querySelector('.lif-processing-overlay');
        if (overlay) {
            overlay.remove();
        }
        if (container) {
            container.classList.remove('processing');
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

// Function to add 2D3D button to an image
function addConvertButton(img) {
    // Skip if image is too small or already has a button
    if (img.width < 100 || img.height < 100 || img.dataset.lifButtonAdded) {
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
    const container = img.closest('.lif-image-container');
    if (container) {
        const existingButton = container.querySelector('.lif-converter-btn');
        if (existingButton) {
            // Don't modify existing buttons, especially if they're in LIF state
            console.log('Skipping image - already has a LIF button');
            return;
        }
    }

    // Create container if the image doesn't have one
    let imageContainer = img.parentElement;
    if (!imageContainer.classList.contains('lif-image-container')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'lif-image-container';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        imageContainer = wrapper;
    }

    // Ensure container has relative positioning
    const computedStyle = window.getComputedStyle(imageContainer);
    if (computedStyle.position === 'static') {
        imageContainer.style.position = 'relative';
    }

    // Create the 2D3D button
    const button = document.createElement('button');
    button.className = 'lif-converter-btn';
    button.textContent = '2D3D';
    button.title = 'Convert to immersive 3D image';
    button.dataset.originalText = '2D3D'; // Store original state
    button.dataset.state = 'ready'; // Track button state

    // Add click handler
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Only allow conversion if in ready state
        if (button.dataset.state === 'ready') {
            convertTo3D(img, button);
        } else if (button.dataset.state === 'lif-ready') {
            // Download LIF file when LIF button is clicked
            console.log('LIF button clicked - downloading LIF file');
            const viewer = button.lifViewer;
            if (viewer && viewer.lifUrl) {
                downloadLIFFile(viewer.lifUrl, img.src);
            } else {
                console.error('LIF viewer or LIF URL not available for download');
                showDownloadNotification('LIF file not ready for download', 'error');
            }
        }
    });

    // Add button to container
    imageContainer.appendChild(button);

    // Mark image as processed
    img.dataset.lifButtonAdded = 'true';

    console.log('Added 2D3D button to image:', img.src.substring(0, 50) + '...');
}

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
                        node.classList.contains('lif-converter-btn')
                    )) {
                        return;
                    }

                    // Check if the added node is an image
                    if (node.tagName === 'IMG') {
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
        isExtensionEnabled = result[STORAGE_KEY] !== undefined ? result[STORAGE_KEY] : true;
        console.log('Loaded extension state:', isExtensionEnabled ? 'enabled' : 'disabled');
    } catch (error) {
        console.error('Error loading extension state:', error);
        isExtensionEnabled = true; // Default to enabled on error
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