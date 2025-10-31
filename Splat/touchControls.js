import { VirtualJoystick } from './virtualJoystick.js';

/**
 * TouchControls - Simplified gesture-based mobile controls
 *
 * Features:
 * - Long press anywhere → activate virtual joystick at that position, then drag to move
 * - Single-finger drag → camera rotation (orbit/first-person)
 * - Paint mode: Single-finger drag → paint
 * - Jump/Jetpack button for vertical movement
 */
export class TouchControls {
    constructor(keysPressed, orbitControls) {
        this.keysPressed = keysPressed;
        this.orbitControls = orbitControls;

        // Virtual joystick
        this.joystick = new VirtualJoystick();

        // Touch tracking
        this.activeTouchId = null; // Track which touch is being processed
        this.touchStartTime = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchLastX = 0;
        this.touchLastY = 0;
        this.touchHasMoved = false;
        this.longPressThreshold = 400; // ms to hold before activating joystick
        this.movementThreshold = 10; // pixels moved before considering it a drag

        // Jetpack state
        this.jetpackActive = false;

        // OrbitControls state
        this.orbitControlsEnabled = true;

        // Camera mode
        this.cameraMode = 'third-person';
        this.firstPersonCallback = null;

        // Paint mode state
        this.isPaintMode = false;
        this.paintCallback = null;
        this.paintEndCallback = null;

        // Bind event handlers
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);

        // Add event listeners
        this.setupEventListeners();

        // Update loop for syncing joystick to keysPressed and checking long press
        this.startUpdateLoop();
    }

    /**
     * Set up touch event listeners
     */
    setupEventListeners() {
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
        // Check if touch is on a UI element (button, select, input, etc.)
        const target = event.target;
        if (target && (
            target.tagName === 'BUTTON' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'INPUT' ||
            target.tagName === 'A' ||
            target.closest('button') ||
            target.closest('select') ||
            target.closest('input')
        )) {
            // Allow default behavior for UI elements
            return;
        }

        const touch = event.changedTouches[0];
        const currentTime = Date.now();

        // If we already have an active touch or joystick is active, ignore new touches
        if (this.activeTouchId !== null || this.joystick.isActive()) {
            return;
        }

        // Store touch info for long-press detection and drag
        this.activeTouchId = touch.identifier;
        this.touchStartTime = currentTime;
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchLastX = touch.clientX;
        this.touchLastY = touch.clientY;
        this.touchHasMoved = false;

        event.preventDefault();
    }

    /**
     * Handle touch move event
     */
    handleTouchMove(event) {
        // Find the touch we're tracking
        let currentTouch = null;
        for (let i = 0; i < event.changedTouches.length; i++) {
            if (event.changedTouches[i].identifier === this.activeTouchId) {
                currentTouch = event.changedTouches[i];
                break;
            }
        }

        if (!currentTouch) {
            return;
        }

        event.preventDefault();

        // If joystick is active, update it
        if (this.joystick.isActive()) {
            this.joystick.update(currentTouch.clientX, currentTouch.clientY);
            return;
        }

        // Check if touch has moved beyond threshold
        const deltaX = currentTouch.clientX - this.touchStartX;
        const deltaY = currentTouch.clientY - this.touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance > this.movementThreshold) {
            this.touchHasMoved = true;
        }

        // If moved, handle as camera rotation or painting
        if (this.touchHasMoved) {
            const moveDeltaX = currentTouch.clientX - this.touchLastX;
            const moveDeltaY = currentTouch.clientY - this.touchLastY;

            // Paint mode: Call paint callback
            if (this.isPaintMode && this.paintCallback) {
                this.paintCallback(currentTouch.clientX, currentTouch.clientY);
            } else {
                // Camera rotation
                this.handleCameraRotation(moveDeltaX, moveDeltaY);
            }
        }

        // Update last position
        this.touchLastX = currentTouch.clientX;
        this.touchLastY = currentTouch.clientY;
    }

    /**
     * Handle touch end event
     */
    handleTouchEnd(event) {
        // Check if our tracked touch ended
        for (let i = 0; i < event.changedTouches.length; i++) {
            if (event.changedTouches[i].identifier === this.activeTouchId) {
                // If joystick is active, deactivate it
                if (this.joystick.isActive()) {
                    this.deactivateJoystick();
                }

                // If in paint mode, notify end of painting (to disable brush)
                if (this.isPaintMode && this.paintEndCallback) {
                    this.paintEndCallback();
                }

                // Reset tracking
                this.activeTouchId = null;
                this.touchHasMoved = false;
                break;
            }
        }
    }

    /**
     * Handle camera rotation
     */
    handleCameraRotation(deltaX, deltaY) {
        const rotateSpeed = 0.005;

        if (this.cameraMode === 'first-person') {
            // First-person: Use callback
            if (this.firstPersonCallback) {
                this.firstPersonCallback(deltaX, deltaY);
            }
        } else {
            // Third-person: Use OrbitControls
            if (this.orbitControls) {
                this.orbitControls.rotateLeft(deltaX * rotateSpeed);
                this.orbitControls.rotateUp(-deltaY * rotateSpeed);
                this.orbitControls.update();
            }
        }
    }

    /**
     * Activate virtual joystick at touch position
     */
    activateJoystick(x, y) {
        this.joystick.show(x, y);

        // Disable OrbitControls during joystick use
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
     * Activate jetpack mode
     */
    activateJetpack() {
        this.jetpackActive = true;
        this.keysPressed[' '] = true;
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
     * Update loop to sync joystick state and check for long press
     */
    startUpdateLoop() {
        const update = () => {
            // Sync joystick to keysPressed
            if (this.joystick.isActive()) {
                const keys = this.joystick.getKeys();
                this.keysPressed['w'] = keys.w;
                this.keysPressed['a'] = keys.a;
                this.keysPressed['s'] = keys.s;
                this.keysPressed['d'] = keys.d;
            }

            // Check for long press to activate joystick
            if (this.activeTouchId !== null && !this.joystick.isActive() && !this.touchHasMoved) {
                const currentTime = Date.now();
                const pressDuration = currentTime - this.touchStartTime;

                if (pressDuration >= this.longPressThreshold) {
                    // Activate joystick at touch position
                    this.activateJoystick(this.touchStartX, this.touchStartY);
                }
            }

            requestAnimationFrame(update);
        };

        update();
    }

    /**
     * Set camera mode
     */
    setCameraMode(mode) {
        this.cameraMode = mode;
        console.log(`TouchControls: Camera mode set to ${mode}`);
    }

    /**
     * Set callback for first-person camera rotation
     */
    setFirstPersonCallback(callback) {
        this.firstPersonCallback = callback;
    }

    /**
     * Set paint mode on/off
     */
    setPaintMode(enabled) {
        this.isPaintMode = enabled;

        // Disable OrbitControls during paint mode to prevent camera rotation
        if (this.orbitControls) {
            if (enabled) {
                this.orbitControlsEnabled = this.orbitControls.enabled;
                this.orbitControls.enabled = false;
            } else {
                this.orbitControls.enabled = this.orbitControlsEnabled;
            }
        }

        console.log(`TouchControls: Paint mode ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Set callback for painting
     */
    setPaintCallback(callback) {
        this.paintCallback = callback;
    }

    /**
     * Set callback for end of painting
     */
    setPaintEndCallback(callback) {
        this.paintEndCallback = callback;
    }

    /**
     * Prevent iOS context menu
     */
    handleContextMenu(event) {
        event.preventDefault();
        return false;
    }

    /**
     * Disable touch controls
     */
    disable() {
        document.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
        document.removeEventListener('touchcancel', this.handleTouchEnd);
        document.removeEventListener('contextmenu', this.handleContextMenu);

        // Deactivate joystick if active
        if (this.joystick.isActive()) {
            this.deactivateJoystick();
        }

        console.log('Touch controls disabled');
    }
}
