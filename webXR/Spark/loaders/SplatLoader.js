/**
 * SplatLoader - Loader for standard .splat Gaussian Splat format
 *
 * The .splat format is a binary format where each splat is stored as:
 * - Position (xyz): 3 floats (12 bytes)
 * - Scale (xyz): 3 floats (12 bytes)
 * - Color (rgba): 4 bytes
 * - Rotation (quaternion): 4 floats (16 bytes)
 *
 * Total: 44 bytes per splat
 */

import * as THREE from 'three';

export class SplatLoader {
    constructor() {
        this.onProgress = null;
    }

    /**
     * Load a .splat file
     * @param {string} url - URL or path to .splat file
     * @param {function} onLoad - Callback when loading is complete
     * @param {function} onProgress - Callback for progress updates
     * @param {function} onError - Callback for errors
     */
    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader();
        loader.setResponseType('arraybuffer');

        loader.load(
            url,
            (data) => {
                try {
                    const splat = this.parse(data);
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
     * Parse .splat binary data
     * @param {ArrayBuffer} buffer - Raw binary data
     * @returns {THREE.Points} - Three.js Points object with splat data
     */
    parse(buffer) {
        const BYTES_PER_SPLAT = 44;
        const splatCount = buffer.byteLength / BYTES_PER_SPLAT;

        console.log(`Parsing ${splatCount} splats from binary data`);

        if (buffer.byteLength % BYTES_PER_SPLAT !== 0) {
            console.warn(`Warning: Buffer size not divisible by ${BYTES_PER_SPLAT}, file may be corrupted`);
        }

        const dataView = new DataView(buffer);
        const positions = new Float32Array(splatCount * 3);
        const colors = new Float32Array(splatCount * 3);
        const sizes = new Float32Array(splatCount);

        let offset = 0;

        for (let i = 0; i < splatCount; i++) {
            const i3 = i * 3;

            // Read position (xyz)
            positions[i3] = dataView.getFloat32(offset, true);
            positions[i3 + 1] = dataView.getFloat32(offset + 4, true);
            positions[i3 + 2] = dataView.getFloat32(offset + 8, true);
            offset += 12;

            // Read scale (xyz) - use average as point size
            const scaleX = dataView.getFloat32(offset, true);
            const scaleY = dataView.getFloat32(offset + 4, true);
            const scaleZ = dataView.getFloat32(offset + 8, true);
            sizes[i] = (scaleX + scaleY + scaleZ) / 3.0;
            offset += 12;

            // Read color (rgba)
            const r = dataView.getUint8(offset);
            const g = dataView.getUint8(offset + 1);
            const b = dataView.getUint8(offset + 2);
            // const a = dataView.getUint8(offset + 3); // Alpha not used for now
            colors[i3] = r / 255;
            colors[i3 + 1] = g / 255;
            colors[i3 + 2] = b / 255;
            offset += 4;

            // Skip rotation (quaternion) for now - 16 bytes
            // TODO: Apply rotation to splats if needed
            offset += 16;
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Compute bounding sphere for proper camera framing
        geometry.computeBoundingSphere();

        // Create material
        const material = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
        });

        // Create points object
        const points = new THREE.Points(geometry, material);
        points.name = 'GaussianSplat';

        console.log(`Created splat with ${splatCount} points`);
        console.log(`Bounding sphere radius: ${geometry.boundingSphere.radius}`);

        return points;
    }
}
