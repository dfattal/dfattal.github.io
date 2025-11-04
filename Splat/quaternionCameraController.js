import * as THREE from 'three';

/**
 * Quaternion-based camera controller with unlimited rotation
 * Replaces OrbitControls to eliminate angle wrapping issues at ±π boundary
 */
export class QuaternionCameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Target point the camera orbits around
        this.target = new THREE.Vector3();

        // Rotation angles (no wrapping - can accumulate infinitely)
        this.yaw = 0;      // Horizontal rotation (unlimited)
        this.pitch = 0;    // Vertical rotation (clamped)

        // Distance from target
        this.distance = 5;
        this.minDistance = 1;
        this.maxDistance = 10;

        // Damping for smooth motion
        this.enableDamping = true;
        this.dampingFactor = 0.1;

        // Target rotation (for damping)
        this.targetYaw = 0;
        this.targetPitch = 0;
        this.targetDistance = 5;

        // Angle limits
        this.maxPolarAngle = Math.PI; // Vertical limit (0 = up, π = down)
        this.minPolarAngle = 0;

        // Pan disabled by default (to match OrbitControls config)
        this.enablePan = false;

        // Enabled state (can be disabled to temporarily prevent input)
        this.enabled = true;

        // Mouse state
        this.isRotating = false;
        this.isZooming = false;
        this.mouseStart = new THREE.Vector2();
        this.mouseCurrent = new THREE.Vector2();

        // Mouse sensitivity
        this.rotateSpeed = 1.0;
        this.zoomSpeed = 1.0;

        // Bind event handlers
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);

        // Add event listeners
        this.domElement.addEventListener('mousedown', this.onMouseDown);
        this.domElement.addEventListener('wheel', this.onWheel);
        this.domElement.addEventListener('contextmenu', this.onContextMenu);

        // Initialize camera position based on current state
        this.syncFromCamera();
    }

    /**
     * Sync controller state from current camera position
     */
    syncFromCamera() {
        const offset = new THREE.Vector3().subVectors(this.camera.position, this.target);
        this.distance = offset.length();
        this.targetDistance = this.distance;

        // Calculate yaw and pitch from current camera position
        const horizontalDistance = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
        this.yaw = Math.atan2(offset.x, offset.z);
        this.pitch = Math.atan2(horizontalDistance, offset.y);

        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
    }

    /**
     * Rotate camera left (positive angle) or right (negative angle)
     */
    rotateLeft(angle) {
        this.targetYaw += angle;
        // No wrapping - yaw can accumulate infinitely
    }

    /**
     * Rotate camera up (positive angle) or down (negative angle)
     */
    rotateUp(angle) {
        this.targetPitch -= angle;
        // Clamp pitch to prevent flipping
        this.targetPitch = Math.max(
            this.minPolarAngle,
            Math.min(this.maxPolarAngle, this.targetPitch)
        );
    }

    /**
     * Zoom in (negative delta) or out (positive delta)
     */
    dolly(delta) {
        if (delta < 0) {
            this.targetDistance /= Math.pow(0.95, this.zoomSpeed);
        } else if (delta > 0) {
            this.targetDistance *= Math.pow(0.95, this.zoomSpeed);
        }

        this.targetDistance = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, this.targetDistance)
        );
    }

    /**
     * Mouse down handler
     */
    onMouseDown(event) {
        if (!this.enabled) return;

        if (event.button === 0) { // Left mouse button
            this.isRotating = true;
            this.mouseStart.set(event.clientX, event.clientY);
            this.mouseCurrent.set(event.clientX, event.clientY);

            document.addEventListener('mousemove', this.onMouseMove);
            document.addEventListener('mouseup', this.onMouseUp);
        }
    }

    /**
     * Mouse move handler
     */
    onMouseMove(event) {
        if (this.isRotating) {
            this.mouseCurrent.set(event.clientX, event.clientY);

            const deltaX = this.mouseCurrent.x - this.mouseStart.x;
            const deltaY = this.mouseCurrent.y - this.mouseStart.y;

            // Rotate based on mouse movement
            const rotateAngleX = 2 * Math.PI * deltaX / this.domElement.clientHeight * this.rotateSpeed;
            const rotateAngleY = 2 * Math.PI * deltaY / this.domElement.clientHeight * this.rotateSpeed;

            // Invert signs to match OrbitControls behavior
            this.rotateLeft(-rotateAngleX);  // Drag right → rotate right
            this.rotateUp(-rotateAngleY);     // Drag down → rotate down

            this.mouseStart.copy(this.mouseCurrent);
        }
    }

    /**
     * Mouse up handler
     */
    onMouseUp(event) {
        if (event.button === 0) {
            this.isRotating = false;
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    }

    /**
     * Mouse wheel handler
     */
    onWheel(event) {
        if (!this.enabled) return;

        event.preventDefault();
        this.dolly(event.deltaY);
    }

    /**
     * Context menu handler (disable right-click menu)
     */
    onContextMenu(event) {
        event.preventDefault();
    }

    /**
     * Update camera position based on current rotation and distance
     * Call this every frame
     */
    update() {
        // Apply damping
        if (this.enableDamping) {
            this.yaw += (this.targetYaw - this.yaw) * this.dampingFactor;
            this.pitch += (this.targetPitch - this.pitch) * this.dampingFactor;
            this.distance += (this.targetDistance - this.distance) * this.dampingFactor;
        } else {
            this.yaw = this.targetYaw;
            this.pitch = this.targetPitch;
            this.distance = this.targetDistance;
        }

        // Calculate camera position using spherical coordinates
        // Convert to Cartesian: x = r*sin(pitch)*sin(yaw), y = r*cos(pitch), z = r*sin(pitch)*cos(yaw)
        const offset = new THREE.Vector3(
            this.distance * Math.sin(this.pitch) * Math.sin(this.yaw),
            this.distance * Math.cos(this.pitch),
            this.distance * Math.sin(this.pitch) * Math.cos(this.yaw)
        );

        this.camera.position.copy(this.target).add(offset);
        this.camera.lookAt(this.target);

        return true; // Changed (for compatibility with OrbitControls API)
    }

    /**
     * Get current azimuth angle (for debugging/compatibility)
     */
    getAzimuthalAngle() {
        return this.yaw;
    }

    /**
     * Get current polar angle (for debugging/compatibility)
     */
    getPolarAngle() {
        return this.pitch;
    }

    /**
     * Dispose of event listeners
     */
    dispose() {
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.domElement.removeEventListener('wheel', this.onWheel);
        this.domElement.removeEventListener('contextmenu', this.onContextMenu);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }

    /**
     * Reset controller to default state
     */
    reset() {
        this.yaw = 0;
        this.pitch = Math.PI / 4;
        this.distance = 5;
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
        this.targetDistance = this.distance;
    }

    /**
     * Save current state
     */
    saveState() {
        this.savedYaw = this.yaw;
        this.savedPitch = this.pitch;
        this.savedDistance = this.distance;
    }
}
