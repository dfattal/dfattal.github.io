/**
 * XRManager - Manages WebXR session lifecycle, reference space, and VR-specific functionality
 *
 * Key concepts:
 * - Reference spaces work INVERSELY to regular 3D transforms
 * - To move camera rig to position (x,y,z), apply the INVERSE transform to the reference space
 * - Always use THREE.PerspectiveCamera for lookAt quaternions (NOT Object3D) to avoid 180° rotation errors
 *
 * CRITICAL - Reference Space Type:
 * - Uses 'local-floor' reference space (origin at floor level, user's feet)
 * - NOT 'local' (origin at viewer's head position at session start)
 * - With 'local-floor', camera naturally appears at user's physical height above the origin
 * - Falls back to 'local' if 'local-floor' not supported by device
 *
 * CRITICAL - Physics Architecture:
 * - XR Reference Space Origin = Ground level at spawn position (where feet are)
 * - Character Position = Reference space origin (tracked separately, at ground level)
 * - XR Camera Pose = Head position (relative to reference space, naturally at userHeight above origin)
 * - Physics is applied to Character Position (reference space origin), NOT the camera
 * - When user moves their head, camera moves but character position stays grounded
 * - Only thumbstick input, gravity, and physics update the character position
 * - This prevents head movement from triggering physics and falling through floor
 *
 * Raycasting for collision:
 * - Ground detection: Always raycast from high above (max of position.y+10 or Y=100) downward
 *   This ensures we detect ground even if character has fallen below ground surface
 * - Ceiling/Forward collision: Raycast from (0, 1.0, 0) relative to reference space origin
 *   This is the "character center" position, matching non-VR mode
 * - Reference space origin is auto-calculated by "dropping" from Y=1000 to find ground at spawn
 */

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

export class XRManager {
    constructor(renderer, camera, scene, sceneConfig) {
        this.renderer = renderer;
        this.camera = camera;
        this.scene = scene;
        this.sceneConfig = sceneConfig;

        // XR session state
        this.session = null;
        this.isXRActive = false;
        this.localSpace = null;
        this.currentReferenceSpace = null;

        // XR configuration from scene
        this.xrConfig = sceneConfig?.xr || {
            enabled: true,
            referenceSpaceType: 'local-floor',
            referenceSpaceOrigin: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } },
            userHeight: 1.6
        };

        // Physics state for VR camera
        this.vrVelocity = new THREE.Vector3();
        this.isGrounded = false;
        this.airTime = 0;
        this.jetpackActive = false;
        this.jetpackTransitionTimer = 0;

        // Movement state
        this.moveSpeed = 5.0; // units per second
        this.runSpeedMultiplier = 2.0;
        this.isRunning = false;

        // Teleport state
        this.teleportTarget = null;
        this.teleportReticle = null;
        this.isTeleporting = false;

        // External references (set by main.js)
        this.characterControls = null;
        this.orbitControls = null;
        this.xrControllers = null;
        this.xrHands = null;
        this.gaussianSplat = null; // Gaussian splat reference for VR visibility management

        // World offset for reference space (accumulated position change from physics)
        this.worldOffset = new THREE.Vector3();

        // Actual initial reference space origin (with calculated ground height)
        // This is set during onSessionStart and used as the base for offset calculations
        this.actualReferenceOrigin = null;

        // Virtual "character" position for physics (reference space center, not camera)
        // This represents where the user's feet/play space center is, independent of head movement
        this.characterPosition = new THREE.Vector3();

        this.init();
    }

    async init() {
        if (!this.xrConfig.enabled) {
            console.log('XR disabled in scene config');
            return;
        }

        // Enable WebXR on renderer
        this.renderer.xr.enabled = true;

        // Create and add VR button (only if WebXR is supported)
        await this.createVRButton();

        // Setup session event listeners
        this.renderer.xr.addEventListener('sessionstart', this.onSessionStart.bind(this));
        this.renderer.xr.addEventListener('sessionend', this.onSessionEnd.bind(this));

        // Create teleport reticle
        this.createTeleportReticle();

        console.log('XRManager initialized', this.xrConfig);
    }

    async createVRButton() {
        // Only show VR button if WebXR is supported
        if (!navigator.xr) {
            console.log('WebXR not available, VR button hidden');
            return;
        }

        try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
            if (!isSupported) {
                console.log('immersive-vr not supported, VR button hidden');
                return;
            }

            // WebXR is available, create the VR button
            const vrButton = VRButton.createButton(this.renderer);
            vrButton.style.position = 'fixed';
            vrButton.style.bottom = '90px'; // Above camera toggle button
            vrButton.style.right = '30px';
            vrButton.style.zIndex = '1000';
            document.body.appendChild(vrButton);
            this.vrButton = vrButton;
            console.log('WebXR available, VR button shown');
        } catch (error) {
            console.warn('Error checking WebXR support:', error);
        }
    }

    createTeleportReticle() {
        // Create a circular reticle for teleportation target visualization
        const geometry = new THREE.RingGeometry(0.2, 0.25, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        this.teleportReticle = new THREE.Mesh(geometry, material);
        this.teleportReticle.rotation.x = -Math.PI / 2; // Lay flat on ground
        this.teleportReticle.visible = false;
        this.scene.add(this.teleportReticle);
    }

    async onSessionStart() {
        console.log('XR session starting...');
        this.session = this.renderer.xr.getSession();
        this.isXRActive = true;

        // CRITICAL: Ensure Gaussian splat is visible in VR
        // The splat might have been made visible by startMagicReveal() before session start,
        // but we need to ensure it stays visible when VR session initializes
        if (this.gaussianSplat) {
            this.gaussianSplat.visible = true;
            console.log('Gaussian splat visibility ensured for VR mode:', this.gaussianSplat.visible);

            // Also log if it's in the scene hierarchy (for debugging)
            let parent = this.gaussianSplat.parent;
            let depth = 0;
            while (parent && depth < 5) {
                console.log(`  Parent ${depth}:`, parent.type || parent.constructor.name);
                parent = parent.parent;
                depth++;
            }
        } else {
            console.warn('Gaussian splat reference not set in XRManager');
        }

        // Request reference space
        try {
            // Use 'local-floor' which has origin at floor level (user's feet)
            // NOT 'local' which has origin at viewer's head position
            const referenceSpaceType = this.xrConfig.referenceSpaceType || 'local-floor';

            try {
                this.localSpace = await this.session.requestReferenceSpace(referenceSpaceType);
                console.log(`XR reference space type: ${referenceSpaceType}`);
            } catch (e) {
                // Fallback to 'local' if 'local-floor' not supported
                console.warn(`${referenceSpaceType} not supported, falling back to 'local'`);
                this.localSpace = await this.session.requestReferenceSpace('local');
            }

            // Get spawn position from character config (same as web experience)
            const spawnCfg = this.sceneConfig?.character?.spawn || {};
            const spawnPos = spawnCfg.position || { x: 0, y: 'auto', z: 40 };
            const spawnRot = spawnCfg.rotation || { y: 0 };

            const spawnX = spawnPos.x;
            const spawnZ = spawnPos.z;

            // Use character controls to get ground height at this position
            const groundMeshes = this.characterControls?.groundMeshes || [];
            let groundHeight = 0;

            if (groundMeshes.length > 0 && this.characterControls) {
                // IMPORTANT: "Drop" from high above to ensure we find ground
                // Start from 1000 units above to guarantee we're above any terrain
                const testPosition = new THREE.Vector3(spawnX, 1000, spawnZ);
                const groundInfo = this.characterControls.getGroundInfoAtPosition(testPosition, groundMeshes);
                groundHeight = groundInfo.height;

                if (groundHeight < -50) {
                    // Fallback: if no ground found, try from lower height or use 0
                    console.warn(`No ground found at XR spawn (${spawnX}, ${spawnZ}), using Y=0`);
                    groundHeight = 0;
                } else {
                    console.log(`Ground height at XR spawn (${spawnX}, ${spawnZ}): ${groundHeight.toFixed(2)}`);
                }
            }

            // Set reference space origin at GROUND level (feet), not eye level
            // The user's head will naturally be at groundHeight + userHeight in the headset
            const userHeight = this.xrConfig.userHeight || 1.6;
            const xrOriginPosition = {
                x: spawnX,
                y: groundHeight,  // At ground level, NOT ground + userHeight
                z: spawnZ
            };

            // Store the actual reference origin for later offset calculations
            this.actualReferenceOrigin = {
                position: xrOriginPosition,
                rotation: spawnRot,  // Use character spawn rotation from config
                userHeight: userHeight  // Store for future reference
            };

            // Initialize character position (reference space center, at ground/feet level)
            this.characterPosition.set(xrOriginPosition.x, xrOriginPosition.y, xrOriginPosition.z);

            // Apply initial reference space origin with calculated ground height
            // setReferenceSpaceOrigin expects rotation in degrees (converts internally)
            this.setReferenceSpaceOrigin(
                xrOriginPosition,
                spawnRot
            );

            console.log('XR reference space initialized at:', xrOriginPosition);
            console.log('Character position (play space center):', this.characterPosition);
        } catch (error) {
            console.error('Failed to request reference space:', error);
        }

        // Disable OrbitControls
        if (this.orbitControls) {
            this.orbitControls.enabled = false;
        }

        // Hide non-XR UI elements
        this.hideNonXRUI();

        // Hide character body, show hands (handled by xrHands)
        if (this.characterControls && this.characterControls.model) {
            this.characterControls.model.visible = false;
        }

        // Initialize XR controllers and hands
        if (this.xrControllers) {
            this.xrControllers.enable();
        }
        if (this.xrHands) {
            this.xrHands.enable();
        }

        // Reset physics state
        this.vrVelocity.set(0, 0, 0);
        this.worldOffset.set(0, 0, 0);
        this.isGrounded = false;
        this.airTime = 0;
        this.jetpackActive = false;
    }

    onSessionEnd() {
        console.log('XR session ended');
        this.session = null;
        this.isXRActive = false;
        this.localSpace = null;
        this.currentReferenceSpace = null;
        this.actualReferenceOrigin = null; // Clear for next session
        this.characterPosition.set(0, 0, 0); // Reset character position

        // Re-enable OrbitControls
        if (this.orbitControls) {
            this.orbitControls.enabled = true;
        }

        // Show non-XR UI elements
        this.showNonXRUI();

        // Show character body
        if (this.characterControls && this.characterControls.model) {
            this.characterControls.model.visible = true;
        }

        // Disable XR controllers and hands
        if (this.xrControllers) {
            this.xrControllers.disable();
        }
        if (this.xrHands) {
            this.xrHands.disable();
        }

        // Hide teleport reticle
        this.teleportReticle.visible = false;
    }

    /**
     * Set reference space origin using INVERSE transform
     * This positions the VR user at the specified world position/rotation
     *
     * @param {Object} position - {x, y, z} world position
     * @param {Object} rotation - {y} Y-axis rotation in degrees
     */
    setReferenceSpaceOrigin(position, rotation) {
        if (!this.localSpace) return;

        const pos = position || { x: 0, y: 0, z: 0 };
        const rot = rotation || { y: 0 };

        // CRITICAL: Use PerspectiveCamera for quaternion calculation (NOT Object3D)
        // Camera default forward is -Z, which matches WebXR expectations
        const tempCamera = new THREE.PerspectiveCamera();
        tempCamera.position.set(pos.x, pos.y, pos.z);
        tempCamera.rotation.order = 'YXZ';
        tempCamera.rotation.y = rot.y * (Math.PI / 180); // Convert degrees to radians
        tempCamera.updateMatrixWorld();

        const quat = tempCamera.quaternion;

        // Create XRRigidTransform and apply INVERSE to reference space
        const transform = new XRRigidTransform(
            { x: pos.x, y: pos.y, z: pos.z },
            { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
        );

        this.currentReferenceSpace = this.localSpace.getOffsetReferenceSpace(transform.inverse);
        this.renderer.xr.setReferenceSpace(this.currentReferenceSpace);

        // Reset accumulated world offset since we just repositioned
        this.worldOffset.set(0, 0, 0);
    }

    /**
     * Update reference space by a relative offset (for continuous movement and physics)
     *
     * @param {THREE.Vector3} offset - World space offset to apply
     */
    updateReferenceSpaceByOffset(offset) {
        if (!this.currentReferenceSpace || !this.localSpace) return;

        // Accumulate offset
        this.worldOffset.add(offset);

        // Use the ACTUAL reference origin (with calculated ground height), not the config origin
        const origin = this.actualReferenceOrigin || this.xrConfig.referenceSpaceOrigin;
        const pos = origin.position || { x: 0, y: 0, z: 0 };
        const rot = origin.rotation || { y: 0 };

        // Apply accumulated world offset to actual origin position
        const newPos = {
            x: pos.x + this.worldOffset.x,
            y: pos.y + this.worldOffset.y,
            z: pos.z + this.worldOffset.z
        };

        // Create new reference space with updated position
        const tempCamera = new THREE.PerspectiveCamera();
        tempCamera.position.set(newPos.x, newPos.y, newPos.z);
        tempCamera.rotation.order = 'YXZ';
        tempCamera.rotation.y = rot.y * (Math.PI / 180);
        tempCamera.updateMatrixWorld();

        const quat = tempCamera.quaternion;
        const transform = new XRRigidTransform(
            { x: newPos.x, y: newPos.y, z: newPos.z },
            { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
        );

        this.currentReferenceSpace = this.localSpace.getOffsetReferenceSpace(transform.inverse);
        this.renderer.xr.setReferenceSpace(this.currentReferenceSpace);
    }

    /**
     * Handle teleportation to a target position
     *
     * @param {THREE.Vector3} targetPosition - World position to teleport to (ground surface)
     */
    teleportTo(targetPosition) {
        if (!this.isXRActive) return;

        // Target is the ground surface - character position is at ground level (feet)
        const adjustedTarget = targetPosition.clone();

        // Calculate offset from current character position (reference space center) to target
        const offset = new THREE.Vector3().subVectors(adjustedTarget, this.characterPosition);

        // Update character position (at ground level)
        this.characterPosition.copy(adjustedTarget);

        // Apply offset to reference space
        this.updateReferenceSpaceByOffset(offset);

        console.log('Teleported to ground:', targetPosition, 'character at feet:', adjustedTarget);
    }

    /**
     * Update teleport target visualization based on controller raycast
     *
     * @param {THREE.Vector3|null} hitPoint - Ground hit point, or null if no valid target
     */
    updateTeleportTarget(hitPoint) {
        if (hitPoint) {
            this.teleportReticle.position.copy(hitPoint);
            this.teleportReticle.visible = true;
            this.teleportTarget = hitPoint.clone();
        } else {
            this.teleportReticle.visible = false;
            this.teleportTarget = null;
        }
    }

    /**
     * Execute teleport if target is valid
     */
    executeTeleport() {
        if (this.teleportTarget) {
            this.teleportTo(this.teleportTarget);
            this.teleportReticle.visible = false;
            this.teleportTarget = null;
        }
    }

    /**
     * Handle continuous movement from thumbstick input
     *
     * @param {THREE.Vector2} thumbstick - Thumbstick axes (-1 to 1)
     * @param {number} deltaTime - Frame delta time in seconds
     */
    handleThumbstickMovement(thumbstick, deltaTime) {
        if (!this.isXRActive || thumbstick.lengthSq() < 0.01) return;

        const xrCamera = this.renderer.xr.getCamera();

        // Calculate camera-relative movement direction
        const forward = new THREE.Vector3(0, 0, -1);
        const right = new THREE.Vector3(1, 0, 0);

        // Get camera's Y rotation (yaw only, no pitch)
        const cameraYaw = Math.atan2(
            xrCamera.matrixWorld.elements[8],
            xrCamera.matrixWorld.elements[10]
        );

        // Rotate forward and right by camera yaw
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);

        // Calculate movement vector
        const moveDirection = new THREE.Vector3()
            .addScaledVector(forward, -thumbstick.y)  // Forward/backward
            .addScaledVector(right, thumbstick.x);     // Left/right

        moveDirection.y = 0; // Keep movement horizontal (gravity handles vertical)
        moveDirection.normalize();

        // Apply speed
        const speed = this.moveSpeed * (this.isRunning ? this.runSpeedMultiplier : 1.0);
        const movement = moveDirection.multiplyScalar(speed * deltaTime);

        // Apply movement offset to reference space
        // Note: This will be combined with physics updates in the update loop
        return movement;
    }

    /**
     * Update physics for VR character position (gravity, collision, jumping, jetpack)
     * Physics is applied to the reference space origin (play space center), NOT the camera
     *
     * @param {number} deltaTime - Frame delta time in seconds
     * @param {Array} groundMeshes - Array of meshes to raycast for ground detection
     */
    updateVRPhysics(deltaTime, groundMeshes) {
        if (!this.isXRActive || !this.characterControls) return;

        // IMPORTANT: Use character position (reference space center), NOT camera position
        // The camera can move around freely when the user moves their head
        // Physics should keep the play space center (feet) on the ground
        const currentPos = this.characterPosition.clone();

        // Get thumbstick movement from controllers
        let thumbstickMovement = new THREE.Vector3();
        if (this.xrControllers) {
            const thumbstick = this.xrControllers.getThumbstickAxes();
            if (thumbstick) {
                thumbstickMovement = this.handleThumbstickMovement(thumbstick, deltaTime) || new THREE.Vector3();
            }
        }

        // Use character controls to calculate physics on the character position
        const physicsResult = this.characterControls.updateVRPhysics(
            currentPos,
            this.vrVelocity,
            thumbstickMovement,
            deltaTime,
            groundMeshes,
            this.isGrounded,
            this.airTime,
            this.jetpackActive,
            this.jetpackTransitionTimer
        );

        // Update physics state
        this.vrVelocity.copy(physicsResult.velocity);
        this.isGrounded = physicsResult.isGrounded;
        this.airTime = physicsResult.airTime;
        this.jetpackActive = physicsResult.jetpackActive;
        this.jetpackTransitionTimer = physicsResult.jetpackTransitionTimer;

        // Apply position change to character position and reference space
        const positionDelta = new THREE.Vector3().subVectors(physicsResult.newPosition, currentPos);
        if (positionDelta.lengthSq() > 0.0001) {
            // Update character position (play space center)
            this.characterPosition.copy(physicsResult.newPosition);

            // Update reference space to move the play space
            this.updateReferenceSpaceByOffset(positionDelta);

            // Debug: Log physics state occasionally
            if (Math.random() < 0.01) { // 1% of frames
                console.log('VR Physics:', {
                    characterY: this.characterPosition.y.toFixed(2),
                    deltaY: positionDelta.y.toFixed(3),
                    isGrounded: physicsResult.isGrounded,
                    velocity: this.vrVelocity.y.toFixed(2)
                });
            }
        }
    }

    /**
     * Main update loop - called every frame from main.js
     *
     * @param {number} deltaTime - Frame delta time in seconds
     * @param {Array} groundMeshes - Array of meshes for collision detection
     */
    update(deltaTime, groundMeshes) {
        if (!this.isXRActive) return;

        // Update physics
        this.updateVRPhysics(deltaTime, groundMeshes);

        // Update controllers (handles input and ray visualization)
        if (this.xrControllers) {
            this.xrControllers.update(deltaTime);
        }

        // Update hands (positions hands at controller positions)
        if (this.xrHands) {
            this.xrHands.update();
        }
    }

    // UI management
    hideNonXRUI() {
        // Hide touch controls
        const touchContainer = document.getElementById('touch-controls-container');
        if (touchContainer) touchContainer.style.display = 'none';

        // Hide camera toggle button
        const cameraToggle = document.getElementById('camera-toggle');
        if (cameraToggle) cameraToggle.style.display = 'none';

        // Hide key display
        const keyDisplay = document.getElementById('key-display');
        if (keyDisplay) keyDisplay.style.display = 'none';
    }

    showNonXRUI() {
        // Show touch controls (if mobile)
        const touchContainer = document.getElementById('touch-controls-container');
        if (touchContainer) touchContainer.style.display = 'block';

        // Show camera toggle button
        const cameraToggle = document.getElementById('camera-toggle');
        if (cameraToggle) cameraToggle.style.display = 'block';

        // Show key display
        const keyDisplay = document.getElementById('key-display');
        if (keyDisplay) keyDisplay.style.display = 'block';
    }

    // Public getters
    getIsXRActive() {
        return this.isXRActive;
    }

    getXRCamera() {
        return this.isXRActive ? this.renderer.xr.getCamera() : null;
    }

    // Controller input receivers (called by xrControllers)
    onJumpPressed() {
        if (this.isGrounded) {
            // Apply jump impulse
            this.vrVelocity.y = this.characterControls.jumpForce;
            this.isGrounded = false;
            this.airTime = 0;
        }
    }

    onJetpackPressed(isPressed) {
        // Jetpack activates after 0.4s airtime
        if (this.airTime > 0.4) {
            this.jetpackActive = isPressed;
        }
    }

    onRunToggle() {
        this.isRunning = !this.isRunning;
        console.log('Run mode:', this.isRunning ? 'ON' : 'OFF');
    }

    // Cleanup
    dispose() {
        if (this.vrButton && this.vrButton.parentNode) {
            this.vrButton.parentNode.removeChild(this.vrButton);
        }

        if (this.teleportReticle) {
            this.scene.remove(this.teleportReticle);
            this.teleportReticle.geometry.dispose();
            this.teleportReticle.material.dispose();
        }

        this.renderer.xr.removeEventListener('sessionstart', this.onSessionStart);
        this.renderer.xr.removeEventListener('sessionend', this.onSessionEnd);
    }
}
