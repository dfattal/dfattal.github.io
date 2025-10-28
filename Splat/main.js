import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SplatMesh, dyno } from '@sparkjsdev/spark';
import { CharacterControls } from './characterControls.js';
import { KeyDisplay } from './utils.js';
import { TouchControls } from './touchControls.js';

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
const splatScale = 1.0; // Scale factor for both collision mesh and Gaussian splat
let maxCharacterHeight = null; // Maximum height cap for character (2x terrain height)

// Lighting
let directionalLight = null; // Main directional light (sun)
let lightAzimuth = 213; // Light direction azimuth in degrees (0-360, 0=North, 90=East)
let lightElevation = 37; // Light elevation in degrees (0=horizon, 90=overhead)

// Leveling adjustments (applied LAST, after all other transforms)
let levelRotationX = 0; // Fine-tune X rotation in degrees (-5 to +5)
let levelRotationZ = 0; // Fine-tune Z rotation in degrees (-5 to +5)
let heightOffset = 0.60; // Vertical offset for terrain (how far below Y=0)

// Animation
const clock = new THREE.Clock();

// FPS tracking
let lastTime = performance.now();
let frameCount = 0;
let fps = 60;

// Magic effect animation timing variables
const animateT = dyno.dynoFloat(0);
let baseTime = 0;

// Mobile detection (do this FIRST before creating UI elements)
const isMobile = (function() {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const userAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const mobile = touch || userAgent;
    console.log('Mobile detection:', { touch, userAgent, isMobile: mobile });
    return mobile;
})();

// Keyboard state
const keysPressed = {};
const keyDisplayQueue = new KeyDisplay(isMobile);

// Touch controls
let touchControls = null;

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
        60,
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

    // Initialize touch controls for mobile
    if (isMobile) {
        touchControls = new TouchControls(keysPressed, orbitControls);
        console.log('Touch controls initialized early (before character load)');
    }

    console.log('Scene initialized');
}

/**
 * Set up scene lighting
 */
function setupLighting() {
    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    // Directional light (sun)
    directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 200;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Apply initial light orientation based on azimuth and elevation
    applyLightOrientation();
}

/**
 * Load the collision mesh from GLB file
 */
function createGround() {
    const loader = new GLTFLoader();

    loader.load(
        'models/StoneHenge-small-collision.glb',
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

            // Compute bounding box to get max height
            meshGeometry.computeBoundingBox();
            const bbox = meshGeometry.boundingBox;

            console.log('Collision mesh bounding box (local geometry space):');
            console.log('  min:', bbox.min);
            console.log('  max:', bbox.max);
            console.log('  Y range: min =', bbox.min.y.toFixed(4), ', max =', bbox.max.y.toFixed(4));
            console.log('  After 180° flip on X-axis, the lowest point will be at:', bbox.max.y.toFixed(4));

            groundMesh = new THREE.Mesh(meshGeometry, collisionMaterial);

            // Copy transform from the original mesh
            groundMesh.position.copy(collisionMesh.position);
            groundMesh.rotation.copy(collisionMesh.rotation);
            groundMesh.scale.copy(collisionMesh.scale);

            // Apply any transforms from parent nodes
            groundMesh.applyMatrix4(gltf.scene.matrix);

            // Scale the collision mesh
            groundMesh.scale.multiplyScalar(splatScale);

            // Flip the mesh upside down (rotate 180 degrees on X axis)
            groundMesh.rotation.x += Math.PI;

            // Translate down to align with infinite floor at Y=0 (do this AFTER scale and rotation)
            groundMesh.position.y = -splatScale * heightOffset;

            // Calculate max height after transforms (flipped: max becomes min, scaled)
            // When flipped upside down, the original bbox.max.y becomes the bottom
            // and bbox.min.y becomes the top (max height)
            const rawHeight = Math.abs(bbox.max.y - bbox.min.y);
            const maxTerrainHeight = rawHeight * splatScale;
            maxCharacterHeight = maxTerrainHeight * 2;

            console.log(`Terrain max height: ${maxTerrainHeight.toFixed(2)}, Character height cap: ${maxCharacterHeight.toFixed(2)}`);

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
            infiniteFloor.position.y = 0; // Ground level at Y=0
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
            console.log('Press G to toggle collision wireframe, H to toggle Gaussian splat, R to reset Magic effect, F to toggle infinite floor, L to toggle leveling controls');

            // Apply initial leveling rotations (will be 0,0 at start)
            applyLevelingRotations();

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
 * Apply leveling rotations and height offset to terrain meshes
 * This is called AFTER all base transforms (scale, flip, translate)
 * to fine-tune the horizontal level and vertical position of the terrain
 */
function applyLevelingRotations() {
    // Convert degrees to radians
    const levelXRad = levelRotationX * (Math.PI / 180);
    const levelZRad = levelRotationZ * (Math.PI / 180);

    // Calculate Y position from height offset
    const yPosition = -splatScale * heightOffset;

    // Apply to collision mesh (if loaded)
    if (groundMesh) {
        // Set Y position
        groundMesh.position.y = yPosition;

        // Reset to base rotation (180° flip on X)
        groundMesh.rotation.x = Math.PI;
        groundMesh.rotation.z = 0;

        // Apply leveling adjustments (LAST transform)
        groundMesh.rotation.x += levelXRad;
        groundMesh.rotation.z += levelZRad;
    }

    // Apply to Gaussian splat (if loaded)
    if (gaussianSplat) {
        // Set Y position
        gaussianSplat.position.y = yPosition;

        // Reset to base rotation (180° flip on X)
        gaussianSplat.rotation.x = Math.PI;
        gaussianSplat.rotation.z = 0;

        // Apply leveling adjustments (LAST transform)
        gaussianSplat.rotation.x += levelXRad;
        gaussianSplat.rotation.z += levelZRad;
    }

    // Apply to wireframe helper (if exists)
    if (wireframeHelper) {
        wireframeHelper.position.y = yPosition;
        wireframeHelper.rotation.x = Math.PI;
        wireframeHelper.rotation.z = 0;
        wireframeHelper.rotation.x += levelXRad;
        wireframeHelper.rotation.z += levelZRad;
    }

    console.log(`Leveling applied: X=${levelRotationX.toFixed(1)}°, Z=${levelRotationZ.toFixed(1)}°, Height=${heightOffset.toFixed(2)}`);
}

/**
 * Apply directional light orientation based on azimuth and elevation
 * Azimuth: 0° = North (+Z), 90° = East (+X), 180° = South (-Z), 270° = West (-X)
 * Elevation: 0° = horizon, 90° = overhead
 */
function applyLightOrientation() {
    if (!directionalLight) return;

    // Convert degrees to radians
    const azimuthRad = (lightAzimuth * Math.PI) / 180;
    const elevationRad = (lightElevation * Math.PI) / 180;

    // Light distance from origin (affects shadow quality, not shadow direction)
    const distance = 100;

    // Calculate light position from spherical coordinates
    // Azimuth is measured from +Z axis (North), rotating counter-clockwise when viewed from above
    const x = distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
    const y = distance * Math.sin(elevationRad);
    const z = distance * Math.cos(elevationRad) * Math.cos(azimuthRad);

    directionalLight.position.set(x, y, z);

    console.log(`Light orientation: Azimuth=${lightAzimuth}°, Elevation=${lightElevation}°, Position=(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
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
          float s = smoothstep(0., 2., t) * 2500.;
          vec3 scales = ${inputs.gsplat}.scales;
          vec3 localPos = ${inputs.gsplat}.center;
          float l = length(localPos.xz);

          // Magic Effect: Complex twister with noise and radial reveal (2500 unit radius in 2 seconds)
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
            url: 'models/StoneHenge.sog',
        });

        console.log('SplatMesh created, waiting for initialization...');

        // Wait for the splat to initialize
        await gaussianSplat.initialized;

        console.log('SplatMesh initialized successfully');

        // Apply same transformations as collision mesh
        // Scale to match collision mesh
        gaussianSplat.scale.multiplyScalar(splatScale);

        // Flip upside down (rotate 180 degrees on X axis) - matches collision mesh orientation
        gaussianSplat.rotation.x += Math.PI;

        // Translate down to align with infinite floor at Y=0 (do this AFTER scale and rotation)
        gaussianSplat.position.y = -splatScale * heightOffset;

        // Add to scene
        scene.add(gaussianSplat);

        // Apply leveling rotations to match collision mesh
        applyLevelingRotations();

        // Apply the Magic effect modifier (desktop only - too complex for mobile GPUs)
        if (!isMobile) {
            try {
                gaussianSplat.objectModifier = createMagicModifier();
                gaussianSplat.updateGenerator();

                // Reset time to start the animation
                baseTime = 0;
                animateT.value = 0;

                console.log('Gaussian splat loaded with Magic effect (desktop)');
            } catch (error) {
                console.error('Error applying Magic effect modifier:', error);
                console.log('Gaussian splat loaded without Magic effect (shader compilation failed)');
            }
        } else {
            console.log('Gaussian splat loaded without Magic effect (mobile - shader too complex)');
        }

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
                [groundMesh, infiniteFloor],
                maxCharacterHeight
            );

            // Place character on ground at spawn position
            characterControls.placeOnGround();

            // Start 50 units west (negative X), facing east (positive X direction)
            model.position.x = 0;
            model.position.z = 40;
            model.rotation.y = -0*Math.PI / 2;  // Rotate 90° to face east

            // Position camera behind character (west) facing east, level with character
            // Character faces east (+X), so camera should be west of character (-X)
            camera.position.set(
                model.position.x ,  // 5 units west (behind character)
                model.position.y + 2,  // Level with character (azimuth 0.5*pi)
                model.position.z + 5      // Same Z as character
            );

            // Update OrbitControls target to character position
            orbitControls.target.set(
                model.position.x,
                model.position.y + 2,
                model.position.z
            );
            orbitControls.update();

            console.log('Character loaded successfully at position:', model.position);
            console.log('Camera positioned at:', camera.position);
            console.log('Character facing east (rotation Y:', model.rotation.y, ')');
            console.log('Available animations:', Array.from(animationsMap.keys()));

            // Mobile-specific setup
            if (isMobile) {
                // Enable run mode by default on mobile
                characterControls.toggleRun = true;
                console.log('Mobile: run mode enabled by default');
            }
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

        // Toggle infinite floor on F
        if (key === 'f') {
            if (infiniteFloor) {
                infiniteFloor.visible = !infiniteFloor.visible;
                console.log(`Infinite floor: ${infiniteFloor.visible ? 'ON' : 'OFF'}`);
            }
        }

        // Toggle leveling controls on L
        if (key === 'l') {
            const levelingControls = document.getElementById('leveling-controls');
            if (levelingControls) {
                levelingControls.classList.toggle('visible');
                const isVisible = levelingControls.classList.contains('visible');
                console.log(`Leveling controls: ${isVisible ? 'ON' : 'OFF'}`);
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

    // Calculate FPS
    const currentTime = performance.now();
    frameCount++;
    if (currentTime >= lastTime + 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;

        // Update FPS display
        const debugFps = document.getElementById('debug-fps');
        if (debugFps) {
            debugFps.textContent = fps;
        }
    }

    // Update magic effect animation time (60 FPS)
    if (gaussianSplat) {
        baseTime += 1 / 60;
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
 * Set up leveling control sliders
 */
function setupLevelingControls() {
    // Get slider elements
    const xSlider = document.getElementById('level-x-slider');
    const zSlider = document.getElementById('level-z-slider');
    const heightSlider = document.getElementById('level-height-slider');
    const azimuthSlider = document.getElementById('light-azimuth-slider');
    const elevationSlider = document.getElementById('light-elevation-slider');
    const xValue = document.getElementById('level-x-value');
    const zValue = document.getElementById('level-z-value');
    const heightValue = document.getElementById('level-height-value');
    const azimuthValue = document.getElementById('light-azimuth-value');
    const elevationValue = document.getElementById('light-elevation-value');
    const resetButton = document.getElementById('leveling-reset');

    // X-axis slider handler
    if (xSlider) {
        xSlider.addEventListener('input', (e) => {
            levelRotationX = parseFloat(e.target.value);
            xValue.textContent = levelRotationX.toFixed(1) + '°';
            applyLevelingRotations();
        });
    }

    // Z-axis slider handler
    if (zSlider) {
        zSlider.addEventListener('input', (e) => {
            levelRotationZ = parseFloat(e.target.value);
            zValue.textContent = levelRotationZ.toFixed(1) + '°';
            applyLevelingRotations();
        });
    }

    // Height offset slider handler
    if (heightSlider) {
        heightSlider.addEventListener('input', (e) => {
            heightOffset = parseFloat(e.target.value);
            heightValue.textContent = heightOffset.toFixed(2);
            applyLevelingRotations();
        });
    }

    // Light azimuth slider handler
    if (azimuthSlider) {
        azimuthSlider.addEventListener('input', (e) => {
            lightAzimuth = parseFloat(e.target.value);
            azimuthValue.textContent = lightAzimuth.toFixed(0) + '°';
            applyLightOrientation();
        });
    }

    // Light elevation slider handler
    if (elevationSlider) {
        elevationSlider.addEventListener('input', (e) => {
            lightElevation = parseFloat(e.target.value);
            elevationValue.textContent = lightElevation.toFixed(0) + '°';
            applyLightOrientation();
        });
    }

    // Reset button handler
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            // Reset terrain leveling
            levelRotationX = 0;
            levelRotationZ = 0;
            heightOffset = 0.6;
            xSlider.value = 0;
            zSlider.value = 0;
            heightSlider.value = 0.6;
            xValue.textContent = '0.0°';
            zValue.textContent = '0.0°';
            heightValue.textContent = '0.60';

            // Reset light orientation
            lightAzimuth = 213;
            lightElevation = 37;
            azimuthSlider.value = 213;
            elevationSlider.value = 37;
            azimuthValue.textContent = '213°';
            elevationValue.textContent = '37°';

            applyLevelingRotations();
            applyLightOrientation();
            console.log('All controls reset to defaults');
        });
    }

    console.log('Leveling controls initialized');
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
    setupLevelingControls();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();

    console.log('F1000 initialized successfully');
}

// Start the application
init();
