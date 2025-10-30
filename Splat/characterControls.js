import * as THREE from 'three';
import { A, D, S, W, SPACE } from './utils.js';

/**
 * CharacterControls - Manages character movement, rotation, and animation
 *
 * Features:
 * - Smooth animation transitions between idle, walk, and run
 * - Camera-relative movement direction
 * - Quaternion-based rotation for smooth turning
 * - Velocity-based movement for realistic motion
 * - Jump and gravity physics
 */
export class CharacterControls {
    // State
    currentAction;
    toggleRun = true;

    // Walk/Run configuration
    walkVelocity = 2;
    runVelocity = 5;

    // Jump and Gravity configuration
    jumpForce = 8;              // Initial jump velocity (units/second)
    gravity = -20;               // Gravity acceleration (units/second²)
    maxFallSpeed = -50;          // Maximum falling velocity
    jumpCooldownDuration = 0.3;  // Jump cooldown in seconds
    characterHeightOffset = 0;   // Character pivot offset (0 = pivot at feet)
    maxHeight = null;            // Maximum height cap (null = no cap)

    // Jump state
    verticalVelocity = 0;        // Current vertical velocity
    isGrounded = true;           // Is character on the ground
    jumpCooldown = 0;            // Current jump cooldown timer
    timeInAir = 0;               // Time spent continuously in air
    airTimeThreshold = 0.4;      // Min air time before animation switches to Idle (prevents downhill flicker)

    // Jetpack state
    isJetpackActive = false;     // Is jetpack currently engaged
    jetpackThrust = 25;          // Upward acceleration (counters gravity)
    jetpackTransitionDuration = 0.3;  // Time to smoothly restore gravity after release
    jetpackTransitionTimer = 0;  // Tracks transition progress

    // Movement inertia - preserve horizontal velocity during falls (jumps & jetpack)
    inertiaVelocityX = 0;        // Stored horizontal X velocity from last airborne movement
    inertiaVelocityZ = 0;        // Stored horizontal Z velocity from last airborne movement
    hasInertia = false;          // Flag indicating if inertia should be applied during fall

    // Ground detection
    raycaster = new THREE.Raycaster();
    groundMeshes = [];
    rayOrigin = new THREE.Vector3();
    rayDirection = new THREE.Vector3(0, -1, 0);

    // Forward and ceiling collision detection
    forwardRaycaster = new THREE.Raycaster();
    ceilingRaycaster = new THREE.Raycaster();
    forwardGroundRaycaster = new THREE.Raycaster();
    forwardCollisionDistance = 0.5;  // Distance to check ahead (short range)
    ceilingCollisionDistance = 2.5;  // Distance to check above (character height + buffer)

    // Walkable terrain limits
    maxSlopeAngle = Math.PI / 3;     // 60 degrees - maximum walkable slope
    maxStepHeight = 0.5;              // Maximum step height character can climb

    // Collision calculation vectors (reused to avoid allocations)
    tempCollisionVector = new THREE.Vector3();
    tempCollisionNormal = new THREE.Vector3();
    tempSlideVector = new THREE.Vector3();

    // Movement vectors
    walkDirection = new THREE.Vector3();
    rotateAngle = new THREE.Vector3(0, 1, 0);
    rotateQuaternion = new THREE.Quaternion();

    // Animation constants
    fadeDuration = 0.2;

    // Temporary calculation objects
    updateCameraTargetOffset = new THREE.Vector3();

    // Camera mode (third-person or first-person)
    cameraMode = 'third-person';  // 'third-person' or 'first-person'
    firstPersonPitch = 0;         // Camera pitch rotation (radians)
    firstPersonYaw = 0;           // Camera yaw rotation (radians)
    firstPersonHeadHeight = 1.6;  // Height offset for first-person camera
    targetOffsetY = 1;            // Camera target Y offset from character (default 1)

    constructor(
        model,
        mixer,
        animationsMap,
        orbitControl,
        camera,
        currentAction,
        groundMeshes,
        maxHeight = null,
        targetOffsetY = 1
    ) {
        // Jetpack audio is now handled by AudioManager
        this.model = model;
        this.mixer = mixer;
        this.animationsMap = animationsMap;
        this.orbitControl = orbitControl;
        this.camera = camera;
        this.currentAction = currentAction;

        // Support both single mesh and array of meshes
        if (groundMeshes) {
            this.groundMeshes = Array.isArray(groundMeshes) ? groundMeshes : [groundMeshes];
        }

        // Set max height cap if provided
        if (maxHeight !== null) {
            this.maxHeight = maxHeight;
        }

        // Set camera target offset
        this.targetOffsetY = targetOffsetY;

        // Jetpack audio is now handled by AudioManager

        // Play initial animation
        this.animationsMap.forEach((value, key) => {
            if (key === currentAction) {
                value.play();
            }
        });
    }

    /**
     * Toggle run mode on/off
     */
    switchRunToggle() {
        this.toggleRun = !this.toggleRun;
    }

    /**
     * Get current grounded state for debugging
     */
    getGroundedState() {
        return this.isGrounded;
    }

    /**
     * Get current animation state for debugging
     */
    getCurrentAction() {
        return this.currentAction;
    }

    /**
     * Get jetpack active state for debugging
     */
    getJetpackActive() {
        return this.isJetpackActive;
    }

    /**
     * Get distance to ground for debugging
     */
    getGroundDistance() {
        const groundInfo = this.getGroundInfo();
        return Math.max(0, this.model.position.y - groundInfo.height);
    }

    /**
     * Get current movement state for audio system
     * @returns {string} - 'idle', 'walk', 'run', or 'jetpack'
     *
     * NOTE: AudioManager now uses Web Audio API for reliable volume control on iOS.
     */
    getMovementState() {
        // Jetpack state takes priority (airborne with active thrust)
        if (this.isJetpackActive && !this.isGrounded) {
            return 'jetpack';
        }

        // If in air for longer than threshold without jetpack, it's 'idle'
        if (!this.isGrounded && this.timeInAir > this.airTimeThreshold) {
            return 'idle';
        }

        // Check if any direction key is pressed by looking at current action
        // The current action is already set based on movement in update()
        if (this.currentAction === 'Run') {
            return 'run';
        } else if (this.currentAction === 'Walk') {
            return 'walk';
        }

        return 'idle';
    }

    /**
     * Set camera mode (third-person or first-person)
     * @param {string} mode - 'third-person' or 'first-person'
     */
    setCameraMode(mode) {
        this.cameraMode = mode;
        console.log(`CharacterControls: Camera mode set to ${mode}`);
    }

    /**
     * Set first-person camera rotation
     * @param {number} pitch - Vertical rotation in radians
     * @param {number} yaw - Horizontal rotation in radians
     */
    setFirstPersonRotation(pitch, yaw) {
        this.firstPersonPitch = pitch;
        this.firstPersonYaw = yaw;
    }

    /**
     * Initialize thruster sound effect
     */
    // Jetpack audio methods removed - now handled by AudioManager

    /**
     * Initialize character position on ground
     * Called once after character loads to place it on terrain
     */
    placeOnGround() {
        const groundInfo = this.getGroundInfo();
        this.model.position.y = groundInfo.height + this.characterHeightOffset;
        console.log(`Character placed on ground at Y: ${this.model.position.y.toFixed(2)}`);
    }

    /**
     * Detect ground height and normal using raycasting
     * Returns object with ground height and normal vector (in world space)
     */
    getGroundInfo() {
        if (this.groundMeshes.length === 0) {
            return { height: 0, normal: null }; // Fallback to Y=0 if no ground meshes
        }

        // CRITICAL: Cast ray from character CENTER, not above
        // This prevents detecting bridges/platforms ABOVE the character
        // Ray starts from character center (same height as forward collision check)
        this.rayOrigin.set(
            this.model.position.x,
            this.model.position.y + 1.0,  // Start from character center (NOT above)
            this.model.position.z
        );

        // Cast ray downward against all ground meshes
        this.raycaster.set(this.rayOrigin, this.rayDirection);
        const intersects = this.raycaster.intersectObjects(this.groundMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            let worldNormal = null;

            // Transform normal to world space (critical for rotated/scaled meshes)
            if (hit.face && hit.object) {
                worldNormal = hit.face.normal.clone();
                const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
                worldNormal.applyMatrix3(normalMatrix).normalize();
            }

            // Return ground height and normal at intersection point
            return {
                height: hit.point.y,
                normal: worldNormal
            };
        }

        // If no intersection, return very low height (character will fall)
        return { height: -100, normal: null };
    }

    /**
     * Check for obstacles in the forward direction
     * Returns collision info: { hit: boolean, point: Vector3, normal: Vector3, distance: number, isWalkable: boolean }
     * @param forwardDirection - Normalized direction vector to check (typically walkDirection)
     */
    checkForwardCollision(forwardDirection) {
        if (this.groundMeshes.length === 0) {
            return { hit: false, point: null, normal: null, distance: Infinity, isWalkable: true };
        }

        // Cast ray from character's center position in the movement direction
        this.tempCollisionVector.set(
            this.model.position.x,
            this.model.position.y + 1.0,  // Cast from character's center height
            this.model.position.z
        );

        this.forwardRaycaster.set(this.tempCollisionVector, forwardDirection);
        this.forwardRaycaster.far = this.forwardCollisionDistance;  // Limit ray distance

        const intersects = this.forwardRaycaster.intersectObjects(this.groundMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const hitNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

            // Transform normal to world space (important for rotated/scaled meshes)
            if (hit.object && hit.face) {
                const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
                hitNormal.applyMatrix3(normalMatrix).normalize();
            }

            // Check surface angle: dot product with vertical unit vector (0, 1, 0)
            // If dot < 0.5, surface angle > 60° (too steep to walk on)
            const verticalDot = hitNormal.dot(new THREE.Vector3(0, 1, 0));
            const isWalkable = verticalDot >= 0.5;

            return {
                hit: true,
                point: hit.point,
                normal: hitNormal,
                distance: hit.distance,
                isWalkable: isWalkable,
                surfaceAngle: Math.acos(Math.abs(verticalDot)) * (180 / Math.PI)  // For debugging
            };
        }

        return { hit: false, point: null, normal: null, distance: Infinity, isWalkable: true };
    }

    /**
     * Check for ceiling/overhead obstacles
     * Returns collision info: { hit: boolean, height: number, distance: number }
     */
    checkCeilingCollision() {
        if (this.groundMeshes.length === 0) {
            return { hit: false, height: Infinity, distance: Infinity };
        }

        // Cast ray upward from character position
        this.tempCollisionVector.set(
            this.model.position.x,
            this.model.position.y,
            this.model.position.z
        );

        const upwardDirection = new THREE.Vector3(0, 1, 0);
        this.ceilingRaycaster.set(this.tempCollisionVector, upwardDirection);
        this.ceilingRaycaster.far = this.ceilingCollisionDistance;

        const intersects = this.ceilingRaycaster.intersectObjects(this.groundMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            return {
                hit: true,
                height: hit.point.y,
                distance: hit.distance
            };
        }

        return { hit: false, height: Infinity, distance: Infinity };
    }

    /**
     * Check ground at a forward position to validate walkability
     * Returns ground info: { exists: boolean, height: number, normal: Vector3, isWalkable: boolean }
     * @param forwardDirection - Normalized direction vector (typically walkDirection)
     * @param distance - Distance ahead to check (typically velocity * delta)
     */
    checkForwardGround(forwardDirection, distance) {
        if (this.groundMeshes.length === 0) {
            return { exists: false, height: -100, normal: null, isWalkable: false };
        }

        // Calculate next position based on movement
        const nextX = this.model.position.x + forwardDirection.x * distance;
        const nextZ = this.model.position.z + forwardDirection.z * distance;

        // Set raycast origin above the next position
        this.tempCollisionVector.set(nextX, this.model.position.y + 10, nextZ);

        // Cast ray downward from next position
        const downDirection = new THREE.Vector3(0, -1, 0);
        this.forwardGroundRaycaster.set(this.tempCollisionVector, downDirection);

        const intersects = this.forwardGroundRaycaster.intersectObjects(this.groundMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const groundHeight = hit.point.y;
            const groundNormal = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);

            // Calculate current ground height for step height comparison
            const currentGroundHeight = this.getGroundInfo().height;
            const heightDifference = groundHeight - currentGroundHeight;

            // Check slope angle: angle from vertical = acos(normal.y)
            const slopeAngle = Math.acos(Math.abs(groundNormal.y));

            // Terrain is walkable if:
            // 1. Slope is within acceptable angle, OR
            // 2. It's a small step up/down within step height limit
            const isWalkable = (
                slopeAngle <= this.maxSlopeAngle ||
                Math.abs(heightDifference) <= this.maxStepHeight
            );

            return {
                exists: true,
                height: groundHeight,
                normal: groundNormal,
                isWalkable: isWalkable,
                slopeAngle: slopeAngle,
                heightDifference: heightDifference
            };
        }

        // No ground found ahead - treat as unwalkable (cliff/gap)
        return { exists: false, height: -100, normal: null, isWalkable: false };
    }

    /**
     * Main update loop - called every frame
     * @param delta - Time since last frame in seconds
     * @param keysPressed - Object containing currently pressed keys
     */
    update(delta, keysPressed) {
        // ===== PHYSICS FIRST: Update grounded state before selecting animations =====

        // Jetpack audio is now handled by AudioManager

        // Update jump cooldown
        if (this.jumpCooldown > 0) {
            this.jumpCooldown -= delta;
        }

        // Handle jump input
        if (keysPressed[SPACE] && this.isGrounded && this.jumpCooldown <= 0) {
            this.verticalVelocity = this.jumpForce;
            this.isGrounded = false;
            this.jumpCooldown = this.jumpCooldownDuration;
        }

        // Jetpack activation: if spacebar held for >0.4s while in air, activate jetpack
        if (keysPressed[SPACE] && !this.isGrounded && this.timeInAir > this.airTimeThreshold) {
            // Activate jetpack if not already active
            if (!this.isJetpackActive) {
                this.isJetpackActive = true;
                // Clear any existing inertia when jetpack activates (start with clean slate)
                this.hasInertia = false;
                this.inertiaVelocityX = 0;
                this.inertiaVelocityZ = 0;
                // Audio is now handled by AudioManager
            }
            // Apply jetpack thrust to counter gravity
            this.verticalVelocity += this.jetpackThrust * delta;
        } else if (this.isJetpackActive) {
            // Jetpack was active but space released - start transition
            this.isJetpackActive = false;
            this.jetpackTransitionTimer = this.jetpackTransitionDuration;
            // Audio is now handled by AudioManager

            // Enable inertia to preserve horizontal velocity during fall
            // Only if there was actually some movement
            if (this.inertiaVelocityX !== 0 || this.inertiaVelocityZ !== 0) {
                this.hasInertia = true;
            }
            // Inertia velocities were captured in the movement section during jetpack flight
        }

        // Apply gravity with smooth transition after jetpack release
        if (this.jetpackTransitionTimer > 0) {
            // During transition: gradually reduce counter-thrust
            const thrustFactor = this.jetpackTransitionTimer / this.jetpackTransitionDuration;
            this.verticalVelocity += (this.jetpackThrust * thrustFactor) * delta;
            this.jetpackTransitionTimer -= delta;
        }

        // Always apply gravity
        this.verticalVelocity += this.gravity * delta;

        // Clamp fall speed
        if (this.verticalVelocity < this.maxFallSpeed) {
            this.verticalVelocity = this.maxFallSpeed;
        }

        // Ground collision detection using raycasting
        const groundInfo = this.getGroundInfo();
        const groundHeight = groundInfo.height;

        // Store previous Y position to track vertical movement
        const prevY = this.model.position.y;

        // Apply vertical movement from gravity/jumping
        this.model.position.y += this.verticalVelocity * delta;

        // Check for ceiling collision when moving upward
        if (this.verticalVelocity > 0) {
            const ceilingCollision = this.checkCeilingCollision();

            if (ceilingCollision.hit) {
                // Hit ceiling - clamp position and stop upward movement
                const maxY = ceilingCollision.height - this.characterHeightOffset;
                if (this.model.position.y > maxY) {
                    this.model.position.y = maxY;
                    this.verticalVelocity = 0;  // Stop upward movement
                }
            }
        }

        // Check for maximum height cap (2x terrain height)
        if (this.maxHeight !== null && this.model.position.y > this.maxHeight) {
            this.model.position.y = this.maxHeight;
            this.verticalVelocity = 0;  // Stop upward movement
        }

        // Check if character should be on the ground
        // Character "bottom" is at model position minus height offset
        const characterBottom = this.model.position.y - this.characterHeightOffset;
        const distanceToGround = characterBottom - groundHeight;

        // CRITICAL: Check if ground surface is walkable (not too steep)
        // Prevents character from sticking to walls
        let groundIsWalkable = true;
        if (groundInfo.normal) {
            const verticalDot = groundInfo.normal.dot(new THREE.Vector3(0, 1, 0));
            groundIsWalkable = verticalDot >= 0.5;  // Same 60° threshold as forward collision
        }

        if (distanceToGround <= 0 && groundIsWalkable) {
            // Character is at or below ground level AND ground is walkable - snap to ground
            this.model.position.y = groundHeight + this.characterHeightOffset;
            this.verticalVelocity = 0;
            this.isGrounded = true;
            this.timeInAir = 0;  // Reset air time when grounded

            // Deactivate jetpack on landing
            if (this.isJetpackActive) {
                this.isJetpackActive = false;
                // Audio is now handled by AudioManager
            }
            this.jetpackTransitionTimer = 0;  // Reset transition timer

            // Clear inertia on landing
            this.hasInertia = false;
            this.inertiaVelocityX = 0;
            this.inertiaVelocityZ = 0;
        } else {
            // Character is airborne (either above ground OR ground is too steep to stand on)
            this.isGrounded = false;
            this.timeInAir += delta;  // Accumulate time in air
        }

        // Update camera Y position to follow character's vertical movement
        // (applies to jumping, falling, landing, and terrain following)
        if (this.cameraMode === 'first-person') {
            // In first-person: camera positioned at character's head/eye level
            this.camera.position.y = this.model.position.y + this.firstPersonHeadHeight;
        } else {
            // In third-person: camera follows vertical movement with offset
            const deltaY = this.model.position.y - prevY;
            this.camera.position.y += deltaY;
        }

        // ===== ANIMATION: Now select animation based on updated grounded state =====

        const directionPressed = DIRECTIONS.some(key => keysPressed[key] === true);

        let play = '';
        // Jetpack active: use TPose animation (arms extended for flying pose)
        if (this.isJetpackActive && !this.isGrounded) {
            play = 'TPose';
        }
        // Only switch to Idle animation if character has been in air for longer than threshold
        // This prevents animation flickering when going downhill (rapid ground/air oscillation)
        else if (!this.isGrounded && this.timeInAir > this.airTimeThreshold) {
            play = 'Idle';
        } else if (directionPressed && this.toggleRun) {
            play = 'Run';
        } else if (directionPressed) {
            play = 'Walk';
        } else {
            play = 'Idle';
        }

        // Change animation if needed
        if (this.currentAction !== play) {
            const toPlay = this.animationsMap.get(play);
            const current = this.animationsMap.get(this.currentAction);

            if (current && toPlay) {
                current.fadeOut(this.fadeDuration);
                toPlay.reset().fadeIn(this.fadeDuration).play();
                this.currentAction = play;
            }
        }

        // Update animation mixer
        this.mixer.update(delta);

        // Movement: WASD works when grounded OR during jetpack flight OR shortly after jump
        // WASD is disabled during falls (in air without jetpack for > airTimeThreshold)
        // However, inertia from jump/jetpack preserves horizontal momentum during fall
        // Use hysteresis to prevent stuttering on downhill slopes
        const functionallyGrounded = this.isGrounded || this.timeInAir <= this.airTimeThreshold;

        // Clear inertia velocities if stationary in jetpack mode
        // This ensures falling from stationary jetpack has no momentum
        if (this.isJetpackActive && !directionPressed) {
            this.inertiaVelocityX = 0;
            this.inertiaVelocityZ = 0;
        }

        if (directionPressed && (functionallyGrounded || this.isJetpackActive)) {
            // WASD controls enabled - normal directional movement
            // Calculate direction offset based on pressed keys
            let angleYCameraDirection;

            if (this.cameraMode === 'first-person') {
                // In first-person: use camera yaw directly (character faces where camera looks)
                angleYCameraDirection = this.firstPersonYaw;
            } else {
                // In third-person: calculate from camera position relative to character
                angleYCameraDirection = Math.atan2(
                    this.camera.position.x - this.model.position.x,
                    this.camera.position.z - this.model.position.z
                );
            }

            // Calculate direction offset
            const directionOffset = this.directionOffset(keysPressed);

            // Rotate model
            this.rotateQuaternion.setFromAxisAngle(
                this.rotateAngle,
                angleYCameraDirection + directionOffset
            );
            this.model.quaternion.rotateTowards(this.rotateQuaternion, 0.2);

            // Calculate direction
            this.camera.getWorldDirection(this.walkDirection);
            this.walkDirection.y = 0;
            this.walkDirection.normalize();
            this.walkDirection.applyAxisAngle(this.rotateAngle, directionOffset);

            // Move character - use run/walk velocity based on toggle
            const velocity = this.toggleRun ? this.runVelocity : this.walkVelocity;
            let moveX = this.walkDirection.x * velocity * delta;
            let moveZ = this.walkDirection.z * velocity * delta;

            // If in air (jumping or jetpack), capture velocity for inertia
            // This preserves horizontal momentum during falls
            if (!this.isGrounded) {
                this.inertiaVelocityX = this.walkDirection.x * velocity;
                this.inertiaVelocityZ = this.walkDirection.z * velocity;
                this.hasInertia = true; // Enable inertia for when control is lost
            }

            // Check forward ground walkability when grounded (prevents wall walking)
            // Don't apply during jetpack/jumping - allow free movement in air
            let terrainBlocked = false;
            let terrainNormal = null;
            if (this.isGrounded) {
                const moveDistance = Math.sqrt(moveX * moveX + moveZ * moveZ);
                const forwardGround = this.checkForwardGround(this.walkDirection, moveDistance);

                if (!forwardGround.isWalkable) {
                    // Terrain ahead is too steep or no ground exists
                    // Treat as a wall collision for sliding behavior
                    terrainBlocked = true;
                    if (forwardGround.normal) {
                        // Use terrain normal for wall sliding
                        terrainNormal = forwardGround.normal.clone();
                    } else {
                        // No ground ahead (cliff) - use movement opposite as normal
                        terrainNormal = new THREE.Vector3(-this.walkDirection.x, 0, -this.walkDirection.z).normalize();
                    }
                }
            }

            // Check for forward collision and apply lateral sliding (horizontal only, no vertical)
            const forwardCollision = this.checkForwardCollision(this.walkDirection);

            // Apply wall sliding for ANY collision (steep or gentle)
            // But ensure sliding is LATERAL only (no vertical component)
            if (forwardCollision.hit || terrainBlocked) {
                // Determine which normal to use for sliding
                let worldNormal;
                if (forwardCollision.hit) {
                    // Physical wall collision - use wall normal
                    worldNormal = forwardCollision.normal.clone();
                } else {
                    // Unwalkable terrain - use terrain normal
                    worldNormal = terrainNormal.clone();
                }

                // For steep walls: flatten the normal to horizontal plane (remove Y component)
                // This ensures sliding is lateral only, preventing vertical climbing
                if (forwardCollision.hit && !forwardCollision.isWalkable) {
                    worldNormal.y = 0;  // Force horizontal normal (lateral sliding only)
                    worldNormal.normalize();
                }

                // Project movement onto the wall plane (slide along wall)
                // slideDir = moveDir - (moveDir · wallNormal) * wallNormal
                const movementVector = this.tempSlideVector.set(moveX, 0, moveZ);
                const dotProduct = movementVector.dot(worldNormal);

                // Only slide if moving toward the wall (dot product < 0)
                if (dotProduct < 0) {
                    // Calculate slide vector: subtract the component pointing into the wall
                    const slideX = moveX - dotProduct * worldNormal.x;
                    const slideZ = moveZ - dotProduct * worldNormal.z;

                    // Use the slide vector instead of original movement
                    moveX = slideX;
                    moveZ = slideZ;
                }
            }

            this.model.position.x += moveX;
            this.model.position.z += moveZ;

            // Update camera position to follow character
            if (this.cameraMode === 'first-person') {
                // In first-person: camera positioned at character's XZ location
                this.camera.position.x = this.model.position.x;
                this.camera.position.z = this.model.position.z;
            } else {
                // In third-person: camera follows with offset
                this.camera.position.x += moveX;
                this.camera.position.z += moveZ;
            }
        } else if (this.hasInertia && !this.isGrounded && !this.isJetpackActive) {
            // Apply inertia during fall (after jump or jetpack deactivation)
            // Keep the last horizontal velocity constant for realistic physics
            // NOTE: Inertia is NOT applied during active jetpack flight - only during passive falling
            let moveX = this.inertiaVelocityX * delta;
            let moveZ = this.inertiaVelocityZ * delta;

            // Check for forward collision and apply lateral sliding (horizontal only, no vertical)
            const inertiaDirection = new THREE.Vector3(this.inertiaVelocityX, 0, this.inertiaVelocityZ).normalize();
            const forwardCollision = this.checkForwardCollision(inertiaDirection);

            if (forwardCollision.hit) {
                const worldNormal = forwardCollision.normal.clone();

                // For steep walls: flatten the normal to horizontal plane (remove Y component)
                // This ensures sliding is lateral only, preventing vertical climbing
                if (!forwardCollision.isWalkable) {
                    worldNormal.y = 0;  // Force horizontal normal (lateral sliding only)
                    worldNormal.normalize();
                }

                const movementVector = this.tempSlideVector.set(moveX, 0, moveZ);
                const dotProduct = movementVector.dot(worldNormal);

                if (dotProduct < 0) {
                    const slideX = moveX - dotProduct * worldNormal.x;
                    const slideZ = moveZ - dotProduct * worldNormal.z;
                    moveX = slideX;
                    moveZ = slideZ;
                }
            }

            this.model.position.x += moveX;
            this.model.position.z += moveZ;

            // Update camera position to follow character
            if (this.cameraMode === 'first-person') {
                // In first-person: camera positioned at character's XZ location
                this.camera.position.x = this.model.position.x;
                this.camera.position.z = this.model.position.z;
            } else {
                // In third-person: camera follows with offset
                this.camera.position.x += moveX;
                this.camera.position.z += moveZ;
            }
        }
        // When falling without inertia (regular fall), no horizontal movement allowed

        // Update camera rotation and target based on camera mode
        if (this.cameraMode === 'first-person') {
            // ALWAYS keep camera at character position in first-person mode
            this.camera.position.x = this.model.position.x;
            this.camera.position.z = this.model.position.z;

            // ALWAYS keep character facing camera yaw direction (even when not moving)
            this.model.rotation.y = this.firstPersonYaw;

            // Apply pitch/yaw rotation to camera
            this.camera.rotation.order = 'YXZ'; // Yaw-Pitch-Roll order (prevents gimbal lock)
            this.camera.rotation.y = this.firstPersonYaw;
            this.camera.rotation.x = this.firstPersonPitch;
            this.camera.rotation.z = 0;

            // Set camera target to look direction (1 unit ahead)
            const lookDirection = new THREE.Vector3();
            this.camera.getWorldDirection(lookDirection);
            this.updateCameraTargetOffset.copy(this.camera.position).add(lookDirection);
            // Use .copy() to update values without breaking reference
            this.orbitControl.target.copy(this.updateCameraTargetOffset);
        } else {
            // In third-person: camera target tracks character center (in local space)
            // CRITICAL: Target offset must be rotated by character's quaternion
            // to maintain constant camera-to-target distance regardless of character orientation
            const localTargetOffset = new THREE.Vector3(0, this.targetOffsetY, 0);
            const worldTargetOffset = localTargetOffset.clone().applyQuaternion(this.model.quaternion);
            this.updateCameraTargetOffset.x = this.model.position.x + worldTargetOffset.x;
            this.updateCameraTargetOffset.y = this.model.position.y + worldTargetOffset.y;
            this.updateCameraTargetOffset.z = this.model.position.z + worldTargetOffset.z;
            // Use .copy() to update values without breaking reference
            this.orbitControl.target.copy(this.updateCameraTargetOffset);
        }
    }

    /**
     * Calculate direction offset based on pressed keys
     * Returns angle in radians for 8-directional movement
     */
    directionOffset(keysPressed) {
        let directionOffset = 0; // w

        if (keysPressed[W]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4; // w+a
            } else if (keysPressed[D]) {
                directionOffset = -Math.PI / 4; // w+d
            }
        } else if (keysPressed[S]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4 + Math.PI / 2; // s+a
            } else if (keysPressed[D]) {
                directionOffset = -Math.PI / 4 - Math.PI / 2; // s+d
            } else {
                directionOffset = Math.PI; // s
            }
        } else if (keysPressed[A]) {
            directionOffset = Math.PI / 2; // a
        } else if (keysPressed[D]) {
            directionOffset = -Math.PI / 2; // d
        }

        return directionOffset;
    }

    /**
     * Update VR physics - applies gravity, collision, jumping, and jetpack to VR camera
     * Called by XRManager each frame
     *
     * @param {THREE.Vector3} currentPosition - Current VR camera position
     * @param {THREE.Vector3} velocity - Current velocity (modified in place)
     * @param {THREE.Vector3} thumbstickMovement - Movement from thumbstick (already calculated, world space)
     * @param {number} delta - Frame delta time in seconds
     * @param {Array} groundMeshes - Array of meshes for collision detection
     * @param {boolean} isGrounded - Current grounded state
     * @param {number} airTime - Time spent in air
     * @param {boolean} jetpackActive - Is jetpack currently active
     * @param {number} jetpackTransitionTimer - Jetpack transition timer
     * @returns {Object} - { newPosition, velocity, isGrounded, airTime, jetpackActive, jetpackTransitionTimer }
     */
    updateVRPhysics(
        currentPosition,
        velocity,
        thumbstickMovement,
        delta,
        groundMeshes,
        isGrounded,
        airTime,
        jetpackActive,
        jetpackTransitionTimer
    ) {
        // Create a copy of current position for calculations
        const newPosition = currentPosition.clone();

        // Apply gravity with jetpack thrust if active
        if (jetpackActive) {
            velocity.y += this.jetpackThrust * delta;
        }

        // Apply gravity with smooth transition after jetpack release
        if (jetpackTransitionTimer > 0) {
            const thrustFactor = jetpackTransitionTimer / this.jetpackTransitionDuration;
            velocity.y += (this.jetpackThrust * thrustFactor) * delta;
            jetpackTransitionTimer -= delta;
        }

        // Always apply gravity
        velocity.y += this.gravity * delta;

        // Clamp fall speed
        if (velocity.y < this.maxFallSpeed) {
            velocity.y = this.maxFallSpeed;
        }

        // Apply vertical velocity
        newPosition.y += velocity.y * delta;

        // Check for ceiling collision when moving upward
        if (velocity.y > 0) {
            const ceilingCollision = this.checkCeilingCollisionAtPosition(newPosition, groundMeshes);
            if (ceilingCollision.hit) {
                const maxY = ceilingCollision.height;
                if (newPosition.y > maxY) {
                    newPosition.y = maxY;
                    velocity.y = 0;
                }
            }
        }

        // Check for maximum height cap
        if (this.maxHeight !== null && newPosition.y > this.maxHeight) {
            newPosition.y = this.maxHeight;
            velocity.y = 0;
        }

        // Ground collision detection
        const groundInfo = this.getGroundInfoAtPosition(newPosition, groundMeshes);
        const groundHeight = groundInfo.height;

        // Check if ground surface is walkable
        let groundIsWalkable = true;
        if (groundInfo.normal) {
            const verticalDot = groundInfo.normal.dot(new THREE.Vector3(0, 1, 0));
            groundIsWalkable = verticalDot >= 0.5;
        }

        const distanceToGround = newPosition.y - groundHeight;

        if (distanceToGround <= 0 && groundIsWalkable) {
            // Snap to ground
            newPosition.y = groundHeight;
            velocity.y = 0;
            isGrounded = true;
            airTime = 0;

            // Deactivate jetpack on landing
            if (jetpackActive) {
                jetpackActive = false;
            }
            jetpackTransitionTimer = 0;
        } else {
            // Airborne
            isGrounded = false;
            airTime += delta;
        }

        // Apply horizontal movement from thumbstick
        if (thumbstickMovement && thumbstickMovement.lengthSq() > 0) {
            let moveX = thumbstickMovement.x;
            let moveZ = thumbstickMovement.z;

            // Check forward collision
            const moveDirection = thumbstickMovement.clone().normalize();
            const forwardCollision = this.checkForwardCollisionAtPosition(
                newPosition,
                moveDirection,
                groundMeshes
            );

            // Apply wall sliding if collision detected
            if (forwardCollision.hit) {
                const worldNormal = forwardCollision.normal.clone();

                // For steep walls, flatten normal to horizontal
                if (!forwardCollision.isWalkable) {
                    worldNormal.y = 0;
                    worldNormal.normalize();
                }

                const movementVector = new THREE.Vector3(moveX, 0, moveZ);
                const dotProduct = movementVector.dot(worldNormal);

                if (dotProduct < 0) {
                    moveX = moveX - dotProduct * worldNormal.x;
                    moveZ = moveZ - dotProduct * worldNormal.z;
                }
            }

            newPosition.x += moveX;
            newPosition.z += moveZ;
        }

        return {
            newPosition,
            velocity,
            isGrounded,
            airTime,
            jetpackActive,
            jetpackTransitionTimer
        };
    }

    /**
     * Get ground info at a specific position (for VR physics)
     * Position should be at ground/feet level (reference space origin)
     * CRITICAL: Always raycast from ABOVE to ensure we detect ground even if character falls below it
     */
    getGroundInfoAtPosition(position, groundMeshes) {
        if (!groundMeshes || groundMeshes.length === 0) {
            return { height: 0, normal: null };
        }

        // CRITICAL: Always raycast from high above to ensure we catch the ground
        // even if the character has fallen below the ground surface
        // Use max of (position.y + 10, 100) to ensure we're always above terrain
        const rayStartY = Math.max(position.y + 10, 100);
        const rayOrigin = new THREE.Vector3(position.x, rayStartY, position.z);
        const rayDirection = new THREE.Vector3(0, -1, 0);
        const raycaster = new THREE.Raycaster();
        raycaster.set(rayOrigin, rayDirection);

        const intersects = raycaster.intersectObjects(groundMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            let worldNormal = null;

            if (hit.face && hit.object) {
                worldNormal = hit.face.normal.clone();
                const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
                worldNormal.applyMatrix3(normalMatrix).normalize();
            }

            return {
                height: hit.point.y,
                normal: worldNormal
            };
        }

        return { height: -100, normal: null };
    }

    /**
     * Check ceiling collision at a specific position (for VR physics)
     * Position should be at ground/feet level (reference space origin)
     */
    checkCeilingCollisionAtPosition(position, groundMeshes) {
        if (!groundMeshes || groundMeshes.length === 0) {
            return { hit: false, height: Infinity, distance: Infinity };
        }

        // Raycast upward from 1.0m above the reference space origin (same as non-VR)
        const rayOrigin = new THREE.Vector3(position.x, position.y + 1.0, position.z);
        const upwardDirection = new THREE.Vector3(0, 1, 0);
        const raycaster = new THREE.Raycaster();
        raycaster.set(rayOrigin, upwardDirection);
        raycaster.far = this.ceilingCollisionDistance;

        const intersects = raycaster.intersectObjects(groundMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            return {
                hit: true,
                height: hit.point.y,
                distance: hit.distance
            };
        }

        return { hit: false, height: Infinity, distance: Infinity };
    }

    /**
     * Check forward collision at a specific position (for VR physics)
     * Position should be at ground/feet level (reference space origin)
     */
    checkForwardCollisionAtPosition(position, forwardDirection, groundMeshes) {
        if (!groundMeshes || groundMeshes.length === 0) {
            return { hit: false, point: null, normal: null, distance: Infinity, isWalkable: true };
        }

        // Raycast forward from 1.0m above the reference space origin (same as non-VR)
        const rayOrigin = new THREE.Vector3(position.x, position.y + 1.0, position.z);
        const raycaster = new THREE.Raycaster();
        raycaster.set(rayOrigin, forwardDirection);
        raycaster.far = this.forwardCollisionDistance;

        const intersects = raycaster.intersectObjects(groundMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const hitNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

            if (hit.object && hit.face) {
                const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
                hitNormal.applyMatrix3(normalMatrix).normalize();
            }

            const verticalDot = hitNormal.dot(new THREE.Vector3(0, 1, 0));
            const isWalkable = verticalDot >= 0.5;

            return {
                hit: true,
                point: hit.point,
                normal: hitNormal,
                distance: hit.distance,
                isWalkable: isWalkable
            };
        }

        return { hit: false, point: null, normal: null, distance: Infinity, isWalkable: true };
    }

}

// Array of directional keys for iteration
const DIRECTIONS = [W, A, S, D];
