import { VirtualJoystick } from './virtualJoystick.js';

/**
 * TouchControls - Gesture-based mobile controls
 *
 * Features:
 * - Long press (300ms) → activate virtual joystick
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
        this.touchStartTime = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.longPressTimer = null;
        this.longPressThreshold = 300; // ms to trigger joystick
        this.movementThreshold = 15; // pixels - movement beyond this cancels long press
        this.activeTouchId = null; // Track which touch is controlling joystick

        // Double-tap detection
        this.lastTapTime = 0;
        this.doubleTapThreshold = 300; // ms between taps
        this.jetpackActive = false;
        this.jetpackTouchId = null;

        // OrbitControls state
        this.orbitControlsEnabled = true;

        // Bind event handlers
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        // Add event listeners
        this.setupEventListeners();

        // Update loop for syncing joystick to keysPressed
        this.startUpdateLoop();
    }

    /**
     * Set up touch event listeners
     */
    setupEventListeners() {
        // Use passive:true initially to allow OrbitControls to work
        // We'll call preventDefault() selectively when needed
        document.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        document.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
    }

    /**
     * Handle touch start event
     */
    handleTouchStart(event) {
        const touch = event.changedTouches[0];
        const currentTime = Date.now();

        // If joystick is already active, don't process new touches
        // (stay in joystick mode)
        if (this.joystick.isActive()) {
            return;
        }

        // Don't prevent default if no joystick active - allow OrbitControls to work
        if (!this.joystick.isActive() && !this.jetpackActive) {
            // Allow event to propagate to OrbitControls
        }

        // Store initial touch position
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;

        // Check for double-tap
        if (currentTime - this.lastTapTime < this.doubleTapThreshold) {
            // Double-tap detected
            event.preventDefault(); // Prevent default for double-tap
            this.handleDoubleTap(touch);
            this.lastTapTime = 0; // Reset to avoid triple-tap
            return;
        }

        this.lastTapTime = currentTime;

        // Start long-press timer for joystick activation
        // Only if no joystick is currently active
        if (!this.joystick.isActive() && !this.jetpackActive) {
            this.touchStartTime = currentTime;
            const touchId = touch.identifier;
            const touchX = touch.clientX;
            const touchY = touch.clientY;

            this.longPressTimer = setTimeout(() => {
                // Activate joystick at the initial touch position
                this.activateJoystick(touchId, touchX, touchY);
                console.log('Long press detected - joystick activated');
            }, this.longPressThreshold);
        }
    }

    /**
     * Handle touch move event
     */
    handleTouchMove(event) {
        const touch = event.changedTouches[0];

        // If joystick is active, prevent default and update joystick
        if (this.joystick.isActive()) {
            event.preventDefault();

            // Find the touch that's controlling the joystick
            for (let i = 0; i < event.changedTouches.length; i++) {
                const touchItem = event.changedTouches[i];

                // Update joystick if this is the active touch
                if (this.activeTouchId === touchItem.identifier) {
                    this.joystick.update(touchItem.clientX, touchItem.clientY);
                    break;
                }
            }
            return;
        }

        // If joystick is not active, check if we should cancel long press
        if (this.longPressTimer) {
            // Calculate distance from initial touch position
            const dx = Math.abs(touch.clientX - this.touchStartX);
            const dy = Math.abs(touch.clientY - this.touchStartY);
            const distance = Math.sqrt(dx * dx + dy * dy);

            // If moved beyond threshold, cancel long press (user is swiping camera)
            if (distance > this.movementThreshold) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
                console.log('Long press cancelled - finger moved (camera swipe detected)');
            }
        }

        // Allow event to propagate to OrbitControls if joystick not active
    }

    /**
     * Handle touch end event
     */
    handleTouchEnd(event) {
        // Check if the joystick touch ended
        let joystickTouchEnded = false;
        let jetpackTouchEnded = false;

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];

            // Check jetpack FIRST (jetpack mode includes joystick, so check this first)
            if (this.jetpackTouchId === touch.identifier) {
                jetpackTouchEnded = true;
                this.deactivateJetpack();
                break; // Jetpack deactivation also deactivates joystick
            }

            // Check if this is the joystick control touch (but not jetpack)
            if (this.activeTouchId === touch.identifier && !this.jetpackActive) {
                joystickTouchEnded = true;
                this.deactivateJoystick();
                break;
            }
        }

        // Clear long-press timer if touch ended before threshold
        // But only if joystick wasn't already active
        if (this.longPressTimer && !joystickTouchEnded && !jetpackTouchEnded) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
            // This was a tap or quick swipe - allow OrbitControls to have handled it
        }

        // If joystick is not active, allow event to propagate to OrbitControls
        if (!this.joystick.isActive()) {
            // Don't prevent default - let OrbitControls handle the touch end
        }
    }

    /**
     * Handle double-tap gesture
     */
    handleDoubleTap(touch) {
        // Check if already holding for jetpack - if so, ignore
        if (this.jetpackActive) return;

        // Store touch info for use in setTimeout
        const touchId = touch.identifier;
        const touchX = touch.clientX;
        const touchY = touch.clientY;

        // Trigger jump (single frame space press, then release)
        this.keysPressed[' '] = true;

        // Release space after a short delay (simulate key press)
        setTimeout(() => {
            if (!this.jetpackActive) {
                this.keysPressed[' '] = false;
            }
        }, 50);

        // Activate jetpack mode if touch is still down after delay
        this.jetpackTouchId = touchId;

        setTimeout(() => {
            // Check if touch is still down
            if (this.jetpackTouchId === touchId) {
                this.activateJetpack(touchId, touchX, touchY);
            }
        }, 100);
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
     * Activate jetpack mode with joystick
     */
    activateJetpack(touchId, x, y) {
        this.jetpackActive = true;
        this.keysPressed[' '] = true; // Hold space for jetpack

        // Show joystick for directional control
        this.activateJoystick(touchId, x, y);

        console.log('Jetpack mode activated');
    }

    /**
     * Deactivate jetpack mode
     */
    deactivateJetpack() {
        this.jetpackActive = false;
        this.jetpackTouchId = null;
        this.keysPressed[' '] = false;

        // Deactivate joystick as well
        this.deactivateJoystick();

        console.log('Jetpack mode deactivated');
    }

    /**
     * Update loop to sync joystick state to keysPressed
     */
    startUpdateLoop() {
        const update = () => {
            if (this.joystick.isActive()) {
                const keys = this.joystick.getKeys();

                // Update keysPressed object
                this.keysPressed['w'] = keys.w;
                this.keysPressed['a'] = keys.a;
                this.keysPressed['s'] = keys.s;
                this.keysPressed['d'] = keys.d;
            }

            requestAnimationFrame(update);
        };

        update();
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        document.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
        document.removeEventListener('touchcancel', this.handleTouchEnd);
    }
}
