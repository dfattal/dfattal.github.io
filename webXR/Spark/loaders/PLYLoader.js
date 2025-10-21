/**
 * PLYLoader - Loader for .ply Gaussian Splat format
 *
 * Wraps Three.js PLYLoader to load PLY point cloud files
 * and converts them to a format suitable for Gaussian Splat rendering
 */

import * as THREE from 'three';
import { PLYLoader as ThreePLYLoader } from 'three/addons/loaders/PLYLoader.js';

export class PLYLoader {
    constructor() {
        this.loader = new ThreePLYLoader();
    }

    /**
     * Load a .ply file
     * @param {string} url - URL or path to .ply file
     * @param {function} onLoad - Callback when loading is complete
     * @param {function} onProgress - Callback for progress updates
     * @param {function} onError - Callback for errors
     */
    load(url, onLoad, onProgress, onError) {
        this.loader.load(
            url,
            (geometry) => {
                try {
                    const splat = this.convertToSplat(geometry);
                    if (onLoad) onLoad(splat);
                } catch (error) {
                    if (onError) onError(error);
                }
            },
            onProgress,
            onError
        );
    }

    /**
     * Convert PLY geometry to Gaussian Splat representation
     * @param {THREE.BufferGeometry} geometry - Loaded PLY geometry
     * @returns {THREE.Points} - Three.js Points object
     */
    convertToSplat(geometry) {
        console.log('Converting PLY geometry to splat representation');
        console.log('Geometry attributes:', Object.keys(geometry.attributes));

        // Ensure geometry has positions
        if (!geometry.attributes.position) {
            throw new Error('PLY geometry missing position attribute');
        }

        const positions = geometry.attributes.position;
        const pointCount = positions.count;

        console.log(`PLY contains ${pointCount} points`);
        console.log('First 3 positions:', [
            positions.getX(0), positions.getY(0), positions.getZ(0)
        ]);

        // Check if geometry has colors, if not create white colors
        let colors = geometry.attributes.color;

        if (!colors) {
            console.log('PLY missing color data, using white');
            const colorArray = new Float32Array(pointCount * 3);
            colorArray.fill(1.0); // White
            colors = new THREE.BufferAttribute(colorArray, 3);
            geometry.setAttribute('color', colors);
        }

        // Create uniform sizes for all points
        const sizes = new Float32Array(pointCount);
        sizes.fill(0.05); // Default size
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Compute bounding sphere for camera positioning
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();

        // Create material with vertex colors
        const material = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
        });

        // Create points object
        const points = new THREE.Points(geometry, material);
        points.name = 'GaussianSplatPLY';

        console.log(`Created PLY splat with ${pointCount} points`);
        console.log(`Bounding sphere radius: ${geometry.boundingSphere.radius}`);

        if (geometry.boundingBox) {
            const size = new THREE.Vector3();
            geometry.boundingBox.getSize(size);
            console.log(`Bounding box size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
        }

        return points;
    }
}
