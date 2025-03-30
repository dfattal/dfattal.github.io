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
let xrCanvasInitialized = false;

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

const DISTANCE = 50;       // default view plane distance for parallel frustums
const HUD_DISTANCE = 10;   // how far in front of camera we place the HUD plane

// Temp re-usable vectors/quats
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// Shared HUD globals (for both eyes)
let hudCanvas, hudCtx, hudTexture;
// initial position of the center eyes
let initialY, initialZ, IPD;

function disposeResources() {
    if (texL) {
        texL.dispose();
        texL = null;
    }
    if (texR) {
        texR.dispose();
        texR = null;
    }
    if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss(); // Explicitly trigger context loss (optional but recommended)
        renderer = null;
    }
    if (planeLeft) {
        planeLeft.geometry.dispose();
        planeLeft.material.dispose();
        planeLeft = null;
    }
    if (planeRight) {
        planeRight.geometry.dispose();
        planeRight.material.dispose();
        planeRight = null;
    }
    if (rL) {
        rL.gl.getExtension('WEBGL_lose_context')?.loseContext();
        rL = null;
    }
    if (rR) {
        rR.gl.getExtension('WEBGL_lose_context')?.loseContext();
        rR = null;
    }

    console.log('Resources disposed.');
}

document.addEventListener('DOMContentLoaded', async () => {
    const filePicker = document.getElementById('filePicker');
    filePicker.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            try {
                // Dispose of old resources explicitly before loading new ones
                disposeResources();
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

    // ADD CONTEXT LOSS HANDLER HERE
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.error('WebGL context lost.');
        disposeResources();
    });

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

            // Set canvas dimensions once when XR cameras are available
            if (!xrCanvasInitialized) {
                rL.gl.canvas.width = leftCam.viewport.width;
                rL.gl.canvas.height = leftCam.viewport.height;
                rR.gl.canvas.width = rightCam.viewport.width;
                rR.gl.canvas.height = rightCam.viewport.height;

                xrCanvasInitialized = true;

                // Calculate the convergence plane position and size
                const convergencePlane = calculateConvergencePlane(leftCam, rightCam);
                console.log('convergencePlane: ', convergencePlane);
                // Position both planes at the same convergence point
                positionPlaneAtConvergence(planeLeft, leftCam, convergencePlane);
                positionPlaneAtConvergence(planeRight, rightCam, convergencePlane);

                // Save the convergence plane info for HUD creation
                planeLeft.userData.convergencePlane = convergencePlane;
                planeRight.userData.convergencePlane = convergencePlane;

                // Set up layers only once
                leftCam.layers.enable(1);
                rightCam.layers.enable(2);
            }

            // Create HUD overlay for each VR plane if not already created
            if (!planeLeft.userData.hudOverlay) {
                createHUDOverlayForVR(planeLeft, leftCam, planeLeft.userData.convergencePlane);
            }
            if (!planeRight.userData.hudOverlay) {
                createHUDOverlayForVR(planeRight, rightCam, planeRight.userData.convergencePlane);
            }

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
            xrCanvasInitialized = false; // Reset initialization if exiting VR

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
 * calculateConvergencePlane(leftCam, rightCam):
 * Calculate the position and size of the convergence plane where
 * the left and right eye frustums meet.
 * @returns {Object} Position and dimensions of the convergence plane
 */
function calculateConvergencePlane(leftCam, rightCam) {
    // Extract FOV angles for both eyes
    const leftFov = extractFovAngles(leftCam);
    const rightFov = extractFovAngles(rightCam);

    // Shorthand notation to match the provided math
    const l0 = Math.tan(leftFov.angleLeft);
    const r0 = Math.tan(leftFov.angleRight);
    const u0 = Math.tan(leftFov.angleUp);
    const d0 = Math.tan(leftFov.angleDown);

    const l1 = Math.tan(rightFov.angleLeft);
    const r1 = Math.tan(rightFov.angleRight);
    const u1 = Math.tan(rightFov.angleUp);
    const d1 = Math.tan(rightFov.angleDown);

    // Eye positions
    const x0 = leftCam.position.x;
    const y0 = leftCam.position.y;
    const z0 = leftCam.position.z;

    const x1 = rightCam.position.x;
    const y1 = rightCam.position.y;
    const z1 = rightCam.position.z;

    // Check for parallel frustums (will cause division by zero)
    const denomX = (r1 - l1) - (r0 - l0);
    const denomY = (u1 - d1) - (u0 - d0);

    if (Math.abs(denomX) < 1e-6 || Math.abs(denomY) < 1e-6) {
        // Frustums are nearly parallel, use fallback
        const centerPos = new THREE.Vector3()
            .addVectors(leftCam.position, rightCam.position)
            .multiplyScalar(0.5);

        // Position far away in front of the center point
        centerPos.z -= DISTANCE;

        // Size that matches FOV
        const { fov, aspect } = parseSubCamFov(leftCam);
        const width = 2 * DISTANCE * Math.tan(Math.atan(aspect * Math.tan(fov / 2)));
        const height = 2 * DISTANCE * Math.tan(fov / 2);

        return {
            position: centerPos,
            width: width,
            height: height
        };
    }

    // Calculate display position using the provided math
    const xd = ((r1 - l1) * (x0 + z0 * (r0 - l0)) - (r0 - l0) * (x1 + z1 * (r1 - l1))) / denomX;
    const yd = ((u1 - d1) * (y0 + z0 * (u0 - d0)) - (u0 - d0) * (y1 + z1 * (u1 - d1))) / denomY;
    const zd = (x1 + z1 * (r1 - l1) - x0 - z0 * (r0 - l0)) / denomX;

    // Calculate display size
    const W = Math.abs((z0 - zd) * (l0 + r0));
    const H = Math.abs((z0 - zd) * (u0 + d0));

    return {
        position: new THREE.Vector3(xd, yd, zd),
        width: W,
        height: H
    };
}

/**
 * Extract FOV angles from a camera's projection matrix
 */
function extractFovAngles(camera) {
    const projMatrix = camera.projectionMatrix.elements;

    // Extract FOV from projection matrix
    const left = Math.atan(-1 / projMatrix[0] - projMatrix[8] / projMatrix[0]);
    const right = Math.atan(1 / projMatrix[0] - projMatrix[8] / projMatrix[0]);
    const bottom = Math.atan(-1 / projMatrix[5] - projMatrix[9] / projMatrix[5]);
    const top = Math.atan(1 / projMatrix[5] - projMatrix[9] / projMatrix[5]);

    return {
        angleLeft: left,
        angleRight: right,
        angleUp: top,
        angleDown: bottom
    };
}

/**
 * Position a plane at the convergence point, oriented toward its respective camera
 */
function positionPlaneAtConvergence(plane, camera, convergencePlane) {
    // Position the plane at the convergence point
    plane.position.copy(convergencePlane.position);

    // Orient the plane to face the camera
    plane.lookAt(camera.position);

    // Set the plane size
    plane.scale.set(convergencePlane.width, convergencePlane.height, 1);
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
 * createHUDOverlayForVR(plane, subCam, convergencePlane):
 *   1) Use the convergence plane position and size to calculate HUD dimensions
 *   2) Create a HUD overlay sized to 1/5 of the view width with height = half of that
 *   3) Position the overlay in the top-left corner of the VR plane
 */
function createHUDOverlayForVR(plane, subCam, convergencePlane) {
    // Distance from camera to convergence plane
    const cameraPos = new THREE.Vector3();
    subCam.getWorldPosition(cameraPos);
    const distToPlane = cameraPos.distanceTo(convergencePlane.position);

    // Use the convergence plane's dimensions
    const planeWidth = convergencePlane.width;
    const planeHeight = convergencePlane.height;

    // HUD size (1/5 of width, with height = half of that)
    const hudW = planeWidth / 5;
    const hudH = hudW / 2;

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

    // const leftPos = new THREE.Vector3();
    // const rightPos = new THREE.Vector3();
    // leftCam.getWorldPosition(leftPos);
    // rightCam.getWorldPosition(rightPos);
    const leftPos = leftCam.position;
    const rightPos = rightCam.position;

    const lx = leftPos.x.toFixed(2), ly = leftPos.y.toFixed(2), lz = leftPos.z.toFixed(2);
    const rx = rightPos.x.toFixed(2), ry = rightPos.y.toFixed(2), rz = rightPos.z.toFixed(2);

    hudCtx.fillText(`Left:  (${lx}, ${ly}, ${lz})`, 10, 60);
    hudCtx.fillText(`Right: (${rx}, ${ry}, ${rz})`, 10, 90);

    hudTexture.needsUpdate = true;
}