import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;
let videoTexture = null;
let video = null;

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
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;

    document.body.appendChild(renderer.domElement);
    const vrButton = VRButton.createButton(renderer);
    document.body.appendChild(vrButton);

    // Setup video
    video = document.getElementById('video');
    video.src = 'indiana_relative_g04_b3_tc07_inf_2x1.mp4'; // SBS video source
    video.load();

    // Try to autoplay (may require user interaction on some browsers)
    video.play().catch(err => {
        console.warn('Autoplay prevented, waiting for user interaction:', err);
    });

    videoTexture = new THREE.VideoTexture(video);
    videoTexture.encoding = THREE.sRGBEncoding;

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
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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

        } else {
            // Not in VR - hide planes
            if (planeLeft) planeLeft.visible = false;
            if (planeRight) planeRight.visible = false;
        }

        renderer.render(scene, camera);
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

            if (axes.length >= 2) {
                const stickY = axes[1]; // Thumbstick Y-axis (-1 = up/forward, +1 = down/back)

                // Left controller stick controls distance via diopters
                if (isLeft && Math.abs(stickY) > 0.1) {
                    // Map stick to diopter range [0.01, 1.0] - forward (negative Y) = closer
                    diopters = 0.505 - stickY * 0.495; // center at 0.505, range 0.01 to 1.0
                    diopters = Math.max(0.01, Math.min(1.0, diopters));
                    screenDistance = 1.0 / diopters;
                    console.log(`Left stick Y: ${stickY.toFixed(2)}, Distance: ${screenDistance.toFixed(1)}m`);
                }

                // Right controller stick controls focal in log2 space
                if (isRight && Math.abs(stickY) > 0.1) {
                    // Map to log2(focal) range [-1, 1], which is focal [0.5, 2]
                    const log2Focal = stickY; // forward (negative) = zoom in (larger focal)
                    focal = Math.pow(2, log2Focal);
                    focal = Math.max(0.5, Math.min(2.0, focal));
                    console.log(`Right stick Y: ${stickY.toFixed(2)}, Focal: ${focal.toFixed(2)}`);
                }
            }

            // Handle button presses for play/pause (A/X button is typically buttons[4])
            if (buttons.length > 4 && buttons[4].pressed) {
                // Debounce button press
                if (!source.userData) source.userData = {};
                if (!source.userData.buttonPressed) {
                    togglePlayPause();
                    source.userData.buttonPressed = true;
                }
            } else {
                if (source.userData) source.userData.buttonPressed = false;
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

    // Update UV offsets for reconvergence
    // Left texture: base offset 0, shift by -reconv/2
    planeLeft.material.map.offset.set(-reconv / 2, 0);

    // Right texture: base offset 0.5 (for SBS split), shift by +reconv/2
    planeRight.material.map.offset.set(0.5 + reconv / 2, 0);

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
    hudCtx.fillText('L-stick: distance | R-stick: focal', 20, 235);

    hudTexture.needsUpdate = true;
}
