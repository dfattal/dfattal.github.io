import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SplatMesh } from '@sparkjsdev/spark';
import { LumaSplatsThree } from '@lumaai/luma-web';
import { validateFile, detectSplatFormat, formatFileSize, isLumaURL, getLumaCaptureId } from './utils/fileValidator.js';
import { getQualityPreset, applyQualityToRenderer, detectRecommendedQuality, logQualityInfo } from './utils/qualityPresets.js';

// Global variables
let scene, camera, renderer, controls;
let currentSplat = null;
let currentSplatIsLuma = false; // Track if current splat is a Luma capture
let currentQuality = 'medium';
let lastFileAttempt = null; // For retry functionality

// UI elements
let uiContainer, splatInfo, dropZone, fileInput;
let urlInput, loadUrlBtn;
let infoFilename, infoFormat, infoStatus;
let loadingIndicator, errorDisplay, retryBtn;
let qualityOptions;

// Initialize the application
async function init() {
    console.log('Initializing Gaussian Splat Viewer...');

    // Get UI elements
    setupUIElements();

    // Detect and set recommended quality preset
    const recommended = detectRecommendedQuality();
    console.log(`Recommended quality preset: ${recommended}`);

    // Set up Three.js scene
    setupScene();

    // Set up event listeners
    setupEventListeners();

    // Log quality info
    logQualityInfo(currentQuality);

    console.log('Viewer initialized successfully');
}

// Set up UI element references
function setupUIElements() {
    uiContainer = document.getElementById('ui-container');
    splatInfo = document.getElementById('splat-info');
    dropZone = document.getElementById('drop-zone');
    fileInput = document.getElementById('file-input');
    urlInput = document.getElementById('url-input');
    loadUrlBtn = document.getElementById('load-url-btn');
    infoFilename = document.getElementById('info-filename');
    infoFormat = document.getElementById('info-format');
    infoStatus = document.getElementById('info-status');
    loadingIndicator = document.getElementById('loading-indicator');
    errorDisplay = document.getElementById('error-display');
    retryBtn = document.getElementById('retry-btn');
    qualityOptions = document.querySelectorAll('.quality-option');
}

// Set up Three.js scene, camera, and renderer
function setupScene() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Create camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    // Position camera 2 meters back from origin (where splat will be)
    // Splats have their origin at eye level, so Y should be 0
    camera.position.set(0, 0, 2); // 2 meters back, at splat origin height

    // Create renderer
    const preset = getQualityPreset(currentQuality);
    renderer = new THREE.WebGLRenderer({ antialias: preset.antialias });
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Apply initial quality settings
    applyQualityToRenderer(renderer, currentQuality);

    // Add VR button
    const vrButtonContainer = document.getElementById('vr-button-container');
    const vrButton = VRButton.createButton(renderer);
    vrButtonContainer.appendChild(vrButton);

    // Listen for XR session start to position user
    renderer.xr.addEventListener('sessionstart', onXRSessionStart);
    renderer.xr.addEventListener('sessionend', onXRSessionEnd);

    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Add helper grid and axes for debugging (optional - can be removed)
    // Uncomment these to see grid and axes helpers
    // const gridHelper = new THREE.GridHelper(10, 10, 0x00ff00, 0x404040);
    // scene.add(gridHelper);
    // const axesHelper = new THREE.AxesHelper(5);
    // scene.add(axesHelper);
    // const testCube = new THREE.Mesh(
    //     new THREE.BoxGeometry(0.5, 0.5, 0.5),
    //     new THREE.MeshStandardMaterial({ color: 0xff0000 })
    // );
    // testCube.position.set(0, 0.5, 0);
    // scene.add(testCube);

    // Add OrbitControls for 2D navigation
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.update();

    console.log('Scene setup complete, helpers and test cube added');
    console.log('Camera position:', camera.position);
    console.log('Camera looking at:', camera.rotation);
    console.log('OrbitControls enabled');

    // Start render loop
    renderer.setAnimationLoop(render);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Set up event listeners
function setupEventListeners() {
    // Drag and drop
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', onDragOver);
    dropZone.addEventListener('dragleave', onDragLeave);
    dropZone.addEventListener('drop', onDrop);

    // File input
    fileInput.addEventListener('change', onFileSelected);

    // URL loading
    loadUrlBtn.addEventListener('click', onLoadFromURL);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') onLoadFromURL();
    });

    // Quality preset selection
    qualityOptions.forEach(option => {
        option.addEventListener('click', () => {
            qualityOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            const radio = option.querySelector('input[type="radio"]');
            radio.checked = true;
            currentQuality = radio.value;

            // Apply quality preset to renderer
            applyQualityToRenderer(renderer, currentQuality);
            logQualityInfo(currentQuality);

            console.log(`Quality preset changed to: ${currentQuality}`);
        });
    });

    // Retry button
    retryBtn.addEventListener('click', onRetry);
}

// Drag and drop handlers
function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
}

function onDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
}

function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function onFileSelected(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

// File handling
async function handleFile(file) {
    console.log(`Loading file: ${file.name} (${formatFileSize(file.size)})`);

    // Validate file
    const validation = validateFile(file);

    if (!validation.valid) {
        console.error('File validation failed:', validation.error);
        showError('Invalid File', validation.error);
        return;
    }

    // Show warning if file is large
    if (validation.warning) {
        console.warn(validation.warning);
    }

    // Store for retry functionality
    lastFileAttempt = { type: 'file', data: file };

    showLoading();
    hideError();

    try {
        const format = detectSplatFormat(file.name);
        console.log(`Detected format: ${format}`);

        // Convert file to blob URL for loading
        // SplatMesh can load directly from blob URLs
        const blobURL = URL.createObjectURL(file);

        // Load the splat based on format
        await loadSplatByFormat(blobURL, format, file.name);

        // Note: Don't revoke immediately, SplatMesh might need it
        // Clean up after a delay
        setTimeout(() => {
            URL.revokeObjectURL(blobURL);
        }, 1000);

        hideLoading();
        showSuccess(file.name, format.toUpperCase());

        console.log('File loaded successfully');
    } catch (error) {
        console.error('Error loading file:', error);
        hideLoading();
        showError('Failed to Load Splat', error.message || 'An unknown error occurred');
    }
}

// URL loading
async function onLoadFromURL() {
    const url = urlInput.value.trim();

    if (!url) {
        showError('Invalid URL', 'Please enter a valid URL');
        return;
    }

    // Validate URL format
    const validation = validateFile(url);

    if (!validation.valid) {
        console.error('URL validation failed:', validation.error);
        showError('Invalid URL', validation.error);
        return;
    }

    // Store for retry functionality
    lastFileAttempt = { type: 'url', data: url };

    console.log(`Loading from URL: ${url}`);
    showLoading();
    hideError();

    try {
        // Check if it's a Luma AI URL first
        const format = isLumaURL(url) ? 'luma' : detectSplatFormat(url);
        console.log(`Detected format from URL: ${format}`);

        // Extract filename from URL for display
        let filename;
        if (isLumaURL(url)) {
            const captureId = getLumaCaptureId(url);
            filename = captureId ? `Luma Capture ${captureId.substring(0, 8)}...` : 'Luma Capture';
        } else {
            filename = url.split('/').pop().split('?')[0] || 'Remote file';
        }

        // Load with timeout
        const timeoutMs = 30000; // 30 second timeout
        const loadPromise = loadSplatByFormat(url, format, filename);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Loading timeout - file took too long to load')), timeoutMs)
        );

        await Promise.race([loadPromise, timeoutPromise]);

        hideLoading();
        showSuccess(filename, format.toUpperCase());

        console.log('URL loaded successfully');
    } catch (error) {
        console.error('Error loading from URL:', error);
        hideLoading();

        if (error.message.includes('timeout')) {
            showError('Loading Timeout', error.message);
        } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
            showError('Network Error', 'Could not fetch file from URL. Please check the URL and your internet connection.');
        } else {
            showError('Failed to Load from URL', error.message || 'An unknown error occurred');
        }
    }
}

// Retry last file attempt
function onRetry() {
    hideError();

    if (!lastFileAttempt) {
        console.warn('No previous file attempt to retry');
        return;
    }

    console.log('Retrying last file attempt...');

    if (lastFileAttempt.type === 'file') {
        handleFile(lastFileAttempt.data);
    } else if (lastFileAttempt.type === 'url') {
        // Set the URL input and trigger load
        urlInput.value = lastFileAttempt.data;
        onLoadFromURL();
    }
}

// Load splat based on detected format using Spark's SplatMesh or Luma's LumaSplatsThree
async function loadSplatByFormat(urlOrBuffer, format, filename) {
    console.log(`Loading ${format} format from:`, urlOrBuffer);

    try {
        // Remove previous splat if exists
        if (currentSplat) {
            console.log('Removing previous splat from scene');
            scene.remove(currentSplat);
            currentSplat.dispose?.();
        }

        let splatObject;

        // Check if it's a Luma AI capture URL
        if (typeof urlOrBuffer === 'string' && isLumaURL(urlOrBuffer)) {
            console.log('Detected Luma AI capture URL, using LumaSplatsThree');

            // Create LumaSplatsThree instance - simple, like Luma examples
            splatObject = new LumaSplatsThree({
                source: urlOrBuffer,
            });

            // Mark this as a Luma splat
            currentSplatIsLuma = true;

            console.log('LumaSplatsThree created');

            // Luma splats load asynchronously but don't need awaiting
            // They will appear when ready
            // Just add a small delay to ensure scene.add() happens cleanly
            await new Promise(resolve => setTimeout(resolve, 100));

        } else {
            // Use Spark's SplatMesh for standard formats
            console.log('Using Spark SplatMesh for standard splat format');
            currentSplatIsLuma = false;

            splatObject = new SplatMesh({
                url: urlOrBuffer,
            });

            console.log('SplatMesh created, waiting for initialization...');

            // Wait for the splat to initialize
            await splatObject.initialized;

            console.log('SplatMesh initialized successfully');
        }

        // Add to scene
        scene.add(splatObject);
        currentSplat = splatObject;

        // Center and scale the splat for optimal viewing
        centerAndScaleSplat(splatObject);

        console.log(`${format} file loaded and added to scene`);

        return splatObject;
    } catch (error) {
        console.error(`Error loading ${format} file:`, error);
        throw error;
    }
}

// Center and scale splat for optimal viewing
function centerAndScaleSplat(splatObject) {
    console.log('Centering and scaling splat object:', splatObject);
    console.log('Splat object type:', splatObject.constructor.name);

    try {
        // Use the global flag we set when loading to determine if this is a Luma splat
        console.log('🔍 Checking object type:');
        console.log('  Constructor name:', splatObject.constructor.name);
        console.log('  currentSplatIsLuma flag:', currentSplatIsLuma);

        if (currentSplatIsLuma) {
            console.log('✅ LumaSplatsThree detected - skipping all transformations');
            console.log('Current rotation before skipping:', splatObject.rotation);
            console.log('Current position before skipping:', splatObject.position);
            console.log('Current scale before skipping:', splatObject.scale);
            // Luma splats work correctly as-is, don't touch them
            return;
        }

        console.log('⚠️ NOT a LumaSplatsThree - applying transformations for standard splat');

        // Fix coordinate system: OpenCV/COLMAP uses Y-down, Three.js uses Y-up
        // Rotate 180 degrees around X axis to flip Y and Z
        splatObject.rotation.x = Math.PI;
        console.log('Applied coordinate system correction (180° rotation around X)');

        // For SplatMesh, we might need to wait a frame for geometry to be ready
        // Try to get the bounding box
        const box = new THREE.Box3();

        // SplatMesh might have specific methods for bounds
        if (splatObject.computeBoundingBox) {
            splatObject.computeBoundingBox();
        }

        box.setFromObject(splatObject);

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        console.log('Bounding box:', {
            min: box.min,
            max: box.max,
            center: center,
            size: size
        });

        // Center the splat at origin for 2D mode
        // In VR mode, the user position is at origin, so the splat needs to be offset
        // But in 2D mode with OrbitControls, we want the splat centered at origin
        splatObject.position.sub(center);

        // Scale to reasonable size (target max dimension of 2 units)
        const maxDimension = Math.max(size.x, size.y, size.z);
        if (maxDimension > 0 && maxDimension !== Infinity) {
            const targetSize = 2.0;
            const scale = targetSize / maxDimension;
            splatObject.scale.multiplyScalar(scale);
            console.log(`Applied scale factor: ${scale.toFixed(4)}`);
        } else {
            console.warn('Could not compute valid size for auto-scaling');
        }

        console.log(`Splat centered and scaled. Original size: ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
        console.log('Final splat position:', splatObject.position);
        console.log('Final splat scale:', splatObject.scale);
        console.log('Final splat rotation:', splatObject.rotation);
    } catch (error) {
        console.error('Error centering/scaling splat:', error);
        // If auto-scaling fails, just position it reasonably and apply rotation
        splatObject.position.set(0, 0, -2);
        splatObject.rotation.x = Math.PI;
    }
}

// XR session handlers
function onXRSessionStart() {
    console.log('XR session started');
    console.log('Camera position before VR:', camera.position);

    // Disable OrbitControls in VR mode
    if (controls) {
        controls.enabled = false;
    }

    // Hide UI when entering VR
    uiContainer.classList.add('hidden');

    // In VR, the XR reference space puts the user at their physical height
    // The splat origin is at eye level (Y=0), but VR user is at ~1.6m
    // We need to raise the splat and move it forward
    if (currentSplat) {
        console.log('Splat position before VR adjustment:', currentSplat.position);

        // Move splat 2m forward (negative Z) and 1.6m up (positive Y) for VR eye level
        currentSplat.position.set(0, 1.6, -2.0);

        console.log('Splat position after VR adjustment:', currentSplat.position);
    }
}

function onXRSessionEnd() {
    console.log('XR session ended');

    // Re-enable OrbitControls when exiting VR
    if (controls) {
        controls.enabled = true;
    }

    // Show UI when exiting VR
    uiContainer.classList.remove('hidden');

    // Return splat to centered position for 2D mode
    if (currentSplat) {
        console.log('Splat position before returning to 2D:', currentSplat.position);

        // Return splat to origin for 2D OrbitControls
        currentSplat.position.set(0, 0, 0);

        console.log('Returned splat to center for 2D viewing. Position:', currentSplat.position);
    }
}

// UI state management
function showLoading() {
    loadingIndicator.classList.add('visible');
    loadUrlBtn.disabled = true;
    splatInfo.classList.remove('visible');
}

function hideLoading() {
    loadingIndicator.classList.remove('visible');
    loadUrlBtn.disabled = false;
}

function showSuccess(filename, format) {
    infoFilename.textContent = filename;
    infoFormat.textContent = format;
    infoStatus.textContent = 'Ready';
    splatInfo.classList.add('visible');
}

function showError(title, message) {
    const errorMessage = document.getElementById('error-message');
    errorDisplay.querySelector('h3').textContent = title;
    errorMessage.textContent = message;
    errorDisplay.classList.add('visible');
}

function hideError() {
    errorDisplay.classList.remove('visible');
}

// Window resize handler
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Render loop
let frameCount = 0;
function render() {
    // Log first few frames for debugging
    if (frameCount < 5) {
        console.log(`Rendering frame ${frameCount}. Scene children:`, scene.children.length);
        frameCount++;
    }

    // Update controls for smooth damping
    if (controls) {
        controls.update();
    }

    renderer.render(scene, camera);
}

// Start the application
init();
