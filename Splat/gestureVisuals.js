/**
 * GestureVisuals - Visual feedback for hand gestures
 *
 * Provides rays, highlights, and effects for gesture feedback
 */

import * as THREE from 'three';

export class GestureVisuals {
    constructor(scene) {
        this.scene = scene;

        // Paint ray visuals (one for each hand)
        this.paintRays = {
            left: null,
            right: null
        };

        // Movement indicator
        this.movementArrow = null;

        // Jetpack glow effects
        this.jetpackGlows = {
            left: null,
            right: null
        };

        this.createVisuals();
    }

    /**
     * Create all visual feedback elements
     */
    createVisuals() {
        // Create paint rays
        this.createPaintRays();

        // Create movement arrow
        this.createMovementArrow();

        // Create jetpack glows
        this.createJetpackGlows();
    }

    /**
     * Create paint ray visuals
     */
    createPaintRays() {
        const createRay = () => {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                0, 0, 0,  // Start
                0, 0, -5  // End (5 meters forward)
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const material = new THREE.LineBasicMaterial({
                color: 0x00ff00, // Green for painting
                transparent: true,
                opacity: 0.6,
                linewidth: 2
            });

            const line = new THREE.Line(geometry, material);
            line.visible = false;
            this.scene.add(line);
            return line;
        };

        this.paintRays.left = createRay();
        this.paintRays.right = createRay();
    }

    /**
     * Create movement direction arrow
     */
    createMovementArrow() {
        const group = new THREE.Group();

        // Arrow shaft (cylinder)
        const shaftGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
        const shaftMaterial = new THREE.MeshBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.7
        });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        shaft.rotation.z = -Math.PI / 2; // Point forward
        group.add(shaft);

        // Arrow head (cone)
        const headGeometry = new THREE.ConeGeometry(0.05, 0.1, 8);
        const headMaterial = new THREE.MeshBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.7
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.rotation.z = -Math.PI / 2;
        head.position.x = 0.25;
        group.add(head);

        group.visible = false;
        this.scene.add(group);
        this.movementArrow = group;
    }

    /**
     * Create jetpack glow effects
     */
    createJetpackGlows() {
        const createGlow = () => {
            const geometry = new THREE.SphereGeometry(0.06, 16, 16);
            const material = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.5
            });
            const glow = new THREE.Mesh(geometry, material);
            glow.visible = false;
            this.scene.add(glow);
            return glow;
        };

        this.jetpackGlows.left = createGlow();
        this.jetpackGlows.right = createGlow();
    }

    /**
     * Update paint ray visualization
     */
    updatePaintRay(handedness, rayOrigin, rayDirection, visible = true) {
        const ray = this.paintRays[handedness];
        if (!ray) return;

        if (visible && rayOrigin && rayDirection) {
            ray.visible = true;

            // Position at ray origin
            ray.position.copy(rayOrigin);

            // Orient along ray direction
            const target = new THREE.Vector3()
                .copy(rayOrigin)
                .add(rayDirection.clone().multiplyScalar(5));
            ray.lookAt(target);

            // Update line endpoint
            const positions = ray.geometry.attributes.position.array;
            positions[3] = 0;
            positions[4] = 0;
            positions[5] = -5;
            ray.geometry.attributes.position.needsUpdate = true;
        } else {
            ray.visible = false;
        }
    }

    /**
     * Update movement arrow visualization
     */
    updateMovementArrow(position, direction, speed, visible = true) {
        if (!this.movementArrow) return;

        if (visible && position && direction && speed > 0) {
            this.movementArrow.visible = true;

            // Position at user's feet (slightly in front)
            this.movementArrow.position.copy(position);
            this.movementArrow.position.y = position.y - 1.3; // Near ground

            // Point in movement direction
            const target = new THREE.Vector3()
                .copy(position)
                .add(direction);
            target.y = this.movementArrow.position.y; // Keep horizontal
            this.movementArrow.lookAt(target);

            // Scale based on speed
            const scale = 0.5 + speed * 0.5; // 0.5-1.0
            this.movementArrow.scale.set(scale, scale, scale);

            // Opacity based on speed
            this.movementArrow.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = 0.4 + speed * 0.3;
                }
            });
        } else {
            this.movementArrow.visible = false;
        }
    }

    /**
     * Update jetpack glow visualization
     */
    updateJetpackGlow(handedness, position, visible = true) {
        const glow = this.jetpackGlows[handedness];
        if (!glow) return;

        if (visible && position) {
            glow.visible = true;
            glow.position.copy(position);

            // Pulse effect
            const time = performance.now() * 0.005;
            const pulse = 0.8 + Math.sin(time) * 0.2;
            glow.scale.set(pulse, pulse, pulse);
            glow.material.opacity = 0.3 + Math.sin(time * 2) * 0.2;
        } else {
            glow.visible = false;
        }
    }

    /**
     * Hide all paint rays
     */
    hidePaintRays() {
        this.paintRays.left.visible = false;
        this.paintRays.right.visible = false;
    }

    /**
     * Hide movement arrow
     */
    hideMovementArrow() {
        if (this.movementArrow) {
            this.movementArrow.visible = false;
        }
    }

    /**
     * Hide all jetpack glows
     */
    hideJetpackGlows() {
        this.jetpackGlows.left.visible = false;
        this.jetpackGlows.right.visible = false;
    }

    /**
     * Hide all visuals
     */
    hideAll() {
        this.hidePaintRays();
        this.hideMovementArrow();
        this.hideJetpackGlows();
    }

    /**
     * Cleanup
     */
    dispose() {
        // Dispose paint rays
        Object.values(this.paintRays).forEach(ray => {
            if (ray) {
                ray.geometry.dispose();
                ray.material.dispose();
                this.scene.remove(ray);
            }
        });

        // Dispose movement arrow
        if (this.movementArrow) {
            this.movementArrow.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.scene.remove(this.movementArrow);
        }

        // Dispose jetpack glows
        Object.values(this.jetpackGlows).forEach(glow => {
            if (glow) {
                glow.geometry.dispose();
                glow.material.dispose();
                this.scene.remove(glow);
            }
        });
    }
}
