/**
 * AdaptiveQualitySystem - FPS-based quality preset switching
 *
 * Based on MOBILE-OPTIM.md recommended approach.
 * Uses well-tested quality presets that adjust ALL renderer parameters together
 * for smooth, predictable quality transitions.
 *
 * STRATEGY: Progressive culling WITHOUT stochastic mode
 * - Stochastic mode (sort-free rendering) causes grainy noise
 * - Instead: progressively cull more aggressively + reduce sorting frequency
 * - Result: Clean, smooth degradation with no grain/artifacts
 *
 * NO worldModifier usage - avoids conflicts with brush/paint system.
 */

import * as THREE from 'three';

export class AdaptiveQualitySystem {
    constructor(spark, renderer, targetFPS = 20) {
        this.spark = spark;
        this.renderer = renderer;
        this.targetFPS = targetFPS;

        // FPS tracking
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 60;
        this.fpsHistory = []; // Rolling average for stability

        // Quality presets from MOBILE-OPTIM.md
        // Each preset adjusts ALL parameters together for smooth scaling
        //
        // IMPORTANT STRATEGY: NO STOCHASTIC MODE
        // We do NOT use stochastic (sort-free) rendering because it introduces grainy noise.
        // Instead, we progressively degrade quality by being more aggressive with:
        // - maxStdDev: Reduce splat footprint (smaller rendered size)
        // - minPixelRadius: Cull smaller splats more aggressively
        // - minAlpha: Cull transparent splats more aggressively
        // - falloff: Flatten Gaussian shading (less smooth, more performant)
        // - sortDistance: Reduce sorting frequency (but keep sorting for clean look)
        // - clipXY: Tighter frustum culling
        //
        // Result: Smooth, clean degradation from Ultra → Potato with NO grain/noise
        //
        this.qualityPresets = [
            {
                name: 'Ultra',
                maxStdDev: Math.sqrt(8),      // 2.83 - largest splat footprint
                minPixelRadius: 0.0,           // Show all splats
                maxPixelRadius: 512.0,         // Full size cap
                minAlpha: 0.5 / 255.0,         // Show very transparent splats
                clipXY: 1.4,                   // Generous frustum culling
                falloff: 1.0,                  // Full Gaussian falloff
                stochastic: false,             // Sorted rendering (best quality)
                sortDistance: 0.01,            // Frequent sorting
                sortCoorient: 0.99,            // Tight orientation threshold
                pixelRatio: 2.0                // High DPI
            },
            {
                name: 'High',
                maxStdDev: Math.sqrt(7),      // 2.65
                minPixelRadius: 0.3,           // Cull tiny splats
                maxPixelRadius: 384.0,
                minAlpha: 0.7 / 255.0,
                clipXY: 1.3,
                falloff: 0.95,
                stochastic: false,
                sortDistance: 0.02,
                sortCoorient: 0.99,
                pixelRatio: 1.5
            },
            {
                name: 'Medium',
                maxStdDev: Math.sqrt(6),      // 2.45
                minPixelRadius: 0.5,
                maxPixelRadius: 256.0,
                minAlpha: 1.0 / 255.0,
                clipXY: 1.2,
                falloff: 0.85,
                stochastic: false,
                sortDistance: 0.05,
                sortCoorient: 0.97,
                pixelRatio: 1.5
            },
            {
                name: 'Low',
                maxStdDev: Math.sqrt(5),      // 2.24 - smaller footprint (continued from Medium)
                minPixelRadius: 0.8,           // More aggressive tiny splat culling
                maxPixelRadius: 192.0,
                minAlpha: 1.8 / 255.0,         // Cull more transparent splats
                clipXY: 1.1,                   // Tighter frustum culling
                falloff: 0.70,                 // Flatter shading (continued from Medium 0.85)
                stochastic: false,             // NEVER enable - causes grainy noise!
                sortDistance: 0.08,            // Less frequent sorting (but still sorted for clean look)
                sortCoorient: 0.96,
                pixelRatio: 1.0
            },
            {
                name: 'Potato',
                maxStdDev: Math.sqrt(4.5),    // 2.12 - even smaller footprint
                minPixelRadius: 1.2,           // Very aggressive culling of tiny splats
                maxPixelRadius: 128.0,
                minAlpha: 2.5 / 255.0,         // Cull very transparent splats
                clipXY: 1.0,                   // Tight frustum culling
                falloff: 0.60,                 // Very flat shading (maximum performance)
                stochastic: false,             // NEVER enable - causes grainy noise!
                sortDistance: 0.15,            // Least frequent sorting (but still sorted for clean look)
                sortCoorient: 0.93,
                pixelRatio: 1.0
            }
        ];

        // Current quality index (start at best quality)
        this.currentQualityIndex = 0;

        // Manual mode flag - when true, automatic adjustment is disabled
        this.manualMode = false;

        // Store original pixel ratio
        this.originalPixelRatio = this.renderer.getPixelRatio();

        // Apply initial quality
        this.applyQualityPreset(this.currentQualityIndex);

        console.log('[AdaptiveQuality] Initialized - Starting at Ultra quality');
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

            // Add to rolling average (last 3 samples for stability)
            this.fpsHistory.push(this.fps);
            if (this.fpsHistory.length > 3) this.fpsHistory.shift();

            const avgFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

            // Adjust quality based on FPS (only if not in manual mode)
            if (!this.manualMode) {
                this.adjustQuality(avgFPS);
            }
        }
    }

    adjustQuality(avgFPS) {
        const hysteresis = 5; // Prevent oscillation
        const previousIndex = this.currentQualityIndex;

        // Reduce quality if FPS too low
        if (avgFPS < this.targetFPS - hysteresis &&
            this.currentQualityIndex < this.qualityPresets.length - 1) {
            this.currentQualityIndex++;
            this.applyQualityPreset(this.currentQualityIndex);
            console.log(
                `[AdaptiveQuality] ↓ Reduced to: ${this.getCurrentQualityName()} ` +
                `(FPS: ${avgFPS.toFixed(1)} / Target: ${this.targetFPS})`
            );
        }

        // Increase quality if FPS stable and high (with larger margin)
        if (avgFPS > this.targetFPS + hysteresis * 2 &&
            this.currentQualityIndex > 0) {
            this.currentQualityIndex--;
            this.applyQualityPreset(this.currentQualityIndex);
            console.log(
                `[AdaptiveQuality] ↑ Increased to: ${this.getCurrentQualityName()} ` +
                `(FPS: ${avgFPS.toFixed(1)} / Target: ${this.targetFPS})`
            );
        }
    }

    applyQualityPreset(index) {
        const preset = this.qualityPresets[index];

        // NOTE: We do NOT touch antialiasing - it's set once at renderer creation and cannot be changed
        // Antialiasing is ALWAYS false for splat performance (20-40% FPS gain)

        // Update ALL SparkRenderer parameters together for smooth scaling
        this.spark.maxStdDev = preset.maxStdDev;
        this.spark.minPixelRadius = preset.minPixelRadius;
        this.spark.maxPixelRadius = preset.maxPixelRadius;
        this.spark.minAlpha = preset.minAlpha;
        this.spark.clipXY = preset.clipXY;
        this.spark.falloff = preset.falloff;

        // Update sorting parameters
        this.spark.defaultView.stochastic = preset.stochastic;
        this.spark.defaultView.sortDistance = preset.sortDistance;
        this.spark.defaultView.sortCoorient = preset.sortCoorient;

        // Update pixel ratio (clamped to original)
        const targetPixelRatio = Math.min(this.originalPixelRatio, preset.pixelRatio);
        this.renderer.setPixelRatio(targetPixelRatio);

        console.log(`[AdaptiveQuality] Applied preset: ${preset.name}`, {
            maxStdDev: preset.maxStdDev.toFixed(2),
            minPixelRadius: preset.minPixelRadius,
            stochastic: preset.stochastic,
            pixelRatio: targetPixelRatio.toFixed(1)
        });
    }

    // Manual quality controls (disables automatic adjustment)
    increaseQuality() {
        if (this.currentQualityIndex > 0) {
            this.manualMode = true;
            this.currentQualityIndex--;
            this.applyQualityPreset(this.currentQualityIndex);
            console.log(`[AdaptiveQuality] Manual increase to: ${this.getCurrentQualityName()} (Adaptive DISABLED)`);
        }
    }

    decreaseQuality() {
        if (this.currentQualityIndex < this.qualityPresets.length - 1) {
            this.manualMode = true;
            this.currentQualityIndex++;
            this.applyQualityPreset(this.currentQualityIndex);
            console.log(`[AdaptiveQuality] Manual decrease to: ${this.getCurrentQualityName()} (Adaptive DISABLED)`);
        }
    }

    setQualityByName(name) {
        const index = this.qualityPresets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
        if (index !== -1) {
            this.currentQualityIndex = index;
            this.applyQualityPreset(this.currentQualityIndex);
            console.log(`[AdaptiveQuality] Set to: ${this.getCurrentQualityName()}`);
        }
    }

    resumeAdaptive() {
        this.manualMode = false;
        console.log('[AdaptiveQuality] Resumed adaptive quality adjustment');
        console.log(`[AdaptiveQuality] Current quality: ${this.getCurrentQualityName()} (will adjust based on FPS)`);
    }

    // Getters for UI
    getFPS() {
        return this.fps;
    }

    getCurrentQualityName() {
        return this.qualityPresets[this.currentQualityIndex].name;
    }

    getCurrentQualityIndex() {
        return this.currentQualityIndex;
    }

    getQualityPresets() {
        return this.qualityPresets.map(p => p.name);
    }

    isManualMode() {
        return this.manualMode;
    }

    getStats() {
        const preset = this.qualityPresets[this.currentQualityIndex];
        return {
            fps: this.fps,
            qualityName: preset.name,
            qualityIndex: this.currentQualityIndex,
            maxStdDev: preset.maxStdDev.toFixed(2),
            minPixelRadius: preset.minPixelRadius,
            stochastic: preset.stochastic,
            pixelRatio: this.renderer.getPixelRatio().toFixed(1),
            targetFPS: this.targetFPS
        };
    }
}
