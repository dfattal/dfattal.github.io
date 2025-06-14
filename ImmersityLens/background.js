// Create context menu items when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    // Create the initial "Convert to 3D" menu item
    chrome.contextMenus.create({
        id: "convertTo3D",
        title: "Convert to 3D",
        contexts: ["all"]  // We'll filter in the content script
    });
});

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
    } else if (info.menuItemId === "enterVR") {
        // Send message to content script to handle VR entry
        chrome.tabs.sendMessage(tab.id, {
            action: "enterVR",
            clickX: info.x,
            clickY: info.y
        });
    }
});

// Handle messages from content script to update context menu
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        console.log('Background: Updating context menu, hasLIF:', message.hasLIF);

        if (message.hasLIF) {
            // Remove "Convert to 3D" and add "Download LIF" and optionally "Enter VR"
            chrome.contextMenus.remove("convertTo3D", () => {
                if (chrome.runtime.lastError) {
                    console.log('Background: convertTo3D menu item not found (already removed)');
                }

                // Create Download LIF menu item
                chrome.contextMenus.create({
                    id: "downloadLIF",
                    title: "Download LIF",
                    contexts: ["all"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Background: Error creating downloadLIF menu:', chrome.runtime.lastError);
                    } else {
                        console.log('Background: downloadLIF menu created successfully');
                    }
                });

                // Create Enter VR menu item only if WebXR is supported
                if (message.webXRSupported) {
                    chrome.contextMenus.create({
                        id: "enterVR",
                        title: "Enter VR",
                        contexts: ["all"]
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('Background: Error creating enterVR menu:', chrome.runtime.lastError);
                        } else {
                            console.log('Background: enterVR menu created successfully');
                        }
                        // Send response back to content script after both menus are created
                        sendResponse({ success: true, menuType: "lifOptionsWithVR" });
                    });
                } else {
                    console.log('Background: Skipping VR menu creation - WebXR not supported');
                    // Send response back to content script after download menu is created
                    sendResponse({ success: true, menuType: "lifOptionsNoVR" });
                }
            });
        } else {
            // Remove "Download LIF" and "Enter VR", then add "Convert to 3D"
            chrome.contextMenus.remove("downloadLIF", () => {
                if (chrome.runtime.lastError) {
                    console.log('Background: downloadLIF menu item not found (already removed)');
                }
            });

            chrome.contextMenus.remove("enterVR", () => {
                if (chrome.runtime.lastError) {
                    console.log('Background: enterVR menu item not found (already removed)');
                }

                chrome.contextMenus.create({
                    id: "convertTo3D",
                    title: "Convert to 3D",
                    contexts: ["all"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Background: Error creating convertTo3D menu:', chrome.runtime.lastError);
                    } else {
                        console.log('Background: convertTo3D menu created successfully');
                    }
                    // Send response back to content script
                    sendResponse({ success: true, menuType: "convertTo3D" });
                });
            });
        }

        // Return true to indicate we will send a response asynchronously
        return true;
    }
}); 