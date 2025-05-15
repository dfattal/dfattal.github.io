// LifRender.js -- test renderer for LIF files in webXR
import { LifLoader } from '../LIF/LifLoader.js';
import { MN2MNRenderer, ST2MNRenderer } from '../VIZ/Renderers.js';

// Get the full URL
const urlParams = new URLSearchParams(window.location.search);
const glow = urlParams.get('glow') ? urlParams.get('glow') : true; // Default to true
const glowAnimTime = urlParams.get('glowAnimTime') ? urlParams.get('glowAnimTime') : 2.0; // Default to 2.0
const glowPulsePeriod = urlParams.get('glowPulsePeriod') ? urlParams.get('glowPulsePeriod') : 2.0; // Default to 2.0

let views = null;
let stereo_render_data = null;
let xrCanvasInitialized = false;
let convergencePlane = null;

// Three.js renderer
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;  // VR planes
let planeNonVR = null;                    // single-plane for NON-VR
let texL = null;                    // loaded left eye texture
let texR = null;                    // loaded right eye texture
let rL = null;                      // MN2MNRenderer for left eye
let rR = null;                      // MN2MNRenderer for right eye

// Controller tracking
let leftController = null;
let rightController = null;
let leftButtonPressed = false;
let leftXButtonPressed = false; // Track X button state
let leftXButtonJustPressed = false; // Track when X button is first pressed

// Non-VR WebGL canvas variables
let container, canvas, gl, nonVRRenderer = null;
let mouseX = 0, mouseY = 0;
let windowHalfX, windowHalfY;
let isVRActive = false;
let is3D = 1;
let focus = 0.01;
let viewportScale = 1.2;
const MAX_TEX_SIZE_VR = 1920;

let startTime;

let DISTANCE = 100;       // how far from each eye to place the main SBS planes in VR
const HUD_DISTANCE = 10;   // how far in front of camera we place the HUD plane

// Temp re-usable vectors/quats
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// Shared HUD globals (for both eyes)
let hudCanvas, hudCtx, hudTexture;
// initial position of the center eyes
let initialY, initialZ, IPD;

function disposeResources() {
    if (renderer) {
        // Stop the animation loop
        renderer.setAnimationLoop(null);
    }

    if (texL) {
        texL.dispose();
        texL = null;
    }
    if (texR) {
        texR.dispose();
        texR = null;
    }
    if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss(); // Explicitly trigger context loss (optional but recommended)
        renderer = null;
    }
    if (planeLeft) {
        planeLeft.geometry.dispose();
        planeLeft.material.dispose();
        planeLeft = null;
    }
    if (planeRight) {
        planeRight.geometry.dispose();
        planeRight.material.dispose();
        planeRight = null;
    }
    if (rL) {
        rL.gl.getExtension('WEBGL_lose_context')?.loseContext();
        rL = null;
    }
    if (rR) {
        rR.gl.getExtension('WEBGL_lose_context')?.loseContext();
        rR = null;
    }
    if (nonVRRenderer) {
        nonVRRenderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
        nonVRRenderer = null;
    }

    // Reset animation variables
    startTime = undefined;
    xrCanvasInitialized = false;
    isVRActive = false;
    initialY = undefined;
    initialZ = undefined;
    IPD = undefined;

    console.log('Resources disposed.');
}

// Expose the dispose function globally for the reset button
window.disposeResources = disposeResources;

document.addEventListener('DOMContentLoaded', async () => {
    // Get canvas and container elements
    container = document.getElementById('canvas-container');
    canvas = document.getElementById('glCanvas');

    // Set initial window dimensions
    windowHalfX = window.innerWidth / 2;
    windowHalfY = window.innerHeight / 2;

    // Initialize canvas size
    resizeCanvasToContainer();

    // Add mouse event listeners
    document.addEventListener('mousemove', onDocumentMouseMove);
    window.addEventListener('resize', onWindowResize);

    const filePicker = document.getElementById('filePicker');
    filePicker.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            try {
                // Dispose of old resources explicitly before loading new ones
                disposeResources();
                const loader = new LifLoader();
                await loader.load(file);

                // Retrieve processed views from LifLoader.
                views = loader.views;
                stereo_render_data = loader.stereo_render_data;

                console.log('Views:', views);
                console.log('Stereo Render Data:', stereo_render_data);

                // Hide the file picker after file selection
                filePicker.style.display = 'none';
                await init();
                animate();

                // We now dispatch lif-loaded in the animate function for better timing
                // No longer need to dispatch it here
            } catch (error) {
                console.error('Error loading LIF:', error);

                // Dispatch an error event that HTML can listen for
                const errorEvent = new CustomEvent('lif-load-error', {
                    detail: { message: 'Failed to load LIF file. Make sure it is a valid LIF format.' }
                });
                window.dispatchEvent(errorEvent);
            }
        }
    });
});

function resizeCanvasToContainer() {
    const displayWidth = container.clientWidth || window.innerWidth;
    const displayHeight = container.clientHeight || window.innerHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;

        // Update window half values for mouse tracking
        windowHalfX = displayWidth / 2;
        windowHalfY = displayHeight / 2;

        // The renderers will handle viewport updates internally
        // when they call drawScene in the next animation frame
    }
}

function onDocumentMouseMove(event) {
    if (isVRActive) return;

    mouseX = (event.clientX - windowHalfX) / windowHalfX; // Normalize to [-1, 1]
    mouseY = (event.clientY - windowHalfY) / windowHalfY; // Normalize and invert Y
}

/** Initialize scene, camera, renderer, etc. */
async function init() {
    // Initialize WebGL canvas for non-VR mode
    gl = canvas.getContext('webgl');
    if (!gl) {
        console.error('Unable to initialize WebGL');
        return;
    }

    // Create non-VR renderer using the canvas
    if (views.length == 1) {
        nonVRRenderer = await MN2MNRenderer.createInstance(gl, '../Shaders/rayCastMonoLDIGlow.glsl', views, false, 3840); // limit image size to 3840px
        nonVRRenderer.background = [0.1, 0.1, 0.1, 0.0]; // default to transparent background
        nonVRRenderer.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
    } else if (views.length == 2) {
        nonVRRenderer = await ST2MNRenderer.createInstance(gl, '../Shaders/rayCastStereoLDIGlow.glsl', views, false, 2560); // limit image size to 2560px
        nonVRRenderer.background = [0.1, 0.1, 0.1, 0.0]; // default to transparent background
        nonVRRenderer.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
    }

    // Three.js scene setup for VR mode
    scene = new THREE.Scene();

    // Camera used outside VR; in VR, Three.js uses an internal ArrayCamera.
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Enable WebXR
    renderer.xr.enabled = true;

    // Prevent XR framebuffer rendering outside of XR session
    renderer.autoClear = false;  // Let animation loop handle clearing

    // Create standard VR button
    const vrButton = VRButton.createButton(renderer);
    document.body.appendChild(vrButton);
    // Override background to semi-transparent black
    vrButton.style.background = 'rgba(0, 0, 0, 0.5)';

    // Add XR session start/end event listeners
    renderer.xr.addEventListener('sessionstart', () => {
        isVRActive = true;
        canvas.style.display = 'none'; // Hide non-VR canvas when in VR

        // Dispose of nonVRRenderer to free GPU resources
        if (nonVRRenderer) {
            console.log('Disposing nonVRRenderer to free GPU resources');
            // First lose the context to free GPU resources
            nonVRRenderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
            // Then set to null for garbage collection
            nonVRRenderer = null;
        }

        setupVRControllers();
    });

    renderer.xr.addEventListener('sessionend', () => {
        // Immediately stop animation loop to prevent any rendering during transition
        renderer.setAnimationLoop(null);
        isVRActive = false;
        canvas.style.display = 'block'; // Show non-VR canvas when exiting VR
        resizeCanvasToContainer(); // Make sure canvas is properly sized

        // Reload the page when exiting VR
        window.location.reload();
    });

    // ADD CONTEXT LOSS HANDLER HERE
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.error('WebGL context lost.');
        disposeResources();
    });

    document.body.appendChild(renderer.domElement);

    // create offscreen canvases
    const offscreenCanvasL = document.createElement('canvas');
    const aspectRatio = views[0].height_px / views[0].width_px;
    offscreenCanvasL.width = Math.min(1920, views[0].width_px);
    offscreenCanvasL.height = Math.round(offscreenCanvasL.width * aspectRatio);
    const offscreenCanvasR = document.createElement('canvas');
    offscreenCanvasR.width = offscreenCanvasL.width;
    offscreenCanvasR.height = offscreenCanvasL.height;

    // Get a WebGL context from the offscreen canvas.
    const glL = offscreenCanvasL.getContext('webgl');
    const glR = offscreenCanvasR.getContext('webgl');

    if (views.length == 1) {
        rL = await MN2MNRenderer.createInstance(glL, '../Shaders/rayCastMonoLDI.glsl', views, false, 3840); // limit image size to 3840px
        rR = await MN2MNRenderer.createInstance(glR, '../Shaders/rayCastMonoLDI.glsl', views, false, 3840); // 
        rL.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
        rR.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
        rL.background = [0.1, 0.1, 0.1, 0.0]; // default to transparent background
        rR.background = [0.1, 0.1, 0.1, 0.0]; // default to transparent background
    } else if (views.length == 2) {
        rL = await ST2MNRenderer.createInstance(glL, '../Shaders/rayCastStereoLDI.glsl', views, false, 1920); // limit image size to 1920px
        rR = await ST2MNRenderer.createInstance(glR, '../Shaders/rayCastStereoLDI.glsl', views, false, 1920); // 
        rL.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
        rR.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
        rL.background = [0.1, 0.1, 0.1, 0.0]; // default to transparent background
        rR.background = [0.1, 0.1, 0.1, 0.0]; // default to transparent background
    }

    // set background to white
    // rL.background = [1,1,1];
    // rR.background = [1,1,1];

    texL = new THREE.CanvasTexture(rL.gl.canvas);
    texR = new THREE.CanvasTexture(rR.gl.canvas);

    window.addEventListener('resize', onWindowResize);
}


// Create and set up VR controllers
function setupVRControllers() {
    // Create controller objects - use InputSources to check handedness
    const session = renderer.xr.getSession();

    if (!session) {
        console.warn('No XR session available for controller setup');
        return;
    }

    // Function to set up controllers once input sources are available
    function setupControllersByHandedness() {
        if (!session.inputSources || session.inputSources.length === 0) {
            // Try again in the next frame if no input sources are available yet
            return requestAnimationFrame(setupControllersByHandedness);
        }

        // Clear any existing controllers
        if (leftController) {
            scene.remove(leftController);
        }
        if (rightController) {
            scene.remove(rightController);
        }

        // Find controllers by handedness
        session.inputSources.forEach((inputSource, index) => {
            const controller = renderer.xr.getController(index);

            if (inputSource.handedness === 'left') {
                console.log('Found left controller');
                leftController = controller;
                leftController.userData.inputSource = inputSource; // Store reference to inputSource
                scene.add(leftController);
            }
            else if (inputSource.handedness === 'right') {
                console.log('Found right controller');
                rightController = controller;
                scene.add(rightController);
            }
        });
    }

    // Set up controllers
    setupControllersByHandedness();

    // Also listen for inputsourceschange event to handle controller reconnection
    session.addEventListener('inputsourceschange', setupControllersByHandedness);
}

// Function to check X button state on left controller
function checkXButtonState() {
    if (!leftController || !leftController.userData.inputSource || !leftController.userData.inputSource.gamepad) {
        return false;
    }

    const gamepad = leftController.userData.inputSource.gamepad;
    // X button is typically at index 4 on left controller
    if (gamepad.buttons.length > 4) {
        return gamepad.buttons[4].pressed;
    }

    return false;
}

// Function to reset convergence plane and tracking variables
function resetConvergencePlane(leftCam, rightCam) {
    console.log("Resetting convergence plane and tracking variables...");

    try {
        // Recalculate convergence plane based on current camera positions
        convergencePlane = locateConvergencePlane(leftCam, rightCam);
        console.log("New convergence plane:", convergencePlane);

        // Calculate camera positions in convergence plane's local coordinate system
        const localLeftCamPos = new THREE.Vector3().copy(leftCam.position).sub(convergencePlane.position);
        localLeftCamPos.applyQuaternion(convergencePlane.quaternion.clone().invert());

        const localRightCamPos = new THREE.Vector3().copy(rightCam.position).sub(convergencePlane.position);
        localRightCamPos.applyQuaternion(convergencePlane.quaternion.clone().invert());

        // Reset initial tracking variables using local coordinates
        initialY = (localLeftCamPos.y + localRightCamPos.y) / 2;
        initialZ = (localLeftCamPos.z + localRightCamPos.z) / 2;
        IPD = localLeftCamPos.distanceTo(localRightCamPos);

        console.log("Reset tracking variables - initialY:", initialY, "initialZ:", initialZ, "IPD:", IPD);

        // Update plane positions and scales
        if (planeLeft && planeRight && !isNaN(convergencePlane.width) && !isNaN(convergencePlane.height)) {
            planeLeft.position.copy(convergencePlane.position);
            planeLeft.quaternion.copy(convergencePlane.quaternion);
            planeLeft.scale.set(convergencePlane.width, convergencePlane.height, 1);

            planeRight.position.copy(convergencePlane.position);
            planeRight.quaternion.copy(convergencePlane.quaternion);
            planeRight.scale.set(convergencePlane.width, convergencePlane.height, 1);

            console.log("Updated plane positions and scales");
        } else {
            console.warn("Could not update plane positions - invalid values or planes not initialized");
        }

        return true;
    } catch (error) {
        console.error("Error during convergence plane reset:", error);
        return false;
    }
}

function onWindowResize() {
    // Update Three.js camera and renderer only if they exist
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Resize our custom non-VR canvas
    resizeCanvasToContainer();
}

// Returns the size, position and orientation of the convergence plane
function locateConvergencePlane(leftCam, rightCam) {
    console.log("locateConvergencePlane called with:",
        "leftCam pos:", leftCam.position,
        "rightCam pos:", rightCam.position);

    // Get quaternions from cameras and verify they match
    const leftQuat = leftCam.quaternion;
    const rightQuat = rightCam.quaternion;

    // Verify cameras have same orientation
    if (!leftQuat.equals(rightQuat)) {
        console.warn('Left and right camera orientations do not match');
    }

    // Calculate center position between left and right cameras
    const centerCam = leftCam.position.clone().add(rightCam.position).multiplyScalar(0.5);

    const leftFov = computeFovTanAngles(leftCam);
    const rightFov = computeFovTanAngles(rightCam);

    // console.log("FOV angles:",
    //     "leftFov:", leftFov,
    //     "rightFov:", rightFov);

    // Check if FOVs are equal and symmetric
    const isSymmetric = Math.abs(leftFov.tanUp) === Math.abs(leftFov.tanDown) &&
        Math.abs(leftFov.tanLeft) === Math.abs(leftFov.tanRight);
    const isEqual = Math.abs(leftFov.tanUp - rightFov.tanUp) < 0.0001 &&
        Math.abs(leftFov.tanDown - rightFov.tanDown) < 0.0001 &&
        Math.abs(leftFov.tanLeft - rightFov.tanLeft) < 0.0001 &&
        Math.abs(leftFov.tanRight - rightFov.tanRight) < 0.0001;
    const isMirror = Math.abs(leftFov.tanLeft) === Math.abs(rightFov.tanRight) && Math.abs(leftFov.tanRight) === Math.abs(rightFov.tanLeft) && Math.abs(leftFov.tanUp) === Math.abs(rightFov.tanUp) && Math.abs(leftFov.tanDown) === Math.abs(rightFov.tanDown);

    console.log("FOV analysis:",
        "isSymmetric:", isSymmetric,
        "isEqual:", isEqual,
        "isMirror:", isMirror);

    // Extract FOV angles for both cameras
    const u0 = leftFov.tanUp;
    const d0 = -leftFov.tanDown;
    const r0 = leftFov.tanRight;
    const l0 = -leftFov.tanLeft;

    const u1 = rightFov.tanUp;
    const d1 = -rightFov.tanDown;
    const r1 = rightFov.tanRight;
    const l1 = -rightFov.tanLeft;

    // Get absolute camera positions
    const x0 = leftCam.position.x;
    const y0 = leftCam.position.y;
    const z0 = leftCam.position.z;

    const x1 = rightCam.position.x;
    const y1 = rightCam.position.y;
    const z1 = rightCam.position.z;

    // Calculate display position denominators - check for division by zero
    const denomX = (r1 - l1 - r0 + l0);
    const denomY = (u1 - d1 - u0 + d0);
    console.log("Denominators for position calculation:",
        "denomX:", denomX,
        "denomY:", denomY);

    if (Math.abs(denomX) < 0.0001 || isMirror) {
        console.warn("RENDERING for VR");
        is3D = 0;
        console.log("viewportScale:", viewportScale);
        // Fallback to symmetric calculation
        DISTANCE = .063 / views[0].inv_z_map.min / focus; // focus 0.01
        const width = viewportScale * DISTANCE / views[0].focal_px * views[0].width_px;
        const height = viewportScale * DISTANCE / views[0].focal_px * views[0].height_px;
        // console.log("distance:", d, "width:", width, "height:", height);
        // const pos = new THREE.Vector3(0, 0, -d).applyQuaternion(leftQuat).add(centerCam);
        // const width = DISTANCE*Math.abs(leftFov.tanRight - leftFov.tanLeft);
        // const height = DISTANCE*Math.abs(leftFov.tanUp - leftFov.tanDown);
        const pos = new THREE.Vector3(0, 0, -DISTANCE).applyQuaternion(leftQuat).add(centerCam);

        // Remove roll from quaternion by extracting yaw and pitch only
        const euler = new THREE.Euler().setFromQuaternion(leftQuat, 'YXZ');
        euler.z = 0; // Remove roll
        const noRollQuat = new THREE.Quaternion().setFromEuler(euler);

        return {
            position: pos,
            quaternion: noRollQuat,
            width: width,
            height: height
        };
    }

    // Calculate display position
    const zd = (2 * (x1 - x0) + z1 * (r1 - l1) - z0 * (r0 - l0)) / denomX;
    const xd = x0 - (r0 - l0) * (zd - z0) / 2; // should equal x1 - (r1 - l1) * (zd - z1) / 2
    const yd = y0 - (u0 - d0) * (zd - z0) / 2; // should equal y1 - (u1 - d1) * (zd - z1) / 2

    console.log("Display position calculation:",
        "xd:", xd, "|", x1 - (r1 - l1) * (zd - z1) / 2, "yd:", yd, "|", y1 - (u1 - d1) * (zd - z1) / 2, "zd:", zd);

    // Calculate display size
    const W = (z0 - zd) * (l0 + r0); // Should equal (z1-zd)*(l1+r1)
    const H = (z0 - zd) * (u0 + d0); // Should equal (z1-zd)*(u1+d1)

    const finalPos = new THREE.Vector3(xd, yd, zd); // assume leftQuat is identity (true at start of session)
    console.log("RENDERING for 3D");
    console.log("Final result:",
        "position:", finalPos,
        "width:", Math.abs(W),
        "height:", Math.abs(H));

    return {
        position: finalPos,
        quaternion: leftQuat.clone(),
        width: Math.abs(W),
        height: Math.abs(H)
    };
}

// Compute FOV angles from XR camera projection matrix
function computeFovTanAngles(subcam) {
    const projMatrix = subcam.projectionMatrix;

    // Extract relevant values from projection matrix
    const m00 = projMatrix.elements[0];
    const m05 = projMatrix.elements[5];
    const m08 = projMatrix.elements[8];
    const m09 = projMatrix.elements[9];

    // Check for division by zero
    if (Math.abs(m00) < 0.0001 || Math.abs(m05) < 0.0001) {
        console.warn("Near-zero values in projection matrix, may cause NaN in FOV calculation");
    }

    // Extract relevant values from projection matrix
    const left = (1 - m08) / m00;
    const right = (1 + m08) / m00;
    const bottom = (1 - m09) / m05;
    const top = (1 + m09) / m05;

    const result = {
        tanUp: top,
        tanDown: -bottom,
        tanLeft: -left,
        tanRight: right
    };

    return result;
}

/** Our main animation/render loop (WebXR). */
async function animate() {
    // Flag to track if animation should continue
    let isAnimating = true;
    let loadEventDispatched = false;

    // Listen for reset event to stop animation
    document.addEventListener('reset-viewer', () => {
        isAnimating = false;
    });

    // Ensure the lif-loaded event is dispatched only once, at the beginning
    // This is important for smooth transitions
    if (nonVRRenderer) {
        // Add a delay to ensure the renderer is ready - longer for stereo LIFs
        const delay = views.length > 1 ? 500 : 200; // Longer delay for stereo to fully initialize

        setTimeout(() => {
            // Force at least one render to happen before we show the canvas
            if (nonVRRenderer) {
                // Force a first draw for both mono and stereo before showing
                if (views.length == 1) {
                    nonVRRenderer.drawScene(1.1); // Force a mono draw
                } else if (views.length == 2) {
                    nonVRRenderer.drawScene(1.1); // Force a stereo draw
                }
            }

            if (!loadEventDispatched) {
                loadEventDispatched = true;
                const loadedEvent = new Event('lif-loaded');
                window.dispatchEvent(loadedEvent);
            }
        }, delay);
    }

    // Animation function
    function animateFrame() {
        // Stop if no longer animating
        if (!isAnimating) return;

        // Check if renderer still exists
        if (!renderer) return;

        // Only use setAnimationLoop for WebXR mode
        if (renderer.xr.isPresenting) {
            renderer.setAnimationLoop(renderFrame);
        } else {
            renderer.setAnimationLoop(null); // Disable XR loop when not in XR
            requestAnimationFrame(animateFrame);
            renderFrame(); // Call render frame directly for non-XR mode
        }
    }

    async function renderFrame() {
        // Additional check inside loop
        if (!renderer || !isAnimating) {
            renderer?.setAnimationLoop(null);
            return;
        }

        // Get XR camera first so it's available for all subsequent code
        const xrCam = renderer.xr.getCamera(camera);

        // Check X button state if in VR mode
        if (isVRActive) {
            const newXButtonState = checkXButtonState();

            // Detect when X button is first pressed (transition from false to true)
            leftXButtonJustPressed = newXButtonState && !leftXButtonPressed;

            // Only log changes in button state to avoid console spam
            if (newXButtonState !== leftXButtonPressed) {
                leftXButtonPressed = newXButtonState;
                console.log('Left X button:', leftXButtonPressed ? 'PRESSED' : 'RELEASED');
            }

            // If X button was just pressed, reset convergence plane
            if (leftXButtonJustPressed && xrCam && xrCam.isArrayCamera && xrCam.cameras.length === 2) {
                const leftCam = xrCam.cameras[0];
                const rightCam = xrCam.cameras[1];

                const resetSuccess = resetConvergencePlane(leftCam, rightCam);
                console.log("Convergence plane reset:", resetSuccess ? "SUCCESS" : "FAILED");
            }
        }

        // Get the current time in seconds
        const currentTime = performance.now() / 1000;
        if (startTime === undefined) {
            startTime = currentTime;
        }

        const uTime = glow ? (currentTime - startTime) / glowAnimTime : 1.1;

        if (texL && texR && xrCam.isArrayCamera && xrCam.cameras.length === 2) {
            // =============== VR MODE ===============
            isVRActive = true;

            // Create left/right planes if needed
            if (!planeLeft || !planeRight) {
                createPlanesVR();
                // Initialize planes with convergence plane data immediately
                try {
                    // Make sure xrCam and its cameras array exist and are valid
                    if (xrCam && xrCam.isArrayCamera && xrCam.cameras.length >= 2) {
                        const leftCam = xrCam.cameras[0];
                        const rightCam = xrCam.cameras[1];

                        // console.log("Trying to initialize convergence plane with:",
                        //     "leftCam exists:", !!leftCam,
                        //     "rightCam exists:", !!rightCam);

                        if (leftCam && rightCam && leftCam.projectionMatrix && rightCam.projectionMatrix) {
                            convergencePlane = locateConvergencePlane(leftCam, rightCam);
                            console.log("Convergence plane initial result:", convergencePlane);

                            // Only apply if we got valid values
                            if (convergencePlane && !isNaN(convergencePlane.width) && !isNaN(convergencePlane.height) &&
                                !isNaN(convergencePlane.position.x)) {
                                planeLeft.position.copy(convergencePlane.position);
                                planeLeft.quaternion.copy(convergencePlane.quaternion);
                                planeLeft.scale.set(convergencePlane.width, convergencePlane.height, 1);
                                planeLeft.visible = true;

                                planeRight.position.copy(convergencePlane.position);
                                planeRight.quaternion.copy(convergencePlane.quaternion);
                                planeRight.scale.set(convergencePlane.width, convergencePlane.height, 1);
                                planeRight.visible = true;
                            } else {
                                console.warn("Invalid convergence plane values, falling back to default");
                                // Use simple default values
                                planeLeft.position.set(0, 0, -DISTANCE);
                                planeRight.position.set(0, 0, -DISTANCE);
                                planeLeft.scale.set(2, 2, 1);
                                planeRight.scale.set(2, 2, 1);
                                planeLeft.visible = false;  // Will be shown later in animation loop
                                planeRight.visible = false; // Will be shown later in animation loop
                            }
                        } else {
                            console.warn("XR cameras don't have valid projection matrices yet");
                        }
                    } else {
                        console.warn("XR camera array not ready yet:", xrCam);
                    }
                } catch (error) {
                    console.error("Error during initial convergence plane setup:", error);
                }
            }

            // Access the sub-cameras
            const leftCam = xrCam.cameras[0];
            const rightCam = xrCam.cameras[1];

            // Set canvas dimensions once when XR cameras are available
            if (!xrCanvasInitialized) {
                if (is3D > 0.5) { // 3D display
                    rL.gl.canvas.width = leftCam.viewport.width/2; // 3D resolution about half of viewport for 3D display
                    rL.gl.canvas.height = leftCam.viewport.height/2;
                    rR.gl.canvas.width = rightCam.viewport.width/2;
                    rR.gl.canvas.height = rightCam.viewport.height/2;
                    viewportScale = 1;
                } else { // VR
                    // Calculate scaled dimensions while preserving aspect ratio and max dimension of 2560
                    const aspectRatio = views[0].height_px / views[0].width_px;
                    let width = views[0].width_px * viewportScale;
                    let height = views[0].height_px * viewportScale;
                    if (width > MAX_TEX_SIZE_VR) {
                        width = MAX_TEX_SIZE_VR;
                        height = width * aspectRatio;
                    } else if (height > MAX_TEX_SIZE_VR) {
                        height = MAX_TEX_SIZE_VR;
                        width = height / aspectRatio;
                    }
                    rL.gl.canvas.width = width;
                    rL.gl.canvas.height = height;
                    rR.gl.canvas.width = width;
                    rR.gl.canvas.height = height;
                    rL.invd = focus * views[0].inv_z_map.min;
                    rR.invd = focus * views[0].inv_z_map.min;
                }
                console.log("xrCanvasInitialized, width:", rL.gl.canvas.width, "height:", rL.gl.canvas.height);
                xrCanvasInitialized = true;

                // Each eye sees only its plane
                leftCam.layers.enable(1);
                rightCam.layers.enable(2);
            }

            // Create HUD overlay for each VR plane if not already created
            if (!planeLeft.userData.hudOverlay) {
                createHUDOverlayForVR(planeLeft, leftCam);
            }
            if (!planeRight.userData.hudOverlay) {
                createHUDOverlayForVR(planeRight, rightCam);
            }

            // Update HUD text
            updateHUD(leftCam, rightCam);

            // Calculate camera positions in convergence plane's local coordinate system
            const localLeftCamPos = new THREE.Vector3().copy(leftCam.position).sub(convergencePlane.position);
            localLeftCamPos.applyQuaternion(convergencePlane.quaternion.clone().invert());

            const localRightCamPos = new THREE.Vector3().copy(rightCam.position).sub(convergencePlane.position);
            localRightCamPos.applyQuaternion(convergencePlane.quaternion.clone().invert());

            // Capture the initial head positions once (in local coordinates)
            if (initialY === undefined) {
                if (window.WebXROpenXRBridge) {
                    console.log("WebXR Bride Extension found !");
                    window.WebXROpenXRBridge.setProjectionMethod(1); // display centric projection
                    window.WebXROpenXRBridge.resetSettings(1.0); // reset settings to default for display centric
                    const PMafterReset = (await window.WebXROpenXRBridge.getProjectionMethod()) === 1 ? 'Display Centric' : 'Camera Centric';
                    console.log("Projection Method after reset:", PMafterReset);
                }
                initialY = (localLeftCamPos.y + localRightCamPos.y) / 2;
                initialZ = (localLeftCamPos.z + localRightCamPos.z) / 2;
                IPD = localLeftCamPos.distanceTo(localRightCamPos); // 0.063
                console.log("initialY:", initialY, "initialZ:", initialZ, "IPD:", IPD);
                console.log("convergencePlane position:", convergencePlane.position);
                
            }
            // Render the scene using local coordinates
            rL.renderCam.pos.x = localLeftCamPos.x / IPD;
            rL.renderCam.pos.y = (initialY - localLeftCamPos.y) / IPD;
            rL.renderCam.pos.z = (initialZ - localLeftCamPos.z) / IPD;
            rL.renderCam.sk.x = - rL.renderCam.pos.x * rL.invd / (1 - rL.renderCam.pos.z * rL.invd);
            rL.renderCam.sk.y = - rL.renderCam.pos.y * rL.invd / (1 - rL.renderCam.pos.z * rL.invd);
            rL.renderCam.f = rL.views[0].f * rL.viewportScale() * Math.max(1 - rL.renderCam.pos.z * rL.invd, 0) / viewportScale;
            rL.drawScene(uTime % glowPulsePeriod);
            texL.needsUpdate = true;

            rR.renderCam.pos.x = localRightCamPos.x / IPD;
            rR.renderCam.pos.y = (initialY - localRightCamPos.y) / IPD;
            rR.renderCam.pos.z = (initialZ - localRightCamPos.z) / IPD;
            rR.renderCam.sk.x = - rR.renderCam.pos.x * rR.invd / (1 - rR.renderCam.pos.z * rR.invd);
            rR.renderCam.sk.y = - rR.renderCam.pos.y * rR.invd / (1 - rR.renderCam.pos.z * rR.invd);
            rR.renderCam.f = rR.views[0].f * rR.viewportScale() * Math.max(1 - rR.renderCam.pos.z * rR.invd, 0) / viewportScale;
            rR.drawScene(uTime % glowPulsePeriod);
            texR.needsUpdate = true;

            // Hide non-VR canvas
            canvas.style.display = 'none';

        } else {
            // ============ NOT IN VR ============
            isVRActive = false;

            // Hide VR planes if they exist
            if (planeLeft) planeLeft.visible = false;
            if (planeRight) planeRight.visible = false;
            xrCanvasInitialized = false; // Reset initialization if exiting VR

            // Show non-VR canvas
            canvas.style.display = 'block';

            // Render to non-VR canvas using mouse position
            if (nonVRRenderer) {
                // Use mouse position to control camera pos
                // Scale mouse influence (0.5 gives a good range of motion)
                const scale = 0.5;
                nonVRRenderer.renderCam.pos.x = -0.5 + mouseX * scale;
                nonVRRenderer.renderCam.pos.y = mouseY * scale;
                nonVRRenderer.renderCam.pos.z = 0; // No Z movement with mouse

                // Apply the same skew corrections as in VR mode
                nonVRRenderer.renderCam.sk.x = -nonVRRenderer.renderCam.pos.x * nonVRRenderer.invd /
                    (1 - nonVRRenderer.renderCam.pos.z * nonVRRenderer.invd);
                nonVRRenderer.renderCam.sk.y = -nonVRRenderer.renderCam.pos.y * nonVRRenderer.invd /
                    (1 - nonVRRenderer.renderCam.pos.z * nonVRRenderer.invd);

                // Set focal length - no need to adjust for z since it's 0
                nonVRRenderer.renderCam.f = nonVRRenderer.views[0].f * nonVRRenderer.viewportScale();

                // Draw the scene
                nonVRRenderer.drawScene(uTime % glowPulsePeriod);
            }
        }

        if (renderer) {
            // Only render if we're in a valid rendering state
            // (either properly in XR mode or definitely not in XR mode)
            if (renderer.xr.isPresenting || (!renderer.xr.isPresenting && !isVRActive)) {
                // In non-VR mode, manually clear the renderer before rendering
                if (!renderer.xr.isPresenting) {
                    renderer.clear();
                }
                renderer.render(scene, camera);
            }
        }
    }

    // Start the animation
    animateFrame();
}

/* -------------------------------------------------------------------- */
/*                  VR Planes (Left + Right Eye)                        */
/* -------------------------------------------------------------------- */

function createPlanesVR() {
    console.log('Creating VR planes (left + right)...');

    const matLeft = new THREE.ShaderMaterial({
        // Define uniforms: pass in the dynamic texture.
        uniforms: {
            uTexture: { value: texL },
            uOpacity: { value: 0.0 } // Start with transparent
        },
        // Vertex shader: passes through positions and UVs.
        vertexShader: /* glsl */`
              varying vec2 vUv;
              void main() {
                vUv = uv;  // Pass the UV coordinates to the fragment shader
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
        // Fragment shader: samples the texture.
        fragmentShader: /* glsl */`
              uniform sampler2D uTexture; // Dynamic texture from MN2MNRenderer
              uniform float uOpacity;     // Opacity control for fade-in
              varying vec2 vUv;
              void main() {
                vec4 texColor = texture2D(uTexture, vUv);
                gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity); // Apply opacity
              }
            `,
        transparent: true // Enable transparency
    });
    const matRight = new THREE.ShaderMaterial({
        // Define uniforms: pass in the dynamic texture.
        uniforms: {
            uTexture: { value: texR },
            uOpacity: { value: 0.0 } // Start with transparent
        },
        // Vertex shader: passes through positions and UVs.
        vertexShader: /* glsl */`
          varying vec2 vUv;
          void main() {
            vUv = uv;  // Pass the UV coordinates to the fragment shader
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        // Fragment shader: samples the texture.
        fragmentShader: /* glsl */`
          uniform sampler2D uTexture; // Dynamic texture from MN2MNRenderer
          uniform float uOpacity;     // Opacity control for fade-in
          varying vec2 vUv;
          void main() {
            vec4 texColor = texture2D(uTexture, vUv);
            gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity); // Apply opacity
          }
        `,
        transparent: true // Enable transparency
    });

    // 1x1 geometry, scaled each frame
    const planeGeom = new THREE.PlaneGeometry(1, 1);

    planeLeft = new THREE.Mesh(planeGeom, matLeft);
    planeLeft.layers.set(1); // left eye only
    planeLeft.visible = false;
    scene.add(planeLeft);

    planeRight = new THREE.Mesh(planeGeom, matRight);
    planeRight.layers.set(2); // right eye only
    planeRight.visible = false;
    scene.add(planeRight);

    // Start fade-in animation
    setTimeout(() => {
        // Animate opacity from 0 to 1 over 1 second
        const startTime = performance.now();
        const duration = 1000; // 1 second in ms

        function fadeIn() {
            const currentTime = performance.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1.0);

            // Update opacity uniform
            matLeft.uniforms.uOpacity.value = progress;
            matRight.uniforms.uOpacity.value = progress;

            if (progress < 1.0) {
                requestAnimationFrame(fadeIn);
            }
        }

        fadeIn();
    }, 200); // Small delay before starting fade
}

/**
 * fitAndPositionPlane(plane, subCam):
 * 1) Copy sub-cam pos/orient
 * 2) Parse sub-cam FOV
 * 3) Scale so it won't crop at DISTANCE
 * 4) Move plane DISTANCE forward
 */
function fitAndPositionPlane(plane, subCam) {
    subCam.getWorldPosition(tmpPos);
    subCam.getWorldQuaternion(tmpQuat);

    plane.position.copy(tmpPos);
    plane.quaternion.copy(tmpQuat);

    // Get the vertical field-of-view (vFOV) and aspect ratio directly from the sub-camera.
    const { fov: vFOV, aspect } = parseSubCamFov(subCam);

    // Compute the horizontal FOV from the vertical FOV and the aspect ratio.
    // The formula: hFOV = 2 * atan(aspect * tan(vFOV/2))
    const hFOV = 2 * Math.atan(aspect * Math.tan(vFOV / 2));

    // Calculate the plane dimensions so that it exactly fills the FOV at a given distance.
    // The plane height is given by: 2 * DISTANCE * tan(vFOV/2)
    // Similarly, the plane width is: 2 * DISTANCE * tan(hFOV/2)
    const planeHeight = 2 * DISTANCE * Math.tan(vFOV / 2);
    const planeWidth = 2 * DISTANCE * Math.tan(hFOV / 2);

    // Set the plane's scale so it fills the view.
    // This makes the plane exactly as wide and tall as the camera's FOV at the distance DISTANCE.
    plane.scale.set(planeWidth, planeHeight, 1);
    plane.translateZ(-DISTANCE);
}

function parseSubCamFov(subCam) {
    const m = subCam.projectionMatrix.elements;
    // For symmetric perspective: m[5] = 1 / tan(vFOV/2)
    const vFov = 2 * Math.atan(1 / m[5]);
    const aspect = m[5] / m[0];
    return { fov: vFov, aspect };
}

function fitPlaneInFov(planeAspect, vFOV, camAspect, dist) {
    // Fit vertically
    let planeHeight = 2 * dist * Math.tan(vFOV / 2);
    let planeWidth = planeHeight * planeAspect;

    // Check horizontal
    const hFOV = 2 * Math.atan(camAspect * Math.tan(vFOV / 2));
    const horizontalMax = 2 * dist * Math.tan(hFOV / 2);

    if (planeWidth > horizontalMax) {
        const scale = horizontalMax / planeWidth;
        planeWidth *= scale;
        planeHeight *= scale;
    }
    return { planeWidth, planeHeight };
}

/* -------------------------------------------------------------------- */
/*                               HUD                                    */
/* -------------------------------------------------------------------- */

/**
 * createHUDOverlayForVR(plane, subCam):
 *   1) Compute the view dimensions at DISTANCE using the subCam FOV.
 *   2) Create a HUD overlay (using a shared canvas texture) sized to 1/5 of the view width (with height = half of that).
 *   3) Position the overlay in the top-left corner of the VR plane.
 */
function createHUDOverlayForVR(plane, subCam) {
    // Get the convergence plane dimensions from the parent plane
    const planeWidth = plane.scale.x;
    const planeHeight = plane.scale.y;

    // Calculate HUD size as 1/5 of the view width
    const hudW = planeWidth / 5;
    const hudH = hudW / 2;

    // Create shared HUD canvas/texture if not already created
    if (!hudCanvas) {
        hudCanvas = document.createElement('canvas');
        hudCanvas.width = 256;
        hudCanvas.height = 128;
        hudCtx = hudCanvas.getContext('2d');
        hudTexture = new THREE.CanvasTexture(hudCanvas);
        hudTexture.encoding = THREE.sRGBEncoding;
    }

    const hudMat = new THREE.MeshBasicMaterial({
        map: hudTexture,
        transparent: true
    });
    const hudGeom = new THREE.PlaneGeometry(1, 1);
    const hudOverlay = new THREE.Mesh(hudGeom, hudMat);

    // In the VR plane's local coordinates (PlaneGeometry(1,1) spans -0.5 to 0.5),
    // position the overlay so its center is at the top-left corner.
    const localX = -0.5 + (hudW / (2 * planeWidth));
    const localY = 0.5 - (hudH / (2 * planeHeight));
    hudOverlay.position.set(localX, localY, 0.01); // slight offset to avoid z-fighting
    hudOverlay.scale.set(hudW / planeWidth, hudH / planeHeight, 1);

    // Copy the parent plane's layer so the HUD overlay appears only for that eye.
    hudOverlay.layers.mask = plane.layers.mask;

    plane.add(hudOverlay);
    plane.userData.hudOverlay = hudOverlay;
}

/**
 * updateHUD(leftCam, rightCam):
 *   Draw each eye's position onto the shared HUD canvas.
 *   Both VR HUD overlays share this texture.
 */
function updateHUD(leftCam, rightCam) {
    if (!hudCtx || !hudTexture) return;

    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);

    // Change background color based on X button state
    const bgColor = leftXButtonPressed ? 'rgba(255,0,0,0.7)' : 'rgba(0,0,0,0.5)';
    hudCtx.fillStyle = bgColor;
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);

    hudCtx.fillStyle = '#fff';
    hudCtx.font = '20px sans-serif';
    hudCtx.fillText('Eye Pos', 10, 26);

    const leftPos = leftCam.position;
    const rightPos = rightCam.position;

    const lx = leftPos.x.toFixed(2), ly = leftPos.y.toFixed(2), lz = leftPos.z.toFixed(2);
    const rx = rightPos.x.toFixed(2), ry = rightPos.y.toFixed(2), rz = rightPos.z.toFixed(2);

    hudCtx.fillText(`Left:  (${lx}, ${ly}, ${lz})`, 10, 60);
    hudCtx.fillText(`Right: (${rx}, ${ry}, ${rz})`, 10, 90);

    hudTexture.needsUpdate = true;
}