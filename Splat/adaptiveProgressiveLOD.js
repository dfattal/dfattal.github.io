/**
 * AdaptiveProgressiveLOD - Dynamic feedback loop system for Gaussian splat decimation
 *
 * Key features:
 * - Starts at full quality (decimationLevel = 0.0)
 * - Gradually introduces decimation as FPS drops below target
 * - Progressive distance tiers: near splats preserved, far splats decimated more
 * - Size compensation: decimated splats scale up to maintain visual coverage (DOF effect)
 * - Conservative quality recovery when FPS improves
 */

import * as THREE from 'three';
import { dyno } from '@sparkjsdev/spark';

export class AdaptiveProgressiveLOD {
    constructor(splatMesh, spark, camera, targetFPS = 20, options = {}) {
        this.splatMesh = splatMesh;
        this.spark = spark;
        this.camera = camera;
        this.targetFPS = targetFPS;

        // Options
        this.applyShaderDecimation = options.applyShaderDecimation !== false; // Default true

        // Core state: 0.0 = no decimation (full quality), 1.0 = maximum decimation
        this.decimationLevel = 0.0;

        // FPS tracking
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 60;
        this.fpsHistory = []; // Rolling average for stability

        // Distance tier boundaries (units from camera)
        this.tierDistances = [0, 10, 20, 40, 80, Infinity];

        // Uniforms for GPU shader (dynamically updated)
        this.decimationLevelUniform = new dyno.DynoFloat({ value: 0.0 });
        this.cameraPosUniform = new dyno.DynoVec3({ value: [0, 0, 0] });

        // Tier decimation factors (calculated from decimationLevel)
        this.tierDecimationFactors = [1, 1, 1, 1, 1]; // Updated each frame

        // Optimization thresholds
        this.stochasticEnabled = false;
        this.originalPixelRatio = this.spark.renderer.getPixelRatio();
        this.originalMinPixelRadius = this.spark.minPixelRadius;
        this.originalMaxStdDev = this.spark.maxStdDev;

        // Debug stats
        this.stats = {
            totalSplats: 0,
            visibleSplatsEstimate: 0,
            decimationChanges: 0
        };

        // Setup shader modifier (only if enabled)
        if (this.applyShaderDecimation) {
            this.setupModifier();
            console.log('[AdaptiveProgressiveLOD] Initialized with shader decimation - Starting at full quality (decimationLevel: 0.0)');
        } else {
            console.log('[AdaptiveProgressiveLOD] Initialized without shader decimation (threshold optimizations only)');
        }
    }

    setupModifier() {
        // Wait for splat mesh to initialize before applying modifier
        if (!this.splatMesh.packedSplats) {
            this.splatMesh.addEventListener('initialized', () => {
                this.stats.totalSplats = this.splatMesh.packedSplats.numSplats;
                this.applyWorldModifier();
                console.log(`[AdaptiveProgressiveLOD] Shader applied to ${this.stats.totalSplats.toLocaleString()} splats`);
            });
        } else {
            this.stats.totalSplats = this.splatMesh.packedSplats.numSplats;
            this.applyWorldModifier();
        }
    }

    applyWorldModifier() {
        this.splatMesh.worldModifier = dyno.dynoBlock(
            { gsplat: dyno.Gsplat },
            { gsplat: dyno.Gsplat },
            ({ gsplat }) => {
                const d = new dyno.Dyno({
                    inTypes: {
                        gsplat: dyno.Gsplat,
                        decimationLevel: "float",
                        cameraPos: "vec3"
                    },
                    outTypes: { gsplat: dyno.Gsplat },
                    statements: ({ inputs, outputs }) => {
                        const { gsplat, decimationLevel, cameraPos } = inputs;
                        const { gsplat: outGsplat } = outputs;

                        return dyno.unindentLines(`
                            ${outGsplat} = ${gsplat};

                            // Calculate distance from camera to splat center
                            float distance = length(${outGsplat}.center - ${cameraPos});

                            // Determine distance tier and decimation factor
                            // Tier 1 (0-10u):   no decimation (always)
                            // Tier 2 (10-20u):  decimation = 1 + floor(level * 3)   max 4x
                            // Tier 3 (20-40u):  decimation = 1 + floor(level * 7)   max 8x
                            // Tier 4 (40-80u):  decimation = 1 + floor(level * 15)  max 16x
                            // Tier 5 (80+u):    decimation = 1 + floor(level * 31)  max 32x

                            int decimationFactor = 1;
                            float sizeCompensation = 1.0;

                            if (distance < 10.0) {
                                // Tier 1: Always full quality
                                decimationFactor = 1;
                                sizeCompensation = 1.0;
                            } else if (distance < 20.0) {
                                // Tier 2: Progressive up to 4x
                                decimationFactor = 1 + int(floor(${decimationLevel} * 3.0));
                                sizeCompensation = float(decimationFactor);
                            } else if (distance < 40.0) {
                                // Tier 3: Progressive up to 8x
                                decimationFactor = 1 + int(floor(${decimationLevel} * 7.0));
                                sizeCompensation = float(decimationFactor);
                            } else if (distance < 80.0) {
                                // Tier 4: Progressive up to 16x
                                decimationFactor = 1 + int(floor(${decimationLevel} * 15.0));
                                sizeCompensation = float(decimationFactor);
                            } else {
                                // Tier 5: Progressive up to 32x
                                decimationFactor = 1 + int(floor(${decimationLevel} * 31.0));
                                sizeCompensation = float(decimationFactor);
                            }

                            // Decimate: Keep only every Nth splat
                            if (decimationFactor > 1 && int(${gsplat}.index) % decimationFactor != 0) {
                                ${outGsplat}.flags = 0u; // Mark as inactive (culled)
                            } else {
                                // Size compensation: Scale up splat to maintain coverage
                                // This creates an artificial depth-of-field effect
                                if (sizeCompensation > 1.0) {
                                    ${outGsplat}.cov3d.row0 *= sizeCompensation;
                                    ${outGsplat}.cov3d.row1 *= sizeCompensation;
                                    ${outGsplat}.cov3d.row2 *= sizeCompensation;
                                }
                            }
                        `);
                    }
                });

                gsplat = d.apply({
                    gsplat,
                    decimationLevel: this.decimationLevelUniform,
                    cameraPos: this.cameraPosUniform
                }).gsplat;

                return { gsplat };
            }
        );
    }

    update() {
        // Update FPS tracking
        this.frameCount++;
        const currentTime = performance.now();

        if (currentTime >= this.lastTime + 1000) {
            // Calculate FPS
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;

            // Add to rolling average (last 3 samples)
            this.fpsHistory.push(this.fps);
            if (this.fpsHistory.length > 3) this.fpsHistory.shift();

            const avgFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

            // Apply feedback loop to adjust decimation level
            this.applyFeedbackLoop(avgFPS);
        }

        // Update camera position uniform (every frame for smooth decimation)
        this.cameraPosUniform.value = [
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z
        ];

        // Update tier decimation factors for display
        this.updateTierDecimationFactors();
    }

    applyFeedbackLoop(avgFPS) {
        const previousLevel = this.decimationLevel;

        // Feedback logic: Adjust decimation based on FPS
        if (avgFPS < 18) {
            // Panic mode: Quick response to very low FPS
            this.decimationLevel += 0.15;
        } else if (avgFPS < this.targetFPS) {
            // Gradual increase when below target
            this.decimationLevel += 0.05;
        } else if (avgFPS > this.targetFPS + 10) {
            // Slow quality recovery when FPS is comfortable
            this.decimationLevel -= 0.03;
        } else if (avgFPS > this.targetFPS + 5) {
            // Very conservative recovery
            this.decimationLevel -= 0.01;
        }

        // Clamp to valid range
        this.decimationLevel = Math.max(0.0, Math.min(1.0, this.decimationLevel));

        // Update uniform for GPU shader
        this.decimationLevelUniform.value = this.decimationLevel;

        // Log changes
        if (Math.abs(this.decimationLevel - previousLevel) > 0.001) {
            this.stats.decimationChanges++;
            console.log(
                `[AdaptiveLOD] FPS: ${avgFPS.toFixed(1)} | ` +
                `Decimation: ${(this.decimationLevel * 100).toFixed(1)}% | ` +
                `Direction: ${this.decimationLevel > previousLevel ? '↑ Reducing quality' : '↓ Improving quality'}`
            );

            // Apply threshold-based optimizations
            this.applyThresholdOptimizations();
        }
    }

    applyThresholdOptimizations() {
        // Enable stochastic mode at decimationLevel > 0.3 (eliminate sorting overhead)
        if (this.decimationLevel > 0.3 && !this.stochasticEnabled) {
            this.spark.defaultView.stochastic = true;
            this.stochasticEnabled = true;
            console.log('[AdaptiveLOD] Enabled stochastic mode (sort-free rendering)');
        } else if (this.decimationLevel <= 0.3 && this.stochasticEnabled) {
            this.spark.defaultView.stochastic = false;
            this.stochasticEnabled = false;
            console.log('[AdaptiveLOD] Disabled stochastic mode');
        }

        // Reduce pixel ratio at decimationLevel > 0.5
        if (this.decimationLevel > 0.5) {
            this.spark.renderer.setPixelRatio(1.0);
        } else {
            this.spark.renderer.setPixelRatio(this.originalPixelRatio);
        }

        // Increase minPixelRadius at decimationLevel > 0.7 (cull tiny splats)
        if (this.decimationLevel > 0.7) {
            this.spark.minPixelRadius = Math.max(this.originalMinPixelRadius, 0.7);
        } else {
            this.spark.minPixelRadius = this.originalMinPixelRadius;
        }

        // Reduce maxStdDev at decimationLevel > 0.8 (smaller splat footprint)
        if (this.decimationLevel > 0.8) {
            this.spark.maxStdDev = Math.sqrt(5);
        } else {
            this.spark.maxStdDev = this.originalMaxStdDev;
        }
    }

    updateTierDecimationFactors() {
        // Calculate current decimation factor for each tier based on decimationLevel
        this.tierDecimationFactors = [
            1, // Tier 1: Always no decimation
            1 + Math.floor(this.decimationLevel * 3),  // Tier 2: 1-4x
            1 + Math.floor(this.decimationLevel * 7),  // Tier 3: 1-8x
            1 + Math.floor(this.decimationLevel * 15), // Tier 4: 1-16x
            1 + Math.floor(this.decimationLevel * 31)  // Tier 5: 1-32x
        ];

        // Estimate visible splats (rough approximation)
        let visiblePercent = 0;
        for (let i = 0; i < 5; i++) {
            const tierWeight = i === 0 ? 0.3 : (i === 1 ? 0.25 : (i === 2 ? 0.2 : (i === 3 ? 0.15 : 0.1)));
            visiblePercent += tierWeight / this.tierDecimationFactors[i];
        }
        this.stats.visibleSplatsEstimate = Math.round(this.stats.totalSplats * visiblePercent);
    }

    // Manual controls for testing
    increaseDecimation(amount = 0.1) {
        this.decimationLevel = Math.min(1.0, this.decimationLevel + amount);
        this.decimationLevelUniform.value = this.decimationLevel;
        this.applyThresholdOptimizations();
        console.log(`[AdaptiveLOD] Manual increase: decimationLevel = ${(this.decimationLevel * 100).toFixed(1)}%`);
    }

    decreaseDecimation(amount = 0.1) {
        this.decimationLevel = Math.max(0.0, this.decimationLevel - amount);
        this.decimationLevelUniform.value = this.decimationLevel;
        this.applyThresholdOptimizations();
        console.log(`[AdaptiveLOD] Manual decrease: decimationLevel = ${(this.decimationLevel * 100).toFixed(1)}%`);
    }

    resetToFullQuality() {
        this.decimationLevel = 0.0;
        this.decimationLevelUniform.value = 0.0;
        this.applyThresholdOptimizations();
        console.log('[AdaptiveLOD] Reset to full quality');
    }

    // Getters for debug UI
    getFPS() {
        return this.fps;
    }

    getDecimationLevel() {
        return this.decimationLevel;
    }

    getDecimationPercent() {
        return (this.decimationLevel * 100).toFixed(1);
    }

    getTierDecimationFactors() {
        return this.tierDecimationFactors;
    }

    getVisibleSplatEstimate() {
        return this.stats.visibleSplatsEstimate;
    }

    getTotalSplats() {
        return this.stats.totalSplats;
    }

    getStats() {
        return {
            fps: this.fps,
            decimationLevel: this.decimationLevel,
            decimationPercent: (this.decimationLevel * 100).toFixed(1),
            tierFactors: this.tierDecimationFactors,
            totalSplats: this.stats.totalSplats,
            visibleSplats: this.stats.visibleSplatsEstimate,
            visiblePercent: ((this.stats.visibleSplatsEstimate / this.stats.totalSplats) * 100).toFixed(1),
            stochasticEnabled: this.stochasticEnabled,
            decimationChanges: this.stats.decimationChanges
        };
    }
}
