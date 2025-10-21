/**
 * Quality Presets for Gaussian Splat rendering
 * Defines performance/quality trade-offs for different device capabilities
 */

/**
 * Quality preset configurations
 * Each preset defines parameters that affect rendering quality and performance
 */
export const QUALITY_PRESETS = {
    low: {
        name: 'Low',
        description: 'Optimized for mobile XR devices',
        pixelRatio: 1.0,
        maxPoints: 500000,        // Limit splat points for performance
        renderScale: 0.75,         // Render at 75% resolution
        antialias: false,
        shadowQuality: 'off',
        targetFPS: 72,
        deviceTypes: ['mobile', 'standalone_low'],
    },
    medium: {
        name: 'Medium',
        description: 'Balanced quality for standalone VR headsets',
        pixelRatio: 1.25,
        maxPoints: 1000000,        // Moderate point count
        renderScale: 1.0,          // Full resolution
        antialias: true,
        shadowQuality: 'low',
        targetFPS: 72,
        deviceTypes: ['standalone', 'mobile_high'],
    },
    high: {
        name: 'High',
        description: 'Maximum quality for PC VR setups',
        pixelRatio: 1.5,
        maxPoints: 2000000,        // High point count
        renderScale: 1.0,          // Full resolution
        antialias: true,
        shadowQuality: 'high',
        targetFPS: 90,
        deviceTypes: ['pcvr', 'desktop'],
    },
};

/**
 * Get quality preset by name
 * @param {string} presetName - 'low', 'medium', or 'high'
 * @returns {Object} - Quality preset configuration
 */
export function getQualityPreset(presetName) {
    const preset = QUALITY_PRESETS[presetName];

    if (!preset) {
        console.warn(`Unknown quality preset: ${presetName}, defaulting to medium`);
        return QUALITY_PRESETS.medium;
    }

    return preset;
}

/**
 * Detect device capability and recommend quality preset
 * @returns {string} - Recommended preset name: 'low', 'medium', or 'high'
 */
export function detectRecommendedQuality() {
    // Check if we're in XR mode
    if (navigator.xr) {
        // Try to detect device type
        const userAgent = navigator.userAgent.toLowerCase();

        // PC VR (via browser on desktop)
        if (!(/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent))) {
            return 'high';
        }

        // Standalone VR headsets (Quest, etc.)
        if (userAgent.includes('quest') || userAgent.includes('oculus')) {
            return 'medium';
        }

        // Mobile devices
        if (/android|iphone|ipad/i.test(userAgent)) {
            return 'low';
        }
    }

    // Default to medium for unknown devices
    return 'medium';
}

/**
 * Apply quality preset to renderer
 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
 * @param {string} presetName - Quality preset name
 */
export function applyQualityToRenderer(renderer, presetName) {
    const preset = getQualityPreset(presetName);

    // Set pixel ratio
    renderer.setPixelRatio(window.devicePixelRatio * preset.pixelRatio);

    // Set render size
    const width = window.innerWidth * preset.renderScale;
    const height = window.innerHeight * preset.renderScale;
    renderer.setSize(width, height);

    console.log(`Applied ${preset.name} quality preset to renderer`);
}

/**
 * Decimate splat points based on quality preset
 * @param {Array} points - Array of splat points
 * @param {string} presetName - Quality preset name
 * @returns {Array} - Decimated array of points
 */
export function decimateSplatPoints(points, presetName) {
    const preset = getQualityPreset(presetName);

    if (points.length <= preset.maxPoints) {
        // No decimation needed
        return points;
    }

    // Calculate decimation ratio
    const ratio = preset.maxPoints / points.length;
    console.log(`Decimating splat points: ${points.length} -> ${preset.maxPoints} (${(ratio * 100).toFixed(1)}%)`);

    // Perform decimation (simple every-nth sampling)
    const decimated = [];
    const step = Math.ceil(1 / ratio);

    for (let i = 0; i < points.length; i += step) {
        decimated.push(points[i]);
    }

    return decimated;
}

/**
 * Get quality preset statistics
 * @param {string} presetName - Quality preset name
 * @returns {Object} - Statistics about the preset
 */
export function getQualityStats(presetName) {
    const preset = getQualityPreset(presetName);

    return {
        name: preset.name,
        description: preset.description,
        maxPoints: preset.maxPoints.toLocaleString(),
        resolution: `${(preset.renderScale * 100).toFixed(0)}%`,
        pixelRatio: preset.pixelRatio.toFixed(2),
        antialias: preset.antialias ? 'On' : 'Off',
        targetFPS: preset.targetFPS,
    };
}

/**
 * Log quality preset info to console
 * @param {string} presetName - Quality preset name
 */
export function logQualityInfo(presetName) {
    const stats = getQualityStats(presetName);

    console.log('=== Quality Preset ===');
    console.log(`Name: ${stats.name}`);
    console.log(`Description: ${stats.description}`);
    console.log(`Max Points: ${stats.maxPoints}`);
    console.log(`Resolution: ${stats.resolution}`);
    console.log(`Pixel Ratio: ${stats.pixelRatio}`);
    console.log(`Antialias: ${stats.antialias}`);
    console.log(`Target FPS: ${stats.targetFPS}`);
    console.log('=====================');
}
