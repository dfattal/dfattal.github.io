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

        return params;
    }

    /**
     * Applies SRHydra parameters to a WebXR session request
     * @param {Object} sessionInit - The WebXR session init object
     * @param {Object} srhydraParams - SRHydra parameters object
     * @returns {Object} The modified session init object
     */
    static applyToSessionInit(sessionInit, srhydraParams) {
        return {
            ...sessionInit,
            srhydraSettings: srhydraParams
        };
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
     * Example usage with a WebXR session
     * @param {string} mode - XR session mode ('immersive-vr', etc.)
     * @param {Object} config - Configuration including SRHydra settings
     * @returns {Promise<XRSession>} WebXR session with SRHydra parameters
     */
    static async requestSession(mode = 'immersive-vr', config = {}) {
        const { requiredFeatures = [], optionalFeatures = [], srhydra = {} } = config;

        const sessionInit = this.createSessionInit(
            requiredFeatures,
            optionalFeatures,
            srhydra
        );

        if (!navigator.xr) {
            throw new Error('WebXR not supported in this browser');
        }

        return navigator.xr.requestSession(mode, sessionInit);
    }
} 