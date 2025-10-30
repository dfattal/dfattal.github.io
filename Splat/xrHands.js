/**
 * XRHands - Manages hand model visualization for VR controllers
 *
 * Displays simple hand representations that follow controller positions
 * Provides visual feedback for grip/trigger actions
 */

import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class XRHands {
    constructor(renderer, scene, characterModel) {
        this.renderer = renderer;
        this.scene = scene;
        this.characterModel = characterModel; // Optional: character model for extracting hand meshes

        // Hand controllers
        this.hand0 = null; // Right hand
        this.hand1 = null; // Left hand

        // Hand models
        this.handModelFactory = new XRHandModelFactory();
        this.rightHandMesh = null;
        this.leftHandMesh = null;

        // Fallback simple hand meshes if no hand tracking
        this.rightHandFallback = null;
        this.leftHandFallback = null;

        this.isEnabled = false;
    }

    init() {
        // Try to use native hand tracking if available
        this.hand0 = this.renderer.xr.getHand(0);
        this.hand1 = this.renderer.xr.getHand(1);

        // Add hand models
        try {
            this.rightHandMesh = this.handModelFactory.createHandModel(this.hand0, 'mesh');
            this.hand0.add(this.rightHandMesh);
            this.scene.add(this.hand0);
        } catch (error) {
            console.warn('Hand tracking model 0 not available, using fallback');
        }

        try {
            this.leftHandMesh = this.handModelFactory.createHandModel(this.hand1, 'mesh');
            this.hand1.add(this.leftHandMesh);
            this.scene.add(this.hand1);
        } catch (error) {
            console.warn('Hand tracking model 1 not available, using fallback');
        }

        // Create fallback hand representations (simple spheres with pointer)
        this.createFallbackHands();

        console.log('XR Hands initialized');
    }

    createFallbackHands() {
        // Create simple hand representations
        // These will be used if hand tracking is not available

        // Right hand
        const rightHandGroup = new THREE.Group();

        // Palm (small sphere)
        const palmGeometry = new THREE.SphereGeometry(0.04, 16, 16);
        const palmMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac, // Skin tone
            roughness: 0.8,
            metalness: 0.1
        });
        const palm = new THREE.Mesh(palmGeometry, palmMaterial);
        rightHandGroup.add(palm);

        // Pointer finger (cylinder)
        const fingerGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8);
        const fingerMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8,
            metalness: 0.1
        });
        const finger = new THREE.Mesh(fingerGeometry, fingerMaterial);
        finger.position.set(0, 0, -0.06);
        finger.rotation.x = Math.PI / 2;
        rightHandGroup.add(finger);

        // Fingertip (small sphere)
        const tipGeometry = new THREE.SphereGeometry(0.012, 8, 8);
        const tip = new THREE.Mesh(tipGeometry, fingerMaterial);
        tip.position.set(0, 0, -0.1);
        rightHandGroup.add(tip);

        this.rightHandFallback = rightHandGroup;
        this.rightHandFallback.visible = false;
        this.scene.add(this.rightHandFallback);

        // Left hand (mirror of right)
        const leftHandGroup = rightHandGroup.clone();
        this.leftHandFallback = leftHandGroup;
        this.leftHandFallback.visible = false;
        this.scene.add(this.leftHandFallback);
    }

    enable() {
        this.isEnabled = true;

        if (!this.hand0) {
            this.init();
        }

        // Show fallback hands if native hand tracking is not available
        this.updateFallbackVisibility();
    }

    disable() {
        this.isEnabled = false;

        // Hide fallback hands
        if (this.rightHandFallback) this.rightHandFallback.visible = false;
        if (this.leftHandFallback) this.leftHandFallback.visible = false;
    }

    updateFallbackVisibility() {
        if (!this.isEnabled) return;

        // Show fallback hands if native hand tracking is not providing data
        const session = this.renderer.xr.getSession();
        if (!session) return;

        // Check if hand tracking is active
        let handTrackingActive = false;
        for (const inputSource of session.inputSources) {
            if (inputSource.hand) {
                handTrackingActive = true;
                break;
            }
        }

        // Use fallback if hand tracking is not active
        if (this.rightHandFallback) {
            this.rightHandFallback.visible = this.isEnabled && !handTrackingActive;
        }
        if (this.leftHandFallback) {
            this.leftHandFallback.visible = this.isEnabled && !handTrackingActive;
        }
    }

    /**
     * Update hand positions to follow controllers
     */
    update() {
        if (!this.isEnabled) return;

        // Update fallback visibility
        this.updateFallbackVisibility();

        // Update fallback hand positions to match controllers
        if (this.rightHandFallback && this.rightHandFallback.visible) {
            const controller0 = this.renderer.xr.getController(0);
            if (controller0) {
                this.rightHandFallback.position.copy(controller0.position);
                this.rightHandFallback.quaternion.copy(controller0.quaternion);
            }
        }

        if (this.leftHandFallback && this.leftHandFallback.visible) {
            const controller1 = this.renderer.xr.getController(1);
            if (controller1) {
                this.leftHandFallback.position.copy(controller1.position);
                this.leftHandFallback.quaternion.copy(controller1.quaternion);
            }
        }

        // Native hand tracking updates automatically via XRHandModelFactory
    }

    /**
     * Animate finger curl for grip/trigger actions
     * @param {number} handIndex - 0 for right, 1 for left
     * @param {number} gripAmount - 0 to 1 (0 = open, 1 = closed)
     */
    animateGrip(handIndex, gripAmount) {
        // For fallback hands, we could scale or rotate fingers
        // Native hand tracking handles this automatically

        const hand = handIndex === 0 ? this.rightHandFallback : this.leftHandFallback;
        if (!hand || !hand.visible) return;

        // Simple animation: scale finger based on grip
        const finger = hand.children[1]; // Pointer finger
        if (finger) {
            finger.scale.y = 1 - gripAmount * 0.3; // Curl finger slightly
        }
    }

    // Cleanup
    dispose() {
        if (this.rightHandFallback) {
            this.scene.remove(this.rightHandFallback);
            this.rightHandFallback.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }

        if (this.leftHandFallback) {
            this.scene.remove(this.leftHandFallback);
            this.leftHandFallback.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }

        if (this.hand0) this.scene.remove(this.hand0);
        if (this.hand1) this.scene.remove(this.hand1);
    }
}
