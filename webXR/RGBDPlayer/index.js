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
let screenDistance = 10; // meters (default)
let focal = 1.0; // focal length as fraction of image width (default = 36mm equiv)
let diopters = 0.1; // 1/screenDistance
let invZmin = 0.05; // Depth effect control

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

// Video frame rate tracking
let videoFps = 0;
let videoFrameCount = 0;
let videoFpsStartTime = 0;

// View synthesis material
let viewSynthesisMaterial;

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

    document.body.appendChild(renderer.domElement);

    const vrButton = VRButton.createButton(renderer);
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

function loadVideoSource(src) {
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

        measureVideoFrameRate();
        createViewSynthesisMaterial();
        createAnaglyphPlane();

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
    if (!('requestVideoFrameCallback' in video)) {
        infoFps.textContent = 'N/A';
        return;
    }
    videoFrameCount = 0;
    videoFpsStartTime = 0;
    const updateVideoFps = (now) => {
        if (videoFpsStartTime === 0) videoFpsStartTime = now;
        videoFrameCount++;
        const elapsed = now - videoFpsStartTime;
        if (elapsed >= 1000) {
            videoFps = Math.round((videoFrameCount * 1000) / elapsed);
            infoFps.textContent = `${videoFps} fps`;
            videoFrameCount = 0;
            videoFpsStartTime = now;
        }
        video.requestVideoFrameCallback(updateVideoFps);
    };
    video.requestVideoFrameCallback(updateVideoFps);
}

function createViewSynthesisMaterial() {
    viewSynthesisMaterial = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: videoTexture },
            isVR: { value: false },
            eye: { value: 0 }, // 0 for left, 1 for right
            invZmin: { value: invZmin },
            focal: { value: focal },
            ipd: { value: ipd },
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
            uniform bool isVR;
            uniform int eye;
            uniform float invZmin;
            uniform float focal;
            uniform float ipd;
            varying vec2 vUv;

            void main() {
                vec2 rgbUv = vec2(vUv.x * 0.5, vUv.y);
                vec4 leftColor = texture2D(tDiffuse, rgbUv);

                vec2 depthUv = vec2(0.5 + vUv.x * 0.5, vUv.y);
                float depth = texture2D(tDiffuse, depthUv).r;
                
                float disparity = depth * invZmin * focal * ipd;
                vec2 rightRgbUv = vec2(rgbUv.x - disparity, rgbUv.y);
                vec4 rightColor = texture2D(tDiffuse, rightRgbUv);

                if (isVR) {
                    if (eye == 0) {
                        gl_FragColor = leftColor;
                    } else {
                        gl_FragColor = rightColor;
                    }
                } else {
                    gl_FragColor = vec4(leftColor.r, rightColor.g, rightColor.b, 1.0);
                }
            }
        `
    });
}

function createAnaglyphPlane() {
    if (anaglyphPlane) {
        scene.remove(anaglyphPlane);
        anaglyphPlane.geometry.dispose();
    }
    if (!video.videoWidth) return;

    const viewAspect = (video.videoWidth / 2) / video.videoHeight;
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

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    anaglyphPlane = new THREE.Mesh(geometry, viewSynthesisMaterial);
    anaglyphPlane.position.set(0, 1.6, -viewDistance);
    scene.add(anaglyphPlane);
}

function onVRSessionStart() {
    isInVRMode = true;
    uiContainer.classList.add('hidden');
    if (video) video.muted = false;
    if (anaglyphPlane) anaglyphPlane.visible = false;
}

function onVRSessionEnd() {
    isInVRMode = false;
    uiContainer.classList.remove('hidden');
    if (video) video.muted = true;
    if (anaglyphPlane) anaglyphPlane.visible = true;
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
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (!isInVRMode && anaglyphPlane) createAnaglyphPlane();
}

function animate() {
    renderer.setAnimationLoop(() => {
        const isInVR = renderer.xr.isPresenting;
        if (isInVR && videoTexture) {
            if (!planeLeft) createPlanesVR();
            handleControllerInput();
            updateStereoPlanes();
            updateHUD();
        }
        renderer.render(scene, camera);
    });
}

function createPlanesVR() {
    const planeGeom = new THREE.PlaneGeometry(1, 1);
    
    const matLeft = viewSynthesisMaterial.clone();
    matLeft.uniforms.isVR.value = true;
    matLeft.uniforms.eye.value = 0;
    planeLeft = new THREE.Mesh(planeGeom, matLeft);
    planeLeft.layers.set(1);
    scene.add(planeLeft);

    const matRight = viewSynthesisMaterial.clone();
    matRight.uniforms.isVR.value = true;
    matRight.uniforms.eye.value = 1;
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
            const stickY = axes.length >= 4 ? axes[3] : 0;

            if (source.handedness === 'left' && Math.abs(stickY) > 0.1) {
                diopters += stickY * 0.01;
                diopters = Math.max(0.01, Math.min(1.0, diopters));
                screenDistance = 1.0 / diopters;
            }
            if (source.handedness === 'right' && Math.abs(stickY) > 0.1) {
                let log2Focal = Math.log2(focal) - stickY * 0.02;
                focal = Math.pow(2, Math.max(-1, Math.min(1, log2Focal)));
            }
            
            if (!source.userData) source.userData = {};

            // Triggers to adjust invZmin
            if (buttons.length > 0 && buttons[0].pressed) {
                if (!source.userData.triggerPressed) {
                    if (source.handedness === 'left') {
                        invZmin -= 0.005;
                    } else if (source.handedness === 'right') {
                        invZmin += 0.005;
                    }
                    invZmin = Math.max(0, Math.min(0.1, invZmin)); // Clamp
                    source.userData.triggerPressed = true;
                }
            } else {
                source.userData.triggerPressed = false;
            }

            // Grip to toggle HUD
            if (buttons.length > 1 && buttons[1].pressed) {
                if (!source.userData.squeezePressed) {
                    toggleHUD();
                    source.userData.squeezePressed = true;
                }
            } else {
                source.userData.squeezePressed = false;
            }

            // A/X button to exit VR
            if (buttons.length > 3 && buttons[3].pressed) {
                if (!source.userData.aButtonPressed) {
                    renderer.xr.getSession().end();
                    source.userData.aButtonPressed = true;
                }
            } else {
                source.userData.aButtonPressed = false;
            }

            // B/Y button to play/pause
            if (buttons.length > 4 && buttons[4].pressed) {
                if (!source.userData.bButtonPressed) {
                    togglePlayPause();
                    source.userData.bButtonPressed = true;
                }
            } else {
                source.userData.bButtonPressed = false;
            }
        }
    }
}

function updateStereoPlanes() {
    if (!planeLeft || !planeRight || !videoTexture.image) return;
    updateIPD();

    const halfAspect = (video.videoWidth / 2) / video.videoHeight;
    const screenWidth = focal * screenDistance;
    const screenHeight = screenWidth / halfAspect;

    const position = new THREE.Vector3(0, 1.6, -screenDistance);
    planeLeft.position.copy(position);
    planeRight.position.copy(position);
    planeLeft.scale.set(screenWidth, screenHeight, 1);
    planeRight.scale.set(screenWidth, screenHeight, 1);

    planeLeft.material.uniforms.invZmin.value = invZmin;
    planeRight.material.uniforms.invZmin.value = invZmin;
    planeLeft.material.uniforms.focal.value = focal;
    planeRight.material.uniforms.focal.value = focal;
    planeLeft.material.uniforms.ipd.value = ipd;
    planeRight.material.uniforms.ipd.value = ipd;
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
    hudOverlay.position.set(-0.5 + hudScale / 2, 0.5 - hudScale / (2 * hudAspect), 0.01);
    hudOverlay.scale.set(hudScale, hudScale / hudAspect, 1);
    hudOverlay.layers.mask = plane.layers.mask;
    plane.add(hudOverlay);
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
    const status = video && !video.paused ? 'Playing' : 'Paused';
    hudCtx.fillText(`Status: ${status}`, 20, 200);
    hudCtx.font = '16px monospace';
    hudCtx.fillStyle = '#aaa';
    hudCtx.fillText('L-stick: distance | R-stick: focal', 20, 225);
    hudCtx.fillText('L/R Triggers: invZmin | Grip: HUD', 20, 245);
    hudCtx.fillText('A: exit | B: play/pause', 20, 265);
    hudTexture.needsUpdate = true;
}
