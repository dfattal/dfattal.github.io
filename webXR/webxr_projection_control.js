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

        // Create a button to start the XR session
        const enterButton = document.createElement('button');
        enterButton.textContent = 'Enter VR';
        enterButton.style.position = 'absolute';
        enterButton.style.top = '20px';
        enterButton.style.left = '20px';
        enterButton.style.padding = '10px';
        document.body.appendChild(enterButton);

        // Create buttons to change projection mode
        const cameraCentricButton = document.createElement('button');
        cameraCentricButton.textContent = 'Camera Centric';
        cameraCentricButton.style.position = 'absolute';
        cameraCentricButton.style.top = '60px';
        cameraCentricButton.style.left = '20px';
        cameraCentricButton.style.padding = '10px';
        document.body.appendChild(cameraCentricButton);

        const displayCentricButton = document.createElement('button');
        displayCentricButton.textContent = 'Display Centric';
        displayCentricButton.style.position = 'absolute';
        displayCentricButton.style.top = '100px';
        displayCentricButton.style.left = '20px';
        displayCentricButton.style.padding = '10px';
        document.body.appendChild(displayCentricButton);

        // Session reference
        let xrSession = null;

        // Start XR session when the button is clicked
        enterButton.addEventListener('click', async () => {
            try {
                // Request a session with viewer reference space
                xrSession = await navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['viewer']
                });

                // Initialize the session with default settings
                await setupWebXRSession(xrSession);

                // Set up the projection control buttons
                cameraCentricButton.addEventListener('click', () => {
                    setProjectionMode(xrSession, CAMERA_CENTRIC_MODE);
                });

                displayCentricButton.addEventListener('click', () => {
                    setProjectionMode(xrSession, DISPLAY_CENTRIC_MODE);
                });

                // When the session ends, clean up
                xrSession.addEventListener('end', () => {
                    xrSession = null;
                });

            } catch (error) {
                console.error("Error starting XR session:", error);
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
async function setupWebXRSession(session) {
    // Enable XR in our renderer
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.setSession(session);

    // Set the render state with a depthFar value that encodes our desired projection
    session.updateRenderState({
        baseLayer: new XRWebGLLayer(session, renderer.context),
        depthNear: 0.1,
        depthFar: CAMERA_CENTRIC_MODE // Default to camera-centric projection
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
document.addEventListener('DOMContentLoaded', () => {
    // Add Three.js script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js';
    script.onload = initWebXR;
    document.head.appendChild(script);
}); 