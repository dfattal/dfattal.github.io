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
let screenDistance = 10; // meters (default)
let focal = 1.0; // focal length as fraction of image width (default = 36mm equiv)
let diopters = 0.1; // 1/screenDistance
let invZmin = 0.05; // Depth effect control
let feathering = 0.01; // Edge feathering for smooth transitions

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

const rayCastMonoLDIGlsl = `
precision highp float;

varying highp vec2 v_texcoord;

uniform vec2 iResOriginal;
uniform float uTime;

// info views
uniform sampler2D uRGBD; // Single texture with RGB (left half) and depth (right half)
uniform float invZmin[4], invZmax[4]; // used to get invZ
uniform vec3 uViewPosition; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1, sl1; // common to all layers
uniform float roll1; // common to all layers, f1 in px
uniform float f1[4]; // f per layer
uniform vec2 iRes[4];
uniform int uNumLayers;

// info rendering params
uniform vec3 uFacePosition; // in normalized camera space
uniform vec2 sk2, sl2;
uniform float roll2, f2; // f2 in px
uniform vec2 oRes; // viewport resolution in px
uniform float feathering; // Feathering factor for smooth transitions at the edges

uniform vec4 background; // background color

#define texture texture2D

float taper(vec2 uv) {
    return smoothstep(0.0, feathering, uv.x) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.x)) * smoothstep(0.0, feathering, uv.y) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.y));
}

vec3 readColor(sampler2D iChannel, vec2 uv) {
    vec2 color_uv = vec2(uv.x * 0.5, uv.y);
    return texture(iChannel, color_uv).rgb;
}
float readDisp(sampler2D iChannel, vec2 uv, float vMin, float vMax, vec2 iRes) {
    vec2 disp_uv = vec2(0.5 + uv.x * 0.5, uv.y);
    return texture(iChannel, clamp(disp_uv, vec2(0.5, 0.0), vec2(1.0, 1.0))).x * (vMin - vMax) + vMax;
}

mat3 matFromSlant(vec2 sl) {
    float invsqx = 1.0 / sqrt(1.0 + sl.x * sl.x);
    float invsqy = 1.0 / sqrt(1.0 + sl.y * sl.y);
    float invsq = 1.0 / sqrt(1.0 + sl.x * sl.x + sl.y * sl.y);
    return mat3(invsqx, 0.0, sl.x * invsq, 0.0, invsqy, sl.y * invsq, -sl.x * invsqx, -sl.y * invsqy, invsq);
}

mat3 matFromRoll(float th) {
    float PI = 3.141593;
    float c = cos(th * PI / 180.0);
    float s = sin(th * PI / 180.0);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

mat3 matFromSkew(vec2 sk) {
    return mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, -sk.x, -sk.y, 1.0);
}

mat3 matFromFocal(vec2 fxy) {
    return mat3(fxy.x, 0.0, 0.0, 0.0, fxy.y, 0.0, 0.0, 0.0, 1.0);
}

float det(mat2 matrix) {
    return matrix[0].x * matrix[1].y - matrix[0].y * matrix[1].x;
}

mat3 transpose_m(mat3 matrix) {
    return mat3(vec3(matrix[0].x, matrix[1].x, matrix[2].x), vec3(matrix[0].y, matrix[1].y, matrix[2].y), vec3(matrix[0].z, matrix[1].z, matrix[2].z));
}

mat3 inverseMat(mat3 matrix) {
    vec3 row0 = matrix[0];
    vec3 row1 = matrix[1];
    vec3 row2 = matrix[2];
    vec3 minors0 = vec3(det(mat2(row1.y, row1.z, row2.y, row2.z)), det(mat2(row1.z, row1.x, row2.z, row2.x)), det(mat2(row1.x, row1.y, row2.x, row2.y)));
    vec3 minors1 = vec3(det(mat2(row2.y, row2.z, row0.y, row0.z)), det(mat2(row2.z, row2.x, row0.z, row0.x)), det(mat2(row2.x, row2.y, row0.x, row0.y)));
    vec3 minors2 = vec3(det(mat2(row0.y, row0.z, row1.y, row1.z)), det(mat2(row0.z, row0.x, row1.z, row1.x)), det(mat2(row0.x, row0.y, row1.x, row1.y)));
    mat3 adj = transpose_m(mat3(minors0, minors1, minors2));
    return (1.0 / dot(row0, minors0)) * adj;
}
#define inverse inverseMat

vec4 raycasting(vec2 s2, mat3 FSKR2, vec3 C2, mat3 FSKR1, vec3 C1, sampler2D iChannelCol, sampler2D iChannelDisp, float invZmin, float invZmax, vec2 iRes, float t, out float invZ2, out float confidence) {
    const int numsteps = 40;
    float numsteps_float = float(numsteps);
    float invZ = invZmin;
    float dinvZ = (invZmin - invZmax) / numsteps_float;
    float invZminT = invZ * (1.0 - t);
    invZ += dinvZ;
    invZ2 = 0.0;
    float disp = 0.0;
    mat3 P = FSKR1 * inverse(FSKR2);
    vec3 C = FSKR1 * (C2 - C1);
    mat2 Pxyxy = mat2(P[0].xy, P[1].xy);
    vec2 Pxyz = P[2].xy;
    vec2 Pzxy = vec2(P[0].z, P[1].z);
    float Pzz = P[2].z;
    vec2 s1 = C.xy * invZ + (1.0 - C.z * invZ) * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz);
    vec2 ds1 = (C.xy - C.z * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz)) * dinvZ;
    confidence = 1.0;
    for(int i = 0; i < numsteps; i++) {
        invZ -= dinvZ;
        s1 -= ds1;
        disp = readDisp(iChannelDisp, s1 + .5, invZmin, invZmax, iRes);
        invZ2 = invZ * (dot(Pzxy, s2) + Pzz) / (1.0 - C.z * invZ);
        if((disp > invZ) && (invZ2 > 0.0)) {
            invZ += dinvZ;
            s1 += ds1;
            dinvZ /= 2.0;
            ds1 /= 2.0;
        }
    }
    if((abs(s1.x) < 0.5) && (abs(s1.y) < 0.5) && (invZ2 > 0.0) && (invZ > invZminT)) {
        confidence = taper(s1 + .5);
        return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5));
    } else {
        invZ2 = 0.0;
        confidence = 0.0;
        return vec4(background.rgb, 0.0);
    }
}

void main(void) {
    vec2 uv = v_texcoord;

    // Optional: Window at invZmin
    float s = min(oRes.x, oRes.y) / min(iResOriginal.x, iResOriginal.y);
    vec2 newDim = iResOriginal * s / oRes;

    if((abs(uv.x - .5) < .5 * newDim.x) && (abs(uv.y - .5) < .5 * newDim.y)) {
        vec3 C1 = uViewPosition;
        mat3 SKR1 = matFromSkew(sk1) * matFromRoll(roll1) * matFromSlant(sl1);
        vec3 C2 = uFacePosition;
        mat3 FSKR2 = matFromFocal(vec2(f2 / oRes.x, f2 / oRes.y)) * matFromSkew(sk2) * matFromRoll(roll2) * matFromSlant(sl2);
        float invZ, confidence;

        vec4 result = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1[0] / iRes[0].x, f1[0] / iRes[0].y)) * SKR1, C1, uRGBD, uRGBD, invZmin[0], invZmax[0], iRes[0], 1.0, invZ, confidence);

        // Blend with the background (result.rgb is NOT premultiplied)
        result.rgb = background.rgb * background.a * (1.0 - result.a) + result.rgb * result.a;
        result.a = background.a + result.a * (1.0 - background.a);

        gl_FragColor = result;
    } else {
        gl_FragColor = background;
    }
}
`;

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
        },
        vertexShader: `
            varying vec2 v_texcoord;
            void main() {
                v_texcoord = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: rayCastMonoLDIGlsl
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

                // Left controller stick Y controls distance via diopters
                if (source.handedness === 'left' && Math.abs(stickY) > 0.1) {
                    const diopterDelta = stickY * 0.01;
                    diopters += diopterDelta;
                    diopters = Math.max(0.01, Math.min(1.0, diopters));
                    screenDistance = 1.0 / diopters;
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

            // Left thumbstick X-axis controls invZmin (left decreases, right increases)
            if (axes.length >= 2 && source.handedness === 'left') {
                const stickX = axes[0]; // X-axis (-1 = left, +1 = right)
                if (Math.abs(stickX) > 0.1) {
                    const invZminDelta = stickX * 0.001; // Linear adjustment
                    invZmin += invZminDelta;
                    invZmin = Math.max(0.0, Math.min(0.1, invZmin));
                }
            }

            // Right thumbstick X-axis controls feathering (left decreases, right increases)
            if (axes.length >= 2 && source.handedness === 'right') {
                const stickX = axes[0]; // X-axis (-1 = left, +1 = right)
                if (Math.abs(stickX) > 0.1) {
                    const featheringDelta = stickX * 0.001; // Linear adjustment
                    feathering += featheringDelta;
                    feathering = Math.max(0.0, Math.min(0.2, feathering));
                }
            }

            // Trigger (buttons[0]) for play/pause
            if (buttons.length > 0 && buttons[0].pressed) {
                if (!source.userData.triggerPressed) {
                    togglePlayPause();
                    console.log('Play/Pause toggled');
                    source.userData.triggerPressed = true;
                }
            } else {
                source.userData.triggerPressed = false;
            }

            // Squeeze/Grip (buttons[1]) for HUD toggle
            if (buttons.length > 1 && buttons[1].pressed) {
                if (!source.userData.squeezePressed) {
                    toggleHUD();
                    console.log('HUD toggled');
                    source.userData.squeezePressed = true;
                }
            } else {
                source.userData.squeezePressed = false;
            }

            // X button (buttons[4]) to exit VR session
            if (buttons.length > 4 && buttons[4].pressed) {
                if (!source.userData.xButtonPressed) {
                    console.log('X button pressed - exiting VR');
                    renderer.xr.getSession().end();
                    source.userData.xButtonPressed = true;
                }
            } else {
                source.userData.xButtonPressed = false;
            }
        }
    }
}

function updateStereoPlanes() {
    if (!planeLeft || !planeRight || !videoTexture.image) return;
    updateIPD();

    const halfWidth = video.videoWidth / 2;
    const aspect = halfWidth / video.videoHeight;
    const screenWidth = screenDistance / focal;
    const screenHeight = screenWidth / aspect;

    const position = new THREE.Vector3(0, 1.6, -screenDistance);
    planeLeft.position.copy(position);
    planeRight.position.copy(position);
    planeLeft.scale.set(screenWidth, screenHeight, 1);
    planeRight.scale.set(screenWidth, screenHeight, 1);

    const xrCam = renderer.xr.getCamera(camera);
    const leftCam = xrCam.cameras[0];
    const rightCam = xrCam.cameras[1];

    // oRes should be the screen dimensions in VR space (same as plane scale)
    const oRes = new THREE.Vector2(screenWidth, screenHeight);

    // Common uniforms
    const commonUniforms = {
        'invZmin': { value: [invZmin, 0, 0, 0] },
        'f1': { value: [focal * halfWidth, 0, 0, 0] },
        'iRes': { value: [new THREE.Vector2(halfWidth, video.videoHeight), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
        'oRes': { value: oRes },
        'iResOriginal': { value: new THREE.Vector2(halfWidth, video.videoHeight) },
        'feathering': { value: feathering }
    };

    // Left eye
    const invd_left = ipd / screenDistance;
    const facePosLeft = new THREE.Vector3(leftCam.position.x / ipd, (leftCam.position.y-1.6) / ipd, -leftCam.position.z / ipd);
    const sk2_left = new THREE.Vector2(-facePosLeft.x * invd_left / (1.0 - facePosLeft.z * invd_left), -facePosLeft.y * invd_left / (1.0 - facePosLeft.z * invd_left));
    const f2_left = screenDistance * (1.0 - facePosLeft.z * invd_left);

    Object.assign(planeLeft.material.uniforms, commonUniforms, {
        'uFacePosition': { value: facePosLeft },
        'sk2': { value: sk2_left },
        'f2': { value: f2_left }
    });

    // Right eye
    const invd_right = ipd / screenDistance;
    const facePosRight = new THREE.Vector3(rightCam.position.x / ipd, (rightCam.position.y-1.6) / ipd, -rightCam.position.z / ipd);
    const sk2_right = new THREE.Vector2(-facePosRight.x * invd_right / (1.0 - facePosRight.z * invd_right), -facePosRight.y * invd_right / (1.0 - facePosRight.z * invd_right));
    const f2_right = screenDistance * (1.0 - facePosRight.z * invd_right);

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
    hudCtx.fillText(`Feathering: ${feathering.toFixed(3)}`, 20, 200);
    const status = video && !video.paused ? 'Playing' : 'Paused';
    hudCtx.fillText(`Status: ${status}`, 20, 230);
    hudCtx.font = '16px monospace';
    hudCtx.fillStyle = '#aaa';
    hudCtx.fillText('L-stick: distance(Y) invZmin(X)', 20, 255);
    hudCtx.fillText('R-stick: focal(Y) feather(X)', 20, 275);
    hudCtx.fillText('Trigger: play/pause | Grip: HUD | X: exit', 20, 295);
    hudTexture.needsUpdate = true;
}