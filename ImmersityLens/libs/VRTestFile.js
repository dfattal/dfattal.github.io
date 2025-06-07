// Simple test file to verify extension loading and check Three.js availability
console.log('🧪 VRTestFile.js LOADED SUCCESSFULLY - This proves libs directory files are loading!');
window.VR_TEST_LOADED = true;

// Check for Three.js availability and send message (CSP-safe approach)
(function () {
    try {
        if (typeof THREE !== 'undefined') {
            window.postMessage({
                type: 'VR_LIF_THREE_AVAILABLE',
                message: 'Three.js already available in page context'
            }, '*');
            window.VR_LIF_THREE_READY = true;
        } else {
            window.postMessage({
                type: 'VR_LIF_THREE_NOT_FOUND',
                message: 'Three.js not found in page context, needs injection'
            }, '*');
        }
    } catch (error) {
        window.postMessage({
            type: 'VR_LIF_THREE_NOT_FOUND',
            message: 'Error checking Three.js availability: ' + error.message
        }, '*');
    }
})(); 