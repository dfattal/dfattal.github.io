/**
 * AudioManager - Handles all audio playback including background music, movement, and jetpack sounds
 *
 * iOS-FRIENDLY "PLAY-ONCE, FADE-ONLY" STRATEGY:
 * - All looped sounds (background music, running, jetpack) start playing at volume 0 during unlock
 * - They NEVER pause - only volume changes (0 = silent, >0 = audible)
 * - This avoids iOS restrictions on repeated play()/pause() calls
 * - One-shot sounds (magic reveal) use traditional play() when needed
 *
 * Features:
 * - Background music with looping
 * - Running sound (walking sound skipped on mobile)
 * - Jetpack sound with fade in/out
 * - Smooth volume fading for all sounds
 * - Mobile-optimized audio handling
 */
export class AudioManager {
    // Audio elements
    backgroundMusic = null;
    walkingSound = null;      // Desktop only
    runningSound = null;
    jetpackSound = null;      // Moved from CharacterControls
    magicRevealSound = null;  // One-shot, non-looped

    // Platform detection
    isMobile = false;

    // Audio state
    backgroundMusicEnabled = true;
    movementSoundsEnabled = true;

    // Volume settings
    backgroundMusicVolume = 0.3;
    walkingSoundVolume = 0.25;
    runningSoundVolume = 0.3;
    jetpackVolume = 0.5;
    magicRevealVolume = 0.6;
    fadeSpeed = 2.0;  // Volume fade speed (units per second)

    // Target volumes for smooth fading (current volume fades to target)
    backgroundMusicTarget = 0;
    walkingSoundTarget = 0;
    runningSoundTarget = 0;
    jetpackTarget = 0;

    // Movement state tracking (to detect transitions)
    currentMovementState = 'idle';  // 'idle', 'walk', 'run', 'jetpack'
    previousMovementState = 'idle';

    // iOS audio unlock flag
    audioUnlocked = false;
    loopedSoundsStarted = false;  // Flag to ensure looped sounds start only once

    /**
     * Initialize AudioManager with audio file paths
     * @param {Object} config - Audio configuration object with paths
     * @param {boolean} isMobile - Mobile device detection
     */
    constructor(config = {}, isMobile = false) {
        this.config = config;
        this.isMobile = isMobile;

        // Initialize audio elements
        this.initBackgroundMusic(config.backgroundMusic);
        this.initMovementSounds(config.walkingSound, config.runningSound);
        this.initJetpackSound(config.jetpackSound);
        this.initMagicRevealSound(config.magicReveal);

        console.log('AudioManager initialized with config:', config);
        console.log('Mobile mode:', isMobile);
    }

    /**
     * Initialize background music
     */
    initBackgroundMusic(path) {
        if (!path) return;

        try {
            this.backgroundMusic = new Audio(path);
            this.backgroundMusic.loop = true;
            this.backgroundMusic.volume = 0;
            console.log('Background music loaded from:', path);
        } catch (error) {
            console.error('Error loading background music:', error);
        }
    }

    /**
     * Initialize movement sounds (walking and running)
     */
    initMovementSounds(walkingPath, runningPath) {
        // Walking sound (desktop only - mobile doesn't need it)
        if (walkingPath && !this.isMobile) {
            try {
                this.walkingSound = new Audio(walkingPath);
                this.walkingSound.loop = true;
                this.walkingSound.volume = 0;
                console.log('Walking sound loaded from:', walkingPath);
            } catch (error) {
                console.error('Error loading walking sound:', error);
            }
        }

        // Running sound (both desktop and mobile)
        if (runningPath) {
            try {
                this.runningSound = new Audio(runningPath);
                this.runningSound.loop = true;
                this.runningSound.volume = 0;
                console.log('Running sound loaded from:', runningPath);
            } catch (error) {
                console.error('Error loading running sound:', error);
            }
        }
    }

    /**
     * Initialize jetpack sound (looped with fade)
     */
    initJetpackSound(path) {
        if (!path) return;

        try {
            this.jetpackSound = new Audio(path);
            this.jetpackSound.loop = true;
            this.jetpackSound.volume = 0;
            console.log('Jetpack sound loaded from:', path);
        } catch (error) {
            console.error('Error loading jetpack sound:', error);
        }
    }

    /**
     * Initialize magic reveal sound (one-shot, no loop)
     */
    initMagicRevealSound(path) {
        if (!path) return;

        try {
            this.magicRevealSound = new Audio(path);
            this.magicRevealSound.loop = false;  // One-shot sound
            this.magicRevealSound.volume = this.magicRevealVolume;
            console.log('Magic reveal sound loaded from:', path);
        } catch (error) {
            console.error('Error loading magic reveal sound:', error);
        }
    }

    /**
     * Unlock and start all looped audio (iOS-friendly approach)
     * Must be called directly from a user interaction event handler
     *
     * CRITICAL: All looped sounds start playing at volume 0 and never stop
     * Only volume changes - this is the iOS-friendly pattern
     */
    async unlockAudio() {
        if (this.audioUnlocked) {
            console.log('Audio already unlocked, skipping');
            return;
        }

        console.log('Unlocking audio for iOS (play-once, fade-only strategy)...');

        // Looped sounds: Start playing at volume 0, never stop
        const loopedSounds = [
            { audio: this.backgroundMusic, name: 'background music' },
            { audio: this.walkingSound, name: 'walking sound' },
            { audio: this.runningSound, name: 'running sound' },
            { audio: this.jetpackSound, name: 'jetpack sound' }
        ];

        // One-shot sounds: Just unlock them (play briefly then pause)
        const oneshotSounds = [
            { audio: this.magicRevealSound, name: 'magic reveal' }
        ];

        const unlockPromises = [];

        // Start all looped sounds at volume 0 (they'll play forever, controlled by volume)
        for (const { audio, name } of loopedSounds) {
            if (!audio) continue;

            unlockPromises.push(
                (async () => {
                    try {
                        // CRITICAL: Set volume to 0 BEFORE loop is set
                        // iOS can sometimes start playback with wrong volume if done in wrong order
                        audio.volume = 0;

                        // Verify volume is actually 0
                        if (audio.volume !== 0) {
                            console.warn(`${name} volume not 0, forcing it`);
                            audio.volume = 0;
                        }

                        audio.loop = true;

                        // Start playing - this will continue forever at various volumes
                        await audio.play();

                        // Double-check volume after play starts (iOS safety)
                        if (audio.volume !== 0) {
                            console.warn(`${name} volume changed during play(), resetting to 0`);
                            audio.volume = 0;
                        }

                        console.log(`✓ Looped audio started: ${name} (volume: ${audio.volume})`);
                    } catch (err) {
                        console.warn(`Could not start looped audio ${name}:`, err);
                    }
                })()
            );
        }

        // Unlock one-shot sounds (play briefly then pause)
        for (const { audio, name } of oneshotSounds) {
            if (!audio) continue;

            unlockPromises.push(
                (async () => {
                    try {
                        const originalVolume = audio.volume;
                        audio.volume = 0;

                        await audio.play();
                        audio.pause();
                        audio.currentTime = 0;
                        audio.volume = originalVolume;

                        console.log(`✓ One-shot audio unlocked: ${name}`);
                    } catch (err) {
                        console.warn(`Could not unlock one-shot audio ${name}:`, err);
                    }
                })()
            );
        }

        // Wait for all audio to be unlocked/started
        await Promise.all(unlockPromises);

        this.audioUnlocked = true;
        this.loopedSoundsStarted = true;
        console.log('✓ All audio unlocked - looped sounds playing at volume 0');
    }

    /**
     * Play magic reveal sound (one-shot)
     * @param {number} delay - Delay in seconds before playing (default: 0)
     */
    playMagicReveal(delay = 0) {
        if (!this.magicRevealSound) return;

        if (delay > 0) {
            setTimeout(() => {
                this.magicRevealSound.currentTime = 0;
                this.magicRevealSound.volume = this.magicRevealVolume;
                this.magicRevealSound.play().catch(err => {
                    console.warn('Could not play magic reveal sound:', err);
                });
            }, delay * 1000);
        } else {
            this.magicRevealSound.currentTime = 0;
            this.magicRevealSound.volume = this.magicRevealVolume;
            this.magicRevealSound.play().catch(err => {
                console.warn('Could not play magic reveal sound:', err);
            });
        }
    }

    /**
     * Start background music (sets target volume to fade in)
     */
    startBackgroundMusic() {
        if (!this.backgroundMusic || !this.backgroundMusicEnabled) return;
        this.backgroundMusicTarget = this.backgroundMusicVolume;
        console.log('Background music fading in');
    }

    /**
     * Stop background music (sets target volume to fade out)
     */
    stopBackgroundMusic() {
        if (!this.backgroundMusic) return;
        this.backgroundMusicTarget = 0;
        console.log('Background music fading out');
    }

    /**
     * Update movement sounds based on character state
     * @param {string} state - Current movement state: 'idle', 'walk', 'run', 'jetpack'
     */
    updateMovementSounds(state) {
        // Store previous state
        this.previousMovementState = this.currentMovementState;
        this.currentMovementState = state;

        // Detect state transitions
        const stateChanged = this.previousMovementState !== this.currentMovementState;

        if (stateChanged) {
            console.log(`Movement state changed: ${this.previousMovementState} -> ${state}`);
        }

        // Early exit if sounds disabled
        if (!this.movementSoundsEnabled) {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
            return;
        }

        // Set target volumes based on state (audio is already playing, just change volume)
        if (state === 'walk') {
            // Walking state (desktop only)
            if (!this.isMobile && this.walkingSound) {
                this.walkingSoundTarget = this.walkingSoundVolume;
            }
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
        } else if (state === 'run') {
            // Running state
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = this.runningSoundVolume;
            this.jetpackTarget = 0;
            if (stateChanged) {
                console.log(`Setting running sound target to ${this.runningSoundVolume}`);
            }
        } else if (state === 'jetpack') {
            // Jetpack state (airborne with thrust)
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = this.jetpackVolume;
        } else {
            // Idle state - all movement sounds silent
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
            if (stateChanged) {
                console.log('Setting all sound targets to 0 (idle)');
            }
        }
    }

    /**
     * Update audio volumes with smooth fading
     * Called every frame from main animation loop
     * @param {number} delta - Time since last frame in seconds
     */
    update(delta) {
        // Update all audio volumes (they're already playing, just change volume)
        if (this.backgroundMusic) {
            this.updateVolume(this.backgroundMusic, this.backgroundMusicTarget, delta, 'background');
        }

        if (this.walkingSound && !this.isMobile) {
            this.updateVolume(this.walkingSound, this.walkingSoundTarget, delta, 'walking');
        }

        if (this.runningSound) {
            this.updateVolume(this.runningSound, this.runningSoundTarget, delta, 'running');
        }

        if (this.jetpackSound) {
            this.updateVolume(this.jetpackSound, this.jetpackTarget, delta, 'jetpack');
        }
    }

    /**
     * Update volume for a single audio element with smooth fading
     * @param {HTMLAudioElement} audio - Audio element to update
     * @param {number} targetVolume - Target volume (0-1)
     * @param {number} delta - Time delta in seconds
     * @param {string} name - Name for debugging
     *
     * NOTE: Audio is always playing (never paused) - we only change volume
     * This is the iOS-friendly "play-once, fade-only" pattern
     */
    updateVolume(audio, targetVolume, delta, name = 'unknown') {
        if (!audio) return;

        // Smooth fade to target volume
        if (audio.volume !== targetVolume) {
            const volumeDelta = this.fadeSpeed * delta;

            if (audio.volume < targetVolume) {
                // Fade in
                const newVolume = Math.min(targetVolume, audio.volume + volumeDelta);
                if (audio.volume === 0 && newVolume > 0) {
                    console.log(`${name} sound fading in from 0 to ${newVolume.toFixed(3)}`);
                }
                audio.volume = newVolume;
            } else {
                // Fade out
                const newVolume = Math.max(targetVolume, audio.volume - volumeDelta);
                if (newVolume === 0 && audio.volume > 0) {
                    console.log(`${name} sound faded to 0`);
                }
                audio.volume = newVolume;
            }
        }
    }

    /**
     * Toggle background music on/off
     */
    toggleBackgroundMusic() {
        this.backgroundMusicEnabled = !this.backgroundMusicEnabled;

        if (this.backgroundMusicEnabled) {
            this.startBackgroundMusic();
        } else {
            this.stopBackgroundMusic();
        }

        console.log('Background music:', this.backgroundMusicEnabled ? 'ON' : 'OFF');
    }

    /**
     * Toggle movement sounds on/off
     */
    toggleMovementSounds() {
        this.movementSoundsEnabled = !this.movementSoundsEnabled;

        if (!this.movementSoundsEnabled) {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
        }

        console.log('Movement sounds:', this.movementSoundsEnabled ? 'ON' : 'OFF');
    }

    /**
     * Set master volume for all sounds
     * @param {number} volume - Volume level (0-1)
     */
    setMasterVolume(volume) {
        const clampedVolume = Math.max(0, Math.min(1, volume));

        this.backgroundMusicVolume = clampedVolume * 0.3;
        this.walkingSoundVolume = clampedVolume * 0.25;
        this.runningSoundVolume = clampedVolume * 0.3;
        this.jetpackVolume = clampedVolume * 0.5;

        console.log('Master volume set to:', clampedVolume);
    }

    /**
     * Clean up audio resources
     */
    dispose() {
        // Stop all looped sounds
        const allSounds = [
            this.backgroundMusic,
            this.walkingSound,
            this.runningSound,
            this.jetpackSound,
            this.magicRevealSound
        ];

        allSounds.forEach(audio => {
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        });

        this.backgroundMusic = null;
        this.walkingSound = null;
        this.runningSound = null;
        this.jetpackSound = null;
        this.magicRevealSound = null;

        console.log('AudioManager disposed');
    }
}
