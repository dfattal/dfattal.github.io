/**
 * Scene Loader - Loads and manages scene configuration files
 */

/**
 * Load the scenes manifest file
 * @returns {Promise<Object>} Scenes manifest object
 */
export async function loadScenesManifest() {
    try {
        const response = await fetch('models/scenes.json');
        if (!response.ok) {
            throw new Error(`Failed to load scenes manifest: ${response.statusText}`);
        }
        const manifest = await response.json();
        console.log('Scenes manifest loaded:', manifest);
        return manifest;
    } catch (error) {
        console.error('Error loading scenes manifest:', error);
        throw error;
    }
}

/**
 * Load a scene configuration file
 * @param {string} configPath - Path to the scene config JSON file
 * @returns {Promise<Object>} Scene configuration object
 */
export async function loadSceneConfig(configPath) {
    try {
        const response = await fetch(configPath);
        if (!response.ok) {
            throw new Error(`Failed to load scene config from ${configPath}: ${response.statusText}`);
        }
        const config = await response.json();

        // Validate required fields
        validateSceneConfig(config);

        console.log(`Scene config loaded: ${config.name}`, config);
        return config;
    } catch (error) {
        console.error(`Error loading scene config from ${configPath}:`, error);
        throw error;
    }
}

/**
 * Validate scene configuration structure
 * @param {Object} config - Scene configuration object
 * @throws {Error} If configuration is invalid
 */
function validateSceneConfig(config) {
    const required = ['name', 'assets', 'transform', 'character', 'camera', 'lighting', 'scene'];

    for (const field of required) {
        if (!(field in config)) {
            throw new Error(`Scene config missing required field: ${field}`);
        }
    }

    // Validate assets
    if (!config.assets.splatFile || !config.assets.collisionFile || !config.assets.characterFile) {
        throw new Error('Scene config missing required asset files');
    }

    // Validate transform
    if (typeof config.transform.scale !== 'number') {
        throw new Error('Scene config: transform.scale must be a number');
    }

    console.log('Scene config validation passed');
}

/**
 * Get available scene IDs from manifest
 * @param {Object} manifest - Scenes manifest object
 * @returns {Array<string>} Array of scene IDs
 */
export function getAvailableScenes(manifest) {
    return manifest.scenes.map(scene => ({
        id: scene.id,
        name: scene.name,
        description: scene.description || ''
    }));
}

/**
 * Get default scene ID from manifest
 * @param {Object} manifest - Scenes manifest object
 * @returns {string} Default scene ID
 */
export function getDefaultScene(manifest) {
    return manifest.defaultScene || manifest.scenes[0]?.id || 'StoneHenge';
}

/**
 * Get scene config path by ID
 * @param {Object} manifest - Scenes manifest object
 * @param {string} sceneId - Scene ID
 * @returns {string|null} Config file path or null if not found
 */
export function getSceneConfigPath(manifest, sceneId) {
    const scene = manifest.scenes.find(s => s.id === sceneId);
    return scene ? scene.config : null;
}
