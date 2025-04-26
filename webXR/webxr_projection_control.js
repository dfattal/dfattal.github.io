// WebXR example for controlling projection mode in SRHydra
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Constants for projection mode encoding
// Format: farClippingPlane.projectionMode
// The integer part (1000) is the actual far clipping plane in meters
// The decimal part (0 or 0.1) encodes the projection mode
const CAMERA_CENTRIC_MODE = 1000.0; // Integer value for camera-centric projection
const DISPLAY_CENTRIC_MODE = 1000.1; // .1 decimal for display-centric projection

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

        // Start XR session with camera-centric mode
        cameraCentricButton.addEventListener('click', async () => {
            try {
                // Request a session with viewer reference space
                xrSession = await navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['viewer']
                });

                // Initialize the session with camera-centric settings
                await setupWebXRSession(xrSession, CAMERA_CENTRIC_MODE);
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

                // Initialize the session with display-centric settings
                await setupWebXRSession(xrSession, DISPLAY_CENTRIC_MODE);
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
                setProjectionMode(xrSession, CAMERA_CENTRIC_MODE);
                statusIndicator.textContent = 'Current: Camera Centric';
            }
        });

        toggleDisplayCentricButton.addEventListener('click', () => {
            if (xrSession) {
                setProjectionMode(xrSession, DISPLAY_CENTRIC_MODE);
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
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
 * Sets up the basic WebXR session
 */
async function setupWebXRSession(session, initialProjectionMode) {
    // Enable XR in our renderer
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.setSession(session);

    // Set the render state with a depthFar value that encodes our desired projection
    session.updateRenderState({
        depthNear: 0.1,
        depthFar: initialProjectionMode // Use the provided projection mode
    });

    // Position the cube in front of the user
    cube.position.set(0, 0, -2);

    // Create a reference space for rendering
    const referenceSpace = await session.requestReferenceSpace('local');

    // Set up the XR render loop
    session.requestAnimationFrame((time, frame) => renderFrameXR(session, frame, referenceSpace));
}

/**
 * Sets the projection mode by encoding it in the depthFar value
 */
function setProjectionMode(session, projectionValue) {
    if (!session) return;

    console.log(`Setting projection mode with depthFar = ${projectionValue}`);

    // Update render state with our encoded depthFar value
    session.updateRenderState({
        depthFar: projectionValue
    });
}

/**
 * XR render loop
 */
function renderFrameXR(session, frame, referenceSpace) {
    // Continue the render loop
    session.requestAnimationFrame((time, frame) => renderFrameXR(session, frame, referenceSpace));

    // Rotate cube
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // Get the session's view
    const pose = frame.getViewerPose(referenceSpace);
    if (pose) {
        // Render the scene
        renderer.render(scene, camera);
    }
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', initWebXR); 