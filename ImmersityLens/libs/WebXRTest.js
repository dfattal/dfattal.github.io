// WebXR Support Test - Runs in page context to detect actual WebXR runtime
// This script is injected into page context to properly test WebXR availability
// including runtimes like Oculus Immersive Web Emulator that are only visible to pages

(async () => {
    console.log('🔍 WebXR Test Script - Running in page context...');

    try {
        if (navigator.xr && navigator.xr.isSessionSupported) {
            console.log('✅ navigator.xr found, testing immersive-vr support...');

            const supported = await navigator.xr.isSessionSupported('immersive-vr');

            window.postMessage({
                type: 'WEBXR_SUPPORT_RESULT',
                supported: supported,
                reason: supported ? 'WebXR immersive-vr supported' : 'WebXR immersive-vr not supported',
                hasNavigatorXR: true,
                hasIsSessionSupported: true
            }, '*');

            console.log(`🎯 WebXR Test Result: ${supported ? 'SUPPORTED' : 'NOT SUPPORTED'}`);

        } else if (navigator.xr) {
            // navigator.xr exists but no isSessionSupported method
            window.postMessage({
                type: 'WEBXR_SUPPORT_RESULT',
                supported: false,
                reason: 'navigator.xr exists but isSessionSupported method not available',
                hasNavigatorXR: true,
                hasIsSessionSupported: false
            }, '*');

            console.log('❌ WebXR Test: navigator.xr exists but isSessionSupported not available');

        } else {
            // No navigator.xr at all
            window.postMessage({
                type: 'WEBXR_SUPPORT_RESULT',
                supported: false,
                reason: 'navigator.xr not available',
                hasNavigatorXR: false,
                hasIsSessionSupported: false
            }, '*');

            console.log('❌ WebXR Test: navigator.xr not available');
        }

    } catch (error) {
        window.postMessage({
            type: 'WEBXR_SUPPORT_RESULT',
            supported: false,
            reason: 'WebXR test failed: ' + error.message,
            hasNavigatorXR: !!navigator.xr,
            hasIsSessionSupported: !!(navigator.xr && navigator.xr.isSessionSupported),
            error: error.message
        }, '*');

        console.error('❌ WebXR Test Error:', error);
    }
})(); 