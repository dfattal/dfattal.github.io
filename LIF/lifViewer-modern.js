// Modern lifViewer class using LifLoader and Renderers modules
import { LifLoader } from './LifLoader.js';
import { MN2MNRenderer, ST2MNRenderer } from '../VIZ/Renderers.js';

export class lifViewer {
    static instances = [];

    constructor(lifUrl, container, height = 300, autoplay = false, mouseOver = true, fadeIn = true) {
        lifViewer.instances.push(this);

        // Public properties (maintain API compatibility)
        this.lifUrl = lifUrl;
        this.container = container;
        this.autoplay = autoplay;
        this.mouseOver = mouseOver;
        this.mouseOverAmplitude = 1;
        this.fadeIn = fadeIn;
        this.running = false;
        this.disableAnim = false;
        this.debug = false; // Enable for debugging mouse interaction

        // Mouse tracking
        this.mousePosOld = { x: 0, y: 0 };
        this.mousePos = { x: 0, y: 0 };

        // Animation properties
        this.animations = [];
        this.currentAnimation = null;
        this.startTime = Date.now() / 1000;
        this.focus = 0;
        this.savedFocus = 0; // Saved focus value for when animation stops
        this.animationFrame = null;

        // DOM elements
        this.img = document.createElement('img');
        this.img.src = lifUrl;
        // Remove fixed height - let CSS handle sizing
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'none';

        // WebGL context
        this.gl = this.canvas.getContext('webgl');
        if (!this.gl) {
            console.error('Unable to initialize WebGL for lifViewer');
            return;
        }

        // Modern modules
        this.lifLoader = new LifLoader();
        this.renderer = null; // Will be MN2MNRenderer or ST2MNRenderer
        this.views = null;
        this.stereo_render_data = null;

        // Camera state (used by animation system)
        this.renderCam = {
            pos: { x: 0, y: 0, z: 0 },
            sl: { x: 0, y: 0 },
            sk: { x: 0, y: 0 },
            roll: 0,
            f: 0
        };

        // Bind methods
        this.renderFrame = this.renderFrame.bind(this);

        // Initialize if URL provided
        if (this.lifUrl) {
            this.init();
        }
    }

    // Static methods for controlling all instances
    static disableAllAnimations() {
        lifViewer.instances.forEach(instance => {
            instance.disableAnim = true;
        });
    }

    static enableAllAnimations() {
        lifViewer.instances.forEach(instance => {
            instance.disableAnim = false;
        });
    }

    // Enable debugging for mouse interaction
    enableDebug() {
        this.debug = true;
        console.log('lifViewer debugging enabled - mouse interaction will be logged');
    }

    // Set focus value (0-1) and update convergence distance
    setFocus(focusValue) {
        this.focus = Math.max(0, Math.min(1, focusValue)); // Clamp to [0,1]

        // Save focus value when not animating (for restoration later)
        if (!this.running) {
            this.savedFocus = this.focus;
        }

        if (this.views && this.views.length > 0 && this.currentAnimation) {
            // Calculate invd based on focus and invZmin like in webXR
            const invZmin = this.views[0].inv_z_map.min;
            const invd = this.focus * invZmin;

            // Update current animation data
            this.currentAnimation.data.invd = invd;

            // Also update renderer if available
            if (this.renderer) {
                this.renderer.invd = invd;
            }

            console.log(`Focus set to ${this.focus.toFixed(2)}, invd: ${invd.toFixed(4)}`);
        }
    }

    // Update focus slider in UI (if available)
    updateFocusSlider() {
        // Dispatch custom event to update slider
        const event = new CustomEvent('lifviewer-focus-update', {
            detail: { focus: this.focus }
        });
        window.dispatchEvent(event);
    }

    // Helper to load image
    async loadImage() {
        return new Promise((resolve, reject) => {
            this.img.onload = () => resolve();
            this.img.onerror = () => reject(new Error('Image failed to load'));
        });
    }

    // Main initialization
    async init() {
        try {
            // Load the fallback image first
            await this.loadImage();

            // Add elements to container with initial setup
            if (this.fadeIn) {
                this.img.style.opacity = '0';
                this.img.style.transition = 'opacity 0.6s ease-in-out';
            }
            this.container.appendChild(this.img);
            this.container.appendChild(this.canvas);

            // Fade in the image if fade-in is enabled
            if (this.fadeIn) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        this.img.style.opacity = '1';
                    });
                });
            }

            // Setup mouse interaction
            this.setupMouseInteraction();

            // Resize canvas to fit container
            this.resizeCanvasToContainer();

            // Load and parse LIF file
            await this.loadLifFile();

            // Setup default animation
            this.setupDefaultAnimation();

            // Create appropriate renderer
            await this.createRenderer();

            // Call afterLoad hook
            this.afterLoad();

            // Show canvas and start rendering loop
            this.showCanvas();
            this.startRenderLoop();

            // Auto-start animation if requested
            if (this.autoplay) {
                this.startAnimation();
            }

        } catch (error) {
            console.error('Error initializing lifViewer:', error);
        }
    }

    // Setup mouse interaction
    setupMouseInteraction() {
        this.canvas.addEventListener('mousemove', (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left - rect.width / 2;
            const mouseY = event.clientY - rect.top - rect.height / 2;

            // Normalize to [-0.5, 0.5] range
            this.mousePos.x = mouseX / rect.width;
            this.mousePos.y = mouseY / rect.width;

            // Debug mouse position
            if (this.debug) {
                console.log('Mouse:', this.mousePos.x.toFixed(3), this.mousePos.y.toFixed(3));
            }
        });
    }

    // Load and parse LIF file using LifLoader
    async loadLifFile() {
        const response = await fetch(this.lifUrl);
        const blob = await response.blob();
        const file = new File([blob], 'lifImage.jpg', { type: 'image/jpeg' });

        // Use LifLoader to parse the file
        const result = await this.lifLoader.load(file);
        this.views = result.views;
        this.stereo_render_data = result.stereo_render_data;

        // Store animations if available
        if (this.lifLoader.animations) {
            this.animations = this.lifLoader.animations;
        }

        console.log('LIF loaded:', {
            views: this.views.length,
            stereo: !!this.stereo_render_data
        });
    }

    // Setup default animation parameters
    setupDefaultAnimation() {
        if (!this.views || this.views.length === 0) return;

        const view = this.views[0];
        const zAmp = 0.5 / view.inv_z_map.min;
        const invZmin = view.inv_z_map.min;

        // Use LIF file's convergence distance as default, otherwise fallback
        let defaultInvd = 0;
        if (this.stereo_render_data && this.stereo_render_data.inv_convergence_distance !== undefined) {
            defaultInvd = this.stereo_render_data.inv_convergence_distance;
        } else {
            // Fallback to frustum skew calculation
            defaultInvd = Math.abs(view.frustum_skew ? view.frustum_skew.x : 0) / 0.5;
        }

        // Calculate and set initial focus from LIF data
        this.focus = Math.max(0, Math.min(1, defaultInvd / invZmin));
        this.savedFocus = this.focus;

        const xc = this.views.length > 1 ? -0.5 : 0;

        console.log(`Initial focus from LIF: ${this.focus.toFixed(3)} (invd: ${defaultInvd.toFixed(4)}, invZmin: ${invZmin.toFixed(4)})`);

        // Dispatch event to update UI slider
        this.updateFocusSlider();

        // Create default animation
        this.animations[0] = {
            type: "harmonic",
            name: "Default Animation",
            duration_sec: 4.0,
            data: {
                focal_px: view.focal_px,
                width_px: view.width_px,
                height_px: view.height_px,
                invd: defaultInvd,
                position: {
                    x: { amplitude: 0.0, phase: 0.0, bias: xc },
                    y: { amplitude: 0.0, phase: 0.0, bias: 0 },
                    z: { amplitude: zAmp / 2, phase: -0.25, bias: zAmp / 2 }
                }
            }
        };

        this.currentAnimation = this.animations[0];
    }

    // Create appropriate renderer based on views
    async createRenderer() {
        if (!this.views || this.views.length === 0) {
            throw new Error('No views available for rendering');
        }

        // Determine shader path based on view count
        const shaderPath = this.views.length === 1 ?
            '../Shaders/rayCastMonoLDIGlow.glsl' :
            '../Shaders/rayCastStereoLDIGlow.glsl';

        // Create appropriate renderer
        if (this.views.length === 1) {
            this.renderer = await MN2MNRenderer.createInstance(
                this.gl,
                shaderPath,
                this.views,
                false, // debug
                3840   // limitSize
            );
        } else {
            this.renderer = await ST2MNRenderer.createInstance(
                this.gl,
                shaderPath,
                this.views,
                false, // debug
                2560   // limitSize
            );
        }

        // Configure renderer
        this.renderer.background = [0.1, 0.1, 0.1, 1.0];
        this.renderer.invd = this.currentAnimation.data.invd;

        // Set initial focal length
        this.renderer.renderCam.f = this.views[0].focal_px * this.renderer.viewportScale();

        console.log('Renderer created:', this.renderer.constructor.name);
    }

    // Viewport scaling calculation
    viewportScale(iRes, oRes) {
        return Math.min(oRes.x, oRes.y) / Math.min(iRes.x, iRes.y);
    }

    // Resize canvas to container
    resizeCanvasToContainer() {
        // Get container dimensions
        const containerRect = this.container.getBoundingClientRect();
        const containerWidth = this.container.clientWidth;
        const containerHeight = this.container.clientHeight;

        // Set canvas to fill container completely
        this.canvas.width = containerWidth;
        this.canvas.height = containerHeight;

        // Set CSS size to match container
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        console.log('Canvas resized to fill container:', containerWidth, 'x', containerHeight);
    }

    // Show canvas and hide image
    showCanvas() {
        if (this.fadeIn) {
            // Set up fade-in transition
            this.canvas.style.opacity = '0';
            this.canvas.style.transition = 'opacity 0.8s ease-in-out';
            this.canvas.style.display = 'block';

            // Hide image immediately
            this.img.style.display = 'none';

            // Trigger fade-in after a brief delay
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.canvas.style.opacity = '1';
                });
            });

            console.log('Canvas fading in for interaction');
        } else {
            // Immediate display without fade
            this.img.style.display = 'none';
            this.canvas.style.display = 'block';
            this.canvas.style.opacity = '1';
            console.log('Canvas is now visible for interaction');
        }
    }

    // Start continuous render loop for mouse interaction
    startRenderLoop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.animationFrame = requestAnimationFrame(() => this.renderFrame());
    }

    // Main render frame (continuous)
    renderFrame() {
        if (!this.renderer || !this.currentAnimation) return;

        const currentTime = Date.now() / 1000;
        const invd = this.currentAnimation.data.invd;

        // Update camera position from animation (only if animation is running)
        if (this.running) {
            const animTime = this.currentAnimation.duration_sec;
            const ut = currentTime - this.startTime;
            const t = ut;

            // Harmonic motion function
            const harm = (amp, ph, bias) => amp * Math.sin(2 * Math.PI * (t / animTime + ph)) + bias;

            this.renderCam.pos.x = harm(
                this.currentAnimation.data.position.x.amplitude,
                this.currentAnimation.data.position.x.phase,
                this.currentAnimation.data.position.x.bias
            );
            this.renderCam.pos.y = harm(
                this.currentAnimation.data.position.y.amplitude,
                this.currentAnimation.data.position.y.phase,
                this.currentAnimation.data.position.y.bias
            );
            this.renderCam.pos.z = harm(
                this.currentAnimation.data.position.z.amplitude,
                this.currentAnimation.data.position.z.phase,
                this.currentAnimation.data.position.z.bias
            );
        } else {
            // Static position when not animating
            this.renderCam.pos.x = this.currentAnimation.data.position.x.bias;
            this.renderCam.pos.y = this.currentAnimation.data.position.y.bias;
            this.renderCam.pos.z = this.currentAnimation.data.position.z.bias;
        }

        // Apply mouse interaction (always active)
        if (this.mouseOver) {
            const smoothMouseX = (0.1 * this.mousePos.x + 0.9 * this.mousePosOld.x) * this.mouseOverAmplitude;
            const smoothMouseY = (0.1 * this.mousePos.y + 0.9 * this.mousePosOld.y) * this.mouseOverAmplitude;
            this.renderCam.pos.x += smoothMouseX;
            this.renderCam.pos.y += smoothMouseY;
            this.mousePosOld = { x: smoothMouseX, y: smoothMouseY };

            // Debug camera position
            if (this.debug) {
                console.log('Camera pos:', this.renderCam.pos.x.toFixed(3), this.renderCam.pos.y.toFixed(3));
            }
        }

        // Calculate skew correction
        this.renderCam.sk.x = -this.renderCam.pos.x * invd / (1 - this.renderCam.pos.z * invd);
        this.renderCam.sk.y = -this.renderCam.pos.y * invd / (1 - this.renderCam.pos.z * invd);

        // Calculate focal length with viewport scaling
        const vs = this.viewportScale(
            { x: this.currentAnimation.data.width_px, y: this.currentAnimation.data.height_px },
            { x: this.gl.canvas.width, y: this.gl.canvas.height }
        );
        this.renderCam.f = this.currentAnimation.data.focal_px * vs * (1 - this.renderCam.pos.z * invd);

        // Update renderer camera properties directly
        this.renderer.renderCam.pos.x = this.renderCam.pos.x;
        this.renderer.renderCam.pos.y = this.renderCam.pos.y;
        this.renderer.renderCam.pos.z = this.renderCam.pos.z;
        this.renderer.renderCam.sk.x = this.renderCam.sk.x;
        this.renderer.renderCam.sk.y = this.renderCam.sk.y;
        this.renderer.renderCam.f = this.renderCam.f;

        // Draw scene
        this.renderer.drawScene(this.running ? currentTime - this.startTime : 1.1);

        // Continue rendering if context is valid
        if (!this.gl.isContextLost()) {
            this.animationFrame = requestAnimationFrame(() => this.renderFrame());
        } else {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    // Optional transition effect when stopping animation
    doTransition(transitionTime) {
        const startTime = Date.now() / 1000;

        const transitionFrame = () => {
            const elapsedTime = (Date.now() / 1000) - startTime;

            if (elapsedTime < transitionTime && !this.gl.isContextLost()) {
                // Create gentle fade-out effect by dampening movement
                const dampingFactor = 1.05;
                const { x: xo, y: yo, z: zo } = this.renderCam.pos;
                const xc = this.currentAnimation.data.position.x.bias;

                this.renderCam.pos = {
                    x: xc + (xo - xc) / dampingFactor,
                    y: yo / dampingFactor,
                    z: zo / dampingFactor
                };

                requestAnimationFrame(transitionFrame);
            }
        };

        requestAnimationFrame(transitionFrame);
    }

    // Start animation
    async startAnimation() {
        if (this.disableAnim) return;

        if (!this.gl.isContextLost()) {
            if (this.running) return;

            this.running = true;
            this.startTime = Date.now() / 1000;

            // Set focus to 0 for animation and disable slider
            this.setFocus(0);
            this.updateFocusSlider();

            // Dispatch event to disable slider
            const event = new CustomEvent('lifviewer-animation-state', {
                detail: { running: true }
            });
            window.dispatchEvent(event);

            console.log('Animation started - focus set to 0');
        } else {
            // Recreate canvas and context if lost
            await this.recreateContext();
            this.startAnimation();
        }
    }

    // Stop animation with transition
    stopAnimation(transitionTime = 0.5) {
        if (this.disableAnim) return;

        this.running = false;
        this.mousePosOld = { x: 0, y: 0 };

        // Restore saved focus and re-enable slider
        this.setFocus(this.savedFocus);
        this.updateFocusSlider();

        // Dispatch event to enable slider
        const event = new CustomEvent('lifviewer-animation-state', {
            detail: { running: false }
        });
        window.dispatchEvent(event);

        console.log(`Animation stopped - focus restored to ${this.savedFocus.toFixed(2)}`);

        // Optional: do transition effect
        if (transitionTime > 0) {
            this.startTime = Date.now() / 1000;
            this.doTransition(transitionTime);
        }
    }

    // Recreate WebGL context after loss
    async recreateContext() {
        this.canvas.remove();
        this.canvas = document.createElement('canvas');
        this.container.appendChild(this.canvas);
        this.resizeCanvasToContainer();
        this.setupMouseInteraction();

        this.gl = this.canvas.getContext('webgl');
        await this.createRenderer();
        this.showCanvas();
        this.startRenderLoop();
    }

    // Hook for subclasses
    async afterLoad() {
        // Override in subclasses if needed
    }

    // Cleanup resources
    dispose() {
        // Stop animation
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        // Lose WebGL context
        if (this.gl) {
            const ext = this.gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
        }

        // Remove from instances
        const index = lifViewer.instances.indexOf(this);
        if (index > -1) {
            lifViewer.instances.splice(index, 1);
        }

        // Clear references
        this.renderer = null;
        this.views = null;
        this.lifLoader = null;

        console.log('lifViewer disposed');
    }
} 