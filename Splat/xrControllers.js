/**
 * XRControllers - Manages VR controller detection, models, input, and interaction
 *
 * Handles:
 * - Controller grip and pointer models
 * - Button/trigger/thumbstick input
 * - Ray visualization for teleportation
 * - Input mapping to game actions
 */

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class XRControllers {
    constructor(renderer, scene, xrManager) {
        this.renderer = renderer;
        this.scene = scene;
        this.xrManager = xrManager;

        // Controllers
        this.controller0 = null; // Right hand (primary)
        this.controller1 = null; // Left hand (secondary)
        this.controllerGrip0 = null;
        this.controllerGrip1 = null;

        // Controller models
        this.controllerModelFactory = new XRControllerModelFactory();

        // Ray visualization for teleportation
        this.rayLine0 = null;
        this.rayLine1 = null;

        // Input state
        this.thumbstickAxes = new THREE.Vector2();
        this.isSelectPressed = false; // Trigger for teleport
        this.isSqueezePressed = false; // Grip for jump/jetpack
        this.squeezeHoldTime = 0;

        // Raycaster for teleportation
        this.raycaster = new THREE.Raycaster();

        // Ground meshes for raycasting (set by xrManager)
        this.groundMeshes = [];

        this.isEnabled = false;
    }

    init() {
        // Controller 0 (right hand) - Primary controller
        this.controller0 = this.renderer.xr.getController(0);
        this.controller0.addEventListener('selectstart', this.onSelectStart.bind(this, 0));
        this.controller0.addEventListener('selectend', this.onSelectEnd.bind(this, 0));
        this.controller0.addEventListener('squeezestart', this.onSqueezeStart.bind(this, 0));
        this.controller0.addEventListener('squeezeend', this.onSqueezeEnd.bind(this, 0));
        this.scene.add(this.controller0);

        // Controller 1 (left hand) - Secondary controller
        this.controller1 = this.renderer.xr.getController(1);
        this.controller1.addEventListener('selectstart', this.onSelectStart.bind(this, 1));
        this.controller1.addEventListener('selectend', this.onSelectEnd.bind(this, 1));
        this.controller1.addEventListener('squeezestart', this.onSqueezeStart.bind(this, 1));
        this.controller1.addEventListener('squeezeend', this.onSqueezeEnd.bind(this, 1));
        this.scene.add(this.controller1);

        // Controller grips (for hand models)
        this.controllerGrip0 = this.renderer.xr.getControllerGrip(0);
        this.controllerGrip0.add(this.controllerModelFactory.createControllerModel(this.controllerGrip0));
        this.scene.add(this.controllerGrip0);

        this.controllerGrip1 = this.renderer.xr.getControllerGrip(1);
        this.controllerGrip1.add(this.controllerModelFactory.createControllerModel(this.controllerGrip1));
        this.scene.add(this.controllerGrip1);

        // Create ray lines for both controllers
        this.rayLine0 = this.createRayLine();
        this.controller0.add(this.rayLine0);

        this.rayLine1 = this.createRayLine();
        this.controller1.add(this.rayLine1);

        console.log('XR Controllers initialized');
    }

    createRayLine() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([0, 0, 0, 0, 0, -5]); // 5 meter ray
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 2,
            transparent: true,
            opacity: 0.6
        });

        const line = new THREE.Line(geometry, material);
        line.visible = false; // Hidden by default
        return line;
    }

    enable() {
        this.isEnabled = true;
        if (!this.controller0) {
            this.init();
        }
    }

    disable() {
        this.isEnabled = false;
        if (this.rayLine0) this.rayLine0.visible = false;
        if (this.rayLine1) this.rayLine1.visible = false;
    }

    // Event handlers
    onSelectStart(controllerIndex, event) {
        console.log(`Controller ${controllerIndex} select start`);
        this.isSelectPressed = true;

        // Show ray for teleportation
        if (controllerIndex === 0 && this.rayLine0) {
            this.rayLine0.visible = true;
        } else if (controllerIndex === 1 && this.rayLine1) {
            this.rayLine1.visible = true;
        }
    }

    onSelectEnd(controllerIndex, event) {
        console.log(`Controller ${controllerIndex} select end`);
        this.isSelectPressed = false;

        // Hide ray
        if (controllerIndex === 0 && this.rayLine0) {
            this.rayLine0.visible = false;
        } else if (controllerIndex === 1 && this.rayLine1) {
            this.rayLine1.visible = false;
        }

        // Execute teleport
        this.xrManager.executeTeleport();
    }

    onSqueezeStart(controllerIndex, event) {
        console.log(`Controller ${controllerIndex} squeeze start`);
        this.isSqueezePressed = true;
        this.squeezeHoldTime = 0;

        // Immediate jump if grounded
        this.xrManager.onJumpPressed();
    }

    onSqueezeEnd(controllerIndex, event) {
        console.log(`Controller ${controllerIndex} squeeze end`);
        this.isSqueezePressed = false;

        // Deactivate jetpack
        this.xrManager.onJetpackPressed(false);
    }

    /**
     * Get thumbstick axes from XR gamepads
     * @returns {THREE.Vector2|null} Thumbstick axes (-1 to 1) or null if no gamepad
     */
    getThumbstickAxes() {
        const session = this.renderer.xr.getSession();
        if (!session) return null;

        // Try to get gamepad from either controller
        for (const inputSource of session.inputSources) {
            if (inputSource.gamepad) {
                const gamepad = inputSource.gamepad;

                // Standard mapping: axes[2] = thumbstick X, axes[3] = thumbstick Y
                if (gamepad.axes.length >= 4) {
                    this.thumbstickAxes.set(gamepad.axes[2], gamepad.axes[3]);

                    // Check if thumbstick has significant input
                    if (this.thumbstickAxes.lengthSq() > 0.01) {
                        return this.thumbstickAxes;
                    }
                }

                // Check for A/X button press (button index 4) for run toggle
                if (gamepad.buttons.length > 4 && gamepad.buttons[4].pressed) {
                    // Debounce button press
                    if (!this.buttonAPressed) {
                        this.buttonAPressed = true;
                        this.xrManager.onRunToggle();
                    }
                } else {
                    this.buttonAPressed = false;
                }
            }
        }

        this.thumbstickAxes.set(0, 0);
        return this.thumbstickAxes;
    }

    /**
     * Raycast from controller to find teleport target
     * @param {THREE.Object3D} controller - Controller to raycast from
     * @returns {THREE.Vector3|null} Hit point on ground, or null if no hit
     */
    raycastForTeleport(controller) {
        if (!controller || this.groundMeshes.length === 0) return null;

        // Get controller world position and direction
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const raycaster = this.raycaster;
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        // Raycast against ground meshes
        const intersects = raycaster.intersectObjects(this.groundMeshes, false);

        if (intersects.length > 0) {
            return intersects[0].point;
        }

        return null;
    }

    /**
     * Update controller state each frame
     * @param {number} deltaTime - Frame delta time in seconds
     */
    update(deltaTime) {
        if (!this.isEnabled) return;

        // Update squeeze hold time for jetpack activation
        if (this.isSqueezePressed) {
            this.squeezeHoldTime += deltaTime;

            // Activate jetpack after 0.4s hold
            if (this.squeezeHoldTime > 0.4) {
                this.xrManager.onJetpackPressed(true);
            }
        } else {
            this.squeezeHoldTime = 0;
        }

        // Update teleport target visualization
        if (this.isSelectPressed) {
            // Raycast from primary controller (right hand)
            const hitPoint = this.raycastForTeleport(this.controller0);
            this.xrManager.updateTeleportTarget(hitPoint);

            // Update ray color based on valid target
            if (this.rayLine0) {
                this.rayLine0.material.color.setHex(hitPoint ? 0x00ff00 : 0xff0000);
            }
        } else {
            this.xrManager.updateTeleportTarget(null);
        }

        // Read thumbstick input (used by xrManager for movement)
        this.getThumbstickAxes();
    }

    // Set ground meshes for raycasting
    setGroundMeshes(meshes) {
        this.groundMeshes = meshes;
    }

    // Cleanup
    dispose() {
        if (this.rayLine0) {
            this.rayLine0.geometry.dispose();
            this.rayLine0.material.dispose();
        }
        if (this.rayLine1) {
            this.rayLine1.geometry.dispose();
            this.rayLine1.material.dispose();
        }

        if (this.controller0) {
            this.controller0.removeEventListener('selectstart', this.onSelectStart);
            this.controller0.removeEventListener('selectend', this.onSelectEnd);
            this.controller0.removeEventListener('squeezestart', this.onSqueezeStart);
            this.controller0.removeEventListener('squeezeend', this.onSqueezeEnd);
        }

        if (this.controller1) {
            this.controller1.removeEventListener('selectstart', this.onSelectStart);
            this.controller1.removeEventListener('selectend', this.onSelectEnd);
            this.controller1.removeEventListener('squeezestart', this.onSqueezeStart);
            this.controller1.removeEventListener('squeezeend', this.onSqueezeEnd);
        }
    }
}
