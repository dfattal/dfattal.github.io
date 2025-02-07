// LifRender.js -- test renderer for LIF files in webXR
import { LifLoader } from '../LIF/LifLoader.js';
import { MN2MNRenderer } from '../VIZ/Renderers.js';

let views = null;
let stereo_render_data = null;
let mnRenderer = null;
let dynamicTexture = null;

// Three.js renderer
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let plane, camera, scene, renderer;

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

                // Initialize Three.js (creates plane, camera, scene, renderer)
                await initThreeJs();
                animate();
            } catch (error) {
                console.error('Error loading LIF:', error);
            }
        }
    });
});

/** Initialize scene, camera, renderer, etc. */
async function initThreeJs() {
    scene = new THREE.Scene();

    // Create a perspective camera.
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10000);
    scene.add(camera);

    // Create the Three.js WebGL renderer.
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // IMPORTANT: Append the renderer's canvas to the DOM so it's visible.
    document.body.appendChild(renderer.domElement);

    // For VR: if you plan to use WebXR, add the VR button.
    // document.body.appendChild(VRButton.createButton(renderer));

    // Create an offscreen canvas for MN2MNRenderer.
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = views[0].width_px;
    offscreenCanvas.height = views[0].height_px;
    console.log('Offscreen canvas:', offscreenCanvas);

    // Get a WebGL context from the offscreen canvas.
    const gl = offscreenCanvas.getContext('webgl');

    // Initialize the MN2MNRenderer with the offscreen canvas's WebGL context.
    mnRenderer = await MN2MNRenderer.createInstance(gl, '../Shaders/rayCastMonoLDI.glsl', views, false);
    mnRenderer.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
    console.log('MN2MNRenderer initialized with renderCam:', mnRenderer.renderCam);
    // mnRenderer.drawScene();

    // Create a Three.js texture from the offscreen canvas.
    // (Note: you’re using a red material right now, so this texture isn't applied.)
    dynamicTexture = new THREE.CanvasTexture(mnRenderer.gl.canvas);
    // Load an image from a known URL and use it as the texture.

    // Create a basic material using the dynamic texture as its map.
    // This material automatically handles UV mapping and texture sampling.
    // I sometimes see a washed out image when using this material so will use ShaderMaterial instead.
    const basicMaterial = new THREE.MeshBasicMaterial({
        map: dynamicTexture
    });

    const shaderMaterial = new THREE.ShaderMaterial({
        // Define uniforms: pass in the dynamic texture.
        uniforms: {
            uTexture: { value: dynamicTexture }
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

    // Create a plane geometry with dimensions matching the view.
    const planeGeometry = new THREE.PlaneGeometry(views[0].width_px, views[0].height_px);

    plane = new THREE.Mesh(planeGeometry, shaderMaterial);
    plane.position.z = -views[0].focal_px;
    // Add the mesh to your Three.js scene.
    scene.add(plane);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/** Main animation/render loop (for WebXR). */
function animate() {
    renderer.setAnimationLoop((time) => {
        const elapsed = time / 1000; // seconds
        mnRenderer.renderCam.pos.x = Math.sin(2 * Math.PI * elapsed);
        mnRenderer.renderCam.sk.x = - mnRenderer.renderCam.pos.x * mnRenderer.invd / (1 - mnRenderer.renderCam.pos.z * mnRenderer.invd);
        mnRenderer.renderCam.f = mnRenderer.views[0].f * mnRenderer.viewportScale() * Math.max(1 - mnRenderer.renderCam.pos.z * mnRenderer.invd, 0);
        mnRenderer.drawScene();

        // Notify Three.js that the canvas texture has changed.
        dynamicTexture.needsUpdate = true;
        
        renderer.render(scene, camera);
    });
}