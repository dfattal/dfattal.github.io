import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SplatMesh, dyno, SparkRenderer } from '@sparkjsdev/spark';
import { CharacterControls } from './characterControls.js';
import { KeyDisplay } from './utils.js';
import { TouchControls } from './touchControls.js';
import { loadScenesManifest, loadSceneConfig, getAvailableScenes, getDefaultScene, getSceneConfigPath } from './sceneLoader.js';
import { AudioManager } from './audioManager.js';
import { XRManager } from './xrManager.js';
import { XRControllers } from './xrControllers.js';
import { XRHands } from './xrHands.js';
import { GestureDetector } from './gestureDetector.js';
import { WristPalette } from './wristPalette.js';
import { GestureVisuals } from './gestureVisuals.js';
import { AdaptiveQualitySystem } from './adaptiveQualitySystem.js';
import { URLRouter } from './urlRouter.js';
import { GlobeView } from './globeView.js';

/**
 * F1000 - Third Person Character Controller
 * Following the approach from threejs-character-controls-example
 */

// Scene configuration
let scenesManifest = null;   // Loaded scenes manifest
let sceneConfig = null;       // Currently loaded scene configuration
let currentSceneId = null;    // Current scene ID

// Globe and URL routing
let urlRouter = null;         // URL router for site navigation
let globeView = null;         // Globe visualization

// Scene, camera, renderer
let scene;
let camera;
let renderer;
let spark; // Spark renderer for Gaussian splats
let orbitControls;

// Character
let characterControls;

// Audio
let audioManager;

// WebXR
let xrManager = null;
let xrControllers = null;
let xrHands = null;
let gestureDetector = null;
let wristPalette = null;
let gestureVisuals = null;

// VR gesture movement state
let vrMovementDirection = null; // THREE.Vector3
let vrMovementSpeed = 0; // 0-1 normalized

// Terrain
let groundMesh;
let infiniteFloor;
let gaussianSplat = null;
let splatScale = 1.0; // Scale factor for both collision mesh and Gaussian splat (from scene config)
let maxCharacterHeight = null; // Maximum height cap for character
let maxTerrainHeight = 0; // Highest point of collision mesh (after all transforms) for auto height cap calculation
let autoExpansionRadius = 2500; // Auto-calculated magic effect radius based on splat extent (in splat space)

// Adaptive quality system
let adaptiveQuality = null;

// Lighting
let directionalLight = null; // Main directional light (sun)
let lightAzimuth = 213; // Light direction azimuth in degrees (0-360, 0=North, 90=East)
let lightElevation = 37; // Light elevation in degrees (0=horizon, 90=overhead)

// Base transform from scene config
let baseRotationX = 180; // Base X rotation in degrees (from scene config)
let baseRotationY = 0;   // Base Y rotation in degrees (from scene config)
let baseRotationZ = 0;   // Base Z rotation in degrees (from scene config)

// Leveling adjustments (applied LAST, after all other transforms)
let levelRotationX = 0; // Fine-tune X rotation in degrees (-5 to +5)
let levelRotationZ = 0; // Fine-tune Z rotation in degrees (-5 to +5)
let heightOffset = 0.0; // Vertical offset for terrain in scaled units (0 = mesh Y=0 aligns with world Y=0)
let heightOffsetConfigValue = 0.0; // Store the original config value (can be number, "max", or "min")
let maxOffsetUp = 0; // Maximum positive offset (raising mesh up), calculated from lowest point
let minOffsetDown = 0; // Minimum negative offset (lowering mesh down), calculated from highest point

// Animation
const clock = new THREE.Clock();

// FPS tracking (handled by adaptiveLOD system)
let fps = 60;

// Magic effect animation timing variables
const animateT = dyno.dynoFloat(0);
let baseTime = 0;

// Brush/Paint parameters
// Hybrid approach: lateral radius ALWAYS controlled by brushRadius,
// depth selection uses collision mesh surface (preferred) or brushDepth (fallback)
const BRUSH_PARAMS = {
    enabled: dyno.dynoBool(false),
    brushRadius: dyno.dynoFloat(0.05),      // Lateral radius (perpendicular to ray), controlled by +/- keys
    brushDepth: dyno.dynoFloat(10.0),       // Depth range (along ray), fallback when no collision mesh hit, controlled by [/] keys
    brushOrigin: dyno.dynoVec3(new THREE.Vector3(0.0, 0.0, 0.0)),
    brushDirection: dyno.dynoVec3(new THREE.Vector3(0.0, 0.0, 0.0)),
    brushColor: dyno.dynoVec3(new THREE.Vector3(1.0, 0.0, 1.0)),
    // Collision mesh surface-based depth selection (preferred over brushDepth when available)
    useSurface: dyno.dynoBool(false),       // Flag: use surface-based depth when collision mesh hit
    surfacePoint: dyno.dynoVec3(new THREE.Vector3(0.0, 0.0, 0.0)),  // Collision mesh intersection point
    surfaceRadius: dyno.dynoFloat(0.2),     // Depth tolerance along ray (0.2 units from surface)
};

const MIN_BRUSH_RADIUS = 0.01;
const MAX_BRUSH_RADIUS = 0.25;
const MIN_BRUSH_DEPTH = 0.1;
const MAX_BRUSH_DEPTH = 100.0;

let isPaintMode = false;
let isDragging = false;
let paintRaycaster = null;
let isCtrlPressed = false; // Track CTRL key state for paint-on-move

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
let pointerLocked = false; // Track pointer lock state

// First-person camera constants
const FIRST_PERSON_MOUSE_SENSITIVITY = 0.002; // Mouse movement sensitivity (for pointer lock)
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
let buttonsShown = false; // Prevent buttons from showing multiple times

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

    // NOTE: Worker pool optimization not available in this Spark version
    // setWorkerPool() export doesn't exist - would reduce workers on mobile to conserve memory
    // const isLowEnd = navigator.hardwareConcurrency <= 4;
    // const workerCount = (isMobile || isLowEnd) ? 2 : 4;
    // setWorkerPool(workerCount);

    // Create renderer with performance optimizations
    renderer = new THREE.WebGLRenderer({
        antialias: false,  // CRITICAL - antialiasing kills splat performance
        powerPreference: 'high-performance'  // Request dedicated GPU
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Start with clamped pixel ratio - adaptive LOD will reduce further if needed
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Initialize Spark renderer with mobile-optimized quality parameters
    // These provide immediate performance gains before adaptive system kicks in
    spark = new SparkRenderer({
        renderer,
        // Reduce splat rendering size (smaller footprint per splat)
        maxStdDev: isMobile ? Math.sqrt(5) : Math.sqrt(7),
        // Cull very small splats (improves performance)
        minPixelRadius: isMobile ? 0.5 : 0.3,
        // Cap maximum splat size
        maxPixelRadius: isMobile ? 256 : 384,
        // Cull transparent splats more aggressively
        minAlpha: isMobile ? 1.0 / 255.0 : 0.7 / 255.0,
        // Generous frustum culling (increased for large-scale scenes)
        clipXY: isMobile ? 1.6 : 2.0,
        // Reduce Gaussian falloff (flatter shading, better performance)
        falloff: isMobile ? 0.8 : 0.95,
    });
    scene.add(spark);

    // Configure sorting parameters for mobile
    if (isMobile) {
        // Reduce sorting frequency when camera moves (20-30% FPS gain)
        spark.defaultView.sortDistance = 0.05;  // Default: 0.01 (higher = less sorting)
        spark.defaultView.sortCoorient = 0.97;  // Default: 0.99 (lower = less sorting)
        console.log('Mobile sorting optimizations applied');
    }

    // Initialize paint raycaster
    paintRaycaster = new THREE.Raycaster();

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

    // Disable zoom on mobile (pinch-to-zoom not needed)
    if (isMobile) {
        orbitControls.enableZoom = false;
    }

    // Configure mouse buttons: LEFT click for rotation, RIGHT click disabled (used for painting)
    orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,  // Left-click for camera rotation
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: -1  // Disable right-click (reserved for painting)
    };

    orbitControls.update();

    // Initialize touch controls for mobile
    if (isMobile) {
        touchControls = new TouchControls(keysPressed, orbitControls);
        // Set up first-person look callback for mobile
        touchControls.setFirstPersonCallback(onTouchLook);
        // Set up paint callbacks for mobile
        touchControls.setPaintCallback(handleMobilePaint);
        touchControls.setPaintEndCallback(handleMobilePaintEnd);
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

            groundMesh = new THREE.Mesh(meshGeometry, collisionMaterial);

            // Copy transform from the original mesh
            groundMesh.position.copy(collisionMesh.position);
            groundMesh.rotation.copy(collisionMesh.rotation);
            groundMesh.scale.copy(collisionMesh.scale);

            // Apply any transforms from parent nodes
            groundMesh.applyMatrix4(gltf.scene.matrix);

            // Scale the collision mesh
            groundMesh.scale.multiplyScalar(splatScale);

            // Apply base rotation from scene config (convert degrees to radians)
            groundMesh.rotation.x += baseRotationX * (Math.PI / 180);
            groundMesh.rotation.y += baseRotationY * (Math.PI / 180);
            groundMesh.rotation.z += baseRotationZ * (Math.PI / 180);

            // Initially position at Y=0 to calculate bounding box and bounds
            groundMesh.position.y = 0;

            groundMesh.receiveShadow = true;
            groundMesh.castShadow = true;
            groundMesh.visible = false;  // Hide collision mesh, only show wireframe
            scene.add(groundMesh);

            // Calculate max height AFTER scale/rotation but BEFORE heightOffset is applied
            // This gives us the true mesh bounds in world space

            try {
                // First compute geometry bounding box (needed for accurate world bounds)
                if (!meshGeometry.boundingBox) {
                    meshGeometry.computeBoundingBox();
                }

                // Use geometry bounding box directly with transforms applied
                // More efficient than setFromObject() which traverses all vertices
                const geomBBox = meshGeometry.boundingBox.clone();

                // Apply scale transform
                geomBBox.min.multiplyScalar(splatScale);
                geomBBox.max.multiplyScalar(splatScale);

                // Apply rotation transform (180° on X-axis flips min/max Y)
                // After 180° X rotation: original min.y becomes max.y, original max.y becomes min.y
                const rotatedMin = new THREE.Vector3(geomBBox.min.x, -geomBBox.max.y, geomBBox.min.z);
                const rotatedMax = new THREE.Vector3(geomBBox.max.x, -geomBBox.min.y, geomBBox.max.z);

                maxTerrainHeight = rotatedMax.y; // Highest point in world space (after all transforms)
                console.log(`[Collision Mesh] World bounding box (at Y=0): min.y=${rotatedMin.y.toFixed(2)}, max.y=${rotatedMax.y.toFixed(2)}`);
                console.log(`[Collision Mesh] maxTerrainHeight = ${maxTerrainHeight.toFixed(2)} (highest walkable point after all transforms)`);

                // Calculate heightOffset bounds based on mesh geometry at position Y=0
                // When mesh is at Y=0:
                // - If lowest point (min.y) is negative, we can raise mesh by -min.y to bring bottom to Y=0
                // - If highest point (max.y) is positive, we can lower mesh by -max.y to bring top to Y=0
                maxOffsetUp = rotatedMin.y < 0 ? -rotatedMin.y : 0;
                minOffsetDown = rotatedMax.y > 0 ? -rotatedMax.y : 0;
                console.log(`[Height Offset Bounds] Calculated from worldBBox: min.y=${rotatedMin.y.toFixed(2)}, max.y=${rotatedMax.y.toFixed(2)}`);
                console.log(`[Height Offset Bounds] Range: ${minOffsetDown.toFixed(2)} to ${maxOffsetUp.toFixed(2)} (scaled units)`);
            } catch (error) {
                console.error('[Collision Mesh] Failed to calculate bounds:', error);
                // Fallback to safe defaults
                maxTerrainHeight = 100;
                maxOffsetUp = 0;
                minOffsetDown = -100;
            }

            // Resolve "max" or "min" config values now that bounds are calculated
            if (heightOffsetConfigValue === "max") {
                heightOffset = maxOffsetUp;
                console.log(`[Height Offset] Resolved "max" to ${heightOffset.toFixed(2)}`);
            } else if (heightOffsetConfigValue === "min") {
                heightOffset = minOffsetDown;
                console.log(`[Height Offset] Resolved "min" to ${heightOffset.toFixed(2)}`);
            }

            // Update height slider bounds now that they're calculated
            updateHeightSliderBounds();

            // Apply heightOffset (now in scaled units, no multiplication by splatScale)
            groundMesh.position.y = heightOffset;

            // NOTE: maxCharacterHeight will be set after splat loads (uses collision mesh height for "auto")

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
            // Set initial visibility from scene config (default: true)
            infiniteFloor.visible = sceneConfig?.scene?.infiniteFloor?.visible !== false;
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
    const baseXRad = baseRotationX * (Math.PI / 180);
    const baseYRad = baseRotationY * (Math.PI / 180);
    const baseZRad = baseRotationZ * (Math.PI / 180);
    const levelXRad = levelRotationX * (Math.PI / 180);
    const levelZRad = levelRotationZ * (Math.PI / 180);

    // Calculate Y position from height offset (now in scaled units, no multiplication needed)
    const yPosition = heightOffset;

    // Apply to collision mesh (if loaded)
    if (groundMesh) {
        // Set Y position
        groundMesh.position.y = yPosition;

        // Reset to base rotation from config
        groundMesh.rotation.x = baseXRad;
        groundMesh.rotation.y = baseYRad;
        groundMesh.rotation.z = baseZRad;

        // Apply leveling adjustments (LAST transform)
        groundMesh.rotation.x += levelXRad;
        groundMesh.rotation.z += levelZRad;
    }

    // Apply to Gaussian splat (if loaded)
    if (gaussianSplat) {
        // Set Y position
        gaussianSplat.position.y = yPosition;

        // Reset to base rotation from config
        gaussianSplat.rotation.x = baseXRad;
        gaussianSplat.rotation.y = baseYRad;
        gaussianSplat.rotation.z = baseZRad;

        // Apply leveling adjustments (LAST transform)
        gaussianSplat.rotation.x += levelXRad;
        gaussianSplat.rotation.z += levelZRad;
    }

    // Apply to wireframe helper (if exists)
    if (wireframeHelper) {
        wireframeHelper.position.y = yPosition;
        wireframeHelper.rotation.x = baseXRad;
        wireframeHelper.rotation.y = baseYRad;
        wireframeHelper.rotation.z = baseZRad;
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
    const expansionRadius = magicCfg.expansionRadius ?? autoExpansionRadius; // Use auto-calculated radius if not specified
    const duration = magicCfg.duration || 2.0;

    console.log(`Creating magic modifier: radius=${expansionRadius.toFixed(1)}, duration=${duration.toFixed(1)}s ${magicCfg.expansionRadius ? '(from config)' : '(auto-calculated)'}`);

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
 * Create brush/paint modifier for Gaussian splat
 *
 * Hybrid painting approach:
 * - Lateral radius: ALWAYS uses brushRadius (perpendicular distance from ray)
 * - Depth selection: Uses collision mesh surface point (preferred) or brushDepth (fallback)
 *
 * @param {dynoBool} brushEnabled - Enable/disable brush effect
 * @param {dynoFloat} brushRadius - Lateral paint radius (perpendicular to ray), controlled by +/- keys
 * @param {dynoFloat} brushDepth - Depth range along ray (fallback when no collision mesh hit), controlled by [/] keys
 * @param {dynoVec3} brushOrigin - Ray origin (camera position)
 * @param {dynoVec3} brushDirection - Ray direction (normalized)
 * @param {dynoVec3} brushColor - Paint color (RGB linear)
 * @param {dynoBool} useSurface - Flag to enable surface-based depth selection
 * @param {dynoVec3} surfacePoint - Collision mesh intersection point
 * @param {dynoFloat} surfaceRadius - Depth tolerance from surface (0.2 units default)
 */
function createBrushModifier(
    brushEnabled,
    brushRadius,
    brushDepth,
    brushOrigin,
    brushDirection,
    brushColor,
    useSurface,
    surfacePoint,
    surfaceRadius
) {
    return dyno.dynoBlock(
        { gsplat: dyno.Gsplat },
        { gsplat: dyno.Gsplat },
        ({ gsplat }) => {
            if (!gsplat) {
                throw new Error("No gsplat input");
            }

            let { center, rgb } = dyno.splitGsplat(gsplat).outputs;

            // Project splat center onto brush ray
            const projectionAmplitude = dyno.dot(brushDirection, dyno.sub(center, brushOrigin));
            const projectedCenter = dyno.add(brushOrigin, dyno.mul(brushDirection, projectionAmplitude));

            // Lateral check: Distance from splat to ray (perpendicular distance)
            // This is ALWAYS controlled by brushRadius (+/- keys)
            const distanceToCylinder = dyno.length(dyno.sub(projectedCenter, center));
            const isWithinRadius = dyno.lessThan(distanceToCylinder, brushRadius);

            // Depth check (along the ray): Two modes
            // Mode 1 (surface-based): Check if projected point is near collision mesh surface
            const distanceToSurface = dyno.length(dyno.sub(projectedCenter, surfacePoint));
            const isNearSurface = dyno.lessThan(distanceToSurface, surfaceRadius);

            // Mode 2 (cylinder-based fallback): Use brushDepth parameter
            const isWithinDepth = dyno.and(
                dyno.greaterThan(projectionAmplitude, dyno.dynoFloat(0.0)),
                dyno.lessThan(projectionAmplitude, brushDepth)
            );

            // Choose depth check method based on whether collision mesh was hit
            const depthCheck = dyno.select(useSurface, isNearSurface, isWithinDepth);

            // Final check: Lateral radius AND depth check
            const isInside = dyno.and(isWithinRadius, depthCheck);

            // Apply brush color
            const newRgb = dyno.select(brushEnabled, dyno.select(isInside, brushColor, rgb), rgb);

            gsplat = dyno.combineGsplat({ gsplat, rgb: newRgb });
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

        // Get bounding box in splat space (before transforms) for auto-configuration
        const splatBBox = gaussianSplat.getBoundingBox(false); // false = include splat sizes, not just centers
        const splatExtent = new THREE.Vector3();
        splatBBox.getSize(splatExtent);
        const splatMaxDimension = Math.max(splatExtent.x, splatExtent.y, splatExtent.z);
        const splatRadius = splatExtent.length() / 2; // Distance from center to corner

        console.log('Splat bounding box (local space):');
        console.log('  min:', splatBBox.min);
        console.log('  max:', splatBBox.max);
        console.log('  extent:', splatExtent);
        console.log('  max dimension:', splatMaxDimension.toFixed(2));
        console.log('  radius (center to corner):', splatRadius.toFixed(2));

        // Auto-configure camera far plane based on splat extent × scale
        // Use 1.5x multiplier for safety margin
        const autoFarPlane = splatRadius * splatScale * 1.5;
        const configFarPlane = sceneConfig?.camera?.far || 1000;
        const finalFarPlane = Math.max(autoFarPlane, configFarPlane);

        if (camera) {
            camera.far = finalFarPlane;
            camera.updateProjectionMatrix();
            console.log(`Camera far plane: config=${configFarPlane}, auto=${autoFarPlane.toFixed(0)}, using=${finalFarPlane.toFixed(0)}`);
        }

        // Auto-configure magic effect expansion radius in splat space (before scaling)
        // Use the XZ radius (horizontal extent) since the effect expands radially in XZ plane
        const splatRadiusXZ = Math.sqrt(splatExtent.x * splatExtent.x + splatExtent.z * splatExtent.z) / 2;
        autoExpansionRadius = splatRadiusXZ * 1.1; // 1.1x multiplier to ensure full coverage
        console.log(`Magic effect expansion radius: auto=${autoExpansionRadius.toFixed(1)} (in splat space)`);

        // Configure character height ceiling based on collision mesh dimensions
        // Read maxHeight from config: number = absolute height, "auto" = 2x collision mesh height, negative = unlimited
        const configMaxHeight = sceneConfig?.character?.maxHeight;
        console.log(`[Height Cap Config] configMaxHeight="${configMaxHeight}", maxTerrainHeight=${maxTerrainHeight.toFixed(2)}, heightOffset=${heightOffset.toFixed(2)}`);

        if (configMaxHeight === "auto") {
            // Auto: 2× the collision mesh's max height (accounting for heightOffset)
            // The actual terrain height after heightOffset is: maxTerrainHeight + heightOffset
            const actualTerrainHeight = maxTerrainHeight + heightOffset;
            maxCharacterHeight = actualTerrainHeight * 2.0;
            console.log(`[Height Cap] Set to ${maxCharacterHeight.toFixed(2)} (auto: 2× actual terrain height ${actualTerrainHeight.toFixed(2)} = 2× (${maxTerrainHeight.toFixed(2)} + ${heightOffset.toFixed(2)}))`);
        } else if (typeof configMaxHeight === 'number') {
            if (configMaxHeight < 0) {
                // Negative value: No height ceiling
                maxCharacterHeight = null;
                console.log(`[Height Cap] Set to NONE (unlimited) - config value: ${configMaxHeight}`);
            } else {
                // Positive number: Absolute height in scene units
                maxCharacterHeight = configMaxHeight;
                console.log(`[Height Cap] Set to ${maxCharacterHeight.toFixed(2)} (absolute from config)`);
            }
        } else {
            // No config or invalid: Default to auto behavior
            const actualTerrainHeight = maxTerrainHeight + heightOffset;
            maxCharacterHeight = actualTerrainHeight * 2.0;
            console.log(`[Height Cap] Set to ${maxCharacterHeight.toFixed(2)} (default auto: 2× actual terrain height ${actualTerrainHeight.toFixed(2)} = 2× (${maxTerrainHeight.toFixed(2)} + ${heightOffset.toFixed(2)}))`);
        }

        console.log(`[Height Cap Final] maxCharacterHeight = ${maxCharacterHeight === null ? 'null (unlimited)' : maxCharacterHeight.toFixed(2)}`);

        // Update CharacterControls if it was already created (race condition fix)
        if (characterControls) {
            characterControls.maxHeight = maxCharacterHeight;
            console.log(`[Height Cap] Updated existing CharacterControls.maxHeight to ${maxCharacterHeight === null ? 'null (unlimited)' : maxCharacterHeight.toFixed(2)}`);
        }

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

        // Apply base rotation from scene config (convert degrees to radians) - matches collision mesh orientation
        gaussianSplat.rotation.x += baseRotationX * (Math.PI / 180);
        gaussianSplat.rotation.y += baseRotationY * (Math.PI / 180);
        gaussianSplat.rotation.z += baseRotationZ * (Math.PI / 180);

        // Apply height offset (now in scaled units, no multiplication needed)
        gaussianSplat.position.y = heightOffset;

        // Add to spark renderer (not directly to scene)
        spark.add(gaussianSplat);

        // Hide the splat initially (will show when experience starts)
        gaussianSplat.visible = false;

        // Apply leveling rotations to match collision mesh
        applyLevelingRotations();

        // Mark splat as loaded
        splatLoaded = true;

        // Set gaussianSplat reference in xrManager for VR visibility management
        if (xrManager) {
            xrManager.gaussianSplat = gaussianSplat;
            console.log('Gaussian splat reference set in XRManager');
        }

        // Initialize adaptive quality system for performance optimization
        // Uses preset-based quality switching (no worldModifier conflicts)
        // Platform-specific settings:
        // - Desktop: 30 FPS target, start at Ultra (index 0)
        // - Mobile: 20 FPS target, start at Medium (index 2)
        // - VR: Will be 50 FPS when active, start at Medium (index 2) for mobile-class performance
        const desktopTargetFPS = 30;
        const mobileTargetFPS = 20;
        const vrTargetFPS = 50;

        const initialTargetFPS = isMobile ? mobileTargetFPS : desktopTargetFPS;
        const initialQualityIndex = isMobile ? 2 : 0; // Desktop=Ultra(0), Mobile=Medium(2)

        adaptiveQuality = new AdaptiveQualitySystem(
            spark,
            renderer,
            initialTargetFPS,
            initialQualityIndex
        );

        // Store VR target FPS for later use
        adaptiveQuality.vrTargetFPS = vrTargetFPS;
        adaptiveQuality.desktopTargetFPS = desktopTargetFPS;
        adaptiveQuality.mobileTargetFPS = mobileTargetFPS;

        console.log('Adaptive quality system initialized');

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

        // Apply brush/paint modifier (runs after magic effect in shader pipeline)
        try {
            gaussianSplat.worldModifier = createBrushModifier(
                BRUSH_PARAMS.enabled,
                BRUSH_PARAMS.brushRadius,
                BRUSH_PARAMS.brushDepth,
                BRUSH_PARAMS.brushOrigin,
                BRUSH_PARAMS.brushDirection,
                BRUSH_PARAMS.brushColor,
                BRUSH_PARAMS.useSurface,
                BRUSH_PARAMS.surfacePoint,
                BRUSH_PARAMS.surfaceRadius
            );
            gaussianSplat.updateGenerator();
            console.log('Brush modifier applied to Gaussian splat');
        } catch (error) {
            console.error('Error applying brush modifier:', error);
        }

        // Check if all assets are loaded
        checkAllLoaded();

    } catch (error) {
        console.error('Error loading Gaussian splat:', error);
        // Scene will not start if splat fails to load (checkAllLoaded handles this)
    }
}

/**
 * Check if all assets are loaded and show start button(s)
 * Uses boolean flags instead of string comparison for mobile compatibility
 */
async function checkAllLoaded() {
    // Don't run if buttons already shown
    if (buttonsShown) {
        return;
    }

    const loadingBars = document.getElementById('start-loading-bars');
    const startButton = document.getElementById('start-button');

    if (loadingBars) {
        // ONLY show buttons when BOTH assets are confirmed loaded
        if (collisionLoaded && splatLoaded) {
            // Mark that we're showing buttons (prevent duplicate calls)
            buttonsShown = true;

            // Clear any existing timeout
            if (loadingTimeout) {
                clearTimeout(loadingTimeout);
                loadingTimeout = null;
            }

            console.log('All assets loaded, showing buttons...');

            // Add a small delay before showing button to ensure user sees 100%
            setTimeout(async () => {
                // Hide loading bars
                loadingBars.style.display = 'none';

                // Show start button (VR accessed via in-app Three.js button)
                if (startButton) startButton.style.display = 'inline-block';
                console.log('Assets loaded, start button shown');
            }, 500);
        } else {
            // Assets not fully loaded yet - set fallback timeout ONCE
            if (!loadingTimeout) {
                console.log('Assets not fully loaded, setting fallback timeout...');
                loadingTimeout = setTimeout(async () => {
                    // Check if assets are NOW loaded before showing buttons
                    if (collisionLoaded && splatLoaded && !buttonsShown) {
                        buttonsShown = true;
                        console.log('Loading timeout: assets confirmed loaded, showing buttons');
                        loadingBars.style.display = 'none';

                        // Show start button
                        if (startButton) startButton.style.display = 'inline-block';
                    } else if (!collisionLoaded || !splatLoaded) {
                        console.warn('Loading timeout: assets STILL not loaded, waiting longer...');
                        // Assets still not loaded, check again in 2 seconds
                        loadingTimeout = null;
                        setTimeout(() => checkAllLoaded(), 2000);
                    }
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

            // Get spawn position and rotation from config
            const spawnCfg = sceneConfig?.character?.spawn || {};
            const spawnPos = spawnCfg.position || { x: 0, y: 'auto', z: 40 };
            const spawnRot = spawnCfg.rotation || { y: 0 };

            // Set character X and Z position first
            model.position.x = spawnPos.x;
            model.position.z = spawnPos.z;
            model.rotation.y = spawnRot.y * (Math.PI / 180);  // Convert degrees to radians

            // Handle Y position: if "auto", raycast from high altitude to find ground
            if (spawnPos.y === 'auto') {
                // Set Y to high altitude so placeOnGround() can raycast down to find terrain
                model.position.y = 1000;
                console.log(`Auto-detecting ground height at spawn position (${spawnPos.x}, ${spawnPos.z})...`);
                characterControls.placeOnGround();
            } else {
                // Use specified Y position
                model.position.y = spawnPos.y;
                console.log(`Character spawned at specified position (${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z})`);
            }

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

    // Create wrist-mounted color palette (must be created before gestureDetector)
    wristPalette = new WristPalette(scene, xrHands);

    // Create gesture detector (pass wristPalette for toggle button checking)
    gestureDetector = new GestureDetector(xrHands, xrManager, wristPalette);

    // Create gesture visuals
    gestureVisuals = new GestureVisuals(scene);

    // Wire up gesture callbacks for painting
    gestureDetector.callbacks.onPaintStart = (handedness, rayOrigin, rayDirection) => {
        console.log(`Gesture paint start (${handedness})`);
        if (gaussianSplat) {
            BRUSH_PARAMS.brushOrigin.value.copy(rayOrigin);
            BRUSH_PARAMS.brushDirection.value.copy(rayDirection);
            BRUSH_PARAMS.enabled.value = true;
        }
        // Show paint ray visual
        if (gestureVisuals) {
            gestureVisuals.updatePaintRay(handedness, rayOrigin, rayDirection, true);
        }
    };

    gestureDetector.callbacks.onPaintDrag = (handedness, rayOrigin, rayDirection) => {
        if (!gaussianSplat) return;

        // Update brush parameters
        BRUSH_PARAMS.brushOrigin.value.copy(rayOrigin);
        BRUSH_PARAMS.brushDirection.value.copy(rayDirection);
        BRUSH_PARAMS.enabled.value = true;

        // Get selected color from wrist palette
        const selectedColor = wristPalette ? wristPalette.getSelectedColor() : { hex: 0x8800ff };
        const color = new THREE.Color(selectedColor.hex).convertLinearToSRGB();
        BRUSH_PARAMS.brushColor.value.x = color.r;
        BRUSH_PARAMS.brushColor.value.y = color.g;
        BRUSH_PARAMS.brushColor.value.z = color.b;

        // Raycast for surface-based depth
        const paintRaycaster = new THREE.Raycaster(rayOrigin, rayDirection);
        const intersects = paintRaycaster.intersectObjects([groundMesh, infiniteFloor], true);
        if (intersects.length > 0) {
            BRUSH_PARAMS.useSurface.value = true;
            BRUSH_PARAMS.surfacePoint.value.copy(intersects[0].point);
        } else {
            BRUSH_PARAMS.useSurface.value = false;
        }

        // Bake painting
        const noSplatRgba = !gaussianSplat.splatRgba;
        gaussianSplat.splatRgba = spark.getRgba({
            generator: gaussianSplat,
            rgba: gaussianSplat.splatRgba
        });

        if (noSplatRgba) {
            gaussianSplat.updateGenerator();
        } else {
            gaussianSplat.updateVersion();
        }

        // Update paint ray visual
        if (gestureVisuals) {
            gestureVisuals.updatePaintRay(handedness, rayOrigin, rayDirection, true);
        }
    };

    gestureDetector.callbacks.onPaintEnd = (handedness) => {
        console.log(`Gesture paint end (${handedness})`);
        BRUSH_PARAMS.enabled.value = false;

        // Hide paint ray visual
        if (gestureVisuals) {
            gestureVisuals.updatePaintRay(handedness, null, null, false);
        }
    };

    // Wire up movement callbacks
    gestureDetector.callbacks.onMovementStart = (direction, speed) => {
        console.log(`Movement gesture started: speed=${speed.toFixed(2)}`);
        vrMovementDirection = direction.clone();
        vrMovementSpeed = speed;
    };

    gestureDetector.callbacks.onMovementUpdate = (direction, speed) => {
        // Update movement state (applied in animation loop)
        vrMovementDirection = direction.clone();
        vrMovementSpeed = speed;
    };

    gestureDetector.callbacks.onMovementEnd = () => {
        console.log('Movement gesture ended');
        vrMovementDirection = null;
        vrMovementSpeed = 0;
    };

    // Wire up jetpack callbacks
    gestureDetector.callbacks.onJetpackStart = (handedness) => {
        console.log(`Jetpack gesture started (${handedness})`);
        if (characterControls) {
            characterControls.activateJetpack();
        }
    };

    gestureDetector.callbacks.onJetpackEnd = (handedness) => {
        console.log(`Jetpack gesture ended (${handedness})`);
        if (characterControls) {
            characterControls.deactivateJetpack();
        }
    };

    // Wire up color selection callback
    gestureDetector.callbacks.onColorSelect = (rayOrigin, rayDirection) => {
        if (wristPalette) {
            const colorIndex = wristPalette.checkHover(rayOrigin, rayDirection);
            if (colorIndex !== null) {
                wristPalette.selectColor(colorIndex);
                gestureDetector.selectedColorIndex = colorIndex;
                console.log(`Color selected: index ${colorIndex}`);
            }
        }
    };

    // Wire up teleportation callbacks (LEFT hand only)
    gestureDetector.callbacks.onTeleportStart = (rayOrigin, rayDirection) => {
        console.log('Teleport started (LEFT hand)');
        if (xrManager) {
            // Cast ray to find ground target
            const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
            const intersects = raycaster.intersectObjects([groundMesh, infiniteFloor], true);

            if (intersects.length > 0) {
                // Show teleport reticle at target
                xrManager.updateTeleportTarget(intersects[0].point);
            } else {
                // No valid target
                xrManager.updateTeleportTarget(null);
            }
        }
    };

    gestureDetector.callbacks.onTeleportUpdate = (rayOrigin, rayDirection) => {
        if (xrManager) {
            // Update ray as hand moves
            const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
            const intersects = raycaster.intersectObjects([groundMesh, infiniteFloor], true);

            if (intersects.length > 0) {
                xrManager.updateTeleportTarget(intersects[0].point);
            } else {
                xrManager.updateTeleportTarget(null);
            }
        }
    };

    gestureDetector.callbacks.onTeleportEnd = (rayOrigin, rayDirection) => {
        console.log('Teleport executed (LEFT hand released)');
        if (xrManager) {
            // Execute teleport to target (if valid)
            xrManager.executeTeleport();
        }
    };

    // Wire up paint mode toggle callback
    gestureDetector.callbacks.onTogglePaintMode = (enabled) => {
        console.log(`Paint mode toggled via gesture: ${enabled ? 'ON' : 'OFF'}`);

        // Sync with controller paint mode if using controllers
        if (xrControllers) {
            xrControllers.isPaintMode = enabled;
        }

        // Update brush state
        if (gaussianSplat) {
            BRUSH_PARAMS.enabled.value = enabled;
        }
    };

    // Link components together
    xrManager.characterControls = characterControls;
    xrManager.orbitControls = orbitControls;
    xrManager.xrControllers = xrControllers;
    xrManager.xrHands = xrHands;
    xrManager.gestureDetector = gestureDetector;

    console.log('WebXR system initialized with gesture detection');
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
 * Set up paint toggle button for mobile
 */
function setupPaintToggleButton() {
    const toggleButton = document.getElementById('paint-toggle-button');

    if (toggleButton && isMobile) {
        // Handle both click and touchstart for mobile
        toggleButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMobilePaintMode();
        });

        toggleButton.addEventListener('touchstart', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMobilePaintMode();
        }, { passive: false });

        console.log('Paint toggle button initialized');
    }
}

/**
 * Toggle paint mode on mobile
 */
function toggleMobilePaintMode() {
    isPaintMode = !isPaintMode;

    // Update button appearance
    const toggleButton = document.getElementById('paint-toggle-button');
    if (toggleButton) {
        if (isPaintMode) {
            toggleButton.classList.add('active');
        } else {
            toggleButton.classList.remove('active');
        }
    }

    // Update touch controls
    if (touchControls) {
        touchControls.setPaintMode(isPaintMode);
    }

    console.log(`Mobile paint mode: ${isPaintMode ? 'ON' : 'OFF'}`);
}

/**
 * Handle mobile painting (called from touch controls)
 * @param {number} x - Touch X coordinate
 * @param {number} y - Touch Y coordinate
 */
function handleMobilePaint(x, y) {
    if (!isPaintMode || !gaussianSplat || !paintRaycaster) return;

    // Use default purple color (same as desktop default)
    const paintColor = new THREE.Vector3(1.0, 0.0, 1.0); // Purple in linear RGB

    // Convert screen coordinates to normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    // Raycast from camera
    paintRaycaster.setFromCamera(mouse, camera);

    // Update brush parameters
    BRUSH_PARAMS.brushOrigin.value.copy(paintRaycaster.ray.origin);
    BRUSH_PARAMS.brushDirection.value.copy(paintRaycaster.ray.direction);
    BRUSH_PARAMS.brushColor.value.copy(paintColor);

    // Check collision with ground mesh
    const intersects = paintRaycaster.intersectObjects([groundMesh, infiniteFloor], true);

    if (intersects.length > 0) {
        // Surface-based depth mode (preferred)
        BRUSH_PARAMS.useSurface.value = true;
        BRUSH_PARAMS.surfacePoint.value.copy(intersects[0].point);
    } else {
        // Cylinder-based fallback mode
        BRUSH_PARAMS.useSurface.value = false;
    }

    // Enable brush to apply changes
    BRUSH_PARAMS.enabled.value = true;

    // Bake changes to texture (same as desktop paint logic)
    const noSplatRgba = !gaussianSplat.splatRgba;
    gaussianSplat.splatRgba = spark.getRgba({
        generator: gaussianSplat,
        rgba: gaussianSplat.splatRgba
    });

    if (noSplatRgba) {
        gaussianSplat.updateGenerator();
    } else {
        gaussianSplat.updateVersion();
    }
}

/**
 * Handle end of mobile painting (called when touch ends)
 */
function handleMobilePaintEnd() {
    // Disable brush preview
    if (BRUSH_PARAMS && BRUSH_PARAMS.enabled) {
        BRUSH_PARAMS.enabled.value = false;
    }
}

/**
 * Set up jump/jetpack button for mobile
 */
function setupJumpJetpackButton() {
    const button = document.getElementById('jump-jetpack-button');

    if (button && isMobile) {
        let longPressTimer = null;
        const longPressThreshold = 400; // ms

        // Handle touchstart for jump/jetpack
        button.addEventListener('touchstart', (event) => {
            event.preventDefault();
            event.stopPropagation();

            // Trigger jump immediately
            keysPressed[' '] = true;
            setTimeout(() => {
                if (!touchControls || !touchControls.jetpackActive) {
                    keysPressed[' '] = false;
                }
            }, 50);

            // Start long press timer for jetpack
            longPressTimer = setTimeout(() => {
                if (touchControls) {
                    touchControls.activateJetpack();
                    button.classList.add('jetpack-active');
                }
            }, longPressThreshold);
        }, { passive: false });

        // Handle touchend to cancel long press or deactivate jetpack
        button.addEventListener('touchend', (event) => {
            event.preventDefault();
            event.stopPropagation();

            // Cancel long press timer
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            // Deactivate jetpack if active
            if (touchControls && touchControls.jetpackActive) {
                touchControls.deactivateJetpack();
                button.classList.remove('jetpack-active');
            }
        }, { passive: false });

        // Handle touchcancel
        button.addEventListener('touchcancel', (event) => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (touchControls && touchControls.jetpackActive) {
                touchControls.deactivateJetpack();
                button.classList.remove('jetpack-active');
            }
        }, { passive: false });

        console.log('Jump/jetpack button initialized');
    }
}

/**
 * Handle mouse movement for first-person camera rotation
 */
function onMouseMove(event) {
    if (cameraMode !== 'first-person') {
        return;
    }

    // Only rotate camera if pointer is locked (paint mode disables rotation)
    if (!pointerLocked) {
        return;
    }

    // Update yaw (horizontal rotation) - unlimited
    firstPersonYaw -= event.movementX * FIRST_PERSON_MOUSE_SENSITIVITY;

    // Update pitch (vertical rotation) - clamped to ±85 degrees
    firstPersonPitch -= event.movementY * FIRST_PERSON_MOUSE_SENSITIVITY;
    firstPersonPitch = Math.max(-FIRST_PERSON_MAX_PITCH, Math.min(FIRST_PERSON_MAX_PITCH, firstPersonPitch));

    // Send rotation to CharacterControls
    if (characterControls) {
        characterControls.setFirstPersonRotation(firstPersonPitch, firstPersonYaw);
    }
}

// Mouse down/up handlers removed - no longer needed for camera rotation in paint mode
// Paint mode now uses left-click for painting, camera rotation is disabled

/**
 * Handle pointer lock change events
 */
function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    console.log(`Pointer lock: ${pointerLocked ? 'LOCKED' : 'UNLOCKED'}`);
}

/**
 * Handle pointer lock error
 */
function onPointerLockError() {
    console.error('Pointer lock failed');
}

/**
 * Request pointer lock for first-person mode
 * (disabled in paint mode)
 */
function requestPointerLock() {
    // Don't request if in paint mode (uses left-click drag instead)
    if (cameraMode === 'first-person' && !isMobile && !isPaintMode) {
        renderer.domElement.requestPointerLock();
    }
}

/**
 * Exit pointer lock
 */
function exitPointerLock() {
    if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
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
 * Toggle paint mode on/off
 */
function togglePaintMode() {
    isPaintMode = !isPaintMode;
    BRUSH_PARAMS.enabled.value = isPaintMode;

    // Update splat to reflect brush state change
    if (gaussianSplat) {
        gaussianSplat.needsUpdate = true;
    }

    // Show/hide paint controls UI
    const paintControls = document.getElementById('paint-controls');
    if (paintControls) {
        if (isPaintMode) {
            paintControls.classList.add('visible');
        } else {
            paintControls.classList.remove('visible');
        }
    }

    // Update canvas cursor class
    if (isPaintMode) {
        renderer.domElement.classList.add('paint-mode');
    } else {
        renderer.domElement.classList.remove('paint-mode');
    }

    // Disable camera controls in paint mode
    if (isPaintMode) {
        // Exit pointer lock when entering paint mode (first-person)
        exitPointerLock();

        // Disable OrbitControls when entering paint mode (third-person)
        if (cameraMode === 'third-person') {
            orbitControls.enabled = false;
        }

        console.log('Paint mode: ON - LEFT-click drag or CTRL+move to paint, camera rotation disabled');
    } else {
        // Re-enable camera controls when exiting paint mode
        if (cameraMode === 'first-person') {
            // Request pointer lock for first-person
            requestPointerLock();
        } else if (cameraMode === 'third-person') {
            // Re-enable OrbitControls for third-person
            orbitControls.enabled = true;
        }

        console.log('Paint mode: OFF');
    }
}


/**
 * Adjust brush radius
 */
function adjustBrushRadius(delta) {
    const current = BRUSH_PARAMS.brushRadius.value;
    const newValue = Math.max(MIN_BRUSH_RADIUS, Math.min(MAX_BRUSH_RADIUS, current + delta));
    BRUSH_PARAMS.brushRadius.value = newValue;
    console.log(`Brush radius: ${newValue.toFixed(3)}`);
    updateBrushSizeDisplay();
}

/**
 * Adjust brush depth
 */
function adjustBrushDepth(delta) {
    const current = BRUSH_PARAMS.brushDepth.value;
    const newValue = Math.max(MIN_BRUSH_DEPTH, Math.min(MAX_BRUSH_DEPTH, current + delta));
    BRUSH_PARAMS.brushDepth.value = newValue;
    console.log(`Brush depth: ${newValue.toFixed(1)}`);
    updateBrushSizeDisplay();
}

/**
 * Update brush size display in UI
 */
function updateBrushSizeDisplay() {
    const display = document.getElementById('brush-size-display');
    if (display) {
        display.textContent = `Radius: ${BRUSH_PARAMS.brushRadius.value.toFixed(3)} | Depth: ${BRUSH_PARAMS.brushDepth.value.toFixed(1)}`;
    }
}

/**
 * Initialize color picker
 */
function setupColorPicker() {
    const colorPicker = document.getElementById('color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', (event) => {
            const hexColor = event.target.value;
            // Convert hex to linear RGB (same as example)
            const color = new THREE.Color(hexColor).convertLinearToSRGB();
            BRUSH_PARAMS.brushColor.value.x = color.r;
            BRUSH_PARAMS.brushColor.value.y = color.g;
            BRUSH_PARAMS.brushColor.value.z = color.b;
            console.log(`Brush color changed to: ${hexColor}`, color);
        });
        console.log('Color picker initialized');
    }

    // Initialize brush size display
    updateBrushSizeDisplay();
}

/**
 * Set up paint event listeners for mouse interactions
 */
function setupPaintControls() {
    // Mouse move handler for brush preview and painting
    renderer.domElement.addEventListener('pointermove', (event) => {
        if (!isPaintMode || !gaussianSplat || !paintRaycaster) return;

        // Calculate normalized device coordinates
        const clickCoords = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );

        // Update raycaster from camera
        paintRaycaster.setFromCamera(clickCoords, camera);

        // Update brush parameters with ray
        const direction = paintRaycaster.ray.direction.normalize();
        BRUSH_PARAMS.brushDirection.value.x = direction.x;
        BRUSH_PARAMS.brushDirection.value.y = direction.y;
        BRUSH_PARAMS.brushDirection.value.z = direction.z;
        BRUSH_PARAMS.brushOrigin.value.x = paintRaycaster.ray.origin.x;
        BRUSH_PARAMS.brushOrigin.value.y = paintRaycaster.ray.origin.y;
        BRUSH_PARAMS.brushOrigin.value.z = paintRaycaster.ray.origin.z;

        // Raycast against collision mesh for surface-based painting
        if (groundMesh) {
            const intersects = paintRaycaster.intersectObject(groundMesh, false);

            if (intersects.length > 0) {
                // Hit the collision mesh - use surface-based painting
                const hitPoint = intersects[0].point;
                BRUSH_PARAMS.useSurface.value = true;
                BRUSH_PARAMS.surfacePoint.value.x = hitPoint.x;
                BRUSH_PARAMS.surfacePoint.value.y = hitPoint.y;
                BRUSH_PARAMS.surfacePoint.value.z = hitPoint.z;
            } else {
                // No collision mesh hit - use cylinder-based painting (fallback)
                BRUSH_PARAMS.useSurface.value = false;
            }
        } else {
            // No collision mesh available - use cylinder-based painting
            BRUSH_PARAMS.useSurface.value = false;
        }

        // Mark splat as needing update for preview
        if (gaussianSplat) {
            gaussianSplat.needsUpdate = true;
        }

        // Apply painting effect while dragging or CTRL pressed
        if ((isDragging || isCtrlPressed) && gaussianSplat) {
            const noSplatRgba = !gaussianSplat.splatRgba;
            gaussianSplat.splatRgba = spark.getRgba({
                generator: gaussianSplat,
                rgba: gaussianSplat.splatRgba
            });

            if (noSplatRgba) {
                gaussianSplat.updateGenerator();
            } else {
                gaussianSplat.updateVersion();
            }
        }
    });

    // Mouse down handler to start painting (LEFT click drag)
    renderer.domElement.addEventListener('pointerdown', (event) => {
        // Handle LEFT button (button 0) for click-drag painting
        if (!isPaintMode || !gaussianSplat || event.button !== 0) return;

        event.preventDefault();

        isDragging = true;

        // Bake current changes
        const noSplatRgba = !gaussianSplat.splatRgba;
        gaussianSplat.splatRgba = spark.getRgba({
            generator: gaussianSplat,
            rgba: gaussianSplat.splatRgba
        });

        if (noSplatRgba) {
            gaussianSplat.updateGenerator();
        } else {
            gaussianSplat.updateVersion();
        }
    });

    // Mouse up handler to stop painting (LEFT click drag)
    renderer.domElement.addEventListener('pointerup', (event) => {
        // Handle LEFT button (button 0) for click-drag painting
        if (!isPaintMode || event.button !== 0) return;
        isDragging = false;
    });

    console.log('Paint controls initialized');
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

        // Track CTRL key for paint-on-move
        if (event.key === 'Control') {
            isCtrlPressed = true;
        }

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

        // Toggle camera view on V
        if (key === 'v') {
            toggleCameraMode();
        }

        // Toggle paint mode on P
        if (key === 'p') {
            togglePaintMode();
        }

        // Manual quality controls for adaptive quality system
        // Q: Increase quality (locks to manual mode)
        if (key === 'q') {
            if (adaptiveQuality) {
                adaptiveQuality.increaseQuality();
            }
        }

        // E: Decrease quality (locks to manual mode)
        if (key === 'e') {
            if (adaptiveQuality) {
                adaptiveQuality.decreaseQuality();
            }
        }

        // T: Resume adaptive quality adjustment
        if (key === 't') {
            if (adaptiveQuality) {
                adaptiveQuality.resumeAdaptive();
            }
        }

        // Adjust brush radius with +/- keys
        if (key === '=' || key === '+') {
            adjustBrushRadius(0.01);
        }
        if (key === '-' || key === '_') {
            adjustBrushRadius(-0.01);
        }

        // Adjust brush depth with [/] keys
        if (key === '[') {
            adjustBrushDepth(-1.0);
        }
        if (key === ']') {
            adjustBrushDepth(1.0);
        }
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();

        // Track CTRL key for paint-on-move
        if (event.key === 'Control') {
            isCtrlPressed = false;
        }

        keysPressed[key] = false;
        keyDisplayQueue.up(key);
    });

    console.log('Keyboard controls initialized');
}

/**
 * Set up start button click handler
 */
async function setupStartButton() {
    const startButton = document.getElementById('start-button');
    const startOverlay = document.getElementById('start-overlay');

    // Handler function for starting the experience
    const handleStart = (event) => {
        // Prevent default behavior and event propagation
        event.preventDefault();
        event.stopPropagation();

        // SAFETY CHECK: Ensure assets are fully loaded before starting
        if (!collisionLoaded || !splatLoaded) {
            console.warn('Assets not fully loaded yet, cannot start experience');
            alert('Please wait for assets to finish loading...');
            return;
        }

        console.log('Start button triggered - entering experience');

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

    // Setup single start button (VR accessed via in-app Three.js button)
    if (startButton) {
        startButton.addEventListener('click', handleStart);
        if (isMobile) {
            startButton.addEventListener('touchstart', handleStart, { passive: false });
        }
    }

    console.log('Start button initialized');
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

    // Update adaptive quality system (FPS monitoring and preset switching)
    if (adaptiveQuality) {
        adaptiveQuality.update();
        fps = adaptiveQuality.getFPS();

        // Update FPS display
        const debugFps = document.getElementById('debug-fps');
        if (debugFps) {
            debugFps.textContent = fps;
        }

        // Update quality preset display
        const debugQuality = document.getElementById('debug-quality');
        if (debugQuality) {
            const qualityName = adaptiveQuality.getCurrentQualityName();
            const mode = adaptiveQuality.isManualMode() ? 'MANUAL' : 'Auto';
            debugQuality.textContent = `${qualityName} (${mode})`;
        }

        // Update decimation display (show quality index)
        const debugDecimation = document.getElementById('debug-decimation');
        if (debugDecimation) {
            const index = adaptiveQuality.getCurrentQualityIndex();
            const presets = adaptiveQuality.getQualityPresets();
            debugDecimation.textContent = `${index}/${presets.length - 1}`;
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

                // Notify CharacterControls and TouchControls
                characterControls.setCameraMode('first-person');
                characterControls.setFirstPersonRotation(firstPersonPitch, firstPersonYaw);
                if (touchControls) {
                    touchControls.setCameraMode('first-person');
                }

                // Request pointer lock for first-person camera control
                requestPointerLock();

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

                // Notify CharacterControls and TouchControls
                characterControls.setCameraMode('third-person');
                if (touchControls) {
                    touchControls.setCameraMode('third-person');
                }

                // Exit pointer lock when returning to third-person
                exitPointerLock();

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
    const isXRActive = xrManager && xrManager.getIsXRActive();

    // Dynamically adjust target FPS when entering/exiting VR
    if (adaptiveQuality) {
        const currentTargetIsVR = adaptiveQuality.targetFPS === adaptiveQuality.vrTargetFPS;
        if (isXRActive && !currentTargetIsVR) {
            // Just entered VR - switch to VR target FPS (50+)
            adaptiveQuality.setTargetFPS(adaptiveQuality.vrTargetFPS);
        } else if (!isXRActive && currentTargetIsVR) {
            // Just exited VR - switch back to desktop/mobile target FPS
            const nonVRTarget = isMobile ? adaptiveQuality.mobileTargetFPS : adaptiveQuality.desktopTargetFPS;
            adaptiveQuality.setTargetFPS(nonVRTarget);
        }
    }

    if (isXRActive) {
        // In VR mode: update XR physics and controllers
        xrManager.update(delta, [groundMesh, infiniteFloor]);

        // Update gesture detection for hand tracking
        if (gestureDetector) {
            const session = renderer.xr.getSession();
            gestureDetector.update(session, camera.position);
        }

        // Update wrist-mounted color palette (shows when palm facing user)
        if (wristPalette) {
            wristPalette.update(camera.position);
        }

        // Apply VR gesture movement and update visuals
        if (vrMovementDirection && vrMovementSpeed > 0 && xrManager) {
            // Base movement speeds (matching desktop controls)
            const walkSpeed = sceneConfig?.controls?.walkSpeed || 1.5;
            const runSpeed = sceneConfig?.controls?.runSpeed || 3.0;

            // Interpolate between walk and run based on hand extension
            const baseSpeed = walkSpeed + (runSpeed - walkSpeed) * vrMovementSpeed;

            // Calculate movement offset
            const movementOffset = vrMovementDirection.clone().multiplyScalar(baseSpeed * delta);

            // Apply to reference space
            xrManager.updateReferenceSpaceByOffset(movementOffset);

            // Update movement arrow visual
            if (gestureVisuals) {
                gestureVisuals.updateMovementArrow(camera.position, vrMovementDirection, vrMovementSpeed, true);
            }
        } else if (gestureVisuals) {
            // Hide movement arrow when not moving
            gestureVisuals.hideMovementArrow();
        }

        // Update jetpack glow visuals
        if (gestureVisuals && gestureDetector) {
            const isJetpacking = gestureDetector.mode === 'jetpack' || gestureDetector.mode === 'moving_jetpack';
            if (isJetpacking) {
                // Get right hand position for glow
                const session = renderer.xr.getSession();
                if (session) {
                    for (const source of session.inputSources) {
                        if (source.hand && source.handedness === 'right') {
                            const wrist = xrHands.getJointPosition(source.hand, 'wrist');
                            if (wrist) {
                                gestureVisuals.updateJetpackGlow('right', wrist, true);
                            }
                            break;
                        }
                    }
                }
            } else {
                gestureVisuals.hideJetpackGlows();
            }
        }

        // Update VR painting
        if (xrControllers && xrControllers.isPaintMode && gaussianSplat) {
            // Try both controllers for painting
            for (let controllerIndex = 0; controllerIndex < 2; controllerIndex++) {
                const rayData = xrControllers.getRayForPainting(controllerIndex);
                if (rayData) {
                    console.log(`VR Paint: controller ${controllerIndex} painting - isDragging: ${xrControllers.isDragging}`);
                    // Update brush parameters with controller ray
                    BRUSH_PARAMS.brushOrigin.value.copy(rayData.origin);
                    BRUSH_PARAMS.brushDirection.value.copy(rayData.direction);

                    // Update brush color from selected palette color
                    const selectedColor = xrControllers.paletteColors[xrControllers.currentColorIndex];
                    const color = new THREE.Color(selectedColor.hex).convertLinearToSRGB();
                    BRUSH_PARAMS.brushColor.value.x = color.r;
                    BRUSH_PARAMS.brushColor.value.y = color.g;
                    BRUSH_PARAMS.brushColor.value.z = color.b;

                    // Enable brush in VR paint mode
                    BRUSH_PARAMS.enabled.value = true;

                    // If dragging (trigger held), bake the painting
                    if (xrControllers.isDragging) {
                        console.log('VR Paint: Baking paint to texture');
                        const noSplatRgba = !gaussianSplat.splatRgba;
                        gaussianSplat.splatRgba = spark.getRgba({
                            generator: gaussianSplat,
                            rgba: gaussianSplat.splatRgba
                        });

                        if (noSplatRgba) {
                            gaussianSplat.updateGenerator();
                        } else {
                            gaussianSplat.updateVersion();
                        }
                    }

                    break; // Only use one controller at a time
                }
            }
        } else if (xrControllers && !xrControllers.isPaintMode) {
            // Disable brush when not in paint mode
            BRUSH_PARAMS.enabled.value = false;
        }

        // Still update debug display
        if (characterControls) {
            const debugState = document.getElementById('debug-state');
            const debugAnimation = document.getElementById('debug-animation');
            const debugJetpack = document.getElementById('debug-jetpack');
            const debugGroundDist = document.getElementById('debug-ground-dist');

            if (debugState && debugAnimation && debugJetpack && debugGroundDist) {
                const isGrounded = xrManager.isGrounded;
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
            const debugPosition = document.getElementById('debug-position');

            if (debugState && debugAnimation && debugJetpack && debugGroundDist && debugPosition) {
                const isGrounded = characterControls.getGroundedState();
                const currentAction = characterControls.getCurrentAction();
                const isJetpackActive = characterControls.getJetpackActive();
                const groundDistance = characterControls.getGroundDistance();
                const position = characterControls.getPosition();

                debugState.textContent = isGrounded ? 'GROUNDED' : 'IN AIR';
                debugState.className = isGrounded ? 'grounded' : 'in-air';
                debugAnimation.textContent = currentAction;
                debugJetpack.textContent = isJetpackActive ? 'ACTIVE' : 'OFF';
                debugJetpack.className = isJetpackActive ? 'jetpack-active' : '';
                debugGroundDist.textContent = groundDistance.toFixed(1) + 'm';
                debugPosition.textContent = `(${position.x.toFixed(1)}|${position.y.toFixed(1)}|${position.z.toFixed(1)})`;
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
    if (!isCameraTransitioning && !isXRActive) {
        orbitControls.update();
    }

    // Render scene
    renderer.render(scene, camera);
}

/**
 * Update height slider bounds after collision mesh loads
 */
function updateHeightSliderBounds() {
    const heightSlider = document.getElementById('level-height-slider');
    const heightValue = document.getElementById('level-height-value');

    if (heightSlider && heightValue) {
        heightSlider.min = minOffsetDown.toFixed(2);
        heightSlider.max = maxOffsetUp.toFixed(2);
        heightSlider.value = heightOffset.toString();
        heightValue.textContent = `${heightOffset.toFixed(2)} [${minOffsetDown.toFixed(2)} to ${maxOffsetUp.toFixed(2)}]`;
        console.log(`[UI] Height slider bounds updated: [${minOffsetDown.toFixed(2)} to ${maxOffsetUp.toFixed(2)}]`);
    }
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

    // Height slider bounds will be set after collision mesh loads (via updateHeightSliderBounds)
    // Just set initial value for now
    if (heightSlider && heightValue) {
        heightSlider.value = heightOffset.toString();
        heightValue.textContent = `${heightOffset.toFixed(2)} [calculating...]`;
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
            heightValue.textContent = `${heightOffset.toFixed(2)} [${minOffsetDown.toFixed(2)} to ${maxOffsetUp.toFixed(2)}]`;
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

            // Resolve heightOffset config value ("max", "min", or number)
            let defaultHeight = 0.0;
            if (heightOffsetConfigValue === "max") {
                defaultHeight = maxOffsetUp;
            } else if (heightOffsetConfigValue === "min") {
                defaultHeight = minOffsetDown;
            } else if (typeof heightOffsetConfigValue === 'number') {
                defaultHeight = heightOffsetConfigValue;
            }

            levelRotationX = defaultLevelingX;
            levelRotationZ = defaultLevelingZ;
            heightOffset = defaultHeight;
            xSlider.value = defaultLevelingX;
            zSlider.value = defaultLevelingZ;
            heightSlider.value = defaultHeight;
            xValue.textContent = defaultLevelingX.toFixed(1) + '°';
            zValue.textContent = defaultLevelingZ.toFixed(1) + '°';
            heightValue.textContent = `${defaultHeight.toFixed(2)} [${minOffsetDown.toFixed(2)} to ${maxOffsetUp.toFixed(2)}]`;

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
                // Use URLRouter to preserve URL parameters during scene change
                urlRouter.navigateToSite(sceneId);
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
                    // Use URLRouter to preserve URL parameters during scene change
                    urlRouter.navigateToSite(sceneId);
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

    // Apply scale from config
    if (sceneConfig.transform.scale !== undefined) {
        splatScale = sceneConfig.transform.scale;
        console.log('Applied scale from config:', splatScale);
    }

    // Apply base rotation from config
    if (sceneConfig.transform.rotation) {
        baseRotationX = sceneConfig.transform.rotation.x !== undefined ? sceneConfig.transform.rotation.x : 180;
        baseRotationY = sceneConfig.transform.rotation.y !== undefined ? sceneConfig.transform.rotation.y : 0;
        baseRotationZ = sceneConfig.transform.rotation.z !== undefined ? sceneConfig.transform.rotation.z : 0;
        console.log('Applied rotation from config:', baseRotationX, baseRotationY, baseRotationZ);
    }

    // Apply leveling defaults from config
    if (sceneConfig.transform.defaultLeveling) {
        levelRotationX = sceneConfig.transform.defaultLeveling.x || 0;
        levelRotationZ = sceneConfig.transform.defaultLeveling.z || 0;
    }

    // Store height offset config value (can be number, "max", or "min")
    // Will be resolved to actual value after collision mesh loads
    if (sceneConfig.transform.heightOffset !== undefined) {
        heightOffsetConfigValue = sceneConfig.transform.heightOffset;
        // If it's a number, apply it immediately
        if (typeof heightOffsetConfigValue === 'number') {
            heightOffset = heightOffsetConfigValue;
        }
        // If it's "max" or "min", will be resolved after bounds are calculated
        console.log(`[Config] heightOffset config value: ${heightOffsetConfigValue}`);
    }

    // Apply lighting defaults
    if (sceneConfig.lighting.directional) {
        lightAzimuth = sceneConfig.lighting.directional.azimuth;
        lightElevation = sceneConfig.lighting.directional.elevation;
    }

    console.log('Scene configuration applied to global state');
}

/**
 * Initialize and display the globe for site selection
 * @param {Array} scenes - Array of available scenes
 */
async function initGlobe(scenes) {
    console.log('Initializing globe view...');

    // Hide start overlay immediately to prevent flash
    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) {
        startOverlay.classList.remove('visible');
        startOverlay.style.display = 'none';
    }

    const globeContainer = document.getElementById('globe-overlay');
    if (!globeContainer) {
        console.error('Globe container not found');
        return;
    }

    // Create globe view with site selection callback
    globeView = new GlobeView(globeContainer, (siteId) => {
        console.log('Site selected:', siteId);
        // Navigate to selected site
        urlRouter.navigateToSite(siteId);
    });

    // Initialize globe with scenes data
    await globeView.init(scenes);

    // Show globe overlay
    globeView.show();

    console.log('Globe view initialized successfully');
}

/**
 * Initialize the application
 */
async function init() {
    console.log('Initializing F1000...');

    // Initialize scene selector first
    await initSceneSelector();

    // Initialize URL router
    urlRouter = new URLRouter();
    const scenes = getAvailableScenes(scenesManifest);

    // Check if we should show globe or proceed to site
    if (urlRouter.shouldShowGlobe(scenes)) {
        console.log('No valid site parameter - showing globe');
        await initGlobe(scenes);
        return; // Stop here - globe will handle navigation to sites
    }

    // Valid site parameter exists - proceed with that site
    console.log('Valid site parameter found - loading site:', urlRouter.getCurrentSiteId());
    let sceneToLoad = urlRouter.getCurrentSiteId();

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
    setupPaintControls();
    setupColorPicker();
    setupLevelingControls();
    setupStartButton();
    setupCameraToggleButton();
    setupPaintToggleButton();
    setupJumpJetpackButton();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Set up mouse event listeners for camera control
    document.addEventListener('mousemove', onMouseMove);

    // Set up pointer lock event listeners
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);

    // Start animation loop using setAnimationLoop for WebXR compatibility
    renderer.setAnimationLoop(animate);

    console.log('F1000 initialized successfully');
}

// Start the application
init();
