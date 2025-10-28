/**
 * VirtualJoystick - Touch-based joystick for mobile character control
 *
 * Features:
 * - Appears at touch point on long-press
 * - Converts joystick position to directional input (WASD simulation)
 * - Smooth visual feedback with CSS animations
 * - Handles 8-directional movement
 */
export class VirtualJoystick {
    constructor() {
        // Visual elements
        this.base = null;
        this.thumb = null;

        // Touch tracking
        this.active = false;
        this.originX = 0;
        this.originY = 0;
        this.currentX = 0;
        this.currentY = 0;

        // Configuration
        this.maxDistance = 40; // Maximum distance thumb can move from center
        this.deadzone = 0.15; // Minimum distance to register input (0-1)

        // Create joystick elements
        this.createElements();
    }

    /**
     * Create HTML elements for joystick base and thumb
     */
    createElements() {
        // Create base circle
        this.base = document.createElement('div');
        this.base.id = 'joystick-base';
        this.base.style.display = 'none'; // Hidden by default
        document.body.appendChild(this.base);

        // Create thumb circle
        this.thumb = document.createElement('div');
        this.thumb.id = 'joystick-thumb';
        this.base.appendChild(this.thumb);
    }

    /**
     * Activate joystick at touch position
     */
    show(x, y) {
        this.active = true;
        this.originX = x;
        this.originY = y;
        this.currentX = x;
        this.currentY = y;

        // Position base at touch point (centered)
        this.base.style.left = `${x}px`;
        this.base.style.top = `${y}px`;
        this.base.style.display = 'block';

        // Reset thumb to center
        this.thumb.style.transform = 'translate(0px, 0px)';

        // Trigger fade-in animation
        requestAnimationFrame(() => {
            this.base.style.opacity = '1';
        });
    }

    /**
     * Update thumb position based on touch movement
     */
    update(x, y) {
        if (!this.active) return;

        this.currentX = x;
        this.currentY = y;

        // Calculate offset from origin
        let deltaX = x - this.originX;
        let deltaY = y - this.originY;

        // Calculate distance and clamp to max distance
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > this.maxDistance) {
            const angle = Math.atan2(deltaY, deltaX);
            deltaX = Math.cos(angle) * this.maxDistance;
            deltaY = Math.sin(angle) * this.maxDistance;
        }

        // Update thumb visual position
        this.thumb.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    }

    /**
     * Hide joystick and deactivate
     */
    hide() {
        this.active = false;
        this.base.style.opacity = '0';

        // Hide element after fade animation completes
        setTimeout(() => {
            if (!this.active) {
                this.base.style.display = 'none';
            }
        }, 200);
    }

    /**
     * Get current joystick direction as angle and magnitude
     * @returns {Object} { angle: number (radians), magnitude: number (0-1) }
     */
    getDirection() {
        if (!this.active) {
            return { angle: 0, magnitude: 0 };
        }

        const deltaX = this.currentX - this.originX;
        const deltaY = this.currentY - this.originY;

        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const magnitude = Math.min(distance / this.maxDistance, 1.0);

        // Apply deadzone
        if (magnitude < this.deadzone) {
            return { angle: 0, magnitude: 0 };
        }

        // Calculate angle (0 = right, π/2 = down, π = left, 3π/2 = up)
        const angle = Math.atan2(deltaY, deltaX);

        return { angle, magnitude };
    }

    /**
     * Convert joystick direction to WASD key presses
     * @returns {Object} { w: boolean, a: boolean, s: boolean, d: boolean }
     */
    getKeys() {
        const { angle, magnitude } = this.getDirection();

        // No input if below deadzone
        if (magnitude === 0) {
            return { w: false, a: false, s: false, d: false };
        }

        // Convert angle to degrees for easier calculation
        let degrees = (angle * 180 / Math.PI);

        // Normalize to 0-360 range
        if (degrees < 0) degrees += 360;

        // Determine which keys should be pressed based on angle
        // Use 8-directional zones with 45° each
        const keys = { w: false, a: false, s: false, d: false };

        // Right (337.5° - 22.5°)
        if (degrees >= 337.5 || degrees < 22.5) {
            keys.d = true;
        }
        // Up-Right (22.5° - 67.5°)
        else if (degrees >= 22.5 && degrees < 67.5) {
            keys.d = true;
            keys.w = true;
        }
        // Up (67.5° - 112.5°) - Note: In screen coordinates, down is positive Y
        else if (degrees >= 67.5 && degrees < 112.5) {
            keys.s = true;
        }
        // Up-Left (112.5° - 157.5°)
        else if (degrees >= 112.5 && degrees < 157.5) {
            keys.a = true;
            keys.s = true;
        }
        // Left (157.5° - 202.5°)
        else if (degrees >= 157.5 && degrees < 202.5) {
            keys.a = true;
        }
        // Down-Left (202.5° - 247.5°)
        else if (degrees >= 202.5 && degrees < 247.5) {
            keys.a = true;
            keys.w = true;
        }
        // Down (247.5° - 292.5°)
        else if (degrees >= 247.5 && degrees < 292.5) {
            keys.w = true;
        }
        // Down-Right (292.5° - 337.5°)
        else if (degrees >= 292.5 && degrees < 337.5) {
            keys.d = true;
            keys.w = true;
        }

        return keys;
    }

    /**
     * Check if joystick is currently active
     */
    isActive() {
        return this.active;
    }
}
