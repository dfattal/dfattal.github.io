// Simple WebXR example with a spinning cube
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Three.js globals
let scene, camera, renderer, cube;
let animationFrameId = null;

/**
 * Initializes WebXR session with a spinning cube
 */
function init() {
    // Initialize Three.js scene
    initThreeJS();

    // Check if WebXR is available
    if (!navigator.xr) {
        console.error("WebXR not available");
        document.body.innerHTML = '<p style="color:red; padding:20px;">WebXR not available on this device</p>';
        return;
    }

    // Add VR button to the page
    document.body.appendChild(VRButton.createButton(renderer));
}

/**
 * Initialize Three.js scene with a rotating cube
 */
function initThreeJS() {
    // Create the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x505050);

    // Create a camera with specified near and far clipping planes
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1234, 1234);
    camera.position.z = 3;

    // Create a WebGL renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        depth: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Add a cube to the scene
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshNormalMaterial();
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Enable XR
    renderer.xr.enabled = true;

    // Set near and far clipping planes for WebXR
    // renderer.xr.setSession = function (session) {
    //     session.updateRenderState({
    //         depthNear: 0.1234,
    //         depthFar: 1234,
    //         baseLayer: new XRWebGLLayer(session, renderer.getContext())
    //     });

    //     THREE.WebXRManager.prototype.setSession.call(this, session);
    // };

    // Start animation loop
    renderer.setAnimationLoop(animate);
}

/**
 * Animation loop for Three.js
 */
function animate() {
    // Rotate cube
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // Render scene
    renderer.render(scene, camera);
}

// Initialize when the document is loaded
window.addEventListener('DOMContentLoaded', init); 