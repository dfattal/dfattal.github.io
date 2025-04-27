// WebXR Texture Message Example
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Three.js globals
let scene, camera, renderer, cube;
let clock = new THREE.Clock();

/**
 * Initializes WebXR session with a spinning textured cube
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

    // Setup message button
    setupMessageButton();
}

/**
 * Initialize Three.js scene with a textured rotating cube
 */
function initThreeJS() {
    // Initialize clock for animations
    clock = new THREE.Clock();
    clock.start();

    // Create the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x505050);

    // Create a camera with specified near and far clipping planes
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.75;

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

    // Load crate texture
    const textureLoader = new THREE.TextureLoader();
    const crateTexture = textureLoader.load('https://threejs.org/examples/textures/crate.gif');

    // Create a cube with the crate texture
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshStandardMaterial({
        map: crateTexture,
        roughness: 0.7,
        metalness: 0.2
    });
    cube = new THREE.Mesh(geometry, material);
    cube.position.y = 1.75;
    cube.position.z = -2;
    scene.add(cube);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Add a point light that moves around
    const pointLight = new THREE.PointLight(0xffffff, 1, 10);
    pointLight.position.set(0, 2, 0);
    scene.add(pointLight);

    // Enable XR
    renderer.xr.enabled = true;

    // Start animation loop
    renderer.setAnimationLoop(animate);
}

/**
 * Setup message button handler
 */
function setupMessageButton() {
    const messageButton = document.getElementById('messageButton');
    const statusText = document.getElementById('status');

    if (messageButton) {
        messageButton.addEventListener('click', () => {
            // Display message sent status
            statusText.textContent = `Status: Message sent at ${new Date().toLocaleTimeString()}`;

            // You can add actual message sending logic here
            console.log("Texture message sent!");
        });
    }
}

/**
 * Calculate evolving background color
 */
function getEvolvingBackgroundColor() {
    const time = clock.getElapsedTime();

    // Use sine waves at different frequencies to create a smoothly evolving color
    const r = Math.sin(time * 0.3) * 0.5 + 0.5;
    const g = Math.sin(time * 0.5 + 1) * 0.5 + 0.5;
    const b = Math.sin(time * 0.7 + 2) * 0.5 + 0.5;

    return new THREE.Color(r, g, b);
}

/**
 * Animation loop for Three.js
 */
function animate() {
    // Update background color
    scene.background = getEvolvingBackgroundColor();

    // Rotate cube
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // Render scene
    renderer.render(scene, camera);
}

// Initialize when the document is loaded
window.addEventListener('DOMContentLoaded', init); 