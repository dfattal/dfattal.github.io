import { VirtualJoystick } from './virtualJoystick.js';

/**
 * TouchControls - Gesture-based mobile controls
 *
 * Features:
 * - Single-finger drag on left side → activate virtual joystick
 * - Two-finger drag anywhere → camera rotation
 * - Double tap → jump
 * - Double tap + hold → jetpack mode with joystick control
 * - Integrates with existing keysPressed system
 */
export class TouchControls {
    constructor(keysPressed, orbitControls) {
        this.keysPressed = keysPressed;
        this.orbitControls = orbitControls;

        // Virtual joystick
        this.joystick = new VirtualJoystick();

        // Touch tracking
        this.activeTouchId = null; // Track which touch is controlling joystick
        this.jetpackActive = false;

        // OrbitControls state
        this.orbitControlsEnabled = true;

        // First-person camera mode
        this.cameraMode = 'third-person'; // 'third-person' or 'first-person'
        this.firstPersonLookTouchId = null; // Track touch controlling first-person look
        this.firstPersonLookStartX = 0;
        this.firstPersonLookStartY = 0;
        this.firstPersonCallback = null; // Callback to update camera rotation

        // Two-finger camera rotation
        this.twoFingerRotation = false; // Track if two-finger gesture is active
        this.twoFingerTouchIds = []; // Array of touch IDs for two-finger gesture
        this.twoFingerStartX = 0;
        this.twoFingerStartY = 0;

        // Right-side jump/jetpack state
        this.rightSideTouchId = null; // Track touch on right side for jump/jetpack
        this.rightSideTouchStartTime = 0; // Time when right-side touch started
        this.rightSideTouchStartX = 0;
        this.rightSideTouchStartY = 0;
        this.rightSideHasMoved = false; // Track if right-side touch has moved (for camera rotation vs jump)
        this.jetpackHoldThreshold = 200; // ms to hold before activating jetpack

        // Paint mode state
        this.isPaintMode = false; // Track if paint mode is active
        this.paintCallback = null; // Callback to handle painting

        // Bind event handlers
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);

        // Add event listeners
        this.setupEventListeners();

        // Update loop for syncing joystick to keysPressed
        this.startUpdateLoop();
    }

    /**
     * Set up touch event listeners
     */
    setupEventListeners() {
        // Use passive:false to allow preventDefault() calls
        document.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        document.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });

        // Prevent iOS context menu (long-press lens/magnifier)
        document.addEventListener('contextmenu', this.handleContextMenu, { passive: false });
    }

    /**
     * Handle touch start event
     */
    handleTouchStart(event) {
        const currentTime = Date.now();
        const screenMidpoint = window.innerWidth / 2;

        // Check for two-finger touch (camera rotation)
        if (event.touches.length === 2) {
            event.preventDefault();

            // Deactivate joystick if it was active
            if (this.joystick.isActive()) {
                this.deactivateJoystick();
            }

            // Activate two-finger rotation mode
            this.twoFingerRotation = true;
            this.twoFingerTouchIds = [event.touches[0].identifier, event.touches[1].identifier];

            // Calculate center point of two fingers
            const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
            const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
            this.twoFingerStartX = centerX;
            this.twoFingerStartY = centerY;

            console.log('Two-finger camera rotation started');
            return;
        }

        // If already in two-finger mode, ignore new single touches
        if (this.twoFingerRotation) {
            return;
        }

        // Process all changed touches to support simultaneous left/right starts
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];

            // RIGHT SIDE: Jump/Jetpack, Camera rotation, or Paint
            // Allow right-side touches even when joystick is active (simultaneous control)
            if (touch.clientX > screenMidpoint) {
                event.preventDefault();

                // Paint mode: Start painting with single-finger drag
                if (this.isPaintMode) {
                    this.rightSideTouchId = touch.identifier;
                    this.rightSideTouchStartX = touch.clientX;
                    this.rightSideTouchStartY = touch.clientY;
                    this.rightSideHasMoved = false;
                    console.log('Paint mode: touch started (right side)');
                    continue; // Process next touch
                }

                // Normal mode: Jump/Jetpack or Camera rotation
                if (!this.rightSideTouchId && !this.firstPersonLookTouchId) {
                    this.rightSideTouchId = touch.identifier;
                    this.rightSideTouchStartTime = currentTime;
                    this.rightSideTouchStartX = touch.clientX;
                    this.rightSideTouchStartY = touch.clientY;
                    this.rightSideHasMoved = false;
                    console.log('Right-side touch started (jump/jetpack/camera detection)');
                }
                continue; // Process next touch
            }

            // LEFT SIDE: Joystick for movement
            // Allow joystick in all modes (including jetpack) for simultaneous control
            if (touch.clientX <= screenMidpoint) {
                // Only activate joystick if not already active
                if (!this.joystick.isActive()) {
                    event.preventDefault();
                    const touchId = touch.identifier;
                    const touchX = touch.clientX;
                    const touchY = touch.clientY;

                    // Activate joystick immediately (no long-press delay)
                    this.activateJoystick(touchId, touchX, touchY);
                    console.log('Single-finger joystick activated (left side)');
                }
                continue; // Process next touch
            }
        }
    }

    /**
     * Handle touch move event
     */
    handleTouchMove(event) {
        // Handle two-finger camera rotation (exclusive mode)
        if (this.twoFingerRotation && event.touches.length === 2) {
            event.preventDefault();

            // Calculate center point of two fingers
            const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
            const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

            // Calculate delta from last position
            const deltaX = centerX - this.twoFingerStartX;
            const deltaY = centerY - this.twoFingerStartY;

            // Update start position for next delta
            this.twoFingerStartX = centerX;
            this.twoFingerStartY = centerY;

            // Apply rotation based on camera mode
            if (this.cameraMode === 'first-person') {
                // First-person: Use existing callback
                if (this.firstPersonCallback) {
                    this.firstPersonCallback(deltaX, deltaY);
                }
            } else {
                // Third-person: Use OrbitControls
                if (this.orbitControls) {
                    // Sensitivity for two-finger rotation
                    const rotateSpeed = 0.005;

                    // Update OrbitControls spherical coordinates
                    // Horizontal movement affects azimuthal angle (horizontal rotation)
                    // Vertical movement affects polar angle (vertical rotation)
                    this.orbitControls.rotateLeft(deltaX * rotateSpeed);
                    this.orbitControls.rotateUp(-deltaY * rotateSpeed);
                    this.orbitControls.update();
                }
            }

            return;
        }

        // Process all changed touches to support simultaneous left/right actions
        let handledAnyTouch = false;

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touchItem = event.changedTouches[i];

            // Handle joystick touch (left side)
            if (this.joystick.isActive() && this.activeTouchId === touchItem.identifier) {
                event.preventDefault();
                this.joystick.update(touchItem.clientX, touchItem.clientY);
                handledAnyTouch = true;
                // Don't return - continue processing other touches
            }

            // Handle right-side touch (camera rotation, painting, jetpack)
            if (touchItem.identifier === this.rightSideTouchId) {
                event.preventDefault();

                // Calculate delta from last position
                const deltaX = touchItem.clientX - this.rightSideTouchStartX;
                const deltaY = touchItem.clientY - this.rightSideTouchStartY;

                // Detect if touch has moved (threshold: 5 pixels)
                if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                    this.rightSideHasMoved = true;
                }

                // Update start position for next delta
                this.rightSideTouchStartX = touchItem.clientX;
                this.rightSideTouchStartY = touchItem.clientY;

                // Paint mode: Call paint callback with touch position
                if (this.isPaintMode && this.paintCallback) {
                    this.paintCallback(touchItem.clientX, touchItem.clientY);
                    handledAnyTouch = true;
                    // Don't return - continue processing other touches
                    continue;
                }

                // Camera rotation mode: Works in all camera modes and during jetpack
                if (this.rightSideHasMoved) {
                    if (this.cameraMode === 'first-person') {
                        // First-person: Use callback for camera rotation
                        if (this.firstPersonCallback) {
                            this.firstPersonCallback(deltaX, deltaY);
                        }
                    } else {
                        // Third-person: Use OrbitControls rotate methods (work even when OrbitControls is disabled)
                        if (this.orbitControls) {
                            const rotateSpeed = 0.005;
                            this.orbitControls.rotateLeft(deltaX * rotateSpeed);
                            this.orbitControls.rotateUp(-deltaY * rotateSpeed);
                            this.orbitControls.update();
                        }
                    }
                }

                handledAnyTouch = true;
                // Don't return - continue processing other touches
            }
        }

        // Allow event to propagate to OrbitControls if no touch handled
    }

    /**
     * Handle touch end event
     */
    handleTouchEnd(event) {
        const currentTime = Date.now();

        // Check if two-finger mode should end
        if (this.twoFingerRotation) {
            // Check if any of the two-finger touches ended
            for (let i = 0; i < event.changedTouches.length; i++) {
                const touch = event.changedTouches[i];
                if (this.twoFingerTouchIds.includes(touch.identifier)) {
                    // One of the two fingers lifted - end two-finger mode
                    this.twoFingerRotation = false;
                    this.twoFingerTouchIds = [];
                    console.log('Two-finger camera rotation ended');
                    return;
                }
            }
        }

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];

            // Check if right-side touch ended
            if (this.rightSideTouchId === touch.identifier) {
                const touchDuration = currentTime - this.rightSideTouchStartTime;

                // Paint mode: End painting
                if (this.isPaintMode) {
                    this.rightSideTouchId = null;
                    console.log('Paint mode: touch ended');
                    return;
                }

                // Jetpack active: Deactivate jetpack
                if (this.jetpackActive) {
                    this.deactivateJetpack();
                    this.rightSideTouchId = null;
                    console.log('Jetpack deactivated (touch ended)');
                    return;
                }

                // Touch was quick tap without movement: Trigger jump
                if (!this.rightSideHasMoved && touchDuration < this.jetpackHoldThreshold) {
                    this.keysPressed[' '] = true;
                    setTimeout(() => {
                        this.keysPressed[' '] = false;
                    }, 50);
                    console.log('Jump triggered (quick tap)');
                }

                // Reset right-side state
                this.rightSideTouchId = null;
                this.rightSideHasMoved = false;
                console.log('Right-side touch ended');
                return;
            }

            // Check if joystick touch ended
            if (this.activeTouchId === touch.identifier) {
                this.deactivateJoystick();
                console.log('Joystick touch ended');
                return;
            }
        }

        // If joystick is not active, allow event to propagate to OrbitControls
        if (!this.joystick.isActive()) {
            // Don't prevent default - let OrbitControls handle the touch end
        }
    }

    /**
     * Activate virtual joystick at touch position
     */
    activateJoystick(touchId, x, y) {
        this.activeTouchId = touchId;
        this.joystick.show(x, y);

        // Disable OrbitControls to prevent camera rotation during movement
        if (this.orbitControls) {
            this.orbitControlsEnabled = this.orbitControls.enabled;
            this.orbitControls.enabled = false;
        }

        console.log('Virtual joystick activated');
    }

    /**
     * Deactivate virtual joystick
     */
    deactivateJoystick() {
        this.activeTouchId = null;
        this.joystick.hide();

        // Clear all movement keys
        this.keysPressed['w'] = false;
        this.keysPressed['a'] = false;
        this.keysPressed['s'] = false;
        this.keysPressed['d'] = false;

        // Re-enable OrbitControls
        if (this.orbitControls && this.orbitControlsEnabled) {
            this.orbitControls.enabled = true;
        }

        console.log('Virtual joystick deactivated');
    }

    /**
     * Activate jetpack mode (no joystick - user can use left-side joystick separately)
     */
    activateJetpack() {
        this.jetpackActive = true;
        this.keysPressed[' '] = true; // Hold space for jetpack

        console.log('Jetpack mode activated');
    }

    /**
     * Deactivate jetpack mode
     */
    deactivateJetpack() {
        this.jetpackActive = false;
        this.keysPressed[' '] = false;

        console.log('Jetpack mode deactivated');
    }

    /**
     * Update loop to sync joystick state to keysPressed and check for jetpack activation
     */
    startUpdateLoop() {
        const update = () => {
            // Sync joystick to keysPressed
            if (this.joystick.isActive()) {
                const keys = this.joystick.getKeys();

                // Update keysPressed object
                this.keysPressed['w'] = keys.w;
                this.keysPressed['a'] = keys.a;
                this.keysPressed['s'] = keys.s;
                this.keysPressed['d'] = keys.d;
            }

            // Check for jetpack activation (right-side touch held without movement)
            if (this.rightSideTouchId !== null && !this.jetpackActive && !this.isPaintMode) {
                const currentTime = Date.now();
                const touchDuration = currentTime - this.rightSideTouchStartTime;

                // Activate jetpack if touch held for threshold duration without movement
                if (touchDuration >= this.jetpackHoldThreshold && !this.rightSideHasMoved) {
                    this.activateJetpack();
                }
            }

            requestAnimationFrame(update);
        };

        update();
    }

    /**
     * Set camera mode for first-person touch controls
     * @param {string} mode - 'third-person' or 'first-person'
     */
    setCameraMode(mode) {
        this.cameraMode = mode;
        console.log(`TouchControls: Camera mode set to ${mode}`);
    }

    /**
     * Set callback for first-person camera rotation updates
     * @param {function} callback - Function(deltaX, deltaY) to update camera rotation
     */
    setFirstPersonCallback(callback) {
        this.firstPersonCallback = callback;
    }

    /**
     * Set paint mode on/off
     * @param {boolean} enabled - Enable or disable paint mode
     */
    setPaintMode(enabled) {
        this.isPaintMode = enabled;
        console.log(`TouchControls: Paint mode ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Set callback for painting
     * @param {function} callback - Function(x, y) called with touch coordinates during painting
     */
    setPaintCallback(callback) {
        this.paintCallback = callback;
    }

    /**
     * Prevent iOS context menu (lens/magnifier)
     */
    handleContextMenu(event) {
        event.preventDefault();
        return false;
    }

    /**
     * Disable touch controls
     */
    disable() {
        // Deactivate any active gestures
        if (this.joystick.isActive()) {
            this.deactivateJoystick();
        }
        if (this.jetpackActive) {
            this.deactivateJetpack();
        }
        if (this.twoFingerRotation) {
            this.twoFingerRotation = false;
            this.twoFingerTouchIds = [];
        }
        if (this.firstPersonLookTouchId !== null) {
            this.firstPersonLookTouchId = null;
        }

        // Remove event listeners
        document.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
        document.removeEventListener('touchcancel', this.handleTouchEnd);

        console.log('TouchControls disabled');
    }

    /**
     * Enable touch controls
     */
    enable() {
        // Re-add event listeners
        document.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        document.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });

        console.log('TouchControls enabled');
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        document.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
        document.removeEventListener('touchcancel', this.handleTouchEnd);
        document.removeEventListener('contextmenu', this.handleContextMenu);
    }
}
