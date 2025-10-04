import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;
let videoTexture = null;
let video = null;

// Non-VR resources
let anaglyphPlane = null;
let isInVRMode = false;

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

// HUD
let hudCanvas, hudCtx, hudTexture;
let hudVisible = true;

// Controllers
let controller0, controller1;

// UI elements
let uiContainer, videoInfo, dropZone, fileInput;
let infoDimensions, infoFps, infoStatus;

// Frame rate tracking
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

// Screen positioning - simple world space coordinates
const screenPosition = new THREE.Vector3(0, 1.6, -100); // will update z based on screenDistance
const screenQuaternion = new THREE.Quaternion(); // identity (facing -Z)

// Temp vectors
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

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

    // Create VR button
    const vrButton = VRButton.createButton(renderer);
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
    loadVideoSource('indiana_relative_g04_b3_tc07_inf_2x1.mp4');

    // Setup controllers
    setupControllers();

    window.addEventListener('resize', onWindowResize);
}

function setupControllers() {
    controller0 = renderer.xr.getController(0);
    controller1 = renderer.xr.getController(1);
    scene.add(controller0);
    scene.add(controller1);

    // Controller input is handled via gamepad state in handleControllerInput()
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

    // Recreate anaglyph plane
    if (videoTexture) {
        createAnaglyphPlane();
    }

    // Dispose VR planes
    if (planeLeft) {
        scene.remove(planeLeft);
        planeLeft.geometry.dispose();
        planeLeft.material.map.dispose();
        planeLeft.material.dispose();
        planeLeft = null;
    }
    if (planeRight) {
        scene.remove(planeRight);
        planeRight.geometry.dispose();
        planeRight.material.map.dispose();
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
    console.log(`HUD toggled: ${hudVisible ? 'ON' : 'OFF'}`);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(() => {
        const now = performance.now();
        const xrCam = renderer.xr.getCamera(camera);
        const isInVR = renderer.xr.isPresenting;

        // Track FPS
        frameCount++;
        if (now - lastFpsUpdate >= 1000) {
            currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
            frameCount = 0;
            lastFpsUpdate = now;
            if (infoFps) {
                infoFps.textContent = `${currentFps} fps`;
            }
        }

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

            // Handle controller input
            handleControllerInput();

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

    // Clone textures for left and right
    const texLeft = videoTexture.clone();
    texLeft.encoding = THREE.sRGBEncoding;
    texLeft.repeat.set(0.5, 1);

    const texRight = videoTexture.clone();
    texRight.encoding = THREE.sRGBEncoding;
    texRight.repeat.set(0.5, 1);

    const matLeft = new THREE.MeshBasicMaterial({ map: texLeft });
    const matRight = new THREE.MeshBasicMaterial({ map: texRight });

    const planeGeom = new THREE.PlaneGeometry(1, 1);

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

            // Handle trigger for play/pause (buttons[0])
            if (buttons.length > 0 && buttons[0].pressed) {
                // Debounce button press
                if (!source.userData) source.userData = {};
                if (!source.userData.triggerPressed) {
                    togglePlayPause();
                    console.log('Play/Pause toggled');
                    source.userData.triggerPressed = true;
                }
            } else {
                if (source.userData) source.userData.triggerPressed = false;
            }

            // Handle squeeze/grip for HUD toggle (typically buttons[1])
            if (buttons.length > 1 && buttons[1].pressed) {
                if (!source.userData) source.userData = {};
                if (!source.userData.squeezePressed) {
                    toggleHUD();
                    source.userData.squeezePressed = true;
                }
            } else {
                if (source.userData) source.userData.squeezePressed = false;
            }

            // Handle X button (buttons[4]) to exit VR session
            if (buttons.length > 4 && buttons[4].pressed) {
                if (!source.userData) source.userData = {};
                if (!source.userData.xButtonPressed) {
                    console.log('X button pressed - exiting VR');
                    renderer.xr.getSession().end();
                    source.userData.xButtonPressed = true;
                }
            } else {
                if (source.userData) source.userData.xButtonPressed = false;
            }
        }
    }
}

function updateStereoPlanes(leftCam, rightCam) {
    if (!planeLeft || !planeRight || !videoTexture.image) return;

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
    // screenWidth = focal * screenDistance (where focal is fraction of width)
    const screenWidth = focal * screenDistance;
    const screenHeight = screenWidth / halfAspect;

    // Calculate reconvergence shift
    // reconv = focal * ipd / screenDistance
    const reconv = focal * ipd / screenDistance;

    // Since each eye's image is 0.5 width in texture coords (due to SBS),
    // and reconv is relative to individual eye image width,
    // we need to scale by 0.5 when applying to texture offset
    const reconvScale = 0.5; // individual eye width in texture coordinates

    // Update UV offsets for reconvergence
    // Left texture: base offset 0, shift by -reconv/2 * scale
    const leftShift = -(reconv / 2) * reconvScale;
    planeLeft.material.map.offset.set(leftShift, 0);

    // Right texture: base offset 0.5 (for SBS split), shift by +reconv/2 * scale
    const rightShift = (reconv / 2) * reconvScale;
    planeRight.material.map.offset.set(0.5 + rightShift, 0);

    // Debug log reconvergence (only when it changes significantly)
    if (Math.abs(reconv - (planeLeft.userData.lastReconv || 0)) > 0.001) {
        console.log(`Reconv: ${(reconv*100).toFixed(2)}% of eye width, texture shift: ±${((reconv/2)*reconvScale*100).toFixed(3)}% of SBS`);
        planeLeft.userData.lastReconv = reconv;
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

    hudOverlay.position.set(-0.5 + hudScale / 2, 0.5 - hudScale / (2 * hudAspect), 0.01);
    hudOverlay.scale.set(hudScale, hudScale / hudAspect, 1);

    // Match parent plane's layer
    hudOverlay.layers.mask = plane.layers.mask;

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
    hudCtx.fillText('Trigger: play/pause | Grip: HUD | X: exit', 20, 245);

    hudTexture.needsUpdate = true;
}
