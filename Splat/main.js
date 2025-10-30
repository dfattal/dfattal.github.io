import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SplatMesh, dyno } from '@sparkjsdev/spark';
import { CharacterControls } from './characterControls.js';
import { KeyDisplay } from './utils.js';
import { TouchControls } from './touchControls.js';
import { loadScenesManifest, loadSceneConfig, getAvailableScenes, getDefaultScene, getSceneConfigPath } from './sceneLoader.js';
import { AudioManager } from './audioManager.js';
import { XRManager } from './xrManager.js';
import { XRControllers } from './xrControllers.js';
import { XRHands } from './xrHands.js';

/**
 * F1000 - Third Person Character Controller
 * Following the approach from threejs-character-controls-example
 */

// Scene configuration
let scenesManifest = null;   // Loaded scenes manifest
let sceneConfig = null;       // Currently loaded scene configuration
let currentSceneId = null;    // Current scene ID

// Scene, camera, renderer
let scene;
let camera;
let renderer;
let orbitControls;

// Character
let characterControls;

// Audio
let audioManager;

// WebXR
let xrManager = null;
let xrControllers = null;
let xrHands = null;

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
const isMobile = (function () {
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

// Camera mode and first-person controls
let cameraMode = 'third-person'; // 'third-person' or 'first-person'
let firstPersonPitch = 0; // Camera pitch rotation (X-axis) in radians
let firstPersonYaw = 0;   // Camera yaw rotation (Y-axis) in radians
let isPointerLocked = false; // Track pointer lock state

// First-person camera constants
const FIRST_PERSON_MOUSE_SENSITIVITY = 0.002; // Mouse movement sensitivity
const FIRST_PERSON_TOUCH_SENSITIVITY = 0.005; // Touch movement sensitivity for mobile
const FIRST_PERSON_MAX_PITCH = Math.PI / 2 - 0.1; // ±85 degrees vertical look limit (in radians)

// Camera transition state
let isCameraTransitioning = false;
let cameraTransitionProgress = 0;
const CAMERA_TRANSITION_DURATION = 0.5; // seconds
let transitionStartPos = new THREE.Vector3();
let transitionTargetPos = new THREE.Vector3();
let transitionStartQuat = new THREE.Quaternion();
let transitionTargetQuat = new THREE.Quaternion();
let targetCameraMode = 'third-person';
let postTransitionLogTimer = 0; // Log for 0.2s after transition
const POST_TRANSITION_LOG_DURATION = 0.2;

// Magic reveal state
let magicRevealStarted = false;
let experienceStarted = false; // Flag to prevent rendering before user clicks start

// Loading state tracking (for mobile compatibility)
let collisionLoaded = false;
let splatLoaded = false;
let loadingTimeout = null;

// Debug wireframe for terrain
let wireframeHelper = null;

/**
 * Initialize the Three.js scene
 */
function initScene() {
    // Create scene with background color from config
    scene = new THREE.Scene();
    const bgColor = sceneConfig?.scene?.backgroundColor || '#a8def0';
    scene.background = new THREE.Color(bgColor);

    // Create camera with config values
    const camCfg = sceneConfig?.camera || {};
    camera = new THREE.PerspectiveCamera(
        camCfg.fov || 60,
        window.innerWidth / window.innerHeight,
        camCfg.near || 0.1,
        camCfg.far || 1000
    );
    // Temporary camera position (will be properly positioned behind character when loaded)
    camera.position.set(0, 5, 10);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Add lights
    setupLighting();

    // Set up orbit controls with config values
    const orbitCfg = sceneConfig?.camera?.orbitControls || {};
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = orbitCfg.enableDamping !== undefined ? orbitCfg.enableDamping : true;
    orbitControls.minDistance = orbitCfg.minDistance || 1;
    orbitControls.maxDistance = orbitCfg.maxDistance || 5;
    orbitControls.enablePan = orbitCfg.enablePan !== undefined ? orbitCfg.enablePan : false;
    orbitControls.maxPolarAngle = Math.PI * (orbitCfg.maxPolarAngle || 0.55);
    orbitControls.update();

    // Initialize touch controls for mobile
    if (isMobile) {
        touchControls = new TouchControls(keysPressed, orbitControls);
        // Set up first-person look callback for mobile
        touchControls.setFirstPersonCallback(onTouchLook);
        console.log('Touch controls initialized early (before character load)');
    }

    console.log('Scene initialized');
}

/**
 * Set up scene lighting
 */
function setupLighting() {
    // Ambient light from config
    const ambientCfg = sceneConfig?.lighting?.ambient || {};
    scene.add(new THREE.AmbientLight(
        ambientCfg.color || 0xffffff,
        ambientCfg.intensity !== undefined ? ambientCfg.intensity : 0.7
    ));

    // Directional light (sun) from config
    const dirCfg = sceneConfig?.lighting?.directional || {};
    directionalLight = new THREE.DirectionalLight(
        dirCfg.color || 0xffffff,
        dirCfg.intensity !== undefined ? dirCfg.intensity : 1.0
    );
    directionalLight.castShadow = dirCfg.castShadow !== undefined ? dirCfg.castShadow : true;

    // Shadow camera settings from config
    const shadowCam = dirCfg.shadowCamera || {};
    directionalLight.shadow.camera.top = shadowCam.top || 50;
    directionalLight.shadow.camera.bottom = shadowCam.bottom || -50;
    directionalLight.shadow.camera.left = shadowCam.left || -50;
    directionalLight.shadow.camera.right = shadowCam.right || 50;
    directionalLight.shadow.camera.near = shadowCam.near || 0.1;
    directionalLight.shadow.camera.far = shadowCam.far || 200;

    // Shadow map size from config (can be a number or object)
    const shadowMapSizeCfg = dirCfg.shadowMapSize;
    const shadowMapSize = typeof shadowMapSizeCfg === 'number' ? shadowMapSizeCfg : 2048;
    const shadowWidth = shadowMapSizeCfg?.width || shadowMapSize;
    const shadowHeight = shadowMapSizeCfg?.height || shadowMapSize;
    directionalLight.shadow.mapSize.width = shadowWidth;
    directionalLight.shadow.mapSize.height = shadowHeight;

    scene.add(directionalLight);

    // Apply initial light orientation based on azimuth and elevation
    applyLightOrientation();
}

/**
 * Load the collision mesh from GLB file
 */
function createGround() {
    const loader = new GLTFLoader();

    // Load collision mesh from config
    const collisionPath = sceneConfig?.assets?.collisionFile || 'models/StoneHenge-collision.glb';

    loader.load(
        collisionPath,
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

            // Load sand textures from config
            const textureLoader = new THREE.TextureLoader();
            const floorTexCfg = sceneConfig?.assets?.textures?.floor || {};
            const sandColor = textureLoader.load(floorTexCfg.color || 'textures/sand/Sand 002_COLOR.jpg');
            const sandNormal = textureLoader.load(floorTexCfg.normal || 'textures/sand/Sand 002_NRM.jpg');
            const sandDisplacement = textureLoader.load(floorTexCfg.displacement || 'textures/sand/Sand 002_DISP.jpg');
            const sandAO = textureLoader.load(floorTexCfg.ao || 'textures/sand/Sand 002_OCC.jpg');

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
            console.log('Press M to toggle background music, N to toggle movement sounds');

            // Apply initial leveling rotations (will be 0,0 at start)
            applyLevelingRotations();

            // Mark collision mesh as loaded
            collisionLoaded = true;

            // Set progress bars to 100% for visual feedback
            const progressBar = document.getElementById('collision-progress-bar');
            const progressText = document.getElementById('collision-progress-text');
            const startProgressBar = document.getElementById('start-collision-bar');
            const startProgressText = document.getElementById('start-collision-text');

            if (progressBar && progressText) {
                progressBar.style.width = '100%';
                progressText.textContent = '100%';
            }

            if (startProgressBar && startProgressText) {
                startProgressBar.style.width = '100%';
                startProgressText.textContent = '100%';
            }

            checkAllLoaded();

            // Load Gaussian splat and character in parallel
            loadGaussianSplat();
            loadCharacter();
        },
        (xhr) => {
            // Calculate progress with bounds checking (fixes 168% bug on mobile)
            // Handle case where xhr.total is 0 or undefined (mobile networks sometimes don't send Content-Length)
            const percent = xhr.total > 0
                ? Math.min(100, Math.round((xhr.loaded / xhr.total) * 100))
                : 0;

            console.log('Collision mesh: ' + percent + '% loaded');

            // Update progress bars (both old and new for compatibility)
            const progressBar = document.getElementById('collision-progress-bar');
            const progressText = document.getElementById('collision-progress-text');
            const startProgressBar = document.getElementById('start-collision-bar');
            const startProgressText = document.getElementById('start-collision-text');

            if (progressBar && progressText) {
                progressBar.style.width = percent + '%';
                progressText.textContent = percent + '%';
            }

            if (startProgressBar && startProgressText) {
                startProgressBar.style.width = percent + '%';
                startProgressText.textContent = percent + '%';
            }

            // Don't rely on percent === 100 check (unreliable on mobile)
            // Instead, set flag in the onLoad callback
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
    // Get Magic effect settings from config
    const magicCfg = sceneConfig?.scene?.magicEffect || {};
    const expansionRadius = magicCfg.expansionRadius || 2500;
    const duration = magicCfg.duration || 2.0;

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
          float s = smoothstep(0., ${duration.toFixed(1)}, t) * ${expansionRadius.toFixed(1)};
          vec3 scales = ${inputs.gsplat}.scales;
          vec3 localPos = ${inputs.gsplat}.center;
          float l = length(localPos.xz);

          // Magic Effect: Complex twister with noise and radial reveal (${expansionRadius} unit radius in ${duration} seconds)
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
        // Update progress bars to show loading started (both old and new for compatibility)
        const progressBar = document.getElementById('splat-progress-bar');
        const progressText = document.getElementById('splat-progress-text');
        const startProgressBar = document.getElementById('start-splat-bar');
        const startProgressText = document.getElementById('start-splat-text');

        if (progressBar && progressText) {
            progressBar.style.width = '10%';
            progressText.textContent = '10%';
        }
        if (startProgressBar && startProgressText) {
            startProgressBar.style.width = '10%';
            startProgressText.textContent = '10%';
        }

        // Load splat file from config
        const splatPath = sceneConfig?.assets?.splatFile || 'models/StoneHenge.sog';

        // Create SplatMesh from file
        gaussianSplat = new SplatMesh({
            url: splatPath,
        });

        console.log('SplatMesh created, waiting for initialization...');

        // Update progress to show download in progress
        if (progressBar && progressText) {
            progressBar.style.width = '50%';
            progressText.textContent = '50%';
        }
        if (startProgressBar && startProgressText) {
            startProgressBar.style.width = '50%';
            startProgressText.textContent = '50%';
        }

        // Wait for the splat to initialize
        await gaussianSplat.initialized;

        console.log('SplatMesh initialized successfully');

        // Update progress to 100%
        if (progressBar && progressText) {
            progressBar.style.width = '100%';
            progressText.textContent = '100%';
        }
        if (startProgressBar && startProgressText) {
            startProgressBar.style.width = '100%';
            startProgressText.textContent = '100%';
        }

        // Apply same transformations as collision mesh
        // Scale to match collision mesh
        gaussianSplat.scale.multiplyScalar(splatScale);

        // Flip upside down (rotate 180 degrees on X axis) - matches collision mesh orientation
        gaussianSplat.rotation.x += Math.PI;

        // Translate down to align with infinite floor at Y=0 (do this AFTER scale and rotation)
        gaussianSplat.position.y = -splatScale * heightOffset;

        // Add to scene
        scene.add(gaussianSplat);

        // Hide the splat initially (will show when experience starts)
        gaussianSplat.visible = false;

        // Apply leveling rotations to match collision mesh
        applyLevelingRotations();

        // Mark splat as loaded
        splatLoaded = true;

        // Apply the Magic effect modifier
        // Check config for mobile support (default: desktop only - too complex for mobile GPUs)
        const magicCfg = sceneConfig?.scene?.magicEffect || {};
        const shouldEnableEffect = magicCfg.enabled !== false &&
            (!isMobile || magicCfg.mobileEnabled === true);

        console.log('Magic effect config check:', {
            enabled: magicCfg.enabled,
            mobileEnabled: magicCfg.mobileEnabled,
            isMobile: isMobile,
            shouldEnableEffect: shouldEnableEffect
        });

        if (shouldEnableEffect) {
            try {
                gaussianSplat.objectModifier = createMagicModifier();
                gaussianSplat.updateGenerator();

                // NOTE: Animation and sound are now triggered by start button click
                // Don't auto-start the animation here - wait for user interaction
                // baseTime = 0;
                // animateT.value = 0;

                const platform = isMobile ? 'mobile' : 'desktop';
                console.log(`Gaussian splat loaded with Magic effect (${platform}) - awaiting user interaction`);
                console.log('Magic effect modifier attached:', !!gaussianSplat.objectModifier);
            } catch (error) {
                console.error('Error applying Magic effect modifier:', error);
                console.log('Gaussian splat loaded without Magic effect (shader compilation failed)');
            }
        } else {
            const reason = isMobile ? 'mobile not enabled in config' : 'disabled in config';
            console.log(`Gaussian splat loaded without Magic effect (${reason})`);
        }

        // Check if all assets are loaded
        checkAllLoaded();

    } catch (error) {
        console.error('Error loading Gaussian splat:', error);
    }
}

/**
 * Check if all assets are loaded and show start button
 * Uses boolean flags instead of string comparison for mobile compatibility
 */
function checkAllLoaded() {
    const loadingBars = document.getElementById('start-loading-bars');
    const startButton = document.getElementById('start-button');

    if (loadingBars && startButton) {
        // Use boolean flags instead of fragile string comparison
        // This fixes the mobile bug where progress can be unreliable
        if (collisionLoaded && splatLoaded) {
            // Clear any existing timeout
            if (loadingTimeout) {
                clearTimeout(loadingTimeout);
                loadingTimeout = null;
            }

            // Add a small delay before showing button to ensure user sees 100%
            setTimeout(() => {
                // Hide loading bars
                loadingBars.style.display = 'none';

                // Show start button
                startButton.style.display = 'inline-block';

                console.log('Assets loaded, start button shown');
            }, 500);
        } else {
            // Set a timeout fallback in case progress tracking fails on mobile
            // If button hasn't shown after 10 seconds, show it anyway
            if (!loadingTimeout) {
                loadingTimeout = setTimeout(() => {
                    console.warn('Loading timeout reached - showing start button as fallback');
                    loadingBars.style.display = 'none';
                    startButton.style.display = 'inline-block';
                }, 10000);
            }
        }
    }
}

/**
 * Start the magic reveal animation and audio
 * Triggered by user clicking the start button
 */
function startMagicReveal() {
    // Prevent multiple triggers
    if (magicRevealStarted) {
        console.log('Magic reveal already started');
        return;
    }

    magicRevealStarted = true;

    // Show the Gaussian splat (was hidden until user interaction)
    if (gaussianSplat) {
        gaussianSplat.visible = true;
    }

    // Reset and start animation (only if splat exists and has the modifier)
    if (gaussianSplat && gaussianSplat.objectModifier) {
        baseTime = 0;
        animateT.value = 0;
        console.log('Magic reveal animation started by user interaction');
    } else {
        console.log('Gaussian splat not ready for animation, skipping magic effect');
    }

    // Start background music
    if (audioManager) {
        audioManager.startBackgroundMusic();
        console.log('Background music started');
    }

    // Play magic reveal sound with delay from config
    if (audioManager) {
        const magicCfg = sceneConfig?.scene?.magicEffect || {};
        const soundDelay = magicCfg.soundDelay || 0;
        audioManager.playMagicReveal(soundDelay);
        console.log(`Magic reveal sound will play in ${soundDelay}s`);
    }
}

/**
 * Load the character model
 */
function loadCharacter() {
    const loader = new GLTFLoader();

    // Load character model from config
    const characterPath = sceneConfig?.assets?.characterFile || 'models/Soldier.glb';

    loader.load(
        characterPath,
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
                .forEach((a) => {
                    animationsMap.set(a.name, mixer.clipAction(a));
                });

            // Jetpack audio is now configured in AudioManager during initAudio()

            // Get camera offsets from config before initializing CharacterControls
            const camOffset = sceneConfig?.camera?.offsetFromCharacter || { x: 0, y: 2, z: 5 };
            const targetOffsetY = sceneConfig?.camera?.targetOffset?.y || 1;

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
                maxCharacterHeight,
                targetOffsetY
            );

            // Place character on ground at spawn position
            characterControls.placeOnGround();

            // Get spawn position and rotation from config
            const spawnCfg = sceneConfig?.character?.spawn || {};
            const spawnPos = spawnCfg.position || { x: 0, y: 'auto', z: 40 };
            const spawnRot = spawnCfg.rotation || { y: 0 };

            // Set character position (Y is handled by placeOnGround)
            model.position.x = spawnPos.x;
            model.position.z = spawnPos.z;
            model.rotation.y = spawnRot.y * (Math.PI / 180);  // Convert degrees to radians

            // Create offset vector in local space and rotate it by character's quaternion
            const localOffset = new THREE.Vector3(camOffset.x, camOffset.y, camOffset.z);
            const worldOffset = localOffset.clone().applyQuaternion(model.quaternion);

            camera.position.set(
                model.position.x + worldOffset.x,
                model.position.y + worldOffset.y,
                model.position.z + worldOffset.z
            );

            // Update OrbitControls target to character center (with vertical offset in local space)
            const localTargetOffset = new THREE.Vector3(0, targetOffsetY, 0);
            const worldTargetOffset = localTargetOffset.clone().applyQuaternion(model.quaternion);
            orbitControls.target.set(
                model.position.x + worldTargetOffset.x,
                model.position.y + worldTargetOffset.y,
                model.position.z + worldTargetOffset.z
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

            // Initialize WebXR after character is loaded
            initXR();
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
 * Initialize WebXR system
 */
function initXR() {
    // Create XR manager
    xrManager = new XRManager(renderer, camera, scene, sceneConfig);

    // Create XR controllers
    xrControllers = new XRControllers(renderer, scene, xrManager);
    xrControllers.setGroundMeshes([groundMesh, infiniteFloor]);

    // Create XR hands
    xrHands = new XRHands(renderer, scene, characterControls?.model);

    // Link components together
    xrManager.characterControls = characterControls;
    xrManager.orbitControls = orbitControls;
    xrManager.xrControllers = xrControllers;
    xrManager.xrHands = xrHands;

    console.log('WebXR system initialized');
}

/**
 * Initialize audio manager
 */
function initAudio() {
    // Get jetpack sound path from config
    const jetpackPath = sceneConfig?.assets?.audio?.jetpack || 'sounds/thrusters_loopwav-14699.mp3';

    // Initialize AudioManager with sound paths and mobile flag
    audioManager = new AudioManager({
        backgroundMusic: 'sounds/happy-relaxing-loop-275536.mp3',
        walkingSound: 'sounds/walking-on-gravel-version-2-308744.mp3',
        runningSound: 'sounds/running-on-gravel-301880.mp3',
        jetpackSound: jetpackPath,
        magicReveal: 'sounds/a-magical-intro-395716.mp3'
    }, isMobile);  // Pass mobile flag

    // Audio will be started by start button click (guaranteed user interaction)
    console.log('Audio system initialized - will start on user clicking start button');
}

/**
 * Update camera toggle button icon based on current mode
 */
function updateCameraButtonIcon() {
    const icon3rd = document.getElementById('camera-icon-3rd');
    const icon1st = document.getElementById('camera-icon-1st');

    if (cameraMode === 'first-person') {
        // Show eye icon (first-person)
        if (icon3rd) icon3rd.style.display = 'none';
        if (icon1st) icon1st.style.display = 'block';
    } else {
        // Show camera icon (third-person)
        if (icon3rd) icon3rd.style.display = 'block';
        if (icon1st) icon1st.style.display = 'none';
    }
}

/**
 * Toggle between first-person and third-person camera modes
 */
function toggleCameraMode() {
    if (!characterControls) {
        console.log('Character not loaded yet');
        return;
    }

    // Don't allow toggling during an active transition
    if (isCameraTransitioning) {
        return;
    }

    if (cameraMode === 'third-person') {
        // Prepare transition to first-person mode
        const model = characterControls.model;

        // Extract character's current facing direction from quaternion
        const euler = new THREE.Euler();
        euler.setFromQuaternion(model.quaternion, 'YXZ');
        firstPersonYaw = euler.y;
        firstPersonPitch = 0;

        // Store current camera state as start
        transitionStartPos.copy(camera.position);
        transitionStartQuat.copy(camera.quaternion);

        // Calculate target position (first-person at head/eye level)
        transitionTargetPos.set(
            model.position.x,
            model.position.y + characterControls.firstPersonHeadHeight,
            model.position.z
        );

        // Calculate target rotation (first-person looking forward)
        camera.rotation.order = 'YXZ';
        const tempEuler = new THREE.Euler(firstPersonPitch, firstPersonYaw, 0, 'YXZ');
        transitionTargetQuat.setFromEuler(tempEuler);

        // Start transition
        isCameraTransitioning = true;
        cameraTransitionProgress = 0;
        targetCameraMode = 'first-person';

        console.log('Starting transition to first-person mode');
    } else {
        // Prepare transition to third-person mode
        const model = characterControls.model;
        if (model) {
            // Get camera offset from config
            const camOffset = sceneConfig?.camera?.offsetFromCharacter || { x: 0, y: 2, z: 5 };
            const targetOffsetY = sceneConfig?.camera?.targetOffset?.y || 1;

            // Use current first-person camera direction as character's forward direction
            const characterForwardAngle = firstPersonYaw;

            // Update character rotation using quaternion
            const targetQuaternion = new THREE.Quaternion();
            targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), characterForwardAngle);
            model.quaternion.copy(targetQuaternion);

            // Calculate target position behind character
            const localOffset = new THREE.Vector3(camOffset.x, camOffset.y, camOffset.z);
            const worldOffset = localOffset.clone().applyQuaternion(model.quaternion);

            // Store CURRENT camera state as start (position AND quaternion)
            transitionStartPos.copy(camera.position);
            transitionStartQuat.copy(camera.quaternion);

            // Calculate target position - EXACT same logic as initial spawn
            transitionTargetPos.set(
                model.position.x + worldOffset.x,
                model.position.y + worldOffset.y,
                model.position.z + worldOffset.z
            );

            // Set OrbitControls target - EXACT same as initial spawn (in local space)
            // This will be used during the transition to continuously update camera lookAt
            const localTargetOffset2 = new THREE.Vector3(0, targetOffsetY, 0);
            const worldTargetOffset2 = localTargetOffset2.clone().applyQuaternion(targetQuaternion);
            orbitControls.target.set(
                model.position.x + worldTargetOffset2.x,
                model.position.y + worldTargetOffset2.y,
                model.position.z + worldTargetOffset2.z
            );

            // Note: We don't pre-calculate target quaternion for 3rd person transition
            // The camera will continuously lookAt the OrbitControls target during lerp
            // This ensures perfect alignment with OrbitControls expectations

            // Log the setup for debugging
            const targetDistance = transitionTargetPos.distanceTo(orbitControls.target);
            console.log('Transition target distance:', targetDistance.toFixed(3));
            console.log('WorldOffset:', worldOffset);
            console.log('TargetOffsetY:', targetOffsetY);

            // Start transition
            isCameraTransitioning = true;
            cameraTransitionProgress = 0;
            targetCameraMode = 'third-person';

            console.log('Starting transition to third-person mode');
            console.log('Start pos:', transitionStartPos);
            console.log('Start quat:', transitionStartQuat);
            console.log('Target pos (OrbitControls final):', transitionTargetPos);
            console.log('Target quat (OrbitControls final):', transitionTargetQuat);
        }
    }
}

/**
 * Set up camera toggle button for mobile
 */
function setupCameraToggleButton() {
    const toggleButton = document.getElementById('camera-toggle-button');

    if (toggleButton) {
        // Handle both click and touchstart for mobile
        toggleButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleCameraMode();
        });

        // For mobile, also handle touchstart for immediate response
        if (isMobile) {
            toggleButton.addEventListener('touchstart', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleCameraMode();
            }, { passive: false });
        }

        console.log('Camera toggle button initialized');
    }
}

/**
 * Handle pointer lock change events
 */
function onPointerLockChange() {
    isPointerLocked = document.pointerLockElement === renderer.domElement;

    if (!isPointerLocked && cameraMode === 'first-person' && !isMobile) {
        console.log('Pointer lock lost in first-person mode');
    }
}

/**
 * Handle mouse movement for first-person camera rotation
 */
function onMouseMove(event) {
    if (!isPointerLocked || cameraMode !== 'first-person') {
        return;
    }

    // Update yaw (horizontal rotation) - unlimited
    firstPersonYaw -= event.movementX * FIRST_PERSON_MOUSE_SENSITIVITY;

    // Update pitch (vertical rotation) - clamped to ±85 degrees
    // Mouse down (positive movementY) -> look up (negative pitch in Three.js)
    // Mouse up (negative movementY) -> look down (positive pitch in Three.js)
    firstPersonPitch -= event.movementY * FIRST_PERSON_MOUSE_SENSITIVITY;
    firstPersonPitch = Math.max(-FIRST_PERSON_MAX_PITCH, Math.min(FIRST_PERSON_MAX_PITCH, firstPersonPitch));

    // Send rotation to CharacterControls
    if (characterControls) {
        characterControls.setFirstPersonRotation(firstPersonPitch, firstPersonYaw);
    }
}

/**
 * Handle touch movement for first-person camera rotation (mobile)
 * @param {number} deltaX - Horizontal touch movement in pixels
 * @param {number} deltaY - Vertical touch movement in pixels
 */
function onTouchLook(deltaX, deltaY) {
    if (cameraMode !== 'first-person') {
        return;
    }

    // Update yaw (horizontal rotation) - unlimited
    firstPersonYaw -= deltaX * FIRST_PERSON_TOUCH_SENSITIVITY;

    // Update pitch (vertical rotation) - clamped to ±85 degrees
    // Drag down (positive deltaY) -> look up (negative pitch in Three.js)
    // Drag up (negative deltaY) -> look down (positive pitch in Three.js)
    firstPersonPitch -= deltaY * FIRST_PERSON_TOUCH_SENSITIVITY;
    firstPersonPitch = Math.max(-FIRST_PERSON_MAX_PITCH, Math.min(FIRST_PERSON_MAX_PITCH, firstPersonPitch));

    // Send rotation to CharacterControls
    if (characterControls) {
        characterControls.setFirstPersonRotation(firstPersonPitch, firstPersonYaw);
    }
}

/**
 * Set up keyboard event listeners
 */
function setupKeyboardControls() {
    // Flag to track if background music has been started (autoplay policy requires user interaction)
    let backgroundMusicStarted = false;

    // Fallback: Start background music on first touch (for mobile)
    const startAudioOnTouch = () => {
        if (!backgroundMusicStarted && audioManager) {
            audioManager.startBackgroundMusic();
            backgroundMusicStarted = true;
            console.log('Background music started on touch interaction (fallback)');
            // Remove listener after first touch
            document.removeEventListener('touchstart', startAudioOnTouch);
        }
    };
    document.addEventListener('touchstart', startAudioOnTouch, { once: true });

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();

        // Update key state
        keysPressed[key] = true;
        keyDisplayQueue.down(key);

        // Fallback: Start background music on first keypress if autoplay was blocked
        if (!backgroundMusicStarted && audioManager) {
            audioManager.startBackgroundMusic();
            backgroundMusicStarted = true;
            console.log('Background music started on keyboard interaction (fallback)');
        }

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

                // Play magic reveal sound with delay from config
                if (audioManager) {
                    const magicCfg = sceneConfig?.scene?.magicEffect || {};
                    const soundDelay = magicCfg.soundDelay || 0;
                    audioManager.playMagicReveal(soundDelay);
                }

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

        // Toggle background music on M
        if (key === 'm') {
            if (audioManager) {
                audioManager.toggleBackgroundMusic();
            }
        }

        // Toggle movement sounds on N
        if (key === 'n') {
            if (audioManager) {
                audioManager.toggleMovementSounds();
            }
        }

        // Toggle camera view on P
        if (key === 'p') {
            toggleCameraMode();
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
 * Set up start button click handler
 */
function setupStartButton() {
    const startButton = document.getElementById('start-button');
    const startOverlay = document.getElementById('start-overlay');

    if (startButton && startOverlay) {
        // Handler function to avoid duplication
        const handleStart = (event) => {
            // Prevent default behavior and event propagation
            event.preventDefault();
            event.stopPropagation();

            console.log('Start button triggered - experience beginning');

            // Mark experience as started immediately (allows rendering)
            experienceStarted = true;

            // Hide start overlay with fade out immediately (responsive UI)
            startOverlay.classList.remove('visible');

            // Start the magic reveal animation and audio
            startMagicReveal();

            // Unlock audio in the background (don't wait for it - iOS can be slow)
            // CRITICAL: Must be called from user interaction handler, but don't block UI on it
            // NOTE: Now using Web Audio API (AudioContext + GainNode) to fix iOS volume issues
            if (audioManager) {
                audioManager.unlockAudio().then(() => {
                    console.log('Audio unlocked successfully in background');
                }).catch(error => {
                    console.error('Audio unlock failed:', error);
                    // Experience continues without audio
                });
            }
        };

        // Add both click (for desktop/fallback) and touchstart (for mobile) events
        startButton.addEventListener('click', handleStart);

        // For mobile, use touchstart for immediate response (no 300ms delay)
        if (isMobile) {
            startButton.addEventListener('touchstart', handleStart, { passive: false });
            console.log('Start button initialized with touch support (mobile)');
        } else {
            console.log('Start button initialized (desktop)');
        }
    }
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

    // Update magic effect animation time (60 FPS) - ALWAYS animate scene
    // Only update if experience has started (prevents animation before button click)
    if (gaussianSplat && experienceStarted) {
        baseTime += 1 / 60;
        animateT.value = baseTime;
        gaussianSplat.updateVersion();
    }

    // Update camera transition (doesn't block scene animations)
    if (isCameraTransitioning) {
        cameraTransitionProgress += delta / CAMERA_TRANSITION_DURATION;

        // Log camera state during transition to 3rd person
        if (targetCameraMode === 'third-person') {
            const distToTarget = camera.position.distanceTo(orbitControls.target);
            console.log(`[Transition ${(cameraTransitionProgress * 100).toFixed(1)}%] Pos: (${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)}) Distance: ${distToTarget.toFixed(6)}`);
        }

        if (cameraTransitionProgress >= 1.0) {
            // Transition complete - ensure camera is at EXACT target position
            cameraTransitionProgress = 1.0;

            // Set camera to exact target position (no interpolation)
            camera.position.copy(transitionTargetPos);

            // Set camera to exact target rotation
            if (targetCameraMode === 'first-person') {
                camera.quaternion.copy(transitionTargetQuat);
            } else {
                // For third-person, look at target one final time
                camera.lookAt(orbitControls.target);
            }

            isCameraTransitioning = false;

            // Start post-transition logging for 0.2s
            if (targetCameraMode === 'third-person') {
                postTransitionLogTimer = POST_TRANSITION_LOG_DURATION;
            }

            // Finalize the mode change
            cameraMode = targetCameraMode;

            // Apply mode-specific settings when transition completes
            if (cameraMode === 'first-person') {
                // Disable OrbitControls
                orbitControls.enabled = false;

                // Hide character model and reset material properties
                if (characterControls.model) {
                    characterControls.model.visible = false;
                    // Reset material opacity to default
                    characterControls.model.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.opacity = 1.0;
                            child.material.transparent = false;
                        }
                    });
                }

                // Request pointer lock for desktop
                if (!isMobile) {
                    renderer.domElement.requestPointerLock();
                }

                // Notify CharacterControls and TouchControls
                characterControls.setCameraMode('first-person');
                characterControls.setFirstPersonRotation(firstPersonPitch, firstPersonYaw);
                if (touchControls) {
                    touchControls.setCameraMode('first-person');
                }

                console.log('Transition to first-person complete');
            } else {
                // Show character model and reset material properties
                if (characterControls.model) {
                    characterControls.model.visible = true;
                    // Reset material opacity to default
                    characterControls.model.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.opacity = 1.0;
                            child.material.transparent = false;
                        }
                    });
                }

                // Exit pointer lock
                if (!isMobile && document.pointerLockElement) {
                    document.exitPointerLock();
                }

                // Notify CharacterControls and TouchControls
                characterControls.setCameraMode('third-person');
                if (touchControls) {
                    touchControls.setCameraMode('third-person');
                }

                // CRITICAL: Re-sync OrbitControls target to character's CURRENT position (in local space)
                // The character may have moved slightly during transition
                const model = characterControls.model;
                const targetOffsetY = sceneConfig?.camera?.targetOffset?.y || 1;
                if (model) {
                    const localTargetOffset3 = new THREE.Vector3(0, targetOffsetY, 0);
                    const worldTargetOffset3 = localTargetOffset3.clone().applyQuaternion(model.quaternion);
                    orbitControls.target.set(
                        model.position.x + worldTargetOffset3.x,
                        model.position.y + worldTargetOffset3.y,
                        model.position.z + worldTargetOffset3.z
                    );
                    console.log('Re-synced OrbitControls target to character position:', orbitControls.target);
                }

                // Enable OrbitControls
                orbitControls.enabled = true;

                // CRITICAL: Update OrbitControls to recalculate internal spherical coordinates
                // This prevents distance drift when characterControls updates the target on next frame
                orbitControls.update();

                // Log final state for debugging
                const finalDistance = camera.position.distanceTo(orbitControls.target);
                console.log('Transition to third-person complete');
                console.log('Final camera pos:', camera.position);
                console.log('Final distance to target:', finalDistance.toFixed(3));
                console.log('OrbitControls target:', orbitControls.target);
            }

            // Update button icon
            updateCameraButtonIcon();
        }

        // Smooth easing function (ease-in-out)
        const t = cameraTransitionProgress;
        const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        // Lerp position
        camera.position.lerpVectors(transitionStartPos, transitionTargetPos, easedT);

        // For rotation: different behavior based on target mode
        if (targetCameraMode === 'first-person') {
            // Transitioning TO first-person: slerp rotation
            camera.quaternion.slerpQuaternions(transitionStartQuat, transitionTargetQuat, easedT);
        } else {
            // Transitioning TO third-person: always look at OrbitControls target
            // This ensures the camera orientation matches OrbitControls expectations
            camera.lookAt(orbitControls.target);
        }

        // Fade character model during transition
        if (characterControls && characterControls.model) {
            if (targetCameraMode === 'first-person') {
                // Fading out when entering first-person - hide completely once mostly faded
                if (easedT < 0.7) {
                    characterControls.model.visible = true;
                    characterControls.model.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.opacity = 1 - easedT;
                            child.material.transparent = true;
                        }
                    });
                } else {
                    // Completely hide once 70% through transition to avoid seeing contours
                    characterControls.model.visible = false;
                }
            } else {
                // Fading in when entering third-person
                characterControls.model.visible = true;
                characterControls.model.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material.opacity = easedT;
                        child.material.transparent = true;
                    }
                });
            }
        }
    }

    // Update XR system if active
    if (xrManager && xrManager.getIsXRActive()) {
        // In VR mode: update XR physics and controllers
        xrManager.update(delta, [groundMesh, infiniteFloor]);

        // Still update debug display
        if (characterControls) {
            const debugState = document.getElementById('debug-state');
            const debugAnimation = document.getElementById('debug-animation');
            const debugJetpack = document.getElementById('debug-jetpack');
            const debugGroundDist = document.getElementById('debug-ground-dist');

            if (debugState && debugAnimation && debugJetpack && debugGroundDist) {
                const isGrounded = xrManager.isGrounded;
                const currentAction = characterControls.getCurrentAction();
                const isJetpackActive = xrManager.jetpackActive;

                debugState.textContent = isGrounded ? 'GROUNDED' : 'IN AIR';
                debugState.className = isGrounded ? 'grounded' : 'in-air';
                debugAnimation.textContent = 'VR Mode';
                debugJetpack.textContent = isJetpackActive ? 'ACTIVE' : 'OFF';
                debugJetpack.className = isJetpackActive ? 'jetpack-active' : '';
                debugGroundDist.textContent = 'N/A (VR)';
            }
        }
    } else {
        // Normal mode: update character controls (freeze ONLY during camera transition)
        if (characterControls) {
            if (!isCameraTransitioning) {
                characterControls.update(delta, keysPressed);
            }
            // Still update debug display even during transition

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

            // Update audio based on character movement state
            if (audioManager) {
                const movementState = characterControls.getMovementState();
                audioManager.updateMovementSounds(movementState);
            }
        }
    }

    // Update audio manager (volume fading)
    if (audioManager) {
        audioManager.update(delta);
    }

    // Post-transition logging
    if (postTransitionLogTimer > 0) {
        postTransitionLogTimer -= delta;
        const distToTarget = camera.position.distanceTo(orbitControls.target);
        console.log(`[Post-transition ${((POST_TRANSITION_LOG_DURATION - postTransitionLogTimer) * 1000).toFixed(0)}ms] Pos: (${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)}) Distance: ${distToTarget.toFixed(6)} OrbitEnabled: ${orbitControls.enabled}`);
    }

    // Update orbit controls (not during transition to avoid interference, and not in XR mode)
    if (!isCameraTransitioning && (!xrManager || !xrManager.getIsXRActive())) {
        orbitControls.update();
    }

    // Render scene
    renderer.render(scene, camera);
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

    // Configure height slider based on scene config (±1 unit from config value)
    if (heightSlider && sceneConfig?.transform?.heightOffset !== undefined) {
        const configHeight = sceneConfig.transform.heightOffset;
        heightSlider.min = (configHeight - 1).toString();
        heightSlider.max = (configHeight + 1).toString();
        heightSlider.value = heightOffset.toString();
        heightValue.textContent = heightOffset.toFixed(2);
    }

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
            // Reset terrain leveling to scene config defaults
            const defaultLevelingX = sceneConfig?.transform?.defaultLeveling?.x || 0;
            const defaultLevelingZ = sceneConfig?.transform?.defaultLeveling?.z || 0;
            const defaultHeight = sceneConfig?.transform?.heightOffset || 0.6;

            levelRotationX = defaultLevelingX;
            levelRotationZ = defaultLevelingZ;
            heightOffset = defaultHeight;
            xSlider.value = defaultLevelingX;
            zSlider.value = defaultLevelingZ;
            heightSlider.value = defaultHeight;
            xValue.textContent = defaultLevelingX.toFixed(1) + '°';
            zValue.textContent = defaultLevelingZ.toFixed(1) + '°';
            heightValue.textContent = defaultHeight.toFixed(2);

            // Reset light orientation to scene config defaults
            const defaultAzimuth = sceneConfig?.lighting?.directional?.azimuth || 213;
            const defaultElevation = sceneConfig?.lighting?.directional?.elevation || 37;

            lightAzimuth = defaultAzimuth;
            lightElevation = defaultElevation;
            azimuthSlider.value = defaultAzimuth;
            elevationSlider.value = defaultElevation;
            azimuthValue.textContent = defaultAzimuth.toFixed(0) + '°';
            elevationValue.textContent = defaultElevation.toFixed(0) + '°';

            applyLevelingRotations();
            applyLightOrientation();
            console.log('All controls reset to defaults');
        });
    }

    console.log('Leveling controls initialized');
}

/**
 * Initialize scene selector dropdowns (both original and start overlay)
 */
async function initSceneSelector() {
    try {
        // Load scenes manifest
        scenesManifest = await loadScenesManifest();
        const scenes = getAvailableScenes(scenesManifest);
        const dropdown = document.getElementById('scene-dropdown');
        const startDropdown = document.getElementById('start-scene-dropdown');

        // Clear loading options
        dropdown.innerHTML = '';
        if (startDropdown) startDropdown.innerHTML = '';

        // Populate both dropdowns with scenes
        scenes.forEach(scene => {
            const option = document.createElement('option');
            option.value = scene.id;
            option.textContent = scene.name;
            dropdown.appendChild(option);

            if (startDropdown) {
                const startOption = document.createElement('option');
                startOption.value = scene.id;
                startOption.textContent = scene.name;
                startDropdown.appendChild(startOption);
            }
        });

        // Set default scene
        const defaultScene = getDefaultScene(scenesManifest);
        dropdown.value = defaultScene;
        if (startDropdown) startDropdown.value = defaultScene;

        // Add change event listener to original dropdown
        dropdown.addEventListener('change', async (e) => {
            const sceneId = e.target.value;
            if (sceneId !== currentSceneId) {
                console.log(`Switching to scene: ${sceneId}`);
                await loadAndInitializeScene(sceneId);
            }
        });

        // Add change event listener to start overlay dropdown
        if (startDropdown) {
            startDropdown.addEventListener('change', async (e) => {
                const sceneId = e.target.value;
                if (sceneId !== currentSceneId) {
                    console.log(`Switching to scene: ${sceneId}`);
                    // Sync the other dropdown
                    dropdown.value = sceneId;
                    // Update scene info immediately
                    const scenes = getAvailableScenes(scenesManifest);
                    const selectedScene = scenes.find(s => s.id === sceneId);
                    if (selectedScene) {
                        const startTitle = document.getElementById('start-title');
                        const startDescription = document.getElementById('start-description');
                        if (startTitle) startTitle.textContent = selectedScene.name;
                        if (startDescription) startDescription.textContent = selectedScene.description || 'Prepare for an amazing journey';
                    }
                    await loadAndInitializeScene(sceneId);
                }
            });
        }

        console.log('Scene selectors initialized');
    } catch (error) {
        console.error('Failed to initialize scene selector:', error);
    }
}

/**
 * Load scene configuration and initialize
 * @param {string} sceneId - Scene ID to load
 */
async function loadAndInitializeScene(sceneId) {
    try {
        // Get config path for this scene
        const configPath = getSceneConfigPath(scenesManifest, sceneId);
        if (!configPath) {
            throw new Error(`Scene config not found for: ${sceneId}`);
        }

        // Load scene configuration
        sceneConfig = await loadSceneConfig(configPath);
        currentSceneId = sceneId;

        // Apply configuration to global variables
        applySceneConfig();

        // Reload the page content (simplified approach - full reload)
        location.reload();

    } catch (error) {
        console.error(`Failed to load scene ${sceneId}:`, error);
        alert(`Failed to load scene: ${error.message}`);
    }
}

/**
 * Apply scene configuration to global state variables
 */
function applySceneConfig() {
    // Store scene ID in sessionStorage for reload
    sessionStorage.setItem('currentScene', currentSceneId);

    // Apply leveling defaults from config
    if (sceneConfig.transform.defaultLeveling) {
        levelRotationX = sceneConfig.transform.defaultLeveling.x || 0;
        levelRotationZ = sceneConfig.transform.defaultLeveling.z || 0;
    }

    // Apply height offset
    if (sceneConfig.transform.heightOffset !== undefined) {
        heightOffset = sceneConfig.transform.heightOffset;
    }

    // Apply lighting defaults
    if (sceneConfig.lighting.directional) {
        lightAzimuth = sceneConfig.lighting.directional.azimuth;
        lightElevation = sceneConfig.lighting.directional.elevation;
    }

    console.log('Scene configuration applied to global state');
}

/**
 * Initialize the application
 */
async function init() {
    console.log('Initializing F1000...');

    // Initialize scene selector first
    await initSceneSelector();

    // Check if there's a scene stored in session
    const storedScene = sessionStorage.getItem('currentScene');
    let sceneToLoad = storedScene || getDefaultScene(scenesManifest);

    // Load scene configuration
    const configPath = getSceneConfigPath(scenesManifest, sceneToLoad);
    sceneConfig = await loadSceneConfig(configPath);
    currentSceneId = sceneToLoad;

    // Apply scene config to globals
    applySceneConfig();

    // Update UI to show correct scene
    const dropdown = document.getElementById('scene-dropdown');
    if (dropdown) {
        dropdown.value = currentSceneId;
    }
    const startDropdown = document.getElementById('start-scene-dropdown');
    if (startDropdown) {
        startDropdown.value = currentSceneId;
    }

    // Update start overlay with scene information
    const startTitle = document.getElementById('start-title');
    const startDescription = document.getElementById('start-description');
    if (sceneConfig && startTitle && startDescription) {
        startTitle.textContent = sceneConfig.name || 'Unknown Location';
        startDescription.textContent = sceneConfig.description || 'Prepare for an amazing journey';
    }

    // Set up scene
    initScene();

    // Initialize audio system
    initAudio();

    // Load ground (which will load character after completion)
    createGround();

    // Set up controls
    setupKeyboardControls();
    setupLevelingControls();
    setupStartButton();
    setupCameraToggleButton();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Set up pointer lock event listeners for first-person mode
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', () => {
        console.error('Pointer lock error');
    });

    // Set up mouse movement listener for first-person camera control
    document.addEventListener('mousemove', onMouseMove);

    // Start animation loop using setAnimationLoop for WebXR compatibility
    renderer.setAnimationLoop(animate);

    console.log('F1000 initialized successfully');
}

// Start the application
init();
