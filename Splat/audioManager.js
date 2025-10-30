/**
 * AudioManager (Web Audio)
 *
 * This refactors all audio to use the Web Audio API to avoid iOS issues where
 * HTMLAudioElement.volume is ignored for looped elements. All looped tracks
 * (background, walking, running, jetpack) are driven by GainNodes, and one-shot
 * sounds (magic reveal) use a fresh BufferSource per play.
 *
 * Architecture
 * - One shared AudioContext with a masterGain → destination.
 * - LoopedTrack per looped sound: BufferSource (loop=true) → GainNode → masterGain.
 * - One-shots: BufferSource → GainNode (per play) → masterGain.
 *
 * Lifecycle
 * - constructor(config, isMobile): builds the graph and begins preloading/decoding
 *   audio files to AudioBuffers (safe even while the context is suspended).
 * - unlockAudio(): must be called from a user gesture (Start button). Resumes the
 *   AudioContext, ensures buffers are ready, and starts all looped tracks at gain=0.
 * - updateMovementSounds(state): sets target gains for walk/run/jetpack based on
 *   the character state. Background music uses startBackgroundMusic/stopBackgroundMusic
 *   to set its target.
 * - update(delta): per-frame fade toward targets using GainNode.gain linear ramps.
 * - playMagicReveal(delay): plays the one-shot with its own BufferSource and GainNode.
 * - dispose(): stops and disconnects nodes; suspends the AudioContext.
 *
 * API compatibility
 * - Public methods keep the same names and semantics used by main.js:
 *   unlockAudio, startBackgroundMusic, stopBackgroundMusic, updateMovementSounds,
 *   update(delta), toggleBackgroundMusic, toggleMovementSounds, setMasterVolume, dispose.
 * - No changes are required in main.js or characterControls.js.
 *
 * iOS behavior
 * - HTMLAudio is no longer used for looped tracks, preventing the "audible at unlock"
 *   leak. Loops start silent (gain=0) and only become audible via GainNode fades.
 * - unlockAudio() still must be called within a user interaction to satisfy autoplay.
 *
 * Tuning & extension
 * - fadeSpeed controls fade rate (units per second) for all tracks.
 * - Category volumes (backgroundMusicVolume, runningSoundVolume, etc.) set target gains.
 * - To add a new looped track: preload buffer → add to this.buffers & this.tracks →
 *   start it in unlockAudio() and include it in update() with its own target.
 */

// Internal helper: Looped audio track using Web Audio API
class LoopedTrack {
    constructor(context, destination, options = {}) {
        this.context = context;
        this.destination = destination;
        this.buffer = null;
        this.source = null;
        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = options.initialGain !== undefined ? options.initialGain : 0;
        this.gainNode.connect(this.destination);
        this.isPlaying = false;
    }

    setBuffer(buffer) {
        this.buffer = buffer;
    }

    start() {
        if (this.isPlaying || !this.buffer) return;
        this.source = this.context.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = true;
        this.source.connect(this.gainNode);
        try {
            this.source.start();
            this.isPlaying = true;
        } catch (e) {
            console.warn('LoopedTrack start failed:', e);
        }
    }

    stop() {
        if (!this.isPlaying) return;
        try {
            this.source.stop();
        } catch (_) { }
        try {
            this.source.disconnect();
        } catch (_) { }
        this.source = null;
        this.isPlaying = false;
    }

    dispose() {
        this.stop();
        try {
            this.gainNode.disconnect();
        } catch (_) { }
        this.gainNode = null;
    }
}

export class AudioManager {
    // Platform detection
    isMobile = false;

    // Web Audio graph
    audioContext = null;
    masterGain = null;
    oneShotGain = null;

    // Tracks
    tracks = {
        background: null,
        walking: null,
        running: null,
        jetpack: null,
    };

    // Decoded buffers
    buffers = {
        background: null,
        walking: null,
        running: null,
        jetpack: null,
        magicReveal: null,
    };

    // Feature flags
    backgroundMusicEnabled = true;
    movementSoundsEnabled = true;

    // Volume model (category-relative)
    backgroundMusicVolume = 0.3;
    walkingSoundVolume = 0.25;
    runningSoundVolume = 0.15;
    jetpackVolume = 0.5;
    magicRevealVolume = 0.6;
    fadeSpeed = 2.0; // units per second

    // Fade targets
    backgroundMusicTarget = 0;
    walkingSoundTarget = 0;
    runningSoundTarget = 0;
    jetpackTarget = 0;

    // Movement state tracking
    currentMovementState = 'idle';
    previousMovementState = 'idle';

    // Unlock state
    audioUnlocked = false;
    loopedSoundsStarted = false;
    preloadPromise = null;  // Track preload progress

    /**
     * @param {Object} config - paths to audio assets
     * @param {boolean} isMobile - platform hint
     */
    constructor(config = {}, isMobile = false) {
        this.config = config;
        this.isMobile = isMobile;

        // Build audio graph (context may be suspended until resume())
        this.ensureContext();
        this.setupGraph();

        // Begin preloading/decoding buffers (safe while context is suspended)
        this.preloadPromise = this.preloadAll().then(() => {
            console.log('Audio buffers preloaded');
        }).catch((e) => {
            console.warn('Audio preload failed:', e);
        });

        console.log('AudioManager (Web Audio) initialized with config:', config, 'mobile:', isMobile);
    }

    ensureContext() {
        if (this.audioContext) return this.audioContext;
        const Ctor = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new Ctor();
        return this.audioContext;
    }

    setupGraph() {
        if (this.masterGain) return;
        const ctx = this.ensureContext();

        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 1.0; // master volume; keep at 1, use category volumes per target
        this.masterGain.connect(ctx.destination);

        this.oneShotGain = ctx.createGain();
        this.oneShotGain.gain.value = this.magicRevealVolume;
        this.oneShotGain.connect(this.masterGain);
    }

    async preloadAll() {
        const tasks = [];
        // Only load buffers that aren't already loaded
        // Catch individual failures so one bad file doesn't stop others
        if (this.config.backgroundMusic && !this.buffers.background) {
            tasks.push(
                this.loadBuffer(this.config.backgroundMusic, 'background')
                    .then(b => this.buffers.background = b)
                    .catch(e => console.warn('Failed to load background:', e))
            );
        }
        if (this.config.runningSound && !this.buffers.running) {
            tasks.push(
                this.loadBuffer(this.config.runningSound, 'running')
                    .then(b => this.buffers.running = b)
                    .catch(e => console.warn('Failed to load running:', e))
            );
        }
        if (this.config.jetpackSound && !this.buffers.jetpack) {
            tasks.push(
                this.loadBuffer(this.config.jetpackSound, 'jetpack')
                    .then(b => this.buffers.jetpack = b)
                    .catch(e => console.warn('Failed to load jetpack:', e))
            );
        }
        if (!this.isMobile && this.config.walkingSound && !this.buffers.walking) {
            tasks.push(
                this.loadBuffer(this.config.walkingSound, 'walking')
                    .then(b => this.buffers.walking = b)
                    .catch(e => console.warn('Failed to load walking:', e))
            );
        }
        if (this.config.magicReveal && !this.buffers.magicReveal) {
            tasks.push(
                this.loadBuffer(this.config.magicReveal, 'magicReveal')
                    .then(b => this.buffers.magicReveal = b)
                    .catch(e => console.warn('Failed to load magicReveal:', e))
            );
        }

        if (tasks.length > 0) {
            console.log(`Loading ${tasks.length} audio buffers...`);
            // Use allSettled instead of all - continues even if some fail
            await Promise.allSettled(tasks);
            console.log('Audio preload complete (some may have failed)');
        } else {
            console.log('All audio buffers already loaded');
        }
    }

    async loadBuffer(url) {
        const ctx = this.ensureContext();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        // Safari compatibility: support both promise and callback forms
        return await new Promise((resolve, reject) => {
            try {
                const maybePromise = ctx.decodeAudioData(arrayBuffer);
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.then(resolve).catch((e) => {
                        // Fallback to callback form
                        try {
                            ctx.decodeAudioData(arrayBuffer, resolve, reject);
                        } catch (err) {
                            reject(err);
                        }
                    });
                } else {
                    ctx.decodeAudioData(arrayBuffer, resolve, reject);
                }
            } catch (_) {
                try {
                    ctx.decodeAudioData(arrayBuffer, resolve, reject);
                } catch (err) {
                    reject(err);
                }
            }
        });
    }

    /**
     * Must be called from a user gesture. Resumes context and starts looped tracks at gain=0.
     */
    async unlockAudio() {
        if (this.audioUnlocked) {
            console.log('Audio already unlocked');
            return;
        }

        // iOS robustness: create a fresh AudioContext inside the gesture on mobile
        if (this.isMobile) {
            try {
                if (this.audioContext && this.audioContext.state !== 'closed') {
                    // Some Safari versions require closing old contexts to free hardware
                    try { await this.audioContext.close(); } catch (_) { }
                }
            } catch (_) { }
            const Ctor = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new Ctor();
            // Reset graph and tracks
            this.masterGain = null;
            this.oneShotGain = null;
            this.tracks = { background: null, walking: null, running: null, jetpack: null };
            this.setupGraph();
        }

        const ctx = this.ensureContext();
        try { await ctx.resume(); } catch (e) { console.warn('AudioContext resume failed:', e); }

        // Decode using the (possibly new) context to ensure buffers are valid
        try {
            await this.preloadAll();
        } catch (e) {
            console.warn('Continuing without all audio buffers:', e);
        }

        // Create looped tracks and start them silently
        this.startOrCreateTrack('background', this.buffers.background);
        if (!this.isMobile) this.startOrCreateTrack('walking', this.buffers.walking);
        this.startOrCreateTrack('running', this.buffers.running);
        this.startOrCreateTrack('jetpack', this.buffers.jetpack);

        this.audioUnlocked = true;
        this.loopedSoundsStarted = true;
        console.log('✓ Web Audio unlocked, looped tracks running at gain 0');
    }

    startOrCreateTrack(key, buffer) {
        if (!buffer) return;
        if (!this.tracks[key]) {
            this.tracks[key] = new LoopedTrack(this.audioContext, this.masterGain, { initialGain: 0 });
            this.tracks[key].setBuffer(buffer);
        }
        this.tracks[key].start();
    }

    /**
     * One-shot: magic reveal
     */
    playMagicReveal(delay = 0) {
        if (!this.buffers.magicReveal) return;
        const play = () => {
            try {
                const src = this.audioContext.createBufferSource();
                const gain = this.audioContext.createGain();
                gain.gain.value = this.magicRevealVolume;
                src.buffer = this.buffers.magicReveal;
                src.connect(gain).connect(this.masterGain);
                src.start();
                // Auto clean-up when finished
                src.onended = () => {
                    try { src.disconnect(); } catch (_) { }
                    try { gain.disconnect(); } catch (_) { }
                };
            } catch (e) {
                console.warn('Magic reveal play failed:', e);
            }
        };
        if (delay > 0) setTimeout(play, delay * 1000); else play();
    }

    /**
     * Background music control via gain targets
     */
    startBackgroundMusic() {
        if (!this.backgroundMusicEnabled) return;
        this.backgroundMusicTarget = this.backgroundMusicVolume;
        console.log('Background music fading in');
    }

    stopBackgroundMusic() {
        this.backgroundMusicTarget = 0;
        console.log('Background music fading out');
    }

    /**
     * Movement sounds state machine (sets targets)
     */
    updateMovementSounds(state) {
        this.previousMovementState = this.currentMovementState;
        this.currentMovementState = state;
        const stateChanged = this.previousMovementState !== this.currentMovementState;
        if (stateChanged) {
            console.log(`Movement state changed: ${this.previousMovementState} -> ${state}`);
        }

        if (!this.movementSoundsEnabled) {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
            return;
        }

        if (state === 'walk') {
            if (!this.isMobile) this.walkingSoundTarget = this.walkingSoundVolume; else this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
        } else if (state === 'run') {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = this.runningSoundVolume;
            this.jetpackTarget = 0;
        } else if (state === 'jetpack') {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = this.jetpackVolume;
        } else {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
        }
    }

    /**
     * Per-frame fade update
     * @param {number} delta seconds
     */
    update(delta) {
        // Background
        this.rampGainTo('background', this.backgroundMusicTarget, delta);
        // Walking (desktop only)
        if (!this.isMobile) this.rampGainTo('walking', this.walkingSoundTarget, delta);
        // Running
        this.rampGainTo('running', this.runningSoundTarget, delta);
        // Jetpack
        this.rampGainTo('jetpack', this.jetpackTarget, delta);
    }

    rampGainTo(key, target, delta) {
        const track = this.tracks[key];
        if (!track || !track.gainNode) return;
        const current = track.gainNode.gain.value;
        if (current === target) return;
        const step = this.fadeSpeed * delta;
        const next = current < target ? Math.min(target, current + step) : Math.max(target, current - step);
        const t = this.audioContext.currentTime;
        try {
            track.gainNode.gain.cancelScheduledValues(t);
            track.gainNode.gain.setValueAtTime(current, t);
            track.gainNode.gain.linearRampToValueAtTime(next, t + 0.05);
        } catch (_) {
            // Fallback assignment
            track.gainNode.gain.value = next;
        }
    }

    toggleBackgroundMusic() {
        this.backgroundMusicEnabled = !this.backgroundMusicEnabled;
        if (this.backgroundMusicEnabled) this.startBackgroundMusic(); else this.stopBackgroundMusic();
        console.log('Background music:', this.backgroundMusicEnabled ? 'ON' : 'OFF');
    }

    toggleMovementSounds() {
        this.movementSoundsEnabled = !this.movementSoundsEnabled;
        if (!this.movementSoundsEnabled) {
            this.walkingSoundTarget = 0;
            this.runningSoundTarget = 0;
            this.jetpackTarget = 0;
        }
        console.log('Movement sounds:', this.movementSoundsEnabled ? 'ON' : 'OFF');
    }

    setMasterVolume(volume) {
        const clamped = Math.max(0, Math.min(1, volume));
        // Keep relative category scaling consistent with previous implementation
        this.backgroundMusicVolume = clamped * 0.3;
        this.walkingSoundVolume = clamped * 0.25;
        this.runningSoundVolume = clamped * 0.15;
        this.jetpackVolume = clamped * 0.5;
        // One-shot volume
        if (this.oneShotGain) this.oneShotGain.gain.value = this.magicRevealVolume * clamped;
        console.log('Master volume set to:', clamped);
    }

    dispose() {
        // Stop and dispose tracks
        Object.values(this.tracks).forEach(track => {
            if (!track) return;
            track.dispose();
        });
        this.tracks = { background: null, walking: null, running: null, jetpack: null };

        try { if (this.oneShotGain) this.oneShotGain.disconnect(); } catch (_) { }
        try { if (this.masterGain) this.masterGain.disconnect(); } catch (_) { }

        // Closing the context is optional; many browsers disallow after user gesture. Suspend instead.
        try { this.audioContext.suspend(); } catch (_) { }

        console.log('AudioManager (Web Audio) disposed');
    }
}
