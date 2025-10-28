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

    // Jetpack audio
    thrusterSound = null;        // Audio element for thruster sound
    thrusterFadeSpeed = 2.0;     // Volume fade speed (units per second)
    thrusterTargetVolume = 0;    // Target volume for smooth fading
    thrusterMaxVolume = 0.5;     // Maximum volume when jetpack is active

    // Ground detection
    raycaster = new THREE.Raycaster();
    groundMeshes = [];
    rayOrigin = new THREE.Vector3();
    rayDirection = new THREE.Vector3(0, -1, 0);

    // Forward and ceiling collision detection
    forwardRaycaster = new THREE.Raycaster();
    ceilingRaycaster = new THREE.Raycaster();
    forwardCollisionDistance = 0.5;  // Distance to check ahead (short range)
    ceilingCollisionDistance = 2.5;  // Distance to check above (character height + buffer)

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

    constructor(
        model,
        mixer,
        animationsMap,
        orbitControl,
        camera,
        currentAction,
        groundMeshes,
        maxHeight = null
    ) {
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

        // Initialize thruster sound
        this.initThrusterSound();

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
     * Initialize thruster sound effect
     */
    initThrusterSound() {
        try {
            this.thrusterSound = new Audio('sounds/thrusters_loopwav-14699.mp3');
            this.thrusterSound.loop = true;
            this.thrusterSound.volume = 0; // Start at 0 volume
            console.log('Thruster sound loaded');
        } catch (error) {
            console.error('Error loading thruster sound:', error);
        }
    }

    /**
     * Start thruster sound with fade-in
     */
    startThrusterSound() {
        if (this.thrusterSound) {
            this.thrusterTargetVolume = this.thrusterMaxVolume;
            // Start playing if not already playing
            if (this.thrusterSound.paused) {
                this.thrusterSound.currentTime = 0;
                this.thrusterSound.play().catch(err => {
                    console.warn('Could not play thruster sound:', err);
                });
            }
        }
    }

    /**
     * Stop thruster sound with fade-out
     */
    stopThrusterSound() {
        if (this.thrusterSound) {
            this.thrusterTargetVolume = 0;
        }
    }

    /**
     * Update thruster sound volume (smooth fade)
     * Called every frame in update loop
     */
    updateThrusterSound(delta) {
        if (!this.thrusterSound) return;

        // Smooth fade to target volume
        if (this.thrusterSound.volume !== this.thrusterTargetVolume) {
            const volumeDelta = this.thrusterFadeSpeed * delta;

            if (this.thrusterSound.volume < this.thrusterTargetVolume) {
                // Fade in
                this.thrusterSound.volume = Math.min(
                    this.thrusterTargetVolume,
                    this.thrusterSound.volume + volumeDelta
                );
            } else {
                // Fade out
                this.thrusterSound.volume = Math.max(
                    this.thrusterTargetVolume,
                    this.thrusterSound.volume - volumeDelta
                );

                // Pause audio when fully faded out to save resources
                if (this.thrusterSound.volume === 0 && !this.thrusterSound.paused) {
                    this.thrusterSound.pause();
                }
            }
        }
    }

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
     * Returns object with ground height and normal vector
     */
    getGroundInfo() {
        if (this.groundMeshes.length === 0) {
            return { height: 0, normal: null }; // Fallback to Y=0 if no ground meshes
        }

        // Set raycast origin well above character position to ensure we hit ground
        this.rayOrigin.set(
            this.model.position.x,
            this.model.position.y + 10, // Start ray 10 units above character
            this.model.position.z
        );

        // Cast ray downward against all ground meshes
        this.raycaster.set(this.rayOrigin, this.rayDirection);
        const intersects = this.raycaster.intersectObjects(this.groundMeshes, true);

        if (intersects.length > 0) {
            // Return ground height and normal at intersection point
            return {
                height: intersects[0].point.y,
                normal: intersects[0].face ? intersects[0].face.normal : null
            };
        }

        // If no intersection, return very low height (character will fall)
        return { height: -100, normal: null };
    }

    /**
     * Check for obstacles in the forward direction
     * Returns collision info: { hit: boolean, point: Vector3, normal: Vector3, distance: number }
     * @param forwardDirection - Normalized direction vector to check (typically walkDirection)
     */
    checkForwardCollision(forwardDirection) {
        if (this.groundMeshes.length === 0) {
            return { hit: false, point: null, normal: null, distance: Infinity };
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
            return {
                hit: true,
                point: hit.point,
                normal: hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0),
                distance: hit.distance
            };
        }

        return { hit: false, point: null, normal: null, distance: Infinity };
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
     * Main update loop - called every frame
     * @param delta - Time since last frame in seconds
     * @param keysPressed - Object containing currently pressed keys
     */
    update(delta, keysPressed) {
        // ===== PHYSICS FIRST: Update grounded state before selecting animations =====

        // Update thruster sound volume (smooth fade in/out)
        this.updateThrusterSound(delta);

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
                this.startThrusterSound();  // Start sound with fade-in
            }
            // Apply jetpack thrust to counter gravity
            this.verticalVelocity += this.jetpackThrust * delta;
        } else if (this.isJetpackActive) {
            // Jetpack was active but space released - start transition
            this.isJetpackActive = false;
            this.jetpackTransitionTimer = this.jetpackTransitionDuration;
            this.stopThrusterSound();  // Stop sound with fade-out
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

        if (distanceToGround <= 0) {
            // Character is at or below ground level - snap to ground
            this.model.position.y = groundHeight + this.characterHeightOffset;
            this.verticalVelocity = 0;
            this.isGrounded = true;
            this.timeInAir = 0;  // Reset air time when grounded

            // Deactivate jetpack on landing
            if (this.isJetpackActive) {
                this.isJetpackActive = false;
                this.stopThrusterSound();  // Stop sound with fade-out
            }
            this.jetpackTransitionTimer = 0;  // Reset transition timer
        } else {
            // Character is airborne
            this.isGrounded = false;
            this.timeInAir += delta;  // Accumulate time in air
        }

        // Update camera Y position to follow character's vertical movement
        // (applies to jumping, falling, landing, and terrain following)
        const deltaY = this.model.position.y - prevY;
        this.camera.position.y += deltaY;

        // ===== ANIMATION: Now select animation based on updated grounded state =====

        const directionPressed = DIRECTIONS.some(key => keysPressed[key] === true);

        let play = '';
        // Only switch to Idle animation if character has been in air for longer than threshold
        // This prevents animation flickering when going downhill (rapid ground/air oscillation)
        if (!this.isGrounded && this.timeInAir > this.airTimeThreshold) {
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

        // Movement: WASD works when grounded OR during jetpack flight
        // WASD is disabled during falls (in air without jetpack for > airTimeThreshold)
        // Use hysteresis to prevent stuttering on downhill slopes
        const functionallyGrounded = this.isGrounded || this.timeInAir <= this.airTimeThreshold;
        if (directionPressed && (functionallyGrounded || this.isJetpackActive)) {
            // WASD controls enabled - normal directional movement
            // Calculate direction offset based on pressed keys
            const angleYCameraDirection = Math.atan2(
                this.camera.position.x - this.model.position.x,
                this.camera.position.z - this.model.position.z
            );

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

            // Check for forward collision and apply wall sliding if needed
            const forwardCollision = this.checkForwardCollision(this.walkDirection);

            if (forwardCollision.hit) {
                // Wall detected - calculate slide direction
                // Slide direction = movement direction projected onto wall plane

                // Get world-space normal (face normal is in local space)
                const worldNormal = forwardCollision.normal.clone();

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
            this.camera.position.x += moveX;
            this.camera.position.z += moveZ;
        }
        // When falling (in air, no jetpack, no ground), no horizontal movement allowed

        // Always update camera target to track character (fixes downhill stutter)
        this.updateCameraTargetOffset.x = this.model.position.x;
        this.updateCameraTargetOffset.y = this.model.position.y + 1;
        this.updateCameraTargetOffset.z = this.model.position.z;
        this.orbitControl.target = this.updateCameraTargetOffset;
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

}

// Array of directional keys for iteration
const DIRECTIONS = [W, A, S, D];
