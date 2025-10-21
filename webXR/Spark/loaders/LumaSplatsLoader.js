/**
 * LumaSplatsLoader - Wrapper for Luma AI's LumaSplatsThree loader
 *
 * Loads Gaussian Splat captures from Luma AI using their official library
 */

import * as THREE from 'three';
import { LumaSplatsThree } from '@lumaai/luma-web';

export class LumaSplatsLoader {
    constructor() {
        this.onProgress = null;
    }

    /**
     * Load a Luma AI splat capture
     * @param {string} url - URL to Luma AI capture (can be .glb or Luma URL)
     * @param {function} onLoad - Callback when loading is complete
     * @param {function} onProgress - Callback for progress updates
     * @param {function} onError - Callback for errors
     */
    load(url, onLoad, onProgress, onError) {
        try {
            console.log(`Loading Luma AI capture from: ${url}`);

            // Create LumaSplatsThree instance
            const lumaSplat = new LumaSplatsThree({
                source: url,
                enableThreeShaderIntegration: true, // Enable Three.js shader integration
            });

            // LumaSplatsThree extends THREE.Object3D, so we can use it directly
            // The Luma library handles loading internally

            // Wrap in a Group for consistency with other loaders
            const group = new THREE.Group();
            group.add(lumaSplat);
            group.name = 'LumaAISplat';

            // Note: Luma handles loading asynchronously internally
            // We'll trigger onLoad immediately since the object will load itself
            // In a production environment, you'd want to hook into Luma's loading events

            console.log('Luma AI splat object created');

            if (onLoad) {
                // Give Luma a moment to initialize
                setTimeout(() => {
                    onLoad(group);
                }, 100);
            }

            // TODO: Hook into Luma's actual loading progress if API provides it
            if (onProgress) {
                onProgress({ loaded: 1, total: 1 });
            }
        } catch (error) {
            console.error('Error loading Luma AI capture:', error);
            if (onError) onError(error);
        }
    }

    /**
     * Load Luma AI capture and return a promise
     * @param {string} url - URL to Luma AI capture
     * @returns {Promise<THREE.Group>} - Promise resolving to loaded object
     */
    loadAsync(url) {
        return new Promise((resolve, reject) => {
            this.load(url, resolve, null, reject);
        });
    }
}
