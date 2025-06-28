// Three.js renderer
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
let cube, sphere, torus;
let localSpace, mySpace;
let orbitAngle = 0;
const orbitRadius = 5;
const orbitSpeed = 0.02;

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3);

    // Create renderer with WebXR support
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.getElementById('container').appendChild(renderer.domElement);

    // Add VR button
    document.body.appendChild(VRButton.createButton(renderer));

    // Create simple 3D geometry
    createGeometry();

    // Add lighting
    addLighting();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Handle XR session events
    renderer.xr.addEventListener('sessionstart', () => {
        console.log('XR Session started');
        setupOrbitingSpace();
    });

    renderer.xr.addEventListener('sessionend', () => {
        console.log('XR Session ended');
        localSpace = null;
        mySpace = null;
    });

    // Start render loop
    renderer.setAnimationLoop(animate);
}

function createGeometry() {
    // Create a colorful cube
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cubeMaterial = new THREE.MeshPhongMaterial({ color: 0xff6b6b });
    cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(-2, 0, 0);
    scene.add(cube);

    // Create a sphere
    const sphereGeometry = new THREE.SphereGeometry(0.8, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({ color: 0x4ecdc4 });
    sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(0, 0, 0);
    scene.add(sphere);

    // Create a torus
    const torusGeometry = new THREE.TorusGeometry(0.7, 0.3, 16, 100);
    const torusMaterial = new THREE.MeshPhongMaterial({ color: 0xffe66d });
    torus = new THREE.Mesh(torusGeometry, torusMaterial);
    torus.position.set(2, 0, 0);
    scene.add(torus);
}

function addLighting() {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);

    // Add point light for more dynamic lighting
    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);
}

function setupOrbitingSpace() {
    // Get the local reference space
    const session = renderer.xr.getSession();
    if (session) {
        session.requestReferenceSpace('local').then((referenceSpace) => {
            localSpace = referenceSpace;
            updateOrbitingSpace();
        });
    }
}

function updateOrbitingSpace() {
    if (!localSpace) return;

    // Calculate orbital position around (0,0,0)
    const x = orbitRadius * Math.sin(orbitAngle);
    const y = orbitRadius*Math.sin(2*orbitAngle); // Eye level height
    const z = orbitRadius * Math.cos(3*orbitAngle);

    // Calculate orientation to look at (0,0,0)
    const lookAtQuaternion = calculateLookAtQuaternion(x, y, z, 0, 0, 0);

    const transform = new XRRigidTransform(
        { x: x, y: y, z: z },
        { x: lookAtQuaternion.x, y: lookAtQuaternion.y, z: lookAtQuaternion.z, w: lookAtQuaternion.w }
    );
    mySpace = localSpace.getOffsetReferenceSpace(transform.inverse);

    // Set the renderer to use our custom orbiting space
    renderer.xr.setReferenceSpace(mySpace);

    // Update orbit angle for next frame
    orbitAngle += orbitSpeed;
}

function calculateLookAtQuaternion(eyeX, eyeY, eyeZ, targetX, targetY, targetZ) {
    // Use Three.js Camera for proper lookAt calculation (cameras default to looking down -Z)
    const tempCamera = new THREE.PerspectiveCamera();
    const eyePos = new THREE.Vector3(eyeX, eyeY, eyeZ);
    const targetPos = new THREE.Vector3(targetX, targetY, targetZ);

    // Position the camera at the eye position
    tempCamera.position.copy(eyePos);

    // Make it look at the target
    tempCamera.lookAt(targetPos);

    // Extract the quaternion
    const quaternion = tempCamera.quaternion;



    return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function animate() {
    // Animate the 3D objects
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    sphere.rotation.y += 0.02;

    torus.rotation.x += 0.01;
    torus.rotation.z += 0.02;

    // Update orbiting space if in VR
    if (renderer.xr.isPresenting) {
        updateOrbitingSpace();
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize the app
init();

