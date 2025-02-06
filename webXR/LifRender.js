// LifRender.js -- test renderer for LIF files in webXR
import { LifLoader } from '../LIF/LifLoader.js';
import { MN2MNRenderer, ST2MNRenderer } from '../VIZ/Renderers.js';

let views = null;
let stereo_render_data = null;

// Focal calculations
function viewportScale(iRes, oRes) {
    return Math.min(oRes.x, oRes.y) / Math.min(iRes.x, iRes.y);
}

// Three.js renderer
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let planeLeft = null, planeRight = null;  // VR planes
let planeNonVR = null;                    // single-plane for NON-VR
let texL = null;                    // loaded left eye texture
let texR = null;                    // loaded right eye texture

const DISTANCE = 20;       // how far from each eye to place the main SBS planes in VR
const HUD_DISTANCE = 10;   // how far in front of camera we place the HUD plane

// Temp re-usable vectors/quats
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// HUD
let hudPlane, hudTexture, hudCtx;
let hudCreated = false;  // so we only create/attach the HUD once

document.addEventListener('DOMContentLoaded', async () => {
    const filePicker = document.getElementById('filePicker');
    filePicker.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            try {
                const loader = new LifLoader();
                await loader.load(file);

                // Retrieve processed views from LifLoader.
                views = loader.views;
                stereo_render_data = loader.stereo_render_data;

                console.log('Views:', views);
                console.log('Stereo Render Data:', stereo_render_data);

                // Hide the file picker after file selection
                filePicker.style.display = 'none';
                init();
                animate();
            } catch (error) {
                console.error('Error loading LIF:', error);
            }
        }
    });


});

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
    loader.load(views[0].image.url, (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        texL = tex;
        console.log('Loaded left texture:', tex.image.width, 'x', tex.image.height);
    });
    loader.load(views[1].image.url, (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        texR = tex;
        console.log('Loaded right texture:', tex.image.width, 'x', tex.image.height);
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

        if (texL && texR && xrCam.isArrayCamera && xrCam.cameras.length === 2) {
            // =============== VR MODE ===============
            // Create left/right planes if needed
            if (!planeLeft || !planeRight) {
                createPlanesVR();
            }

            // Access the sub-cameras
            const leftCam = xrCam.cameras[0];
            const rightCam = xrCam.cameras[1];

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

    const matLeft = new THREE.MeshBasicMaterial({ map: texL });
    const matRight = new THREE.MeshBasicMaterial({ map: texR });

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

    const imgW = texL.image.naturalWidth;
    const imgH = texL.image.naturalHeight;
    const imAspect = imgW / imgH;

    const { planeWidth, planeHeight } = fitPlaneInFov(imAspect, fov, aspect, DISTANCE);

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