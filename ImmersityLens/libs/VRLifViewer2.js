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

console.log('🚀 NEW VRLifViewer.js PAGE CONTEXT VERSION LOADING - 2.0.2');

class VRLifViewer {
    constructor() {
        this.originalButton = null;
        this.vrButton = null;
        this.injectedScriptId = 'vr-lif-viewer-script-' + Date.now();
        this.messageHandler = null;
    }

    async init(lifUrl, originalButton) {
        console.log('🎬 Initializing VR viewer with page context injection approach');
        this.originalButton = originalButton;
        this.lifUrl = lifUrl;

        // Set up message communication between content script and page context
        this.setupMessageCommunication();

        // Inject Three.js into page context
        await this.injectThreeJS();

        // Inject the complete VR functionality into page context
        await this.injectVRSystem(lifUrl);

        // Instead of creating a separate VR button, directly start VR session
        console.log('🚀 Auto-starting VR session after initialization...');
        this.startVRDirectly();

        console.log('✅ VR viewer initialized with direct VR startup');
    }

    startVRDirectly() {
        console.log('🎯 Starting VR directly from picture button click');

        // Simple and clean: just send the LIF URL to page context
        // The embedded LifLoader will handle everything there
        setTimeout(() => {
            window.postMessage({
                type: 'VR_LIF_COMMAND_START_VR',
                lifUrl: this.lifUrl
            }, '*');
        }, 500); // Small delay to ensure page context is ready
    }



    setupMessageCommunication() {
        console.log('🔄 Setting up message communication...');

        // Listen for messages from page context
        this.messageHandler = (event) => {
            if (event.source !== window || !event.data.type?.startsWith('VR_LIF_')) return;

            console.log('📨 Received message from page context:', event.data);

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
                    console.log('📄 Page context log:', event.data.message);
                    break;
            }
        };

        window.addEventListener('message', this.messageHandler);
    }

    async injectThreeJS() {
        console.log('📦 Injecting Three.js into page context...');

        return new Promise((resolve, reject) => {
            // Check if Three.js is already available in page context
            const checkScript = document.createElement('script');
            checkScript.textContent = `
                if (typeof THREE !== 'undefined') {
                    window.postMessage({ type: 'VR_LIF_LOG', message: 'Three.js already available in page context' }, '*');
                    window.VR_LIF_THREE_READY = true;
                } else {
                    window.postMessage({ type: 'VR_LIF_LOG', message: 'Three.js not found in page context, needs injection' }, '*');
                }
            `;
            document.head.appendChild(checkScript);
            checkScript.remove();

            // Wait a moment to see if Three.js is already there
            setTimeout(() => {
                if (window.VR_LIF_THREE_READY) {
                    console.log('✅ Three.js already available');
                    resolve();
                    return;
                }

                // Inject Three.js from extension
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('libs/three.min.js');
                script.onload = () => {
                    console.log('✅ Three.js injected into page context');
                    resolve();
                };
                script.onerror = () => {
                    console.error('❌ Failed to inject Three.js');
                    reject(new Error('Failed to inject Three.js'));
                };
                document.head.appendChild(script);
            }, 100);
        });
    }

    async injectVRSystem(lifUrl) {
        console.log('🚀 Injecting VR system from separate file (CSP-safe)...');

        return new Promise((resolve, reject) => {
            // Check if VR system is already loaded
            if (window.vrSystem) {
                console.log('✅ VR system already loaded');
                resolve();
                return;
            }

            // Inject the separate VR system file to avoid CSP inline script issues
            const vrScript = document.createElement('script');
            vrScript.id = this.injectedScriptId;
            vrScript.src = chrome.runtime.getURL('libs/VRPageSystem.js');

            vrScript.onload = () => {
                console.log('✅ VR system file loaded successfully');

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
        console.log('🎯 VR session started - updating UI');
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
        console.log('🚪 VR session ended - updating UI');
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
        console.log('🧹 Cleaning up VR viewer...');

        // Send exit command to page context
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