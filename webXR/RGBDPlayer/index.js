import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;
let videoTexture = null;
let video = null;

// Non-VR resources
let rgbPlane = null;
let isInVRMode = false;

// Screen parameters
let screenDistance = 100; // meters (default)
let focal = 0.78; // focal length as fraction of image width (default = 36mm equiv)
let diopters = 0.01; // 1/screenDistance
let invZmin = 0.05; // Depth effect control
let feathering = 0.05; // Edge feathering for smooth transitions
let viewportScale = 1.2; // extra scale for the viewport to avoid clipping
let transparentGradients = false; // Flag to make high gradient regions transparent

// IPD tracking
let ipd = 0.063; // default 63mm
const IPD_MIN = 0.035;
const IPD_MAX = 0.085;
const IPD_DEFAULT = 0.063;

// Initial Y position
let initialY = null; // Will be set from XR camera when first available
const INITIAL_Y_MIN_THRESHOLD = 0.1; // Minimum valid initialY in meters

// HUD
let hudCanvas, hudCtx, hudTexture;
let hudOverlayLeft, hudOverlayRight;
let hudVisible = true;

// Controllers
let controller0, controller1;

// Hand tracking state
const PINCH_DISTANCE_THRESHOLD = 0.015; // 15mm - fingers must be touching
const TAP_DURATION_MAX = 300; // milliseconds
const DOUBLE_TAP_WINDOW = 500; // milliseconds between taps for double-tap

let handInputState = {
    left: {
        isPinching: false,
        pinchStartTime: 0,
        lastTapTime: 0,
        tapCount: 0,
        dragStartPosition: null
    },
    right: {
        isPinching: false,
        pinchStartTime: 0,
        dragStartPosition: null,
        verticalDragActivated: false
    }
};

// UI elements
let uiContainer, videoInfo, dropZone, fileInput;
let infoDimensions, infoFps, infoStatus;

// Video frame rate tracking
let videoFps = 0;
let videoFrameCount = 0;
let videoFpsStartTime = 0;

// View synthesis material
let viewSynthesisMaterial;
let fragmentShaderSource = null;

// Load fragment shader
async function loadShader() {
    const response = await fetch('rayCastMonoLDI_fragment.glsl');
    fragmentShaderSource = await response.text();
}

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(0, 1.6, 0);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0); // Transparent background

    document.body.appendChild(renderer.domElement);

    const vrButton = VRButton.createButton(renderer, {
        optionalFeatures: ['hand-tracking']
    });
    document.body.appendChild(vrButton);

    renderer.xr.addEventListener('sessionstart', onVRSessionStart);
    renderer.xr.addEventListener('sessionend', onVRSessionEnd);

    uiContainer = document.getElementById('ui-container');
    videoInfo = document.getElementById('video-info');
    dropZone = document.getElementById('drop-zone');
    fileInput = document.getElementById('file-input');
    infoDimensions = document.getElementById('info-dimensions');
    infoFps = document.getElementById('info-fps');
    infoStatus = document.getElementById('info-status');

    setupFileHandling();

    video = document.getElementById('video');
    loadVideoSource('default_rgbd.mp4');

    setupControllers();

    window.addEventListener('resize', onWindowResize);
}

function setupControllers() {
    controller0 = renderer.xr.getController(0);
    controller1 = renderer.xr.getController(1);
    scene.add(controller0, controller1);
}

// ========== Hand Gesture Detection Utilities ==========

function getJointPosition(hand, jointName) {
    const jointSpace = hand.get(jointName);
    if (!jointSpace) return null;

    const frame = renderer.xr.getFrame();
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (!frame || !referenceSpace) return null;

    const pose = frame.getJointPose(jointSpace, referenceSpace);
    if (!pose) return null;

    return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
}

function getPinchDistance(hand) {
    const thumbTip = getJointPosition(hand, 'thumb-tip');
    const indexTip = getJointPosition(hand, 'index-finger-tip');

    if (!thumbTip || !indexTip) return null;

    return thumbTip.distanceTo(indexTip);
}


function setupFileHandling() {
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadVideoSource(URL.createObjectURL(file));
        }
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) {
            loadVideoSource(URL.createObjectURL(file));
        }
    });
}

async function loadVideoSource(src) {
    // Make sure shader is loaded first
    if (!fragmentShaderSource) {
        await loadShader();
    }

    video.src = src;
    video.load();
    infoStatus.textContent = 'Loading...';

    video.addEventListener('loadedmetadata', () => {
        videoTexture = new THREE.VideoTexture(video);
        videoTexture.encoding = THREE.sRGBEncoding;

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        infoDimensions.textContent = `${videoWidth / 2} × ${videoHeight}`;
        infoStatus.textContent = 'Ready';
        videoInfo.classList.add('visible');

        createViewSynthesisMaterial();
        createRGBPlane();

        // Start measuring video frame rate
        measureVideoFrameRate();

        // Try to autoplay
        video.play().catch(err => {
            console.warn('Autoplay prevented:', err);
            infoStatus.textContent = 'Click to play';
            document.addEventListener('click', () => {
                video.play();
                infoStatus.textContent = 'Playing';
            }, { once: true });
        });
    }, { once: true });
}

function measureVideoFrameRate() {
    if (!video || !('requestVideoFrameCallback' in video)) {
        console.warn('requestVideoFrameCallback not supported, cannot measure video FPS');
        infoFps.textContent = 'N/A';
        return;
    }

    videoFrameCount = 0;
    videoFpsStartTime = 0;

    const updateVideoFps = (now) => {
        if (videoFpsStartTime === 0) {
            videoFpsStartTime = now;
        }

        videoFrameCount++;
        const elapsed = now - videoFpsStartTime;

        // Update FPS every second
        if (elapsed >= 1000) {
            videoFps = Math.round((videoFrameCount * 1000) / elapsed);
            if (infoFps) {
                infoFps.textContent = `${videoFps} fps`;
            }
            videoFrameCount = 0;
            videoFpsStartTime = now;
        }

        // Continue measuring
        video.requestVideoFrameCallback(updateVideoFps);
    };

    video.requestVideoFrameCallback(updateVideoFps);
}

function createViewSynthesisMaterial() {
    viewSynthesisMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
            uRGBD: { value: videoTexture }, // Single texture containing both RGB and depth
            invZmin: { value: [invZmin, 0, 0, 0] },
            invZmax: { value: [0, 0, 0, 0] },
            uViewPosition: { value: new THREE.Vector3() },
            sk1: { value: new THREE.Vector2() },
            sl1: { value: new THREE.Vector2() },
            roll1: { value: 0 },
            f1: { value: [0, 0, 0, 0] },
            iRes: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
            uNumLayers: { value: 1 },
            uFacePosition: { value: new THREE.Vector3() },
            sk2: { value: new THREE.Vector2() },
            sl2: { value: new THREE.Vector2() },
            roll2: { value: 0 },
            f2: { value: 0 },
            oRes: { value: new THREE.Vector2() },
            feathering: { value: feathering },
            background: { value: new THREE.Vector4(0, 0, 0, 0) },
            iResOriginal: { value: new THREE.Vector2() },
            uTime: { value: 0 },
            uTransparentGradients: { value: transparentGradients },
        },
        vertexShader: `
            varying vec2 v_texcoord;
            void main() {
                v_texcoord = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: fragmentShaderSource
    });
}

function createRGBPlane() {
    if (rgbPlane) {
        scene.remove(rgbPlane);
        rgbPlane.geometry.dispose();
        rgbPlane.material.dispose();
    }

    if (!video || !video.videoWidth) {
        console.warn('Cannot create RGB plane: video not ready');
        return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const viewAspect = (videoWidth / 2) / videoHeight;

    const viewDistance = 10;
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const viewHeight = 2 * Math.tan(vFOV / 2) * viewDistance;
    const viewWidth = viewHeight * camera.aspect;

    let planeHeight = viewHeight * 0.8;
    let planeWidth = planeHeight * viewAspect;

    if (planeWidth > viewWidth * 0.9) {
        planeWidth = viewWidth * 0.9;
        planeHeight = planeWidth / viewAspect;
    }

    // Show only the RGB part (left half of video)
    const rgbMaterial = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: videoTexture }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            varying vec2 vUv;

            void main() {
                // Sample only left half (RGB part)
                vec2 rgbUv = vec2(vUv.x * 0.5, vUv.y);
                gl_FragColor = texture2D(tDiffuse, rgbUv);
            }
        `
    });

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    rgbPlane = new THREE.Mesh(geometry, rgbMaterial);
    rgbPlane.position.set(0, 1.6, -viewDistance);
    scene.add(rgbPlane);

    console.log(`RGB plane created: ${planeWidth.toFixed(2)} × ${planeHeight.toFixed(2)}`);
}

function onVRSessionStart() {
    console.log('VR session started');
    isInVRMode = true;
    uiContainer.classList.add('hidden');
    if (video) video.muted = false;
    if (rgbPlane) rgbPlane.visible = false;
}

function onVRSessionEnd() {
    console.log('VR session ended');
    isInVRMode = false;
    uiContainer.classList.remove('hidden');
    if (video) video.muted = true;

    if (videoTexture) {
        createRGBPlane();
    }

    if (planeLeft) {
        scene.remove(planeLeft);
        planeLeft.geometry.dispose();
        planeLeft = null;
    }
    if (planeRight) {
        scene.remove(planeRight);
        planeRight.geometry.dispose();
        planeRight = null;
    }
}

function togglePlayPause() {
    if (video) video.paused ? video.play() : video.pause();
}

function toggleHUD() {
    hudVisible = !hudVisible;
    if (hudOverlayLeft) hudOverlayLeft.visible = hudVisible;
    if (hudOverlayRight) hudOverlayRight.visible = hudVisible;
    console.log(`HUD toggled: ${hudVisible ? 'ON' : 'OFF'}`);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (!isInVRMode && rgbPlane && videoTexture) {
        createRGBPlane();
    }
}

function animate() {
    renderer.setAnimationLoop(() => {
        const xrCam = renderer.xr.getCamera(camera);
        const isInVR = renderer.xr.isPresenting;

        if (isInVR && videoTexture && xrCam.isArrayCamera && xrCam.cameras.length === 2) {
            // VR MODE
            if (!planeLeft || !planeRight) {
                createPlanesVR();
            }

            if (rgbPlane) rgbPlane.visible = false;

            const leftCam = xrCam.cameras[0];
            const rightCam = xrCam.cameras[1];

            handleControllerInput();
            handleHandInput();
            updateStereoPlanes();
            updateHUD();

            planeLeft.visible = true;
            planeRight.visible = true;

            // Enable layers for each eye
            leftCam.layers.enable(1);
            rightCam.layers.enable(2);
        } else {
            // NON-VR MODE
            if (planeLeft) planeLeft.visible = false;
            if (planeRight) planeRight.visible = false;
            if (rgbPlane) rgbPlane.visible = true;
        }

        renderer.render(scene, camera);
    });
}

function createPlanesVR() {
    const planeGeom = new THREE.PlaneGeometry(1, 1);

    const matLeft = viewSynthesisMaterial.clone();
    planeLeft = new THREE.Mesh(planeGeom, matLeft);
    planeLeft.layers.set(1);
    scene.add(planeLeft);

    const matRight = viewSynthesisMaterial.clone();
    planeRight = new THREE.Mesh(planeGeom, matRight);
    planeRight.layers.set(2);
    scene.add(planeRight);

    createHUDOverlay(planeLeft);
    createHUDOverlay(planeRight);
}

function updateIPD() {
    const xrCam = renderer.xr.getCamera(camera);
    if (!xrCam.isArrayCamera || xrCam.cameras.length !== 2) return;
    const leftCam = xrCam.cameras[0];
    const rightCam = xrCam.cameras[1];
    const measuredIPD = leftCam.position.distanceTo(rightCam.position);
    if (measuredIPD >= IPD_MIN && measuredIPD <= IPD_MAX) {
        ipd = measuredIPD;
    } else {
        ipd = IPD_DEFAULT;
    }
}

function handleControllerInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (source.gamepad) {
            const gamepad = source.gamepad;
            const axes = gamepad.axes;
            const buttons = gamepad.buttons;

            if (!source.userData) source.userData = {};

            // Thumbstick controls
            if (axes.length >= 4) {
                const stickY = axes[3]; // Y-axis (-1 = up/forward, +1 = down/back)

                // Left controller stick Y controls invZmin
                if (source.handedness === 'left' && Math.abs(stickY) > 0.1) {
                    const invZminDelta = -stickY * 0.001; // Up = increase, down = decrease
                    invZmin += invZminDelta;
                    invZmin = Math.max(0.01, Math.min(0.1, invZmin));
                }

                // Right controller stick Y controls focal in log2 space
                if (source.handedness === 'right' && Math.abs(stickY) > 0.1) {
                    let log2Focal = Math.log2(focal);
                    const focalDelta = -stickY * 0.02;
                    log2Focal += focalDelta;
                    log2Focal = Math.max(-1, Math.min(1, log2Focal));
                    focal = Math.pow(2, log2Focal);
                }
            }

            // Trigger (buttons[0]) controls screen distance
            if (buttons.length > 0 && buttons[0].pressed) {
                // Left trigger = increase distance (move farther)
                // Right trigger = decrease distance (move closer)
                if (source.handedness === 'left') {
                    diopters -= 0.005; // Decrease diopters = increase distance
                    diopters = Math.max(0.01, Math.min(1.0, diopters));
                    screenDistance = 1.0 / diopters;
                } else if (source.handedness === 'right') {
                    diopters += 0.005; // Increase diopters = decrease distance
                    diopters = Math.max(0.01, Math.min(1.0, diopters));
                    screenDistance = 1.0 / diopters;
                }
            }

            // Grip (buttons[1]) controls feathering
            if (buttons.length > 1 && buttons[1].pressed) {
                // Left grip = decrease feathering
                // Right grip = increase feathering
                if (source.handedness === 'left') {
                    feathering -= 0.001;
                    feathering = Math.max(0.0, Math.min(0.1, feathering));
                } else if (source.handedness === 'right') {
                    feathering += 0.001;
                    feathering = Math.max(0.0, Math.min(0.1, feathering));
                }
            }

            // A button (buttons[4]) on right controller for play/pause
            if (buttons.length > 4 && buttons[4].pressed && source.handedness === 'right') {
                if (!source.userData.aButtonPressed) {
                    togglePlayPause();
                    console.log('Play/Pause toggled');
                    source.userData.aButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.aButtonPressed = false;
            }

            // B button (buttons[5]) on right controller for HUD toggle
            if (buttons.length > 5 && buttons[5].pressed && source.handedness === 'right') {
                if (!source.userData.bButtonPressed) {
                    toggleHUD();
                    console.log('HUD toggled');
                    source.userData.bButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.bButtonPressed = false;
            }

            // X button (buttons[4]) on left controller to exit VR session
            if (buttons.length > 4 && buttons[4].pressed && source.handedness === 'left') {
                if (!source.userData.xButtonPressed) {
                    console.log('X button pressed - exiting VR');
                    renderer.xr.getSession().end();
                    source.userData.xButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.xButtonPressed = false;
            }

            // Y button (buttons[5]) on left controller to toggle transparent gradients
            if (buttons.length > 5 && buttons[5].pressed && source.handedness === 'left') {
                if (!source.userData.yButtonPressed) {
                    transparentGradients = !transparentGradients;
                    console.log('Transparent gradients:', transparentGradients);
                    source.userData.yButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.yButtonPressed = false;
            }
        }
    }
}

function handleHandInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (source.hand) {
            const hand = source.hand;
            const handedness = source.handedness; // 'left' or 'right'

            if (handedness !== 'left' && handedness !== 'right') continue;

            const state = handInputState[handedness];

            // === LEFT HAND: PINCH+DRAG FOR INVZMIN, DOUBLE TAP TO EXIT VR ===
            if (handedness === 'left') {
                const distance = getPinchDistance(hand);
                if (distance === null) continue;

                const indexTip = getJointPosition(hand, 'index-finger-tip');
                if (!indexTip) continue;

                if (distance < PINCH_DISTANCE_THRESHOLD) {
                    if (!state.isPinching) {
                        // Pinch start
                        state.isPinching = true;
                        state.pinchStartTime = performance.now();
                        state.dragStartPosition = { x: indexTip.x, y: indexTip.y, z: indexTip.z };
                        console.log('Left pinch start');
                    } else {
                        // Pinch sustain - dragging
                        const dx = indexTip.x - state.dragStartPosition.x;

                        if (Math.abs(dx) > 0.003) {
                            // Right = increase depth effect, left = decrease depth effect
                            const invZminDelta = dx * 0.1;
                            invZmin += invZminDelta;
                            invZmin = Math.max(0.01, Math.min(0.1, invZmin));
                            state.dragStartPosition.x = indexTip.x;
                            console.log(`invZmin: ${invZmin.toFixed(3)}`);
                        }
                    }
                } else {
                    if (state.isPinching) {
                        // Pinch end - check for tap
                        const pinchDuration = performance.now() - state.pinchStartTime;
                        const now = performance.now();

                        if (pinchDuration < TAP_DURATION_MAX) {
                            // It's a tap - check if it's a double tap
                            const timeSinceLastTap = now - state.lastTapTime;

                            if (timeSinceLastTap < DOUBLE_TAP_WINDOW) {
                                // Double tap detected!
                                state.tapCount++;
                                console.log(`Left double pinch-tap detected - exiting VR`);
                                session.end();
                                state.tapCount = 0; // Reset
                            } else {
                                // First tap (or tap after timeout)
                                state.tapCount = 1;
                                console.log('Left pinch tap 1/2');
                            }

                            state.lastTapTime = now;
                        } else {
                            console.log('Left pinch drag end');
                        }

                        state.isPinching = false;
                        state.dragStartPosition = null;
                    }
                }
            }

            // === RIGHT HAND: PINCH+DRAG LEFT/RIGHT FOR FOCAL, UP/DOWN FOR TRANSPARENT GRADIENTS, PINCH TAP FOR PLAY/PAUSE ===
            if (handedness === 'right') {
                const distance = getPinchDistance(hand);
                if (distance === null) continue;

                const indexTip = getJointPosition(hand, 'index-finger-tip');
                if (!indexTip) continue;

                if (distance < PINCH_DISTANCE_THRESHOLD) {
                    if (!state.isPinching) {
                        // Pinch start
                        state.isPinching = true;
                        state.pinchStartTime = performance.now();
                        state.dragStartPosition = { x: indexTip.x, y: indexTip.y, z: indexTip.z };
                        state.verticalDragActivated = false;
                        console.log('Right pinch start');
                    } else {
                        // Pinch sustain - dragging
                        const dx = indexTip.x - state.dragStartPosition.x;
                        const dy = indexTip.y - state.dragStartPosition.y;

                        // Check for vertical drag (20cm threshold) for transparent gradients
                        if (Math.abs(dy) > 0.2 && !state.verticalDragActivated) {
                            state.verticalDragActivated = true;

                            if (dy > 0) {
                                // Drag up - enable transparent gradients
                                transparentGradients = true;
                                console.log('Right pinch drag UP - transparent gradients ON');
                            } else {
                                // Drag down - disable transparent gradients
                                transparentGradients = false;
                                console.log('Right pinch drag DOWN - transparent gradients OFF');
                            }
                        }

                        // Horizontal drag for focal control (only if vertical drag not activated)
                        if (!state.verticalDragActivated && Math.abs(dx) > 0.003) {
                            // Right = zoom in (increase focal), left = zoom out (decrease focal)
                            let log2Focal = Math.log2(focal);
                            const focalDelta = dx * 2.0;
                            log2Focal += focalDelta;
                            log2Focal = Math.max(-1, Math.min(1, log2Focal));
                            focal = Math.pow(2, log2Focal);
                            state.dragStartPosition.x = indexTip.x;
                            console.log(`Focal: ${focal.toFixed(2)} (${(focal * 36).toFixed(0)}mm)`);
                        }
                    }
                } else {
                    if (state.isPinching) {
                        // Pinch end
                        const pinchDuration = performance.now() - state.pinchStartTime;

                        // Only trigger play/pause if it was a quick tap without significant drag
                        if (pinchDuration < TAP_DURATION_MAX && !state.verticalDragActivated) {
                            togglePlayPause();
                            console.log('Right pinch tap - play/pause toggled');
                        } else {
                            console.log('Right pinch drag end');
                        }

                        state.isPinching = false;
                        state.dragStartPosition = null;
                        state.verticalDragActivated = false;
                    }
                }
            }
        }
    }
}

function updateStereoPlanes() {
    if (!planeLeft || !planeRight || !videoTexture.image) return;
    updateIPD();

    const xrCam = renderer.xr.getCamera(camera);
    const leftCam = xrCam.cameras[0];
    const rightCam = xrCam.cameras[1];

    // Initialize initialY from XR camera when first available and valid
    if (initialY === null) {
        const candidateY = (leftCam.position.y + rightCam.position.y) / 2;

        // Only accept if above threshold (retry until we get valid reading)
        if (candidateY > INITIAL_Y_MIN_THRESHOLD) {
            initialY = candidateY;
            console.log('Initial Y position set to:', initialY.toFixed(3), 'm');
        } else {
            console.log('InitialY candidate', candidateY.toFixed(3), 'm too low, retrying...');
        }
    }

    const halfWidth = video.videoWidth / 2;
    const aspect = halfWidth / video.videoHeight;
    const screenWidth = viewportScale*screenDistance / focal;
    const screenHeight = screenWidth / aspect;

    const position = new THREE.Vector3(0, initialY, -screenDistance);
    planeLeft.position.copy(position);
    planeRight.position.copy(position);
    planeLeft.scale.set(screenWidth, screenHeight, 1);
    planeRight.scale.set(screenWidth, screenHeight, 1);

    // oRes should be the screen dimensions in VR space (same as plane scale)
    const oRes = new THREE.Vector2(screenWidth, screenHeight);

    // Common uniforms
    const commonUniforms = {
        'invZmin': { value: [invZmin, 0, 0, 0] },
        'f1': { value: [focal * halfWidth, 0, 0, 0] },
        'iRes': { value: [new THREE.Vector2(halfWidth, video.videoHeight), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
        'oRes': { value: oRes },
        'iResOriginal': { value: oRes.clone() }, // Same as oRes (screen dimensions)
        'feathering': { value: feathering },
        'uTransparentGradients': { value: transparentGradients }
    };

    // Left eye
    const invd_left = ipd / screenDistance;
    const facePosLeft = new THREE.Vector3(leftCam.position.x / ipd, (leftCam.position.y - initialY) / ipd, -leftCam.position.z / ipd);
    const sk2_left = new THREE.Vector2(-facePosLeft.x * invd_left / (1.0 - facePosLeft.z * invd_left), -facePosLeft.y * invd_left / (1.0 - facePosLeft.z * invd_left));
    const f2_left = screenDistance * (1.0 - facePosLeft.z * invd_left)/viewportScale;

    Object.assign(planeLeft.material.uniforms, commonUniforms, {
        'uFacePosition': { value: facePosLeft },
        'sk2': { value: sk2_left },
        'f2': { value: f2_left }
    });

    // Right eye
    const invd_right = ipd / screenDistance;
    const facePosRight = new THREE.Vector3(rightCam.position.x / ipd, (rightCam.position.y - initialY) / ipd, -rightCam.position.z / ipd);
    const sk2_right = new THREE.Vector2(-facePosRight.x * invd_right / (1.0 - facePosRight.z * invd_right), -facePosRight.y * invd_right / (1.0 - facePosRight.z * invd_right));
    const f2_right = screenDistance * (1.0 - facePosRight.z * invd_right)/viewportScale;

    Object.assign(planeRight.material.uniforms, commonUniforms, {
        'uFacePosition': { value: facePosRight },
        'sk2': { value: sk2_right },
        'f2': { value: f2_right }
    });
}

function createHUDOverlay(plane) {
    if (!hudCanvas) {
        hudCanvas = document.createElement('canvas');
        hudCanvas.width = 512;
        hudCanvas.height = 256;
        hudCtx = hudCanvas.getContext('2d');
        hudTexture = new THREE.CanvasTexture(hudCanvas);
        hudTexture.encoding = THREE.sRGBEncoding;
    }
    const hudMat = new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true });
    const hudGeom = new THREE.PlaneGeometry(1, 1);
    const hudOverlay = new THREE.Mesh(hudGeom, hudMat);
    const hudScale = 0.25;
    const hudAspect = 2;
    hudOverlay.position.set(-0.5 + hudScale / 2, 0.5 - hudScale / (2 * hudAspect), 0.05);
    hudOverlay.scale.set(hudScale, hudScale / hudAspect, 1);
    hudOverlay.visible = hudVisible;
    hudOverlay.layers.mask = plane.layers.mask;

    // Store references to both overlays
    if (plane.layers.mask === (1 << 1)) {
        hudOverlayLeft = hudOverlay;
    } else {
        hudOverlayRight = hudOverlay;
    }

    plane.add(hudOverlay);
    plane.userData.hudOverlay = hudOverlay;
}

function updateHUD() {
    if (!hudCtx || !hudTexture) return;
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    if (!hudVisible) {
        hudTexture.needsUpdate = true;
        return;
    }
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.fillStyle = '#0f0';
    hudCtx.font = 'bold 24px monospace';
    hudCtx.fillText('RGBD Player', 20, 40);
    hudCtx.font = '20px monospace';
    hudCtx.fillStyle = '#fff';
    hudCtx.fillText(`Distance: ${screenDistance.toFixed(1)}m`, 20, 80);
    hudCtx.fillText(`Focal: ${focal.toFixed(2)} (${(focal * 36).toFixed(0)}mm)`, 20, 110);
    hudCtx.fillText(`IPD: ${(ipd * 1000).toFixed(1)}mm`, 20, 140);
    hudCtx.fillText(`invZmin: ${invZmin.toFixed(3)}`, 20, 170);
    hudCtx.fillText(`Feathering: ${feathering.toFixed(3)}`, 20, 200);

    const initialYText = initialY !== null ? `${initialY.toFixed(3)}m` : 'pending...';
    hudCtx.fillText(`InitialY: ${initialYText}`, 20, 230);

    hudCtx.fillText(`Transparent Gradients: ${transparentGradients ? 'ON' : 'OFF'}`, 20, 260);
    const status = video && !video.paused ? 'Playing' : 'Paused';
    hudCtx.fillText(`Status: ${status}`, 320, 260);
    hudCtx.font = '16px monospace';
    hudCtx.fillStyle = '#aaa';
    hudCtx.fillText('L-stick: invZmin | R-stick: focal', 20, 285);
    hudCtx.fillText('Triggers: distance | Grips: feathering', 20, 305);
    hudCtx.fillText('R: A=play B=HUD | L: X=exit', 20, 325);
    hudTexture.needsUpdate = true;
}