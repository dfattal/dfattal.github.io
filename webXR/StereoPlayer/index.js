import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;
let videoTexture = null;
let video = null;

// Non-VR resources
let anaglyphPlane = null;
let isInVRMode = false;

// Background
let showBackground = false;
let gradientBackground = null;

// Screen parameters
let screenDistance = 100; // meters (default)
let focal = 1.0; // focal length as fraction of image width (default = 36mm equiv)
let diopters = 0.01; // 1/screenDistance
let lastScreenDistance = screenDistance;
let lastFocal = focal;

// IPD tracking
let ipd = 0.063; // default 63mm
const IPD_MIN = 0.035;
const IPD_MAX = 0.085;
const IPD_DEFAULT = 0.063;

// Initial Y position
let initialY = null; // Will be set from XR camera when first available

// HUD
let hudCanvas, hudCtx, hudTexture;
let hudOverlayLeft, hudOverlayRight;
let hudVisible = false;

// Controllers
let controller0, controller1;

// Hand tracking state
let handInputState = {
    left: { lastPinchState: false },
    right: { lastPinchState: false, lastPinchX: null }
};

// UI elements
let uiContainer, videoInfo, dropZone, fileInput;
let infoDimensions, infoFps, infoStatus;

// Video frame rate tracking
let videoFps = 0;
let videoFrameCount = 0;
let videoFpsStartTime = 0;

// Screen positioning - simple world space coordinates
const screenPosition = new THREE.Vector3(0, 1.6, -100); // will update y from initialY and z based on screenDistance
const screenQuaternion = new THREE.Quaternion(); // identity (facing -Z)

init();
animate();

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(0, 1.6, 0);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;

    document.body.appendChild(renderer.domElement);

    // Create VR button with hand tracking support
    const vrButton = VRButton.createButton(renderer, {
        optionalFeatures: ['hand-tracking']
    });
    document.body.appendChild(vrButton);

    // Listen for VR session start/end
    renderer.xr.addEventListener('sessionstart', onVRSessionStart);
    renderer.xr.addEventListener('sessionend', onVRSessionEnd);

    // Get UI elements
    uiContainer = document.getElementById('ui-container');
    videoInfo = document.getElementById('video-info');
    dropZone = document.getElementById('drop-zone');
    fileInput = document.getElementById('file-input');
    infoDimensions = document.getElementById('info-dimensions');
    infoFps = document.getElementById('info-fps');
    infoStatus = document.getElementById('info-status');

    // Setup file handling
    setupFileHandling();

    // Setup video
    video = document.getElementById('video');

    // Load default video
    loadVideoSource('default_2x1.mp4');

    // Setup controllers
    setupControllers();

    // Create gradient background
    createGradientBackground();

    window.addEventListener('resize', onWindowResize);
}

function setupControllers() {
    controller0 = renderer.xr.getController(0);
    controller1 = renderer.xr.getController(1);
    scene.add(controller0);
    scene.add(controller1);

    // Controller input is handled via gamepad state in handleControllerInput()
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

function detectPinch(hand, threshold = 0.04) {
    const thumbTip = getJointPosition(hand, 'thumb-tip');
    const indexTip = getJointPosition(hand, 'index-finger-tip');

    if (!thumbTip || !indexTip) return false;

    const distance = thumbTip.distanceTo(indexTip);
    return distance < threshold;
}


function createGradientBackground() {
    // Create a sphere with a gradient shader
    const geometry = new THREE.SphereGeometry(500, 32, 32);
    const material = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vPosition;
            void main() {
                // Vertical gradient from center (black) to top/bottom (dark grey)
                float gradient = abs(vPosition.y / 500.0); // Normalize to 0-1
                vec3 color = mix(vec3(0.0), vec3(0.15), gradient); // Black to dark grey
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        side: THREE.BackSide
    });
    gradientBackground = new THREE.Mesh(geometry, material);
    gradientBackground.visible = false;
    scene.add(gradientBackground);
}

function setupFileHandling() {
    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            loadVideoSource(url);
        }
    });

    // Drag and drop
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
            const url = URL.createObjectURL(file);
            loadVideoSource(url);
        }
    });
}

function loadVideoSource(src) {
    video.src = src;
    video.load();

    // Update status
    infoStatus.textContent = 'Loading...';

    video.addEventListener('loadedmetadata', () => {
        videoTexture = new THREE.VideoTexture(video);
        videoTexture.encoding = THREE.sRGBEncoding;

        // Update info display
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const leftViewWidth = videoWidth / 2;

        infoDimensions.textContent = `${leftViewWidth} × ${videoHeight}`;
        infoStatus.textContent = 'Ready';
        videoInfo.classList.add('visible');

        // Start measuring video frame rate
        measureVideoFrameRate();

        // Create anaglyph plane for non-VR viewing
        createAnaglyphPlane();

        // Try to autoplay
        video.play().catch(err => {
            console.warn('Autoplay prevented:', err);
            infoStatus.textContent = 'Click to play';
            // Add click to play
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

    const updateVideoFps = (now, metadata) => {
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

function createAnaglyphPlane() {
    // Remove existing plane if any
    if (anaglyphPlane) {
        scene.remove(anaglyphPlane);
        anaglyphPlane.geometry.dispose();
        anaglyphPlane.material.dispose();
    }

    if (!video || !video.videoWidth) {
        console.warn('Cannot create anaglyph plane: video not ready');
        return;
    }

    // Calculate aspect ratio of individual view (half of SBS)
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const viewAspect = (videoWidth / 2) / videoHeight;

    // Calculate plane dimensions to fit in view while maintaining aspect ratio
    const viewDistance = 10;
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const viewHeight = 2 * Math.tan(vFOV / 2) * viewDistance;
    const viewWidth = viewHeight * camera.aspect;

    // Fit plane to view
    let planeHeight = viewHeight * 0.8; // Use 80% of view height
    let planeWidth = planeHeight * viewAspect;

    // Check if width exceeds view
    if (planeWidth > viewWidth * 0.9) {
        planeWidth = viewWidth * 0.9;
        planeHeight = planeWidth / viewAspect;
    }

    // Custom shader to render SBS as anaglyph (red = left, cyan = right)
    const anaglyphMaterial = new THREE.ShaderMaterial({
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
                // Sample left half (0.0 to 0.5) for red channel
                vec2 leftUv = vec2(vUv.x * 0.5, vUv.y);
                vec4 leftColor = texture2D(tDiffuse, leftUv);

                // Sample right half (0.5 to 1.0) for cyan channels
                vec2 rightUv = vec2(0.5 + vUv.x * 0.5, vUv.y);
                vec4 rightColor = texture2D(tDiffuse, rightUv);

                // Combine: red from left, green+blue from right (cyan)
                gl_FragColor = vec4(leftColor.r, rightColor.g, rightColor.b, 1.0);
            }
        `
    });

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    anaglyphPlane = new THREE.Mesh(geometry, anaglyphMaterial);
    anaglyphPlane.position.set(0, 1.6, -viewDistance);
    scene.add(anaglyphPlane);

    console.log(`Anaglyph plane created: ${planeWidth.toFixed(2)} × ${planeHeight.toFixed(2)} (aspect: ${viewAspect.toFixed(2)})`);
}

function onVRSessionStart() {
    console.log('VR session started');
    isInVRMode = true;

    // Hide UI
    uiContainer.classList.add('hidden');

    // Enable sound for VR
    if (video) {
        video.muted = false;
        console.log('VR audio enabled');
    }

    // Dispose of anaglyph resources
    if (anaglyphPlane) {
        scene.remove(anaglyphPlane);
        // Don't dispose geometry/material yet, might reuse
    }

    // Don't set background by default - user will toggle with Y button
    updateBackground();
}

function onVRSessionEnd() {
    console.log('VR session ended');
    isInVRMode = false;

    // Show UI
    uiContainer.classList.remove('hidden');

    // Mute sound for non-VR
    if (video) {
        video.muted = true;
        console.log('Non-VR audio muted');
    }

    // Hide gradient background
    updateBackground();

    // Recreate anaglyph plane
    if (videoTexture) {
        createAnaglyphPlane();
    }

    // Dispose VR planes
    if (planeLeft) {
        scene.remove(planeLeft);
        planeLeft.geometry.dispose();
        planeLeft.material.dispose();
        planeLeft = null;
    }
    if (planeRight) {
        scene.remove(planeRight);
        planeRight.geometry.dispose();
        planeRight.material.dispose();
        planeRight = null;
    }
}

function togglePlayPause() {
    if (!video) return;
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function toggleHUD() {
    hudVisible = !hudVisible;
    if (hudOverlayLeft) hudOverlayLeft.visible = hudVisible;
    if (hudOverlayRight) hudOverlayRight.visible = hudVisible;
    console.log(`HUD toggled: ${hudVisible ? 'ON' : 'OFF'}`);
}

function toggleBackground() {
    showBackground = !showBackground;
    updateBackground();
    console.log(`Background toggled: ${showBackground ? 'ON' : 'OFF'}`);
}

function updateBackground() {
    if (gradientBackground) {
        gradientBackground.visible = isInVRMode && showBackground;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Recreate anaglyph plane with new aspect ratio if not in VR
    if (!isInVRMode && anaglyphPlane && videoTexture) {
        createAnaglyphPlane();
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

            // Hide anaglyph plane
            if (anaglyphPlane) anaglyphPlane.visible = false;

            const leftCam = xrCam.cameras[0];
            const rightCam = xrCam.cameras[1];

            // Update IPD with validation
            updateIPD(leftCam, rightCam);

            // Handle both gamepad and hand input
            handleControllerInput();
            handleHandInput();

            // Update reconvergence and plane positions
            updateStereoPlanes(leftCam, rightCam);

            // Create/update HUD
            if (!planeLeft.userData.hudOverlay) {
                createHUDOverlay(planeLeft);
                createHUDOverlay(planeRight);
            }
            updateHUD();

            planeLeft.visible = true;
            planeRight.visible = true;

            // Render normally in VR
            renderer.render(scene, camera);

        } else {
            // NON-VR MODE - show anaglyph plane
            if (planeLeft) planeLeft.visible = false;
            if (planeRight) planeRight.visible = false;
            if (anaglyphPlane) anaglyphPlane.visible = true;

            // Render normally (anaglyph shader handles the stereo combination)
            renderer.render(scene, camera);
        }
    });
}

function createPlanesVR() {
    console.log('Creating VR stereo planes...');

    const planeGeom = new THREE.PlaneGeometry(1, 1);

    // Left eye shader - samples left half of SBS texture with convergence shift
    const matLeft = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: videoTexture },
            uConvergenceShiftX: { value: 0.0 },
            uConvergenceShiftY: { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        transparent: true,
        fragmentShader: `
            uniform sampler2D uTexture;
            uniform float uConvergenceShiftX;
            uniform float uConvergenceShiftY;
            varying vec2 vUv;

            void main() {
                // Sample left half (0.0 to 0.5) with convergence shift
                vec2 uv = vec2(vUv.x * 0.5 + uConvergenceShiftX, vUv.y + uConvergenceShiftY);
                gl_FragColor = uv.x < 0.5 && uv.x > 0.0 && uv.y < 1.0 && uv.y > 0.0 ? texture2D(uTexture, uv) : vec4(0.0, 0.0, 0.0, 0.0);
            }
        `
    });

    // Right eye shader - samples right half of SBS texture with convergence shift
    const matRight = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: videoTexture },
            uConvergenceShiftX: { value: 0.0 },
            uConvergenceShiftY: { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        transparent: true,
        fragmentShader: `
            uniform sampler2D uTexture;
            uniform float uConvergenceShiftX;
            uniform float uConvergenceShiftY;
            varying vec2 vUv;

            void main() {
                // Sample right half (0.5 to 1.0) with convergence shift
                vec2 uv = vec2(0.5 + vUv.x * 0.5 + uConvergenceShiftX, vUv.y + uConvergenceShiftY);
                gl_FragColor = uv.x > 0.5 && uv.x < 1.0 && uv.y < 1.0 && uv.y > 0.0 ? texture2D(uTexture, uv) : vec4(0.0, 0.0, 0.0, 0.0);
            }
        `
    });

    planeLeft = new THREE.Mesh(planeGeom, matLeft);
    planeLeft.layers.set(1); // left eye only
    planeLeft.visible = false;
    scene.add(planeLeft);

    planeRight = new THREE.Mesh(planeGeom, matRight);
    planeRight.layers.set(2); // right eye only
    planeRight.visible = false;
    scene.add(planeRight);
}

function updateIPD(leftCam, rightCam) {
    const measuredIPD = leftCam.position.distanceTo(rightCam.position);

    // Validate IPD is in reasonable range
    if (measuredIPD >= IPD_MIN && measuredIPD <= IPD_MAX) {
        ipd = measuredIPD;
    } else {
        console.warn(`IPD ${measuredIPD.toFixed(4)}m out of range, using default ${IPD_DEFAULT}m`);
        ipd = IPD_DEFAULT;
    }
}

function handleControllerInput() {
    // Get gamepad data from controllers
    const session = renderer.xr.getSession();
    if (!session) {
        console.log('No XR session');
        return;
    }
    let foundController = false;
    for (const source of session.inputSources) {
        if (source.gamepad) {
            foundController = true;
            const gamepad = source.gamepad;
            const axes = gamepad.axes;
            const buttons = gamepad.buttons;

            // Debug: log controller info once
            if (!source.userData) source.userData = {};
            if (!source.userData.logged) {
                console.log(`Controller ${source.handedness}: ${axes.length} axes, ${buttons.length} buttons`);
                source.userData.logged = true;
            }

            // Determine handedness
            const isLeft = source.handedness === 'left';
            const isRight = source.handedness === 'right';

            // Debug: log all axes if any are non-zero
            let anyInput = axes.some(v => Math.abs(v) > 0.1);
            if (anyInput && !source.userData.recentLog) {
                console.log(`${source.handedness} axes:`, axes.map(v => v.toFixed(2)).join(', '));
                source.userData.recentLog = true;
                setTimeout(() => source.userData.recentLog = false, 500);
            }

            if (axes.length >= 4) {
                const stickY = axes[3]; // Thumbstick Y-axis (-1 = up/forward, +1 = down/back)

                // Left controller stick controls distance via diopters (incremental)
                if (isLeft && Math.abs(stickY) > 0.1) {
                    // Add/subtract to diopters - forward (negative Y) = decrease diopters (farther)
                    const diopterDelta = stickY * 0.01; // adjust sensitivity here (inverted)
                    diopters += diopterDelta;
                    diopters = Math.max(0.01, Math.min(1.0, diopters));
                    screenDistance = 1.0 / diopters;
                    if (Math.abs(diopterDelta) > 0.001) {
                        console.log(`Distance: ${screenDistance.toFixed(1)}m (diopters: ${diopters.toFixed(3)})`);
                    }
                }

                // Right controller stick controls focal in log2 space (incremental)
                if (isRight && Math.abs(stickY) > 0.1) {
                    // Add/subtract to log2(focal) - forward (negative) = increase focal (zoom in)
                    let log2Focal = Math.log2(focal);
                    const focalDelta = -stickY * 0.02; // adjust sensitivity here
                    log2Focal += focalDelta;
                    log2Focal = Math.max(-1, Math.min(1, log2Focal)); // clamp log2 range
                    focal = Math.pow(2, log2Focal);
                    if (Math.abs(focalDelta) > 0.001) {
                        console.log(`Focal: ${focal.toFixed(2)} (${(focal * 36).toFixed(0)}mm, log2: ${log2Focal.toFixed(2)})`);
                    }
                }
            }

            // A button (buttons[4]) on right controller for play/pause
            if (buttons.length > 4 && buttons[4].pressed && isRight) {
                if (!source.userData.aButtonPressed) {
                    togglePlayPause();
                    console.log('Play/Pause toggled');
                    source.userData.aButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.aButtonPressed = false;
            }

            // B button (buttons[5]) on right controller for HUD toggle
            if (buttons.length > 5 && buttons[5].pressed && isRight) {
                if (!source.userData.bButtonPressed) {
                    toggleHUD();
                    console.log('HUD toggled');
                    source.userData.bButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.bButtonPressed = false;
            }

            // X button (buttons[4]) on left controller to exit VR session
            if (buttons.length > 4 && buttons[4].pressed && isLeft) {
                if (!source.userData.xButtonPressed) {
                    console.log('X button pressed - exiting VR');
                    renderer.xr.getSession().end();
                    source.userData.xButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.xButtonPressed = false;
            }

            // Y button (buttons[5]) on left controller to toggle background
            if (buttons.length > 5 && buttons[5].pressed && isLeft) {
                if (!source.userData.yButtonPressed) {
                    toggleBackground();
                    console.log('Background toggled');
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

            // === LEFT HAND: PINCH TO EXIT VR ===
            if (handedness === 'left') {
                const isPinching = detectPinch(hand);

                // Trigger on pinch start
                if (isPinching && !state.lastPinchState) {
                    console.log('Left pinch - exiting VR');
                    session.end();
                }

                state.lastPinchState = isPinching;
            }

            // === RIGHT HAND: PINCH + DRAG FOR FOCAL, QUICK PINCH FOR PLAY/PAUSE ===
            if (handedness === 'right') {
                const isPinching = detectPinch(hand);
                const indexTip = getJointPosition(hand, 'index-finger-tip');

                if (isPinching && indexTip) {
                    if (!state.lastPinchState) {
                        // Start of pinch - record initial X position
                        state.lastPinchX = indexTip.x;
                        state.pinchStartTime = Date.now();
                        console.log('Right pinch started');
                    } else if (state.lastPinchX !== null) {
                        // During pinch - adjust focal based on X (horizontal) movement
                        const deltaX = indexTip.x - state.lastPinchX;
                        if (Math.abs(deltaX) > 0.001) {
                            // Right = zoom in (increase focal), left = zoom out (decrease focal)
                            let log2Focal = Math.log2(focal);
                            const focalDelta = deltaX * 2.0; // sensitivity adjustment
                            log2Focal += focalDelta;
                            log2Focal = Math.max(-1, Math.min(1, log2Focal));
                            focal = Math.pow(2, log2Focal);
                            state.lastPinchX = indexTip.x;
                            console.log(`Focal: ${focal.toFixed(2)} (${(focal * 36).toFixed(0)}mm) (hand control)`);
                        }
                    }
                } else {
                    // Pinch released
                    if (state.lastPinchState) {
                        // Check if it was a quick pinch (< 300ms) without much movement
                        const pinchDuration = Date.now() - state.pinchStartTime;
                        if (pinchDuration < 300) {
                            togglePlayPause();
                            console.log('Play/Pause toggled (quick pinch)');
                        } else {
                            console.log('Right pinch released');
                        }
                    }
                    state.lastPinchX = null;
                }
                state.lastPinchState = isPinching;
            }
        }
    }
}

function updateStereoPlanes(leftCam, rightCam) {
    if (!planeLeft || !planeRight || !videoTexture.image) return;

    // Initialize initialY from XR camera when first available
    if (initialY === null) {
        initialY = (leftCam.position.y + rightCam.position.y) / 2;
        screenPosition.y = initialY;
        console.log('Initial Y position set to:', initialY);
    }

    // Get video dimensions
    const videoWidth = videoTexture.image.videoWidth || videoTexture.image.width;
    const videoHeight = videoTexture.image.videoHeight || videoTexture.image.height;

    if (!videoWidth || !videoHeight) return;

    // Update screen Z position when distance changes
    if (screenDistance !== lastScreenDistance) {
        screenPosition.z = -screenDistance;
        lastScreenDistance = screenDistance;
        console.log(`Screen distance changed to ${screenDistance}m`);
    }

    // Each half of SBS has this aspect ratio
    const halfAspect = videoWidth / (2 * videoHeight);

    // Calculate screen width from focal and distance
    // screenWidth = screenDistance / focal (where focal is fraction of width)
    const screenWidth = screenDistance / focal;
    const screenHeight = screenWidth / halfAspect;

    // Since each eye's image is 0.5 width in texture coords (due to SBS),
    // and reconv is relative to individual eye image width,
    // we need to scale by 0.5 when applying to texture offset
    const reconvScale = 0.5; // individual eye width in texture coordinates

    // Calculate reconvergence shift
    // reconv = focal * ipd / screenDistance
    const reconvLeftX = -focal * (leftCam.position.x - ipd/2) / screenDistance * reconvScale;
    const reconvRightX = -focal * (rightCam.position.x + ipd/2) / screenDistance * reconvScale;
    const reconvLeftY = -focal * (leftCam.position.y - initialY) / screenDistance;
    const reconvRightY = -focal * (rightCam.position.y - initialY) / screenDistance;
    

    

    // Update shader uniforms for convergence
    // Left eye: shift left (negative)
    planeLeft.material.uniforms.uConvergenceShiftX.value = reconvLeftX;
    planeLeft.material.uniforms.uConvergenceShiftY.value = reconvLeftY;

    // Right eye: shift right (positive)
    planeRight.material.uniforms.uConvergenceShiftX.value = reconvRightX;
    planeRight.material.uniforms.uConvergenceShiftY.value = reconvRightY;

    // Debug log reconvergence (only when it changes significantly)
    if (Math.abs(reconvLeftX - (planeLeft.userData.lastReconvX || 0)) > 0.001 || Math.abs(reconvLeftY - (planeLeft.userData.lastReconvY || 0)) > 0.001 || Math.abs(reconvRightX - (planeRight.userData.lastReconvX || 0)) > 0.001 || Math.abs(reconvRightY - (planeRight.userData.lastReconvY || 0)) > 0.001) {
        console.log(`Reconv: ${(reconvLeftX*100).toFixed(2)}% of eye width, texture shift: ±${((reconvLeftX/2)*reconvScale*100).toFixed(3)}% of SBS`);
        planeLeft.userData.lastReconvX = reconvLeftX;
        planeLeft.userData.lastReconvY = reconvLeftY;
        planeRight.userData.lastReconvX = reconvRightX;
        planeRight.userData.lastReconvY = reconvRightY;
    }

    // Position both planes at the same world position (they overlap)
    planeLeft.position.copy(screenPosition);
    planeLeft.quaternion.copy(screenQuaternion);
    planeLeft.scale.set(screenWidth, screenHeight, 1);

    planeRight.position.copy(screenPosition);
    planeRight.quaternion.copy(screenQuaternion);
    planeRight.scale.set(screenWidth, screenHeight, 1);

    // Enable layers for each eye
    leftCam.layers.enable(1);
    rightCam.layers.enable(2);
}

function createHUDOverlay(plane) {
    // Create shared HUD canvas/texture if not already created
    if (!hudCanvas) {
        hudCanvas = document.createElement('canvas');
        hudCanvas.width = 512;
        hudCanvas.height = 256;
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

    // Position HUD in top-left corner of plane
    // HUD will be 1/4 of screen width, half that height
    const hudScale = 0.25;
    const hudAspect = 2; // width/height ratio

    hudOverlay.position.set(-0.5 + hudScale / 2, 0.5 - hudScale / (2 * hudAspect), 0.05);
    hudOverlay.scale.set(hudScale, hudScale / hudAspect, 1);
    hudOverlay.visible = hudVisible;

    // Match parent plane's layer
    hudOverlay.layers.mask = plane.layers.mask;

    // Store references to both overlays
    if (plane.layers.mask === planeLeft.layers.mask) {
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

    // Semi-transparent background
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);

    hudCtx.fillStyle = '#0f0';
    hudCtx.font = 'bold 24px monospace';
    hudCtx.fillText('SBS 3D Player', 20, 40);

    hudCtx.font = '20px monospace';
    hudCtx.fillStyle = '#fff';

    hudCtx.fillText(`Distance: ${screenDistance.toFixed(1)}m`, 20, 80);
    hudCtx.fillText(`Focal: ${focal.toFixed(2)} (${(focal * 36).toFixed(0)}mm)`, 20, 110);
    hudCtx.fillText(`IPD: ${(ipd * 1000).toFixed(1)}mm`, 20, 140);
    hudCtx.fillText(`Reconv: ${((focal * ipd / screenDistance) * 1000).toFixed(1)}mm`, 20, 170);

    const status = video && !video.paused ? 'Playing' : 'Paused';
    hudCtx.fillText(`Status: ${status}`, 20, 200);

    hudCtx.font = '16px monospace';
    hudCtx.fillStyle = '#aaa';
    hudCtx.fillText('L-stick: distance | R-stick: focal', 20, 225);
    hudCtx.fillText('R: A=play B=HUD | L: X=exit', 20, 245);

    hudTexture.needsUpdate = true;
}
