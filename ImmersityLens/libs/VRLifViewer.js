/**
 * VR LIF Viewer for ImmersityLens Chrome Extension
 * Based on VR-LIF-Viewer-Developer-Guide.md
 * 
 * Provides WebXR/VR viewing capabilities for converted LIF files
 * 
 * This version injects all VR functionality into page context to avoid
 * Chrome extension context isolation limitations with WebXR hardware detection
 * 
 * VERSION: 2.0.2 - PAGE CONTEXT INJECTION - Updated: ${new Date().toISOString()}
 */

// Removed initialization logging to avoid console noise when extension is disabled

class VRLifViewer {
    constructor() {
        this.originalButton = null;
        this.vrButton = null;
        this.injectedScriptId = 'vr-lif-viewer-script-' + Date.now();
        this.messageHandler = null;
    }

    async init(lifUrl, originalButton) {
        console.log('🚀 Starting VR session...');

        this.lifUrl = lifUrl;
        this.originalButton = originalButton;
        this.injectedScriptId = 'vr-lif-system-' + Date.now();

        try {
            // Set up message communication first
            this.setupMessageCommunication();

            // Fetch LIF file
            const lifBlob = await this.fetchLifFile(lifUrl);

            // Inject Three.js
            await this.injectThreeJS();

            // Inject VR system
            await this.injectVRSystem();

            // Start VR with LIF data
            await this.startVRWithBlob(lifBlob);

        } catch (error) {
            console.error('❌ VR initialization failed:', error);
            this.showError('Failed to initialize VR: ' + error.message);
        }
    }

    async fetchLifFile(lifUrl) {
        try {
            const response = await fetch(lifUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch LIF file: ${response.status}`);
            }

            const blob = await response.blob();
            console.log('✅ LIF file loaded');
            return blob;
        } catch (error) {
            console.error('❌ Failed to fetch LIF file:', error);
            throw error;
        }
    }

    async startVRWithBlob(lifBlob) {
        // Convert blob to array buffer
        const arrayBuffer = await lifBlob.arrayBuffer();

        // Send the LIF data to VR system
        window.postMessage({
            type: 'VR_LIF_COMMAND_START_VR_WITH_DATA',
            lifData: arrayBuffer
        }, '*');
    }

    setupMessageCommunication() {
        // Listen for messages from VR system
        this.messageHandler = (event) => {
            if (event.source !== window || !event.data.type?.startsWith('VR_LIF_')) return;

            switch (event.data.type) {
                case 'VR_LIF_SESSION_STARTED':
                    this.onVRSessionStarted();
                    break;
                case 'VR_LIF_SESSION_ENDED':
                    this.onVRSessionEnded();
                    break;
                case 'VR_LIF_ERROR':
                    this.showError(event.data.message);
                    break;
                case 'VR_LIF_LOG':
                    // VR system logs are handled elsewhere
                    break;
            }
        };

        window.addEventListener('message', this.messageHandler);
    }

    async injectThreeJS() {
        return new Promise((resolve, reject) => {
            // Check if Three.js is already available
            if (window.THREE) {
                resolve();
                return;
            }

            // Check if Three.js script is already injected
            const existingScript = document.querySelector('script[src*="three.min.js"]');
            if (existingScript) {
                // Wait a bit for it to load, then check again
                setTimeout(() => {
                    if (window.THREE) {
                        resolve();
                    } else {
                        this.injectThreeJSScript(resolve, reject);
                    }
                }, 500);
                return;
            }

            // Inject Three.js
            this.injectThreeJSScript(resolve, reject);
        });
    }

    injectThreeJSScript(resolve, reject) {
        // Inject Three.js from extension
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/three.min.js');
        script.onload = () => {
            resolve();
        };
        script.onerror = () => {
            console.error('❌ Failed to inject Three.js');
            reject(new Error('Failed to inject Three.js'));
        };
        document.head.appendChild(script);
    }

    async injectVRSystem() {
        return new Promise((resolve, reject) => {
            // Check if VR system is already loaded
            if (window.vrSystem) {
                resolve();
                return;
            }

            // Check if VR system script is already injected to prevent BinaryStream conflicts
            const existingVRScript = document.querySelector(`script[src*="VRPageSystem.js"], script#${this.injectedScriptId}`);
            if (existingVRScript) {
                // Wait for the VR system to initialize
                setTimeout(() => {
                    resolve(); // Proceed even if not fully initialized to avoid conflicts
                }, 500);
                return;
            }

            // Inject the separate VR system file to avoid CSP inline script issues
            const vrScript = document.createElement('script');
            vrScript.id = this.injectedScriptId;
            vrScript.src = chrome.runtime.getURL('libs/VRPageSystem.js');

            vrScript.onload = () => {
                // Give the VR system a moment to initialize
                setTimeout(() => {
                    resolve();
                }, 200);
            };

            vrScript.onerror = () => {
                console.error('❌ Failed to inject VR system file');
                reject(new Error('Failed to inject VR system file'));
            };

            document.head.appendChild(vrScript);
        });
    }

    onVRSessionStarted() {
        console.log('✅ VR session started');
        // Keep the original button visible but change its appearance to show VR is active
        if (this.originalButton) {
            const vrButton = this.originalButton.querySelector('.vr-button');
            if (vrButton) {
                vrButton.textContent = '👓 VR Active';
                vrButton.style.background = 'linear-gradient(135deg, #00ff00 0%, #008800 100%)';
            }
        }
    }

    onVRSessionEnded() {
        console.log('🚪 VR session ended');
        // Restore original button appearance
        if (this.originalButton) {
            const vrButton = this.originalButton.querySelector('.vr-button');
            if (vrButton) {
                vrButton.textContent = '🥽 VR';
                vrButton.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%)';
            }
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 10002;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    close() {
        // Send exit command to VR system
        window.postMessage({ type: 'VR_LIF_COMMAND_EXIT_VR' }, '*');

        // Remove message listener
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler);
        }

        // Remove injected script
        const injectedScript = document.getElementById(this.injectedScriptId);
        if (injectedScript) {
            injectedScript.remove();
        }

        // Remove UI elements
        if (this.vrButton) {
            this.vrButton.remove();
        }

        // Remove close button
        const closeButtons = document.querySelectorAll('button');
        closeButtons.forEach(btn => {
            if (btn.textContent.includes('Close VR')) {
                btn.remove();
            }
        });

        // Show original button
        if (this.originalButton) {
            this.originalButton.style.display = 'block';
        }
    }
}

// Export for use in content script
window.VRLifViewer = VRLifViewer; 