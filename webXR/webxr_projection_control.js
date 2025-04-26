// WebXR example for controlling projection mode in SRHydra
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Constants for projection mode encoding
// Format: farClippingPlane.projectionMode
// The integer part (1000) is the actual far clipping plane in meters
// The decimal part (0 or 0.1) encodes the projection mode
const CAMERA_CENTRIC_MODE = 1500.0; // Integer value for camera-centric projection
const DISPLAY_CENTRIC_MODE = 1000.1; // .1 decimal for display-centric projection

// Debug function to test how JavaScript and C++ handle float values
function debugParseDepthFar(depthFar) {
    const integerPart = Math.floor(depthFar);
    const decimalPart = depthFar - integerPart;

    console.log(`JS parsing of depthFar=${depthFar}:`);
    console.log(`  - Integer part: ${integerPart}`);
    console.log(`  - Decimal part: ${decimalPart}`);
    console.log(`  - Is display-centric? ${Math.abs(decimalPart - 0.1) < 0.01}`);
    console.log(`  - Is camera-centric? ${decimalPart < 0.01}`);

    // Verify precision using toFixed()
    console.log(`  - Raw value in 8 decimals: ${depthFar.toFixed(8)}`);
    return depthFar;
}

// Three.js globals
let scene, camera, renderer, cube;

/**
 * Initializes WebXR session and controls projection mode
 */
async function initWebXR() {
    // Initialize Three.js scene
    initThreeJS();

    // Check if WebXR is available
    if (!navigator.xr) {
        console.error("WebXR not available");
        return;
    }

    try {
        // Check if the device supports immersive-vr mode
        const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
        if (!isSupported) {
            console.error("immersive-vr mode not supported");
            return;
        }

        // Create a container for VR buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.position = 'absolute';
        buttonContainer.style.top = '20px';
        buttonContainer.style.left = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '10px';
        document.body.appendChild(buttonContainer);

        // Create a button to start the XR session with camera-centric projection
        const cameraCentricButton = document.createElement('button');
        cameraCentricButton.textContent = 'Enter VR (Camera Centric)';
        cameraCentricButton.style.padding = '10px';
        cameraCentricButton.style.backgroundColor = '#4285F4';
        cameraCentricButton.style.color = 'white';
        cameraCentricButton.style.border = 'none';
        cameraCentricButton.style.borderRadius = '4px';
        cameraCentricButton.style.cursor = 'pointer';
        buttonContainer.appendChild(cameraCentricButton);

        // Create a button to start the XR session with display-centric projection
        const displayCentricButton = document.createElement('button');
        displayCentricButton.textContent = 'Enter VR (Display Centric)';
        displayCentricButton.style.padding = '10px';
        displayCentricButton.style.backgroundColor = '#34A853';
        displayCentricButton.style.color = 'white';
        displayCentricButton.style.border = 'none';
        displayCentricButton.style.borderRadius = '4px';
        displayCentricButton.style.cursor = 'pointer';
        buttonContainer.appendChild(displayCentricButton);

        // Create a status indicator showing current mode
        const statusIndicator = document.createElement('div');
        statusIndicator.style.marginTop = '10px';
        statusIndicator.style.padding = '5px';
        statusIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        statusIndicator.style.color = 'white';
        statusIndicator.style.borderRadius = '4px';
        statusIndicator.style.fontSize = '14px';
        statusIndicator.textContent = 'Current: Not in VR';
        buttonContainer.appendChild(statusIndicator);

        // Session reference
        let xrSession = null;
        let xrGl = null;
        let xrWebGLLayer = null;

        // Start XR session with camera-centric mode
        cameraCentricButton.addEventListener('click', async () => {
            try {
                // Request a session with viewer reference space
                xrSession = await navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['viewer']
                });

                // Use pure WebXR setup instead of Three.js XR integration
                await setupPureWebXRSession(xrSession, CAMERA_CENTRIC_MODE);
                statusIndicator.textContent = 'Current: Camera Centric';

                // When the session ends, clean up
                xrSession.addEventListener('end', () => {
                    xrSession = null;
                    statusIndicator.textContent = 'Current: Not in VR';
                });

            } catch (error) {
                console.error("Error starting XR session:", error);
            }
        });

        // Start XR session with display-centric mode
        displayCentricButton.addEventListener('click', async () => {
            try {
                // Request a session with viewer reference space
                xrSession = await navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['viewer']
                });

                // Use pure WebXR setup instead of Three.js XR integration
                await setupPureWebXRSession(xrSession, DISPLAY_CENTRIC_MODE);
                statusIndicator.textContent = 'Current: Display Centric';

                // When the session ends, clean up
                xrSession.addEventListener('end', () => {
                    xrSession = null;
                    statusIndicator.textContent = 'Current: Not in VR';
                });

            } catch (error) {
                console.error("Error starting XR session:", error);
            }
        });

        // Create toggle buttons for changing mode during VR
        const inVRContainer = document.createElement('div');
        inVRContainer.style.position = 'absolute';
        inVRContainer.style.bottom = '20px';
        inVRContainer.style.left = '20px';
        inVRContainer.style.display = 'flex';
        inVRContainer.style.gap = '10px';
        document.body.appendChild(inVRContainer);

        const toggleCameraCentricButton = document.createElement('button');
        toggleCameraCentricButton.textContent = 'Switch to Camera Centric';
        toggleCameraCentricButton.style.padding = '8px';
        toggleCameraCentricButton.style.backgroundColor = '#4285F4';
        toggleCameraCentricButton.style.color = 'white';
        toggleCameraCentricButton.style.border = 'none';
        toggleCameraCentricButton.style.borderRadius = '4px';
        inVRContainer.appendChild(toggleCameraCentricButton);

        const toggleDisplayCentricButton = document.createElement('button');
        toggleDisplayCentricButton.textContent = 'Switch to Display Centric';
        toggleDisplayCentricButton.style.padding = '8px';
        toggleDisplayCentricButton.style.backgroundColor = '#34A853';
        toggleDisplayCentricButton.style.color = 'white';
        toggleDisplayCentricButton.style.border = 'none';
        toggleDisplayCentricButton.style.borderRadius = '4px';
        inVRContainer.appendChild(toggleDisplayCentricButton);

        // Set up the projection control buttons to change mode during VR
        toggleCameraCentricButton.addEventListener('click', () => {
            if (xrSession) {
                setRawProjectionMode(xrSession, xrGl, xrWebGLLayer, CAMERA_CENTRIC_MODE);
                statusIndicator.textContent = 'Current: Camera Centric';
            }
        });

        toggleDisplayCentricButton.addEventListener('click', () => {
            if (xrSession) {
                setRawProjectionMode(xrSession, xrGl, xrWebGLLayer, DISPLAY_CENTRIC_MODE);
                statusIndicator.textContent = 'Current: Display Centric';
            }
        });

    } catch (error) {
        console.error("Error initializing WebXR:", error);
    }
}

/**
 * Initialize Three.js scene with a rotating cube
 */
function initThreeJS() {
    // Create the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x505050);

    // Create a camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1200);
    camera.position.z = 3;

    // Create a WebGL renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Add a cube to the scene
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshNormalMaterial();
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Start animation loop for non-VR view
    animateThreeJS();
}

/**
 * Animation loop for Three.js
 */
function animateThreeJS() {
    if (!renderer.xr.isPresenting) {
        requestAnimationFrame(animateThreeJS);

        // Rotate cube
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.01;

        // Render scene
        renderer.render(scene, camera);
    }
}

/**
 * Sets up a pure WebXR session without using Three.js XR integration
 */
async function setupPureWebXRSession(session, initialProjectionMode) {
    // Debug our values
    debugParseDepthFar(initialProjectionMode);

    // Create WebGL context and configure
    const gl = renderer.getContext();

    // Create XRWebGLLayer directly
    const xrGlLayer = new XRWebGLLayer(session, gl);

    console.log(`Setting pure WebXR render state with depthFar = ${initialProjectionMode}`);

    // Set the render state directly with WebXR API
    session.updateRenderState({
        baseLayer: xrGlLayer,
        depthNear: 0.1,
        depthFar: initialProjectionMode  // Use precise floating point value
    });

    // Store these for later use with mode switching
    window.xrGl = gl;
    window.xrWebGLLayer = xrGlLayer;

    // Position the cube in front of the user
    cube.position.set(0, 0, -2);

    // Create a reference space for rendering
    const referenceSpace = await session.requestReferenceSpace('local');

    // Set up our own custom XR render loop instead of using Three.js's
    session.requestAnimationFrame((time, frame) => renderCustomXRFrame(session, frame, referenceSpace, gl, xrGlLayer));
}

/**
 * Custom XR render loop that doesn't rely on Three.js XR integration
 */
function renderCustomXRFrame(session, frame, referenceSpace, gl, glLayer) {
    // Continue the render loop
    session.requestAnimationFrame((time, frame) => renderCustomXRFrame(session, frame, referenceSpace, gl, glLayer));

    // Rotate cube
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // Get the session's view
    const pose = frame.getViewerPose(referenceSpace);
    if (!pose) return;

    // Begin rendering
    const viewport = glLayer.getViewport(pose.views[0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

    // Render scene using Three.js
    renderer.xr.enabled = false; // Disable Three.js XR rendering
    renderer.setSize(viewport.width, viewport.height, false);
    renderer.setViewport(0, 0, viewport.width, viewport.height);
    renderer.render(scene, camera);
}

/**
 * Sets the projection mode directly using WebXR API without Three.js interference
 */
function setRawProjectionMode(session, gl, glLayer, projectionValue) {
    if (!session) return;

    console.log(`Setting raw projection mode: ${projectionValue}`);
    debugParseDepthFar(projectionValue);

    // Force precise decimal value
    const preciseValue = Number(projectionValue.toFixed(1));
    console.log(`Precise value after formatting: ${preciseValue}`);

    // Update the render state directly
    session.updateRenderState({
        depthFar: preciseValue
    });
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', initWebXR); 