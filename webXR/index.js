import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;  // VR planes
let planeNonVR = null;                    // single-plane for NON-VR
let sbsTexture = null;                    // loaded side-by-side texture

const DISTANCE = 20;       // how far from each eye to place the main SBS planes in VR

// Shared HUD globals (for both eyes)
let hudCanvas, hudCtx, hudTexture;

// Temp re-usable vectors/quats
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

init();
animate();

/** Initialize scene, camera, renderer, etc. */
function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;

    document.body.appendChild(renderer.domElement);
    const vrButton = VRButton.createButton(renderer);
    document.body.appendChild(vrButton);
    vrButton.style.background = 'rgba(0, 0, 0, 0.5)';

    const loader = new THREE.TextureLoader();
    loader.load('assets/Seagull_2x1.jpg', (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        sbsTexture = tex;
        console.log('Loaded SBS texture:', tex.image.width, 'x', tex.image.height);
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
        const isInVR = renderer.xr.isPresenting;

        // Show/hide the single-plane if we're in VR or not
        if (planeNonVR) planeNonVR.visible = !isInVR;

        if (isInVR && sbsTexture && xrCam.isArrayCamera && xrCam.cameras.length === 2) {
            // =============== VR MODE ===============
            if (!planeLeft || !planeRight) {
                createPlanesVR();
            }

            const leftCam = xrCam.cameras[0];
            const rightCam = xrCam.cameras[1];
            console.log('leftCam.pos: ', leftCam.position, ' IPD: ', leftCam.position.distanceTo(rightCam.position));

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

            // Update the shared HUD canvas texture (both overlays share it)
            updateHUD(leftCam, rightCam);

            planeLeft.visible = true;
            planeRight.visible = true;

        } else {
            // ============ NOT IN VR ============
            if (planeLeft) planeLeft.visible = false;
            if (planeRight) planeRight.visible = false;

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

    // Right half texture
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
 *   Fills the entire 2D browser window with the "left half" image.
 */
function fitNonVRPlane(plane, camera) {
    const dist = 1.0;

    plane.position.copy(camera.position);
    plane.quaternion.copy(camera.quaternion);
    plane.translateZ(-dist);

    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const imgW = sbsTexture.image.naturalWidth;
    const imgH = sbsTexture.image.naturalHeight;
    const halfAspect = imgW / (2 * imgH);

    let planeHeight = 2 * dist * Math.tan(vFOV / 2);
    let planeWidth = planeHeight * halfAspect;

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
/*                             HUD Overlay on VR Planes                 */
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

    // Recalculate VR plane dimensions (same as in fitAndPositionPlane)
    const imgW = sbsTexture.image.naturalWidth;
    const imgH = sbsTexture.image.naturalHeight;
    const halfAspect = imgW / (2 * imgH);
    const { planeWidth, planeHeight } = fitPlaneInFov(halfAspect, vFOV, aspect, DISTANCE);

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