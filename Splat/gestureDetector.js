/**
 * GestureDetector - Hand gesture recognition for Apple Vision Pro
 *
 * Implements proven gesture detection patterns from LDIPlayer
 * Detects: pinch, tap, double-tap, hold, drag, pointing, palm orientation
 */

import * as THREE from 'three';

// Proven constants from LDIPlayer
const PINCH_DISTANCE_THRESHOLD = 0.015; // 15mm - fingers must be touching
const TAP_DURATION_MAX = 300; // milliseconds - quick pinch <300ms = tap
const DOUBLE_TAP_WINDOW = 500; // milliseconds between taps for double-tap
const DRAG_MOVEMENT_THRESHOLD = 0.003; // 3mm minimum movement to register as drag

// Movement gesture constants
const HAND_EXTENSION_MIN = 0.3; // 30cm minimum hand extension to activate movement
const HAND_EXTENSION_MAX = 0.6; // 60cm for max speed
const JETPACK_HOLD_DURATION = 600; // 600ms hold to activate jetpack (simplified approach)

// Gesture modes
export const GestureMode = {
    IDLE: 'idle',
    PAINTING: 'painting',
    MOVING: 'moving',
    JETPACK: 'jetpack',
    MOVING_JETPACK: 'moving_jetpack',
    TELEPORTING: 'teleporting' // LEFT hand only
};

export class GestureDetector {
    constructor(xrHands, xrManager, wristPalette = null) {
        this.xrHands = xrHands;
        this.xrManager = xrManager;
        this.wristPalette = wristPalette; // Reference to WristPalette for toggle button checking

        // Current gesture mode
        this.mode = GestureMode.IDLE;

        // Active painter hand ('left', 'right', or null)
        this.activePainterHand = null;

        // Paint mode enabled flag (controlled by wrist palette toggle)
        this.paintModeEnabled = false;

        // Teleport tracking (LEFT hand only)
        this.isTeleporting = false;

        // Gesture callbacks
        this.callbacks = {
            onPaintStart: null,      // (handedness, rayOrigin, rayDirection)
            onPaintDrag: null,       // (handedness, rayOrigin, rayDirection)
            onPaintEnd: null,        // (handedness)
            onMovementStart: null,   // (direction, speed)
            onMovementUpdate: null,  // (direction, speed)
            onMovementEnd: null,     // ()
            onJetpackStart: null,    // (handedness)
            onJetpackEnd: null,      // (handedness)
            onColorSelect: null,     // (rayOrigin, rayDirection)
            onTeleportStart: null,   // (rayOrigin, rayDirection) - LEFT hand only
            onTeleportUpdate: null,  // (rayOrigin, rayDirection) - Update ray during sustained pinch
            onTeleportEnd: null,     // (rayOrigin, rayDirection) - Execute teleport on release
            onTogglePaintMode: null  // (enabled)
        };

        // Selected color index (0-11 for palette)
        this.selectedColorIndex = 6; // Default to purple

        console.log('GestureDetector initialized with proven LDIPlayer patterns');
    }

    /**
     * Set reference to WristPalette (call after both are created)
     */
    setWristPalette(wristPalette) {
        this.wristPalette = wristPalette;
    }

    /**
     * Update gesture detection (call every frame)
     * @param {XRSession} session - The XR session
     * @param {THREE.Vector3} cameraPosition - Current camera/head position
     */
    update(session, cameraPosition) {
        if (!session) return;

        // Process each hand
        for (const source of session.inputSources) {
            if (source.hand) {
                const hand = source.hand;
                const handedness = source.handedness; // 'left' or 'right'

                if (handedness !== 'left' && handedness !== 'right') continue;

                // Update gesture detection for this hand
                this.updateHandGestures(hand, handedness, cameraPosition);
            }
        }

        // Update mode-specific logic
        this.updateMode(cameraPosition);
    }

    /**
     * Update gestures for a specific hand (proven LDIPlayer pattern)
     */
    updateHandGestures(hand, handedness, cameraPosition) {
        const state = this.xrHands.handInputState[handedness];
        const distance = this.xrHands.getPinchDistance(hand);

        if (distance === null) return;

        const now = performance.now();

        // === PINCH DETECTION (proven pattern) ===
        if (distance < PINCH_DISTANCE_THRESHOLD) {
            if (!state.isPinching) {
                // Pinch start
                state.isPinching = true;
                state.pinchStartTime = now;

                const indexTip = this.xrHands.getJointPosition(hand, 'index-finger-tip');
                if (indexTip) {
                    state.dragStartPosition = { x: indexTip.x, y: indexTip.y, z: indexTip.z };
                }

                this.onPinchStart(hand, handedness, cameraPosition);
            } else {
                // Pinch sustaining - check for drag
                this.onPinchSustain(hand, handedness, state, cameraPosition);
            }
        } else {
            if (state.isPinching) {
                // Pinch released
                const duration = now - state.pinchStartTime;
                this.onPinchRelease(hand, handedness, state, duration, now);

                state.isPinching = false;
                state.dragStartPosition = null;
            }
        }
    }

    /**
     * Handle pinch start
     */
    onPinchStart(hand, handedness, cameraPosition) {
        console.log(`${handedness} pinch start`);

        // Check mode to determine action
        if (this.mode === GestureMode.IDLE) {
            // Could be start of painting or jetpack or color selection
            // Wait to see if it's a drag, tap, or hold
        }
    }

    /**
     * Handle pinch sustain (check for drag)
     */
    onPinchSustain(hand, handedness, state, cameraPosition) {
        const indexTip = this.xrHands.getJointPosition(hand, 'index-finger-tip');
        if (!indexTip || !state.dragStartPosition) return;

        // Calculate drag distance
        const dx = indexTip.x - state.dragStartPosition.x;
        const dy = indexTip.y - state.dragStartPosition.y;
        const dz = indexTip.z - state.dragStartPosition.z;
        const dragDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // LEFT hand: Teleportation (only when paint mode OFF)
        if (handedness === 'left' && !this.paintModeEnabled) {
            const wrist = this.xrHands.getJointPosition(hand, 'wrist');
            if (wrist && indexTip) {
                const rayOrigin = wrist.clone();
                const rayDirection = new THREE.Vector3().subVectors(indexTip, wrist).normalize();

                if (!this.isTeleporting) {
                    // Start teleportation
                    this.isTeleporting = true;
                    this.mode = GestureMode.TELEPORTING;
                    console.log('LEFT hand teleportation started');

                    if (this.callbacks.onTeleportStart) {
                        this.callbacks.onTeleportStart(rayOrigin, rayDirection);
                    }
                } else {
                    // Update teleport ray
                    if (this.callbacks.onTeleportUpdate) {
                        this.callbacks.onTeleportUpdate(rayOrigin, rayDirection);
                    }
                }
            }
            return; // Don't process painting for left hand during teleportation
        }

        // Check if drag threshold exceeded for painting (either hand when paint mode ON)
        if (dragDistance > DRAG_MOVEMENT_THRESHOLD) {
            // Dragging detected
            if (this.mode === GestureMode.IDLE && this.paintModeEnabled) {
                // Only start painting if paint mode is enabled
                if (this.activePainterHand === null) {
                    this.startPainting(hand, handedness);
                }
            }

            if (this.mode === GestureMode.PAINTING && this.activePainterHand === handedness) {
                // Continue painting
                this.updatePainting(hand, handedness);
            }
        }
    }

    /**
     * Handle pinch release
     */
    onPinchRelease(hand, handedness, state, duration, now) {
        console.log(`${handedness} pinch release (duration: ${duration}ms)`);

        // LEFT hand: Execute teleportation if in teleport mode
        if (handedness === 'left' && this.isTeleporting) {
            const wrist = this.xrHands.getJointPosition(hand, 'wrist');
            const indexTip = this.xrHands.getJointPosition(hand, 'index-finger-tip');

            if (wrist && indexTip) {
                const rayOrigin = wrist.clone();
                const rayDirection = new THREE.Vector3().subVectors(indexTip, wrist).normalize();

                console.log('LEFT hand teleportation executed');
                if (this.callbacks.onTeleportEnd) {
                    this.callbacks.onTeleportEnd(rayOrigin, rayDirection);
                }
            }

            // Reset teleport state
            this.isTeleporting = false;
            this.mode = GestureMode.IDLE;
            return;
        }

        if (duration < TAP_DURATION_MAX) {
            // It's a TAP
            const timeSinceLastTap = now - state.lastTapTime;

            if (timeSinceLastTap < DOUBLE_TAP_WINDOW) {
                // DOUBLE TAP detected
                state.tapCount++;
                console.log(`${handedness} double-tap detected (count: ${state.tapCount})`);

                // Double-tap actions
                this.onDoubleTap(handedness);
            } else {
                // FIRST TAP
                state.tapCount = 1;
                console.log(`${handedness} tap 1/2`);

                // Single tap actions (color selection if pointing at palette)
                this.onSingleTap(hand, handedness);
            }

            state.lastTapTime = now;
        } else {
            // It was a HOLD or DRAG
            console.log(`${handedness} hold/drag end (duration: ${duration}ms)`);

            // End painting if this was the active painter
            if (this.mode === GestureMode.PAINTING && this.activePainterHand === handedness) {
                this.endPainting(handedness);
            }

            // End jetpack if this hand was holding it (RIGHT hand only)
            if (this.mode === GestureMode.JETPACK && handedness === 'right') {
                this.endJetpack(handedness);
            }
        }
    }

    /**
     * Handle single tap
     */
    onSingleTap(hand, handedness) {
        // Get ray direction for checking what we're pointing at
        const wrist = this.xrHands.getJointPosition(hand, 'wrist');
        const indexTip = this.xrHands.getJointPosition(hand, 'index-finger-tip');

        if (!wrist || !indexTip) return;

        const rayOrigin = wrist.clone();
        const rayDirection = new THREE.Vector3().subVectors(indexTip, wrist).normalize();

        // Priority 1: Check if pointing at toggle button (either hand)
        if (this.wristPalette && this.wristPalette.checkToggleButtonHover(rayOrigin, rayDirection)) {
            // Toggle paint mode
            const newState = this.wristPalette.togglePaintMode();
            this.paintModeEnabled = newState;

            // Notify callback
            if (this.callbacks.onTogglePaintMode) {
                this.callbacks.onTogglePaintMode(newState);
            }

            console.log(`Paint mode toggled via wrist button: ${newState ? 'ON' : 'OFF'}`);
            return; // Don't process other tap actions
        }

        // Priority 2: Check if pointing at color palette (paint mode enabled)
        if (this.paintModeEnabled && this.callbacks.onColorSelect) {
            this.callbacks.onColorSelect(rayOrigin, rayDirection);
            return;
        }

        // Quick taps don't trigger teleportation - teleportation requires sustained LEFT hand pinch
    }

    /**
     * Handle double tap
     */
    onDoubleTap(handedness) {
        // Left hand double-tap: Could exit VR or reset view
        // Right hand double-tap: Could toggle paint mode
        console.log(`${handedness} double-tap action`);
    }

    /**
     * Start painting gesture
     */
    startPainting(hand, handedness) {
        this.mode = GestureMode.PAINTING;
        this.activePainterHand = handedness;

        // Get ray for painting
        const wrist = this.xrHands.getJointPosition(hand, 'wrist');
        const indexTip = this.xrHands.getJointPosition(hand, 'index-finger-tip');

        if (wrist && indexTip) {
            const rayOrigin = wrist.clone();
            const rayDirection = new THREE.Vector3().subVectors(indexTip, wrist).normalize();

            console.log(`Painting started with ${handedness} hand`);
            if (this.callbacks.onPaintStart) {
                this.callbacks.onPaintStart(handedness, rayOrigin, rayDirection);
            }
        }
    }

    /**
     * Update painting gesture
     */
    updatePainting(hand, handedness) {
        // Get ray for painting
        const wrist = this.xrHands.getJointPosition(hand, 'wrist');
        const indexTip = this.xrHands.getJointPosition(hand, 'index-finger-tip');

        if (wrist && indexTip) {
            const rayOrigin = wrist.clone();
            const rayDirection = new THREE.Vector3().subVectors(indexTip, wrist).normalize();

            if (this.callbacks.onPaintDrag) {
                this.callbacks.onPaintDrag(handedness, rayOrigin, rayDirection);
            }
        }
    }

    /**
     * End painting gesture
     */
    endPainting(handedness) {
        console.log(`Painting ended with ${handedness} hand`);

        this.mode = GestureMode.IDLE;
        this.activePainterHand = null;

        if (this.callbacks.onPaintEnd) {
            this.callbacks.onPaintEnd(handedness);
        }
    }

    /**
     * Start jetpack gesture
     */
    startJetpack(handedness) {
        if (this.mode === GestureMode.MOVING) {
            this.mode = GestureMode.MOVING_JETPACK;
        } else {
            this.mode = GestureMode.JETPACK;
        }

        console.log(`Jetpack started with ${handedness} hand`);
        if (this.callbacks.onJetpackStart) {
            this.callbacks.onJetpackStart(handedness);
        }
    }

    /**
     * End jetpack gesture
     */
    endJetpack(handedness) {
        console.log(`Jetpack ended with ${handedness} hand`);

        if (this.mode === GestureMode.MOVING_JETPACK) {
            this.mode = GestureMode.MOVING;
        } else {
            this.mode = GestureMode.IDLE;
        }

        if (this.callbacks.onJetpackEnd) {
            this.callbacks.onJetpackEnd(handedness);
        }
    }

    /**
     * Update mode-specific logic
     */
    updateMode(cameraPosition) {
        // Check for left hand pointing gesture (movement)
        if (this.mode !== GestureMode.PAINTING) {
            this.checkMovementGesture(cameraPosition);
        }

        // Check for right hand hold gesture (jetpack)
        if (this.mode !== GestureMode.PAINTING) {
            this.checkJetpackGesture();
        }
    }

    /**
     * Check for left hand pointing gesture (movement)
     */
    checkMovementGesture(cameraPosition) {
        const session = this.xrManager.renderer.xr.getSession();
        if (!session) {
            console.log('[Movement] No XR session');
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
            console.log('[Movement] No left hand found');
            return;
        }

        // Get hand position and pointing direction
        const wrist = this.xrHands.getJointPosition(leftHand, 'wrist');
        const indexTip = this.xrHands.getJointPosition(leftHand, 'index-finger-tip');

        if (!wrist || !indexTip || !cameraPosition) {
            console.log('[Movement] Missing joint positions - wrist:', !!wrist, 'indexTip:', !!indexTip, 'camera:', !!cameraPosition);
            return;
        }

        // Calculate hand extension from head
        const extensionDistance = wrist.distanceTo(cameraPosition);
        console.log(`[Movement] Extension distance: ${extensionDistance.toFixed(3)}m (min: ${HAND_EXTENSION_MIN}m)`);

        if (extensionDistance >= HAND_EXTENSION_MIN) {
            // Hand is extended enough - calculate movement
            const pointingDirection = new THREE.Vector3()
                .subVectors(indexTip, wrist)
                .normalize();

            // Project onto XZ plane (horizontal movement)
            pointingDirection.y = 0;
            pointingDirection.normalize();

            // Calculate speed based on extension (linear mapping)
            const extensionNormalized = Math.min(
                (extensionDistance - HAND_EXTENSION_MIN) / (HAND_EXTENSION_MAX - HAND_EXTENSION_MIN),
                1.0
            );

            console.log(`[Movement] Hand extended! Speed: ${extensionNormalized.toFixed(2)}, Mode: ${this.mode}`);

            if (this.mode === GestureMode.IDLE || this.mode === GestureMode.JETPACK) {
                // Start movement
                const newMode = this.mode === GestureMode.JETPACK
                    ? GestureMode.MOVING_JETPACK
                    : GestureMode.MOVING;
                this.mode = newMode;

                console.log(`[Movement] Started - New mode: ${newMode}`);
                if (this.callbacks.onMovementStart) {
                    this.callbacks.onMovementStart(pointingDirection, extensionNormalized);
                }
            } else if (this.mode === GestureMode.MOVING || this.mode === GestureMode.MOVING_JETPACK) {
                // Update movement
                if (this.callbacks.onMovementUpdate) {
                    this.callbacks.onMovementUpdate(pointingDirection, extensionNormalized);
                }
            }
        } else {
            // Hand dropped below threshold
            console.log('[Movement] Hand not extended enough');

            if (this.mode === GestureMode.MOVING) {
                this.mode = GestureMode.IDLE;
                console.log('[Movement] Ended - Mode: IDLE');
                if (this.callbacks.onMovementEnd) {
                    this.callbacks.onMovementEnd();
                }
            } else if (this.mode === GestureMode.MOVING_JETPACK) {
                this.mode = GestureMode.JETPACK;
                console.log('[Movement] Ended - Mode: JETPACK');
                if (this.callbacks.onMovementEnd) {
                    this.callbacks.onMovementEnd();
                }
            }
        }
    }

    /**
     * Check for right hand hold gesture (jetpack)
     * RIGHT hand only - does not conflict with LEFT hand teleportation
     */
    checkJetpackGesture() {
        const state = this.xrHands.handInputState.right;
        const now = performance.now();

        // Don't activate jetpack during teleportation or painting
        if (this.mode === GestureMode.TELEPORTING || this.mode === GestureMode.PAINTING) {
            return;
        }

        // Check if right hand is pinching and has been for >600ms
        if (state.isPinching) {
            const holdDuration = now - state.pinchStartTime;

            if (holdDuration >= JETPACK_HOLD_DURATION) {
                // Jetpack should be active
                if (this.mode !== GestureMode.JETPACK && this.mode !== GestureMode.MOVING_JETPACK) {
                    console.log(`RIGHT hand jetpack activated (hold duration: ${holdDuration}ms)`);
                    this.startJetpack('right');
                }
            }
        }
    }

    /**
     * Check if left palm is facing user (for color palette visibility)
     */
    isLeftPalmFacingUser(cameraPosition) {
        const session = this.xrManager.renderer.xr.getSession();
        if (!session) return false;

        // Find left hand
        let leftHand = null;
        for (const source of session.inputSources) {
            if (source.hand && source.handedness === 'left') {
                leftHand = source.hand;
                break;
            }
        }

        if (!leftHand) return false;

        const palmNormal = this.xrHands.getPalmNormal(leftHand);
        const wrist = this.xrHands.getJointPosition(leftHand, 'wrist');

        if (!palmNormal || !wrist || !cameraPosition) return false;

        // Calculate direction from wrist to camera
        const toCamera = new THREE.Vector3().subVectors(cameraPosition, wrist).normalize();

        // Dot product: if palm normal points toward camera, dot > 0
        const dot = palmNormal.dot(toCamera);

        return dot > 0.5; // Threshold: palm must be reasonably facing user
    }

    /**
     * Reset all gesture states
     */
    reset() {
        this.mode = GestureMode.IDLE;
        this.activePainterHand = null;
        this.xrHands.resetAllGestureStates();
        console.log('GestureDetector reset');
    }

    /**
     * Set callback for gesture events
     */
    on(event, callback) {
        if (this.callbacks.hasOwnProperty('on' + event.charAt(0).toUpperCase() + event.slice(1))) {
            this.callbacks['on' + event.charAt(0).toUpperCase() + event.slice(1)] = callback;
        }
    }
}
