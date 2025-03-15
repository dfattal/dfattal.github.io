import * as THREE from 'three';
import { computeVirtualDisplay } from './webXrUtils.js';

let camera, scene, renderer;
let cube;

init();
animate();

function init() {
    scene = new THREE.Scene();

    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 3); // Position at eye height

    // Create a simple cube
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1.5, -2); // Place it in front of the camera
    scene.add(cube);

    // Set up WebGL renderer with XR support
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Start XR session on click
    document.body.addEventListener('click', () => {
        navigator.xr.requestSession('immersive-vr').then((session) => {
            session.requestReferenceSpace('local').then((referenceSpace) => {
                renderer.xr.setReferenceSpaceType('local');
                renderer.xr.setSession(session);
            }).catch(() => {
                // Fallback to 'viewer' if 'local' is unsupported
                session.requestReferenceSpace('viewer').then((referenceSpace) => {
                    renderer.xr.setReferenceSpaceType('viewer');
                    renderer.xr.setSession(session);
                });
            });
        });
    });
}

function animate() {
    renderer.setAnimationLoop(() => {
        // Spin the cube
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.01;

        // Compute display pose and size
        const xrCam = renderer.xr.getCamera(camera);
        const referenceSpace = renderer.xr.getReferenceSpace();

        if (xrCam && referenceSpace) {
            const display = computeVirtualDisplay(xrCam, referenceSpace);

            console.log('Display Pose:', display.pose);
            console.log('Display Size:', display.size);
            if (display.isInfinite) {
                console.log('⚠️ Virtual display is at infinity!');
            }
        }

        renderer.render(scene, camera);
    });
}

// Handle resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});