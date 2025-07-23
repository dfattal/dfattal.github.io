// Create context menu items when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    // Pre-create all possible menu items (they'll be shown/hidden as needed)
    chrome.contextMenus.create({
        id: "convertTo3D",
        title: "Convert to 3D",
        contexts: ["all"],
        visible: true
    });

    chrome.contextMenus.create({
        id: "downloadLIF",
        title: "Download LIF",
        contexts: ["all"],
        visible: false
    });

    chrome.contextMenus.create({
        id: "downloadMP4",
        title: "Download MP4",
        contexts: ["all"],
        visible: false
    });

    chrome.contextMenus.create({
        id: "enterVR",
        title: "Enter VR",
        contexts: ["all"],
        visible: false
    });

    // Check local host availability on installation
    console.log('🚀 Extension installed - checking local availability...');
    checkLocalAvailable();
});

// Function to check if local native messaging host is available
async function checkLocalAvailable() {
    console.log('🔍 Starting local host availability check...');

    return new Promise(resolve => {
        console.log('📤 Sending ping message to com.leia.lif_converter...');

        const startTime = Date.now();

        chrome.runtime.sendNativeMessage(
            'com.leia.lif_converter',
            { type: 'ping' },
            response => {
                clearTimeout(timeoutId); // Clear timeout since we got a response
                const duration = Date.now() - startTime;
                console.log(`⏱️ Native message response received after ${duration}ms`);

                if (chrome.runtime.lastError) {
                    console.log('❌ Local host not available - Chrome runtime error:');
                    console.log('   Error message:', chrome.runtime.lastError.message);
                    console.log('   This usually means the native messaging host is not installed or not running');
                    chrome.storage.local.set({ localAvailable: false }, () => {
                        console.log('💾 Stored localAvailable: false');
                    });
                    resolve(false);
                } else if (response && response.pong) {
                    console.log('✅ Local host availability check: SUCCESS');
                    console.log('   Response type: Pong received');
                    console.log('   Host is running and responding correctly');
                    chrome.storage.local.set({ localAvailable: true }, () => {
                        console.log('💾 Stored localAvailable: true');
                    });
                    resolve(true);
                } else if (response && response.error) {
                    console.log('⚠️ Local host returned error to ping:');
                    console.log('   Error:', response.error);
                    console.log('   Host is running but may have issues');
                    chrome.storage.local.set({ localAvailable: true }, () => {
                        console.log('💾 Stored localAvailable: true (host responded, but with error)');
                    });
                    resolve(true);
                } else {
                    console.log('❓ Local host returned unexpected response to ping:');
                    console.log('   Response:', response);
                    console.log('   Response type:', typeof response);
                    console.log('   Response keys:', response ? Object.keys(response) : 'null');
                    chrome.storage.local.set({ localAvailable: false }, () => {
                        console.log('💾 Stored localAvailable: false (unexpected response)');
                    });
                    resolve(false);
                }
            }
        );

        // Add timeout to fail availability check if no response
        const timeoutId = setTimeout(() => {
            console.log('⏰ Native message timeout: No response after 5 seconds');
            chrome.storage.local.set({ localAvailable: false }, () => {
                console.log('💾 Stored localAvailable: false (timeout)');
            });
            resolve(false);
        }, 5000);
    });
}

// Check local availability on startup
console.log('🚀 Background script starting - checking local availability...');
console.warn('🔔 BACKGROUND SCRIPT LOADED - You should see this in the background page console!');
console.warn('🆔 EXTENSION ID:', chrome.runtime.id);
checkLocalAvailable();

// Function to run cloud conversion (existing monoLdiGenerator flow)


// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "convertTo3D") {
        // Send message to content script to handle the conversion
        chrome.tabs.sendMessage(tab.id, {
            action: "convertImage",
            clickX: info.x,
            clickY: info.y
        });
    } else if (info.menuItemId === "downloadLIF") {
        // Send message to content script to handle the LIF download
        chrome.tabs.sendMessage(tab.id, {
            action: "downloadLIF",
            clickX: info.x,
            clickY: info.y
        });
    } else if (info.menuItemId === "downloadMP4") {
        // Send message to content script to handle the MP4 download
        chrome.tabs.sendMessage(tab.id, {
            action: "downloadMP4",
            clickX: info.x,
            clickY: info.y
        });
    } else if (info.menuItemId === "enterVR") {
        // Send message to content script to handle VR entry
        chrome.tabs.sendMessage(tab.id, {
            action: "enterVR",
            clickX: info.x,
            clickY: info.y
        });
    }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        console.log('Background: Updating context menu, hasLIF:', message.hasLIF);

        if (message.hasLIF) {
            // Show LIF options, hide convert option
            chrome.contextMenus.update("convertTo3D", { visible: false });
            chrome.contextMenus.update("downloadLIF", { visible: true });
            chrome.contextMenus.update("downloadMP4", { visible: true });
            chrome.contextMenus.update("enterVR", { visible: message.webXRSupported });

            console.log('Background: Updated menu to show LIF options (VR:', message.webXRSupported, ')');
            sendResponse({ success: true, menuType: message.webXRSupported ? "lifOptionsWithVR" : "lifOptionsNoVR" });
        } else {
            // Show convert option, hide LIF options
            chrome.contextMenus.update("convertTo3D", { visible: true });
            chrome.contextMenus.update("downloadLIF", { visible: false });
            chrome.contextMenus.update("downloadMP4", { visible: false });
            chrome.contextMenus.update("enterVR", { visible: false });

            console.log('Background: Updated menu to show convert option');
            sendResponse({ success: true, menuType: "convertTo3D" });
        }
    } else if (message.type === 'getLocalAvailable') {
        // Handle popup request for local availability
        console.log('📨 Background: Received getLocalAvailable request from popup');

        chrome.storage.local.get('localAvailable', data => {
            const available = !!data.localAvailable;
            console.log('📤 Background: Responding with localAvailable:', available);
            console.log('   Raw storage data:', data);
            sendResponse({ localAvailable: available });
        });
        return true; // async response
    } else if (message.type === 'convertImage') {
        // Handle image conversion request with local/cloud routing
        console.log('Background: Received conversion request');

        chrome.storage.sync.get('conversionMode', data => {
            const mode = data.conversionMode || 'cloud';
            console.log('Background: Using conversion mode:', mode);

            if (mode === 'local') {
                // Use local native messaging - host.js expects { image: dataUrl }
                chrome.runtime.sendNativeMessage(
                    'com.leia.lif_converter',
                    { image: message.dataUrl },
                    response => {
                        if (chrome.runtime.lastError) {
                            console.error('Local conversion failed:', chrome.runtime.lastError);
                            sendResponse({ error: 'Local conversion failed: ' + chrome.runtime.lastError.message });
                        } else if (response && response.error) {
                            console.error('Local conversion error:', response.error);
                            sendResponse({ error: response.error });
                        } else if (response && response.lif) {
                            console.log('Local conversion successful');
                            sendResponse({ lif: response.lif, source: 'local' });
                        } else {
                            console.error('Local conversion returned unexpected response:', response);
                            sendResponse({ error: 'Local conversion failed: unexpected response format' });
                        }
                    }
                );
            } else {
                // Use cloud API - signal content script to handle directly
                console.log('Cloud conversion mode - delegating to content script');
                sendResponse({ useCloudInContent: true, dataUrl: message.dataUrl });
            }
        });
        return true; // async response
    }
}); 