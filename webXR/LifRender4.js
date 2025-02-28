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
                await init();
                animate();
            } catch (error) {
                console.error('Error loading LIF:', error);
            }
        }
    });


});

/** Initialize scene, camera, renderer, etc. */
async function init() {
    scene = new THREE.Scene();

    // Camera used outside VR; in VR, Three.js uses an internal ArrayCamera.
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
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

            // Get the current time in seconds
            const currentTime = performance.now() / 1000;
            if (startTime === undefined) {
                startTime = currentTime;
            }

            // Update offscreen canvas sizes to match the sub-camera viewport dimensions.
            // (Assuming leftCam.viewport exists; consult Three.js docs if needed.)
            rL.gl.canvas.width = leftCam.viewport.width;
            rL.gl.canvas.height = leftCam.viewport.height;
            rR.gl.canvas.width = rightCam.viewport.width;
            rR.gl.canvas.height = rightCam.viewport.height;

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

            const uTime = glow ? (currentTime - startTime) / glowAnimTime : 1.1; 

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
            // console.log('rL.renderCam: ', rL.renderCam);
            rR.renderCam.pos.x = rightCam.position.x / IPD;
            rR.renderCam.pos.y = (initialY - rightCam.position.y) / IPD;
            rR.renderCam.pos.z = (initialZ - rightCam.position.z) / IPD;
            rR.renderCam.sk.x = - rR.renderCam.pos.x * rR.invd / (1 - rR.renderCam.pos.z * rR.invd);
            rR.renderCam.sk.y = - rR.renderCam.pos.y * rR.invd / (1 - rR.renderCam.pos.z * rR.invd);
            rR.renderCam.f = rR.views[0].f * rR.viewportScale() * Math.max(1 - rR.renderCam.pos.z * rR.invd, 0);
            rR.drawScene(uTime % glowPulsePeriod);
            texR.needsUpdate = true;

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

    const matLeft = new THREE.ShaderMaterial({
        // Define uniforms: pass in the dynamic texture.
        uniforms: {
            uTexture: { value: texL }
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
              varying vec2 vUv;
              void main() {
                gl_FragColor = texture2D(uTexture, vUv); // Sample the texture at the interpolated UV
              }
            `
    });
    const matRight = new THREE.ShaderMaterial({
        // Define uniforms: pass in the dynamic texture.
        uniforms: {
            uTexture: { value: texR }
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
          varying vec2 vUv;
          void main() {
            gl_FragColor = texture2D(uTexture, vUv); // Sample the texture at the interpolated UV
          }
        `
    });

    // const matLeft = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // Blue for left eye
    // const matRight = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red for right eye

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