/**
 * WristPalette - Wrist-mounted color palette for Apple Vision Pro
 *
 * Creates a floating color palette attached to the left wrist
 * Visible when painting and palm facing user
 */

import * as THREE from 'three';

export class WristPalette {
    constructor(scene, xrHands) {
        this.scene = scene;
        this.xrHands = xrHands;

        // Palette configuration
        this.colors = [
            { hex: 0xff0000, name: 'Red' },
            { hex: 0xff8800, name: 'Orange' },
            { hex: 0xffff00, name: 'Yellow' },
            { hex: 0x00ff00, name: 'Green' },
            { hex: 0x00ffff, name: 'Cyan' },
            { hex: 0x0000ff, name: 'Blue' },
            { hex: 0x8800ff, name: 'Purple' },
            { hex: 0xff00ff, name: 'Magenta' },
            { hex: 0xffffff, name: 'White' },
            { hex: 0x888888, name: 'Gray' },
            { hex: 0x000000, name: 'Black' },
            { hex: 0x884400, name: 'Brown' }
        ];

        // Palette spheres
        this.spheres = [];
        this.selectedIndex = 6; // Default to purple
        this.hoveredIndex = -1;

        // Toggle button for paint mode
        this.toggleButton = null;
        this.toggleButtonHovered = false;
        this.paintModeEnabled = false; // Tracks paint mode state

        // Palette group (attached to wrist)
        this.paletteGroup = null;
        this.isVisible = false;

        // Layout configuration
        this.sphereRadius = 0.015; // 15mm spheres
        this.arcRadius = 0.12; // 12cm from wrist
        this.arcSpan = Math.PI / 2; // 90 degrees
        this.rows = 3;
        this.cols = 4;

        this.createPalette();
    }

    /**
     * Create the color palette spheres
     */
    createPalette() {
        this.paletteGroup = new THREE.Group();
        this.paletteGroup.visible = false;

        // Create 3x4 grid of color spheres arranged in arc
        let colorIndex = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                if (colorIndex >= this.colors.length) break;

                const colorData = this.colors[colorIndex];

                // Create sphere
                const geometry = new THREE.SphereGeometry(this.sphereRadius, 16, 16);
                const material = new THREE.MeshStandardMaterial({
                    color: colorData.hex,
                    roughness: 0.3,
                    metalness: 0.1,
                    emissive: colorData.hex,
                    emissiveIntensity: 0.2
                });
                const sphere = new THREE.Mesh(geometry, material);

                // Position in arc
                // Arc goes from -arcSpan/2 to +arcSpan/2 horizontally
                // Rows are stacked vertically
                const colAngle = (col / (this.cols - 1) - 0.5) * this.arcSpan;
                const rowOffset = (row - (this.rows - 1) / 2) * (this.sphereRadius * 3);

                sphere.position.x = Math.sin(colAngle) * this.arcRadius;
                sphere.position.y = rowOffset;
                sphere.position.z = -Math.cos(colAngle) * this.arcRadius;

                // Store color data and index
                sphere.userData.colorIndex = colorIndex;
                sphere.userData.colorHex = colorData.hex;
                sphere.userData.colorName = colorData.name;

                this.spheres.push(sphere);
                this.paletteGroup.add(sphere);

                colorIndex++;
            }
        }

        // Add selection ring (initially around default color)
        const ringGeometry = new THREE.RingGeometry(
            this.sphereRadius * 1.2,
            this.sphereRadius * 1.5,
            32
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        this.selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
        this.selectionRing.visible = false;
        this.paletteGroup.add(this.selectionRing);

        // Create toggle button (positioned above color palette)
        const toggleButtonRadius = this.sphereRadius * 2.5; // Larger than color spheres
        const toggleGeometry = new THREE.SphereGeometry(toggleButtonRadius, 16, 16);
        const toggleMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000, // Red = OFF (will change to green when ON)
            roughness: 0.3,
            metalness: 0.1,
            emissive: 0xff0000,
            emissiveIntensity: 0.3
        });
        this.toggleButton = new THREE.Mesh(toggleGeometry, toggleMaterial);

        // Position above color palette
        this.toggleButton.position.set(0, this.sphereRadius * 6, 0);
        this.toggleButton.userData.isToggleButton = true;
        this.paletteGroup.add(this.toggleButton);

        // Add to scene
        this.scene.add(this.paletteGroup);

        console.log('WristPalette created with', this.colors.length, 'colors and toggle button');
    }

    /**
     * Update palette position and visibility
     * @param {THREE.Vector3} cameraPosition - Current camera/head position
     */
    update(cameraPosition) {
        // Palette now shows when palm is facing user (regardless of paint mode)
        // This allows users to access the toggle button at any time

        // Check if hand tracking is available and palm is facing user
        const session = this.xrHands.renderer.xr.getSession();
        if (!session) {
            this.hide();
            return;
        }

        // Find left hand
        let leftHand = null;
        for (const source of session.inputSources) {
            if (source.hand && source.handedness === 'left') {
                leftHand = source.hand;
                break;
            }
        }

        if (!leftHand) {
            this.hide();
            return;
        }

        // Get wrist position and palm orientation
        const wrist = this.xrHands.getJointPosition(leftHand, 'wrist');
        const palmNormal = this.xrHands.getPalmNormal(leftHand);

        if (!wrist || !palmNormal || !cameraPosition) {
            this.hide();
            return;
        }

        // Check if palm is facing user
        const toCamera = new THREE.Vector3().subVectors(cameraPosition, wrist).normalize();
        const dot = palmNormal.dot(toCamera);

        if (dot > 0.5) {
            // Palm is facing user - show palette
            this.show();

            // Position palette at wrist with offset
            this.paletteGroup.position.copy(wrist);

            // Orient palette to face camera
            this.paletteGroup.lookAt(cameraPosition);

            // Apply offset along look direction (away from wrist toward camera)
            const offsetDirection = new THREE.Vector3()
                .subVectors(cameraPosition, wrist)
                .normalize();
            this.paletteGroup.position.add(offsetDirection.multiplyScalar(0.05));

        } else {
            // Palm facing away - hide palette
            this.hide();
        }
    }

    /**
     * Check if right hand is pointing at a color sphere
     * @param {THREE.Vector3} rayOrigin - Ray origin (wrist position)
     * @param {THREE.Vector3} rayDirection - Ray direction (normalized)
     * @returns {number|null} - Color index if pointing at a sphere, null otherwise
     */
    checkHover(rayOrigin, rayDirection) {
        if (!this.isVisible) return null;

        const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
        const intersects = raycaster.intersectObjects(this.spheres);

        if (intersects.length > 0) {
            const colorIndex = intersects[0].object.userData.colorIndex;
            this.setHovered(colorIndex);
            return colorIndex;
        } else {
            this.setHovered(-1);
            return null;
        }
    }

    /**
     * Check if pointing at toggle button
     * @param {THREE.Vector3} rayOrigin - Ray origin (wrist position)
     * @param {THREE.Vector3} rayDirection - Ray direction (normalized)
     * @returns {boolean} - True if pointing at toggle button
     */
    checkToggleButtonHover(rayOrigin, rayDirection) {
        if (!this.isVisible || !this.toggleButton) return false;

        const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
        const intersects = raycaster.intersectObject(this.toggleButton);

        const isHovering = intersects.length > 0;

        // Update hover state
        if (isHovering !== this.toggleButtonHovered) {
            this.toggleButtonHovered = isHovering;

            // Visual feedback for hover
            if (this.toggleButton) {
                if (isHovering) {
                    this.toggleButton.scale.set(1.2, 1.2, 1.2);
                    this.toggleButton.material.emissiveIntensity = 0.6;
                } else {
                    this.toggleButton.scale.set(1, 1, 1);
                    this.toggleButton.material.emissiveIntensity = 0.3;
                }
            }
        }

        return isHovering;
    }

    /**
     * Toggle paint mode on/off
     * @returns {boolean} - New paint mode state
     */
    togglePaintMode() {
        this.paintModeEnabled = !this.paintModeEnabled;

        // Update toggle button appearance
        if (this.toggleButton) {
            const color = this.paintModeEnabled ? 0x00ff00 : 0xff0000; // Green = ON, Red = OFF
            this.toggleButton.material.color.setHex(color);
            this.toggleButton.material.emissive.setHex(color);

            // Pulse effect on toggle
            this.toggleButton.scale.set(1.4, 1.4, 1.4);
            setTimeout(() => {
                this.toggleButton.scale.set(1, 1, 1);
            }, 100);
        }

        console.log(`Paint mode toggled: ${this.paintModeEnabled ? 'ON' : 'OFF'}`);
        return this.paintModeEnabled;
    }

    /**
     * Get current paint mode state
     * @returns {boolean}
     */
    getPaintModeEnabled() {
        return this.paintModeEnabled;
    }

    /**
     * Set hovered color index
     */
    setHovered(index) {
        if (this.hoveredIndex === index) return;

        // Reset previous hovered
        if (this.hoveredIndex >= 0 && this.hoveredIndex < this.spheres.length) {
            const sphere = this.spheres[this.hoveredIndex];
            sphere.scale.set(1, 1, 1);
            sphere.material.emissiveIntensity = 0.2;
        }

        this.hoveredIndex = index;

        // Highlight new hovered
        if (this.hoveredIndex >= 0 && this.hoveredIndex < this.spheres.length) {
            const sphere = this.spheres[this.hoveredIndex];
            sphere.scale.set(1.3, 1.3, 1.3);
            sphere.material.emissiveIntensity = 0.6;
        }
    }

    /**
     * Select a color
     */
    selectColor(index) {
        if (index < 0 || index >= this.colors.length) return;

        this.selectedIndex = index;
        console.log('Selected color:', this.colors[index].name);

        // Update selection ring position
        const sphere = this.spheres[index];
        this.selectionRing.position.copy(sphere.position);
        this.selectionRing.lookAt(this.paletteGroup.position);
        this.selectionRing.visible = this.isVisible;

        // Pulse effect on selection
        const originalScale = sphere.scale.clone();
        sphere.scale.set(1.5, 1.5, 1.5);
        setTimeout(() => {
            sphere.scale.copy(originalScale);
        }, 100);
    }

    /**
     * Get currently selected color
     */
    getSelectedColor() {
        return this.colors[this.selectedIndex];
    }

    /**
     * Show palette
     */
    show() {
        if (!this.isVisible) {
            this.paletteGroup.visible = true;
            this.selectionRing.visible = true;
            this.isVisible = true;

            // Update selection ring position
            if (this.selectedIndex >= 0 && this.selectedIndex < this.spheres.length) {
                const sphere = this.spheres[this.selectedIndex];
                this.selectionRing.position.copy(sphere.position);
                this.selectionRing.lookAt(this.paletteGroup.position);
            }
        }
    }

    /**
     * Hide palette
     */
    hide() {
        if (this.isVisible) {
            this.paletteGroup.visible = false;
            this.selectionRing.visible = false;
            this.isVisible = false;
            this.setHovered(-1); // Clear hover state
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        this.spheres.forEach(sphere => {
            sphere.geometry.dispose();
            sphere.material.dispose();
        });

        if (this.selectionRing) {
            this.selectionRing.geometry.dispose();
            this.selectionRing.material.dispose();
        }

        if (this.toggleButton) {
            this.toggleButton.geometry.dispose();
            this.toggleButton.material.dispose();
        }

        if (this.paletteGroup) {
            this.scene.remove(this.paletteGroup);
        }
    }
}
