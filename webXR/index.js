import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;  // VR planes
let planeNonVR = null;                    // single-plane for NON-VR
let sbsTexture = null;                    // loaded side-by-side texture

const DISTANCE = 20;       // how far from each eye to place the main SBS planes in VR
const HUD_DISTANCE = 10;   // how far in front of camera we place the HUD plane

// Temp re-usable vectors/quats
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// HUD
let hudPlane, hudTexture, hudCtx;
let hudCreated = false;  // so we only create/attach the HUD once

init();
animate();

/** Initialize scene, camera, renderer, etc. */
function init() {
    scene = new THREE.Scene();

    // Camera used outside VR; in VR, Three.js uses an internal ArrayCamera.
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // So colors don’t look washed out
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;

    document.body.appendChild(renderer.domElement);
    const vrButton = VRButton.createButton(renderer)
    document.body.appendChild(vrButton);
    // Override background to semi-transparent black
    vrButton.style.background = 'rgba(0, 0, 0, 0.5)';

    // Load SBS texture
    const loader = new THREE.TextureLoader();
    loader.load('assets/Seagull_2x1.jpg', (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        sbsTexture = tex;
        console.log('Loaded SBS texture:', tex.image.width, 'x', tex.image.height);

        // Once texture is loaded, create the single-plane for non-VR
        createNonVRPlane();
    });

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/** Our main animation/render loop (WebXR). */
function animate() {
    renderer.setAnimationLoop(() => {
        const xrCam = renderer.xr.getCamera(camera);
        const isInVR = renderer.xr.isPresenting;  // Are we in an immersive VR session?

        // Show/hide the single-plane if we're in VR or not
        if (planeNonVR) planeNonVR.visible = !isInVR;

        if (isInVR && sbsTexture && xrCam.isArrayCamera && xrCam.cameras.length === 2) {
            // =============== VR MODE ===============
            // Create left/right planes if needed
            if (!planeLeft || !planeRight) {
                createPlanesVR();
            }

            // Access the sub-cameras
            const leftCam = xrCam.cameras[0];
            const rightCam = xrCam.cameras[1];
            console.log('leftCam.pos: ', leftCam.position);

            // Create HUD once we have the leftCam
            if (!hudCreated) {
                createHUDWithFOV(leftCam);
                hudCreated = true;
            }

            // Position the VR planes
            fitAndPositionPlane(planeLeft, leftCam);
            fitAndPositionPlane(planeRight, rightCam);

            // Each eye sees only its plane
            leftCam.layers.enable(1);
            rightCam.layers.enable(2);

            // Update HUD text
            updateHUD(leftCam, rightCam);

            // Hide the VR planes if we happen to switch out of VR
            planeLeft.visible = true;
            planeRight.visible = true;

        } else {
            // ============ NOT IN VR ============
            // Hide VR planes if they exist
            if (planeLeft) planeLeft.visible = false;
            if (planeRight) planeRight.visible = false;

            // Fit the single-plane to fill the 2D viewport with the left image
            if (planeNonVR) {
                fitNonVRPlane(planeNonVR, camera);
            }
        }

        renderer.render(scene, camera);
    });
}

/* -------------------------------------------------------------------- */
/*                  VR Planes (Left + Right Eye)                        */
/* -------------------------------------------------------------------- */

function createPlanesVR() {
    console.log('Creating VR planes (left + right)...');
    // Left half texture
    const texLeft = sbsTexture.clone();
    texLeft.encoding = THREE.sRGBEncoding;
    texLeft.offset.set(0, 0);
    texLeft.repeat.set(0.5, 1);

    // Right half
    const texRight = sbsTexture.clone();
    texRight.encoding = THREE.sRGBEncoding;
    texRight.offset.set(0.5, 0);
    texRight.repeat.set(0.5, 1);

    const matLeft = new THREE.MeshBasicMaterial({ map: texLeft });
    const matRight = new THREE.MeshBasicMaterial({ map: texRight });

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

    const { fov, aspect } = parseSubCamFov(subCam);

    // For 2:1 image, each half has aspect = (imgW / (2 * imgH))
    const imgW = sbsTexture.image.naturalWidth;
    const imgH = sbsTexture.image.naturalHeight;
    const halfAspect = imgW / (2 * imgH);

    const { planeWidth, planeHeight } = fitPlaneInFov(halfAspect, fov, aspect, DISTANCE);

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
/*                  Single-Plane for Non-VR (Left Image)                */
/* -------------------------------------------------------------------- */

function createNonVRPlane() {
    console.log('Creating single-plane for NON-VR display...');
    // We'll show the LEFT half of the SBS texture
    const texLeft = sbsTexture.clone();
    texLeft.encoding = THREE.sRGBEncoding;
    texLeft.offset.set(0, 0);
    texLeft.repeat.set(0.5, 1);

    const mat = new THREE.MeshBasicMaterial({ map: texLeft });
    const geom = new THREE.PlaneGeometry(1, 1);
    planeNonVR = new THREE.Mesh(geom, mat);
    scene.add(planeNonVR);
}

/**
 * fitNonVRPlane(plane, camera):
 *   Fills the entire 2D browser window with the "left half" image
 *   by matching the camera's FOV + distance.
 */
function fitNonVRPlane(plane, camera) {
    // We'll pick a distance (e.g. 1.0) in front of the camera
    const dist = 1.0;

    // Position the plane at (0,0,-dist) in the camera's local space
    plane.position.copy(camera.position);
    plane.quaternion.copy(camera.quaternion);
    plane.translateZ(-dist);

    // Derive camera's vertical FOV in radians
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    // The plane's aspect ratio is half of the image (left side only)
    const imgW = sbsTexture.image.naturalWidth;
    const imgH = sbsTexture.image.naturalHeight;
    const halfAspect = imgW / (2 * imgH);

    // Fit the plane so it won't be cropped in normal 2D (roughly)
    // We'll replicate the "fitPlaneInFov" logic, but with camera's aspect
    let planeHeight = 2 * dist * Math.tan(vFOV / 2);
    let planeWidth = planeHeight * halfAspect;

    // Check horizontal
    const hFOV = 2 * Math.atan(camera.aspect * Math.tan(vFOV / 2));
    const horizontalMax = 2 * dist * Math.tan(hFOV / 2);

    if (planeWidth > horizontalMax) {
        const scale = horizontalMax / planeWidth;
        planeWidth *= scale;
        planeHeight *= scale;
    }

    plane.scale.set(planeWidth, planeHeight, 1);
}

/* -------------------------------------------------------------------- */
/*                               HUD                                    */
/* -------------------------------------------------------------------- */

/**
 * createHUDWithFOV(referenceCam):
 *   1) Parse leftCam's horizontal FOV at `HUD_DISTANCE`,
 *   2) Make the HUD plane geometry sized at (1/5 of that view width) x half that,
 *   3) Parent it to the main camera so it doesn't move in your view,
 *   4) Position it in the top-left corner of your local camera space.
 */
function createHUDWithFOV(referenceCam) {
    console.log('Creating HUD using left sub-cam FOV at distance', HUD_DISTANCE);

    const { fov: vFOV, aspect } = parseSubCamFov(referenceCam);
    const hFOV = 2 * Math.atan(aspect * Math.tan(vFOV / 2));
    const viewWidth = 2 * HUD_DISTANCE * Math.tan(hFOV / 2);
    const viewHeight = 2 * HUD_DISTANCE * Math.tan(vFOV / 2);

    const hudW = viewWidth / 5;   // 1/5
    const hudH = hudW / 2;       // half the width

    // Canvas + texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    hudCtx = canvas.getContext('2d');

    hudTexture = new THREE.CanvasTexture(canvas);
    hudTexture.encoding = THREE.sRGBEncoding;

    const hudMat = new THREE.MeshBasicMaterial({
        map: hudTexture,
        transparent: true
    });
    const hudGeom = new THREE.PlaneGeometry(hudW, hudH);
    hudPlane = new THREE.Mesh(hudGeom, hudMat);

    // Attach to main camera so it doesn't move relative to your head
    camera.add(hudPlane);

    // Position in local camera space, top-left corner
    hudPlane.position.set(
        -(viewWidth / 2) + (hudW / 2),
        (viewHeight / 2) - (hudH / 2),
        -HUD_DISTANCE
    );
}

/**
 * updateHUD(leftCam, rightCam):
 *   Draw each eye's position onto the HUD plane. Called every frame in VR.
 */
function updateHUD(leftCam, rightCam) {
    if (!hudCtx || !hudTexture) return;

    hudCtx.clearRect(0, 0, hudCtx.canvas.width, hudCtx.canvas.height);

    // Semi-transparent background
    hudCtx.fillStyle = 'rgba(0,0,0,0.5)';
    hudCtx.fillRect(0, 0, hudCtx.canvas.width, hudCtx.canvas.height);

    hudCtx.fillStyle = '#fff';
    hudCtx.font = '20px sans-serif';
    hudCtx.fillText('Eye Positions', 10, 26);

    const leftPos = new THREE.Vector3();
    const rightPos = new THREE.Vector3();
    leftCam.getWorldPosition(leftPos);
    rightCam.getWorldPosition(rightPos);

    const lx = leftPos.x.toFixed(2), ly = leftPos.y.toFixed(2), lz = leftPos.z.toFixed(2);
    const rx = rightPos.x.toFixed(2), ry = rightPos.y.toFixed(2), rz = rightPos.z.toFixed(2);

    hudCtx.fillText(`Left:  (${lx}, ${ly}, ${lz})`, 10, 60);
    hudCtx.fillText(`Right: (${rx}, ${ry}, ${rz})`, 10, 90);

    hudTexture.needsUpdate = true;
}