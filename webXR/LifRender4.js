// LifRender.js -- test renderer for LIF files in webXR
import { LifLoader } from '../LIF/LifLoader.js';
import { MN2MNRenderer, ST2MNRenderer } from '../VIZ/Renderers.js';

// Get the full URL
const urlParams = new URLSearchParams(window.location.search);
const glow = urlParams.get('glow') ? urlParams.get('glow') : false; // Default to false
const glowAnimTime = urlParams.get('glowAnimTime') ? urlParams.get('glowAnimTime') : 2.0; // Default to 2.0
const glowPulsePeriod = urlParams.get('glowPulsePeriod') ? urlParams.get('glowPulsePeriod') : 2.0; // Default to 2.0


let views = null;
let stereo_render_data = null;
let xrCanvasInitialized = false;

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

// Non-VR WebGL canvas variables
let container, canvas, gl, nonVRRenderer = null;
let mouseX = 0, mouseY = 0;
let windowHalfX, windowHalfY;
let isVRActive = false;

let startTime;

const DISTANCE = 20;       // how far from each eye to place the main SBS planes in VR
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
    mouseY = (event.clientY - windowHalfY) / windowHalfY * -1; // Normalize and invert Y
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
        nonVRRenderer = await MN2MNRenderer.createInstance(gl, '../Shaders/rayCastMonoLDI.glsl', views, false);
        nonVRRenderer.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
    } else if (views.length == 2) {
        nonVRRenderer = await ST2MNRenderer.createInstance(gl, '../Shaders/rayCastStereoLDI.glsl', views, false);
        nonVRRenderer.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
    }

    // Three.js scene setup for VR mode
    scene = new THREE.Scene();

    // Camera used outside VR; in VR, Three.js uses an internal ArrayCamera.
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // Add XR session start/end event listeners
    renderer.xr.addEventListener('sessionstart', () => {
        isVRActive = true;
        canvas.style.display = 'none'; // Hide non-VR canvas when in VR
    });

    renderer.xr.addEventListener('sessionend', () => {
        isVRActive = false;
        canvas.style.display = 'block'; // Show non-VR canvas when exiting VR
        resizeCanvasToContainer(); // Make sure canvas is properly sized
    });

    // ADD CONTEXT LOSS HANDLER HERE
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.error('WebGL context lost.');
        disposeResources();
    });

    document.body.appendChild(renderer.domElement);
    const vrButton = VRButton.createButton(renderer)
    document.body.appendChild(vrButton);
    // Override background to semi-transparent black
    vrButton.style.background = 'rgba(0, 0, 0, 0.5)';

    // create offscreen canvases
    const offscreenCanvasL = document.createElement('canvas');
    offscreenCanvasL.width = views[0].width_px;
    offscreenCanvasL.height = views[0].height_px;
    const offscreenCanvasR = document.createElement('canvas');
    offscreenCanvasR.width = views[0].width_px;
    offscreenCanvasR.height = views[0].height_px;

    // Get a WebGL context from the offscreen canvas.
    const glL = offscreenCanvasL.getContext('webgl');
    const glR = offscreenCanvasR.getContext('webgl');

    if (views.length == 1) {
        rL = await MN2MNRenderer.createInstance(glL, '../Shaders/rayCastMonoLDI.glsl', views, false);
        rR = await MN2MNRenderer.createInstance(glR, '../Shaders/rayCastMonoLDI.glsl', views, false);
        rL.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
        rR.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
    } else if (views.length == 2) {
        rL = await ST2MNRenderer.createInstance(glL, '../Shaders/rayCastStereoLDI.glsl', views, false);
        rR = await ST2MNRenderer.createInstance(glR, '../Shaders/rayCastStereoLDI.glsl', views, false);
        rL.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
        rR.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
    }

    // set background to white
    // rL.background = [1,1,1];
    // rR.background = [1,1,1];

    texL = new THREE.CanvasTexture(rL.gl.canvas);
    texR = new THREE.CanvasTexture(rR.gl.canvas);

    window.addEventListener('resize', onWindowResize);
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

/** Our main animation/render loop (WebXR). */
function animate() {
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

        renderer.setAnimationLoop(() => {
            // Additional check inside loop
            if (!renderer || !isAnimating) {
                renderer?.setAnimationLoop(null);
                return;
            }

            const xrCam = renderer.xr.getCamera(camera);

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
                }

                // Access the sub-cameras
                const leftCam = xrCam.cameras[0];
                const rightCam = xrCam.cameras[1];

                // Set canvas dimensions once when XR cameras are available
                if (!xrCanvasInitialized) {
                    rL.gl.canvas.width = leftCam.viewport.width;
                    rL.gl.canvas.height = leftCam.viewport.height;
                    rR.gl.canvas.width = rightCam.viewport.width;
                    rR.gl.canvas.height = rightCam.viewport.height;

                    xrCanvasInitialized = true;
                }

                // Create HUD overlay for each VR plane if not already created
                if (!planeLeft.userData.hudOverlay) {
                    createHUDOverlayForVR(planeLeft, leftCam);
                }
                if (!planeRight.userData.hudOverlay) {
                    createHUDOverlayForVR(planeRight, rightCam);
                }

                // Position the VR planes
                fitAndPositionPlane(planeLeft, leftCam);
                fitAndPositionPlane(planeRight, rightCam);

                // Each eye sees only its plane
                leftCam.layers.enable(1);
                rightCam.layers.enable(2);

                // Update HUD text
                updateHUD(leftCam, rightCam);

                // Capture the initial head positions once
                if (initialY === undefined) {
                    initialY = (leftCam.position.y + rightCam.position.y) / 2;
                    initialZ = (leftCam.position.z + rightCam.position.z) / 2;
                    IPD = leftCam.position.distanceTo(rightCam.position); // 0.063
                }

                // Render the scene
                //const IPD = leftCam.position.distanceTo(rightCam.position); 
                rL.renderCam.pos.x = leftCam.position.x / IPD;
                rL.renderCam.pos.y = (initialY - leftCam.position.y) / IPD;
                rL.renderCam.pos.z = (initialZ - leftCam.position.z) / IPD;
                rL.renderCam.sk.x = - rL.renderCam.pos.x * rL.invd / (1 - rL.renderCam.pos.z * rL.invd);
                rL.renderCam.sk.y = - rL.renderCam.pos.y * rL.invd / (1 - rL.renderCam.pos.z * rL.invd);
                rL.renderCam.f = rL.views[0].f * rL.viewportScale() * Math.max(1 - rL.renderCam.pos.z * rL.invd, 0);
                rL.drawScene(uTime % glowPulsePeriod);
                texL.needsUpdate = true;

                rR.renderCam.pos.x = rightCam.position.x / IPD;
                rR.renderCam.pos.y = (initialY - rightCam.position.y) / IPD;
                rR.renderCam.pos.z = (initialZ - rightCam.position.z) / IPD;
                rR.renderCam.sk.x = - rR.renderCam.pos.x * rR.invd / (1 - rR.renderCam.pos.z * rR.invd);
                rR.renderCam.sk.y = - rR.renderCam.pos.y * rR.invd / (1 - rR.renderCam.pos.z * rR.invd);
                rR.renderCam.f = rR.views[0].f * rR.viewportScale() * Math.max(1 - rR.renderCam.pos.z * rR.invd, 0);
                rR.drawScene(uTime % glowPulsePeriod);
                texR.needsUpdate = true;

                // Show the VR planes
                planeLeft.visible = true;
                planeRight.visible = true;

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
                    nonVRRenderer.renderCam.pos.x = mouseX * scale;
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
                renderer.render(scene, camera);
            }

            // Request next frame (for non-XR mode)
            if (!isVRActive && isAnimating) {
                requestAnimationFrame(animateFrame);
            }
        });
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
    const { fov: vFOV, aspect } = parseSubCamFov(subCam);
    const hFOV = 2 * Math.atan(aspect * Math.tan(vFOV / 2));
    const viewWidth = 2 * DISTANCE * Math.tan(hFOV / 2);
    const viewHeight = 2 * DISTANCE * Math.tan(vFOV / 2);
    const hudW = viewWidth / 5;
    const hudH = hudW / 2;

    // Instead of using sbsTexture, use the computed plane dimensions from the VR setup:
    const planeHeight = 2 * DISTANCE * Math.tan(vFOV / 2);
    const planeWidth = 2 * DISTANCE * Math.tan(hFOV / 2);

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

    // Semi-transparent background
    hudCtx.fillStyle = 'rgba(0,0,0,0.5)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);

    hudCtx.fillStyle = '#fff';
    hudCtx.font = '20px sans-serif';
    hudCtx.fillText('Eye Pos', 10, 26);

    // const leftPos = new THREE.Vector3();
    // const rightPos = new THREE.Vector3();
    // leftCam.getWorldPosition(leftPos);
    // rightCam.getWorldPosition(rightPos);
    const leftPos = leftCam.position;
    const rightPos = rightCam.position;

    const lx = leftPos.x.toFixed(2), ly = leftPos.y.toFixed(2), lz = leftPos.z.toFixed(2);
    const rx = rightPos.x.toFixed(2), ry = rightPos.y.toFixed(2), rz = rightPos.z.toFixed(2);

    hudCtx.fillText(`Left:  (${lx}, ${ly}, ${lz})`, 10, 60);
    hudCtx.fillText(`Right: (${rx}, ${ry}, ${rz})`, 10, 90);

    hudTexture.needsUpdate = true;
}