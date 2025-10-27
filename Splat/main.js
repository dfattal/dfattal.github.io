import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SplatMesh, dyno } from '@sparkjsdev/spark';
import { CharacterControls } from './characterControls.js';
import { KeyDisplay } from './utils.js';

/**
 * F1000 - Third Person Character Controller
 * Following the approach from threejs-character-controls-example
 */

// Scene, camera, renderer
let scene;
let camera;
let renderer;
let orbitControls;

// Character
let characterControls;

// Terrain
let groundMesh;
let infiniteFloor;
let gaussianSplat = null;

// Animation
const clock = new THREE.Clock();

// Magic effect animation timing variables
const animateT = dyno.dynoFloat(0);
let baseTime = 0;

// Keyboard state
const keysPressed = {};
const keyDisplayQueue = new KeyDisplay();

// Debug wireframe for terrain
let wireframeHelper = null;

/**
 * Initialize the Three.js scene
 */
function initScene() {
    // Create scene with light blue background
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa8def0);

    // Create camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    // Initial camera position (will be updated when character loads)
    camera.position.set(0, 5, 5);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Add lights
    setupLighting();

    // Set up orbit controls
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.minDistance = 1;
    orbitControls.maxDistance = 5;
    orbitControls.enablePan = false;
    orbitControls.maxPolarAngle = Math.PI * 0.55; // Allow looking up (85% toward straight up from below)
    orbitControls.update();

    console.log('Scene initialized');
}

/**
 * Set up scene lighting
 */
function setupLighting() {
    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    // Directional light (sun)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(-60, 100, -3);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 200;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
}

/**
 * Load the collision mesh from GLB file
 */
function createGround() {
    const loader = new GLTFLoader();

    loader.load(
        'models/arc-collision.glb',
        (gltf) => {
            // Extract the collision mesh from the loaded model
            let foundMesh = undefined;

            gltf.scene.traverse((child) => {
                if (child instanceof THREE.Mesh && !foundMesh) {
                    foundMesh = child;
                }
            });

            if (!foundMesh) {
                console.error('No mesh found in collision GLB file');
                return;
            }

            // Store mesh reference
            const collisionMesh = foundMesh;

            // Create a visible material for the collision mesh
            const collisionMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080,  // Gray color
                roughness: 0.8,
                metalness: 0.2,
                side: THREE.DoubleSide
            });

            // Create the ground mesh from the collision geometry
            const meshGeometry = collisionMesh.geometry;
            groundMesh = new THREE.Mesh(meshGeometry, collisionMaterial);

            // Copy transform from the original mesh
            groundMesh.position.copy(collisionMesh.position);
            groundMesh.rotation.copy(collisionMesh.rotation);
            groundMesh.scale.copy(collisionMesh.scale);

            // Apply any transforms from parent nodes
            groundMesh.applyMatrix4(gltf.scene.matrix);

            // Scale the collision mesh by 27.8
            groundMesh.scale.multiplyScalar(27.8);

            // Flip the mesh upside down (rotate 180 degrees on X axis)
            groundMesh.rotation.x += Math.PI;

            groundMesh.receiveShadow = true;
            groundMesh.castShadow = true;
            groundMesh.visible = false;  // Hide collision mesh, only show wireframe
            scene.add(groundMesh);

            // Create infinite floor plane at ground level (Y=0) with sand texture
            const infiniteFloorGeometry = new THREE.PlaneGeometry(10000, 10000);

            // Load sand textures
            const textureLoader = new THREE.TextureLoader();
            const sandColor = textureLoader.load('textures/sand/Sand 002_COLOR.jpg');
            const sandNormal = textureLoader.load('textures/sand/Sand 002_NRM.jpg');
            const sandDisplacement = textureLoader.load('textures/sand/Sand 002_DISP.jpg');
            const sandAO = textureLoader.load('textures/sand/Sand 002_OCC.jpg');

            // Configure texture tiling (repeat the texture to cover the large plane)
            const repeatCount = 1000; // Tile the texture 1000 times across the 10000 unit plane
            [sandColor, sandNormal, sandDisplacement, sandAO].forEach(texture => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(repeatCount, repeatCount);
            });

            const infiniteFloorMaterial = new THREE.MeshStandardMaterial({
                map: sandColor,
                normalMap: sandNormal,
                displacementMap: sandDisplacement,
                displacementScale: 0, // No actual displacement on the flat plane
                aoMap: sandAO,
                aoMapIntensity: 1.0,
                roughness: 0.9,
                metalness: 0.0,
                side: THREE.DoubleSide
            });

            infiniteFloor = new THREE.Mesh(infiniteFloorGeometry, infiniteFloorMaterial);
            infiniteFloor.rotation.x = -Math.PI / 2; // Make horizontal
            infiniteFloor.position.y = 0; // At ground level (may overlap with collision mesh)
            infiniteFloor.receiveShadow = true;
            scene.add(infiniteFloor);

            // Create wireframe helper (hidden by default)
            const wireframeGeometry = new THREE.WireframeGeometry(meshGeometry);
            const wireframeMaterial = new THREE.LineBasicMaterial({
                color: 0x00ff00,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
            });
            wireframeHelper = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);

            // Copy transform to wireframe (including the flip)
            wireframeHelper.position.copy(groundMesh.position);
            wireframeHelper.rotation.copy(groundMesh.rotation);
            wireframeHelper.scale.copy(groundMesh.scale);

            wireframeHelper.visible = false;
            scene.add(wireframeHelper);

            console.log('Collision mesh loaded successfully (invisible, use for physics only)');
            console.log('Press G to toggle collision wireframe, H to toggle Gaussian splat, R to reset Magic effect');

            // Load Gaussian splat and character in parallel
            loadGaussianSplat();
            loadCharacter();
        },
        (xhr) => {
            console.log('Collision mesh: ' + (xhr.loaded / xhr.total) * 100 + '% loaded');
        },
        (error) => {
            console.error('Error loading collision mesh:', error);
        }
    );
}

/**
 * Create the Magic reveal effect modifier
 */
function createMagicModifier() {
  return dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, t: "float" },
        outTypes: { gsplat: dyno.Gsplat },

        // Define utility functions in GLSL
        globals: () => [
          dyno.unindent(`
            // Pseudo-random hash function for noise generation
            vec3 hash(vec3 p) {
              p = fract(p * 0.3183099 + 0.1);
              p *= 17.0;
              return fract(vec3(p.x * p.y * p.z, p.x + p.y * p.z, p.x * p.y + p.z));
            }

            // 3D Perlin-style noise function
            vec3 noise(vec3 p) {
              vec3 i = floor(p);
              vec3 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);

              vec3 n000 = hash(i + vec3(0,0,0));
              vec3 n100 = hash(i + vec3(1,0,0));
              vec3 n010 = hash(i + vec3(0,1,0));
              vec3 n110 = hash(i + vec3(1,1,0));
              vec3 n001 = hash(i + vec3(0,0,1));
              vec3 n101 = hash(i + vec3(1,0,1));
              vec3 n011 = hash(i + vec3(0,1,1));
              vec3 n111 = hash(i + vec3(1,1,1));

              vec3 x0 = mix(n000, n100, f.x);
              vec3 x1 = mix(n010, n110, f.x);
              vec3 x2 = mix(n001, n101, f.x);
              vec3 x3 = mix(n011, n111, f.x);

              vec3 y0 = mix(x0, x1, f.y);
              vec3 y1 = mix(x2, x3, f.y);

              return mix(y0, y1, f.z);
            }
          `)
        ],

        // Main effect shader logic
        statements: ({ inputs, outputs }) => dyno.unindentLines(`
          ${outputs.gsplat} = ${inputs.gsplat};
          float t = ${inputs.t};
          float s = smoothstep(0.,10.,t-4.5)*10.;
          vec3 scales = ${inputs.gsplat}.scales;
          vec3 localPos = ${inputs.gsplat}.center;
          float l = length(localPos.xz);

          // Magic Effect: Complex twister with noise and radial reveal
          float border = abs(s-l-.5);
          localPos *= 1.-.2*exp(-20.*border);
          vec3 finalScales = mix(scales,vec3(0.002),smoothstep(s-.5,s,l+.5));
          ${outputs.gsplat}.center = localPos + .1*noise(localPos.xyz*2.+t*.5)*smoothstep(s-.5,s,l+.5);
          ${outputs.gsplat}.scales = finalScales;
          float at = atan(localPos.x,localPos.z)/3.1416;
          ${outputs.gsplat}.rgba *= step(at,t-3.1416);
          ${outputs.gsplat}.rgba += exp(-20.*border) + exp(-50.*abs(t-at-3.1416))*.5;
        `),
      });

      gsplat = d.apply({
        gsplat,
        t: animateT
      }).gsplat;

      return { gsplat };
    }
  );
}

/**
 * Load the Gaussian splat visualization
 */
async function loadGaussianSplat() {
    console.log('Loading Gaussian splat...');

    try {
        // Create SplatMesh from PLY file
        gaussianSplat = new SplatMesh({
            url: 'models/Arc-clean.ply',
        });

        console.log('SplatMesh created, waiting for initialization...');

        // Wait for the splat to initialize
        await gaussianSplat.initialized;

        console.log('SplatMesh initialized successfully');

        // Apply same transformations as collision mesh
        // Scale by 27.8
        gaussianSplat.scale.multiplyScalar(27.8);

        // Flip upside down (rotate 180 degrees on X axis) - matches collision mesh orientation
        gaussianSplat.rotation.x += Math.PI;

        // Add to scene
        scene.add(gaussianSplat);

        // Apply the Magic effect modifier
        gaussianSplat.objectModifier = createMagicModifier();
        gaussianSplat.updateGenerator();

        // Reset time to start the animation
        baseTime = 0;
        animateT.value = 0;

        console.log('Gaussian splat loaded and added to scene with Magic effect');

    } catch (error) {
        console.error('Error loading Gaussian splat:', error);
    }
}

/**
 * Load the character model
 */
function loadCharacter() {
    const loader = new GLTFLoader();

    loader.load(
        'models/Soldier.glb',
        (gltf) => {
            const model = gltf.scene;
            model.traverse((object) => {
                if (object.isMesh) {
                    object.castShadow = true;
                }
            });
            scene.add(model);

            // Get animations
            const gltfAnimations = gltf.animations;
            const mixer = new THREE.AnimationMixer(model);
            const animationsMap = new Map();

            gltfAnimations
                .filter(a => a.name !== 'TPose')
                .forEach((a) => {
                    animationsMap.set(a.name, mixer.clipAction(a));
                });

            // Initialize character controls with ground meshes for collision detection
            // Pass both the collision mesh and infinite floor
            characterControls = new CharacterControls(
                model,
                mixer,
                animationsMap,
                orbitControls,
                camera,
                'Idle',
                [groundMesh, infiniteFloor]
            );

            // Place character on ground at spawn position
            characterControls.placeOnGround();

            // Start 50 units west (negative X), facing east (positive X direction)
            model.position.x = -50;
            model.rotation.y = -Math.PI / 2;  // Rotate 90° to face east

            // Position camera behind character (west) facing east, level with character
            // Character faces east (+X), so camera should be west of character (-X)
            camera.position.set(
                model.position.x - 5,  // 5 units west (behind character)
                model.position.y + 1,  // Level with character (azimuth 0.5*pi)
                model.position.z       // Same Z as character
            );

            // Update OrbitControls target to character position
            orbitControls.target.set(
                model.position.x,
                model.position.y + 1,
                model.position.z
            );
            orbitControls.update();

            console.log('Character loaded successfully at position:', model.position);
            console.log('Camera positioned at:', camera.position);
            console.log('Character facing east (rotation Y:', model.rotation.y, ')');
            console.log('Available animations:', Array.from(animationsMap.keys()));
        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
        },
        (error) => {
            console.error('Error loading character:', error);
        }
    );
}

/**
 * Set up keyboard event listeners
 */
function setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();

        // Update key state
        keysPressed[key] = true;
        keyDisplayQueue.down(key);

        // Toggle run on Shift
        if (key === 'shift') {
            if (characterControls) {
                characterControls.switchRunToggle();
            }
        }

        // Toggle wireframe on G
        if (key === 'g') {
            if (wireframeHelper) {
                wireframeHelper.visible = !wireframeHelper.visible;
                console.log(`Collision mesh wireframe: ${wireframeHelper.visible ? 'ON' : 'OFF'}`);
            }
        }

        // Toggle Gaussian splat on H
        if (key === 'h') {
            if (gaussianSplat) {
                gaussianSplat.visible = !gaussianSplat.visible;
                console.log(`Gaussian splat: ${gaussianSplat.visible ? 'ON' : 'OFF'}`);
            }
        }

        // Reset Magic effect on R
        if (key === 'r') {
            if (gaussianSplat) {
                baseTime = 0;
                animateT.value = 0;
                console.log('Magic effect reset');
            }
        }
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        keysPressed[key] = false;
        keyDisplayQueue.up(key);
    });

    console.log('Keyboard controls initialized');
}

/**
 * Handle window resize
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    keyDisplayQueue.updatePosition();
}

/**
 * Main animation loop
 */
function animate() {
    const delta = clock.getDelta();

    // Update magic effect animation time (60 FPS)
    if (gaussianSplat) {
        baseTime += 1/60;
        animateT.value = baseTime;
        gaussianSplat.updateVersion();
    }

    // Update character controls
    if (characterControls) {
        characterControls.update(delta, keysPressed);

        // Update debug display
        const debugState = document.getElementById('debug-state');
        const debugAnimation = document.getElementById('debug-animation');
        const debugJetpack = document.getElementById('debug-jetpack');
        const debugGroundDist = document.getElementById('debug-ground-dist');

        if (debugState && debugAnimation && debugJetpack && debugGroundDist) {
            const isGrounded = characterControls.getGroundedState();
            const currentAction = characterControls.getCurrentAction();
            const isJetpackActive = characterControls.getJetpackActive();
            const groundDistance = characterControls.getGroundDistance();

            debugState.textContent = isGrounded ? 'GROUNDED' : 'IN AIR';
            debugState.className = isGrounded ? 'grounded' : 'in-air';
            debugAnimation.textContent = currentAction;
            debugJetpack.textContent = isJetpackActive ? 'ACTIVE' : 'OFF';
            debugJetpack.className = isJetpackActive ? 'jetpack-active' : '';
            debugGroundDist.textContent = groundDistance.toFixed(1) + 'm';
        }
    }

    // Update orbit controls
    orbitControls.update();

    // Render scene
    renderer.render(scene, camera);

    requestAnimationFrame(animate);
}

/**
 * Initialize the application
 */
function init() {
    console.log('Initializing F1000...');

    // Set up scene
    initScene();

    // Load ground (which will load character after completion)
    createGround();

    // Set up controls
    setupKeyboardControls();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();

    console.log('F1000 initialized successfully');
}

// Start the application
init();
