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
        this.isSelectPressed = false; // Trigger for teleport/paint
        this.isSqueezePressed = false; // Grip for jump/jetpack
        this.squeezeHoldTime = 0;
        this.buttonAPressed = false; // A/X button for run toggle
        this.buttonBPressed = false; // B/Y button for paint toggle
        this.buttonACooldown = 0; // Cooldown timer for A/X button
        this.buttonBCooldown = 0; // Cooldown timer for B/Y button
        this.buttonCooldownDuration = 0.3; // 300ms cooldown between toggles

        // Paint mode state
        this.isPaintMode = false;
        this.colorPalette = null; // VR color palette group
        this.paletteColors = [
            { name: 'Red', hex: 0xff0000 },
            { name: 'Orange', hex: 0xff8800 },
            { name: 'Yellow', hex: 0xffff00 },
            { name: 'Green', hex: 0x00ff00 },
            { name: 'Cyan', hex: 0x00ffff },
            { name: 'Blue', hex: 0x0000ff },
            { name: 'Purple', hex: 0x8800ff },
            { name: 'Magenta', hex: 0xff00ff },
            { name: 'White', hex: 0xffffff },
            { name: 'Gray', hex: 0x808080 },
            { name: 'Black', hex: 0x000000 },
            { name: 'Brown', hex: 0x8b4513 }
        ];
        this.currentColorIndex = 4; // Start with Cyan (matches default #ff00ff in desktop)

        // Raycaster for teleportation and painting
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
        console.log(`Controller ${controllerIndex} select start - isPaintMode: ${this.isPaintMode}`);
        this.isSelectPressed = true;

        // Show ray with appropriate color
        const rayLine = controllerIndex === 0 ? this.rayLine0 : this.rayLine1;
        if (rayLine) {
            rayLine.visible = true;
            // Update ray color: green for both paint and teleport modes
            rayLine.material.color.setHex(0x00ff00);
        }

        // Start painting if in paint mode
        if (this.isPaintMode) {
            console.log('Paint mode active - setting isDragging to true');
            this.isDragging = true;
        } else {
            console.log('NOT in paint mode - will teleport on release');
        }
    }

    onSelectEnd(controllerIndex, event) {
        console.log(`Controller ${controllerIndex} select end - isPaintMode: ${this.isPaintMode}`);
        this.isSelectPressed = false;

        // Hide ray
        const rayLine = controllerIndex === 0 ? this.rayLine0 : this.rayLine1;
        if (rayLine) {
            rayLine.visible = false;
        }

        // Paint mode: Check for color selection first, then painting
        if (this.isPaintMode) {
            console.log('Paint mode - checking color selection');
            // Check if pointing at color palette
            if (this.checkColorSelection(controllerIndex)) {
                // Color selected, don't paint
                console.log('Color selected from palette');
                return;
            }
            // Stop painting
            console.log('Stopping paint (isDragging = false)');
            this.isDragging = false;
        } else {
            // Teleport mode: Execute teleport
            console.log('NOT in paint mode - executing teleport');
            this.xrManager.executeTeleport();
        }
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
                    // Only trigger if button wasn't pressed before AND cooldown is expired
                    if (!this.buttonAPressed && this.buttonACooldown <= 0) {
                        this.buttonAPressed = true;
                        this.buttonACooldown = this.buttonCooldownDuration; // Reset cooldown
                        this.xrManager.onRunToggle();
                    }
                } else {
                    this.buttonAPressed = false;
                }

                // Check for B/Y button press (button index 5) for paint mode toggle
                if (gamepad.buttons.length > 5 && gamepad.buttons[5].pressed) {
                    // Only trigger if button wasn't pressed before AND cooldown is expired
                    if (!this.buttonBPressed && this.buttonBCooldown <= 0) {
                        this.buttonBPressed = true;
                        this.buttonBCooldown = this.buttonCooldownDuration; // Reset cooldown
                        console.log(`B/Y button pressed - toggling paint mode (cooldown: ${this.buttonCooldownDuration}s)`);
                        this.togglePaintMode();
                    } else if (this.buttonBCooldown > 0) {
                        // Button pressed but cooldown active (silent - prevents spam)
                    }
                } else {
                    this.buttonBPressed = false;
                }
            }
        }

        this.thumbstickAxes.set(0, 0);
        return this.thumbstickAxes;
    }

    /**
     * Toggle paint mode on/off in VR
     */
    togglePaintMode() {
        this.isPaintMode = !this.isPaintMode;

        if (this.isPaintMode) {
            console.log('VR Paint mode: ON');
            this.showColorPalette();
            // Hide teleportation rays when entering paint mode
            if (this.rayLine0) this.rayLine0.visible = false;
            if (this.rayLine1) this.rayLine1.visible = false;
            // Clear any teleport target visualization
            this.xrManager.updateTeleportTarget(null);
        } else {
            console.log('VR Paint mode: OFF');
            this.hideColorPalette();
            // Rays will be shown again when trigger is pressed (handled by onSelectStart)
        }
    }

    /**
     * Create the VR color palette (3x4 grid of colored spheres)
     */
    createColorPalette() {
        this.colorPalette = new THREE.Group();

        const sphereGeometry = new THREE.SphereGeometry(0.03, 16, 16);
        const spacing = 0.08;

        // Create 3x4 grid of color spheres
        this.paletteColors.forEach((colorData, index) => {
            const material = new THREE.MeshBasicMaterial({ color: colorData.hex });
            const sphere = new THREE.Mesh(sphereGeometry, material);

            // Calculate position in 3x4 grid
            const row = Math.floor(index / 3);
            const col = index % 3;
            sphere.position.set(
                col * spacing - spacing, // Center the grid
                -row * spacing,
                0
            );

            sphere.userData = {
                isColorPicker: true,
                colorIndex: index,
                colorHex: colorData.hex,
                colorName: colorData.name
            };

            this.colorPalette.add(sphere);
        });

        // Position palette relative to left controller (will be updated each frame)
        this.colorPalette.position.set(0.15, 0, -0.3); // Right and forward from controller
        this.colorPalette.visible = false;

        // Add to left controller (controller1)
        if (this.controller1) {
            this.controller1.add(this.colorPalette);
        }

        console.log('VR color palette created');
    }

    /**
     * Show color palette in VR
     */
    showColorPalette() {
        if (!this.colorPalette) {
            this.createColorPalette();
        }
        if (this.colorPalette) {
            this.colorPalette.visible = true;
        }
    }

    /**
     * Hide color palette in VR
     */
    hideColorPalette() {
        if (this.colorPalette) {
            this.colorPalette.visible = false;
        }
    }

    /**
     * Check if controller is pointing at color palette and select color
     * @param {number} controllerIndex - 0 or 1
     * @returns {boolean} True if color was selected, false otherwise
     */
    checkColorSelection(controllerIndex) {
        if (!this.isPaintMode || !this.colorPalette || !this.colorPalette.visible) {
            return false;
        }

        const controller = controllerIndex === 0 ? this.controller0 : this.controller1;
        if (!controller) return false;

        // Get controller world position and direction
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        // Raycast against palette spheres
        const intersects = this.raycaster.intersectObjects(this.colorPalette.children, false);

        if (intersects.length > 0) {
            const selectedSphere = intersects[0].object;
            if (selectedSphere.userData.isColorPicker) {
                this.currentColorIndex = selectedSphere.userData.colorIndex;
                console.log(`Selected color: ${selectedSphere.userData.colorName}`);

                // Visual feedback: briefly enlarge the selected sphere
                selectedSphere.scale.set(1.3, 1.3, 1.3);
                setTimeout(() => {
                    selectedSphere.scale.set(1, 1, 1);
                }, 200);

                return true;
            }
        }

        return false;
    }

    /**
     * Get current controller ray for painting
     * @param {number} controllerIndex - 0 or 1
     * @returns {object|null} Ray origin and direction, or null
     */
    getRayForPainting(controllerIndex) {
        if (!this.isPaintMode) return null;

        const controller = controllerIndex === 0 ? this.controller0 : this.controller1;
        if (!controller) return null;

        // Get controller world position and direction
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const origin = new THREE.Vector3();
        origin.setFromMatrixPosition(controller.matrixWorld);

        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyMatrix4(tempMatrix).normalize();

        return { origin, direction };
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

        // Update button cooldown timers (prevent rapid toggling)
        if (this.buttonACooldown > 0) {
            this.buttonACooldown -= deltaTime;
        }
        if (this.buttonBCooldown > 0) {
            this.buttonBCooldown -= deltaTime;
        }

        // Update teleport target visualization (only when NOT in paint mode)
        if (this.isSelectPressed && !this.isPaintMode) {
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
