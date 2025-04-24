/**
 * SRHydra WebXR Session Parameter Utilities
 * 
 * This library provides helper functions for working with SRHydra-specific
 * WebXR session initialization parameters.
 */
export class SRHydraSessionParams {
    /**
     * Creates a session parameters object for SRHydra
     * @param {Object} config - Configuration options
     * @param {string} [config.projectionMode] - 'camera-centric' or 'display-centric'
     * @param {number} [config.convergenceOffset] - Value between 0.01 and 2.0
     * @param {number} [config.perspectiveFactor] - Value between 0.2 and 5.0
     * @param {number} [config.sceneScale] - Value between 0.1 and 10.0
     * @param {number} [config.parallaxStrength] - Value between 0.0 and 1.0
     * @param {number} [config.ipdScale] - Value between 0.0 and 2.0
     * @returns {Object} Session parameters object
     */
    static createParams(config) {
        const params = {};

        if (config.projectionMode) {
            params.projectionMode = config.projectionMode === 'display-centric' ? 'display-centric' : 'camera-centric';
        }

        if (typeof config.convergenceOffset === 'number') {
            params.convergenceOffset = Math.max(0.01, Math.min(2.0, config.convergenceOffset));
        }

        if (typeof config.perspectiveFactor === 'number') {
            params.perspectiveFactor = Math.max(0.2, Math.min(5.0, config.perspectiveFactor));
        }

        if (typeof config.sceneScale === 'number') {
            params.sceneScale = Math.max(0.1, Math.min(10.0, config.sceneScale));
        }

        if (typeof config.parallaxStrength === 'number') {
            params.parallaxStrength = Math.max(0.0, Math.min(1.0, config.parallaxStrength));
        }

        if (typeof config.ipdScale === 'number') {
            params.ipdScale = Math.max(0.0, Math.min(2.0, config.ipdScale));
        }

        return params;
    }

    /**
     * Applies SRHydra parameters to a WebXR session request
     * @param {Object} sessionInit - The WebXR session init object
     * @param {Object} srhydraParams - SRHydra parameters object
     * @returns {Object} The modified session init object
     */
    static applyToSessionInit(sessionInit, srhydraParams) {
        // Method 1: Apply our parameters in multiple formats to increase chances of propagation
        
        // Original approach
        sessionInit.srhydra = srhydraParams;
        
        // Method 2: Try a format with type field that might be passed through to OpenXR
        sessionInit.srhydraSettings = {
            type: 1000110000, // XR_TYPE_SRHYDRA_SESSION_SETTINGS_INFO
            next: null,
            projectionMode: srhydraParams.projectionMode,
            convergenceOffset: srhydraParams.convergenceOffset || 0.5,
            perspectiveFactor: srhydraParams.perspectiveFactor || 1.0,
            sceneScale: srhydraParams.sceneScale || 1.0
        };
        
        // Method 3: Try a format similar to other WebXR extensions
        if (!sessionInit.optionalExtensions) {
            sessionInit.optionalExtensions = [];
        }
        
        sessionInit.optionalExtensions.push({
            name: "XR_SRHYDRA_session_settings",
            // Some browsers might support a structure like this
            parameters: srhydraParams
        });
        
        console.log("Session init with SRHydra settings:", sessionInit);
        return sessionInit;
    }

    /**
     * Creates a complete WebXR session init object with SRHydra parameters
     * @param {Object} requiredFeatures - Array of required WebXR features
     * @param {Object} optionalFeatures - Array of optional WebXR features
     * @param {Object} srhydraConfig - SRHydra configuration options
     * @returns {Object} Complete session init object
     */
    static createSessionInit(requiredFeatures = [], optionalFeatures = [], srhydraConfig = {}) {
        const sessionInit = {
            requiredFeatures: Array.isArray(requiredFeatures) ? requiredFeatures : [],
            optionalFeatures: Array.isArray(optionalFeatures) ? optionalFeatures : []
        };

        const srhydraParams = this.createParams(srhydraConfig);

        return this.applyToSessionInit(sessionInit, srhydraParams);
    }

    /**
     * Creates an XrSessionInit object optimized for SRHydra compatibility
     * @param {string} mode - XR session mode ('immersive-vr', etc.)
     * @param {Object} options - Configuration including SRHydra settings
     * @returns {Object} WebXR SessionInit object with SRHydra settings
     */
    static createSRHydraSessionInit(mode, options = {}) {
        const { requiredFeatures = [], optionalFeatures = [], srhydra = {} } = options;
        
        // Start with standard WebXR session init
        const sessionInit = {
            requiredFeatures: [...requiredFeatures],
            optionalFeatures: [...optionalFeatures]
        };
        
        // Apply all our parameter formats
        return this.applyToSessionInit(sessionInit, srhydra);
    }

    /**
     * Request a WebXR session with SRHydra parameters
     * @param {string} mode - XR session mode ('immersive-vr', etc.)
     * @param {Object} config - Configuration including SRHydra settings
     * @returns {Promise<XRSession>} WebXR session with SRHydra parameters
     */
    static async requestSession(mode = 'immersive-vr', config = {}) {
        const { requiredFeatures = [], optionalFeatures = [], srhydra = {} } = config;

        const sessionInit = this.createSRHydraSessionInit(mode, {
            requiredFeatures,
            optionalFeatures,
            srhydra
        });

        if (!navigator.xr) {
            throw new Error('WebXR not supported in this browser');
        }

        // Also try to set local storage as a fallback approach
        try {
            localStorage.setItem('srhydra_projection_mode', srhydra.projectionMode || '');
            localStorage.setItem('srhydra_convergence_offset', srhydra.convergenceOffset?.toString() || '');
            localStorage.setItem('srhydra_perspective_factor', srhydra.perspectiveFactor?.toString() || '');
            localStorage.setItem('srhydra_scene_scale', srhydra.sceneScale?.toString() || '');
            console.log("Stored SRHydra settings in localStorage as fallback");
        } catch (e) {
            console.warn("Could not store SRHydra settings in localStorage", e);
        }

        return navigator.xr.requestSession(mode, sessionInit);
    }
    
    /**
     * Utility function to detect if running in SRHydra
     * @returns {Promise<boolean>} Promise resolving to true if running in SRHydra
     */
    static async isSRHydraRuntime() {
        // This is a simple heuristic - could be improved with actual runtime detection
        if (!navigator.xr) return false;
        
        try {
            // Check if supported
            const supported = await navigator.xr.isSessionSupported('immersive-vr');
            if (!supported) return false;
            
            // More advanced detection could be added here
            return true;
        } catch (e) {
            console.error("Error detecting XR runtime:", e);
            return false;
        }
    }

    /**
     * Print SRHydra configuration to console
     * @param {Object} config - SRHydra configuration
     */
    static logConfiguration(config) {
        console.group("SRHydra Configuration");
        console.log("Projection Mode:", config.projectionMode || "Default");
        console.log("Convergence Offset:", config.convergenceOffset || "Default");
        console.log("Perspective Factor:", config.perspectiveFactor || "Default");
        console.log("Scene Scale:", config.sceneScale || "Default");
        console.log("Parallax Strength:", config.parallaxStrength || "Default");
        console.log("IPD Scale:", config.ipdScale || "Default");
        console.groupEnd();
    }
}