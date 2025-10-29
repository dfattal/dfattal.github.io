/**
 * AudioManager - Handles all audio playback including background music and movement sounds
 *
 * Features:
 * - Background music with looping
 * - Walking and running sound effects
 * - Automatic restart of movement sounds on state transitions
 * - Smooth volume fading for all sounds
 */
export class AudioManager {
    // Audio elements
    backgroundMusic = null;
    walkingSound = null;
    runningSound = null;
    magicRevealSound = null;

    // Audio state
    backgroundMusicEnabled = true;
    movementSoundsEnabled = true;

    // Volume settings
    backgroundMusicVolume = 0.3;  // Lower volume for background music
    walkingSoundVolume = 0.25;    // Dimmer walking sound
    runningSoundVolume = 0.3;     // Dimmer running sound
    magicRevealVolume = 0.6;
    fadeSpeed = 2.0;  // Volume fade speed (units per second)

    // Target volumes for smooth fading
    backgroundMusicTarget = 0;
    walkingSoundTarget = 0;
    runningSoundTarget = 0;

    // Movement state tracking (to detect transitions)
    currentMovementState = 'idle';  // 'idle', 'walk', 'run'
    previousMovementState = 'idle';

    // iOS audio unlock flag
    audioUnlocked = false;

    /**
     * Initialize AudioManager with audio file paths
     * @param {Object} config - Audio configuration object with paths
     */
    constructor(config = {}) {
        this.config = config;

        // Initialize audio elements
        this.initBackgroundMusic(config.backgroundMusic);
        this.initMovementSounds(config.walkingSound, config.runningSound);
        this.initMagicRevealSound(config.magicReveal);

        console.log('AudioManager initialized with config:', config);
    }

    /**
     * Initialize background music
     */
    initBackgroundMusic(path) {
        if (!path) return;

        try {
            this.backgroundMusic = new Audio(path);
            this.backgroundMusic.loop = true;
            this.backgroundMusic.volume = 0;  // Start at 0, will fade in
            console.log('Background music loaded from:', path);
        } catch (error) {
            console.error('Error loading background music:', error);
        }
    }

    /**
     * Initialize movement sounds (walking and running)
     */
    initMovementSounds(walkingPath, runningPath) {
        if (walkingPath) {
            try {
                this.walkingSound = new Audio(walkingPath);
                this.walkingSound.loop = true;
                this.walkingSound.volume = 0;
                console.log('Walking sound loaded from:', walkingPath);
            } catch (error) {
                console.error('Error loading walking sound:', error);
            }
        }

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
     * Play magic reveal sound (one-shot)
     * Restarts from beginning if already playing
     * @param {number} delay - Delay in seconds before playing (default: 0)
     */
    playMagicReveal(delay = 0) {
        if (!this.magicRevealSound) return;

        if (delay > 0) {
            // Play after delay
            setTimeout(() => {
                this.magicRevealSound.currentTime = 0;
                this.magicRevealSound.volume = this.magicRevealVolume;
                this.magicRevealSound.play().catch(err => {
                    console.warn('Could not play magic reveal sound:', err);
                });
            }, delay * 1000);
        } else {
            // Play immediately
            this.magicRevealSound.currentTime = 0;
            this.magicRevealSound.volume = this.magicRevealVolume;
            this.magicRevealSound.play().catch(err => {
                console.warn('Could not play magic reveal sound:', err);
            });
        }
    }

    /**
     * Unlock all audio elements for iOS
     * Must be called directly from a user interaction event handler
     */
    unlockAudio() {
        if (this.audioUnlocked) {
            console.log('Audio already unlocked, skipping');
            return;
        }

        console.log('Unlocking audio for iOS...');

        // Play each audio element briefly at zero volume to unlock it
        const audioElements = [
            this.backgroundMusic,
            this.walkingSound,
            this.runningSound,
            this.magicRevealSound
        ];

        audioElements.forEach(audio => {
            if (audio) {
                const originalVolume = audio.volume;
                audio.volume = 0;
                audio.play().then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = originalVolume;
                    console.log('Audio element unlocked');
                }).catch(err => {
                    console.warn('Could not unlock audio element:', err);
                });
            }
        });

        this.audioUnlocked = true;
        console.log('Audio unlocked successfully');
    }

    /**
     * Start background music (call after user interaction to comply with autoplay policies)
     */
    startBackgroundMusic() {
        if (!this.backgroundMusic || !this.backgroundMusicEnabled) return;

        this.backgroundMusicTarget = this.backgroundMusicVolume;

        if (this.backgroundMusic.paused) {
            this.backgroundMusic.play().catch(err => {
                console.warn('Could not play background music:', err);
            });
        }
    }

    /**
     * Stop background music
     */
    stopBackgroundMusic() {
        if (!this.backgroundMusic) return;
        this.backgroundMusicTarget = 0;
    }

    /**
     * Update movement sounds based on character state
     * @param {string} state - Current movement state: 'idle', 'walk', or 'run'
     * @param {boolean} isGrounded - Whether character is on the ground (unused - hysteresis handled by CharacterControls)
     */
    updateMovementSounds(state, isGrounded) {
        // The state already includes hysteresis logic from CharacterControls.getMovementState()
        // which prevents flickering during brief air moments (< 0.4s) when going downhill.
        // We trust that state and don't override it here.

        // Store previous state
        this.previousMovementState = this.currentMovementState;
        this.currentMovementState = state;

        // Detect state transitions - restart sound at each new walking/running session
        const stateChanged = this.previousMovementState !== this.currentMovementState;

        // Only play movement sounds if enabled
        if (!this.movementSoundsEnabled) {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            return;
        }

        if (state === 'walk') {
            // Walking state
            this.walkingSoundTarget = this.walkingSoundVolume;
            this.runningSoundTarget = 0;

            // Restart walking sound on state transition
            if (stateChanged && this.walkingSound) {
                this.walkingSound.currentTime = 0;
                if (this.walkingSound.paused) {
                    this.walkingSound.play().catch(err => {
                        console.warn('Could not play walking sound:', err);
                    });
                }
            }
        } else if (state === 'run') {
            // Running state
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = this.runningSoundVolume;

            // Restart running sound on state transition
            if (stateChanged && this.runningSound) {
                this.runningSound.currentTime = 0;
                if (this.runningSound.paused) {
                    this.runningSound.play().catch(err => {
                        console.warn('Could not play running sound:', err);
                    });
                }
            }
        } else {
            // Idle state - fade out both sounds
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
        }
    }

    /**
     * Update audio volumes with smooth fading
     * Called every frame from main animation loop
     * @param {number} delta - Time since last frame in seconds
     */
    update(delta) {
        // Update background music volume
        if (this.backgroundMusic) {
            this.updateVolume(
                this.backgroundMusic,
                this.backgroundMusicTarget,
                delta
            );
        }

        // Update walking sound volume
        if (this.walkingSound) {
            this.updateVolume(
                this.walkingSound,
                this.walkingSoundTarget,
                delta
            );
        }

        // Update running sound volume
        if (this.runningSound) {
            this.updateVolume(
                this.runningSound,
                this.runningSoundTarget,
                delta
            );
        }
    }

    /**
     * Update volume for a single audio element with smooth fading
     * @param {HTMLAudioElement} audio - Audio element to update
     * @param {number} targetVolume - Target volume (0-1)
     * @param {number} delta - Time delta in seconds
     */
    updateVolume(audio, targetVolume, delta) {
        if (!audio) return;

        // Smooth fade to target volume
        if (audio.volume !== targetVolume) {
            const volumeDelta = this.fadeSpeed * delta;

            if (audio.volume < targetVolume) {
                // Fade in
                audio.volume = Math.min(targetVolume, audio.volume + volumeDelta);
            } else {
                // Fade out
                audio.volume = Math.max(targetVolume, audio.volume - volumeDelta);

                // Pause audio when fully faded out to save resources
                if (audio.volume === 0 && !audio.paused) {
                    audio.pause();
                }
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

        console.log('Master volume set to:', clampedVolume);
    }

    /**
     * Clean up audio resources
     */
    dispose() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic = null;
        }
        if (this.walkingSound) {
            this.walkingSound.pause();
            this.walkingSound = null;
        }
        if (this.runningSound) {
            this.runningSound.pause();
            this.runningSound = null;
        }
        if (this.magicRevealSound) {
            this.magicRevealSound.pause();
            this.magicRevealSound = null;
        }
        console.log('AudioManager disposed');
    }
}
